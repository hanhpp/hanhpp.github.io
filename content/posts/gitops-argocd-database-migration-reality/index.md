---
title: "GitOps Reality with ArgoCD: When Declarative State Fights the Database"
date: 2026-09-30T09:00:00+07:00
draft: false
tags: ["gitops", "kubernetes", "database", "architecture", "devops"]
summary: "GitOps treats application deployments as stateless Git diffs, but production backends run on stateful databases. Here is why automated Git rollbacks break under schema migrations, and how to decouple delivery safely."
---

Your team adopts GitOps with ArgoCD. The pitch from conferences and vendor blogs is seductive:

"Everything is code. Git is your single source of truth. If a production release fails, just revert the Git commit or click 'Rollback' in the ArgoCD UI, and the cluster self-heals back to safety."

You deploy version 2.4.0 of your core billing service. The GitOps pipeline detects the commit, runs a pre-sync Kubernetes Job to execute database migrations, and updates the deployment manifest.

Ten minutes later, a critical application bug surfaces in version 2.4.0: an edge-case calculation causes payment timeouts. The on-call engineer navigates to the ArgoCD dashboard and clicks **Rollback to v2.3.0**.

ArgoCD terminates the v2.4.0 pods and redeploys the v2.3.0 container image. 

Instantly, all v2.3.0 pods enter `CrashLoopBackOff`:

```text
2026-09-30T09:14:22.819Z [FATAL] server.go:142: failed to initialize account repository: 
  pq: column "billing_account_status" does not exist in table "accounts"
goroutine 1 [running]:
main.setupDatabase(0x104b2a0)
    /src/repository/accounts.go:88 +0x31a
main.main()
    /src/cmd/server/main.go:44 +0x182
```

The database migration job in v2.4.0 renamed `billing_account_status` to `status_code` and dropped the old column. The v2.3.0 application code cannot find the column it expects. Automated rollback did not save the system; it transformed a partial application bug into complete catastrophic cluster downtime.

GitOps is an exceptional tool for managing stateless declarations. When applied blindly to stateful database dependencies, it creates dangerous failure modes.

> **The 30-Second Architecture:** Git commits can be reverted in milliseconds; database mutations cannot. Automated GitOps rollbacks fail because Kubernetes containers are ephemeral, while databases are persistent and append-only. When a pre-sync migration modifies schema destructively, reverting the Git deployment manifest deploys legacy application code against a mutated database. Staff engineers decouple application deployment from database migration lifecycle: schema migrations must strictly follow the Expand/Contract pattern, guaranteeing that database schema version N is backward-compatible with application versions N and N-1 simultaneously before any GitOps sync triggers.

---

## The Declarative Fantasy vs. Stateful Reality

The core premise of GitOps is that **Cluster State = Git State**.

```text
[ Git Repository: Desired State ]  <--- (ArgoCD Reconciliation Loop) --->  [ Live Kubernetes Cluster ]
```

This model works reliably for stateless constructs:
- Deployments, ReplicaSets, and Pods.
- Services, Ingress objects, and Gateway APIs.
- ConfigMaps and Secrets.

If a ConfigMap typo breaks a service, reverting the Git commit updates the ConfigMap, restarts the pod, and resolves the issue cleanly.

Databases violate the GitOps premise because **the database schema is not a Kubernetes manifest.**

When you bundle SQL migrations into an ArgoCD PreSync hook:
1. GitOps reconciles the repository.
2. The PreSync Job connects to PostgreSQL, MySQL, or CockroachDB and executes DDL statements (`ALTER TABLE`, `DROP COLUMN`, `ADD CONSTRAINT`).
3. The database state transitions irrevocably to version 2.
4. The deployment updates pods to version 2.

If version 2 fails, Git cannot "revert" the database. Reverting a Git commit simply reverts the container image pointer back to version 1. The database remains at version 2. Unless you have engineered backward compatibility into your database schema, version 1 code crashes immediately on boot.

---

## The Sync Wave & Hook Ordering Traps

To coordinate complex multi-tier applications, ArgoCD provides **Sync Waves** and **Resource Hooks**. While powerful, they introduce three systems-level failure modes at scale:

### 1. The Deadlock of the Failed PreSync Job
ArgoCD sync waves execute in strictly sequential phases:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: schema-migration-v2-4-0
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
```

If the migration Job fails (e.g. an `ALTER TABLE` query times out acquiring an exclusive table lock due to long-running analytical queries), ArgoCD halts the sync operation.

The failure mode: **The deployment enters a frozen state.**
- The old pods remain running.
- The new pods are blocked from deploying.
- The failed Job locks the sync queue. If an engineer tries to push an emergency hotfix to Git, ArgoCD refuses to sync because the previous PreSync phase never succeeded. Manual intervention (`argocd app terminate-op`) is required to break the lock.

### 2. The CRD Race Condition
When managing platform components (cert-manager, Prometheus Operator, Istio, External Secrets) via GitOps, teams frequently bundle CustomResourceDefinitions (CRDs) alongside the Custom Resources (CRs) that depend on them:

```text
monitoring/
├── prometheus-operator-crd.yaml
└── production-servicemonitor.yaml
```

During git synchronization, ArgoCD sends both objects to the Kubernetes API server simultaneously. The API server accepts the CRD, but the internal schema validator has not finished establishing the OpenAPI v3 validation schema before the `ServiceMonitor` manifest arrives.

The API server rejects the Custom Resource with:
```text
error: unable to recognize "production-servicemonitor.yaml": no matches for kind "ServiceMonitor" in version "monitoring.coreos.com/v1"
```

The GitOps sync fails on clean, valid code purely due to asynchronous API registration latency.

---

## Technology Trade-Off Matrix

| Strategy | Operational Advantage | Hidden Failure Mode | Production Sweet-Spot |
| :--- | :--- | :--- | :--- |
| **In-Band PreSync Hooks (Default)** | Migrations and code deploy in a single Git commit; zero external tooling. | Automated Git rollbacks crash legacy code; migration failures freeze the sync queue. | Prototypes, staging environments, single-developer projects. |
| **Decoupled Pipeline Migrations** | Migrations execute in separate CI pipeline before GitOps sync triggers. | Requires external pipeline orchestration outside of pure GitOps. | Medium-scale services with mature CI/CD gating. |
| **Expand/Contract Schema Evolution** | Zero-downtime rollouts and instantaneous, safe rollbacks at any hour. | Requires writing multiple backward-compatible PRs for a single database refactor. | Mandatory for enterprise, high-availability, business-critical systems. |

---

## The Staff-Level Decision Framework

To build a reliable delivery architecture, you must decouple the database lifecycle from application deployment.

```text
+-----------------------------------------------------------------------------------+
|                        THE EXPAND / CONTRACT PROTOCOL                             |
+-----------------------------------------------------------------------------------+
| Phase 1: Expand      | Add new column as nullable; dual-write in application code.|
|                      | Both v1 and v2 run safely against this schema.             |
|----------------------+------------------------------------------------------------|
| Phase 2: Migrate     | Backfill existing records asynchronously via worker jobs.  |
|----------------------+------------------------------------------------------------|
| Phase 3: Contract    | Switch application reads to new column; drop old column    |
|                      | only after v1 code is 100% retired from the cluster.       |
+-----------------------------------------------------------------------------------+
```

### 1. The Three-Phase Expand/Contract Rule
Never rename or drop a column in a single migration. Every destructive schema change must span three distinct deployments:

1. **Step 1 (Expand):** Add the new column `status_code` alongside the old column `billing_account_status`. Make the new column nullable. Deploy application code that reads from `billing_account_status` but writes to **both** columns.
2. **Step 2 (Backfill):** Run an asynchronous background script to copy historical data from the old column to the new column.
3. **Step 3 (Contract):** Deploy application code that reads and writes exclusively from `status_code`. Only after this version is stable in production and previous versions are retired do you issue a final migration to drop the old column.

If a bug occurs in Step 3, you can safely roll back to Step 2 or Step 1: the database supports both application versions simultaneously.

### 2. Solving the CRD Race with Negative Sync Waves
To prevent API server schema rejection during operator deployments, use negative sync waves to force CRDs to establish before Custom Resources compile:

```yaml
# In CRD definition:
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: servicemonitors.monitoring.coreos.com
  annotations:
    argocd.argoproj.io/sync-wave: "-2"
---
# In Custom Resource:
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: api-metrics
  annotations:
    argocd.argoproj.io/sync-wave: "0"
```

ArgoCD guarantees that wave `-2` is completely applied and registered with the API server before wave `0` begins evaluation.

### 3. Configure `ignoreDifferences` for Dynamic Controllers
When Kubernetes controllers mutate resources dynamically, ArgoCD detects unexpected drift and triggers continuous sync loops.

Explicitly configure `ignoreDifferences` in your ArgoCD Application manifest:

```yaml
spec:
  ignoreDifferences:
    # Ignore replica scaling managed dynamically by HPA
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
    # Ignore webhook-injected annotations and certificates
    - group: ""
      kind: Service
      jsonPointers:
        - /metadata/annotations/service.beta.kubernetes.io~1aws-load-balancer-arn
```

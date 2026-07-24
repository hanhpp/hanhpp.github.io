---
title: "Deploying Microservices Without the Fear"
date: 2026-07-24T07:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "In a monolith, deploy means pushing one thing. In microservices, every service deploys independently — which is the whole point, until you realize that 'independently' also means 'without knowing what the other services are doing right now.'"
---

The [decision checklist]({{< ref "should-you-even-use-microservices" >}})
listed "independent deployability" as the core value proposition of
microservices. Team A ships on Tuesday without waiting for Team B. That's
the promise. The reality is that independent deployability requires a
deployment strategy, a CI/CD pipeline per service, a rollback plan, and a
way to know whether your deploy just broke a consumer that hasn't upgraded
yet. Without those, "independent deployability" is just "everyone deploys
whenever they want and hopes for the best."

This post covers the deployment patterns that make independent deploys
actually work — rolling deploys, blue-green, canary, and feature flags —
plus the CI/CD structure that makes them repeatable. It's the operational
follow-up to the
[versioning post]({{< ref "microservices-versioning-without-breaking-everyone" >}}),
which covered how to evolve APIs without breaking consumers. This post
covers how to get the new code running without downtime.

## The deploy shift: from one thing to N things

In a monolith, a deploy is simple:
1. Build the artifact.
2. Stop the old instance.
3. Start the new instance.
4. Verify it's healthy.

One thing to build, one thing to stop, one thing to start. The entire
deploy is atomic — either the old version is running or the new version is
running, never both.

In microservices, a deploy is:
1. Build the artifact for Service A.
2. Deploy Service A while Services B through L keep running.
3. Verify Service A is healthy.
4. Verify that Services B through L still work with the new version of A.

Step 4 is the one that doesn't exist in a monolith. You've changed a
service that other services depend on. Those services are still running the
old code. The new version of A has to work with the old versions of its
consumers, and the old version of A (if it's still running during a rolling
deploy) has to work with consumers that might have already upgraded. This
is the [versioning problem]({{< ref "microservices-versioning-without-breaking-everyone" >}})
in deployment form.

## Rolling deploys: the default

A rolling deploy replaces instances one at a time. At any point during the
deploy, some instances run the old version and some run the new. This is the
simplest strategy and the one most teams start with:

```
Before:  [v1] [v1] [v1] [v1]
Deploy:  [v2] [v1] [v1] [v1]   ← first instance updated
         [v2] [v2] [v1] [v1]   ← second instance updated
         [v2] [v2] [v2] [v1]   ← third instance updated
After:   [v2] [v2] [v2] [v2]   ← all instances updated
```

Rolling deploys require that both versions can run simultaneously — which
means the API must be backward-compatible during the deploy window. This is
exactly the expand phase of
[expand-contract]({{< ref "microservices-versioning-without-breaking-everyone" >}}):
the new version adds something, the old version still works, and once all
instances are updated, you can contract.

The risk: if the new version has a bug, it's rolling out to production
gradually. You'll see errors accumulate as more instances switch over. The
fix is health checks — if the new version fails its health check, the
deploy stops and rolls back automatically.

## Blue-green deploys: instant rollback

A blue-green deploy runs two identical environments — "blue" (current) and
"green" (new). You deploy to green, verify it works, then switch the load
balancer from blue to green. If something breaks, you switch back:

```
Before:    traffic → [blue: v1]
Deploy:    traffic → [blue: v1]    green: [v2] ← deploying
Verify:    traffic → [blue: v1]    green: [v2] ← health checks pass
Switch:    traffic → [green: v2]   blue: [v1]  ← live
Rollback:  traffic → [blue: v1]    green: [v2] ← instant switch back
```

The advantage: rollback is instant. You don't have to rebuild and redeploy
the old version — it's still running in blue. The cost: you need twice the
infrastructure during the deploy. For a service running four instances, you
need eight during the switch. For a small team with limited infrastructure,
this might be too expensive. For a service handling critical traffic, it's
worth it.

## Canary deploys: test with real traffic

A canary deploy sends a small percentage of traffic to the new version
while the rest stays on the old:

```
Before:     traffic → [v1] [v1] [v1] [v1]
Canary:     5% traffic  → [v2]
            95% traffic → [v1] [v1] [v1] [v1]
Full:       traffic → [v2] [v2] [v2] [v2]
```

This is the safest deploy strategy because you're testing the new version
with real production traffic before committing to it. If the canary shows
increased error rates, latency spikes, or business metric anomalies, you
kill it and stay on v1.

The tooling for this is more complex — you need a load balancer or service
mesh that can split traffic by percentage, and you need metrics collection
that can compare canary vs. baseline in real time. Istio and Linkerd do
this natively. If you're not running a service mesh, most cloud load
balancers (ALB, Cloudflare) support weighted target groups.

The practical entry point: start with rolling deploys and health checks.
Move to blue-green when the cost of downtime justifies the infrastructure
cost. Move to canary when you have the metrics and traffic-splitting
infrastructure to make it meaningful. Don't start with canary — it's the
most sophisticated strategy and the hardest to get right.

## Feature flags: deploy without releasing

Deploying code and releasing features are two different things. A feature
flag lets you deploy code that's off by default, then turn it on
incrementally:

```go
if featureflags.Enabled(ctx, "new-checkout-flow") {
    return newCheckout(ctx, order)
}
return legacyCheckout(ctx, order)
```

Deploy the code with the flag off. The new code path exists in production
but isn't executed. Turn it on for 1% of users, then 10%, then 100%. If
something breaks, turn the flag off — no redeploy needed.

Feature flags solve a problem that deploy strategies alone don't: the
ability to separate "code is running in production" from "users can see
this." You can deploy on Friday (because the deploy is safe — the flag is
off) and release on Monday (because you turn the flag on during business
hours).

The danger: flag debt. Every feature flag is a branch in your code that
someone has to maintain, test, and eventually remove. Teams that add flags
aggressively without a removal process end up with a codebase full of
dead code paths that nobody understands. The discipline: every flag gets a
ticket to remove it. If the flag has been on for two weeks with no issues,
remove the flag and the old code path.

## CI/CD structure: pipeline per service

Every service needs its own CI/CD pipeline. The pipeline should:

1. **Run unit tests** — fast, no infrastructure, catches logic bugs.
2. **Run integration tests** — the service plus its direct dependencies
   (see the
   [local dev post]({{< ref "microservices-local-dev-without-docker-compose-hell" >}})
   for how to set these up).
3. **Build the container image** — tagged with the commit SHA, not `latest`.
4. **Run contract tests** — verify the service's API matches what consumers
   expect (from the
   [versioning post]({{< ref "microservices-versioning-without-breaking-everyone" >}})).
5. **Deploy to staging** — a fresh environment, not a shared one that
   accumulates state.
6. **Run smoke tests** — a handful of end-to-end tests against staging.
7. **Deploy to production** — with the strategy of your choice.

The pipeline is per-service because each service deploys independently.
Service A's pipeline runs when Service A changes. Service B's pipeline
doesn't run. That's the whole point.

> If you're using a monorepo (all services in one repository), the pipeline
> needs to detect which services changed and only build/deploy those. Tools
> like Bazel, Turborepo, and nx handle this. Without change detection, a
> monorepo CI pipeline rebuilds everything on every commit, which defeats
> the purpose of independent deploys.

## What it looks like when a deploy breaks consumers

MusicCorp's warehouse service deploys a new version. The API changes
`quantity` from an integer to a string (someone thought it should be
"42" instead of `42` — don't ask why). The deploy succeeds: the warehouse
service starts, passes health checks, and begins accepting requests.

The order service, which still sends `{"quantity": 42}`, starts getting
400 errors from the warehouse. The order service retries, gets more 400
errors, and eventually fails the order. Customers see errors.

The warehouse team's dashboard shows green — their service is healthy, the
deploy succeeded, error rates are zero (because the warehouse service
doesn't count client errors as its own failures). The order team's dashboard
shows red — their error rate just spiked. Neither team can see the full
picture.

A **deploy webhook** — a notification sent to a shared channel when any
service deploys — would have told the order team "warehouse just deployed"
the moment it happened. An **error budget** — a shared metric that tracks
total system health, not per-service health — would have shown the impact
immediately. And the
[correlation ID from the debugging post]({{< ref "debugging-microservices-where-did-that-request-go" >}})
would have connected the order service's 400s to the warehouse service's
deploy in the trace.

## The deploy discipline

Independent deployability is a capability, not a default. It requires:

1. **Backward-compatible API changes** — the
   [expand-contract pattern]({{< ref "microservices-versioning-without-breaking-everyone" >}}).
2. **Health checks** — every service exposes a `/health` endpoint that
   verifies database connectivity, downstream dependencies, and critical
   paths. The deploy orchestrator (Kubernetes, ECS, whatever) uses this to
   decide whether a new instance is ready to receive traffic.
3. **Automated rollback** — if the health check fails during a deploy, the
   orchestrator reverts to the previous version automatically. No human
   intervention required.
4. **Deploy notifications** — every deploy posts to a shared channel with
   the service name, version, and who triggered it. When something breaks,
   the first question is always "did anyone deploy recently?"
5. **Canary analysis** — for critical services, compare error rates and
   latency between the canary and baseline before promoting the deploy.

None of this is optional infrastructure. It's the price of independent
deployability — the thing that's supposed to make microservices worth the
[operational cost]({{< ref "should-you-even-use-microservices" >}}). If
you're not willing to invest in deploy tooling, you're not ready for
microservices, because the alternative is coordinated deploys, which is
what you were trying to escape.

---

The series now covers the full lifecycle: deciding whether you need
microservices, drawing the boundaries, choosing how services communicate,
keeping APIs backward-compatible, running the stack locally, debugging
when things go wrong, and deploying without fear. Each post stands alone,
but together they're the playbook I wish someone had handed me before
going through this the first time.

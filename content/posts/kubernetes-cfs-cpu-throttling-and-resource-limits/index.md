---
title: "CFS Quota Throttling & Silent OOMKills: The Fallacy of Kubernetes CPU Limits"
date: 2026-09-28T09:00:00+07:00
draft: false
tags: ["kubernetes", "linux", "performance", "go", "deep-dive"]
summary: "Setting hard CPU limits on latency-sensitive microservices destroys p99 response times while average utilization appears deceptively low. Here is how Linux CFS quotas, Go GOMAXPROCS, and GOMEMLIMIT actually behave under load."
math: true
---

Your Go microservice has an established latency SLO: p99 response times must remain below 30 milliseconds.

During a normal traffic day, average CPU utilization sits comfortably at 22%. Yet your monitoring alerts trigger: p99 latency has spiked to 320 milliseconds. Endpoints that typically execute in 4 milliseconds are stalling.

An on-call engineer checks Datadog, notes that CPU utilization is only 22%, assumes the database is slow, and pages the DBA team. The database team verifies that query latency is sub-millisecond. In confusion, someone doubles the container CPU limit from `2000m` to `4000m`. The latency spikes decrease slightly, but return during the next traffic burst.

Meanwhile, another service replica abruptly disappears from the cluster without printing a single stack trace or error log. Kubernetes status reports `OOMKilled` (Exit Code 137).

Both failures originate from the exact same architectural misunderstanding: treating Kubernetes CPU and memory limits as generic resource boundaries rather than Linux kernel cgroup primitives.

> **The 30-Second Architecture:** Kubernetes CPU limits do not cap clock frequency; they enforce rigid Completely Fair Scheduler (CFS) quotas in 100ms period windows. Multi-threaded runtimes (Go, JVM, Node) handling concurrent bursts consume their entire period quota in a fraction of a wall-clock second, causing the kernel to freeze the process for the remainder of the period. For latency-critical microservices, hard CPU limits are an anti-pattern: set deterministic CPU requests, leave CPU limits unset (`limits.cpu: null`), and use Linux CPU shares (`cpu.weight`) to allocate contested compute. For memory, enforce hard container limits and pair them with Go's `GOMEMLIMIT` at 85% capacity to trigger aggressive garbage collection before the kernel invokes `oom_score_adj`.

---

## Linux CFS Quotas Under the Hood

To understand why a pod running at 20% average CPU experiences 300ms latency spikes, you must inspect how the Linux kernel throttles cgroups.

In Kubernetes, setting `resources.limits.cpu: "1000m"` translates directly into two Linux cgroup parameters:
- `cpu.cfs_period_us`: The quota measurement window, configured globally by Kubelet to **100,000 microseconds (100 milliseconds)**.
- `cpu.cfs_quota_us`: The total CPU runtime allocated to the container within that window. For `1000m` (1 core), this is set to **100,000 microseconds**. For `2000m` (2 cores), this is **200,000 microseconds**.

The critical mechanics: **quota is cumulative across all threads, but the period window is bound to wall-clock time.**

```text
Period Window: 100ms (Wall Clock)
Quota Allocated: 200ms CPU runtime (equivalent to limits.cpu: 2000m)

Scenario: Service receives 10 concurrent requests.
Go runtime schedules work across 10 active OS threads.

Thread 1:  [ 20ms work ]
Thread 2:  [ 20ms work ]
Thread 3:  [ 20ms work ]
Thread 4:  [ 20ms work ]
Thread 5:  [ 20ms work ]  --> Combined CPU runtime: 200ms consumed in 20ms of wall time!
Thread 6:  [ 20ms work ]
Thread 7:  [ 20ms work ]
Thread 8:  [ 20ms work ]
Thread 9:  [ 20ms work ]
Thread 10: [ 20ms work ]

Wall Clock: |=== 20ms Active ===|================ 80ms Kernel Freeze ================|
            ^                   ^                                                     ^
            0ms                 20ms (Quota Exhausted)                                100ms (Next Period)
```

In the diagram above:
1. The container has a limit of 2 cores (`200ms` quota per `100ms` period).
2. Ten goroutines process work concurrently.
3. In just **20 milliseconds** of wall-clock time, the 10 threads accumulate 200 milliseconds of compute time.
4. **The cgroup quota is completely spent.**
5. The Linux kernel suspends the entire cgroup for the remaining **80 milliseconds**.

To external clients, the application stops responding. In-flight TCP packets sit unacknowledged in the kernel socket receive buffer. When the next 100ms period opens, the kernel unsuspends the threads, only for the burst to exhaust the quota again.

Because the container was active for only 20ms out of every 100ms, standard metrics tools report:
$$\text{Average CPU Utilization} = \frac{200\text{ms runtime}}{1000\text{ms sample interval}} = 20\%$$

The service is throttled 80% of the time, yet the dashboard shows green.

### How to Detect It
Query Prometheus for raw CFS throttling counters rather than average CPU usage:

```promql
# Percentage of periods spent throttled
sum(rate(container_cpu_cfs_throttled_periods_total{container="api"}[5m]))
/
sum(rate(container_cpu_cfs_periods_total{container="api"}[5m])) * 100
```

If this metric exceeds 5% on a synchronous service, your p99 latency spikes are generated by the Linux kernel, not application code.

---

## The Go Runtime Multiplier: The `GOMAXPROCS` Trap

If you deploy a Go microservice to Kubernetes without explicitly configuring `GOMAXPROCS`, the problem amplifies exponentially.

By default, the Go runtime calls `runtime.NumCPU()` on boot to determine how many operating system scheduler threads (\(M\)) to spin up. In containerized environments, `runtime.NumCPU()` reads `/sys/devices/system/cpu/online` from the host node.

If your pod runs on an AWS `c6i.16xlarge` worker node with 64 physical CPU cores, the Go runtime defaults to:
$$\text{GOMAXPROCS} = 64$$

If your pod specification sets `resources.limits.cpu: "2000m"` (2 cores), Go still attempts to schedule goroutines across 64 concurrent OS threads. When traffic arrives, 64 threads wake up simultaneously, burn through the 200ms container quota in **3 milliseconds**, and the kernel freezes the container for the remaining 97 milliseconds of the period.

### The Fix: Automatic Cgroup Detection
Import `uber-go/automaxprocs` in your `main.go`:

```go
package main

import (
	_ "go.uber.org/automaxprocs"
	"net/http"
)

func main() {
	// automaxprocs parses /sys/fs/cgroup/cpu.max automatically
	// and overrides GOMAXPROCS to match the cgroup quota:
	// limits.cpu: 2000m -> GOMAXPROCS=2
	http.ListenAndServe(":8080", nil)
}
```

---

## Memory Accounting: Why Containers Die Silently

Unlike CPU, memory cannot be throttled. When a container exceeds its memory ceiling, the Linux kernel has only one recourse: invoking the Out-Of-Memory (OOM) killer.

### The Anatomy of Exit Code 137
When Kubernetes terminates a pod with Exit Code 137 (\(128 + 9 = \text{SIGKILL}\)), it does not allow the process to flush logs, write error traces, or trigger graceful shutdown handlers.

The termination decision is governed by kernel cgroup memory accounting:
- **Anonymous Memory (RSS):** Heap allocations, stack frames, goroutine structures. This memory cannot be evicted to disk.
- **Page Cache:** In-memory cached file reads, shared library segments, stdout/stderr socket buffers.

When cgroup memory usage nears the limit, the kernel first attempts to reclaim page cache memory. If page cache memory is depleted and anonymous allocations continue to climb, the kernel selects a process within the cgroup based on `oom_score_adj` and sends an immediate, uncatchable `SIGKILL`.

### The Go Memory Trap
Prior to Go 1.19, the Go garbage collector operated purely on heap growth heuristics (`GOGC=100`). The runtime would trigger a GC cycle only when the heap grew by 100% relative to the live heap remaining after the previous collection.

If your container memory limit was set to 1GB, and live heap was 600MB, the Go GC would not schedule a collection until heap reached 1.2GB. The Linux kernel stepped in at 1.0GB and killed the container while the Go runtime sat idle, waiting for its collection threshold.

### The Staff Fix: `GOMEMLIMIT`
Introduced in Go 1.19, `GOMEMLIMIT` sets a hard ceiling on the Go runtime's total memory footprint:

```yaml
env:
  - name: GOMEMLIMIT
    # Set to ~85% of container memory limit to leave headroom for OS threads and page cache
    value: "850MiB"
  - name: GOGC
    value: "off" # Optional: Rely purely on GOMEMLIMIT for maximum throughput
resources:
  requests:
    memory: "1Gi"
  limits:
    memory: "1Gi"
```

With `GOMEMLIMIT=850MiB`, the Go garbage collector runs aggressively as memory approaches 850MB, preventing heap spikes from breaching the 1GB container limit and eliminating silent OOM kills.

---

## Technology Trade-Off Matrix

| Resource Pattern | Primary Advantage | Operational Risk | Production Verdict |
| :--- | :--- | :--- | :--- |
| **Strict CPU Limits (`requests == limits`)** | Absolute cost isolation; prevents noisy neighbors from consuming spare node cores. | Destroys p99 latency during concurrent bursts; leads to artificial over-provisioning. | Batch processing, asynchronous workers, untrusted multi-tenant clusters. |
| **Burstable CPU Limits (`limits > requests`)** | Improved resource sharing under moderate traffic variations. | CFS throttling still triggers during peak bursts; unpredictable tail latency. | Internal non-critical services with relaxed latency SLOs. |
| **No CPU Limits (`requests` set, `limits.cpu: null`)** | Zero CFS throttling; minimal tail latency; pods burst freely into idle node capacity. | Buggy code with runaway loops (`for {}`) can saturate all unreserved cores on the host node. | Client-facing synchronous microservices with strict p99 SLOs. |
| **Unbounded Memory (`limits.memory: null`)** | Pods never encounter container OOM kills. | Memory leaks trigger node-wide memory exhaustion, causing Kubelet to evict unrelated pods. | Architectural malpractice in production. |

---

## The Staff-Level Decision Framework

Top-tier engineering organizations (including Google, Zalando, and Shopify) have largely abandoned hard CPU limits on synchronous serving tiers.

Here is the production standard for latency-critical workloads:

### 1. Abolish CPU Limits on Synchronous APIs
Set deterministic CPU requests to guarantee node capacity and scheduling priority, but leave CPU limits unset:

```yaml
resources:
  requests:
    cpu: "2000m"      # Guaranteed baseline allocation
    memory: "2Gi"
  limits:
    # cpu: null       <-- Do NOT set CPU limits on latency-sensitive serving paths
    memory: "2Gi"     # Strict memory limit is mandatory
```

### 2. Protect Host Worker Nodes
Without CPU limits, how do you prevent a runaway container from starving the host OS?

Configure node-level allocations in Kubelet:
- `--system-reserved`: Guarantees dedicated CPU and memory for `sshd`, `systemd`, and journald.
- `--kube-reserved`: Guarantees dedicated resources for `kubelet` and `containerd`.

If an application enters an infinite loop, it bursts across available worker cores, but can never starve Kubelet or system daemons. Kubernetes continues to report metrics and can safely evict or restart workloads.

### 3. Use Linux CPU Shares for Contention Arbitration
When all pods on a node burst simultaneously, the Linux kernel uses **CPU shares** (derived directly from `resources.requests.cpu`) to allocate compute proportionally:
- Pod A (`requests.cpu: 2000m`) receives twice as many CPU cycles as Pod B (`requests.cpu: 1000m`).
- Compute allocation remains fair and mathematically bounded without triggering arbitrary 100ms CFS sleep freezes.

---
title: "Docker BuildKit in CI: The Economics of Network I/O vs CPU Compilation"
date: 2026-10-02T09:00:00+07:00
draft: false
tags: ["docker", "ci-cd", "performance", "go", "devops"]
summary: "Enabling remote layer caching in CI often slows builds down instead of speeding them up. Here is how network transit limits, cache thrashing, and local NVMe runners dictate the real economics of container builds."
math: true
---

A team notices that their continuous integration (CI) pipeline takes four minutes to build and test a Go microservice container.

An engineer reads a blog post about Docker BuildKit's remote cache backends. They add two flags to the `docker buildx build` command in GitHub Actions:

```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

They commit the change, expecting build times to drop to thirty seconds.

Instead, the pull request pipeline run duration increases from **4 minutes to 6 minutes**. 

The runner spends 85 seconds downloading a 3.2GB cache archive from GitHub's internal cache storage, 40 seconds extracting compressed layer tarballs to disk, 15 seconds executing the build, and another 110 seconds compressing and uploading the updated cache over the network before the job finishes.

The team spent compute, bandwidth, and storage quotas to save fifteen seconds of compilation time.

Caching is not an automatic speed improvement. In cloud CI environments, caching is an economic trade-off between **network transit latency** and **local CPU compute power**.

> **The 30-Second Architecture:** Remote CI layer caching is only faster than a scratch build when the time to download and decompress the cache over network interfaces is strictly less than the time required for local CPU cores to compute those layers from source. On modern 8-core or 16-core cloud runners with local NVMe disks, compiling a Go, Rust, or C++ binary from scratch is often twice as fast as streaming multi-gigabyte layer caches over public cloud network pipes. Staff engineers optimize build economics: cache lightweight immutable dependencies (`go.mod`, `node_modules`), avoid pushing multi-gigabyte compiler output over network caches, and structure multi-stage Dockerfiles with cache mounts (`RUN --mount=type=cache`) on persistent self-hosted runners.

---

## The Remote Cache Trap: Network I/O vs. CPU Compute

To evaluate whether remote caching makes sense for your pipeline, measure the build duration mathematically:

$$\text{Time}_{\text{cached}} = \text{Download Latency} + \text{Decompression Latency} + \text{Build Evaluation} + \text{Upload Latency}$$

$$\text{Time}_{\text{scratch}} = \text{Source Checkout} + \text{Compiler Execution} + \text{Image Assembly}$$

A remote cache provides a net positive return if and only if:

$$\text{Time}_{\text{cached}} < \text{Time}_{\text{scratch}}$$

```text
BuildKit with type=gha:
|== Download Cache (85s) ==|== Extract (40s) ==|== Compile (15s) ==|== Compress/Upload (110s) ==|
Total Job Duration: 250 seconds

Scratch Build on Modern Runner:
|== Checkout (5s) ==|== go mod download (8s) ==|== Compile from Source (35s) ==|
Total Job Duration: 48 seconds
```

### The Three Network Bottlenecks
1. **Runner Network Throughput:** GitHub-hosted standard runners and ephemeral CI virtual machines typically experience bandwidth caps between **40 MB/s and 80 MB/s**.
2. **Decompression Overhead:** Decompressing large gzip or zstd tarballs containing hundreds of thousands of small build artifacts (e.g. `node_modules` or `.cache/go-build`) saturates the runner's single vCPU core, creating a CPU bottleneck before compilation even begins.
3. **Cache Upload Tax:** If you specify `mode=max`, BuildKit exports cache manifests for *every* intermediate stage, including build tools, compilers, and temporary test binaries. Compressing and uploading that payload across every branch burns runner minutes.

---

## Layer Ordering & Invalidation Mechanics

When remote caching does provide value (e.g. heavy base operating system layers or complex Cgo dependencies), the most common failure mode is **premature layer invalidation**.

Docker evaluates cache validity sequentially from top to bottom. Once a single layer invalidates, Docker discards the cache for every subsequent instruction in that stage.

### The Naive Dockerfile (Cache-Busting Anti-Pattern)
```dockerfile
# Antipattern: Breaks layer caching on every code edit
FROM golang:1.24-alpine
WORKDIR /app

# Copying everything first invalidates the cache on every commit!
COPY . .

# This line runs from scratch every single time, re-downloading all dependencies:
RUN go mod download

RUN go build -o server ./cmd/server
```

In the Dockerfile above, editing a comment in `README.md` changes the checksum of `COPY . .`. Docker throws away the cached `RUN go mod download` layer and re-downloads every dependency from the public internet on every commit.

### The Optimized Multi-Stage Dockerfile
Structure instructions from lowest rate of change to highest rate of change, and use BuildKit cache mounts:

```dockerfile
# Syntax directive enables modern BuildKit features
# syntax=docker/dockerfile:1.7

# Stage 1: Build environment
FROM golang:1.24-alpine AS builder
WORKDIR /src

# 1. Install system build tools (Quarterly change)
RUN apk add --no-cache git make ca-certificates

# 2. Copy dependency manifests only (Weekly change)
COPY go.mod go.sum ./

# 3. Download dependencies with persistent cache mount
# RUN --mount=type=cache persists across builds on the same runner node!
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# 4. Copy application source code (Hourly change)
COPY . .

# 5. Compile binary with compiler cache mount
# CGO_ENABLED=0 produces a statically linked binary
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /bin/server ./cmd/server

# Stage 2: Minimal Distroless Runtime
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app

# Copy only the compiled binary and certificates from the builder stage
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /bin/server /app/server

# Run as non-root user (ID 65532 is built into distroless)
USER nonroot:nonroot

EXPOSE 8080
ENTRYPOINT ["/app/server"]
```

### Why This Wins
- **Dependency Isolation:** `go.mod` is copied separately. Editing application code in `./cmd/server` leaves lines 1 through 10 fully cached.
- **Cache Mounts (`--mount=type=cache`):** Unlike layer caching (which packages files into image layers and exports them over the network), BuildKit cache mounts keep `/go/pkg/mod` and `/root/.cache/go-build` directly on the runner's local filesystem. Even when a code edit forces recompilation, the Go compiler uses local cached object files (`.a`) to re-link in seconds.
- **Distroless Attack Surface Reduction:** The final image contains zero package managers (`apk`, `apt`), zero shells (`/bin/sh`, `/bin/bash`), and zero build tools. The final image size drops from 400MB to **18MB**, speeding up deployment registry pulls across your Kubernetes cluster.

---

## Technology Trade-Off Matrix

| Strategy | Network Overhead | CPU Overhead | Setup Complexity | Best Production Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **No Cache (Scratch Build)** | Low (Only pulls base image and modules) | High (Recompiles every package) | Zero | Small Go/Rust binaries on modern, multi-core cloud runners. |
| **GHA Cache (`type=gha`)** | High (Uploads and downloads multi-GB blobs) | Low | Low (GitHub action config) | Lightweight frontend builds, Python wheels (<500MB). |
| **Registry Cache (`type=registry`)** | Very High (Pushes cache layers to ECR/GHCR) | Low | Medium (Registry IAM setup) | Base OS images, machine learning training images, multi-architecture builds. |
| **Persistent Local NVMe Runners** | Zero (Local disk read/write) | Minimal (Incremental compilation) | High (Requires managing self-hosted runners) | Enterprise mono-repos, high-frequency continuous delivery teams. |

---

## The Staff-Level Decision Framework

1. **Benchmark Scratch vs. Cached Before Enabling Remote Flags:**
   Run five builds from clean source without remote caching. If a scratch build takes under 60 seconds, **do not enable remote layer caching**. The network transfer and decompression penalty will make your pipeline slower, not faster.
2. **Cache Dependencies, Not Build Artifacts:**
   Use remote caching only for packages downloaded from public registries (npm, pip, go modules). Avoid exporting intermediate compilation caches (`.cache/go-build`, `target/`) over the network unless running on a persistent local runner.
3. **Use Self-Hosted Ephemeral Runners with Shared Local Cache Volumes:**
   If build times exceed 10 minutes on large mono-repos, stop optimizing network layer caches. Deploy Kubernetes-based runner controllers (e.g. Actions Runner Controller - ARC) with persistent NVMe SSD cache volumes mounted into the builder pod. You eliminate network transit entirely while enjoying sub-second incremental builds.

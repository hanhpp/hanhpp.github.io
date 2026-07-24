---
title: "Running Microservices Locally Without Docker Compose Hell"
date: 2026-07-24T08:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "You split the monolith into twelve services. Now a new developer's first week is spent getting Docker Compose to run all twelve on their laptop, and half of them crash because of a port conflict. Here's how to make local development work without the pain."
---

The [decision checklist]({{< ref "should-you-even-use-microservices" >}})
mentioned this in passing: running a monolith locally means `go run .` and
you're done. Running microservices locally means Docker Compose with fifteen
containers, or a shared staging environment that's always half-broken. This
post is the practical version of that warning — how to actually structure
local development so it doesn't become the tax that makes everyone wish
you'd stayed with the monolith.

The core problem is simple: a microservice architecture assumes network
calls between services. On your laptop, you don't have a network with
twelve running services. You have one machine, limited RAM, and a Docker
daemon that slows to a crawl once you pass six or seven containers. The
question is how to get the service you're *working on* running locally
without needing every other service to be running too.

## The Docker Compose default — and why it breaks down

The first instinct is a `docker-compose.yml` that runs everything:

```yaml
services:
  order:
    build: ./order-service
  warehouse:
    build: ./warehouse-service
  payment:
    build: ./payment-service
  notification:
    build: ./notification-service
  inventory:
    build: ./inventory-service
  # ... seven more services
```

This works on day one. By day thirty, it doesn't. Here's why:

**RAM.** Each container runs a full runtime. A Go service might use 30MB.
A Java service uses 256MB minimum. A PostgreSQL container uses 100MB. A
Redis container uses 50MB. Twelve services plus infrastructure and you're
at 2–3GB before your IDE loads. On an 8GB laptop, you're swapping.

**Startup time.** `docker compose up` starts services in dependency order.
Service A waits for Service B, which waits for Service C. By the time
everything is healthy, you've made coffee, checked Slack, and forgotten
what you were working on.

**Fragility.** Service D was deployed yesterday with a new environment
variable. Your local `docker-compose.yml` doesn't set it. Service D
crashes. Service A, which depends on Service D, also crashes. You spend
forty minutes figuring out which container broke and why, and the actual
change you were making — a one-line fix in Service B — has nothing to do
with any of it.

> The shared `docker-compose.yml` is the most common way teams try to solve
> local development for microservices, and it's the one that scales worst.
> It works for two or three services. Past that, it becomes a maintenance
> burden that fights you more than it helps.

## Pattern 1: run only what you're working on

The simplest fix: don't run everything. Run the service you're changing,
and mock the ones it talks to.

If you're working on the order service, you need:
- The order service itself (running from your IDE, not Docker)
- A database for the order service (one PostgreSQL container)
- Mocks for the warehouse, payment, and notification services

That's four things instead of twelve. It fits in 500MB of RAM. It starts
in seconds. And the mocks can be simple HTTP servers that return canned
responses:

```go
// mock_server.go — run this, forget about it
func main() {
    http.HandleFunc("/reserve", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(map[string]interface{}{
            "status":  "reserved",
            "order_id": "mock-123",
        })
    })
    http.ListenAndServe(":8081", nil)
}
```

This isn't production-realistic, but it doesn't need to be. You're
developing the order service's logic, not the warehouse service's
behavior. The mock tells you "the warehouse accepted the request" so you
can verify that the order service handles the response correctly.

## Pattern 2: service virtualization

Canned mocks work, but they don't handle edge cases — what happens when
the warehouse returns a 503? What happens when the response is missing a
field? For that, you need a mock that can be configured per-test:

**WireMock** (for HTTP) lets you define stub mappings:

```json
{
  "request": {
    "method": "POST",
    "url": "/reserve"
  },
  "response": {
    "status": 503,
    "body": "{\"error\": \"service unavailable\"}"
  },
  "priority": 10
}
```

You can set different responses for different request bodies, add delays,
or simulate flaky behavior. The mock behaves like the real service without
running it.

**Mountebank** does the same thing across protocols — HTTP, TCP, and
amqp. If your services communicate over a message broker, Mountebank can
mock the broker's behavior.

The investment is real — you have to write and maintain the stubs — but
it's a one-time cost per service boundary, and it pays for itself every
time someone can reproduce a bug locally instead of deploying to a shared
staging environment and waiting.

## Pattern 3: Docker Compose profiles

If you do need some real services running (maybe you're testing a workflow
that spans three services and mocking isn't realistic), Docker Compose
profiles let you choose which services to start:

```yaml
services:
  order:
    build: ./order-service
    profiles: ["full"]

  warehouse:
    build: ./warehouse-service
    profiles: ["full", "fulfillment"]

  payment:
    build: ./payment-service
    profiles: ["full", "fulfillment"]

  postgres:
    image: postgres:16
    # no profile — always runs
```

```bash
# just the database — for working on order service logic
docker compose up postgres

# order + warehouse + payment — for testing fulfillment
docker compose --profile fulfillment up

# everything — for integration tests
docker compose --profile full up
```

This doesn't solve the RAM problem, but it solves the "I only need three
services, not twelve" problem. Profiles make the compose file a menu
instead of an all-or-nothing commitment.

## Pattern 4: remote development environments

The nuclear option that actually works: run the services somewhere else.

**Tilt** and **Skaffold** watch your local code, rebuild the container
image on change, and deploy to a local Kubernetes cluster (like minikube
or k3d) or a remote cluster. You edit code locally, Tilt syncs it to the
cluster, and the cluster runs the full architecture with proper networking.

**Gitpod** and **GitHub Codespaces** give you a cloud VM with the full
stack pre-configured. New developers clone the repo, open the IDE, and
everything is already running. No Docker setup, no port conflicts, no
"works on my machine."

**Telepresence** lets you run one service locally while proxying to a
remote cluster for everything else. You get hot-reload on the service
you're changing and real dependencies for everything else.

These solutions cost money (cloud VMs, cluster resources) and add
complexity (you need to maintain the remote environment). But for teams of
five or more, the time saved per developer per week often justifies it
quickly. The question is whether the operational cost is less than the
cumulative cost of every developer fighting Docker Compose every morning.

## The shared staging trap

When local development is painful, teams default to a shared staging
environment: "just test your changes on staging, it has all the services
running." This is the trap.

Shared staging breaks constantly because:
- Everyone's changes are deployed to the same environment simultaneously
- Database state is shared — one person's test data breaks another person's
  test
- The environment drifts from production because nobody maintains it with
  the same discipline
- Debugging failures requires asking "was this my change or someone else's?"

Shared staging is useful for *final* validation before production —
running the full integration suite against a realistic environment. It's
not useful for *development* — writing and testing your code before you
ship it. If your workflow is "write code, push to staging, see if it
works, fix, repeat," you've turned a local debugging problem into a
shared-environment debugging problem, which is worse.

> The rule of thumb: if you can't test your change without deploying to a
> shared environment, your local development setup isn't complete. You need
> to be able to run the service you're changing with enough of its
> dependencies to verify its behavior — real or mocked — before anyone else
> sees it.

## What actually works in practice

After seeing several teams go through this, the pattern that scales is a
layered approach:

1. **Unit tests run locally, no infrastructure.** The service's business
   logic is tested with mocks for external dependencies. This is your
   fastest feedback loop — seconds, not minutes.

2. **Integration tests run with Docker Compose profiles.** The service plus
   its direct dependencies (database, one or two adjacent services) run in
   containers. This takes a minute to start and tests the real wiring.

3. **Contract tests verify boundaries.** Consumer-driven contracts (from
   the [versioning post]({{< ref "microservices-versioning-without-breaking-everyone" >}}))
   ensure your service's API matches what consumers expect, without
   running the consumers.

4. **End-to-end tests run on a ephemeral environment.** A fresh copy of the
   full stack, spun up for the test suite and torn down after. Not shared,
   not persistent, not a place where state accumulates.

Each layer catches a different class of bug. Unit tests catch logic errors.
Integration tests catch wiring errors. Contract tests catch boundary
misunderstandings. End-to-end tests catch workflow failures. No single
layer is sufficient, and no layer should be skipped — but the earlier
layers should catch most bugs before you need the expensive ones.

---

Local development is the tax you pay every day for the
[independent deployability]({{< ref "should-you-even-use-microservices" >}})
that microservices give you. The teams that handle it well are the ones
that invest in the tooling early — mocks, profiles, contract tests —
instead of discovering the pain in their first week and spending the next
three months fighting Docker Compose.

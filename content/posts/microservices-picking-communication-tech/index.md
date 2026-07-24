---
title: "REST, gRPC, GraphQL, or a Broker: Picking Your Communication Tech"
date: 2026-07-24T10:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "The communication style (sync/async, request-response/event-driven) narrows the field. Here's how the actual technologies stack up once you're choosing among them."
---

[Last time]({{< ref "microservices-five-ways-to-talk" >}}) we settled on the
*style* of communication before touching any technology — sync vs. async,
request vs. broadcast. That was the point: pick "gRPC" or "Kafka" first and
you've quietly locked in a style whether you meant to or not. With the style
decided, the technology conversation gets a lot shorter. This post walks
through what MusicCorp would actually reach for, and where each option's
real trade-offs sit.

Before the specific technologies, five things worth wanting from *any*
choice you make here: make backward-compatible changes easy, make the
interface explicit (schemas help), keep the API technology-agnostic so you
aren't locking every consumer into your language, make the service cheap
for consumers to use, and don't leak internal implementation detail through
the wire format. Keep these in the back of your mind as we go through the
options — they're the yardstick.

## Remote Procedure Calls: gRPC and the ghosts of RMI

RPC's whole pitch is making a network call look like a local method call.
That's also its biggest risk: hide the network *too* well, and developers
write code that fires off a thousand "local-looking" calls without
realizing each one is a network round trip.

Older RPC implementations like Java RMI compound this with genuine
brittleness. Tie your client and server to the same binary stub generation,
and removing so much as an unused field from a shared type can break
deserialization on every consumer — you're stuck doing lockstep releases
whether you wanted to or not.

**gRPC** is the modern answer and it's a good one. Built on HTTP/2 with
protocol buffers for serialization, it has strong cross-language support (so
you don't inherit RMI's single-platform trap), solid performance, and a
healthy tooling ecosystem for schema evolution. If you have good control
over both ends of a synchronous request-response call — which is gRPC's
sweet spot — it's usually the first thing worth evaluating.

## REST: the sensible default, HATEOAS aside

REST's actual contribution isn't "use HTTP," it's the idea of *resources* —
a `Customer`, an `Order` — with a uniform set of verbs (GET, POST, PUT,
DELETE) that behave consistently across every resource, instead of a
bespoke `createCustomer`/`editCustomer` method per operation. Riding on
HTTP gets you a huge amount for free: caching proxies, load balancers,
monitoring tooling, and a security ecosystem that already understands the
protocol.

The purist version of REST also includes HATEOAS — hypermedia controls that
let a client navigate an API the way a human navigates a website, without
hardcoding URLs. It's a genuinely interesting idea. It's also one that,
across the industry, essentially never gets adopted in practice; you're
unlikely to meet a team that's found it worth the extra plumbing. Don't
feel behind if you skip it.

The realistic trade-offs: REST-over-HTTP payloads are heavier than a lean
binary format, and TCP-based HTTP has more overhead than protocols built to
skip it. None of that matters for the overwhelming majority of
service-to-service traffic. REST over HTTP remains the sensible default
whenever you want maximum interoperability and don't have a specific reason
to reach for something else.

## GraphQL: built for one job, not a general replacement

GraphQL solves a specific, narrow problem extremely well: letting a
constrained client — think a mobile app — issue one query that pulls back
exactly the fields it needs from potentially multiple sources, instead of
several round trips returning more than it asked for.

That's a perimeter-facing job, not a microservice-to-microservice one. Two
practical limitations worth knowing up front: caching is much harder than
with plain REST, since you can't just slap standard HTTP cache headers on
an arbitrary query; and writes don't fit the model nearly as naturally as
reads do, which is why teams commonly end up using GraphQL for reads and
REST for writes on the same system. If you're aggregating and filtering
data for a UI, look at GraphQL or the Backend-for-Frontend pattern — not at
replacing your internal service-to-service protocol with it.

## Message brokers: what "guaranteed delivery" actually buys you

For asynchronous communication, brokers (RabbitMQ, ActiveMQ, Kafka, or a
managed equivalent like SQS/SNS) sit in the middle so producers and
consumers never have to be up at the same moment. The feature that matters
most is **guaranteed delivery**: the broker holds a message durably until it
can be delivered, so the sender doesn't have to decide "retry or give up?"
the way it would with a direct synchronous call.

Two structural concepts worth keeping straight:

- **Queues** are point-to-point — one message, consumed by one member of a
  consumer group. This is your load-distribution mechanism (the *competing
  consumers* pattern): three instances of `OrderProcessor` in the same
  group, and only one of them handles any given message.
- **Topics** let multiple, independent consumer groups each get their own
  copy of the same message. This is what event broadcast actually runs on
  — `Warehouse` and `Notifications` both react to the same `Order Placed`
  event without knowing about each other.

As a rough (not absolute) rule: topics fit event-driven collaboration,
queues fit request-response.

**Kafka** deserves a specific mention because of two features that set it
apart from a "normal" broker. First, message *permanence* — Kafka can
retain messages far longer than "until the last consumer reads it," which
means a newly deployed consumer can replay history it never saw the first
time around. Second, built-in stream processing (KSQL), letting you define
SQL-like queries over topics directly, which starts to look like a
continuously updating materialized view with a topic as the source instead
of a table.

> Watch out for "exactly-once delivery" claims. It's a genuinely contested
> topic even among distributed-systems experts — some say it's provably
> impossible in the general case, others say a few specific workarounds get
> you there. Whatever your broker claims, build consumers that are
> idempotent and can tolerate seeing the same message twice (a message ID
> and a "have I processed this already?" check goes a long way), rather
> than betting your correctness on the broker's marketing copy.

## Finding services: DNS, or something built for constant churn

Once you have more than a handful of services, you need a way to answer
"where is `Accounts` right now?" **DNS** is the simplest starting point —
well understood, supported everywhere — but it's designed for a world where
hosts don't change every few minutes. Time-to-live caching means clients
can hold stale entries, and DNS itself has no good story for "this instance
just died, stop routing to it" without pointing entries at a load balancer
that handles that churn for you.

For environments where instances come and go constantly, dynamic service
registries (Consul, or whatever your orchestration platform provides —
Kubernetes ships with its own service discovery via `etcd`) handle
registration and health checking directly, and are generally the better fit
once you're past a handful of long-lived instances.

## API gateways and service meshes are not the same thing

This pairing causes more confused architecture decisions than almost
anything else in the space, so it's worth being precise: an **API gateway**
manages *north-south* traffic — requests entering your system from the
outside world. A **service mesh** manages *east-west* traffic —
service-to-service calls inside your perimeter. They can overlap in
practice, but they solve different problems.

The API gateway's job, in the overwhelming majority of real systems, is
much narrower than the vendor marketing around "the API economy" suggests:
mostly it's mapping external requests (from your own web/mobile clients) to
internal services, handling API keys, rate limiting, and logging at the
edge.

> The two misuses I'd actively steer you away from: using the gateway for
> call aggregation (that's a job for GraphQL or a Backend-for-Frontend,
> not a proxy layer), and using it for protocol rewriting ("turn any SOAP
> API into REST!"). Both push business logic into a third-party tool that
> was never built to hold it — keep the pipes dumb, keep the smarts in
> your own code.

## A quick note on sharing code

DRY is good advice inside a service. Across service boundaries, it needs
qualifying: shared libraries are fine for things invisible to the outside
world (a logging library), risky the moment they leak into the wire
contract. If two services share a library that defines the shape of data
sent over the network, you've reintroduced coupling through the back door —
a schema change now means redeploying every consumer of that library, which
is exactly the lockstep-release problem microservices are supposed to
avoid. If you want a client library at all, keep the consumer in control of
*when* they upgrade it, the way public SDKs (AWS's, for instance) do it.
And for the broader question of how to evolve APIs without breaking running
consumers — the expand-contract pattern, schema evolution with protobuf, and
consumer-driven contracts — see
[versioning without breaking everyone]({{< ref "microservices-versioning-without-breaking-everyone" >}}).

---

We've now covered how services talk *and* what to build that
communication on. But talking to each other is only half the workflow
problem — the harder question is what happens to consistency when a single
business operation spans several of these calls and one of them fails
partway through. That's next.

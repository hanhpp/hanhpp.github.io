---
title: "Should You Even Use Microservices?"
date: 2026-07-21T10:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "Microservices are a solution to organizational scaling problems, not a technology choice. Here's how to tell whether you actually have the problem they solve — before you pay the cost."
---

Every six months, someone on the team reads a blog post about how Company X
scaled to ten million users with microservices, and suddenly there's a
proposal on the whiteboard to split the monolith. The proposals always sound
reasonable. The architecture diagrams always look clean. And about three
months into the actual migration, someone quietly mutters in standup: "wait,
why did we do this again?"

This post is the one I wish someone had handed me before I went through that
cycle the first time. It won't tell you *how* to build microservices — the
rest of this series covers that — it'll tell you whether you should be
building them at all.

## The uncomfortable truth: microservices solve an organizational problem

Microservices aren't a technology pattern. They're an *organizational*
pattern that happens to require technology to implement. The core value
isn't "services are smaller so they're easier to understand" — a well-structured
monolith with clean module boundaries gives you that. The core value is
**independent deployability**: Team A can ship their changes on Tuesday
without coordinating with Team B's release on Thursday.

That only matters when you have enough teams that coordination is genuinely
slowing you down. If your engineering team can fit around a single table,
you almost certainly don't have this problem. A well-structured monolith
with clear internal boundaries will let you move faster, deploy more
confidently, and spend your time on features instead of infrastructure.

> The question isn't "are microservices better?" — it's "do I have the
> problem microservices solve?" If your deploy bottleneck isn't team
> coordination, you're about to trade a mild inconvenience for a significant
> amount of operational complexity.

## What you're actually giving up

When you split a monolith into services, here's what disappears — and most
blog posts about microservices either skip this section or bury it in a
paragraph near the end.

**ACID transactions across business operations.** In a monolith, placing an
order and reserving stock can be one database transaction. If the stock
reservation fails, the order never happened. With microservices, you now
have two separate transactions that can each succeed or fail independently.
You can get most of the way back with patterns like sagas (covered later in
this series), but "most of the way back" is not "all the way back." You're
accepting eventual consistency where you once had strong consistency, and
that trade-off shows up in surprising places — like the customer who sees
their order confirmation before the payment fails.

**A single, readable stack trace.** Debugging a monolith means reading a
stack trace from top to bottom. Debugging microservices means grepping
across three services' logs, correlating by request ID, and trying to
reconstruct a timeline that spans multiple processes. At 2 AM. With
incomplete logs because one service was deployed with a logging level that's
too quiet. Distributed tracing tools like OpenTelemetry help, but they're
additional infrastructure you now have to run, configure, and teach your
team to use. If you want to see what this debugging experience actually
looks like — and what tooling makes it survivable — see
[debugging microservices]({{< ref "debugging-microservices-where-did-that-request-go" >}}).

**One deploy target.** "Ship it" in a monolith means pushing one thing. In a
microservices world, "ship it" means deploying one service and praying that
every other service it talks to can handle the new contract. Versioning,
backward compatibility, and coordinated rollouts become your problem. If
Service A sends a field that Service B used to ignore but now treats as
required, you've just broken production in a way that won't show up until
the right combination of requests hits the new code path.

**Simple onboarding.** A new developer can read an entire monolith's codebase
in a week. A new developer looking at a microservice architecture sees an
opaque web of services, each with its own repository, deployment pipeline,
and implicit contracts with neighbors they haven't met yet. "How does an
order get processed?" used to be answered by reading one file. Now it's a
guided tour across four services and an event bus.

**Cheap local development.** Running a monolith locally means `go run .` and
you're done. Running a microservice architecture locally means Docker Compose
with fifteen containers, or a shared staging environment that's always
half-broken because someone else's changes broke the inter-service wiring.
You can paper over this with a good developer platform, but that platform is
itself a significant engineering investment.

## The checklist: six questions before you split

If you can answer "yes" to most of these, microservices are probably worth
evaluating seriously. If most answers are "no," a well-structured monolith
will serve you better.

### 1. Do you have more than three teams that need to deploy independently?

This is the big one. Microservices exist so that Team A can ship without
waiting for Team B. If you have one team, or even three teams that are
closely coordinated, the coordination overhead of independent services
exceeds the coordination overhead of a shared codebase. You'll spend more
time managing service boundaries than you ever saved by decoupling deploys.

### 2. Is your monolith's deploy cycle measured in weeks, not days?

If your team can deploy the monolith once a day and the process takes
fifteen minutes, your deploy process isn't the bottleneck — your features
are. Splitting a fast-deploying monolith into microservices doesn't make
you faster; it makes you slower, because now every feature touches more
deploy pipelines and more integration surfaces.

### 3. Have you tried splitting the monolith's modules first?

Before reaching for network boundaries, try *code* boundaries. Extract a
well-defined module into its own package with a clean internal API. If you
can get the benefits of separation — independent understanding, clear
ownership, testable in isolation — without the network, you should. The
vast majority of "we need microservices" problems are actually "we need
better module boundaries" problems.

### 4. Do different parts of the system have genuinely different scaling
   requirements?

If your image processing pipeline needs ten times the compute of your user
management service, and those requirements will continue to diverge, running
them as separate services with independent scaling makes sense. If everything
scales together, independent services don't buy you anything — you're just
running the same infrastructure with extra network calls in between.

### 5. Do you have the operational maturity to handle distributed failures?

Microservices fail differently than monoliths. Network calls time out. Messages
get delivered twice. Services go down independently while the rest of the
system keeps running. Before you adopt microservices, you need:

- Structured, centralized logging (not just `log.Printf` to stdout)
- Distributed tracing across service boundaries
- Health checks and circuit breakers on every inter-service call
- An on-call rotation that can handle "the system is 80% up" instead of
  "the system is down"

If you don't have these yet, building them as part of a microservices
migration is like learning to swim by jumping into the ocean. Build the
observability stack first — if you're not sure where to start, see
[debugging microservices]({{< ref "debugging-microservices-where-did-that-request-go" >}})
for the minimum viable setup. If you can't justify the observability
investment on its own, you probably don't need microservices either.

### 6. Are you solving a *real* scaling problem, or a *theoretical* one?

"We might need to scale this independently someday" is not a reason to take
on the cost of microservices today. Scaling requirements are the easiest
thing to defer — if you're wrong about needing independent scaling, you've
paid a permanent cost for a problem that never materialized. Wait until the
scaling need is real and measurable, then split.

## What to do instead: the modular monolith

If you answered "no" to most of the checklist above but still feel the pain
of a tangled codebase, the answer is almost certainly a **modular monolith**
— the same deployment unit, but with clear internal boundaries enforced at
the code level.

The rules are simple:

1. **Each module gets its own package or directory**, with a public API that
   other modules call. No reaching into another module's internals.
2. **Modules communicate through their public API**, not through shared
   database tables. If Module A needs data from Module B, it calls Module
   B's function — it doesn't query Module B's table directly.
3. **Modules can be tested in isolation.** If you can't unit test a module
   without spinning up the whole application, the boundary isn't clean
   enough.
4. **One team owns each module** (or at least one module has a clear primary
   owner). Ownership means "responsible for the module's API, internal
   design, and the data it manages."

A modular monolith gives you 80% of the organizational benefit of
microservices — clear ownership, independent understanding, testability —
without any of the operational cost. And critically, it leaves the door open
to extract a module into a service later, when and if the real need arises.
The module boundary becomes the future service boundary, pre-drawn.

> The companies that successfully adopt microservices almost all went
> through a modular monolith phase first. They learned where the real
> boundaries were by running a monolith with enforced internal boundaries,
> then extracted the modules that genuinely needed independent deployment.
> The ones that jumped straight to microservices from a tangled monolith
> mostly ended up with a tangled distributed system — all the coupling they
> had before, plus network latency.

## If you're still reading: you might actually need them

If you looked at the checklist and thought "yes, yes, yes, no, yes, yes"
— if you genuinely have multiple teams stepping on each other's deploys,
if your monolith's module boundaries have been tried and aren't enough, if
you have the operational stack to handle distributed failure modes — then
the rest of this series is for you.

We start with the hardest and most consequential decision: how to draw the
boundaries so they actually hold up. That's where most microservice
architectures succeed or fail, and it's where we'll begin: [what actually
makes a good microservice boundary]({{< ref "microservices-boundaries-coupling-cohesion" >}}).

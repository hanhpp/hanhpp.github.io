---
title: "The Five Ways Microservices Talk to Each Other"
date: 2026-07-23T10:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "Before picking REST, gRPC, or Kafka, you need to answer a more basic question: does this interaction block, and does the caller expect an answer? Get that wrong and no technology choice saves you."
---

In [the previous post]({{< ref "microservices-boundaries-coupling-cohesion" >}})
we drew boundaries around MusicCorp's services using coupling and cohesion.
Now those services need to actually talk. And here's where most teams make
their first real mistake: they open a discussion about *technology* — REST
vs. gRPC vs. Kafka — before they've settled a much more basic question. Two
questions, really:

1. Does the caller **block** waiting for this to finish, or carry on?
2. Is this a **request** aimed at a specific service, or a **broadcast** that
   nobody in particular has to be listening for?

Those two axes give you four communication styles, plus a fifth — sharing
data through a common store — that's easy to miss because it barely looks
like communication at all. Get this decision right first, and the
technology choice in the next post becomes a much shorter conversation.

## Why "just make it a network call" doesn't work

It's tempting to treat a call to another service like a method call on an
object — cross the process boundary, get an answer back, move on. Three
things break that illusion immediately:

- **Performance.** An in-process call can be inlined away by the compiler.
  An inter-process call means serializing data, sending packets, and
  waiting — milliseconds where a local call was nanoseconds. A design that
  makes sense as 1,000 in-process calls is a bad idea as 1,000 network
  calls.
- **Interface changes stop being atomic.** Change a method signature
  in-process and your IDE fixes every call site in the same commit. Change
  a service's interface and the caller is a separately-deployed process that
  finds out on its own schedule.
- **Failure gets non-deterministic.** A local call either works or throws.
  A network call can time out, arrive twice, arrive out of order, or get a
  response that never makes it back because the caller died in the
  meantime. Distributed systems research breaks this down into crash,
  omission, timing, response, and (worst of all) *arbitrary* failures, where
  the parties involved can't even agree that something went wrong.

None of that is a reason to avoid inter-process communication — it's a
reason to design for it deliberately, which is what the rest of this post
is about.

## Synchronous blocking: familiar, and dangerous in chains

The simplest mental model: `OrderProcessor` calls `Loyalty` to add points,
and blocks until it hears back. This is how most of us learned to program —
one line waits for the previous one — so it's the natural first choice when
moving off a monolith.

The cost is **temporal coupling**: both the caller and callee, and
specifically *these instances* of them, have to be up at the same moment.
If `Loyalty` is slow, `OrderProcessor` is slow. If `Loyalty` is down, the
call fails and `OrderProcessor` has to decide what to do about it right now.

This gets genuinely dangerous once calls start chaining. Picture a fraud
check on checkout:

```
OrderProcessor --> Payment --> FraudDetection --> Customer
```

If all four hops are synchronous and blocking, a hiccup anywhere in that
chain fails the whole operation, and every hop in between is holding a
connection open the entire time — a good way to run out of available
connections under load. Two fixes are worth knowing before you reach for
asynchronous communication as the default cure: shorten the chain (does
`FraudDetection` really need to be in the *critical path*, or could it run
in the background and flag problem accounts ahead of time?), or replace the
blocking calls with a nonblocking style, which is the next stop.

## Asynchronous nonblocking: decoupled, but a different way of thinking

With async communication, the caller fires off the call and keeps working
without waiting for a response. This buys you **temporal decoupling** — the
receiving service doesn't need to be reachable at the exact moment the call
is made — and it's close to mandatory for anything long-running. Packaging
and dispatching an order might take hours or days; you cannot hold a
synchronous connection open for that.

The cost is complexity you don't get with a blocking call: if the response
comes back later, does it come back to the *same instance* that made the
request? What if that instance is gone by then? You typically need to
persist enough state that whichever instance picks up the response can
reconstruct what it was for.

> A word of caution before you get excited about async everywhere: it
> trades one set of headaches (blocking, cascading failure) for another
> (out-of-order delivery, duplicate messages, "did that response go
> anywhere?"). It's not simpler, just differently complex. Good monitoring
> and a correlation ID on every message are not optional extras here —
> they're how you'll debug the "where did this message go" question at 2 a.m.

## Request-response: the caller wants a specific answer

Orthogonal to sync/async is a second axis: is the caller asking a specific
service to do something and expecting to hear back? That's
request-response, and it works in either flavor:

- **Synchronous request-response** — `Chart` asks `Inventory` for current
  stock levels over HTTP, blocks, gets an answer.
- **Asynchronous request-response** — `OrderProcessor` puts a "reserve
  stock" message on a queue; `Inventory` picks it up whenever it's free,
  does the work, and puts the response on a reply queue that
  `OrderProcessor` reads from.

Request-response is the right shape whenever you genuinely need the result
before you can continue, or you need to know whether something failed so
you can retry or compensate. If either of those is true, request-response
fits; sync vs. async is then a question of whether you can afford to block.

One practical trap worth flagging explicitly: if you need results from
*several* independent request-response calls before proceeding — say,
checking price from three different stockists — running them **in
sequence** costs you the sum of their latencies. Running them **in
parallel** costs you only the slowest one. This sounds obvious written down,
but it's an easy thing to get wrong by default when the code just calls
three things in a row because that's how it was written.

## Event-driven: the inversion that takes getting used to

This is the odd one out, and it's worth sitting with because the mental
model is genuinely inverted from request-response. Instead of asking a
specific service to do something, a service just broadcasts a fact:
*"this happened."* `Warehouse` fires an event when a package is packed. It
does not know or care who's listening — `Notifications` might send an
email, `Inventory` might adjust stock counts, both, or neither. The emitter
is unaware of, and doesn't need to be aware of, who consumes its events.

That inversion is exactly what makes event-driven collaboration so loosely
coupled: with request-response, the caller has to know what the downstream
service *can do* — a form of domain coupling. With events, the emitter
knows nothing about its consumers, so there's nothing to couple to.

The catch is what goes *inside* the event. Two options:

- **Just an ID** — consumers that need more than the ID have to call back
  to fetch it, which reintroduces domain coupling and can hammer the source
  service if many consumers all react to the same event.
- **Fully detailed** — put in everything a consumer would reasonably need,
  the same as you would for a request-response payload. This is generally
  the better default, at the cost of the event becoming a wider contract
  you now have to maintain (remove a field later, and you might break
  someone quietly depending on it).

Events are also, by their nature, always asynchronous — there's no such
thing as a synchronous broadcast, since the emitter by design doesn't wait
for anyone.

## The pattern you don't notice: communication through common data

The fifth style barely feels like "communication" because it's so indirect:
one service drops data somewhere — a file, a data lake, a shared table —
and one or more other services pick it up later, usually by polling.
Despite feeling informal, this is arguably the most common integration
pattern in existence, especially for large data volumes or when you need
interoperability with something that can't speak your API's protocol (an
old mainframe can usually still read a file, even if it's never heard of
gRPC).

The failure mode to watch is the same **common coupling** from the last
post: if multiple services both *read and write* the shared store, you've
built exactly the tangled shared-database problem coupling analysis was
supposed to help you avoid. Keep the flow of information one-directional —
publisher writes, consumers only read — and this pattern is genuinely
useful rather than an accident waiting to surface.

## Mix and match, on purpose

A real microservice architecture is not "we do REST" or "we do events" —
it's a deliberate mix. It's entirely normal for one service to expose a
synchronous request-response API for placing an order *and* fire events
when the order's state changes, serving both an immediate caller and any
number of interested listeners. The skill isn't picking one style
company-wide; it's recognizing, interaction by interaction, which of these
shapes actually fits what you're building.

---

These are technology-agnostic patterns — none of them mandate REST,
gRPC, or Kafka specifically. Next up: which actual technology fits which
pattern, and where the popular choices (REST, gRPC, GraphQL, message
brokers) genuinely differ.

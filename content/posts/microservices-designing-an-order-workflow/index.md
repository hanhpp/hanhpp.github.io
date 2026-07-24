---
title: "Designing an Order Workflow: Putting the Patterns Together"
date: 2026-07-26T10:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "Boundaries, communication styles, technology, and sagas all sound reasonable in isolation. Here's what it looks like to actually apply all four decisions to one real workflow, in order."
---

We've spent five posts building up a toolkit:
[boundaries via coupling and cohesion]({{< ref "microservices-boundaries-coupling-cohesion" >}}),
[communication styles]({{< ref "microservices-five-ways-to-talk" >}}),
[the technology to implement them]({{< ref "microservices-picking-communication-tech" >}}),
and [sagas for cross-service consistency]({{< ref "microservices-sagas-vs-two-phase-commit" >}}).
Each one made sense on its own. The real test is whether they compose — so
let's design one actual workflow from scratch and make every decision in
order: MusicCorp shipping a CD order.

## Step 0: what are the moving pieces?

Before any communication decision, boundaries first. Following the
coupling analysis from post one, MusicCorp's order flow involves five
services, each owning one aggregate and its state machine:

- **`Order`** — owns the order's lifecycle (`PLACED → PAID → PICKING →
  SHIPPED → COMPLETED`), and is the *only* thing allowed to decide whether
  a requested transition is valid. This is the fix for the common-coupling
  trap from post one — nobody else gets to mutate order status directly.
- **`Payment`** — takes payment, knows nothing about warehouses or
  shipping.
- **`Warehouse`** — reserves stock, packages, and dispatches.
- **`Loyalty`** — awards points.
- **`Notifications`** — emails the customer at various points.

Each is cohesive (their own concern lives entirely inside their own
boundary) and only domain-coupled to the others where genuinely necessary.

## Step 1: pick the communication style, service by service

Now we ask, per interaction, the two questions from post two: does the
caller block, and is this a directed request or a broadcast? Not every hop
gets the same answer.

**Placing an order and taking payment** is a case where the caller
genuinely needs to know the result before continuing — a customer waiting
on checkout can't be told "we'll email you in a few hours about whether
your card worked." This is synchronous request-response: `Order` calls
`Payment`, blocks, and gets a definite yes or no back before the checkout
page can respond.

**Reserving stock** is a request-response too, since checkout has to know
whether the item is even available — but it doesn't strictly need to block
the customer for the entire duration if the warehouse system is slow, so an
asynchronous request-response over a queue is a reasonable choice here
without changing the shape of the interaction.

**Packaging, dispatch, awarding points, and sending notifications** are a
different story. None of these needs to happen inside the request that the
customer is waiting on — packaging can take hours or days, and there's no
reason `Order` should know or care that `Loyalty` and `Notifications` exist
at all. This is where event-driven collaboration earns its complexity:
`Warehouse` fires a `Stock Reserved` event, `Payment` fires a `Payment
Taken` event, and both `Loyalty` and `Warehouse` react to `Payment Taken`
independently and in parallel — one awards points, the other dispatches the
package. Neither service told the other to do anything; they just each
reacted to a fact that was broadcast.

```
   OrderProcessor            Payment              Warehouse
        |                      |                      |
        |--- reserve stock --->|                      |
        |                      |                      |
        |<---- reserved -------|                      |
        |                      |                      |
        |--- take payment ---->|                      |
        |                      |                      |
        |            [Payment Taken event fires]      |
        |                      |                      |
        |                 (Loyalty reacts)      (Warehouse reacts:
        |                 awards points          dispatch package)
```

Notice this is exactly the "mix and match" point from post two: the same
workflow uses synchronous request-response where an answer is genuinely
needed right away, and event-driven collaboration everywhere it isn't.
Neither choice is "more correct" in general — each fits its specific hop.

## Step 2: pick the technology per interaction

With styles chosen, the technology conversation from post three gets short.
Order-to-Payment, being synchronous request-response with a small number of
well-controlled internal consumers, is a natural fit for **gRPC** — good
performance, strong schemas, and MusicCorp controls both ends. The
event-driven hops (`Payment Taken`, `Stock Reserved`) need a **topic**, not
a queue, since multiple independent consumer groups (`Loyalty`,
`Warehouse`, potentially a future `Recommendations` service) each need
their own copy of the same event — this is where a broker like Kafka or a
managed equivalent earns its keep, particularly for the message permanence
that lets a newly deployed consumer catch up on history it missed.

Whatever's chosen, the events themselves should be fully detailed rather
than "just an ID" — `Notifications` needs a name and email address to send
a personalized message, and making it call back to `Order` for that
information every time would reintroduce exactly the domain coupling
event-driven collaboration was supposed to avoid.

## Step 3: what happens when something fails partway through?

This is where the saga thinking from post four becomes unavoidable. The
order fulfillment process spans five services and cannot be one ACID
transaction — so what happens if packaging fails because the CD isn't
actually on the shelf, despite the system thinking it was?

This is a **choreographed saga**: no single orchestrator, each service
reacting to events and deciding its own next move. Consider the failure
case explicitly:

```
Order Placed -> Stock Reserved -> Payment Taken -> [Packaging fails: item missing]
```

By this point, payment has already been taken and — if we hadn't applied
the reordering trick from post four — loyalty points may already have been
awarded. Rolling the whole order back now means firing **compensating
transactions**: refund the payment, and reverse the loyalty award if it
already happened. Neither of these is a true rollback — refunding isn't
"pretend the charge never happened," it's a new transaction that reverses
the effect. If a "sorry, your order shipped" notification had already gone
out, the compensating action there isn't deletion (you can't unsend an
email); it's a second, corrective email.

This is exactly why post four's advice to **reorder steps to reduce what
needs compensating** pays off here: award loyalty points only once the
order actually dispatches, not right after payment, and the "reverse
loyalty points" compensating transaction never needs to exist at all — that
step simply never fired if packaging failed first.

Because this is choreography, no single service has a built-in view of
"what state is order #4521 in right now?" Every event in this saga carries
a **correlation ID**, and a dedicated service consumes the full event
stream to reconstruct that view — the practical requirement post four
flagged as close to essential once you give up a central orchestrator.

## Why this is worth designing on paper first

None of these four decisions were independent. The boundary decisions in
step 0 determined who was even allowed to be a participant in the
conversation. The communication style in step 1 determined which
technology was even sensible in step 2. And the workflow's failure modes in
step 3 could only be reasoned about once steps 1 and 2 had already fixed
which interactions were synchronous (temporally coupled, need immediate
compensating logic) versus event-driven (already loosely coupled, but
harder to observe without a correlation ID).

The mistake worth avoiding is treating any one of these as a standalone
technology choice — "we use gRPC" or "we use Kafka" — made once, up front,
company-wide. The more durable habit is what we did above: work interaction
by interaction, let the boundary and the business requirement dictate the
style, and only then pick the technology and the failure-recovery approach
that fits what you've already decided. Applied consistently, that's most of
what separates a microservice architecture that stays maintainable from one
that quietly turns into a distributed monolith with extra network hops.

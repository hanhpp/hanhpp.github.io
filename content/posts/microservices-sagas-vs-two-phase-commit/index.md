---
title: "When Two-Phase Commit Isn't the Answer: Sagas for Microservice Transactions"
date: 2026-07-25T10:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "Splitting a monolith means splitting its database transactions too. The instinct is to reach for a distributed transaction. Here's why that instinct is usually wrong, and what to do instead."
---

Here's the moment almost every team hits when splitting a monolith: some
operation used to be one clean database transaction — say, marking a
customer's enrollment `VERIFIED` and deleting their row from
`PendingEnrollments`, both or neither. Now that logic lives in two separate
services with two separate databases. Either change can fail independently
of the other, and there's no single `ROLLBACK` that touches both. The
instinct is to reach for some way to make one transaction span both
processes. That instinct is usually a mistake — but understanding *why*
tells you what to do instead.

## What you actually lose when you split a transaction

A normal ACID database transaction gives you four guarantees:
**atomicity** (all changes happen or none do), **consistency** (the data
stays valid), **isolation** (no one sees an in-progress transaction's
intermediate state), and **durability** (once committed, it's committed).

You don't lose all of this when you split a monolith — a single
microservice can still use a completely normal ACID transaction for changes
to *its own* database. What you lose is atomicity **across** microservices.
Split the customer/enrollment update into two services with two databases,
and you now have two independent transactions, each of which can succeed or
fail on its own. There's no wrapper around both that guarantees "both or
neither."

## The instinctive fix: two-phase commit, and why it doesn't hold up

The obvious next move is a **distributed transaction** — most commonly
implemented as a **two-phase commit** (2PC). It works in two steps: during
the *voting phase*, a central coordinator asks every participant "can you
make this change?" Each participant locks the relevant resource and
promises it can commit later. If everyone votes yes, the coordinator sends
a *commit* message and the changes actually happen; if anyone votes no,
everyone rolls back and releases their locks.

This sounds reasonable until you look at what it costs:

- **Distributed locking, for the duration of the transaction.** Every
  participant holds a lock from the moment it votes yes until it gets the
  commit message. The longer the transaction, or the more participants
  involved, the longer those locks are held — and lock contention across
  multiple services is a much worse problem than lock contention inside one
  database.
- **A wide window of inconsistency.** The coordinator can't guarantee every
  participant commits at exactly the same instant — the commit message
  itself has to travel over the network to each one. Isolation, one of the
  four ACID guarantees, is quietly gone.
- **Nasty failure modes.** What happens when a participant votes yes, then
  goes silent when asked to actually commit? Some of these situations
  resolve automatically; others need a human to intervene manually.
- **Availability gets worse, not better, as you add participants.** Pat
  Helland's framing of this is the one worth remembering: in most
  distributed transaction systems, one node failing stalls the whole
  commit. The more nodes involved, the more likely *something* is down at
  any given moment — like an airplane where every additional engine you add
  is one more way for a required system to fail.

2PC isn't useless in every context — Google's Spanner uses distributed
transactional algorithms successfully, but only by controlling the entire
stack down to synchronized atomic clocks across data centers, applied
*within* what's logically one database. That's a different problem than
coordinating independently-owned microservices, and not a bar most teams
need or want to clear.

For coordinating state across independently deployed microservices: avoid
distributed transactions. If a piece of data genuinely needs true
atomic, consistent handling and you can't find a sane way to get that
without an ACID transaction, that's a signal the data shouldn't be split
apart in the first place — leave it in one service, one database, for now.

## Sagas: give up atomicity, gain an explicit process

If you *do* need to coordinate a change across several services — and for
anything long-running, you will — the better tool is a **saga**. The idea
predates microservices; it was originally designed for *long-lived
transactions* that would otherwise lock a database for uncomfortably long
periods. Instead of one transaction spanning the whole operation, you break
it into a sequence of smaller, independent transactions, each with its own
local commit.

The trade you're making is explicit and important: **a saga does not give
you atomicity at the level of the whole operation.** Each individual step
can be a normal, atomic ACID transaction against its own service's
database, but there's no wrapper guaranteeing all steps happen together.
What a saga gives you instead is enough information to know *what state
you're in* — and it's on you to define what happens next when something
goes wrong partway through.

> One limitation worth internalizing before anything else: a saga handles
> **business failures**, not **technical failures**. "The customer's card
> was declined" is a business failure the saga is designed to handle. "The
> payment gateway timed out and threw a 500" is a technical failure — the
> saga assumes the underlying services are fundamentally reliable, and
> you handle unreliability separately (retries, circuit breakers, that
> kind of thing), not by asking the saga logic to cover for it.

### Recovering from failure: rolling back vs. pushing forward

There are two ways a saga can recover once something goes wrong partway
through:

- **Backward recovery** — undo what's already been committed via
  **compensating transactions**, and treat the whole operation as
  cancelled.
- **Forward recovery** — retry the failed step and keep going from where
  it broke.

A single saga can mix both: MusicCorp's order fulfillment might roll the
whole order back if an item turns out not to be in the warehouse despite
the system thinking it was in stock, but simply retry (queuing for the next
day) if the courier has no space today — rolling the entire order back over
a shipping delay would be a strange overreaction.

Here's the part that trips people up the first time: a **compensating
transaction is not a real rollback**. A database rollback happens *before*
commit, and afterward it's as though nothing occurred. A compensating
transaction runs *after* the fact, undoing the effect of something that
genuinely did happen. Sometimes that's clean — refund a payment. Sometimes
it can't be, because some actions have no true inverse: you cannot unsend
an email telling a customer their order shipped. The best you can do is
send a second email saying it didn't. This is why these are called
**semantic rollbacks** — they clean up enough for the saga's purposes,
without pretending the original action never happened.

One low-effort trick that pays for itself: **reorder your saga's steps** so
the parts most likely to fail happen earliest. If awarding loyalty points
only happens after the order is actually dispatched, rather than right
after payment, you never need a compensating transaction for "un-award
points" in the first place — that step simply never ran if something
failed earlier.

## Two ways to build a saga: orchestration vs. choreography

### Orchestrated sagas: one conductor

An **orchestrator** — often just a service like `OrderProcessor` — owns the
whole business process, deciding what happens next and calling each
downstream service in turn. This tends to lean heavily on request-response:
the orchestrator asks `Payment` to take money, waits, decides what to do
based on the result.

The upside is visibility: the entire business process is explicitly
readable in one place, which is genuinely valuable for onboarding and
understanding "how does this actually work." The downside is exactly what
you'd expect from centralizing anything: the orchestrator ends up knowing
about — and coupled to — every service it coordinates, and there's a
constant gravitational pull for logic that belongs in those downstream
services to instead pile up in the orchestrator. Left unchecked, your
services become thin and anemic, and the orchestrator becomes the one place
all the actual behavior lives.

### Choreographed sagas: nobody's in charge, trust but verify

A **choreographed saga** distributes the process across the collaborating
services themselves, communicating almost entirely through events. When
`Warehouse` sees an `Order Placed` event, it knows — on its own, with no
one telling it to — that its job is to reserve stock and fire an event when
that's done. No service needs to know any other service exists; each just
reacts to events it cares about.

This is a fundamentally more loosely coupled architecture, and it
distributes responsibility instead of concentrating it in one place. The
cost is that there's no single spot to look at and understand "what is the
process." You have to reconstruct the whole flow mentally from each
service's independent behavior — and you lose an obvious place to ask "what
state is this specific order's saga in right now?"

The standard fix for that last problem is a **correlation ID**: a unique
identifier generated for the saga and carried through every event and log
line associated with it. With that in place, a dedicated service can
consume the event stream and reconstruct a live view of where every saga
currently stands — genuinely close to essential if you're going the
choreography route.

### Which one should you pick?

The rule of thumb that holds up in practice: **orchestration works well
when a single team owns the entire process** — the extra coupling is easy
to manage inside one team's boundary. **Choreography earns its extra
complexity when multiple teams are involved**, because it lets each team
own their piece without needing to coordinate through a shared central
service. Nothing stops you from mixing styles within one system, or even
within a single saga — MusicCorp's fulfillment saga might be choreographed
at the top level while `Warehouse` internally orchestrates its own
packaging-and-dispatch sub-flow.

---

Two posts ago we picked communication styles; last post, the technology to
implement them; this post, how to keep a multi-step business process
consistent when it spans several services. Next, we put all three
decisions together and design one real workflow end to end.

---
title: "What Actually Makes a Good Microservice Boundary"
date: 2026-07-22T10:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "Before you draw a single service boundary, you need a vocabulary for why some splits age well and others turn into a distributed monolith. Coupling and cohesion are that vocabulary."
---

Say you're building the backend for an online CD retailer — we'll call it
MusicCorp, and we'll keep coming back to it in this series. Orders need
payment taken, stock reserved, packages shipped, loyalty points awarded.
Somebody on the team draws a box around each of those verbs, calls it a
microservice, and ships it. Six months later, changing how loyalty points
work requires touching four different services in lockstep. What went
wrong?

Almost always, it's the boundary, not the technology. Kubernetes, gRPC, and
a service mesh won't save you from a bad cut. This post is about the three
ideas that actually predict whether a boundary will hold up: information
hiding, cohesion, and coupling — plus the specific *kinds* of coupling worth
telling apart, because "avoid coupling" is useless advice until you know
which coupling you're looking at.

## Information hiding: the one rule underneath everything else

David Parnas, writing about module design decades before "microservice" was
a word, put it simply:

> The connections between modules are the assumptions which the modules
> make about each other.

Every assumption one service makes about another's internals is a thread
that will eventually snap when someone changes those internals. The fewer
assumptions, the more freely each side can change. A microservice's whole
value proposition — deploy this one thing without deploying anything else —
depends on ruthlessly hiding as much as possible behind its interface:
internal data structures, database schema, business logic, all of it.
Expose only the minimum needed to satisfy consumers.

## Cohesion: the code that changes together, stays together

Cohesion asks a different question than coupling — it's about what's
*inside* your boundary, not what crosses it. The pithiest definition: the
code that changes together should live together. If a single business
change (say, "loyalty points now expire after 12 months") requires edits
spread across three services, that's weak cohesion — the related behavior
never had a coherent home. Strong cohesion means one change, one deploy.

Coupling and cohesion aren't independent — they're two views of the same
underlying question, just measured from inside vs. outside the boundary.
Larry Constantine's law says it cleanly: *a structure is stable if cohesion
is strong and coupling is low*. Neither one alone is sufficient.

## Coupling comes in flavors, and they are not equally bad

This is the part most teams skip, and it's the part that actually matters.
"Loose coupling good, tight coupling bad" doesn't tell you what to do when
you're staring at a design and trying to decide if it's fine. Here are four
kinds of coupling you'll run into between microservices, ordered from
least to most dangerous.

### Domain coupling — usually fine, in moderation

Domain coupling is simply one service calling another because it needs that
other service's functionality. `OrderProcessor` calls `Warehouse` to reserve
stock and `Payment` to take money. This is largely unavoidable — a system
made of collaborating services has to collaborate — and it's considered the
loosest, most acceptable form of coupling.

The warning sign isn't the coupling itself, it's the *shape* of it: if one
service depends on a long list of downstream services, that's often a
symptom that too much logic and responsibility has piled up in the caller.
Keep the fan-out small, and keep what you send across the boundary to the
minimum the callee actually needs — information hiding again.

### Pass-through coupling — the sneaky one

This happens when a service passes data through to a second caller purely
because a *third*, further-downstream service needs it. Picture
`OrderProcessor` sending a `ShippingManifest` to `Warehouse`, which does
nothing with it except forward it to `Shipping`. Now `OrderProcessor` has to
know about a data shape that belongs, conceptually, to a service two hops
away. Change what `Shipping` needs, and the change potentially ripples all
the way back to `OrderProcessor` — three services now need a coordinated
release for what should have been an internal detail of one.

The fix is usually one of:

- **Bypass the intermediary** — have the caller talk to the real owner
  directly. Trades pass-through coupling for a bit more domain coupling,
  which is a good trade, but only if it doesn't push logic that belonged to
  the intermediary back up into the caller.
- **Let the intermediary own the shape** — have `Warehouse` collect what it
  needs and construct the `ShippingManifest` itself, so `Shipping`'s
  contract changes become invisible to `OrderProcessor`.
- **Treat the payload as an opaque blob** — `OrderProcessor` still sends the
  manifest through `Warehouse`, but `Warehouse` never looks inside it, just
  relays it. This doesn't eliminate the coupling between the two endpoints,
  but it does mean the middle service never needs to change when the shape
  does.

### Common coupling — fine for read-only reference data, risky otherwise

Common coupling is what you get when two or more services read *and write*
the same shared data — classically, a shared database table. Multiple
services reading static, rarely-changing reference data (country codes, tax
rates) from one store is relatively benign, because that data barely
changes and nobody's fighting over write access.

It gets dangerous the moment multiple services both **write** to the same
structure. Imagine `OrderProcessor` and `Warehouse` both updating a `Status`
column on the same `Order` row — one setting `PLACED`/`PAID`/`COMPLETED`,
the other setting `PICKING`/`SHIPPED`. Nothing stops an invalid transition
like `PLACED → SHIPPED` from slipping through, because neither service has
a complete view of what's allowed. The fix is to give the state machine a
single owner: an `Order` service that both callers *request* changes from,
and that can reject a request that violates its own rules.

> If a "service" is really just a thin wrapper over database CRUD — every
> request maps straight to an update, no rules applied — that's a sign the
> logic that should live there has leaked out into every caller instead.
> You've traded one strongly-coupled shared table for several services all
> independently guessing what's a valid state transition.

### Content coupling — just don't

Content coupling is common coupling's uglier sibling: instead of a
*known* shared dependency, an outside service reaches directly into
another service's internal storage and mutates it — bypassing the owning
service's API entirely. Say `Warehouse` writes directly to the `Order`
table instead of calling the `Order` service.

The difference from common coupling is subtle but important: with common
coupling, everyone at least knows they share an external dependency they
don't fully control. With content coupling, the lines of ownership
disappear. The `Order` table becomes part of an external contract nobody
agreed to, information hiding is gone, and you're now trusting that
`Warehouse`'s idea of "valid state transition" exactly matches the `Order`
service's — with zero way to enforce it. This is sometimes called
*pathological* coupling for a reason. Avoid it outright.

## A quick word on temporal coupling

One more form worth knowing, because it comes up constantly once you start
picking communication styles (the subject of the next post): temporal
coupling is when two services both need to be up and reachable *at the same
instant* for an operation to succeed. A synchronous HTTP call from
`OrderProcessor` to `Warehouse` is temporally coupled — if `Warehouse` is
down, the whole operation fails right then. It's not inherently bad, but as
call chains grow, temporal coupling compounds into cascading failures.
Asynchronous communication is one of the main tools for loosening it.

## Naming things the way your users do

One more foundational habit worth adopting alongside coupling analysis:
**ubiquitous language**, borrowed from Domain-Driven Design. Use the same
terms in your code that domain experts use when they talk about the
business. The alternative — a generic, one-size-fits-all data model where
every real-world concept becomes a vague `Arrangement` or `Entity` — forces
constant mental translation between what the business means and what the
code says, and that translation tax gets paid by every developer, forever.

A related DDD concept, the **aggregate**, is worth carrying forward too: an
aggregate is a real domain concept with its own identity and lifecycle — an
`Order`, an `Invoice` — modeled as a self-contained unit whose state
transitions are managed together, in one place, by one service. An
aggregate gets to say no to an invalid request. That idea — a service
guarding its own state machine rather than letting callers dictate it
directly — is exactly what breaks the common-coupling trap above, and it's
worth keeping in your back pocket for the rest of this series.

---

Boundaries are the foundation, but they don't tell you *how* two well-bounded
services should actually talk to each other at runtime — synchronously,
asynchronously, as a request or as a broadcast event. That's next.

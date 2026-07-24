---
title: "Versioning Microservices Without Breaking Everyone"
date: 2026-07-24T09:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "In a monolith, renaming a field means updating all callers in one commit. In microservices, consumers upgrade on their own schedule — so your API has to evolve without breaking the ones that haven't upgraded yet. Here's how."
---

MusicCorp's warehouse service has an endpoint that returns stock levels:

```json
{
  "sku": "CD-NIRVANA-1991",
  "quantity": 42,
  "location": "warehouse-3"
}
```

The product team decides that `location` should be a structured object
instead of a flat string — warehouse-3 is in Portland, and downstream
services need the city, not just the warehouse ID. The change is simple in
the warehouse service. But six other services read that field. Three of them
are owned by teams that deploy weekly. One of them is owned by a team that
deploys quarterly. You can't coordinate six simultaneous deploys. So the
question becomes: how do you change `location` from a string to an object
without breaking the three services that still expect a string?

In a monolith, this isn't a question — you change the type, update every
caller, and ship one commit. In microservices, you're shipping a change that
will run alongside the old version of your API for days or weeks while
consumers upgrade at their own pace. Get this wrong and you get the most
common microservices production incident: a service deploys a breaking
change, and somewhere in the system, a consumer that hasn't upgraded yet
starts failing silently.

## Why versioning is harder than you think

In a monolith, the type system and the compiler catch breaking changes. If
you rename a field, every place that references it fails to compile. You fix
them all in one pass, ship one commit, and the old code stops existing the
moment the new code deploys.

In microservices, there's no compiler across services. When you deploy a
change to Service A's API, Services B through G don't automatically update.
They're still running the old code that expects the old shape. Some of them
might deploy today, some next week, some next quarter. During that window,
the old and new versions of your API have to coexist — and the old version
has to keep working for consumers that haven't upgraded yet.

This creates a compatibility matrix. With N services and M API versions, you
might have N×M combinations to think about. In practice, you don't — but
only if you adopt a discipline that keeps the number of concurrent versions
small and the transition path clear.

## The expand-contract pattern

The single most practical versioning strategy is **expand-contract** (also
called parallel change or cross-phase). The rule is simple:

1. **Expand**: add the new field alongside the old one. Both exist.
2. **Migrate**: consumers switch to the new field at their own pace.
3. **Contract**: remove the old field once all consumers have migrated.

For the warehouse example:

**Expand** — the API now returns both:
```json
{
  "sku": "CD-NIRVANA-1991",
  "quantity": 42,
  "location": "warehouse-3",
  "warehouse": {
    "id": "warehouse-3",
    "city": "Portland"
  }
}
```

Old consumers keep reading `location`. New consumers read `warehouse.city`.
Nothing breaks. No coordination required.

**Migrate** — each consuming team updates their code when they're ready.
Team A deploys on Tuesday. Team B deploys the following sprint. Team C,
the quarterly deployers, gets a ticket in their backlog.

**Contract** — once you've confirmed (via logging or metrics) that no
consumer is reading `location` anymore, remove it. The field is gone, the
API is clean, and you're back to one version.

> The discipline is in the contract phase. Teams that expand but never
> contract end up with APIs full of deprecated fields that nobody dares
> remove. Add a metric: track how many requests still read the old field.
> When it drops to zero, remove it. When it doesn't drop to zero, find out
> who's still reading it and talk to them.

## URL versioning vs. header versioning

When you need genuinely incompatible changes — not just adding a field but
changing the semantics of the entire response — you need to version the API
itself. There are two practical approaches:

**URL versioning** (`/v1/stock`, `/v2/stock`) is explicit and visible. You
can see which version you're calling. It's easy to route, easy to document,
and easy to debug. The downside: it leaks implementation details into your
URLs, and it gives consumers an excuse to stay on v1 forever because v1
still works.

**Header versioning** (`Accept: application/vnd.musiccorp.v2+json`) keeps
your URLs clean and makes versioning a negotiation between client and server.
The downside: it's invisible in logs, harder to test with `curl`, and
easier to forget to set.

The pragmatic choice for most teams: URL versioning for major breaking
changes, expand-contract for everything else. If you're versioning your API
more than twice, something is wrong with your evolution discipline — you're
making breaking changes too often.

## Schema evolution: protobuf and Avro

If you're using protocol buffers or Avro for inter-service communication
instead of JSON, you get versioning tools built into the serialization
format. Protobuf's field numbering system is designed for exactly this
problem:

```protobuf
message StockLevel {
  string sku = 1;
  int32 quantity = 2;
  string location = 3;          // deprecated, but still readable
  Warehouse warehouse = 4;      // the replacement
}

message Warehouse {
  string id = 1;
  string city = 2;
}
```

Protobuf's rule: old code ignores unknown fields. So when you add field 4,
old consumers that don't know about it simply skip it — no error, no crash.
When you remove field 3, new consumers that expected it check for its
presence. This gives you safe forward and backward compatibility by default,
as long as you follow two rules:

1. **Never reuse a field number.** If you remove field 3, leave it reserved.
   Don't assign a new meaning to number 3 — old code might still be sending
   data with that number.
2. **Use optional for fields that might not be present.** New consumers
   checking a removed field need to handle its absence.

Avro gives you something even better for schema evolution: a writer's schema
and a reader's schema that the system reconciles automatically. If the
writer sends field A and field B, and the reader expects field B and field
C`, the system fills in a default for C and ignores A. You don't have to
think about forward compatibility per se — the format handles it.

> If you're building new services and choosing a wire format, protobuf or
> Avro over JSON is worth the upfront investment purely for the versioning
> story. JSON is human-readable and easy to prototype with, but it gives you
> zero help with schema evolution — every field change is a potential
> breaking change that only your tests (if you have them) will catch.

## Consumer-driven contracts

Expand-contract handles the "add then remove" lifecycle. But how do you
know when it's safe to remove the old field? How do you know that no
consumer still depends on it?

**Consumer-driven contracts** flip the testing direction. Instead of the
provider testing that its API works, each consumer defines what it needs:
"I expect `GET /stock/{sku}` to return an object with `quantity` as an
integer." The provider runs all consumers' contracts against its API before
deploying. If any contract fails, the deploy is blocked.

The practical entry point is Pact — an open-source contract testing
framework. The consumer writes a contract:

```python
# consumer side
def test_stock_level_has_quantity(provider):
    provider.given("sku CD-NIRVANA-1991 exists")
    provider.upon_receiving("a request for stock level")
    provider.with_request("GET", "/stock/CD-NIRVANA-1991")
    provider.will_respond_with(200, body={
        "quantity": Like(42)
    })
```

The provider verifies this contract against its real API. If the provider
tries to remove `quantity` and a consumer's contract still expects it, the
test fails and the deploy is stopped.

This is the tooling that makes the contract phase of expand-contract
reliable. Without it, you're guessing whether anyone still reads the old
field. With it, you know.

## The database schema problem

Versioning an API is tractable. Versioning a database schema that multiple
services share is where things get genuinely hard — and it's the one
scenario where microservices can trap you if you're not careful.

If Service A and Service B both read from the same `stock_levels` table, and
Service A decides to rename the `quantity` column to `available_count`, Service
B breaks immediately. Not on the next deploy — right now, the moment the
migration runs.

The fix is architectural: **each service owns its database**. If Service B
needs stock data, it gets it through Service A's API, not by querying the
table directly. This is the rule from the
[coupling post]({{< ref "microservices-boundaries-coupling-cohesion" >}}) —
no shared databases.

But if you're mid-migration and the shared database is real, the practical
stopgap is:

1. **Add the new column first** (expand), write to both during a transition
   period.
2. **Update consumers** to read from the new column.
3. **Drop the old column** once reads have migrated.

It's expand-contract at the database level. The danger is that database
migrations are harder to roll back than API changes — dropping a column
isn't undone by redeploying the old version of your service. Test migrations
against a copy of production data before running them.

## What it looks like when you get it wrong

Here's the incident. MusicCorp's order service sends stock reservation
requests to the warehouse service. The request includes a `priority` field
as a string: `"normal"` or `"express"`.

The warehouse team decides to change `priority` from a string to an enum
integer: `0` for normal, `1` for express. They deploy the change with no
expand phase — the old string format is gone, only the new integer format
is accepted.

The order service, which still sends `"priority": "normal"`, starts failing.
The warehouse returns a 400 Bad Request. The order service retries, gets
400 again, retries three times, and then the order fails. The customer sees
an error page.

But here's the worse part: it only happens for express orders. Normal
orders happen to work because the warehouse service's validation has a
bug that treats the missing `priority` field as normal priority. So the
failure is intermittent, tied to a specific code path, and the error
message is a generic 400 with no hint that it's a type mismatch.

Total time to identify: four hours, because the first investigation focused
on the order service (which was retrying) rather than the warehouse service
(which was rejecting). A correlation ID and a trace would have shown the
400 immediately. The expand-contract pattern would have prevented it
entirely.

---

Versioning is the boring discipline that keeps microservices from rotting
into a system where every deploy is a coordination exercise. The expand-
contract pattern is your default strategy, protobuf or Avro gives you safe
schema evolution for free, and consumer-driven contracts tell you when it's
safe to remove the old version. None of this is exciting. All of it is
necessary.

If you're following the series, the
[communication tech post]({{< ref "microservices-picking-communication-tech" >}})
covered how to pick the wire format — this post covers how to evolve it
safely. And if the incident scenario above made you wince, the
[debugging post]({{< ref "debugging-microservices-where-did-that-request-go" >}})
covers the tooling that would have cut the investigation time from four
hours to fifteen minutes.

---
title: "Database Per Service: The Pattern That's Harder Than It Sounds"
date: 2026-08-06T09:30:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "Each service owns its database. That's the rule. But when a report needs data from four services, or a customer wants to see their complete order history, you've got a query problem that a single SELECT can't solve. Here's how to handle it."
---

The [sagas post]({{< ref "microservices-sagas-vs-two-phase-commit" >}})
covered why services shouldn't share database transactions [2]. This post covers
the architectural consequence of that rule: if each service owns its own
database, how do you answer questions that span multiple services?

MusicCorp's order service knows about orders. The payment service knows
about payments. The warehouse service knows about stock. The customer
service knows about addresses and preferences. When a customer asks "show
me my recent orders with their payment status and shipping tracking," that
query touches four databases. In a monolith, it's one SQL join. In
microservices, there's no join across service boundaries [1], and that's the
point. The question is what you do instead.

## Why database-per-service is the rule

Before the patterns, the reason: if two services share a database, a
schema change in one service breaks the other [1]. Service A renames a column.
Service B, which queries that column directly, starts failing. You've
reintroduced the coupling you were trying to escape, not through the API,
but through the data layer.

Worse, shared databases prevent independent evolution. Service A can't
change its data model without coordinating with every other service that
reads from the same tables. You end up with a de facto API that's the
database schema, and changing it requires the same coordination you'd need
for an API change, except there's no versioning, no expand-contract, and
no documentation. It's the worst of both worlds.

The rule exists for the same reason the
[coupling post]({{< ref "microservices-boundaries-coupling-cohesion" >}})
exists: to keep service boundaries meaningful. A service that owns its
database can evolve its data model freely, run migrations without coordinating
with other teams, and scale its storage independently [1]. That's the value
proposition. The cost is the query problem.

## Pattern 1: API composition

The simplest approach: the service that needs data from other services calls
their APIs and composes the result.

```go
func GetOrderSummary(ctx context.Context, orderID string) (OrderSummary, error) {
    order, err := orderClient.Get(ctx, orderID)
    if err != nil {
        return OrderSummary{}, err
    }
    payment, err := paymentClient.GetByOrder(ctx, orderID)
    if err != nil {
        return OrderSummary{}, err
    }
    shipment, err := warehouseClient.GetShipment(ctx, orderID)
    if err != nil {
        return OrderSummary{}, err
    }

    return OrderSummary{
        Order:   order,
        Payment: payment,
        Shipment: shipment,
    }, nil
}
```

This is a **composition query**: one service acts as the aggregator, calls
multiple downstream services, and assembles the result [3]. It's straightforward
and easy to understand.

The problems:

- **Latency adds up.** Three sequential calls at 50ms each = 150ms minimum.
  You can parallelize with goroutines, but you still wait for the slowest
  service.
- **Partial failures are tricky.** What if the warehouse service is down?
  Do you return the order and payment data without shipment info? Return an
  error? The answer depends on the use case, and you have to decide for
  every composition query.
- **No cross-service joins.** You can't sort by "orders with payments over
  $100, shipped in the last week" without fetching everything and filtering
  in memory [3]. That works for small result sets. It doesn't work for
  analytics.

API composition is the right choice for **simple read paths** where the
number of downstream calls is small (two or three) and the result set is
bounded (a single order, a user profile, a product detail page).

## Pattern 2: CQRS (separate reads from writes)

**Command Query Responsibility Segregation** splits the data model into two:
a **write model** (the service's authoritative database, optimized for
transactions) and a **read model** (a separate store optimized for queries) [4].

The write side stays as-is: the order service has its orders table, the
payment service has its payments table, each with its own schema optimized
for writes. The read side is different: a **read-optimized store** that
contains pre-joined, denormalized data assembled from multiple services'
write models.

```
Write side:                    Read side:
┌─────────────┐               ┌──────────────────────┐
│ Order DB    │──events──→    │ Order Summary Store   │
│ Payment DB  │──events──→    │ (denormalized view)   │
│ Warehouse DB│──events──→    │                       │
└─────────────┘               └──────────────────────┘
                                      ↑
                              Read queries go here
```

When an order is placed, the order service writes to its database *and*
publishes an event. A projection service consumes that event, joins it with
payment and shipment data, and writes a denormalized "order summary" row to
the read store. When the customer asks for their order history, the query
hits the read store: one fast SELECT, no cross-service calls.

The read store can be anything: a PostgreSQL table with the right indexes
[8], an Elasticsearch index for full-text search, a Redis cache for hot data
[7]. The point is that it's shaped for the query, not for the write.

**The trade-off is eventual consistency.** The read model is updated
asynchronously [4]. There's a window (typically milliseconds) between "the
write happened" and "the read model reflects it." If the customer places an
order and immediately refreshes the page, they might not see it yet. For
most use cases, this is fine. For financial reporting or audit trails, it
might not be.

CQRS is the right choice when:
- You have complex read patterns that span multiple services.
- Read performance matters more than read freshness.
- You're willing to maintain a projection service and a read store.

## Pattern 3: Event sourcing (store what happened, not what is)

Event sourcing takes the CQRS write model further: instead of storing the
current state of an entity, you store every event that led to it [5].

```
Order 8842 events:
1. OrderPlaced     {sku: "CD-NIRVANA-1991", qty: 1, customer: "c-42"}
2. PaymentTaken    {amount: 24.99, method: "visa"}
3. StockReserved   {warehouse: "warehouse-3"}
4. OrderShipped    {tracking: "1Z999AA10123456784"}
```

The current state is derived by replaying events: start with an empty
order, apply each event in order, and you end up with the current state.
This gives you a complete audit trail for free: you can reconstruct the
state at any point in time, not just the current state [5].

Event sourcing solves the cross-service query problem in a different way:
events are the shared language. The order service emits `OrderPlaced`. The
payment service consumes it and emits `PaymentTaken`. The warehouse service
consumes `OrderPlaced` and emits `StockReserved`. A read model (following
CQRS) consumes all three and builds the denormalized view.

The cost:
- **Complexity.** Event sourcing is conceptually simple but operationally
  complex. Event schemas evolve. You need snapshotting to avoid replaying
  thousands of events. You need to handle event versioning.
- **Debugging is different.** You can't look at a row in a table and see
  the current state; you have to replay events to derive it. Tooling
  helps, but it's a different mental model.
- **It's a bigger commitment than CQRS.** CQRS separates reads from writes;
  event sourcing changes how you store writes entirely. You can do CQRS
  without event sourcing. You can't easily do event sourcing without CQRS.

Event sourcing is the right choice when:
- You need a complete audit trail (finance, healthcare, legal).
- The domain is naturally event-driven (order lifecycle, IoT telemetry,
  collaborative editing).
- You want temporal queries ("what was the state of this order on July 1st?").

> A common mistake: adopting event sourcing for the whole system when only
> one aggregate needs it. Start with CQRS for the query problem. Add event
> sourcing to specific aggregates where the audit trail or temporal query
> justifies the complexity. Don't event-source your user preferences
> service.

## Pattern 4: the reporting database

For analytics and business intelligence, none of the above patterns are
quite right. You don't want to compose API calls in real time for a
dashboard that queries six months of data. You want a **reporting database**:
a copy of all relevant data, assembled into a single store, optimized for
analytical queries [6].

The mechanism is the same as CQRS projections: services emit events, a
pipeline consumes them, and a reporting database stores the denormalized
result. But the reporting database isn't serving real-time reads; it's
serving batch queries that run across the entire dataset.

```
Order events ──→
Payment events ──→  ETL pipeline  ──→  Reporting DB (analytics)
Warehouse events ──→
```

This is the one place where a shared data store makes sense, but it's a
*copy*, not the source of truth. The reporting database doesn't serve
writes. It doesn't influence business logic. It's a read-only view assembled
from events, and if it falls behind, the reports are slightly stale but the
system keeps running.

The tooling varies: Apache Kafka Connect can stream events to a data
warehouse. Debezium can capture database changes and replicate them to a
central store. For simpler setups, a scheduled job that calls each service's
API and writes the results to a PostgreSQL database works fine.

## When to break the rule

The "database per service" rule exists to prevent coupling. But there are
cases where a shared database is the pragmatic choice:

- **Small systems with one team.** If three services are owned by the same
  team and deploy together, the coupling cost of a shared database is low
  and the query benefit is high. Don't pay the CQRS tax if you don't need
  to.
- **Read-heavy, write-light data.** If a service mostly reads data that
  another service owns (like a product catalog), direct database access is
  simpler than an API composition layer, as long as the schema is stable
  and the ownership is clear.
- **Migration in progress.** If you're splitting a monolith and haven't
  finished extracting services, a shared database is a temporary reality.
  The goal is to make it temporary: add a ticket to finish the extraction,
  and treat every shared table as technical debt.

The test: if you can change the schema without coordinating with another
team, the database is yours. If you can't, you're sharing, and you're
paying the coupling tax, whether you call it a shared database or not.

---

The [sagas post]({{< ref "microservices-sagas-vs-two-phase-commit" >}})
covered how to keep writes consistent across services. This post covers how
to keep reads performant. Together, they answer the full data question:
writes use sagas for coordination, reads use composition, CQRS, or event
sourcing depending on complexity and freshness requirements. The reporting
database covers analytics. And sometimes, the pragmatic answer is a shared
database with clear ownership; just make sure the coupling is a conscious
choice, not an accident.

## References

[1] Chris Richardson, [Pattern: Database per service](https://microservices.io/patterns/data/database-per-service.html) (Microservice Architecture pattern catalog): the defining statement of the rule that each service owns a private datastore, the loose coupling and independent scaling it buys, and the drawback that queries joining data owned by several services are no longer straightforward.

[2] Hector Garcia-Molina and Kenneth Salem, [*Sagas*](https://doi.org/10.1145/38713.38742) (*Proceedings of the 1987 ACM SIGMOD International Conference on Management of Data*, 1987): the original long-lived-transaction decomposition into a sequence of subtransactions with compensating actions, the canonical anchor for keeping writes consistent across services without sharing a database transaction.

[3] Chris Richardson, [Pattern: API Composition](https://microservices.io/patterns/data/api-composition.html) (Microservice Architecture pattern catalog): the aggregator pattern for queries spanning several services, including its drawback that large result sets degrade into inefficient in-memory joins.

[4] Chris Richardson, [Pattern: Command Query Responsibility Segregation (CQRS)](https://microservices.io/patterns/data/cqrs.html) (Microservice Architecture pattern catalog): the split into a command model and an event-fed, denormalized view database, whose listed drawbacks include replication lag and eventually consistent views.

[5] Martin Fowler, [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) (2005): storing application state as an append-only sequence of events that is replayed to derive current state and to reconstruct any prior state.

[6] Martin Fowler, [Reporting Database](https://martinfowler.com/bliki/ReportingDatabase.html) (2014): the separate copy of the data maintained for decision support and analysis, because operational updates and reporting have different schema and access requirements.

[7] Martin Fowler, [Polyglot Persistence](https://martinfowler.com/bliki/PolyglotPersistence.html) (2011): using different data storage technologies for different kinds of data, which is what lets a read model live in whichever store fits the query.

[8] PostgreSQL Global Development Group, [PostgreSQL 18 Documentation: Chapter 11. Indexes](https://www.postgresql.org/docs/current/indexes.html) (PostgreSQL 18): the index types and multicolumn and ordering support that turn a filtered read-store query into an index scan instead of a sequential pass over the table.

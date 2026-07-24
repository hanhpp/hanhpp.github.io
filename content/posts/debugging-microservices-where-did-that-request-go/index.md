---
title: "Debugging Microservices: Where Did That Request Go?"
date: 2026-07-24T10:00:00+07:00
draft: false
tags: ["microservices", "architecture", "distributed-systems"]
summary: "In a monolith, a stack trace tells you what went wrong. In microservices, you're grepping across three services' logs at 2 AM trying to figure out which one lost the request. Here's how to make that possible instead of painful."
---

You've read the series on boundaries, communication, and sagas. Your
services are well-bounded, your communication patterns are deliberate, and
your saga handles the order workflow cleanly. Then Monday morning, a
customer reports that their order disappeared. The payment went through —
the payment service confirms it — but the warehouse never got the stock
reservation request. Where did it go?

In a monolith, the answer is in one stack trace. In microservices, that
stack trace doesn't exist. The request lived across three services, each
with its own logs, each running in its own process. You now have a
debugging problem that's fundamentally different from anything a monolith
teaches you, and if you don't prepare for it in advance, your first real
incident will be a miserable learning experience.

This post is the practical follow-up the series has been missing. It covers
the three things that make microservices debuggable — correlation IDs,
distributed tracing, and centralized logs — and it shows you what the
debugging experience actually looks like with and without them.

## What a stack trace used to look like

In a monolith, when an order fails halfway through processing, you get
something like this:

```
ERROR: failed to reserve stock for order 8842
  at warehouse/reserve.go:47
  at order/process.go:128
  at order/create.go:63
  at http/handler.go:22
```

Four lines. One process. You can read it top to bottom and see exactly
where the error happened, what called it, and what the request was. The
entire execution path lives in one place.

## What it looks like without preparation

Now the same failure across three services, with no correlation ID:

**Order service logs:**
```
2026-07-27T03:14:22Z INFO  POST /orders 201 created order_id=8842
2026-07-27T03:14:22Z INFO  calling warehouse service to reserve stock
2026-07-27T03:14:22Z ERROR POST http://warehouse:8080/reserve timeout after 5000ms
```

**Payment service logs:**
```
2026-07-27T03:14:23Z INFO  POST /payments 201 created payment_id=10294
2026-07-27T03:14:23Z INFO  stock reserved for order — proceeding with payment
```

**Warehouse service logs:**
```
2026-07-27T03:14:18Z INFO  POST /reserve 200 stock reserved order_id=8842
```

Three services. Three log streams. Three different timestamps (the order
service is three seconds ahead of the warehouse service — clock skew is
real). You can't tell which logs belong to the same request. You can't tell
that the payment service actually *did* reserve stock successfully, but the
order service timed out waiting and retried, and the retry hit a race
condition. You're staring at three separate timelines that might or might
not be related, and the customer is still waiting.

> This is the single biggest operational difference between monoliths and
> microservices. In a monolith, the execution path is visible in one place.
> In microservices, reconstructing that path is a skill you have to build —
> and the tooling has to exist before you need it.

## Correlation IDs: the minimum viable fix

A correlation ID (sometimes called a request ID or trace ID) is a unique
string generated when a request enters your system and passed along to every
service that touches it. Every log line that service produces includes that
ID. That's it — one string that lets you grep across all services and
reconstruct a single request's journey.

### Where to generate it

At the entry point. When a request hits your API gateway or the first
service in the chain, generate a UUID and attach it to the request:

```go
func middleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        id := r.Header.Get("X-Request-ID")
        if id == "" {
            id = uuid.New().String()
        }
        ctx := context.WithValue(r.Context(), "request_id", id)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### How to pass it

Every outgoing HTTP or gRPC call from one service to another includes the
correlation ID as a header:

```go
func callWarehouse(ctx context.Context, order Order) error {
    reqID := ctx.Value("request_id").(string)
    req, _ := http.NewRequestWithContext(ctx, "POST", warehouseURL, body)
    req.Header.Set("X-Request-ID", reqID)
    // ... do the call
}
```

### How to log it

Every log line includes the correlation ID:

```go
log.Printf("[request_id=%s] stock reserved for order %d", reqID, orderID)
```

Now, when that same failure happens across three services, your grep looks
like this:

```
$ grep "request_id=abc-123" *.log

order.log:   INFO  POST /orders 201 created request_id=abc-123
order.log:   INFO  calling warehouse service request_id=abc-123
order.log:   ERROR POST http://warehouse:8080/reserve timeout request_id=abc-123
warehouse.log: INFO  POST /reserve 200 stock reserved request_id=abc-123
payment.log:  INFO  POST /payments 201 created request_id=abc-123
```

You can now see the full timeline: the warehouse *did* reserve stock
successfully, but the order service timed out before it got the response.
The payment service then processed independently. You have a retry problem
and a timeout configuration problem, not a missing request problem. Same
incident, completely different debugging experience.

## Distributed tracing: what correlation IDs can't do

Correlation IDs solve the "which logs belong together" problem. They don't
solve the "how long did each step take" or "where did the time go" problem.
For that, you need distributed tracing — and the practical entry point is
OpenTelemetry.

### The mental model

A trace is a tree of spans. The root span is the incoming request. Each
outbound call to another service creates a child span. Each span records
its start time, end time, status, and metadata. When the trace is
collected, you see a waterfall diagram showing exactly how time was spent:

```
[POST /orders                          4,200ms]
  ├─ [order.validate                     12ms]
  ├─ [HTTP POST warehouse:/reserve    3,800ms]  ← timeout at 5s but retried
  │     └─ [warehouse.reserve.stock      45ms]
  ├─ [HTTP POST payment:/charge         380ms]
  │     └─ [payment.process            350ms]
  └─ [order.confirm                      8ms]
```

That waterfall makes the timeout visible instantly. You can see the
warehouse call took 3.8 seconds, the payment call took 380ms, and the
total request took 4.2 seconds. Without tracing, you'd be guessing which
step was slow.

### What it takes to add

The basics aren't as much infrastructure as you'd think. OpenTelemetry's
Go SDK gives you a tracer you add to your service's entry point and each
outbound call:

```go
import "go.opentelemetry.io/otel"

var tracer = otel.Tracer("order-service")

func createOrder(ctx context.Context, req OrderRequest) (Order, error) {
    ctx, span := tracer.Start(ctx, "create-order")
    defer span.End()

    // validate, call warehouse, call payment...
    // each outbound call gets its own child span
}
```

The SDK handles context propagation — when you make an outbound HTTP call,
the trace context is automatically injected into the headers. The
destination service picks it up and continues the trace. You don't pass
IDs manually; the instrumentation does it.

What you *do* need is a collector — something that receives spans from all
your services and stores them. Jaeger and Grafana Tempo are the common
open-source options. The collector is the one piece of infrastructure you
have to run, and it's the thing that makes tracing data searchable.

> Correlation IDs and distributed tracing aren't alternatives — they serve
> different purposes. Correlation IDs are for grepping logs. Distributed
> tracing is for understanding latency. You want both, but you can start
> with correlation IDs and add tracing later. Don't let the tracing
> infrastructure become the reason you don't instrument at all.

## Centralized logs: why `kubectl logs` stops working

With one or two services, reading logs from each one is tedious but
feasible. With ten services, it's impossible. You need your logs in one
place — a system like Loki, the ELK stack, or Datadog — where you can
search across all services at once.

The practical minimum: every service writes structured logs (JSON, not
free-form text) to stdout, and a log collector ships them to a central
store. Structured logs matter because they let you search by field —
"show me all logs where `request_id = abc-123`" — instead of grepping
free-form text and hoping the format is consistent.

```go
log.Info("stock reserved",
    zap.String("request_id", reqID),
    zap.Int("order_id", orderID),
    zap.Int("quantity", qty),
)
```

This isn't glamorous work. It's the kind of thing that feels unnecessary
until you're debugging a production incident and realize you can't find the
relevant logs because they're scattered across fifteen containers and half
of them are in a format you can't search.

## The debugging workflow: what it actually looks like

With correlation IDs, tracing, and centralized logs in place, here's what
debugging a real incident looks like:

1. **Customer reports the problem.** "My order went through but I never got
   a shipping notification."

2. **Find the request in your trace system.** Search by order ID or customer
   email. You get the full trace — every service that handled the request,
   every span, every timing.

3. **See where it broke.** The trace shows Order → Warehouse (success) →
   Payment (success) → Notification (never called). The saga ended but
   didn't trigger the final step.

4. **Check the logs for context.** Correlation ID in hand, search your
   centralized logs for every log line across all three services. You find
   the payment service logged a success but the event it published to the
   notification topic was never received — because the topic name was
   misspelled in the notification service's config.

5. **Fix it.** Correct the topic name. Deploy. The trace confirms the
   notification span now completes.

Total debugging time: fifteen minutes. Without the tooling, that same
incident could take hours — you'd be SSH-ing into containers, reading log
files manually, and trying to reconstruct a timeline by hand.

## The mistake to avoid: building the infrastructure after the incident

The most common pattern I've seen on teams adopting microservices is this:
they build the services, deploy them, ship features, and then when the
first real incident happens, someone says "we should add tracing" and
"we should centralize our logs." At that point you're debugging in the dark
during your most stressful moment, and retrofitting observability under
pressure is how you end up with inconsistent instrumentation that misses
the important calls.

The minimum viable observability stack, before you deploy your first
microservice:

- **Correlation ID middleware** — twenty lines of code, generates an ID at
  the entry point, passes it on every outbound call, logs it on every log
  line.
- **Structured logging** — switch from free-form `log.Printf` to
  structured output with a library like `zap` or `slog`. Every log line
  includes the correlation ID and the key business identifiers.
- **A log aggregator** — Loki, ELK, or even a hosted solution. Something
  that lets you search across all services by correlation ID.
- **Distributed tracing** — OpenTelemetry with Jaeger or Tempo. Start with
  auto-instrumentation (the Go SDK instruments `net/http` automatically)
  and add manual spans for the business-critical paths.

None of this is optional infrastructure. It's the equivalent of having a
debugger in your language — you don't ship a product without one, and you
don't ship microservices without observability.

---

This is the operational reality that design posts don't cover: the part
where your clean architecture has to survive contact with production. If
you're following the series from the beginning, the
[decision checklist]({{< ref "should-you-even-use-microservices" >}}) told
you whether you need microservices, the
[coupling and cohesion post]({{< ref "microservices-boundaries-coupling-cohesion" >}})
told you where to draw the boundaries, and the communication and saga posts
gave you the patterns. This post gives you the tooling to actually operate
what you've built. Don't skip it.

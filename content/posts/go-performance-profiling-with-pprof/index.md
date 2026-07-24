---
title: "Go Performance Profiling with pprof: Finding the Slow Part"
date: 2026-07-24T03:00:00+07:00
draft: false
tags: ["go", "performance"]
summary: "Your Go service is slow, but you don't know where. Guessing is not a strategy. pprof tells you exactly where your program spends its time, memory, and CPU — here's how to use it."
---

"The API is slow" is the most common performance complaint and the least
useful. Slow where? Slow in the network? In the database? In a loop that
quadratic in the number of orders? Without a profiling tool, you're guessing
— moving things around, adding caches, rewriting code that might not be the
bottleneck, and hoping you get lucky.

Go ships with a profiling tool built in: `pprof`. It's in the standard
library, it works on any Go program, and it tells you exactly where your
program spends its resources. This post covers the three profiles that
matter most (CPU, memory, goroutine), how to collect them, and how to read
the output without a PhD in computer science.

## The three profiles you'll actually use

`pprof` can collect several types of profiles. Three of them cover 95% of
performance investigations:

**CPU profile** — where your program spends processor time. Use this when
the symptom is "the service is slow" and you need to know which function is
burning cycles.

**Memory (heap) profile** — where your program allocates memory. Use this
when the symptom is "the service uses too much RAM" or "GC is running too
often" or "we're getting OOM-killed."

**Goroutine profile** — where your goroutines are and what they're doing.
Use this when the symptom is "goroutine count is growing" or "the service
is unresponsive" or "goroutine leak."

## Collecting a profile: two ways

### Way 1: the net/http/pprof endpoint (for running services)

The simplest way to profile a running Go service: import `net/http/pprof`
and expose it on an HTTP endpoint. If your service already runs an HTTP
server, this is a two-line change:

```go
import _ "net/http/pprof"

// in your main or init
go func() {
    http.ListenAndServe("localhost:6060", nil)
}()
```

Now your service exposes profiling data at `localhost:6060/debug/pprof/`.
Collect a 30-second CPU profile:

```bash
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30
```

This downloads the profile and opens an interactive shell. The service runs
normally while the profile is being collected — no restart, no code change,
no special build flags.

> **Security note:** never expose the pprof endpoint to the public internet.
> It gives anyone who can reach it deep insight into your program's behavior.
> Bind it to localhost, or put it behind an auth proxy, or only enable it in
> non-production environments.

### Way 2: runtime/pprof in code (for benchmarks and CLIs)

For programs that don't run an HTTP server (CLI tools, batch jobs, tests),
write the profile directly:

```go
import "runtime/pprof"

func main() {
    f, _ := os.Create("cpu.prof")
    pprof.StartCPUProfile(f)
    defer pprof.StopCPUProfile()

    // ... your code here
}
```

Then analyze with:

```bash
go tool pprof cpu.prof
```

## Reading a CPU profile

You've collected a profile. You're staring at a wall of text. Here's what
to look for.

The interactive `pprof` shell shows you functions sorted by how much CPU
time they consume. The most useful commands:

```
(pprof) top 20
Showing nodes accounting for 3.2s, 80% of 4s
      flat  flat%   sum%        cum   cum%
     1.2s 30.0%  30.0%      1.2s 30.0%  runtime.mallocgc
     0.8s 20.0%  50.0%      0.8s 20.0%  runtime.memclrNoHeapPointers
     0.4s 10.0%  60.0%      0.6s 15.0%  encoding/json.Marshal
     ...
```

**`flat`** is the time spent in the function itself (not its callees).
**`cum`** is the time spent in the function plus everything it calls. A
function with high `flat` is doing expensive work directly. A function with
high `cum` but low `flat` is calling expensive functions — the bottleneck
is in one of its callees.

The pattern to look for: **high `cum` with low `flat`**. That means the
function is slow because something it calls is slow. Drill down with
`list <function>` to see which line:

```
(pprof) list json.Marshal
Showing nodes accounting for 0.6s, 15% of 4s
Total: 4s
ROUTINE ======================== in encoding/json
     0.4s   0.4s (flat, cum) 10.0% of Total
         .          .    87:   e.init()
         .          .    88:   e.p = e.pretty
     0.4s   0.4s    89:   e.reflectValue(v, encOpts{escapeHTML: true})
```

Line 89 — `reflectValue` — is where the time goes. You're spending 10% of
total CPU time in JSON reflection. The fix: reduce the amount of data
you're marshaling, or use a faster JSON library like `json-iterator` or
`sonic`.

## Reading a memory profile

A heap profile shows where your program allocates memory. The interactive
commands are the same — `top`, `list`, `web` — but the numbers mean
something different:

```
(pprof) top 10
Showing nodes accounting for 128MB, 64% of 200MB
      flat  flat%   sum%        cum   cum%
    64MB 32.0%  32.0%     64MB 32.0%  github.com/company/service/models.(*Order).ToJSON
    32MB 16.0%  48.0%     32MB 16.0%  database/sql.(*DB).Query
    16MB  8.0%  56.0%     16MB  8.0%  fmt.Sprintf
```

**`flat`** here is bytes allocated, not time. The function at the top
(`ToJSON`) allocates 64MB — half your total heap. Drill down:

```
(pprof) list ToJSON
     64MB   64MB    42:   func (o *Order) ToJSON() []byte {
         .      .    43:       data, _ := json.Marshal(o)
         .      .    44:       return data
```

Every call to `ToJSON` allocates a new byte slice via `json.Marshal`. If
you're marshaling thousands of orders per request, that's a lot of
short-lived allocations that the garbage collector has to clean up. The fix:
reuse buffers with `sync.Pool`, or stream the JSON instead of materializing
the whole thing in memory.

### In-use vs. alloc

The heap profile has two views: **in-use** (what's allocated right now) and
**alloc** (what was allocated since the program started). Switch between
them:

```
(pprof) alloc_space      # total allocated since start
(pprof) inuse_space      # what's live right now
```

A function that shows up in `alloc` but not `in-use` allocates a lot of
memory that gets garbage collected quickly. That's a GC pressure problem,
not a memory leak. A function that shows up in `in-use` allocates memory
that never gets freed — that's a leak.

## Reading a goroutine profile

A goroutine profile shows every live goroutine and where it's blocked:

```
(pprof) top 10
1008 @ 0x43e236 0x40a3c5 0x40a3c5 0x46f8a5 0x4712b8 0x6d3f1a 0x472160
#   0x6d3f1a  database/sql.(*DB).Query+0x13a    /usr/local/go/src/sql/sql.go:1924
#   0x472160  service.(*OrderService).GetOrders+0x40  /app/service/orders.go:87
```

If you see hundreds of goroutines all stuck in the same place — say,
`sql.(*DB).Query` — you have a database connection pool exhaustion problem.
Your goroutines are all waiting for a database connection that isn't
available. The fix: increase the pool size, or find the query that's holding
connections open too long.

If goroutine count is growing over time (collect two profiles a minute apart
and compare), you have a goroutine leak — goroutines that are spawned but
never finish. The goroutine profile shows where they're stuck, which tells
you why they're not finishing.

## The practical workflow

Here's the actual process when your service is slow:

1. **Collect a CPU profile** while the service is slow. Hit the pprof
   endpoint, wait 30 seconds, download the profile.

2. **Run `top 20`** to see the top consumers. Look for functions with high
   `cum` — those are the bottlenecks.

3. **Drill down with `list`** to see which line in the function is
   expensive. Is it a database call? A JSON marshal? A regex? A lock?

4. **Fix the specific thing** that's slow. Not "rewrite the service." Not
   "add a cache." The specific function, the specific line.

5. **Collect another profile** after the fix to verify it actually helped.

The most common mistake: optimizing the wrong thing. You see "30% in
`runtime.mallocgc`" and think "GC is slow." But `mallocgc` is high because
you're allocating too much — the fix isn't faster allocation, it's fewer
allocations. Find what's allocating (the `alloc_space` profile), not what's
collecting.

> The second most common mistake: profiling in development instead of
> production. A CPU profile under no load tells you where your program
> spends time when nothing is happening. Profile under real traffic to find
> the real bottlenecks. The pprof endpoint on localhost is safe for
> production — just don't expose it publicly.

## A worked example: finding a quadratic loop

MusicCorp's order summary endpoint takes 2 seconds for 1,000 orders and 20
seconds for 10,000 orders. That's quadratic — doubling the input quadruples
the time.

CPU profile:
```
(pprof) top 5
     8.0s 40.0%  40.0%      8.0s 40.0%  service.(*OrderSummary).buildIndex
     4.0s 20.0%  60.0%      4.0s 20.0%  runtime.makeslice
```

Drill down:
```
(pprof) list buildIndex
     8.0s   8.0s    31:   for i, order := range orders {
     0.0s   0.0s    32:       for j, other := range orders {
     8.0s   0.0s    33:           if order.CustomerID == other.CustomerID {
     0.0s   0.0s    34:               index[order.CustomerID] = append(...)
     0.0s   0.0s    35:           }
     0.0s   0.0s    36:       }
```

Lines 32-36: a nested loop comparing every order to every other order.
That's O(n²). The fix: build the index with a single pass using a map:

```go
for _, order := range orders {
    index[order.CustomerID] = append(index[order.CustomerID], order)
}
```

Single pass, O(n). 20 seconds becomes 200 milliseconds. The profile told
you exactly where the problem was — no guessing required.

---

`pprof` is the tool that turns "the service is slow" into "line 33 in
`buildIndex` is an O(n²) nested loop." It's built into Go, it works on
running services with zero code changes (via the HTTP endpoint), and it
takes thirty seconds to collect. The next time something is slow, reach for
the profile before reaching for the keyboard.

If you're interested in seeing how profiling works at a lower level —
reading binary output, tracing execution without source code — check out
the [reverse engineering series]({{< ref "how-i-started-learning-reverse-engineering" >}}), which covers Ghidra, GDB, and binary
analysis.

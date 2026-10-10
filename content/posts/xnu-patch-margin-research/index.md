---
title: "Read the Fix First: A Patch-Margin Method for XNU Research"
date: 2026-10-09T09:30:00+07:00
draft: false
tags: ["ios", "reverse-engineering", "apple", "xnu", "vulnerability-research"]
summary: "A source-first method for Apple kernel research: diff consecutive XNU tags, mine the regression tests that ship with the fixes, map sibling call sites, and rank candidates by how well they survive Memory Integrity Enforcement. Four evidence gates, a safe workflow, and the stop conditions that keep this work honest."
---

Most people who want to find bugs in Apple's kernel start by pointing a
fuzzer at a device, or by dragging a kernelcache into a decompiler and
hunting for "obvious" looking mistakes. That path burns weeks, produces
mountains of crashes that are not bugs, and cannot run at all on the
hardware most of us own. This post describes the path I actually took for
the current wave of research: read the fix first.

The premise is simple and a little counterintuitive. Apple ships security
fixes continuously, and XNU is open source [1][2]. When a fix lands, it arrives
next to a regression test that describes, in plain language, the bug that
was just closed [1]. That test is a compressed vulnerability report. If you
read it carefully, you learn the exact invariant that was missing, the
attacker-controlled input that crossed it, and the subsystem that had to
change. Then you ask the two questions that turn a fix into research: did
this fix reach every sibling call site, and can the same class of mistake
survive in a system that now enforces memory tagging?

This is Part 3 of a series on iOS architecture and reverse engineering. If
you have not read [Part 1: iOS Architecture, from Sandbox to Secure
Enclave]({{< ref "ios-architecture-from-sandbox-to-secure-enclave" >}}),
start there for the trust-boundary map, because every candidate below is
anchored to a boundary in that post. [Part 2: Reversing the Mach-O and the
dyld Shared Cache]({{< ref "ios-reversing-mach-o-dyld-shared-cache" >}})
covers the static toolchain for binaries that have no source. This part
covers what you do when source exists, and the source is the most valuable
artifact you have.

If the source-first mindset is new to you, my [on-ramp notes on learning
reverse engineering]({{< ref "how-i-started-learning-reverse-engineering" >}})
cover the ground floor. The rest of this post assumes you are comfortable
reading C and following a caller chain.

## The thesis: the patch is the specification

A patch diff is a specification written after the fact. The author already
knows the exact invariant the code was supposed to hold, so the diff is a
minimal, precise statement of that invariant. You rarely get this much help
in security research.

There is a catch, and it is the whole reason this method produces results
and also produces false positives. A patch tells you what changed. It does
not tell you who can reach the changed code, whether the pre-fix behavior
was actually reachable by an attacker, or whether the fix is complete
across the rest of the codebase. Those are separate questions, and
conflating them is how people write reports that a triager closes in five
minutes.

So the method has two halves. The first half is mechanical: compare
consecutive release tags, extract changed validation code and new
regression tests, and rank them. The second half is analytical: for each
candidate, prove source, prove reachability, prove a state delta, and
prove the patch margin. Only the fourth gate is about the diff itself.

## What "patch margin" means here

"Patch margin" is the term I use for the space around a fix that was not
necessarily covered by it. When an engineer fixes a validation bug in one
function, three things are usually true:

- The same invariant exists in sibling functions that were not touched.
- The same pattern exists in other subsystems written by other people.
- The fix may be asymmetric, meaning one path was hardened and a parallel
  path was not.

The patch margin is not the patched code. It is the unpatched surface that
shares the patched code's assumptions. Concretely, the highest-value
question after reading any fix is not "what did they change" but "where
else does this same assumption live, and does that copy have the same
bug" [3].

A caution that keeps you honest: an asymmetric diff is not automatically a
missed patch. Two of the candidates below got *asymmetric* results from a
sibling audit, and both times the asymmetry was intentional and correct. You
have to read the sibling code, not just the diff hunk.

## The pipeline: compare, mine, rank

The mechanical half is a repeatable pipeline. It runs read-only against
public source and never touches a device.

### Step 1: compare consecutive tags

XNU tags look like `xnu-12377.101.15` and `xnu-12377.121.6` [1]. The build
train number is stable, and the suffix moves. Compare one train against the
next so you get a small, reviewable change set instead of the whole tree.

A GitHub compare between two tags is enough to start, and it returns a file
list with per-file addition and deletion counts plus patch hunks [1]. The
important field is whether the compare was truncated. A truncated compare
is an incomplete data set and any claim of "no sibling found" built on it is
unsound. In one of my own passes, a compare across four releases came back
truncated, so coverage of that window is unknown; the only honest move was
to mark it as a partial pass and not draw conclusions from the missing
region.

### Step 2: keyword-filter to a shortlist

The full file set is usually a few hundred files. Most of it is platform
bring-up, telemetry, or cleanup. Filter on the language of validation and
concurrency, then read the survivors.

```text
validation and boundary keywords:
  copyin, copyout, bounds, overflow, length, size, mask
concurrency keywords:
  lock, unlock, TOCTOU, race, atomic, seq
identity and lifetime keywords:
  ref, release, retain, lookup, zone_require, migrate
ipc keywords:
  ipc, mach_msg, voucher, port, policy
```

The filter is not a detector. It is a way to turn a 204-file change set into
a stack of about 80 files that deserve attention, which is a size you can
actually read.

### Step 3: mine the regression tests separately

Filter the same change set for test paths and read every added or changed
test. In a large Apple change window, the impl shortlist and the test
shortlist are different lists, and the test list is the more valuable one,
because each new test is a written description of a fixed defect.

### Step 4: rank by MIE survivability, not by severity claim

Order the shortlist by how likely the bug class is to matter on current
hardware, then by whether the changed code has attacker-controlled input [5].
The ranking table below is the output of this step for one real window.

The cell in that column is a judgement, so it needs a stated criterion rather
than an adjective. I score it on cost. A candidate that operates on a valid
allocation with the wrong type or the wrong authority needs no bypass at all,
which is why nearly every row is survivable; what separates the rows is the
question after that, whether the primitive the candidate needs is reusable
across unrelated bugs or specific to this one. A candidate that depends on an
exemption inside the tagging implementation is borrowing something Apple can
withdraw independently of the bug, and the kernel-side exemptions a tagging
implementation carries by design are worth reading in the original analysis
[7]. [Part 1]({{< ref "ios-architecture-from-sandbox-to-secure-enclave" >}})
works through the four questions in full.

## Regression tests are compressed bug reports

Here is the single highest-leverage habit in this method: when a fix ships
with a test, read the test comment before you read the implementation diff.
Apple's test comments are unusually direct. Three examples from a single
change window, all of them already fixed and shipped [1]:

A socket option test documents a missing domain check:

```c
/*
 * Regression test for SO_STATISTICS_EVENT missing a domain check.
 * The option could be called on PF_LOCAL sockets, so sotoinpcb()
 * cast a struct unpcb * to a struct inpcb *, producing a kernel
 * type confusion and an out-of-bounds heap read.
 */
```

A networking test documents an integer-overflow bounds check that a
previous "off-by-one fix" introduced:

```c
/* IPV6_CHECKSUM must reject negative offsets. An earlier fix changed
 * the bounds check in rip6_output() from (off + 1) to
 * (off + sizeof(uint16_t)), which let the value -2 pass, because
 * -2 + 2 == 0. */
T_EXPECT_POSIX_FAILURE(set_ipv6_checksum(s, -2), EINVAL, "...");
```

A System V message test documents a lock scope and a reuse race:

```c
/*
 * Test for msgctl(IPC_SET) TOCTOU race. The fix holds
 * SYSV_MSG_SUBSYS through copyin, consistent with how sysv_sem.c
 * and sysv_shm.c handle IPC_SET.
 */
```

Read those three comments and you already have three reusable audit
patterns: a missing type/domain guard, a bounds check that is wrong for
signed input, and a lock dropped across a user-memory copy. You did not
have to fuzz anything to learn them.

### Calibration controls: use fixed bugs to test your detector

The first two examples above are bugs that were already root-caused
elsewhere. They are not research leads. They are *calibration controls*.
Run your filter against a window that contains a bug you already understand
in full, and check that your filter surfaces it. If your scanner misses a
bug whose answer you already know, it will miss the bugs whose answers you
do not know. This is the cheapest possible test of a diff tool, and skipping
it is how people end up trusting a keyword grep that only ever finds
keywords.

## Sibling call sites: the real payoff

The reason to read the fix carefully is to find where the same invariant
lives elsewhere [3]. This is where the work stops being a literature review.

### Case one: System V IPC lock scope

The message-queue `IPC_SET` handler in `sysv_msg.c` had this shape before
the fix: take the subsystem lock, look up the object, drop the lock, copy
the new attributes in from user memory, retake the lock, then mutate the
saved object.

```c
/* pre-fix shape (paraphrased) */
SYSV_MSG_SUBSYS_LOCK();
msqptr = ...lookup...;
SYSV_MSG_SUBSYS_UNLOCK();      /* lock dropped here */
if (IS_64BIT_PROCESS(p)) {
    copyin(uap->buf, &tmpds, sizeof(tmpds));   /* user memory, slow */
}
SYSV_MSG_SUBSYS_LOCK();        /* object may have been freed/reused */
... mutate msqptr ...
```

Between the unlock and the relock, another thread can remove the queue with
`IPC_RMID` and a fresh allocation can land on the same slot. The mutation
then writes into a queue object that no longer represents the one that was
looked up. The fix keeps the lock held across `copyin()` and routes error
returns through the common unlock path.

The obvious sibling question is whether `sysv_sem.c` and `sysv_shm.c` have
the same drop-and-relock shape. I read all three, and they do not: the
semaphore and shared-memory handlers already hold their subsystem lock
across `IPC_SET` `copyin()` and mutation. So the message path was the odd
one out; the asymmetry was the original bug, and the fix removed it. That
audit result is boring, and a boring result that closes a candidate is a
success, not a failure. No new finding was claimed.

The same window also unified the sequence counter used to make IPC
identifiers unique. Each subsystem used to do its own bounded increment of
the `_seq` field; the head replaces all three with a shared helper,
`ipc_perm_seq_inc()`. Identifier reuse is exactly the mechanism that turns
a use-after-free from a crash into a controllable type confusion, so the
reuse semantics of every IPC object are worth understanding even when the
change itself is a cleanup.

### Case two: voucher attribute manager aliasing

An older window recovered a fixed voucher bug that is worth internalizing
as a pattern. `ipc_voucher.c` registered the same user-data attribute
manager for two different voucher keys, while both keys shared the same
hash bucket and element pool [4]. The result was cross-key deduplication: a
value stored under one key could be returned for another key, and the
per-namespace reference counts drifted out of sync. The recovered mechanism
included a reference-count desynchronization that could be driven to a
use-after-free by counter wraparound [4]. The head removes the second
registration entirely and adds a focused unit test.

The reusable detector pattern is not the voucher code. It is the question:
wherever two namespaces share a manager, a global pool, or a hash table,
check deduplication keys, per-namespace counters, release synchronization,
and wraparound. That pattern applies to any subsystem with "a pool and a
key", and you can search for it statically without a device.

### Case three: file-backed pager validation tuple

An earlier window added a cluster of checks around a dyld-backed pager and
the mapping syscall that creates mappings from it. Paraphrased, the new
validation covered:

```text
1. checked addition for file_offset + size
2. backing-object end-offset containment
3. writable mapping protection
4. file-backed object validation
5. shadow-chain consistency
6. copy-on-write strategy validation
7. a diagnostic counter per rejection class
```

The syscall in question is reachable from a local process, and the caller
controls region metadata, file offsets, addresses, and link-info buffers,
subject to code-signing, file-descriptor, and VM checks. This is a genuine
pre-fix validation boundary. It is also a *historical* one: the compared
head already contains the fixes, and no evidence in the source review
proved an unpatched current variant or a concrete end-to-end impact. The
value is the tuple itself. Any file-backed custom pager and any mapping
syscall should be audited against exactly those seven points, because the
tuple captures the ways a range-to-object mapping can go wrong.

### Case four: an address-domain classifier that did not pan out

Not every candidate survives. A VM change added a source-domain guard to a
copyin strategy selector:

```c
/* head: restrict the data-private classifier to kernel maps */
if (vm_kernel_map_is_kernel(src_map) &&
    kalloc_is_data_private((void *)src_start, len)) {
    return VM_MAP_COPYIN_STRATEGY_KERNEL_LARGE_BUFFER;
}
```

The pre-fix guard could classify a user-map address by numeric range alone.
Caller mapping showed that user maps and kernel maps both reach the shared
copyin infrastructure, which looked promising. But tracing it to the end,
the difference between the two paths is a kernel-buffer copy versus a
virtual copy, with MTE policy checks and map sanitization still in the path.
No permission grant, cross-map read, tag bypass, or user-controlled
kernel-map selection could be established. The correct call was to keep the
audit pattern and close the candidate. A source diff can look alarming and
still be semantic correctness work with no security consequence.

### Case five: resolution state that survives a retry

An earlier window changed how `vfs_lookup.c` initializes two locals,
`resolve_flags` and `resolve_prefix_len`. Before the change both were
initialized in their declarations. After it, both are assigned zero immediately
below the `vnode_recycled:` label, with a comment that states the reason
directly: the resolve states are reset so the resolve prefix path gets stripped
when lookup is retried because the vnode was recycled [1].

The mechanism is worth reading twice, because the defect is a property of
control flow rather than of the values. A declaration-level initializer sits
above the retry label, so the second pass over that code skips it and resumes
with the first pass's state. The same window also added enforcement for
`NAMEI_RESOLVE_BENEATH`, comparing `ISDOTDOT` resolution against the starting
directory and the mount point that covers it [1].

The reusable invariant is not specific to path resolution. Any routine that can
be re-entered through a label, a retry, or a loop has to re-establish its state
rather than resume it, and every value initialized above the re-entry point is
a value that survives it. Grep for the label, then list what is initialized
only once. Scope note: I verified this across the tags in that window, not on
the current development branch, where the surrounding code has been reworked
since.

## Bug classes that survive Memory Integrity Enforcement

Modern Apple silicon enforces memory tagging at a granularity that makes
classic cross-allocation corruption much harder [5][6]. A linear heap overflow into
an adjacent object often trips a tag mismatch before it does anything
useful. That changes the ranking, not the game. The bug classes that remain
durable are the ones that operate on a *valid* allocation, or that abuse
*logic* boundaries rather than spatial ones:

- **Intra-allocation type confusion.** A valid object is interpreted as a
  different type, so the tag is correct and the counter is balanced. The
  socket option example above is this shape: a UNIX-domain socket control
  block was cast to an internet-domain one.
- **Missing or wrong validation.** A check is absent, or is correct in
  intent but wrong for signed or negative input. The `IPV6_CHECKSUM` case
  is the second flavor.
- **Integer-overflow range checks.** Checked arithmetic is absent, so a
  computed bound wraps and a range check inverts. Look for `a + b` used as
  a length or an end offset without an overflow-safe helper.
- **Lock, copy, and TOCTOU races.** The lock is dropped across a slow
  operation, and the object is reused. The SysV message case is the
  template.
- **Incorrect trust-boundary assumptions.** A caller is assumed to be
  privileged, or a port right is assumed to carry an entitlement it does
  not. Toy demos and production bugs both live here.
- **Pager and copy-on-write invariants.** A mapping is believed to be
  private, or a backing range is believed to be contained, and one of those
  beliefs is false.
- **Authorization and entitlement asymmetry.** One code path checks a
  policy bit and a parallel path does not.

Notice that none of these require breaking a tag. They require the code to
hold a false belief about its own state. That is why reading the fix beats
fuzzing for this class of work: the fix states the belief that was wrong.

## The four evidence gates

Every candidate has to pass four gates before it is a finding. The gates are
sequential, they are cheap to fail, and most candidates fail at gate one or
two.

### Gate 1: source proof

The exact file, function, dataflow, and missing invariant. Not "this file
looks wrong". A sentence like:

> In `msgctl`, `SYSV_MSG_SUBSYS` is released before `copyin(uap->buf, ...)`
> and reacquired after, so `msqptr` can be freed and its slot reused before
> the mutation.

If you cannot name the file, the function, the input, and the invariant, you
do not have gate one.

### Gate 2: reachability proof

The caller, entitlement, sandbox, and affected versions. Who can invoke the
path, with which rights, from which context, and on which builds. For the
SysV message path this is a local unprivileged process calling a syscall.
For the dyld pager syscall it is a local process subject to code-signing,
file-descriptor, and VM checks. For an IOKit external method it is a
UserClient with a specific entitlement. Reachability is where most
"vulnerability" claims die, because a validation gap in code no attacker
can reach is a bug fix, not a security bug.

### Gate 3: state delta proof

A controlled, observable change in state that follows from the missing
invariant, demonstrated without harming anything. For a race, this is a
deterministic widening primitive showing the object identity changed across
the window. For a bounds bug, this is a value that should be rejected and is
not. This gate is where the VM and authorization requirements below bind
hard. On the primary workstation, gate three is a source-level or
harness-level argument, never a live trigger.

### Gate 4: patch proof

The root-cause fix and its coverage. The fix must actually address gate
one's invariant, and you must have checked the siblings. If the fix is a
band-aid over a symptom, the root cause is still reachable, and that is a
finding. If the fix covers the class, the candidate closes. Two of the
sibling audits above ended here with "no sibling gap found", which is a
valid and useful gate-four result.

The order matters. Doing gate four first is the classic mistake. A patch
diff alone never establishes reachability, and a diff plus a plausible
crash is not an impact.

## Candidate ranking in practice

This is the shape of the table the pipeline produces for one real window.
The point is not the specific rows. It is that each row carries a source
location, a bug class, an MIE-survivability judgment, a patch-margin
status, a reachability hypothesis, and a next check, so that a colleague can
disagree with any single cell.

| Candidate | Class | MIE survivable | Patch margin status | Reachability hypothesis | Next check |
|---|---|---|---|---|---|
| SysV message `IPC_SET` race | Lock/TOCTOU | Yes, object reuse | Fixed in head; sem/shm siblings audited, no gap | Local unprivileged syscall caller | Full pre/post diff; caller lifecycle; VM-only widening |
| Socket option domain check | Intra-allocation type confusion | Yes, valid allocation | Already root-caused elsewhere | Local unprivileged caller | Calibration control only; do not re-file |
| `IPV6_CHECKSUM` negative offset | Integer-overflow bounds check | Yes, logic only | Already closed | Local unprivileged caller | Calibration control only |
| Task token torn read | Race and token atomicity | Yes, logic only | Hardening in head; accessors now atomic | Not yet established | Find a caller-visible consumer of a torn token |
| IPC policy version bits | Caller-contract validation | N/A, not memory | Hardening; test added | Not attacker-reachable by itself | Classify as hardening and move on |
| Voucher key aliasing | Shared pool and counters | Yes, lifetime logic | Historical, fixed in head | Local IPC caller, historical | Reusable detector: shared manager across namespaces |
| dyld pager mapping validation | Pager and COW invariants | Yes, invariant logic | Historical, fixed in head | Local process, historical | Reusable tuple for other custom pagers |
| VM copyin address-domain guard | Trust-boundary classifier | N/A, no consequence found | Closed as non-finding | Reaches shared copyin, no impact proven | Keep classifier pattern; close candidate |
| `_zalloc_ro_mut` bounds overflow | Integer-overflow bounds check | Yes, but not standalone | Source-confirmed, needs primitive | Requires a separate stage-one primitive | Map all callers and preconditions; do not claim alone |

Two rows are calibration controls, three are hardening or already closed,
two are historical patterns, one is closed, and one is an existing lead with
live reachability evidence. That ratio is the honest picture. A good source
scan mostly produces closed candidates. The value is that the closed ones
give you a tested filter and a library of patterns, and the one live lead
gets a much sharper set of next steps than it had before.

## A safe research workflow

The method below is ordered so that no risky action happens before the cheap
evidence is exhausted. Every phase before the VM gate is read-only.

### Phase A: choose the boundary

Write one sentence on a sticky note:

> An unprivileged [caller] controls [input] crossing [boundary], and the
> callee assumes [invariant].

If you cannot fill in all four slots, keep reading source. Do not write a
trigger.

### Phase B: diff the fix

Compare adjacent tags. Read the regression test first. Identify the exact
invariant the fix adds. Search every sibling call site of the changed
function and every parallel implementation of the same operation. Check
whether the same manager, parser, allocator, or dispatcher serves more than
one namespace. Record each result, including the ones that close a
candidate.

### Phase C: apply the four gates

Walk gate one through gate four for each surviving candidate. Most die at
gate one or two. A candidate that reaches gate four is either a finding or a
closed audit, and both outcomes are written down.

### Phase D: only then, dynamic validation

Dynamic work happens inside the isolated VM below, never on the primary
host. Build the harness before you need it, run negative controls, measure
the win rate, and stop when the evidence is sufficient to write the report.
Publish the method and the negative results, not just the win.

The tradecraft here generalizes. A filter that ranks source changes by
mechanism, a regression-test miner, and a sibling-call-site audit checklist
are reusable across any open-source kernel, not just XNU.

## VM and authorization gates

This is where the work is allowed to stop being source review, and the
conditions are strict.

**Gate 0: environment baseline.** Confirm tool versions and the current
kernel build before anything else. Reconcile stale notes; a documented
environment drifts fast. Any proof-of-concept that can panic the kernel is
marked VM-only at the moment it is written, in the file, with the marker.

**Gate 1: isolated snapshot-backed VM.** Dynamic validation requires a VM
that boots reproducibly, accepts a cross-compiled probe, survives a
controlled crash with a snapshot restore, and can return kernel logs after
reboot. Pass criteria are explicit:

```text
- guest boots reproducibly
- a cross-compiled arm64 probe can be copied into the guest
- the guest can be restored after a controlled crash
- kernel logs are recoverable after reboot
- the host is never at risk
```

Until all four pass, no crash-capable or state-corrupting execution happens
anywhere. If the VM tooling is not installed, the honest status is "dynamic
validation blocked", and the response is more static work, not a workaround
on bare metal.

**Authorization.** Current retail-iOS kernel instrumentation requires a
legitimate Security Research Device, a Corellium account, or an
equivalent authorized environment. None of that is a formality. Without
it, iOS-specific dynamic work stays parked and the source track continues.
Do not spend on a paid isolated environment until the static pipeline has
produced a concrete candidate that actually needs dynamic validation. The
static pipeline is free, and it usually answers the question well enough to
rank the next candidate.

**Race reliability.** A stochastic race that cannot be widened
deterministically stays parked below the documented reliability threshold.
Running a million attempts on a host CPU is not a test; it is a coin flip
with a log file. A deterministic widening primitive, in an isolated VM, is
the bar.

## Stop conditions

These are the rules that keep the research honest and keep the machines
alive. They are not aspirational.

- Never execute a panic-capable proof-of-concept on the primary host.
- Do not run current retail-iOS kernel instrumentation without a legitimate
  SRD, Corellium, or equivalent authorized environment.
- Do not claim a vulnerability from a patch diff alone. The diff is gate
  four, not gate one.
- Drop ordinary cross-allocation overflow and use-after-free hypotheses that
  do not survive MIE analysis. If the tag check kills it, it is not a lead.
- Stop closed-source binary diffing after about four hours without a source
  or advisory anchor [2]. Static source work has a much higher hit rate for this
  class of bug; do not sink a day into a stripped binary that has no anchor.
- Park stochastic races below the reliability threshold unless a
  deterministic widening method exists.
- Treat a truncated compare as unknown coverage. Do not claim "no sibling"
  from an incomplete data set.
- Do not spend on a paid isolated environment before a concrete candidate
  needs it.

## What "read the fix first" actually buys you

The instinct most of us start with is to hunt a crash. The crash is a
terrible first artifact. It tells you that something is wrong, not what,
and it is expensive to obtain on hardware you are allowed to use. The fix
is a much better first artifact: it is small, it is written by someone who
understood the bug, it ships with a test that explains it, and it points you
at the sibling code you should read next.

For this research track, the source-diff and patch-margin method is the
primary route. iOS shared-cache and privileged-daemon IPC mapping is the
secondary, static route while a snapshot-backed VM is being built. Closed
source forks, retail jailbreak development, and broad fuzzing stay deferred
until the source track reaches a deliberate stop condition, because they all
require access that the source track does not.

The one thing to carry away: when you find a fix, do not stop at the hunk.
Read the test. Find the invariant. Then go look at every other place that
believes the same thing, and check whether it is still wrong. That is where
the bugs are, and the source is telling you where to look.

This post covers the method that needs nothing beyond a source tree. The last part of the series moves to the surface that needs almost nothing else either, and finds a different kind of boundary: [Part 4: The Reachable Surface]({{< ref "ios-webkit-and-app-layer" >}}) covers the browser's process split, what crosses between those processes, and the line between a check on the client and a decision on the server.

## References

[1] [apple-oss-distributions/xnu](https://github.com/apple-oss-distributions/xnu): canonical repository for Darwin XNU kernel releases, regression test suites, and security fix commit history.

[2] [Apple Security Releases](https://support.apple.com/en-us/HT201222): official catalog of security fixes, CVE mappings, and credit advisories across macOS and iOS versions.

[3] Project Zero, [0day Exploit Root Cause Analyses](https://googleprojectzero.blogspot.com/p/rca.html): canonical index of root-cause analyses, variant hunting methodology, and patch-verification write-ups for disclosed in-the-wild zero-days.

[4] Brandon Azad, [voucher_swap: Exploiting MIG reference counting in iOS 12](https://projectzero.google/2019/01/voucherswap-exploiting-mig-reference.html): technical breakdown of XNU Mach message handling, port rights, MIG stubs, and memory boundary verification.

[5] [Apple Platform Security Guide](https://support.apple.com/guide/security/welcome/web): architectural overview of kalloc type isolation, Pointer Authentication Codes, and hardware memory safety mitigations in contemporary Apple silicon.

[6] Apple Security Engineering and Architecture, [*Memory Integrity Enforcement: A complete vision for memory safety in Apple devices*](https://security.apple.com/blog/memory-integrity-enforcement) (Apple Security Research, 2025): Apple's own account of the tagging, hardened allocator, and pointer-integrity design that sets which bug classes stay profitable.

[7] Mark Brand, [*MTE As Implemented, Part 3: The Kernel*](https://projectzero.google/2023/08/mte-as-implemented-part-3-kernel.html) (Project Zero, 2023): the kernel-side exemptions a tagging implementation carries by design, including the dereference path that skips the tag check entirely.

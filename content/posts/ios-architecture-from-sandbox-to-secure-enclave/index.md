---
title: "iOS Is Not One Boundary: From App Sandbox to Secure Enclave"
date: 2026-10-07T10:00:00+07:00
draft: false
math: false
tags: ["ios", "reverse-engineering", "apple", "xnu", "security"]
summary: "A boundary-first map of the iOS stack, from app sandbox and XPC through XNU subsystems to PAC, SPTM, and the Secure Enclave, with the evidence gates I use before calling anything a finding."
---

I lost a weekend to a mistake that had nothing to do with my tools.

I had a system framework open in a disassembler, and `strings` handed me a Mach service name that looked like a door. I wrote a tiny client that called `xpc_connection_create_mach_service` with that name, ran it on a device, and got nothing back. No crash, no error I understood, no reply. My first conclusion was that I had the API wrong. My second conclusion, after I fixed the API, was that the daemon was broken.

Both conclusions were wrong. The connection was refused because the app sandbox profile for my process did not allow a connection to that service name at all. Even if the connection had succeeded, the daemon checked the caller's audit token and demanded an entitlement I did not hold. And even if I had held the entitlement, the daemon was not the component that made the final security decision: it forwarded the request to a second process with a narrower sandbox than either of us, and that process owned the actual policy check.

I had mapped a code path and called it a boundary. Those are different things.

```text
What I had:   string -> function -> plausible bug
What I needed: caller identity -> policy check -> port right -> state delta
```

This post is the map I should have drawn first. It is the opening of a series about reversing iOS, and the series starts here, with the shape of the system, rather than with a tool tutorial. Tools change with every release. Boundaries do not.

## What I actually got wrong

The weekend was not wasted because I used the wrong disassembler. It was wasted because of four assumptions, and I see the same four in other people's notes constantly.

1. **I treated a string as a capability.** A service name in a binary is a name. Whether a given process may resolve that name depends on policy that lives outside the binary, in a sandbox profile and in the daemon's own caller check.
2. **I treated a reachable function as a reachable boundary.** Static reachability means the code exists and has a path to it. It says nothing about which process, with which entitlements, under which sandbox, on which OS build, can arrive there.
3. **I treated the first privileged process as the decision maker.** In practice a request often crosses two or three processes, and the one that parses your bytes is frequently not the one that decides whether the operation is permitted.
4. **I treated a version number as a finding.** "This code looks wrong in build X" is a hypothesis. It becomes a finding only when you can name the caller, the policy, and the state that changes.

None of that is exotic. It is just the ordinary cost of skipping the architecture.

## Why this series starts with boundaries, not tools

There is a version of security writing that begins with a command line and ends with a shell. It reads well and teaches very little, because the interesting part of every real result is the part that comes before the tool runs: deciding what to point the tool at.

The argument I made in [The Renaissance Developer]({{< ref "the-renaissance-developer" >}}) applies directly here. When syntax becomes cheap, the value moves to systems synthesis: knowing how one change propagates through layers that were designed by different teams at different times. A security result is exactly that kind of synthesis. A single attacker-controlled length field can travel through an Objective-C method, an XPC encoder, a Mach message descriptor, a MIG stub, a `copyin` boundary, a kernel zone allocator, and a hardware tag check, and the answer to "is this a bug" is determined by which of those layers trusts the one before it.

If you do not know where the layers are, you cannot know where the trust ends. So the series begins with the stack, then narrows. Part 2 takes the Mach-O format and the dyld shared cache, because that is how the code of every layer above the kernel is actually delivered and how you enumerate it. Part 3 takes XNU source diffing, because on Apple platforms the most reliable way to find a real boundary error is to read the patch that fixed one. This post is the frame both of those hang on.

## One stack, many boundaries

The mental model I use now is a stack of layers, each with its own notion of who is allowed to ask for what.

```text
App / extension
    |  Objective-C, Swift, C/C++, entitlements, sandbox profile
Frameworks and services
    |  XPC, Mach messages, shared memory, file and network APIs
Userland daemons
    |  launchd, sandbox profiles, TCC, code signing, IPC endpoints
Kernel / XNU
    |  Mach, BSD, IOKit, VM, networking, filesystems, IPC
Hardware and security monitors
    |  ARM64, PAC, memory tagging, SPTM, SEP, boot chain
```

| # | Layer | What lives there | Boundary it enforces | Evidence artifact | Assumption that fails |
|:--|:------|:-----------------|:---------------------|:------------------|:----------------------|
| 1 | App and extension | Your process, its container, its extension points | Which files, services, and user data the process may touch | `Info.plist`, entitlement blob, container layout | "The app can reach anything the framework can reach" |
| 2 | Frameworks | System and third-party libraries linked into the process | API contract and in-process memory safety only | Mach-O load commands, exported symbols, Objective-C metadata | "Framework code runs with framework privileges" |
| 3 | XPC and Mach IPC | Named services, endpoints, message transports | Which callers may connect and which port rights they hold | Service names, MIG handler tables, message layouts | "A service name is a permission" |
| 4 | Privileged daemons | `launchd`-managed processes with narrow sandboxes | Caller authentication, authorization, request shape | Audit token checks, entitlement tests, daemon sandbox profile | "The parser is the policy owner" |
| 5 | Sandbox and TCC | Policy engine plus per-resource consent database | Resource access by process, and user-visible consent for sensitive data | Sandbox profile, TCC database entries, purpose strings | "Sandbox and entitlements are the same mechanism" |
| 6 | Code signing | Signature, entitlements, trust cache, execution policy | What may execute and which entitlements are honored | Code directory, entitlements, trust cache entry, AMFI policy | "A valid signature implies a trusted process" |
| 7 | XNU | Mach, BSD, VM, IOKit, networking, filesystems | User and kernel address spaces, syscall and IPC contracts | Source file, function, dataflow, lock and copy ordering | "The kernel is one bug surface" |
| 8 | Hardware monitors | ARM64 exception levels, PAC, memory tagging, SPTM, SEP | Integrity of control flow, memory, and secrets below software | Architecture manual, boot measurements, protected memory policy | "Software-only bugs still pay the same" |

Read the table top to bottom as a sequence of trust handoffs, and bottom to top as a sequence of policy enforcement. Both directions matter. When you find something that looks wrong in layer 7, the question that decides whether it is a finding is almost always answered in layers 1 through 5.

## The app and extension boundary

An iOS app is not a process with a user account. It is a process with a container, a code signature, a set of entitlements, and a sandbox profile, and all four are decided before `main` runs [1].

The extension model adds a second, subtler boundary. Extensions share the containing app's signature and often share an app group container, but they run as separate processes with their own sandbox profiles and their own lifecycle. A shared container is a data channel between two processes that were written by the same team and are still subject to different policy. When you audit one, list what the container exposes, which side writes each file, and whether either side validates what it reads.

The practical question at this layer is never "what can this app do." It is "what can this app do that the attacker in this threat model cannot already do." That reframing kills a large fraction of bad reports.

## Frameworks: where the API contract stops being the security contract

A framework linked into your process executes in your process. That sentence has two consequences people forget in opposite directions.

First, framework code cannot grant you privilege. If a framework method reads a file, it reads it as your process, subject to your sandbox and your entitlements. A framework that appears to "have access" to something is usually just a client of a daemon that does.

Second, in-process framework code is attack surface for your process, not for the system. A memory corruption bug in a parser that runs inside the app is an app bug until you can show that attacker-controlled input reaches it across a boundary the attacker does not already control.

This is also where static analysis gets useful fastest. Mach-O load commands tell you what a binary depends on, Objective-C metadata tells you what it exposes, and symbol exports tell you what other components expect from it. Part 2 goes deep on that representation, because on modern systems most of these libraries do not exist as separate files on disk at all.

## XPC and Mach IPC: rights, not names

Underneath XPC is Mach IPC, and Mach IPC is a capability system wearing a messaging API.

A Mach port name is a local index into a task's port namespace [2][5]. What you can do with it depends on the right you hold: send, receive, send-once. Two processes can both name the same underlying port and have completely different powers over it. That is why "I found the service name" and "I can send to the service" are different claims, and why "I can send" and "I can receive a reply" are different claims again.

```c
typedef struct {
    mach_msg_bits_t    msgh_bits;
    mach_msg_size_t    msgh_size;
    mach_port_t        msgh_remote_port;
    mach_port_t        msgh_local_port;
    mach_port_name_t   msgh_voucher_port;
    mach_msg_id_t      msgh_id;
} mach_msg_header_t;
```

Every one of those fields is a place where a validation error can become a boundary error. `msgh_size` is attacker-controlled and drives how much data the receiver trusts. `msgh_bits` carries the disposition of port rights, including send-once, which moves a right rather than copying it. `msgh_id` selects the handler, and on the kernel side that handler is usually a MIG-generated stub that converts a wire structure into a kernel structure [2][5]. `msgh_voucher_port` ties the message to a voucher, which is a lifetime and accounting object in its own right [2].

XPC wraps this in a friendlier API and adds serialization, but the underlying questions do not change: who may connect, what right do they hold, what does the receiver assume about the sender, and what does the parser assume about the bytes.

## Privileged daemons and launchd

Most of the interesting policy on iOS is enforced in userland, by daemons that `launchd` starts with a fixed identity, a fixed sandbox profile, and a fixed set of entitlements [5]. Those daemons are the bridge between an app's narrow world and system resources: files, credentials, protected user data, network configuration, device state.

When I map one, I write six lines before reading any code.

```text
1. Process identity and entitlements
2. Sandbox profile
3. Mach service name or XPC endpoint
4. Accepted request shape
5. Caller authentication and authorization
6. Sensitive operation or returned data
```

If line 5 is missing or vacuous, that is the finding shape. If line 5 exists and checks an audit token, an entitlement, and a request field, then the interesting question moves to whether all of those checks cover all of the paths, including the error paths, the retry paths, and the paths added by the most recent release.

## Sandbox, TCC, and entitlements are three mechanisms

These three get collapsed into one idea in casual writing, and that collapse causes real analytical errors.

| Mechanism | Enforced by | Answers | Failure looks like |
|:----------|:------------|:--------|:-------------------|
| Sandbox profile | Policy engine, per process | Which resources and services this process may reach | A denied connection or a denied file open |
| Entitlement | Code signing plus runtime checks | Which capabilities this signed binary may claim | A capability check that fails despite a valid signature |
| TCC | Consent database plus per-resource policy | Whether the user has authorized access to a protected resource | A prompt, or a denial with no prompt |

They interact. An app with the right entitlement still needs a sandbox allowance to reach the daemon that serves the resource, and the daemon still needs a TCC authorization on the user's behalf [1]. A bug that lets you skip one of the three is not the same as a bug that skips the others, and reporting one as the others is a common way to be wrong in public.

## Code signing decides what may run at all

Before any of the policy above applies, the system decides whether a binary may execute and which of its entitlements are honored. Signature validity, entitlement contents, platform binary status, library validation, and dynamic code exceptions are separate properties, and a malformed signature is not automatically a bypass [1]. The question is always where the decision is made, which artifact the attacker controls, and whether the decision happens before or after attacker-controlled parsing.

## XNU is four subsystems wearing one name

XNU looks monolithic from the outside and is not, from the inside. Splitting it is the difference between a research plan and a random walk.

| Subsystem | Owns | What I read first |
|:----------|:-----|:------------------|
| Mach | Tasks, threads, ports, messages, exceptions, vouchers, VM primitives | Message descriptor validation, port-right transitions, MIG handler conversion |
| BSD | Syscalls, credentials, processes, filesystems, sockets | `copyin` and `copyout` ordering relative to locks, object reuse, descriptor lifetime |
| VM | Maps, objects, pages, copy-on-write, pagers, protected memory metadata | Range arithmetic, user versus kernel map classification, shadow-chain and pager invariants |
| IOKit and DriverKit | Kernel object and UserClient dispatch, user-space drivers | External method dispatch tables, scalar versus structure sizes, entitlement checks |

Two examples from my own recent work show how the subsystem choice changes the evidence you need.

A SysV message control race in `bsd/kern/sysv_msg.c` dropped the subsystem lock across a `copyin` and then mutated a queue object that could have been reused [2]. The evidence that matters is not "there is a race here." It is the exact lock scope before and after, the reuse window, and the caller context. The same file also demonstrates the value of sibling checks: the semaphore and shared memory `IPC_SET` paths already held their locks across the same copy, which turns the message path from a hypothesis into an asymmetry you can state precisely.

In the VM subsystem, a guard on the copyin strategy selector classified address domains by numeric range before checking whether the map was a kernel map. Reading the caller graph showed that user maps and kernel maps both reach the shared infrastructure, but that the observed difference was a kernel buffer copy versus a virtual copy. No permission grant, no cross-map read, no tag bypass followed from it. The honest classification was hardening, not a vulnerability, and the reusable output was the audit pattern for address-domain classifiers.

Both stories have the same shape: the subsystem tells you which invariant to check, and the evidence gate tells you whether the check failed in a way that matters.

## Hardware security: PAC, MIE, SPTM, SEP

Modern Apple silicon moves a meaningful share of integrity enforcement below the kernel, and that changes which bugs are worth chasing.

- **Pointer authentication (PAC)** makes control-flow targets hard to forge by signing pointers with a per-context key and validating on use [4]. It raises the cost of the classic "overwrite a return address" primitive.
- **Memory Integrity Enforcement (MIE)**, built on memory tagging, targets use-after-free and cross-allocation corruption by tagging allocations and checking tags on access [1][4]. Its practical effect is to devalue bugs that operate on the wrong object of the right type at the right time.
- **SPTM**, the system page table monitor, protects kernel page tables and related state from kernel software itself, which turns some "kernel writes a page table" primitives into dead ends [1].
- **SEP**, the Secure Enclave, holds keys and performs operations that software cannot observe, which moves whole classes of key-extraction work out of reach of ordinary reversing [1].

The consequence for research is a change in target selection, not a change in method. If tagging kills cross-allocation corruption, the durable classes are intra-allocation type confusion, missing or wrong validation, integer overflow in range arithmetic, lock and copy ordering races, and authorization asymmetry between two paths that should agree. Those are exactly the classes that a boundary map helps you find, because they are defined by an invariant that a caller and a callee disagree about.

## Boot trust: the chain that establishes everything above

Everything above rests on a boot sequence in which each stage authenticates the next, starting from hardware-anchored trust that software cannot rewrite [1]. For most independent work the useful part of that chain is not the cryptography but the policy handoff: which component consumes attacker-controlled metadata, at what point in the sequence, and whether the decision is made before or after that metadata is parsed. The same question appears at every layer of this post, which is why the boot chain belongs in the frame even when it is not the current target.

## The one sentence that starts every investigation

I do not start a proof of concept until I can write this sentence without hedging.

> An unprivileged **caller** controls **input** crossing **boundary**, and the callee assumes **invariant**.

For the failed weekend, the sentence would have been: an unprivileged app controls an XPC request crossing the sandbox connection boundary, and the daemon assumes the caller holds an entitlement. Writing it would have told me in one minute that I needed to check the sandbox profile and the entitlement, and that the parser I was reading was not where the decision lived.

If the sentence cannot be written, keep reading. That is not a delay. It is the work.

## The evidence checklist

Before I call anything a finding, I want four gates satisfied and four safety conditions respected.

1. **Source proof.** Exact file, function, dataflow, and the specific invariant that is missing or wrong. Not a suspicious pattern. Not a function name. The invariant.
2. **Reachability proof.** Which caller, with which entitlement, under which sandbox, on which version, arrives at the code. If the caller is the kernel itself, say so and say why an attacker gets to be that caller.
3. **State-delta proof.** A controlled, preferably non-destructive, isolated observation that the state actually changes in the direction claimed. Static reasoning produces candidates, not proof.
4. **Patch proof.** For a fixed issue, the root-cause change and whether every sibling call site received the same treatment. A fix that covers one of three consumers is itself a finding.

And the safety conditions, which are not optional and are not negotiable:

- No panic-capable or state-corrupting test on a machine I depend on. Validation happens in a snapshot-backed virtual machine or on an authorized isolated device, and the machine is restorable afterward.
- No instrumentation of current retail devices without explicit authorization for that environment [3].
- No claim of a vulnerability from a patch diff alone. A diff tells you a fix exists. It does not tell you the unpatched version is reachable.
- No spending on external validation infrastructure until static work has produced a concrete candidate that actually needs dynamic confirmation.

The gates are boring. They are also the reason a candidate that survives them is worth reading.

## Why memory integrity enforcement changes the target list

A decade ago, the highest-yield kernel bug was cross-allocation corruption: overflow into a neighbor, use-after-free of a recycled object, a write through a stale pointer. Tagging and protected allocators cut directly into that class, which means the marginal value of another such hypothesis is falling.

The classes that survive are the ones where the allocation is valid and the type or the authority is wrong:

- Type confusion inside a single allocation
- Missing or incorrect validation of a caller-supplied field
- Integer overflow in a bounds or range computation
- Lock, copy, or time-of-check ordering races
- Trust-boundary assumptions where two components disagree about who checked what
- Pager, copy-on-write, and shadow-chain invariants
- Authorization asymmetry between two paths that should enforce the same rule

Notice that six of the seven are described by a boundary and an invariant rather than by a memory primitive. That is the argument for this post existing first.

## How this series is laid out

- **Part 1 (this post):** the stack and its boundaries. What trusts what, and what evidence you need before you claim a crossing.
- **Part 2:** [iOS Reversing: Mach-O and the dyld Shared Cache]({{< ref "ios-reversing-mach-o-dyld-shared-cache" >}}). How the code of layers 1 through 4 is actually stored, how to enumerate it from an authorized system artifact, and how to map a service to its callers without a debugger.
- **Part 3:** [XNU Patch-Margin Research]({{< ref "xnu-patch-margin-research" >}}). How to read Apple's own fixes as a research signal, how to separate hardening from a reachable bug, and how to keep a candidate queue honest.

Read in order, they go from the shape of the system, to the representation of the code, to the discipline of the evidence. Read individually, each stands alone.

## The point of the map

The weekend I lost was not about a disassembler. It was about drawing the wrong diagram. I had the code in front of me and no picture of who was allowed to reach it, so every conclusion I drew was one layer too shallow.

iOS is not one boundary. It is a stack of them, each with its own policy owner, its own evidence artifact, and its own way of failing quietly. The useful skill is not knowing a tool. It is being able to point at any line of code and say which boundary it sits behind, who controls the input, and which layer is the one that actually decides.

Start at the boundary, follow the data path down, and only then choose the tool.

## References

[1] [Apple Platform Security Guide](https://support.apple.com/guide/security/welcome/web): official architecture specification covering the Secure Boot chain, Secure Enclave Processor (SEP), Secure Page Table Monitor (SPTM), and app sandbox model.

[2] [apple-oss-distributions/xnu](https://github.com/apple-oss-distributions/xnu): canonical Apple open-source repository containing Mach IPC, BSD system call layers, and virtual memory manager sources.

[3] [Apple Security Research](https://security.apple.com/): documentation on Apple's Security Research Device (SRD) program, security bounties, and research disclosure posture.

[4] [Arm Architecture Reference Manual for A-profile Architecture](https://developer.arm.com/documentation/ddi0487/latest): hardware specifications for Exception Levels (EL0 through EL3), Pointer Authentication Codes (PAC), and memory tagging extensions.

[5] Jonathan Levin, [*Mac OS X and iOS Internals: To the Apple's Core*](http://newosxbook.com/): architectural reference on Mach messaging, MIG stubs, launchd daemon initialization, and sandbox container profiles.

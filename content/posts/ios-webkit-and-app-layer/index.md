---
title: "The Reachable Surface: WebKit and the App Layer"
date: 2026-10-10T09:30:00+07:00
draft: false
tags: ["ios", "reverse-engineering", "apple", "webkit", "security"]
summary: "WebKit and the app layer are the Apple surfaces you can actually study without a research device. How the browser's processes are isolated from each other, what crosses between them, and where a third-party app's own checks sit relative to the server's."
---

The first three parts of this series are about boundaries you mostly cannot touch. The kernel track needs
a research device or an authorized runtime before anything can be validated, and the shared-cache track
is static by necessity. That is honest, and it is also a poor place to start if you want to find
something this month.

The reachable surface is one layer up. A browser engine and a third-party app both run on hardware you
already own, and both are structured around boundaries that are documented, observable, and testable
without an authorization you do not have [1][5].

There is a trap in that sentence, and it is the reason this post is the last one rather than the first.
The reachable surface is not one boundary either. A browser is several processes talking to each other,
and a third-party app is a client talking to a server that makes the decisions. If you treat "the app
layer" as a single thing to attack, you will spend your time on the half of it that cannot matter.

> **The Core Takeaway:**
> WebKit is not one process and a third-party app is not one program. The browser splits the web page,
> the interface, and the network into separate processes with separate sandboxes, and everything
> interesting happens in the messages between them. In an app, the interesting split is between the
> check you can read on the client and the authorisation that actually decides, which lives on the
> server.

## Two boundaries that are not the same boundary

The browser and the app are both "userland", and that is where the resemblance ends. They fail in
opposite directions.

```text
Browser (WebKit)                          Third-party app
  UIProcess (the app you see)               App process (sandboxed)
      |  constrained IPC                        |  HTTPS
  WebContent (page, strictest sandbox)       Server (owns the decision)
      |  constrained IPC
  Networking (sockets, TLS)
```

In the browser, the split exists to contain the untrusted content: the code that parses a web page gets
the least authority, and the code that owns the windows and the filesystem gets more [1]. Since site
isolation, that split goes further, because a cross-site frame can be given a process of its own rather
than sharing one with the page that embedded it [2]. In an app, there
is no such split inside the process; the app has whatever its entitlements and its sandbox profile
allow, and the meaningful authority boundary is off-device entirely.

That difference decides what you are looking for.

| | Browser | Third-party app |
|:--|:--|:--|
| What is untrusted | The web content | The user, the network, the deep link |
| Where the authority is | The process with more privilege | The server |
| What a static read gives you | Message shapes, parser structure, sandbox reach | Surface inventory, check placement, client assumptions |
| The classic mistake | Treating reachable code as a reachable boundary | Treating a client-side check as authorisation |

Both mistakes are the same mistake as Part 1: mistaking a path you can see for a path you can take.

## What crosses the WebKit process boundary

The page process does not draw anything and does not own the window. It hands the interface process a
stream of structured messages: a request to navigate, a hit test result, a drag event, a form
submission, a clipboard write, a serialised DOM node. The interface process hands back the answers.

That makes the boundary a parser, and a parser is where a wrong assumption becomes a bug. WebKit's own
IPC guidance states the assumption plainly: the content process is treated as compromised at all times,
and every receiving side is expected to validate what it is handed rather than trust the sender [3].
The message
that carries "here is the data you asked for" is as much an attack surface as the HTML that produced
the request, because the receiving side has to decide how much to trust the sender.

Three shapes are worth naming, because they recur:

- **Typed serialisation with a fixed schema.** The receiver rebuilds a structure from bytes. The bug is
  a field that the sender can put a value in which the schema does not allow, and the receiver does not
  re-check.
- **Handles and identifiers instead of objects.** The receiver is given a name or an index and must
  resolve it in its own table. The bug is a lifetime mismatch: the entry was valid when the message was
  sent, and is not when it is handled.
- **Reply routing.** A response has to be matched to the request that caused it. The bug is a reply
  that lands on the wrong requester, or not at all.

None of these is exotic. They are the ordinary consequences of splitting one program into two programs.
The in-the-wild chains that climb from the page process to a more privileged one are assembled from
exactly these pieces [8].

## The engine itself, and why the bug classes differ inside it

WebKit's engine is two engines wearing one name. The JavaScript engine owns language semantics,
execution, and its own just-in-time compilation. The layout and DOM engine owns parsing, style, layout,
and the browser's object model.

The bug classes are not the same on both sides.

| Engine part | Dominant surface | Attractive bug shapes |
|:--|:--|:--|
| JavaScript execution | The language, the optimiser, the JIT | Type confusion between an optimised and a deoptimised view of the same value, bounds arithmetic in a compiled fast path, incorrect speculation about a value's representation [4] |
| DOM, CSS, HTML parsing | Structured text into objects | Lifetime and ownership across the API boundary, reentrancy while a node is being built, a structure that is legal to parse and illegal to hold [9] |
| IPC serialisation | Bytes into typed messages | A field the schema does not permit, a missing re-check on the receiving side [3] |

The pattern across that table is the same one Part 3 argues for at the kernel: the durable bugs are the
ones where a valid allocation or a valid object is interpreted under a wrong belief, not the ones that
walk off the end of a buffer.

One property of the engine is worth calling out, because it changes what you are looking at. A
just-in-time compiler has to write machine code and then execute it, so the engine needs an executable
mapping, which means the platform has to permit one. On iOS that permission is a dynamic code signing
entitlement rather than a default [5], and the hardware constrains the transition instead of allowing a
page to be writable and executable at the same time [6]. The JIT region is therefore the most
interesting memory in the process, because it is the only part of the address space that gets to be code
the app did not ship with.

It is also the first thing a defense removes. Lockdown Mode disables the JIT in WebKit along with the
more complex rendering paths, which takes the optimiser's entire bug class off the table for the users
who enable it [7]. That is the Part 1 point about scoring a mitigation in practice: the cheapest way to
delete a class of bugs is to delete the feature that creates them.

## The third-party app, statically

An app you did not write is a directory of readable structure. Part 2 covers the file format in full;
here is what is specific to a shipping app [10].

| Artifact | What it tells you | What it does not |
|:--|:--|:--|
| Mach-O and embedded frameworks | Which code ships, which architectures, which third-party SDKs are inside | Which code the server will let you reach |
| Entitlement files and `Info.plist` | Which capabilities and URL schemes the app declares, and what the system will hand it | Whether the code checks anything after receiving it |
| Deep links and universal links | The entry points that accept data from outside the app | Whether the handler validates before acting [12] |
| Embedded `WKWebView` and native bridges | Where a JavaScript string becomes a native call | Whether the bridge constrains what it is handed [11] |
| Bundled JavaScript and configuration | Endpoints, feature flags, client-side gating | What the server enforces independently |

The last column is the whole point. A static read of an app gives you a map of where a check *could* be
bypassed on the client, and the answer to whether that matters is almost always a question about the
server.

## The split that decides most findings

Client checks and server checks are not two implementations of one rule. They are usually two different
rules, and only one of them is authoritative.

```text
What the client does            What the server must do
  hide the button                 refuse the request
  disable the menu item           check the caller's right
  gate the screen                 validate the object's owner
  mark the field read-only        reject the field
  compute a "role" locally        derive the role from the session
```

Hiding a control is a user interface decision. If the server also derives its answer from what the
client sent, then the interface decision *is* the security decision, and that is the finding [13]. If the
server ignores what the client sent and derives the answer from the session, then the client-side check
is a hint and nothing else.

So the method is boring and it is the whole job: for each trust-relevant decision you can see on the
client, ask what the server does when the request arrives without it. That question is answered by
observation against an account you are authorized to use, not by decompilation, and it is a separate
piece of work from the static pass.

## What static work cannot establish

Being precise about this is what keeps the previous section from turning into speculation.

- **Reachability in a live process.** A symbol table says a function exists. It does not say your input
  reaches it on a current build under the current sandbox.
- **Whether a client check is the only check.** You can see the check. You cannot see the server.
- **Whether a bug in a framework matters to the app.** An SDK with an interesting flaw is not a finding
  in an app that never calls the vulnerable path.
- **Anything across a trust boundary you cannot observe.** No local read tells you what a remote
  service decides.

Each of those is a claim that needs a different kind of evidence, and none of them is a static
artefact.

## The gates, applied here

Part 3 sets out four gates. On this surface they read like this:

1. **Source proof.** For a browser bug, the engine source is public, so this is the same discipline as
   the kernel track: name the function, the data flow, and the missing invariant. For an app, "source" is
   the decompiled structure plus the endpoint it talks to.
2. **Reachability proof.** Which process, which sandbox, which entry point, which build. For the
   browser, that means naming the message and who may send it. For the app, that means naming the
   external entry point and what a default install exposes.
3. **State-delta proof.** What observably changes, ideally non-destructively, ideally on an account and
   a device you are authorized to touch.
4. **Patch proof, or its equivalent.** For the engine, the fix in the public repository. For the server,
   there is no patch to read, so the equivalent is a demonstration that the response differs when the
   client check is removed.

## Boundaries for this work

The safety conditions from the rest of the series still apply, and one is new.

- No testing against a service you are not authorized to test. Reading a public client is not the same
  as exercising a private endpoint, and the second one needs permission that a static read does not
  imply.
- No instrumenting a device to observe yourself. The point of this surface is that it does not need it.
- Do not turn a removed client-side check into a public claim without the server behaviour to back it.
  A missing check is a hypothesis about the server until you have the response.
- Publish the method and the negative results. Most of this surface is inventory work, and the inventory
  is the useful part.

## Where this leaves the series

Four posts, one idea, four different kinds of boundary.

- **Part 1** drew the map: what trusts what, and what evidence a crossing needs.
- **Part 2** read the code distribution: how the operating system's own libraries are delivered and
  enumerated from an authorized artifact.
- **Part 3** read Apple's fixes: how a patch margin becomes a candidate, and how to keep the queue
  honest.
- **Part 4, this one**, went to the surface that is actually reachable, and found the same rule one layer
  up: the authority is on the far side of the boundary, and the part you can read is never the part that
  decides.

The series has been deliberately method-heavy, because the environment it describes is one where
dynamic validation is blocked and the honest output is a way of working rather than a list of wins.
That is a constraint, not a virtue, and it is worth saying plainly: the moment an authorized device or
runtime exists, the work that changes is the validation, not the map.

## References

[1] WebKit Project, [*WebKit2*](https://docs.webkit.org/Deep%20Dive/Architecture/WebKit2.html) (WebKit documentation): the multi-process architecture, including the split between the interface process, the content process, and the shared network process, and the subset of facilities the content process is denied.

[2] WebKit Project, [*Site Isolation*](https://docs.webkit.org/Deep%20Dive/SiteIsolation.html) (WebKit documentation, 2025): how cross-site frames are partitioned into separate content processes, and the routing that keeps them talking to the right interface process.

[3] WebKit Project, [*Guidelines for Safer IPC Programming*](https://github.com/WebKit/WebKit/wiki/Safer-IPC-Guidelines) (WebKit wiki): the IPC message and serialisation definitions, and the stated threat model that treats the content process as compromised at all times with validation on the receiving side.

[4] Filip Pizlo, [*Speculation in JavaScriptCore*](https://webkit.org/blog/10308/speculation-in-javascriptcore/) (WebKit blog, 2020): the tiered execution model, type-speculative compilation, and deoptimisation through OSR exit, which is the machinery behind the optimiser bug shapes above.

[5] Apple, [*Security of runtime process in iOS, iPadOS, and visionOS*](https://support.apple.com/guide/security/sec15bfe098e/web) (Apple Platform Security): the app sandbox, container layout, signed entitlements, address space layout randomisation, and the dynamic code signing entitlement a just-in-time compiler requires.

[6] Apple, [*Operating system integrity*](https://support.apple.com/guide/security/sec8b776536b/web) (Apple Platform Security): hardware runtime hardening, including the permission restrictions that stop a page being writable and executable at once, pointer authentication, the page protection layer, and the secure page table monitor.

[7] Apple, [*Lockdown Mode security for Apple devices*](https://support.apple.com/guide/security/sec2437264f0/web) (Apple Platform Security): the optional hardening that disables just-in-time compilation in the browser along with the more complex rendering paths.

[8] Ian Beer, [*An analysis of an in-the-wild iOS Safari WebContent to GPU Process exploit*](https://projectzero.google/2023/10/an-analysis-of-an-in-the-wild-ios-safari-sandbox-escape.html) (Project Zero, 2023): a worked example of climbing from the content process to a more privileged one through the browser's own IPC.

[9] Ivan Fratric, [*365 Days Later: Finding and Exploiting Safari Bugs using Publicly Available Tools*](https://projectzero.google/2018/10/365-days-later-finding-and-exploiting.html) (Project Zero, 2018): grammar-based DOM fuzzing and turning a document-object lifetime bug into a working exploit with public tooling.

[10] OWASP, [*MASTG-TECH-0058: Exploring the App Package*](https://mas.owasp.org/MASTG/techniques/ios/MASTG-TECH-0058/) (Mobile Application Security Testing Guide): unpacking an app package and reading its metadata, embedded frameworks, and entitlement files.

[11] OWASP, [*MASTG-TEST-0376: References to Native Bridge APIs in WebViews*](https://mas.owasp.org/MASTG/tests/ios/MASVS-PLATFORM/MASTG-TEST-0376/) (MASTG): auditing the message handler registration that turns a JavaScript call into a native action.

[12] OWASP, [*MASTG-TEST-0370: Missing Input Validation in Custom URL Scheme Handlers*](https://mas.owasp.org/MASTG/tests/ios/MASVS-PLATFORM/MASTG-TEST-0370/) (MASTG): extracting the declared URL schemes and tracing the handler that receives them.

[13] OWASP, [*Mobile App Authentication Architectures*](https://mas.owasp.org/MASTG/0x04e-Testing-Authentication-and-Session-Management/) (MASTG): the architectural argument that client-side logic and interface gating are untrusted by construction and cannot substitute for server-side authorisation.

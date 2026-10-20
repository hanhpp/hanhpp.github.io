---
title: "Finishing Flare-On 13: 9 for 9"
date: 2026-10-24T09:00:00+07:00
draft: false
tags: ["reverse-engineering", "ctf", "milestone"]
summary: "Nine of nine this year against three of ten last year, and the five write-ups that explain the difference."
---

<div class="milestone-announcement">

Last year, my Flare-On run ended in defeat after managing only 3 of the 10 challenges before getting completely stuck.

This year was a completely different feeling: I solved all nine challenges and made it to the 9,000-point victory screen.

{{< figure src="flareon13-victory.jpg" alt="Flare-On 13 9000-point victory modal" caption="Clearing the final stage of Flare-On 13." >}}

The difference came down to abandoning brute force early, auditing native runtime boundaries instead of trusting decompilers, and tracking dataflow provenance instead of blind single-stepping.

</div>

## The write-ups

| Part | Stages | What the stage turns on |
| :--- | :--- | :--- |
| [Part 1: polyglots, hidden streams, in-memory traps]({{< ref "flare-on-13-part-1-polyglots-and-traps" >}}) | 01 to 03 | A flag in the container rather than the code: a right-click timer over an alternating XOR stream, and files that lie about their own format |
| [Part 2: a patched SHA-256d and a vanity volume serial]({{< ref "flare-on-13-part-2-cryptanalysis-and-compression" >}}) | 04 and 05 | A 32-round SHA-256 whose Ch and Maj functions were rewritten, keyed off a volume serial that spells a joke in leetspeak, and a hand-rolled compressor |
| [Part 3: a patched CoreCLR JIT]({{< ref "flare-on-13-part-3-coreclr-and-stateful-c2" >}}) | 06 | The implant is not in the C# at all: a hooked `compileMethod` rewrites five methods by 64-bit hash, and a C2 stream that never re-keys |
| [Part 4: the ASN.1 labyrinth]({{< ref "flare-on-13-part-4-asn1-labyrinth" >}}) | 07 | 1,035 encrypted entries in the PE overlay behind seven layers of decoys and an x86 stall loop |
| [Part 5: a Wasm certificate and a monkey-patched V8]({{< ref "flare-on-13-part-5-crux-and-beyond" >}}) | 08 and 09 | Two runtimes I did not control: an obfuscated Go WebAssembly module gated by a Pratt primality certificate, and a JIT that wrote its own code |

Each write-up carries the reproducer and the dead ends, because the dead ends are the part that transfers. The challenge archives stay on the contest site once scoring closes.

If you want the short version of what changed between last year and this one: the tools did not, the order of operations did. Brute force was abandoned early, native runtime boundaries were audited instead of trusted, and provenance was tracked rather than single-stepped.

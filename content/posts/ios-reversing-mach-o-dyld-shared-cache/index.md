---
title: "Reading iOS Without a Jailbreak: Mach-O, dyld, and Shared Cache Topology"
date: 2026-10-09T09:00:00+07:00
draft: false
tags: ["reverse-engineering", "ios", "apple", "mach-o", "architecture", "deep-dive"]
summary: "iOS system libraries ship inside one dyld shared cache instead of on disk, and a fat Mach-O will happily hand you the wrong architecture without an error. Here is the static workflow that reads headers, metadata, and topology before you open a decompiler."
---

The first iOS binary I ever loaded into a decompiler was the wrong architecture, and nothing in the toolchain objected. I had pointed `otool` at a universal file, read the header it printed, and concluded I was looking at an arm64 build. Twenty minutes later the decompiled control flow did not line up with the crash I was chasing, because the header `otool` printed by default belongs to the first slice in the fat container. The process I cared about ran the second slice.

That failure is cheap to make and expensive to notice. The same class of mistake shows up one level higher: reading `strings` output and treating a literal as proof that code reaches it. A string in `__TEXT.__cstring` proves that a literal exists in the file. It says nothing about whether any instruction references it, whether that reference is live, or whether the surrounding check ever runs. Strings are triage, not reachability.

> **The Core Takeaway:** A Mach-O is a container of per-architecture slices plus load commands, not a program. Almost everything you need for static iOS work (symbols, Objective-C classes, Swift types, entitlements, dependencies) is metadata you can read without executing anything. Disassembly is the last step, not the first.

This is the second post in this series. [The first post]({{< ref "ios-architecture-from-sandbox-to-secure-enclave" >}}) mapped the trust boundaries: app sandbox, XPC, daemons, XNU, hardware monitors. This one is about the artifacts those boundaries are made of, and how to read them statically.

## One file, two programs: what "the wrong slice" looks like

Here is the same universal binary through two different questions.

```text
$ otool -h ./Universal
Mach header
      magic  cputype cpusubtype  caps    filetype ncmds sizeofcmds      flags
 0xfeedfacf 16777223          3  0x00           2    18       1736 0x00200085

$ otool -f ./Universal
Fat headers
fat_magic 0xcafebabe
nfat_arch 2
architecture 0
    cputype 16777223
    cpusubtype 3
    capabilities 0x0
    offset 16384
    size 48128
    align 2^14 (16384)
architecture 1
    cputype 16777228
```

`0xfeedfacf` is `MH_MAGIC_64`. `16777223` is `0x01000007`, `CPU_TYPE_X86_64`, with subtype `3` (`CPU_SUBTYPE_X86_64_ALL`). The arch at index `1` is `16777228` = `0x0100000C` = `CPU_TYPE_ARM64`. So `otool -h` answered a question I did not ask: it described slice zero, and slice zero is the Intel one. When a tool shows you exactly one header for a file with `nfat_arch 2`, that is a signal to stop and look at the fat header first.

The same trap exists in build tooling. On an Apple Silicon machine, `xcrun -f clang` resolved to a universal binary whose active architecture was `x86_64`, and it produced this:

```text
$ clang -o hello hello.c && file ./hello
./hello: Mach-O 64-bit executable x86_64
```

The host was arm64. The compiler was an x86_64 slice running under translation, so the default output was x86_64. I did not notice because the build succeeded. Architecture is a property you verify, not one you assume from the machine name.

## What a Mach-O header and its load commands give you

The header is small: magic, CPU type, CPU subtype, file type, command count, flags. The load commands that follow are the real table of contents. Each one is a typed record with a size, which is why a malformed `cmdsize` is a parsing bug class in its own right for anything that reads Mach-O files.

| Load command | Value | What it gives you |
|---|---|---|
| `LC_SEGMENT_64` | `0x19` | Segments and sections: `__TEXT`, `__DATA_CONST`, `__DATA`, `__LINKEDIT`, plus each section's address and size |
| `LC_SYMTAB` | `0x2` | Symbol table offset and string table offset, names included if not fully stripped |
| `LC_DYSYMTAB` | `0xb` | Which symbols are local, external, or undefined |
| `LC_LOAD_DYLIB` | `0xc` | Direct dependencies by install name |
| `LC_DYLD_INFO` / `LC_DYLD_INFO_ONLY` | `0x22` / `0x80000022` | Legacy bind, rebase, weak, lazy, and export opcodes |
| `LC_DYLD_EXPORTS_TRIE` | `0x80000033` | Modern export trie: exported symbol to address |
| `LC_DYLD_CHAINED_FIXUPS` | `0x80000034` | Modern pointer fixups as deltas instead of relocation tables |
| `LC_FUNCTION_STARTS` | `0x26` | Compressed table of function entry addresses |
| `LC_CODE_SIGNATURE` | `0x1d` | Offset into `__LINKEDIT` where the signature blob lives |
| `LC_ENCRYPTION_INFO_64` | `0x2c` | The encryption state fields used by App Store binaries |
| `LC_UUID` | `0x1b` | The build identity you should record with every note you take |
| `LC_BUILD_VERSION` | `0x32` | Platform, minimum OS, SDK. `2` is `PLATFORM_IOS`, `1` is `PLATFORM_MACOS`, `7` is `IOS_SIMULATOR` |

Anything with `LC_REQ_DYLD` (`0x80000000`) set has the high bit flipped, which is why the same command sometimes appears twice in documentation with two different numeric values.

A real slice from a system binary, read with `ipsw macho info --arch arm64e -d -l`, shows the shape:

```text
Magic         = 64-bit MachO
Type          = EXECUTE
Commands      = 20 (Size: 1712)
Flags         = NoUndefs, DyldLink, TwoLevel, PIE
001: LC_SEGMENT_64 ... __TEXT            
        __TEXT.__text   __TEXT.__auth_stubs   __TEXT.__const   __TEXT.__cstring
002: LC_SEGMENT_64 ... __DATA_CONST   ReadOnly
        __DATA_CONST.__auth_got   __DATA_CONST.__got   __DATA_CONST.__const
004: LC_SEGMENT_64 ... __LINKEDIT
005: LC_DYLD_CHAINED_FIXUPS      offset=0x000010000 size=0x590
006: LC_DYLD_EXPORTS_TRIE        offset=0x000010590 size=0x20
007: LC_SYMTAB                   Symbol offset=0x00010600, Num Syms: 92
008: LC_DYSYMTAB
```

Two things to note. `__auth_stubs` and `__auth_got` exist only on authenticated-pointer targets, and they are the stubs a decompiler will show you calling through. And `__TEXT.__cstring` is the section `strings` reads; it is data, sitting next to code in the same segment.

## arm64e is not "arm64 with a flag"

`CPU_SUBTYPE_ARM64E` is `2`. The subtype field is not just a number: `CPU_SUBTYPE_MASK` is `0xff000000` and `CPU_SUBTYPE_PTRAUTH_ABI` is `0x80000000`, so `otool` prints an arm64e slice as subtype `2` with caps `0x80`. That bit is the pointer-authentication ABI tag, and it answers a concrete question: does this image expect the loader to sign and re-sign pointers as it binds them?

Pointer authentication changes what a pointer means in a binary. Return addresses are signed on the stack and checked before return. Function pointers and `vtable`-style dispatch targets are signed with a discriminator, so the same address signed in two places produces two different values. Instructions like `pacia`, `autia`, `retab`, and the authenticated branch forms are visible in disassembly, but the important consequence for reading a binary is elsewhere: the literal bytes you see for a pointer are not the address of the target, and two binaries built with different ABI versions can sign identically named symbols differently.

The same caution applies to modern fixups. A chained fixup entry is a delta plus a type plus a next offset, not an absolute address, and the type can mark an entry as authenticated. If you are correlating a value in a `__DATA` section with an address in `__TEXT`, do it through the fixup chain or through a loader that understands it. Ghidra's Mach-O loader has handled chained fixups and authenticated pointers for several releases.

> **Gotcha:** `MH_DYLIB_IN_CACHE` (`0x80000000` in the header flags) tells you an image was extracted from the dyld shared cache. For those files, the segment file offsets came from the shared region, not from a standalone file, so offset to address math from the raw bytes will not match a standalone dylib. Read the cache's mapping table before you trust any address.

## Objective-C metadata is structured data, not a string table

Objective-C binaries carry their own runtime description: class lists, method lists, protocols, categories, ivars, and property metadata. You can read all of it statically:

| Section | Contents |
|---|---|
| `__objc_classlist` | Pointers to class objects |
| `__objc_catlist` | Categories, which is where a lot of behavior hides |
| `__objc_protolist` | Protocol definitions |
| `__objc_classrefs`, `__objc_superrefs` | Which frameworks this image refers to |
| `__objc_methname`, `__objc_methtype` | Selector name and type encoding strings |
| `__objc_selrefs` | Selectors referenced by this image |
| `__objc_const` | The bulk of method and property metadata |
| `__objc_ivar` | Instance variable descriptors |

Selectors are just strings in `__objc_methname`, and method lists may be stored in a relative form, so the entries are offsets rather than absolute addresses. The practical payout is that a method list plus a class list plus an ivar list gives you the object model before you read a single instruction: which class declares a method, which category adds one, and which framework the class came from.

Inside the shared cache, some of this gets relocated into optimized tables. If you read only `__objc_classlist` from a cache image, expect fewer classes than the runtime actually sees; the optimization sections are the difference, and `ipsw dyld objc` exists to read them.

## Swift metadata survives stripping

Swift binaries are metadata-rich even when symbols are gone. Mangled names live in symbol tables and in `__swift5_*` sections:

| Section | Contents |
|---|---|
| `__swift5_types`, `__swift5_typeref` | Type descriptors and type references |
| `__swift5_fieldmd` | Stored property names, types, and offsets |
| `__swift5_reflstr` | Reflection strings: field and case names |
| `__swift5_proto`, `__swift5_protos` | Protocol conformance records |
| `__swift5_assocty`, `__swift5_mpenum` | Associated types, multi-payload enums |
| `__swift5_capture` | Capture descriptors for closures |

Two of these matter more than the rest. `__swift5_fieldmd` gives you exact struct and class field layouts, which beats reconstructing field access from decompiled pointer arithmetic. `__swift5_reflstr` gives you the human names. The mangled symbols are readable with the toolchain:

```bash
swift demangle --compact '_$s10Foundation4DataV'
```

For a cache image the same information is available without extracting anything, through `ipsw dyld swift --types --metadata --demangle`. Swift in the cache also carries conformance data that a stripped `__LINKEDIT` alone would not reveal, and the foreign conformance list is how you find Swift code that conforms to Objective-C protocols.

## The dyld shared cache is most of the operating system

On iOS, `/System/Library/Frameworks/UIKit.framework/UIKit` is not a standalone file holding that framework's code. Framework images are merged into one prelinked, prebound blob that the loader maps once and shares across every process. One header, one slide, one mapping, and fixups already resolved for the shared layout. That is why there is no jailbreak required to read system libraries: the same artifact the device uses is inside the IPSW you can download.

Modern caches are split. The main file is small and holds the headers and text of all images, and the rest of the content lives in subcaches whose names carry their role: numbered data subcaches, plus `.dylddata`, `.dyldreadonly`, `.dyldlinkedit`, and optional `.symbols`, `.atlas`, and `.map` files. A directory listing on a current macOS install looks like this:

```text
dyld_shared_cache_arm64e
dyld_shared_cache_arm64e.01
dyld_shared_cache_arm64e.02.dylddata
dyld_shared_cache_arm64e.03.dyldreadonly
dyld_shared_cache_arm64e.04.dyldlinkedit
dyld_shared_cache_arm64e.05
...
dyld_shared_cache_arm64e.atlas
dyld_shared_cache_arm64e.map
```

Do not assume a fixed file set. The count, suffixes, and numbering depend on the OS version and how the cache was built, and the authoritative source is Apple's own `dyld` documentation for cache layout. Read the header instead of hardcoding names. `ipsw dyld info` prints it:

```text
Magic          = "dyld_v1  arm64e"
Format         = 0 (NewFormatTLVs)
Num Images     = 3643
Num SubCaches  = 12
Shared Region:  5GB, address: 0x180000000 -> 0x2E459C000
```

Those numbers come from a macOS 26.4 install; an iOS cache has the same structure with different values. The line that matters for analysis is the shared region base. It is also the reason raw addresses in a cache image look like `0x180xxxxxx` while the same code in a standalone dylib looks like `0x10000xxxx`, and the reason a hardcoded address from a blog post about a different OS version will point at nothing useful in yours.

## Extracting only what you need

These commands use placeholder paths; substitute your own artifact locations. Every one of them is read-only with respect to the source artifact.

```bash
# 1. Extract the shared cache from an authorized IPSW, arm64e only
ipsw extract --dyld --dyld-arch arm64e -o artifacts/cache artifacts/device_restore.ipsw

# 2. Read the cache header: format, image count, subcaches, mapping table
ipsw dyld info artifacts/cache/dyld_shared_cache_arm64e

# 3. List every image and its version, then find who depends on whom
ipsw dyld info artifacts/cache/dyld_shared_cache_arm64e --dylibs
ipsw dyld imports artifacts/cache/dyld_shared_cache_arm64e /usr/lib/libSystem.B.dylib

# 4. Pull one image out, enriched with local symbols, ObjC metadata, and stubs
ipsw dyld extract artifacts/cache/dyld_shared_cache_arm64e \
  /System/Library/Frameworks/Foundation.framework/Foundation \
  --output artifacts/out --objc --stubs

# 5. Read metadata before code
ipsw macho info --arch arm64e -d -l -e --objc artifacts/out/Foundation

# 6. Confirm the architecture of anything that is still universal
otool -f ./Universal
otool -h -arch arm64e ./Universal
mkdir -p artifacts/slices
ipsw macho lipo --arch arm64e --output artifacts/slices ./Universal

# 7. Symbols, demangling, and signature facts
ipsw dyld symaddr artifacts/cache/dyld_shared_cache_arm64e _malloc --image libsystem_malloc.dylib
swift demangle --compact '_$s10Foundation4DataV'

# 8. Entitlements across a whole firmware, as a queryable database
ipsw ent --sqlite artifacts/entitlements.db --ipsw artifacts/device_restore.ipsw
ipsw ent --sqlite artifacts/entitlements.db --key platform-application
```

`ipsw dyld split` also exists, and its own help is worth reading before you use it: it calls Apple's `dsc_extractor` for a fast bulk dump, but the output is not enriched for reverse engineering. `ipsw dyld extract` adds local symbols, ObjC metadata, and stub-island symbols, and produces Mach-O files that open cleanly in Ghidra or IDA. When the directory does not exist, the failure is a plain file error, not a hint:

```text
$ ipsw macho lipo --arch arm64e --output artifacts/slices ./Universal
   ⨯ failed to create file Universal.arm64e: open artifacts/slices/Universal.arm64e: no such file or directory
```

The same symbol lookup answers differently depending on where you ask. Resolving `_malloc` against a cache without naming an image matched the local symbol table and reported `(local|regular)`; adding `--image libsystem_malloc.dylib` matched the export and reported `(export|regular)`. Local symbols exist because the cache was built with them, exports exist because the image publishes them. Two different claims, one address, and worth keeping straight when you write a note.

Useful smaller helpers, all from the same subcommand tree: `ipsw dyld str` to search the cache for a literal, `ipsw dyld a2s` to resolve an address to a symbol, `ipsw dyld stubs` for stub islands, `ipsw dyld softlinks` for weak-linked globals, and `ipsw dyld info --diff` plus `ipsw class-dump --diff` to compare one OS version against another.

## Entitlements: the file is not the decision

`codesign` reads the signature blob, and its output is the closest thing to ground truth you can get without running anything:

```bash
codesign -d -vvv --entitlements :- ./Extracted
```

An unsigned or stripped artifact fails loudly, which is itself informative:

```text
$ codesign -d --entitlements :- ./hello
./hello: code object is not signed at all
```

Read the entitlement plist as a claim, not as an outcome. Three separate things can disagree: the entitlements embedded in the signature, a `.xcent` or provisioning file shipped next to the app, and the set the kernel honors at runtime after AMFI, the trust cache, and platform-binary policy have had their say. DER entitlements are a separate encoding from the XML plist and can be read with `ipsw macho info --ent-der`. If you are mapping a privilege boundary, the question is never "does this string appear" but "which component reads this key, under which platform policy, for which signing identity".

## An evidence table for static claims

Every row below is something a static workflow can produce. The third column is the part that keeps a note honest.

| Signal | What it establishes | What it does not establish |
|---|---|---|
| String in `__TEXT.__cstring` | A literal exists in the image | That any code path references or reaches it |
| Export trie entry | The image exports a symbol with that name | That the symbol is used on this OS version |
| `LC_LOAD_DYLIB` entry | A declared direct dependency | That the dependency is resolved at runtime, or that a symbol is imported from it |
| Undefined symbol in `LC_DYSYMTAB` | The image needs this symbol from somewhere | Which library provides it, which is a separate lookup |
| `__objc_classlist` entry | The image declares a class | That the class is instantiated on any path you care about |
| Swift `__swift5_fieldmd` entry | A field name, type, and offset | Field visibility rules or access ordering |
| `codesign` entitlement key | The signature carries this key | That the kernel or a daemon honors it for this caller |
| Mach service name in a launchd plist | A service is registered under that name | Who may connect, under which sandbox profile |
| Cross-reference in a decompiler | Some instruction references the address | That the reference is reachable from the boundary you are studying |
| Function in `LC_FUNCTION_STARTS` | A function begins at that address | Its name, purpose, or callers |

The pattern is consistent: a static signal gives you existence. Reachability, authorization, and state change require a second, separate piece of evidence, and mixing the two is how a triage note turns into a wrong claim.

## The order of operations that survives review

Run these in order and the expensive steps land on the artifact that deserves them.

1. **Record provenance.** Hash the IPSW or the extracted image, and note the OS build, device class, and architecture subtype. Every later claim is relative to that tuple.
2. **Pick the slice deliberately.** Read the fat header, not the first header a tool prints. Write down `cputype`, `cpusubtype`, and the caps byte.
3. **Read metadata before code.** Load commands, symbol table, dependency list, ObjC and Swift sections, entitlements.
4. **Map topology, not just symbols.** Which images exist, which ones depend on which, which Mach services launchd registers, and which sandbox profile governs the client you care about.
5. **Then open a loader.** For cache images, prefer the cache itself with Ghidra's Mach-O dyld shared cache loader, which splits embedded dylibs into memory blocks and keeps the mapping table honest. Extracted, enriched Mach-O files are the alternative when you want one image in isolation.
6. **Diff versions.** A changed validation function, a new regression test, or a removed entitlement between two builds is a higher-signal starting point than a random function in one build.
7. **Write the boundary sentence.** "An unprivileged caller controls this input crossing this boundary, and the callee assumes this invariant." If you cannot write it, keep reading.

Steps one through four are cheap, and they are the ones that prevent the wrong-slice afternoon, the wrong-version address, and the string-that-proves-nothing note.

## Safety boundaries for authorized research

Static reading of firmware you are entitled to hold is low risk, but the surrounding habits matter.

> **Scope:** Work only on artifacts and devices you own or are explicitly authorized to analyze: your own device, a public IPSW from Apple's distribution, or your own app. Mapping a boundary is not a proof of impact, and a proof of impact is not permission to publish or deploy anything.

- **Stay static until there is a reason not to be.** No dynamic instrumentation of retail iOS, and no jailbreak-dependent workflow, without an authorization that names the environment. If dynamic validation becomes necessary, it belongs in an isolated, snapshot-capable environment that can be restored after a controlled failure, never on your primary machine.
- **Do not lift personal data.** Entitlement dumps, launchd plists, and string tables from a firmware image are documentation. Anything from a device that belongs to a person who is not you is out of scope, and identifiers or tokens you stumble across stay in the artifact.
- **Do not turn a diff into a CVE.** A validation check added between two releases is a patch margin and a research lead. It is not proof of an unpatched sibling, and it is not proof of reachability or impact. State the evidence class you actually have: source proof, reachability proof, state-delta proof, or patch proof.
- **Report through the vendor.** Findings that survive the evidence gates go to Apple's security reporting channel, not to a public post with an untested claim.
- **Keep no-untrusted-parser habits.** Everything discussed here is a parser: fat headers, load commands, fixup chains, symbol tries, plists. Validate sizes and offsets before you write tooling against them, and never point a fresh parser at an untrusted artifact on a machine you care about.

The payoff of the static path is not glamour. It is that you can map a system boundary across an entire firmware image, diff it against the next release, and know exactly which claims your evidence supports, all without a jailbreak and without executing a single byte of the target.

Next in the series, the patch-margin work (forthcoming) applies this same evidence discipline to XNU source diffs: how a scanner turns hundreds of changed files into a ranked candidate queue, why a regression test is a calibration control rather than a finding, and where the line sits between a hardening change and a reportable bug.

## References

[1] [Apple Open Source: dyld](https://github.com/apple-oss-distributions/dyld): canonical repository for the dynamic linker, dyld shared cache builder, image mapping tables, and chained fixup parser implementations.

[2] [Apple Developer: Mach-O Runtime Architecture](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/MachORuntime/): reference specification for Mach-O headers, load commands, and segment memory protections.

[3] [blacktop/ipsw](https://github.com/blacktop/ipsw): open-source Go-based research suite for extracting and analyzing iOS IPSWs, Mach-O binaries, symbols, and dyld shared caches.

[4] [LLVM Mach-O Object File Specification](https://llvm.org/doxygen/namespacellvm_1_1MachO.html): format references for CPU types, architecture subtypes, and load command payloads.

[5] Jonathan Levin, [*Mac OS X and iOS Internals: Directory of Utilities (jtool / vtool)*](http://newosxbook.com/tools/jtool.html): tool documentation and technical references for Mach-O header parsing, symbol triage, and dyld cache mapping.

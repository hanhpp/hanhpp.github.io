---
title: "Most of This Jailbreak Was Never Published: unc0ver and the Userland Era"
date: 2026-10-16T09:00:00+07:00
draft: false
tags: ["ios", "apple", "security", "jailbreak", "vulnerability-research"]
summary: "The bootrom era was unpatchable but fully readable. The userland era inverted both properties: every bug had a fix, and most of the tool's shipped life has no published source at all."
---

Reading a jailbreak is usually a source exercise. You take the repository, follow the kernel read/write primitive to the code-signing bypass, and check the ordering of the steps. I tried that with unc0ver and the trail stopped at June 2020.

Its tag list ends at v5.2.0 [1]. Everything after that, which is most of the tool's life and every version that touched iOS 14, shipped as a binary from the project's own site and never appeared in the repository. The last push to the public tree was August 2021.

That is not a curiosity. It changes what can be established about the era, and it is the honest place to start.

> **The Core Takeaway:** The userland era traded one hard property for another. Its bugs were patchable, so it needed a fresh kernel vulnerability for each iOS release. And the boundary that turned out to be load-bearing was not the kernel, it was code signing, because everything a user calls "the jailbreak" is unsigned software that the kernel has to be persuaded to run.

## The tool, and where its source stops

unc0ver is by pwn20wnd with Sam Bingner, first released in October 2018 under BSD-3-Clause, and its canonical repository is `pwn20wndstuff/Undecimus`. The directory name is the trap: Undecimus is the project's pre-rename name, so a search for the product name does not find the code.

| Property | checkm8 generation | unc0ver generation |
| --- | --- | --- |
| Delivery | Cable and DFU mode, every boot | An ordinary app, from the device |
| Device reach | SoC-bound, up to A11 | Broad, including A12 and A13 iPhones |
| Version dependence | None, the bug is in the ROM | One kernel bug per iOS version |
| Patchable | No | Yes, usually within days |
| Source available | Yes, GPL-3.0 | Only up to v5.2.0 |

The project's own description is "one app to jailbreak all firmwares", which is accurate about the delivery and misleading about the cost [1]. A bootrom exploit is version-independent because the ROM never changes. An app-based jailbreak gets its privileges from a bug in the running kernel, and Apple ships a new kernel with every release, so the era is a sequence of new bugs rather than one durable one.

Two further artifacts of the same era: the version tables for everything after v5.2.0 rest on the project site and community-maintained pages rather than on source, and the name attracts scam sites advertising "unc0ver for iOS 15 to 26", which no release ever supported. A tool whose history is partly oral invites that.

## Three exploits, and what each one bought

The technical record here is unusually good, because two of the three were published by Project Zero with full walkthroughs.

| Exploit | Author | CVE | Bug class | What it yields |
| --- | --- | --- | --- | --- |
| voucher_swap [2] | Brandon Azad, Project Zero | CVE-2019-6225 | Reference-counting error in the Mach IPC voucher path | A freed voucher reclaimed through an out-of-line ports array, then a fake kernel task port |
| SockPuppet [3] | Ned Williamson, Project Zero | CVE-2019-8605 | Use-after-free in the BSD socket layer | A read and a write path from the socket API, then a stable kernel task port |
| The iOS 13.5 release bug [5] | Shipped by unc0ver itself | CVE-2020-9859 | Double-free in the POSIX AIO path | Kernel read and write, without a bootrom exploit underneath |

The third one is the interesting case, and not for its bug class.

Apple's own security note for iOS 13.5.1 credits the fix to "unc0ver", naming the tool rather than a person [5]. The CERT record for it states that the bug "is being used by the public unc0ver 5.0 jailbreak utility" [6]. A vendor crediting a jailbreak team as the discoverer of a kernel bug is a small event in itself: it means the bug was reported through the normal channel, by the people who needed it to ship.

The identification is the part worth studying. Project Zero worked out what the bug was from a panic, after killing the app mid-exploit to force the kernel to name the process and the allocation zone involved, and then confirmed the hypothesis by patching a check in a kernel booted through a different exploit [4]. The writeup is titled "How to unc0ver a 0-day in 4 hours or less", and the method is entirely transferable: force the crash you want, read what the panic names, and verify by disabling the check you believe is responsible.

> **One bug class, three eras of the same lesson.** The AIO bug was a regression of an earlier fix, which is the same shape as the checkm8 discovery, where reading a fix is what surfaced the bug. Fixes are the most reliable map of where the interesting code is, in both directions.

## Five boundaries, and which one is load-bearing

A userland jailbreak defeats a sequence of boundaries, and it is worth separating the one that makes the rest possible from the one that makes it useful.

1. **The user and kernel boundary**, reached from a signed, sandboxed app, yielding kernel read and write.
2. **Kernel integrity**, since that read and write is used to patch kernel state. unc0ver's own notes call the patches "static and not dynamic", meaning they survive the running session rather than being reapplied per call.
3. **Volume immutability**, by remounting the root filesystem read-write, which the project documents as a snapshot bypass.
4. **The root boundary for the payload**, so a bootstrap with a package manager and a shell server can run as root.
5. **The code-signing boundary**, because every binary in that bootstrap is unsigned.

Structurally, the first is load-bearing: everything after it is expressed in kernel read and write. Operationally, the fifth is, and this is the part that generalises beyond jailbreaking. Without a signing bypass, the kernel will not map those binaries executable, and nothing the user perceives as the jailbreak exists. unc0ver treats it as a milestone of its own, marking a "full-fledged AMFI/CoreTrust bypass" as a blocker for A12 devices and shipping a trust-cache injector for the payload directories.

## Code signing is two mechanisms, and the record conflates them

This is where the public account of the era is weakest, and where the artifacts disagree with the storytelling.

**Trust caches are the mechanism Apple documents.** Apple describes the static trust cache as a list of binaries in the signed system volume, each represented by a code directory hash, and states that when a running binary's hash is present its executable mappings are granted platform privileges [9]. Loadable caches can be added at runtime. That last sentence is the lever: inject a cache containing hashes of your own binaries and they are treated as trusted.

**The validation daemon is the mechanism the jailbreak code documents.** amfid services code-signing validation, and Fugu14's own source finds it, takes its task port, and patches it at every boot [7]. Apple never names this daemon in its security documentation, so this half of the model comes from reading jailbreak source rather than from a vendor description.

**CoreTrust is the part the record does not support.** The common framing is that these jailbreaks bypass CoreTrust. Fugu14's tree contains no reference to CoreTrust at all [7], and Apple files the code-signing bug that Fugu14 used under "Identity Service", describing it as a way for a malicious application to bypass code signing checks [10]. So the accurate statement is narrower: a code-signing check was bypassed, and naming the component that performs it is an inference from a name that appears in a different context.

> **Check which mechanism a claim names.** "AMFI", "amfid" and "CoreTrust" get used interchangeably in jailbreak writing to mean "the thing that stops unsigned code". They are a daemon, its service, and a component that the artifacts do not actually implicate. A claim that names one of them without a source is usually a claim that names none of them.

## Fugu14: privilege re-derived, not stored

Fugu14, by Linus Henze, released in October 2021 under MIT, is the piece that made an untethered unc0ver conceivable. It carries five CVEs, spans iOS 14.3 to 14.5.1, and supports only arm64e devices, with arm64 excluded because the install step fails there [7].

Its persistence model is the interesting design decision. Rather than storing privilege somewhere that survives a reboot, it arranges for privilege to be rebuilt at each boot from the same bug that it used the first time. The installer substitutes a system daemon with a copy of a different one, redirects where the dynamic linker reads its closure from, and arranges for the substituted daemon to launch a helper as root during early boot. That helper patches the validation daemon, starts a privileged service that re-runs the kernel exploit, re-establishes the pointer-authentication and page-protection bypasses, injects a trust cache, and remounts the root filesystem writable.

Nothing persists except the arrangement that causes the chain to run again. That is why the supported range is so narrow: the whole design depends on the specific closure-handling bug, and Apple's fix ends it.

**Whether unc0ver shipped it is a question with two answers.** unc0ver's v7.0.0 notes add iOS 14.4 to 14.5.1 support for A12 to A14 devices *with Fugu14*, requiring Fugu14 to be installed and run first, and v8.0.0 extends that to 14.3. Fugu14's own issue tracker, meanwhile, shows users reporting unc0ver still "Unsupported" with the untether installed [11]. The two records are compatible if you read the changelog as integration rather than incorporation: unc0ver did not bundle or reimplement the untether. The jailbreak documented as incorporating it is Taurine.

## What ended the era

iOS 15 and the signed system volume. On iOS 15 and later the system volume gains cryptographic protection: the bootloaders verify that its seal is intact and matches an Apple-signed value before starting the kernel, and on iOS and iPadOS users are not permitted to turn that protection off [8].

That is what killed the rootful approach rather than any single bug. The era's last move was remounting the system volume writable, and a bootloader-checked seal with no opt-out means an in-memory kernel patch cannot undo it. Every jailbreak after that point is rootless, which is the subject of the next part: [Part 7, on palera1n, the patch set that has no PPL patch, and what rootless costs](/posts/ios-jailbreak-rootless-era/).

## What the public record does not establish

- **The iOS 13.5 exploit itself.** The shipped binary was obfuscated, and no source or author writeup was published. What exists is the bug class, the vendor attribution [5], and Project Zero's identification method [4]. unc0ver's own changelog never claims a 0-day, which is worth noticing: the tool shipped a kernel bug that nobody outside the project had a name for, and described it as a release.
- **Any source correspondence after v5.2.0.** The version tables for iOS 14 rest on a project site and community pages. Nothing in them can be checked against code.
- **The CoreTrust framing**, as described above. The strongest available statement is that a code-signing check was bypassed, and the component's identity is not established by the artifacts.
- **The platform reach of the AIO regression.** Apple lists the fix for macOS, tvOS and watchOS alongside iOS, with no confirmation that the bug was reachable or exploited on those platforms.
- **unc0ver's iOS 14 exploit**, for which no CVE or author is traceable, and **anything requiring a device**, including Fugu14's boot-time behaviour.

## References

[1] [pwn20wndstuff/Undecimus](https://github.com/pwn20wndstuff/Undecimus): the project's own description, its licence, and the tag list that stops at v5.2.0.

[2] [Project Zero: voucher_swap](https://projectzero.google/2019/01/voucherswap-exploiting-mig-reference.html): the MIG reference-counting error, the reclamation through an out-of-line ports array, and the kernel task port that follows.

[3] [Project Zero: SockPuppet](https://projectzero.google/2019/12/sockpuppet-walkthrough-of-kernel.html): the socket-layer use-after-free, its read and write paths, and the stable kernel task port.

[4] [Project Zero: how to unc0ver a 0-day in four hours](https://projectzero.google/2020/07/how-to-unc0ver-0-day-in-4-hours-or-less.html): the panic-first identification method, which is the transferable part of the 13.5 bug.

[5] [Apple security note for iOS 13.5.1](https://support.apple.com/en-us/103795): the vendor attribution of CVE-2020-9859 to the tool rather than to a person.

[6] [CERT VU#127371](https://www.kb.cert.org/vuls/id/127371): the LightSpeed regression, the double-free classification, and the statement that the bug was in public use.

[7] [LinusHenze/Fugu14](https://github.com/LinusHenze/Fugu14): the untether's design, its five CVEs, the arm64e-only support, and the fact that its tree never names CoreTrust.

[8] [Apple Platform Security: signed system volume](https://support.apple.com/guide/security/signed-system-volume-security-secd698747c9/web): the bootloader-verified seal and the absence of a user opt-out, which is what ended the rootful era.

[9] [Apple Platform Security: trust caches](https://support.apple.com/guide/security/trust-caches-sec7d38fbf97/web): the code directory hash list and the platform privileges it grants, the mechanism behind the code-signing bypass.

[10] [Apple security note for iOS 14.7](https://support.apple.com/en-us/103139): the four Fugu14 CVEs as Apple filed them, including the code-signing one under Identity Service.

[11] [Fugu14 issue tracker](https://github.com/LinusHenze/Fugu14/issues/51): the user reports of unc0ver remaining unsupported with the untether installed, recorded as a community source rather than a project statement.

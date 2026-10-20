---
title: "The Patch That Isn't There: palera1n and the Rootless Era"
date: 2026-10-17T09:00:00+07:00
draft: false
tags: ["ios", "apple", "security", "jailbreak", "bootrom"]
summary: "The modern checkm8 continuation patches code signing, mount policy and task ports, and has no page-protection patch at all. What the gap in its own patch set says about the boundary everyone assumes is being crossed."
exercises:
  - number: 2
    question: "The post's central claim is a negative: no page-protection patch exists in palera1n's pre-boot environment. Check it yourself rather than taking it from the post."
    command: "git clone --depth 1 https://github.com/palera1n/PongoOS && cd PongoOS && grep -rnw 'PPL\\|ppl' --include='*.c' --include='*.h' . | grep -v apple-include; ls checkra1n/kpf/"
    expect: "No hits for the term outside Apple's vendored headers, and a patch component list that names trustcache, vm_prot, mach_port, vfs, dyld and ramdisk but no page-protection component."
    accept: "You found both the absence and the disabled APRR artifact: `grep -n -B3 -A6 kpf_aprr_patch checkra1n/kpf/vm_prot.c` shows the callback inside an `#if 0` block whose comment reads *doesn't work like this, needs new strat*, with the call site commented out further down the file."
    wrong_answer: "Concluding that page protection is covered because `vm_prot.c` exists and mentions APRR. The file exists and the patch in it is switched off."
  - number: 1
    question: "The post says the project's documentation contradicts itself on the supported version range. How many distinct claims can you find, and which is the narrowest?"
    command: "curl -s https://raw.githubusercontent.com/palera1n/palera1n/main/README.md | head -8; curl -s https://raw.githubusercontent.com/palera1n/palera1n/main/docs/palera1n.1 | grep -A2 '^\\.Sh NAME\\|^\\.Sh SUPPORTED'"
    expect: "Three distinct claims at least: the README's \"15.0 ... and higher\", the man page name line's \"15-26\", and the supported-devices section's \"15.0-18.0\"."
    accept: "You identified the supported-devices list as the narrowest and therefore the one to trust, and noted that the tvOS reconciliation is an inference rather than a published claim."
    wrong_answer: "Reporting the range as 15-26 because the man page's name line says so. That line is contradicted two lines below it by the same document."
  - number: 3
    question: "Are the two CoreTrust bugs memory-safety bugs or something else? Query the records instead of the commentary."
    command: "for c in CVE-2022-26766 CVE-2023-41991; do curl -s \"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=$c\" | python3 -c \"import json,sys; v=json.load(sys.stdin)['vulnerabilities'].pop()['cve']; print(v['id'], v['descriptions'].pop()['value'][:160])\"; sleep 7; done"
    expect: "Both described as certificate issues, one parsing and one validation, fixed in iOS 15.5 and 16.7. Neither is a use-after-free or an overflow. NVD returns the text in your locale, so the wording may arrive in another language."
    accept: "You can state the consequence the post draws: because the flaw is in chain validation rather than memory handling, exploiting it needs no kernel primitive, which is why it matters outside jailbreaking."
    wrong_answer: "Assuming a code-signing bypass must involve memory corruption. These two do not."
claims:
  - claim: "palera1n's open tree contains no page-protection patch, and its one APRR artifact is disabled."
    confidence: "high"
    authority: "our own grep and clone of palera1n/PongoOS at HEAD, 2026-10-14"
    limitations: "One commit, one fork. A shipped build could differ, and the tool's own PongoOS fork is what was read."
  - claim: "The project's documentation states its version range in at least three mutually inconsistent ways."
    confidence: "high"
    authority: "the README and the man page, fetched directly"
    limitations: "Which one the maintainers intend is not stated anywhere; the tvOS reconciliation is inference."
  - claim: "The two CoreTrust bugs are chain-validation flaws, and the later one was exploited in the wild."
    confidence: "high"
    authority: "NVD records for CVE-2022-26766 and CVE-2023-41991; Apple's in-the-wild statement"
    limitations: "The link to TrollStore comes from TrollStore's own README, not from an independent analysis."
  - claim: "Page-protection enforcement on A11 is bypassed by palera1n."
    confidence: "low"
    authority: "unresolved: Apple's platform table places the mechanism on A11, community material dates it from A12"
    limitations: "The post deliberately does not assert either reading, and nothing public settles it."
  - claim: "The Secure Enclave is untouched by this tool."
    confidence: "high"
    authority: "checkra1n's FAQ on passcode decryption; the shipped SEP exploit's A8, A9, A10 and T2 coverage"
    limitations: "The A11 detail, that the exploit cannot reach enclave memory at all, is community-sourced."
title: "The Patch That Isn't There: palera1n and the Rootless Era"
date: 2026-10-17T09:00:00+07:00
draft: false
tags: ["ios", "apple", "security", "jailbreak", "bootrom"]
summary: "The modern checkm8 continuation patches code signing, mount policy and task ports, and has no page-protection patch at all. What the gap in its own patch set says about the boundary everyone assumes is being crossed."
exercises:
  - number: 2
    question: "The post's central claim is a negative: no page-protection patch exists in palera1n's pre-boot environment. Check it yourself rather than taking it from the post."
    command: "git clone --depth 1 https://github.com/palera1n/PongoOS && cd PongoOS && grep -rnw 'PPL\\|ppl' --include='*.c' --include='*.h' . | grep -v apple-include; ls checkra1n/kpf/"
    expect: "No hits for the term outside Apple's vendored headers, and a patch component list that names trustcache, vm_prot, mach_port, vfs, dyld and ramdisk but no page-protection component."
    accept: "You found both the absence and the disabled APRR artifact: `grep -n -B3 -A6 kpf_aprr_patch checkra1n/kpf/vm_prot.c` shows the callback inside an `#if 0` block whose comment reads *doesn't work like this, needs new strat*, with the call site commented out further down the file."
    wrong_answer: "Concluding that page protection is covered because `vm_prot.c` exists and mentions APRR. The file exists and the patch in it is switched off."
  - number: 1
    question: "The post says the project's documentation contradicts itself on the supported version range. How many distinct claims can you find, and which is the narrowest?"
    command: "curl -s https://raw.githubusercontent.com/palera1n/palera1n/main/README.md | head -8; curl -s https://raw.githubusercontent.com/palera1n/palera1n/main/docs/palera1n.1 | grep -A2 '^\\.Sh NAME\\|^\\.Sh SUPPORTED'"
    expect: "Three distinct claims at least: the README's \"15.0 ... and higher\", the man page name line's \"15-26\", and the supported-devices section's \"15.0-18.0\"."
    accept: "You identified the supported-devices list as the narrowest and therefore the one to trust, and noted that the tvOS reconciliation is an inference rather than a published claim."
    wrong_answer: "Reporting the range as 15-26 because the man page's name line says so. That line is contradicted two lines below it by the same document."
  - number: 3
    question: "Are the two CoreTrust bugs memory-safety bugs or something else? Query the records instead of the commentary."
    command: "for c in CVE-2022-26766 CVE-2023-41991; do curl -s \"https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=$c\" | python3 -c \"import json,sys; v=json.load(sys.stdin)['vulnerabilities'].pop()['cve']; print(v['id'], v['descriptions'].pop()['value'][:160])\"; sleep 7; done"
    expect: "Both described as certificate issues, one parsing and one validation, fixed in iOS 15.5 and 16.7. Neither is a use-after-free or an overflow. NVD returns the text in your locale, so the wording may arrive in another language."
    accept: "You can state the consequence the post draws: because the flaw is in chain validation rather than memory handling, exploiting it needs no kernel primitive, which is why it matters outside jailbreaking."
    wrong_answer: "Assuming a code-signing bypass must involve memory corruption. These two do not."
---

I went looking for the page-protection patch. Every mental model of a modern jailbreak on these chips includes one: the kernel's page-table permissions are enforced by a mechanism the jailbreak has to get around, and on A11 that mechanism is specifically the interesting case.

So I cloned the pre-boot environment palera1n ships and grepped for it. The word does not appear anywhere in the tree. There is one A11-specific artifact, an APRR patch, and it sits inside a `#if 0` block whose first comment line reads: *doesn't work like this, needs new strat*. The callback is compiled out. The call site further down the same file is commented out too.

That absence is the most interesting thing in the project, and it is the honest starting point for the last part of this series.

> **The Core Takeaway:** A jailbreak's patch set is a statement about which boundaries its authors know how to cross. Reading what is missing from it is more informative than reading what is in it, because the gap is where the public record stops and the inference begins. Here the gap is page-protection enforcement on A11, and nothing public fills it.

## A fork that does not reimplement its ancestor

palera1n is the checkm8 continuation: A8 through A11 plus Apple T2, MIT-licensed, at `palera1n/palera1n` [1], with current maintainers listed as Nick Chan, CLARATION and mineek. The man page dates the first shell-script version to September 2022 and the current C tool to January 2023, describing the latter as using "checkra1n 1337 and a custom KPF" [2].

That description is worth taking literally, because the relationship is visible in the source rather than inferred from the docs. palera1n does not reimplement the bootrom exploit. It embeds a checkra1n binary, writes it out, and injects a helper library into it. Everything above that layer is its own: a bootstrapper, a payload, a loader, a privileged daemon, and a much larger patchfinder than upstream's.

There is a detail in the build code that deserves more attention than it usually gets. The build checks scan the supplied checkra1n binary for a specific credit string and flag it as a clone if they find it. Re-skinning this tool is a known and detected phenomenon, and the project detects it mechanically.

The device floor is also worth noting against its ancestor: checkra1n reached A7, and palera1n's own README says A8 through A11. The generations below A8 are checkm8-capable but not supported here.

## Five ways of stating the version range

A tool's documentation is a claim, and this one contradicts itself in five places [1][2].

| Source | Claim |
| --- | --- |
| README | iOS, iPadOS and tvOS 15.0 and higher |
| Website | versions 15 and higher |
| Man page, name line | arm64 iOS/iPadOS/tvOS 15-26, bridgeOS 5-10 |
| Man page, supported devices | arm64 iOS 15.0-18.0 |
| Archived docs | iOS and iPadOS 15 and higher |

The "26" in the name line is the outlier, and it has a plausible reconciliation: Apple TV HD is an A8 device, tvOS reached version 26, and tvOS is in scope. So the range may be per-platform rather than wrong, with the iOS ceiling sitting at 18 while the tvOS ceiling sits at 26. That reconciliation is an inference, not something a release note states, and no published claim ties iOS 19 or 26 to an iPhone or iPad.

> **Reconcile against the artifact with the narrowest job.** A man page's supported-devices list exists to be explicit, and it says 15.0 to 18.0. A README's tagline exists to sell the project, and it says "and higher". When the two disagree, the specific one is the one to trust, and the disagreement itself belongs in the writeup rather than being silently resolved.

{{< ex 1 >}}

## What the patch set contains, and the one thing it does not

The patchfinder covers a coherent set of boundaries, and reading it as a coverage map is more useful than reading it as a list of tricks. It patches code signing through the trust cache and the platform-integrity path, mount and vnode policy, task-port policy, the memory-mapping protection path so pages can be made writable and executable, the read-only allocation path, and the sandbox hooks. A separate step redirects the first user-space process into a substitute dynamic linker so that a payload is loaded before the system's own first daemon starts.

That is a jailbreak's worth of boundaries. Here is what is absent from the same tree:

- **No page-protection component.** Zero hits for the term anywhere in the pre-boot environment, in any file.
- **The one APRR artifact is disabled.** It is wrapped in `#if 0` with a comment saying the approach does not work and needs a new strategy, and its call site is commented out as well [3].
- **Its own comment explains why the general path is not enough.** The mapping patch is described as granting read-write-execute permissions at the page-table level, and the note adds that on A11 the APRR mechanism interferes by stripping the write bit from its default register values [3].

So the patch that would address that interference is inert. What palera1n actually relies on for A11 runtime page-table permissions is not documented publicly, and I am not going to infer it from an absence.

There is a second disagreement here, and it is between better sources than the last one. Apple's own documentation places page-protection enforcement on A11 and on A12 through A14, with a successor mechanism replacing it from A15 onward [8]. Community material instead treats page protection as an A12-and-later concern for app-based jailbreaks. Nothing in the public record reconciles the two, and the difference decides whether palera1n is crossing that boundary or never needed to.

{{< ex 2 >}}

## Rootless is a consequence, not a preference

The previous part ended on the signed system volume: from iOS 15, the bootloader verifies that the system volume's seal is intact and Apple-signed before starting the kernel, with no user opt-out on iOS and iPadOS.

Rootless is what that forces. The jailbreak tree cannot live on the system volume, so it lives in a per-boot directory under the preboot partition, reachable at a fixed path through a symlink [1][2]. Because the boot manifest hash is part of that path, an installation has to discover its own identity at runtime rather than assuming a location. The rootful alternative on these systems means carrying a copied filesystem on another volume, which is why rootful installs need a multi-gigabyte fake filesystem and several minutes to build one [2].

| | Rootful | Rootless |
| --- | --- | --- |
| Where the jailbreak lives | On the root filesystem, in the traditional locations | A per-boot directory reachable through a symlink |
| Cost | A large fake filesystem on a second volume, slow to create | Packages must be rebuilt for the newer architecture triple |
| Why it exists | The historical model | The signed system volume, which cannot be written |
| tvOS and bridgeOS | The only supported mode | Not supported |

The interesting property is what rootless does not do. It does not break the seal; it routes around it [1]. Nothing in the jailbreak writes the sealed volume, which means the mitigation is doing its job and the jailbreak has simply moved.

The post-exploitation checklist that follows from rootless is a sequence of boundary crossings rather than a list of tricks: make the container writable, discover the per-boot identity, get unsigned binaries into the trust cache so the kernel will map them, borrow an existing process's entitlements rather than patching its flags, and keep a daemon holding the kernel primitive so the initiating app can exit. That last step is the persistence seam, and it is why a jailbroken device has a privileged service running.

## CoreTrust matters more than the jailbreak does

Of everything in this part, the piece with the widest reach is the code-signing path, because it does not need a kernel exploit at all.

CoreTrust is the kernel-resident signature verifier introduced with iOS 12, which for App Store and platform applications replaces the user-space validation daemon [5]. Its verdict is what grants an app the platform flag and arbitrary entitlements. Two bugs in that lineage are public, and both are chain-validation flaws rather than memory-safety bugs:

- **CVE-2022-26766**, found by Linus Henze, in which the check did not validate against a root certificate on production devices. Fixed in iOS 15.5 [5].
- **CVE-2023-41991**, a certificate-validation issue in which binaries with multiple signers are mis-verified. Found exploited in the wild by Google's threat analysis group, fixed in iOS 16.7 [6], and the bug that TrollStore relies on [7].

That second one is the one to sit with. TrollStore uses it to make a locally installed app permanently self-signed with arbitrary entitlements, on a stock device, with no jailbreak and no kernel primitive [7]. The consequence for anyone building trust decisions on top of app identity is direct: an entitlement is a claim that was validated once, and if the validator can be made to accept a chain it should have rejected, then "this app has the entitlement" stops being evidence of anything.

> **A signing bug is a trust bug, not a jailbreak bug.** The jailbreak framing makes these look like a niche concern for people who want to modify their devices. The actual property is that entitlement-based trust in an application can be manufactured locally, which matters to every system that treats an entitlement as proof of provenance.

{{< ex 3 >}}

## The other path, and why it cannot replace this one

Dopamine is the modern app-based jailbreak and the useful contrast, because it needs no cable and no bootrom bug. It covers a range of iOS 15 and 16 versions, with the README and the project website grouping the supported chips differently, which is the same documentation pattern as palera1n's.

Its primitive is a user-space-reachable kernel bug giving a physical use-after-free, then kernel read and write. The published methods are individually CVE-numbered, and the project's own tree adds several more, which tells you the shape of the problem: each one is fixed on a schedule, and the jailbreak's coverage is bounded by whichever bugs still work on the version you happen to be running. Post-exploitation, it maps kernel physical memory into a process and inserts trust-cache entries, with a flag in its information structure indicating whether it needs a pointer-authentication bypass [9].

It cannot stand in for checkm8 on A8 through A11. It needs a fresh user-space kernel exploit per version, its known methods were fixed across three point releases, and it never touches the boot chain. The bootrom bug is the only thing in this space that does not expire.

## The limits, stated plainly

- **The Secure Enclave is untouched.** The SEP exploit that ships in the patchfinder covers A8, A9, A10 and T2, and on A11 it cannot reach the enclave's memory at all, the memory integrity tree preventing it [3]. So the enclave is not a boundary this tool crosses.
- **On A11, the passcode and the jailbreak are mutually exclusive.** The documentation is explicit that the passcode cannot be used while jailbroken, and on iOS 16 it must have been off since the restore. That is not a bug in the tool; it is what an untouched enclave implies.
- **Data Protection is not attacked.** checkra1n's own FAQ answers the question directly: no, it cannot decrypt your data or get into a locked device [4]. What checkm8 does yield is a SecureROM dump and firmware keybag material, which is firmware analysis rather than user data. From A11, sealed key protection keeps key material unavailable off-device [8].
- **A11 is the ceiling.** A12 and later fix the variant used on A9X through A11, palera1n's man page states that arm64e devices will never be supported [2], and A11 is the last chip before pointer authentication arrives. Everything in this part is a property of the pre-pointer-authentication generation.

## What the public record does not establish

- **The A11 page-table mechanism**, as described above. The patch is compiled out, and what the tool relies on instead is not documented anywhere I could find.
- **Whether A11 page protection is bypassed at all.** Apple's table and the community material disagree about which chips have it, and the two records are irreconcilable from outside.
- **What "checkra1n 1337" is.** The embedded binary is closed source, so the layer beneath palera1n is a black box with a version number attached.
- **The meaning of a bare line in the man page's history**, which reads "Something happened on August 15, 2023" with no explanation. It is either an in-joke or a lost release note, and there is no way to tell which.
- **Any iPhone or iPad claim beyond iOS 18.** The tvOS range reaches 26; the iOS range does not, and nothing published says otherwise.

## What the three eras say together

The first part of this arc was about a bug no update could reach. The second was about bugs that were patched within days, shipped by a tool whose own source stopped being published halfway through its life. This one is about a tool that inherits the first era's permanence and spends its patch set on the boundaries that still exist above it.

Three things carry across all of them.

**Patchability and fixability are different properties.** A bootrom bug has a fix that is not a patch: a different chip. A userland bug has a patch that may not be a fix for the people running the vulnerable version. Both end up in the same place, which is that the security boundary is a device lifecycle decision rather than a release decision.

**The trust anchor is per-silicon or per-release, and you can tell which by reading the artifacts.** One generation's anchor is a mask ROM that cannot change, the other's is a boot-time seal that changes with each release. The threat model that ignores which one it is holding will be wrong about remediation.

**And the boundary that decides the user experience is code signing.** Every one of these tools is, in the end, an argument with the signature check. The bootrom era replaced the verifier. The userland era patched the trust cache. The modern era found a chain-validation flaw and made it permanent. If you only read one layer of any of them, read that one.

## References

[1] [palera1n/palera1n](https://github.com/palera1n/palera1n): the tool's own README, its licence, its maintainers, and how it describes rootless and rootful.

[2] [the palera1n man page](https://raw.githubusercontent.com/palera1n/palera1n/main/docs/palera1n.1): the history dates, the version claims that contradict the README, the device list, the semi-tethered wording, and the statement that arm64e devices will never be supported.

[3] [palera1n/PongoOS](https://github.com/palera1n/PongoOS): the pre-boot environment whose tree contains no page-protection patch and one disabled APRR artifact, plus the patch components it does load.

[4] [checkra.in](https://checkra.in/): the ancestor's FAQ, including the answer on passcode and data access, which is the boundary statement this part leans on.

[5] [NVD record for CVE-2022-26766](https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2022-26766): the certificate-parsing flaw and its fix version, the first of the two chain-validation bugs.

[6] [NVD record for CVE-2023-41991](https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2023-41991): the certificate-validation flaw, its fix version, and Apple's in-the-wild statement.

[7] [opa334/TrollStore](https://github.com/opa334/TrollStore): what the self-signing property is used for, and why it needs no kernel primitive.

[8] [Apple Platform Security: hardware security overview](https://support.apple.com/en-vn/guide/security/hardware-security-overview-secf020d1074/1/web/1): where page-protection enforcement applies by chip generation, and what sealed key protection covers from A11.

[9] [opa334/Dopamine](https://github.com/opa334/Dopamine): the app-based path that needs no bootrom bug, its per-version primitives, and its post-exploitation steps.

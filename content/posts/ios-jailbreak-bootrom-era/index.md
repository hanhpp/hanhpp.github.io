---
title: "One Stale Pointer Before the OS Boots: checkm8 and the Boot ROM Era"
date: 2026-10-15T09:00:00+07:00
draft: false
tags: ["ios", "apple", "security", "jailbreak", "bootrom"]
summary: "The boot ROM is the one component no update can reach, so a bug in it is a bug in the hardware's own trust anchor. What checkm8 established about unpatchable vulnerabilities, read from the public record rather than from a device."
---

The [patch-margin method]({{< ref "xnu-patch-margin-research" >}}) from earlier in this series is about reading the fix first: find the patch, diff it, and let the shape of the change rank your candidates. I took that method to checkm8 and it returned nothing. Not because the patch is secret. There is no patch. The bug sits in code laid down when the silicon was fabricated, and the only remediation ever offered for it is a different chip.

That single property changes the questions worth asking. A bug you can expect to be fixed is a scheduling problem: report it, wait, watch the diff. A bug that cannot be fixed is a trust-anchor problem, and it is worth reading as one.

> **The Core Takeaway:** When a vulnerability lives in a mask ROM, "will this be patched" has no answer, and "what did this chip promise" becomes the only useful question. checkm8 is the clearest worked example in Apple's line: a use-after-free in the first code the processor runs, reachable only with a cable, unpatchable on every chip from A5 through A11.

{{< figure src="boot-chain.svg" alt="The Apple boot chain from SecureROM through iBoot, kernel and user space, with the point where checkm8 grants control and the Secure Enclave shown as a boundary it does not touch." caption="The exploit lands before the first signature check, which is why replacing the verifier works where defeating it would not" >}}

## Four works, one of them closed

The public material around checkm8 is unusually easy to misattribute, and the misattribution is itself instructive.

| Work | Author | Licence | What it is |
| --- | --- | --- | --- |
| checkm8 | `axi0mX`, disclosed 2019-09-27 | GPL-3.0, in `axi0mX/ipwndfu` | The exploit itself |
| checkra1n | A team, led by Luca Todesco | Closed source, binary only | The jailbreak built on it |
| PongoOS | checkra1n org | Open | A pre-boot execution environment, not a jailbreak |
| KPF | checkra1n org | Open | The kernel patchfinder checkra1n loads into it |

The README in `ipwndfu` describes checkm8 as "a permanent unpatchable bootrom exploit for hundreds of millions of iOS devices" and adds that it is "meant for researchers" [1]. The disclosure thread is careful in the same way: "not a full jailbreak with Cydia, just an exploit", useful for dumping SecureROM, decrypting keybags, and demoting a device for JTAG work.

Then there is the trap. A repository named after checkm8 or checkra1n is not the canonical one. `nat748/checkm8-jailbreak` bundles the exploit with an "Inferno iPhone 11 emulator" and a Sileo bootstrap, and lists A13 and iPhone 11 as supported, qualified as "(emulated)". Two things are wrong there at once: iPhone 11 is A13, which checkm8 does not touch, and checkra1n installs Cydia rather than Sileo. A reader who takes a GitHub search result as the source of record inherits both errors, and neither is subtle once you know the device map.

> **Check the claim against the silicon, not the repository.** A project that names an exploit is evidence of interest in that exploit, not evidence about which chips it reaches. The SoC table is the ground truth, and it is short.

## The bug: a pointer that outlives its buffer

SecureROM is the first code the application processor executes on a cold boot. It is a stripped-down relative of iBoot, and its two jobs are to load the next boot stage and to serve DFU over USB.

DFU allocates one global buffer for the data phases of USB control transfers. A setup packet causes the stack to copy a pointer to that buffer into a global and begin the data phase. When DFU exits, the buffer is freed and the global pointer is not cleared. If the data phase is interrupted early, by a host stack willing to violate the specification or by an abort mid-transfer, the stale pointer survives into the next DFU cycle and a later write lands in freed memory.

That is the whole vulnerability: a use-after-free of a transfer buffer, driven from the host, reachable only with physical access [4]. CERT's advisory classifies it the same way, and names checkm8 as the public exploit for it [2].

The interesting part is what happens next, because the path to control is not one payload. It differs by chip:

- **A8 and A9**: a DFU-abort bug leaks a task structure that can be relinked, so register state is recovered on the next schedule and code runs directly. No return-oriented programming required.
- **A7, A9X, A10, A10X, A11**: the ROM reallocates deterministically, so a second bug is needed. A leak of pending zero-length-packet requests survives USB teardown and triggers only for certain packet shapes, which allows an exactly-sized hole to be groomed for the following allocation.
- **A5**: the route needs full control of host-side USB traffic that a PC stack will not provide, so it uses dedicated USB host hardware.

Note how the discovery happened, because it is the part that transfers. `axi0mX` found the bug by reading a fix: Apple hardened the iBoot USB code during the iOS 12 betas in the summer of 2018 [1]. The DFU path in the application processor boot chain was repaired after those SoCs had shipped, and the ROM copy of the same logic could not be. That method did not fail here. It is what surfaced the bug in the first place, one layer up from where the bug was permanent.

## Replacing the verifier beats defeating it

SecureROM is the root of trust, which means code execution there precedes iBoot, the kernel, and every verification decision downstream of them. That is a different position from a kernel bug, and it produces a different shape of attack.

The bootkit hooks the trampoline each boot stage uses to hand control to the next one, recognisable because it resets CPU state almost to power-on, and keeps it resident [5]. The final invocation then patches the kernel while it is still writable. No signature check fails at any point. The chain is not broken by a verification error, it is inverted, because the verifier was replaced before it ran.

At the ROM level there is nothing to verify in the first place. Nothing is loaded there, so there is no signature to check.

PongoOS is what makes that position usable. It is, in its own description, "a pre-boot execution environment for Apple boards", giving a shell, module loading, and the patchfinder [7]. It is not a jailbreak. checkra1n gained it in 0.9.8, replacing earlier patching from inside the ROM, and the tools that came after, palera1n among them, build on it.

What the boundary does not reach matters as much as what it does:

- **The Secure Enclave and its own ROM.** Untouched. It is a separate processor with a separate boot chain.
- **Data Protection.** The keybag keys are entangled with the device UID, which lives behind the Secure Enclave, so file-level encryption is not defeated by a boot-chain bug.
- **The mask ROM contents.** They are never written. The ROM is relocated into SRAM and remapped, so the modification is per-boot and evaporates on power loss.
- **Anything remote.** The trigger needs a cable and DFU mode. This is a physical-access vulnerability in the strictest sense.

## Persistence is decided by the mechanism, not the branding

Jailbreak persistence has three words that get used loosely, and the distinction is mechanical rather than a matter of taste.

| Model | What a reboot does | Why |
| --- | --- | --- |
| Tethered | The device will not boot without a host | The device depends on host-supplied code to start |
| Semi-tethered | Boots stock iOS normally; the jailbreak is gone until the host runs again | The patch is in memory only; the boot chain is untouched on disk |
| Untethered | Survives the reboot with no host | Persistence lives somewhere that outlives power loss |

checkra1n is semi-tethered, and the mechanism is the reason. The exploit runs from the host over DFU, the ROM is unmodified, and the patched kernel exists only in memory. A plain reboot therefore boots stock iOS, and jailbreak-installed software will not run until the device is put back into DFU and the tool is run again. The bootstrap sits on disk and survives; the state that lets it run does not.

Untethered would require a USB host embedded in a cable or a dongle, a point `axi0mX` raised at disclosure rather than something the exploit prevents.

> **Recorded disagreement, not resolved here.** `axi0mX` and Ars Technica described checkm8 as enabling only *tethered* jailbreaks, while checkra1n is documented as *semi-tethered*. Both are describing different objects: the exploit run, which is tethered to a host, and the resulting jailbreak, which is semi-tethered. When the literature appears to contradict itself on this point, it usually is not contradicting itself.

## Devices and versions

CERT states the affected range as A5 through A11 [2]. The table below maps the families to products, with the caveat that the tool support lists have aged unevenly.

| SoC family | Examples | checkm8 status |
| --- | --- | --- |
| A5, A5X | iPhone 4S, iPad 2, iPad 3 | In scope; A5 needs dedicated USB host hardware |
| A6, A6X | iPhone 5, iPad 4 | In the 2019 release set |
| A7 | iPhone 5s, iPad Air | Release set; checkra1n's floor |
| A8, A8X | iPhone 6, iPad Air 2, HomePod | DFU-abort task leak route |
| A9, A9X | iPhone 6s, iPad 5, iPad Pro 1 | Same route; A9X uses leak-based grooming |
| A10, A10X | iPhone 7, iPad 6, Apple TV 4K | Release set |
| A11 | iPhone 8, iPhone X | Release set; top of the range |
| S1P, S2, S3, T1 | Apple Watch S1 to S3, MacBook Pro T1 | In the release set |
| T2 | iMac Pro, MacBook Pro (bridgeOS) | Experimental in checkra1n 0.9.9 |
| A12, A12X, A13 | iPhone XS, XR, iPhone 11 | Not vulnerable to checkm8 |

On versions: the last mainstream checkra1n build, 0.12.4 beta, targets iOS 12.0 to 14.8.1, iPadOS 13.1 to 14.8.1 and tvOS 12.0 to 14.7 [6]. The team's own tracker states iOS 12.0 to 14.8 with A7 to A11. Later 0.1337.x builds boot PongoOS on A7 and up as far back as iOS 7, but they do not jailbreak. On iOS 14, A11 additionally requires the passcode to be removed and a check skipped, which the team labels "not recommended" [6]. A jailbreak that needs the passcode gone is a jailbreak that has already given up on the strongest part of the platform.

## What the public record does not establish

- **No Apple statement exists on checkm8.** CERT records "We have not received a statement from the vendor", and no Apple security note for the CVE is cited anywhere in this research. The immutability argument rests on Apple's general description of the boot ROM as immutable code laid down during SoC fabrication [8], plus CERT's own sentence: because SecureROM is read-only, it cannot be patched with a firmware update [2]. That is strong, and it is not a vendor statement about this bug.
- **The two records disagree about the attack vector.** CERT carries a v2-era vector, `AV:L`, base 5.6 [2]. NVD carries the v3.1 vector, `AV:P`, base 6.8 [3]. Local and physical are not the same claim, and the difference matters for anyone scoring exposure.
- **checkra1n's user space internals are not public.** The binary was never open sourced. The stage sequence described above comes from the author's conference material and release notes, so the user-space half, including how the loader is installed and how code signing is handled there, is documented at a level of detail the artifacts do not confirm.
- **The A12 sentence has since moved.** In June 2026 researchers at Paradigm Shift published `usbliter8`, a different SecureROM bug, in the USB controller rather than the DFU stack, reported to affect A12 and A13 while A11 dodges it through a different USB implementation and A14 and later are fixed. Their writeup was offline when this was researched, so the claim currently rests on press reporting [9]. A12 and A13 are not vulnerable to checkm8. They may not be clean either.
- **The support lists have aged.** `ipwndfu` still lists A5 variants, A8, A9 and T2 as future support, although checkra1n clearly reached several of them [1]. Either the list is stale or that support arrived in other tools. Do not read it as a current statement of coverage.

## What this means if you are not jailbreaking anything

Three things transfer from this case, and none of them require a device.

**Retirement is a security control.** When a bug cannot be patched, the remediation is the hardware, which turns a fleet-refresh cycle into a security boundary. Any organisation that keeps A11-and-earlier devices in service past their replacement schedule is running unpatchable code by choice.

**"Immutable" is a property with consequences in both directions.** It is why the boot chain is hard to subvert and why a bug in it can never be fixed. The same design decision appears on both sides of the ledger, and a threat model that only counts one side will misjudge the platform.

**Physical access is the whole threat model here.** The vector is `AV:P`, the trigger is a cable, and the state is per-boot. That bounds it sharply against remote attackers and not at all against whoever holds the device, which is the case that matters for a lost or seized handset.

The userland era had the opposite problem: the bugs were patchable, the fixes shipped in days, and the interesting question became how fast a working exploit could be rebuilt from a diff. That is the next part, on unc0ver, `voucher_swap`, SockPuppet, and the code-signing boundary that turned out to be load-bearing: [Part 6: the userland era](/posts/ios-jailbreak-userland-era/).

## References

[1] [axi0mX/ipwndfu](https://github.com/axi0mX/ipwndfu): the exploit itself, its licence, the README's own description, and the SoC support lists.

[2] [CERT VU#941987](https://www.kb.cert.org/vuls/id/941987): the use-after-free classification, the read-only argument, the A5 through A11 range, and the record that no vendor statement exists.

[3] [NVD record for CVE-2019-8900](https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2019-8900): the CVE, its publication date, and the CVSS 3.1 vector with a physical attack.

[4] [littlelailo's writeup of the DFU transfer-buffer bug](https://gist.github.com/littlelailo/42c6a11d31877f98531f6d30444f59c4): the buffer and pointer mechanism behind the use-after-free.

[5] [Luca Todesco, POC 2019](https://papers.put.as/papers/ios/2019/LucaPOC.pdf): the bootkit's hand-off trampoline, and the ordering argument that patch protection initialises after the patch lands.

[6] [checkra.in](https://checkra.in/): the semi-tethered model, the version range of the last mainstream build, and the A11 passcode requirement.

[7] [checkra1n/pongoOS](https://github.com/checkra1n/pongoOS): the pre-boot environment's own description, and the patch components it loads.

[8] [Apple Platform Security: hardware security overview](https://support.apple.com/en-vn/guide/security/hardware-security-overview-secf020d1074/1/web/1): the immutable boot ROM wording that the unpatchability argument rests on.

[9] [The Register on usbliter8](https://www.theregister.com/security/2026/06/19/researchers-drop-checkm8-style-bootrom-exploit-for-a12-and-a13-iphones/5259028): the A12 and A13 SecureROM bug reported in June 2026, press-level because the researchers' own writeup was offline.

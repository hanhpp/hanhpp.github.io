---
title: "REA: An Introduction, and the Game-Reversing Scene It Arrived In"
date: 2026-10-15T15:00:00+07:00
draft: false
tags: ["reverse-engineering", "ai", "architecture"]
summary: "Every result the tool returns carries its own confidence, its authority, and its limits, which is the discipline a claim about a shipped game needs. What REA is, and what people are using it for, from a PC-98 bullet pattern to PS5 executables relinked into native ports."
exercises:
  - number: 1
    question: "How many commands does the CLI actually register?"
    command: "rea --help | grep -cE '^ +[a-z][a-z0-9-]+ +[A-Z]'"
    expect: "90"
    accept: "The frozen inventory in dist/cliCommandNames.js holds 88. The two the help lists without registering are mcp and completions, which scripts/rea.mjs answers before the CLI sees the arguments."
    wrong_answer: "Reading 90 as the number of registered commands, so that a later diff against the source looks like drift instead of a dispatcher."
  - number: 2
    question: "What vocabulary does a result use to describe how well it knows what it told you?"
    command: "P=\"$(dirname \"$(command -v rea)\")/../lib/node_modules/rea-agents\"; grep -oE '\"(shipped-artifact|controlled-replay|historical-reference|external-service|analyst-inference)\"' \"$P/dist/domain/evidence.js\" | sort -u"
    expect: "five lines, one per authority tier"
    accept: "This field decides whether an answer rests on the artifact itself, on a replay you controlled, on a reference tree, on a service you called, or on nothing but your own reasoning."
    wrong_answer: "Treating every result as equally grounded because each one carries a hash."
  - number: 4
    question: "What does a provider refusal actually look like?"
    command: "P=\"$(dirname \"$(command -v rea)\")/../lib/node_modules/rea-agents\"; grep -n 'cannot enforce the selected architecture' \"$P/dist/ghidra/GhidraProvider.js\""
    expect: "a reason string naming the universal Mach-O and telling you to analyze a thinned slice instead"
    accept: "A refusal with a code and a sentence attached is a result, not a crash. It says the boundary belongs to the provider, and that one lipo command moves it."
    wrong_answer: "Concluding that the tool cannot read Mach-O at all, when it read the header, understood it, and declined on the provider's behalf."
  - number: 3
    question: "Which projects does the tool's own documentation lead with, and what kind of work are they?"
    command: "curl -s https://cdn.jsdelivr.net/gh/morluto/rea@main/README.md | grep -oE '[]][(]https://github[.]com/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+[)]' | sed 's/^](//; s/)$//' | sort -u; curl -s https://cdn.jsdelivr.net/gh/morluto/rea@main/README.md | grep -o 'rea[.]tools/showcase/[a-z0-9-]*/' | sort -u"
    expect: "the project's own repository, two reconstruction repositories under another author's account (dx-ball and th04), and three showcase pages: dx-ball, notion and th04"
    accept: "Two of the three case studies are games, and the third is a desktop app. The tool is being introduced through reconstruction work rather than through malware analysis, which is a statement about who adopted it first."
    wrong_answer: "Assuming a general-purpose reversing tool would lead with security research. It leads with a sound-pan calculation and a bullet pattern."
claims:
  - claim: "REA 5.0.0 registers 88 one-shot commands, and its help lists 90."
    confidence: "high"
    authority: "Our own measurement of the installed build: the frozen inventory in dist/cliCommandNames.js, and the help output."
    limitations: "Counted on 5.0.0. Upstream published 6.5.0 on 2026-10-14, so this number describes one build."
  - claim: "Every result carries a confidence value, an authority tier, its limitations, and a content-derived evidence id."
    confidence: "high"
    authority: "The installed source at dist/domain/evidence.js."
    limitations: "Two of those fields, confidence and limitations, are authored by the producing operation rather than measured independently."
  - claim: "Analysis and capture run with the invoking user's authority, inside no operating-system sandbox, and setup writes into agent client configuration."
    confidence: "medium"
    authority: "A capability review from 2026-10-08, the tool's own environment.isolation field whose permitted values include none, and our own setup, which wrote six client registrations."
    limitations: "isolation is a value the tool records, not a boundary it enforces. We did not attempt to escape anything."
  - claim: "The tool's own documentation leads with game reconstruction: two of its three case studies are games, and the third is a desktop application."
    confidence: "high"
    authority: "The project README's case-study section, and the two reconstruction repositories it links."
    limitations: "A lead is not a survey. The documentation's ordering says who arrived first, not what the tool is only good for."
  - claim: "Porting console games by relinking their executables, with no CPU emulation, is an active 2026 practice, and PS5 is its loudest target."
    confidence: "medium"
    authority: "The porting projects' own READMEs, and trade press coverage of one of them."
    limitations: "These are separate projects, and I found no evidence that any of them uses REA. The pattern is shared, the toolchain is not established."
  - claim: "At this level of attention, lookalike repositories for the same tools exist, and both projects warn about them."
    confidence: "high"
    authority: "The REA README's official-sources warning, and the AnyPS5 project's own page on identifying its official repository."
    limitations: "We did not audit any lookalike for malice. Copying a name and a README is what was observed."
  - claim: "Browser capture works against a loopback Chrome DevTools Protocol endpoint."
    confidence: "medium"
    authority: "The shipped tool contract for the browser provider."
    limitations: "Read from the contract text and the target-selection path, not probed against a remote host."
title: "REA: An Introduction, and the Game-Reversing Scene It Arrived In"
date: 2026-10-15T15:00:00+07:00
draft: false
tags: ["reverse-engineering", "ai", "architecture"]
summary: "Every result the tool returns carries its own confidence, its authority, and its limits, which is the discipline a claim about a shipped game needs. What REA is, and what people are using it for, from a PC-98 bullet pattern to PS5 executables relinked into native ports."
exercises:
  - number: 1
    question: "How many commands does the CLI actually register?"
    command: "rea --help | grep -cE '^ +[a-z][a-z0-9-]+ +[A-Z]'"
    expect: "90"
    accept: "The frozen inventory in dist/cliCommandNames.js holds 88. The two the help lists without registering are mcp and completions, which scripts/rea.mjs answers before the CLI sees the arguments."
    wrong_answer: "Reading 90 as the number of registered commands, so that a later diff against the source looks like drift instead of a dispatcher."
  - number: 2
    question: "What vocabulary does a result use to describe how well it knows what it told you?"
    command: "P=\"$(dirname \"$(command -v rea)\")/../lib/node_modules/rea-agents\"; grep -oE '\"(shipped-artifact|controlled-replay|historical-reference|external-service|analyst-inference)\"' \"$P/dist/domain/evidence.js\" | sort -u"
    expect: "five lines, one per authority tier"
    accept: "This field decides whether an answer rests on the artifact itself, on a replay you controlled, on a reference tree, on a service you called, or on nothing but your own reasoning."
    wrong_answer: "Treating every result as equally grounded because each one carries a hash."
  - number: 4
    question: "What does a provider refusal actually look like?"
    command: "P=\"$(dirname \"$(command -v rea)\")/../lib/node_modules/rea-agents\"; grep -n 'cannot enforce the selected architecture' \"$P/dist/ghidra/GhidraProvider.js\""
    expect: "a reason string naming the universal Mach-O and telling you to analyze a thinned slice instead"
    accept: "A refusal with a code and a sentence attached is a result, not a crash. It says the boundary belongs to the provider, and that one lipo command moves it."
    wrong_answer: "Concluding that the tool cannot read Mach-O at all, when it read the header, understood it, and declined on the provider's behalf."
  - number: 3
    question: "Which projects does the tool's own documentation lead with, and what kind of work are they?"
    command: "curl -s https://cdn.jsdelivr.net/gh/morluto/rea@main/README.md | grep -oE '[]][(]https://github[.]com/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+[)]' | sed 's/^](//; s/)$//' | sort -u; curl -s https://cdn.jsdelivr.net/gh/morluto/rea@main/README.md | grep -o 'rea[.]tools/showcase/[a-z0-9-]*/' | sort -u"
    expect: "the project's own repository, two reconstruction repositories under another author's account (dx-ball and th04), and three showcase pages: dx-ball, notion and th04"
    accept: "Two of the three case studies are games, and the third is a desktop app. The tool is being introduced through reconstruction work rather than through malware analysis, which is a statement about who adopted it first."
    wrong_answer: "Assuming a general-purpose reversing tool would lead with security research. It leads with a sound-pan calculation and a bullet pattern."
---

I asked a reversing agent whether an Electron application registers IPC handlers. It answered zero.

One line further down, in the same output, it said graph coverage was incomplete. I counted by hand: ten handler registrations across two files.

Both statements were true. The tool classifies a file by the role it plays in the application, and the tree I had handed it contained no main process declaring `webPreferences.preload`. With no main process there is no role to find, so the count was not established rather than zero. Anyone skimming the summary would have published a wrong number, and the tool had already said why.

That gap, between what a tool saw and what it was able to look at, is why this tool is worth the afternoon it takes to set up, and it is the reason the reconstruction scene picked it up: a claim about a shipped artifact is only ever as good as its stated limits.

> **The Core Takeaway:** every result this tool returns carries its own confidence, its authority and its limits, and the reconstruction scene adopted it because that is the discipline a claim about a shipped game needs. Two of the three case studies its own documentation leads with are games.

## What it actually is

REA is a Node CLI and an MCP server that gives an agent structured access to analysis engines running on your own machine [1]. It ships no agent loop and no model client, so it never decides what to look at next: you or your agent decides, and REA turns that decision into a bounded operation with a result attached.

It is also not only a bridge to someone else's decompiler. It carries its own parsers for container and metadata formats, and reaches for Ghidra, Hopper, IDA Pro or JADX when the question needs real decompilation. The project publishes its own architecture graph, which is where to check that claim rather than taking it from a review [2].

The number that anchors the surface: **88 one-shot commands**, frozen in one file, plus an MCP server for agents. `rea --help` prints 90, because `mcp` and `completions` are answered by the dispatcher before the CLI is involved. That discrepancy is worth noticing, because it is the shape of the whole tool: a small number of entry points, and a surface that grows by adding a bounded operation rather than by growing a switch statement.

One practical note before the commands in this post: they locate the package through the `rea` binary's own directory rather than through npm, because npm's idea of the global install root is not always the one holding this package. On this machine `npm root -g` names a different Node installation, and the package is not under it.

{{< ex 1 >}}

## Every answer carries its own standing

This is the part I would copy into my own tooling whether or not I ever ran the tool again. Every result is a triple: the result, an evidence id, and a record saying how much the result is worth.

| Field | Permitted values | What it answers |
| :--- | :--- | :--- |
| `confidence` | observed, derived, inferred | Was this read, computed, or guessed |
| `authority` | shipped-artifact, controlled-replay, historical-reference, external-service, analyst-inference | What gives this claim its force |
| `limitations` | free strings, attached by the producing operation | What this operation could not see |
| `locations` | address, address-range, artifact-path, file-offset, file-offset-range | Where in the artifact it holds |
| `environment.isolation` | none, process, container, virtual-machine | What contained the observation |

`authority` is the field I had not seen anywhere else, and it is not decoration. A string read out of a shipped artifact and a string produced by replaying a scenario you controlled are different kinds of fact even when they agree, and a claim that rests on an analyst's reading is a third kind. Recording which one you have means a later reader can re-weigh the claim without re-running anything.

{{< ex 2 >}}

The id is content-derived, and the record refuses to be edited: parsing a record recomputes the id from the record's own fields and throws if the two disagree, so a hand-edited evidence bundle fails to load rather than passing quietly.

## What people are reversing with it

The documentation leads with reconstruction work, and two of its three case studies are games. That ordering is a statement about who adopted the tool first.

| Case study | What was reconstructed |
| :--- | :--- |
| DX-Ball: a sound-pan calculation | Follow a sound call into its position-to-pan helper, read the instructions, and turn incomplete pseudocode into C. The result is checked against 3,205 original-x86 cases and reproduces all 63 compiled function bytes [4] |
| TH04, a PC-98 Touhou game: a bullet-ring calculation | Read 16-bit instructions out of the original release, recover the fixed and aimed angle calculations, and compare the reconstructed C++ against the historical compiler output [3] |
| Notion: an Electron clipboard bridge | Find the renderer's clipboard API and follow it through preload and IPC into the main process, then inspect the rich clipboard format [3] |

The scale beyond one case study is larger than I expected. An auto-refreshed index of decompiled, recompiled and reverse-engineered games currently lists **2,036 projects covering 1,773 games**, spanning matching decompilations, static recompilations and source ports [5]. That is the tradition this tool landed in: not a lone researcher with a debugger, but a field where the answer is often a repository that compiles back into the original binary.

The loudest thread in 2026 is consoles, and specifically the attempt to run their games on a PC **without emulating the console**:

- **AnyPS5** relinks PS5 executables into native Linux and Windows binaries [6].
- **PortPS5** converts decrypted PS5 dumps into native Windows executables through binary relinking, replacement system libraries and Vulkan, written in C++23, and says in its own README that no CPU emulation is involved [7].
- **KytyPS5** takes the other route, a translation layer for Windows, Linux and macOS [8].

To be exact about what that list is and is not: those are separate projects, and I found no evidence that any of them uses REA. What they share is the method the case studies demonstrate, where a reconstruction is checked against the original rather than asserted about it. The same shift is visible one layer up, in tooling built for agents rather than for people: a skill now exists for a coding agent whose whole job is reversing retro games, from disassembly to asset extraction to a playable web port [9].

> **Check where a tool came from before you install it.** This much attention buys counterfeit repositories. REA's own README says it plainly, that a similar repository name or a copied README does not establish that a download is official, and directs you to its repository, its site and its npm package. The console projects have the same problem badly enough that one of them maintains a page explaining which repository is the real one [6]. An install that starts from a search result is an install with no provenance.

{{< ex 3 >}}

## The command surface is organised by work, not by platform

| Family | Count | What it does |
| :--- | --: | :--- |
| `inspect-*` | 22 | One artifact, member, or surface at a time |
| `trace-*` | 8 | Follow one seed through references |
| `compare-*` | 8 | Diff two authenticated evidence bundles |
| `capture-*` | 5 | Run one bounded scenario and return evidence |
| `observe-*` | 4 | Watch something you drive yourself |
| `project-*` | 3 | Project authenticated inventory into an application graph |
| provider-backed analysis | 8 | `decompile`, `function`, `xrefs`, `read-bytes` and friends |
| evidence management | 6 | Validate, import, export, diff |
| the rest | 24 | Setup, providers, doctor, update, uninstall, search, extraction, firmware |

That grouping is a design decision worth stealing. The commands are named after the question, not after the artifact kind, so `inspect-artifact` and `compare-application-versions` work the same way whether the target is an asar, an APK, a managed assembly or a page bundle. The platform shows up in the parsers and the provider selection, not in the vocabulary you have to learn. Upstream documents the current surface rather than the one you have installed, so pair the reference with `rea --version` [10].

## What it will not do

| Claim | Reality |
| :--- | :--- |
| It is a sandbox | Analysis and capture run with your user's authority. Isolation is a value in the record, and on this machine it reads `none` |
| It can reach anything | Browser capture works against a loopback Chrome DevTools Protocol endpoint |
| It always works | A missing decompiler is a refusal with a named code, not a silent substitute at lower fidelity |
| It is portable | macOS and Linux carry the depth. Windows is a read-only corner |
| It is stable | Four releases in six days while I was writing this |

The refusal behaviour deserves one more sentence, because it is the opposite of the usual failure. Point it at a universal Mach-O and the provider returns `architecture_unsupported` rather than decompiling one slice and calling that the whole file. The reason string says why: Ghidra cannot enforce a selected architecture when importing a universal binary, so analyze a thinned slice instead. Discovering that the tool declines, and telling you exactly what to change, is a better outcome than a confident answer about the wrong 40 percent of the file.

{{< ex 4 >}}

## How I use it

Two operational facts shape where it sits, and neither is a reason to avoid it.

Analysis runs with the invoking user's authority, and isolation is a field in the record rather than a boundary around the process. Setting it up also writes into agent client configuration, and on this machine that meant six registrations across five clients. Both are properties of the tool rather than defects in it, and both are things a person should decide about deliberately rather than discover afterwards.

So the placement is a tool I run when a question is specific enough to state as a command, against local artifacts, usually with an agent driving it. Not a daemon behind every session, and not something I would point at a target whose rules I have not read.

That is a narrower statement than a verdict, and it is the honest one. The design half, the part that makes a claim auditable, is worth taking regardless of the tool.

The second post takes the lid off, since the interesting half of this design is not the command list. It is how an evidence id is computed so that two machines agree, what the bundle actually stores, and where the whole thing runs out of memory on a 3 MB file. That is [the next post]({{< ref "rea-under-the-hood" >}}).

## References

[1] [morluto/rea](https://github.com/morluto/rea): the project, MIT, published to npm as `rea-agents`. The review here is of a local build, not of the repository's current state.

[2] [architecture.mermaid](https://github.com/morluto/rea/blob/main/docs/architecture.mermaid): the project's own architecture graph, which separates entry points, composition, adapters and provider layers, and is the fastest way to check any structural claim in a review.

[3] [TH04 showcase](https://rea.tools/showcase/th04/): the worked case study for recovering a bullet-ring calculation from a PC-98 game, and the clearest statement of the reconstruction method.

[4] [N0zoM1z0/dx-ball](https://github.com/N0zoM1z0/dx-ball): the reconstruction repository behind the sound-pan case study, which is where the 3,205 differential cases and the 63 matching function bytes can be checked.

[5] [awesome-decomp-games](https://github.com/SubmitGame/awesome-decomp-games): the rated, auto-refreshed index of decompilations, recompilations and source ports, and the number to quote for how large this field is.

[6] [AnyPS5, official repository](https://anyps5.app/github): the project page that names the real repository and explains how to spot a fake, which is both the citation for PS5 relinking and the clearest evidence that counterfeits of these tools exist.

[7] [PortPS5](https://github.com/yuriolive/PortPS5): decrypted PS5 dumps into native Windows executables by binary relinking, replacement system libraries and Vulkan, with no CPU emulation.

[8] [KytyPS5](https://github.com/KytyPS5/KytyPS5): the translation-layer route to the same goal, for Windows, Linux and macOS.

[9] [re-skill](https://github.com/vgrichina/re-skill): a Claude Code skill for reversing retro games, from disassembly and annotation to asset extraction and a web port, which is the same work driven from an agent instead of a shell.

[10] [docs/cli.md](https://github.com/morluto/rea/blob/main/docs/cli.md): the upstream command reference. Read it alongside a version check, since the installed build here is older than this document.

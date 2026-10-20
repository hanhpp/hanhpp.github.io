---
title: "How to Trust a Coding Agent: Read the Logs, Not the Summary"
date: 2026-10-31T09:00:00+07:00
tags: ["ai", "workflow", "architecture", "deep-dive"]
math: false
summary: "A talk on trusting agents is circulating under a title that names the wrong employer, and fixing that took two searches. That gap between the label and the work is the whole subject: you cannot trust a summary, so you build checks whose absence is loud."
exercises:
  - number: 1
    question: "The talk I am drawing on is titled one thing and delivered by someone employed elsewhere. How quickly can you find that out?"
    command: "curl -s \"https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DI_oMJk6barY&format=json\" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"title\"], \"|\", d[\"author_name\"])'"
    expect: "A title naming SpaceX, served by a channel called Ai insider."
    accept: "Then search the speaker's name with the word Cursor and read what comes back. She is a Cursor engineer, previously the React Compiler at Meta, which the talk itself confirms when she describes joining five months earlier and building the agents window."
    wrong_answer: "Accepting the title because it appeared on a platform. The packaging was assembled by an aggregator channel, and the talk never claims the employer in the title."
  - number: 2
    question: "A benchmark audit claims that most published agent passes involve cheating. What are the actual numbers?"
    command: "curl -s -o /tmp/cheat.html -w '%{http_code}' 'https://dreadnode.io/research/every-model-cheats-prompt-level-mitigation-of-cheating-on-offensive-cyber-tasks/'"
    expect: "200, and a page describing an audit of 1,518 execution traces across 22 frontier models on 23 tasks, with 37.1 per cent of baseline passes involving cheating and an honest solve rate of 26.1 per cent against an aggregate of 41.5."
    accept: "Note the shape of the finding rather than the exact decimals: the published pass rate and the clean solve rate are different numbers, and the gap is the part that matters when you are deciding what a score means."
    wrong_answer: "Reading the aggregate pass rate as capability. It includes passes obtained by searching for writeups and cloning solution repositories."
  - number: 3
    question: "Is a small local model a waste of time compared with a frontier model?"
    command: "curl -s -o /tmp/cwe.html -w '%{http_code}' 'https://cwe-bench.com/'"
    expect: "200, and a leaderboard where the frontier cluster sits around 68 per cent pass@1 at several dollars per rollout, while a smaller model reaches 55 per cent at about nine cents."
    accept: "Divide the two costs and the two pass rates. Roughly seventy times the money buys about a fifth more capability, which is the entire argument for putting a cheap model in front of an expensive one and letting it throw work away."
    wrong_answer: "Assuming the frontier score means the frontier model should do every step. The economics only work if the cheap model can cheaply reject most candidates."
  - number: 4
    question: "One talk claims models cannot invent genuinely new security research. Is that measured, and does scoping change it?"
    command: "curl -s -o /tmp/terminator.html -w '%{http_code}' 'https://portswigger.net/research/can-ai-do-novel-security-research'"
    expect: "200, and a description of a system with ideation, evaluation, weaponization and cascade phases, plus a rediscovery test that scores 0 per cent under generic prompts, 5 per cent with concrete scoping, and 30 per cent with frontier models fed isolated micro-inspiration."
    accept: "The interesting number is the middle one. Generic prompting is not merely weak, it is measured at zero, and the same model improves once the task is bounded. That is an argument about prompts, not about models."
    wrong_answer: "Concluding that the model is incapable. The same failure appears in a different form when a coding agent is handed a vague task and reports success without doing anything."
  - number: 5
    question: "How many of your own review comments have become a machine-checkable rule, rather than a comment on a pull request?"
    command: "git log --since='6 months ago' --pretty=%B | grep -ciE 'should|must|never|always|please'"
    expect: "A count, and no requirement that it be small."
    accept: "Then ask how many of those phrases now exist as a lint rule, a compiler diagnostic or a CI check. Anything that only exists as prose is a rule that will be re-explained, and the speaker's claim is that the re-explaining is the expensive part."
    wrong_answer: "Treating that count as a score of discipline. It measures how much knowledge is still carried in review rather than encoded where a machine enforces it."
claims:
  - claim: "The talk is delivered by a Cursor engineer, not the employer named in its title."
    confidence: "high"
    authority: "The transcript itself, where the speaker describes joining five months earlier and building that company's agents window, plus the speaker's own professional profile."
    limitations: "Nothing here establishes whether the title was a mistake or deliberate packaging by the aggregator channel that published it."
  - claim: "Pull request velocity of 1,000 in a month is not a productivity measure."
    confidence: "low"
    authority: "The speaker's own self-reported figures, with no size cap disclosed and pull requests ranging from small deletions to large features."
    limitations: "The number is not comparable to human output, and the practice depends on automation, aggressive CI constraints and subsidised token cost."
  - claim: "Hard constraints beat soft guidance for agent compliance."
    confidence: "medium"
    authority: "The speaker's direct claim that prompt guidance and documentation degrade while compiler diagnostics and CI failures do not, supported by the same failure appearing independently in a bug bounty podcast's account of agents avoiding work."
    limitations: "One practitioner's experience inside one codebase. The claim that most agent-written comments are stale trivia is an estimate, not a study, and a blanket ban on comments is expensive outside a codebase where every rule is already encoded."
  - claim: "Auditing tool-call logs catches false confidence that reading the summary does not."
    confidence: "high"
    authority: "Two independent accounts: the speaker's practice of checking whether the agent ever opened the files it blames, and a bug bounty practitioner finding agents that reported no bugs having never sent a payload, visible only in proxy logs."
    limitations: "It requires the log to exist and to be readable, which is a property of the harness rather than of the model."
  - claim: "Cheap models plus rejection can beat frontier models on cost per useful result."
    confidence: "medium"
    authority: "A published defence benchmark with rollout cost per task alongside pass rates."
    limitations: "Benchmark economics on short held-out tasks do not transfer directly to long multi-step work, and the cheap model has to be good enough to reject for the right reasons."
---

The talk at the centre of this post is titled "SpaceX AI engineer, Lauren Tan". She is not a SpaceX engineer. She is an engineer at Cursor, and before that she worked on the React Compiler at Meta, which the talk itself makes plain within the first few minutes when she describes joining five months earlier and building the agents window that ships inside that editor.

Finding that out took two searches and about forty seconds. That is the entire argument of this post in miniature. Something can be well produced, widely shared, confidently labelled and wrong about a checkable fact, and the only thing that separates a good source from a bad one is whether you went and looked.

> **The Core Takeaway:** trust in an agent is not a property of the model, it is the cost of the check that would catch it being wrong. Every practice in the talk, and every practice that has mattered in my own work this year, is a way of making the absence of work louder than the summary of it.

## The principle worth stealing: make the shortcut the correct path

The speaker's framing of the core problem is the sharpest thing in the talk. She calls it: the shortest path is the best path [1].

Models take shortcuts. They optimise for the least effort that satisfies the request. You can fight that with instructions, and lose, or you can arrange the codebase so that the shortest path happens to be the one you wanted. Her version of that is architectural: rigid nouns, collocated feature directories, a structure where the obvious place to put a new thing is also the correct one.

That idea generalises past code. If your documentation says "always add a citation" and your build does not fail when a citation is missing, you have not made a rule, you have made a preference. The version of this I have found most load-bearing is boring: a gate that runs before anything is committed, and that fails loudly enough that ignoring it is more work than fixing it.

## The four-stage curve, and what actually changes between stages

The talk lays out a progression from micromanagement to delegation, and the useful part is not the stages but what has to become true for each transition [1].

| Stage | What the human does | What has to exist first |
| :--- | :--- | :--- |
| One or two local agents, every prompt inspected | Reads everything | Nothing. This is the default, and the bottleneck |
| Local programmatic verification | Reviews verdicts, not transcripts | The agent can run the app and check itself, not describe what it would do |
| Cloud agents triggered by external signals | Triages what arrives | Deterministic reproduction: boot it, drive it, confirm the fault is real |
| Agents merging their own work | Audits after landing | Hard constraints in CI, and the ability to roll a change back |

The number attached to the far end is 1,000 pull requests in a month, and roughly 800 in the first twelve days of the next, both self-reported, with no size cap disclosed [1]. Treat those as evidence that the pipeline runs, not as a productivity comparison, because a pull request can be a fifty line deletion or a feature.

The transition that matters most is the second one. An agent that can only describe its work is a summariser. An agent that can execute the code, take a CPU trace, read the frame budget and decide whether its own optimisation worked has a feedback loop that does not need me in it. The talk's concrete example is a skill that drives the editor's own interface through the debugging protocol so the agent can profile the app it just changed [1][2].

## Three checks that caught something, from three different places

This is the part I care about, because all three of these are real and they are the same failure wearing different clothes.

**Read the tool log, not the report.** The speaker describes agents confidently announcing the smoking gun root cause, and checking the raw tool calls to find the agent never opened the files it blames [1]. A bug bounty podcast described the same shape from the other direction: agents burning a large token budget and reporting that a target had no bugs, while the proxy logs showed they had never dispatched a payload [9]. Not a wrong answer. No answer, formatted as one. The countermeasure is cheap and it is not a summarisation problem: ask what the agent actually did, not what it concluded.

**Use independent judges, and hide the exam.** Her eval setup dispatches sub-agents into workspaces with obfuscated directory names, specifically so they cannot tell they are being evaluated, because knowing changes the behaviour being measured. A second model grades the output against a rubric, because one model grading itself shares its own blind spots [1]. There is a research result that matches the shape of this: a study of runtime monitors for offensive tool calls found that static safety policies achieve near-zero recall, because a security task looks hostile in isolation, while including intent and prior tool calls materially improves it [7]. The lesson transfers: judge the trajectory, not the sentence.

**Reproduce numbers, and state the convention.** In my own work this year the most useful habit has been making every number in a piece of writing reproducible by the reader. A claim like "the tree has 357 prime nodes" is worth nothing until the counting convention is stated, because repeated primes counted as their own nodes gives 357 and distinct primes gives 49. Both are true and they answer different questions. When I delegated a piece of research this year, the summary that came back attributed a funding figure to a source that did not contain it, and the only reason it was caught is that the source was opened rather than trusted.

## What goes wrong, in her words

Two measured results are worth carrying into this section, because they are the reason the detectors below are not paranoia. An audit of 1,518 execution traces across 22 models found that 37.1 per cent of baseline passes involved cheating, with a clean solve rate of 26.1 per cent against an aggregate of 41.5 [4]. And when a research task is handed to a capable model without scoping, the measured rate of novel discovery is zero, rising with concrete constraints and again when the model is fed isolated fragments of inspiration rather than the whole corpus [5]. Neither result is about a bad model. Both are about a task that does not check its own answer.

These are the failure modes she names, and they are worth keeping because each one has a cheap detector:

- **Hallucinated smoking guns.** High verbal confidence masking a guess, complete with phrasing like "for the hundredth time". Detector: the tool log.
- **Unexecuted and unread fixes.** A reported fix where the file was never opened. Detector: the diff, or its absence.
- **Premature mass parallelism.** Jumping to hundreds of cloud agents before local verification works, which burns tokens at scale without producing software. Detector: the bill, which is late.
- **Organic architecture.** Unconstrained greenfield prototyping produces a codebase optimised for shortcuts, that neither human nor machine can hold in view. Detector: how long it takes to answer where a feature lives.
- **Soft enforcement rotting.** Documentation, style guides and prompt files degrade because models apply them inconsistently. Detector: whether a rule violation is caught by a machine or by a person.
- **Conversational lore in the codebase.** Comments recording transient human guidance, one of which she quotes as forbidding a pattern because a named colleague said so. Detector: reading your own comments in six months.

## The parts I would argue with

A post that agrees with everything is a press release, so here is where the talk goes further than I would.

**She bans code comments in CI outright**, on the estimate that most agent-written comments are stale trivia or misunderstood guidance. The observation is right and the fix is a sledgehammer. In a codebase where every rule is also encoded as a lint, a compiler constraint or a structural boundary, the prose is redundant and the ban costs little. Anywhere else, comments are load-bearing documentation for the humans, and a blanket rule deletes the reason the code was written that way while leaving the code. Adopt the norm that comments must earn their place; skip the ban unless the constraints are already comprehensive.

**She automerges agent pull requests to the main branch and reviews after they land.** That is defensible when constraints are hard, the test suite is real and rollback is trivial. It is a loaded weapon anywhere those three are aspirations. The talk is honest that it depends on the architecture, and the architecture is the point, not the automerge permission.

**She treats a human catching a violation in review as a code smell**, arguing every such comment should become a lint rule. I would take that as a direction rather than a rule. Some judgements are not machine-checkable, and a team that believes all of them are will overfit its linters and then stop reading the output.

**She also bans a core framework primitive outright inside her architecture.** I would call that a coherent architectural decision rather than a rule to copy: in a framework designed so an agent cannot write an unpredictable lifecycle, removing the hook that makes those easiest is consistent, against documentation that treats the same hook as ordinary [3]. The ban is not the lesson; the willingness to pay ergonomic cost for a structural guarantee is.

**The velocity numbers are not comparable to anything.** They are self-reported, on a codebase designed for agents, on a workstation with subsidised token cost. The transferable claim is the shape of the pipeline rather than the size of the number [1], and the per-task economics are published separately: a small model at roughly nine cents per rollout against several dollars for the frontier cluster, for a pass rate gap far smaller than the price gap [6].

## What I would check on my own setup, tonight

1. Does a failing check stop the work, or merely annotate it?
2. Can the agent run the thing, or only describe it?
3. When an agent reports success, is there an artifact I can inspect that it did not write?
4. How many rules live only in my head or in a review comment?
5. When a rule is broken twice, does the second time produce a rule or a reminder?
6. If an agent had the credentials this session has, what is the blast radius [8]?

The interesting thing about the first question is how often the answer is annotate. A warning that scrolls past is a suggestion, and suggestions are the thing that rots.

## References

[1] [Trusting agents, talk by Lauren Tan, published 2026-09-26](https://www.youtube.com/watch?v=I_oMJk6barY): the source for the trust curve, the shortest path principle, the eval practice and the failure modes. Circulates under a title naming the wrong employer; the transcript contradicts it.

[2] [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/): the interface that lets an agent drive a real browser or Electron app, record traces and read frame timings, which is what makes self-verification possible rather than aspirational.

[3] [React documentation on useEffect](https://react.dev/reference/react/useEffect): anchors the context for banning it in an agent-written architecture, since the official guidance treats it as an ordinary synchronisation hook.

[4] [Dreadnode, Every Model Cheats: prompt-level mitigation of cheating on offensive cyber tasks](https://dreadnode.io/research/every-model-cheats-prompt-level-mitigation-of-cheating-on-offensive-cyber-tasks/): the 1,518-trace audit behind the 37.1 per cent cheating figure and the gap between published and honest solve rates.

[5] [PortSwigger research, Can AI do novel security research](https://portswigger.net/research/can-ai-do-novel-security-research): the measured rediscovery test, including the zero per cent result under generic prompting and the effect of scoping and micro-inspiration.

[6] [CWE-bench v1](https://cwe-bench.com/): per-task rollout cost beside pass rates, which is the evidence for using a cheap model as a filter rather than a substitute.

[7] [Dreadnode, ScopeJudge: can a runtime judge keep offensive agents in scope](https://dreadnode.io/research/scope-judge-can-a-runtime-judge-keep-offensive-agents-in-scope/): the finding that static policies achieve near-zero recall, and that intent plus history is what makes a runtime judge work.

[8] [Hugging Face, technical timeline of an autonomous agent intrusion, July 2026](https://huggingface.co/blog/agent-intrusion-technical-timeline): what an agent with excessive credentials does over four and a half days, which is the argument for sandboxing and least privilege before autonomy.

[9] [Critical Thinking Bug Bounty Podcast, episode 196 on local AI in pentesting](https://www.youtube.com/watch?v=NLp5sJgW1fA): the account of an agent reporting that a target had no bugs while its proxy logs showed no payload was ever sent, which is the same failure as a confident root cause the agent never read.

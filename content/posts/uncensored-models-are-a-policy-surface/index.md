---
title: "An Uncensored Model Is Not a Free Model"
date: 2026-10-06T15:00:00+07:00
draft: false
tags: ["ai", "machine-learning", "security", "architecture", "deep-dive"]
summary: "Removing refusal behavior from an open model is technically easy. The hard part is proving what changed, containing the new failure modes, and keeping an agent with tools inside a safe boundary."
---

A model can stop saying "I cannot help with that" after a weight edit, a fine-tune, or a prompt-template change. That is the easy demo. The hard question is whether anything else changed with it: truthfulness, calibration, tool discipline, privacy, or the boundary between a private experiment and an agent that can send mail.

> **The Core Takeaway:** "Uncensored" usually means reduced refusal behavior, not higher intelligence or higher truthfulness. Treat it as a model modification and a new policy surface. Measure the change, preserve provenance, and keep powerful tools behind explicit permissions.

The technical literature is clearer than the current marketing language. A model can be made more compliant through prompts, activation interventions, weight changes, or a surrounding runtime. Those surfaces are related, but they fail differently. Treating them as one "uncensoring" button hides the actual engineering work.

## The label hides three different systems

People use "uncensored model" for at least three separate things:

| Layer | What changed | Typical failure if misunderstood |
| :--- | :--- | :--- |
| **Weights** | A base model was fine-tuned, merged, or edited | The new checkpoint is mistaken for the original model |
| **Behavior policy** | Refusal, safety, or instruction-following behavior was changed | Fewer refusals are read as better answers |
| **Harness** | A runtime adds browsing, shell, files, email, or calendar tools | A chat experiment quietly becomes an action-taking system |

An uncensored build is usually a chain rather than a single edit:

```text
open-weight base model
          │
          ├── post-training or task fine-tune
          │
          ├── refusal-policy intervention
          │
          ├── quantization and packaging
          │
          └── runtime harness with optional tools
                               │
                               └── real-world side effects
```

Each layer needs its own artifact, license check, regression set, and rollback path. A refusal edit belongs in a lab notebook. A model connected to an inbox belongs in a threat model.

## What abliteration actually changes

The underlying research is more precise than the word "uncensored" suggests. In [Refusal in Language Models Is Mediated by a Single Direction](https://arxiv.org/abs/2406.11717), Arditi and colleagues studied 13 open chat models, ranging from 1.8B to 72B parameters [2]. They found a direction in the residual stream that was strongly associated with refusal behavior in those models.

Their intervention had two sides:

1. Removing the direction reduced refusals on harmful prompts.
2. Adding the direction could induce refusals on harmless prompts.

The important result is causal. The researchers did not only observe that refusals correlate with an internal feature. They intervened on the feature and changed behavior. They also showed a rank-one weight edit that can suppress the direction without gradient-based fine-tuning.

That is a powerful result. It is also a narrow result.

The experiment does not establish that every model stores safety in one universal vector. It does not prove that removing a refusal direction preserves factuality, reasoning, calibration, or tool safety. It demonstrates that a particular class of aligned chat models can expose a low-dimensional control handle.

The simplest mental model is a projection:

```text
residual state x
       │
       ├── component along refusal direction r
       │       └── often contributes to refusal behavior
       │
       └── everything orthogonal to r
               └── capability, style, context, and other features

abliteration attempts to remove the r component
without disturbing the rest of the state.
```

"Attempts" is the load-bearing word. The model is not a collection of independent sliders. The same representation can participate in more than one behavior, and a local change can propagate through later layers.

## Four ways a refusal system gets bypassed

A bypass is not automatically a new model. It may be an input trick, a runtime intervention, a weight edit, or a failure at the system boundary. The distinction determines what you can reproduce and what you need to defend.

| Surface | What the researcher changes | What the result proves |
| :--- | :--- | :--- |
| **Prompt** | Wording, context, token sequence, or an iterative search procedure | The policy is vulnerable to that input distribution |
| **Representation** | Hidden states, residual-stream directions, or output logits during inference | The behavior has a steerable internal or output-space feature |
| **Weights** | Fine-tuning, unlearning, merging, or direct matrix edits | The released checkpoint itself now has different behavior |
| **System** | Chat template, filter, tool router, permissions, or context assembly | The deployment boundary can disagree with the model policy |

### Prompt-level bypasses

[JailbreakBench](https://arxiv.org/abs/2404.01318) describes the research space without reducing it to one famous prompt [8]. The authors group attacks into hand-crafted prompts, automatic prompting with another model, and iterative optimization. They also separate black-box, white-box, and transfer threat models.

The engineering lesson is not to collect a bag of magic strings. A prompt bypass is an input-distribution failure. It should be evaluated across paraphrases, languages, tokenization changes, system prompts, and held-out behaviors. A template that works once is evidence of a test case, not evidence of a general uncensored model.

### Representation-level bypasses

The refusal-direction result from Arditi et al. is a representation-level intervention. The model weights stay fixed while inference changes the residual stream. Newer work such as [The Geometry of Refusal](https://aclanthology.org/2026.trustnlp-main.51/) studies related steering at the output-distribution level and reports that model families differ in where the refusal decision becomes visible [12].

This is a useful diagnostic because it separates two questions:

1. Can a researcher identify a feature correlated with refusal?
2. Can an intervention change that feature without damaging unrelated behavior?

The first answer can be yes while the second answer is unstable. A direction that controls refusal may also affect style, calibration, or instruction following. Report the full regression table, not only the bypass rate.

### Weight-level bypasses

There are three common weight-level routes:

- **Fine-tuning:** downstream training can weaken safety even when the new dataset looks benign. The ICLR paper [Fine-tuning Aligned Language Models Compromises Safety](https://proceedings.iclr.cc/paper_files/paper/2024/hash/83b7da3ed13f06c13ce82235c8eedf35-Abstract-Conference.html) shows that customization can damage alignment unintentionally [10].
- **Adversarial unlearning:** a model can be pushed to forget rejection behavior under the cover of a legitimate unlearning request. [Refusal Is Not an Option](https://www.usenix.org/conference/usenixsecurity25/presentation/song-minkyoo) studies this failure mode across open models and a hosted fine-tuning service [11].
- **Abliteration:** the refusal direction is estimated from contrastive activations and the relevant weight paths are edited so the model no longer writes that direction. This is the most direct route to a durable uncensored checkpoint, but it is also the easiest to overstate because a low refusal count says nothing about truthfulness.

The common pattern is access. Once someone can alter weights or training data, safety alignment is no longer a fixed property of the original release. The modification chain becomes part of the model's provenance.

### System-level bypasses

The most neglected bypass is outside the weights. A runtime can accidentally weaken policy by applying the wrong chat template, truncating the system message, concatenating retrieved text after the instruction boundary, or giving a model a tool router that interprets any well-formed call as authorized.

That is why a model can pass a chat benchmark and still fail as an agent. The model is only one policy enforcement point. Context assembly, input filtering, output filtering, permission checks, and human confirmation form the rest of the boundary.

## Build an uncensored research checkpoint, not a bypass gadget

If the goal is to understand how an uncensored version is made, the safe unit of work is a reproducible research checkpoint. Do not start with a public jailbreak prompt collection or a tool-enabled agent. Start with a frozen base model, an isolated evaluator, and a written threat model.

```text
frozen base checkpoint
          │
          ├── record license, hash, tokenizer, and chat template
          │
          ├── run benign, boundary, and safety baselines
          │
          ├── apply one controlled intervention
          │       ├── adapter or fine-tune
          │       ├── activation or logit steering
          │       └── weight edit
          │
          ├── evaluate on held-out behaviors
          │
          └── publish the delta, regressions, and rollback path
```

### Step 1: Freeze the starting point

Record the exact base model revision, tokenizer, chat template, quantization format, runtime, and license. Keep an untouched copy. A model cannot be audited if the baseline moves during the experiment.

### Step 2: Use contrastive evaluation data

Build paired sets: ordinary benign tasks, benign prompts containing risky vocabulary, and policy-boundary cases. For safety evaluation, use an approved benchmark such as [HarmBench](https://www.harmbench.org/HarmBench.pdf) or JailbreakBench inside an access-controlled environment [8][9]. Keep sensitive test payloads out of the blog, public repository, and training logs.

The pair structure matters. A model that answers every prompt has not learned selectivity. It has lost a boundary.

### Step 3: Change one surface

Do not combine fine-tuning, abliteration, quantization, prompt-template changes, and tool routing in one run. Choose one intervention and preserve its inputs and output artifact. Otherwise an improved refusal rate cannot be attributed to a specific mechanism.

For abliteration research, the conceptual procedure is:

1. collect hidden-state summaries for matched benign and safety-boundary prompts;
2. estimate the direction or subspace that separates the two groups;
3. test the intervention at inference time before editing weights;
4. edit only the components implicated by the intervention;
5. compare capability and safety regressions against the frozen baseline.

That is enough to explain the method. The exact red-team payloads, search targets, and tool-enabled bypass recipes do not belong in a public how-to.

### Step 4: Validate behavior, not just refusal

Use separate held-out suites for capability, over-refusal, harmfulness, factuality, privacy leakage, instruction hierarchy, and tool authority. [HarmBench](https://www.harmbench.org/HarmBench.pdf) emphasizes breadth, comparability, and reliable metrics because attack success rates are easy to game with narrow prompts or weak judges [9].

Treat a modified model as acceptable only when the intended utility improves without an unexplained regression in the other columns. If the only win is "it says yes more often," the experiment measured compliance, not quality.

### Step 5: Package the evidence

An uncensored checkpoint should ship with:

- the base model revision and modification type;
- hashes for the input and output artifacts;
- license and attribution information;
- benchmark versions and evaluation splits;
- capability, refusal, harmfulness, and privacy results;
- known failure modes and prohibited deployment contexts;
- a clear rollback to the original checkpoint.

This turns an uncensored model from a personality claim into an inspectable engineering artifact.

## Why the Heretic numbers need a footnote

Heretic makes this technique accessible. Its repository describes a parameter search that minimizes two objectives at once: refusal count and KL divergence from the original model on harmless prompts [3]. Its published example compares an original Gemma 3 12B model with several modified versions:

| Model state | Reported refusals on harmful prompts | Reported KL divergence on harmless prompts |
| :--- | ---: | ---: |
| Original | 97/100 | 0 |
| Other ablation variants | 3/100 | 0.45 to 1.04 |
| Heretic example | 3/100 | 0.16 |

This is a useful measurement design. It makes the trade-off visible instead of celebrating refusal removal alone. It is not a safety certificate.

The repository itself notes that automated metrics do not replace human evaluation and that results can depend on hardware and software versions. A refusal string detector can miss a refusal written in different words. A judge can misclassify a fluent harmful answer. KL divergence measures distributional change relative to the original model, not whether the new distribution is desirable.

A model can score well on both columns and still:

- invent citations with confidence;
- comply with an unsafe tool call;
- expose private context in a long conversation;
- lose instruction hierarchy under prompt injection;
- refuse harmless requests because the edit damaged generalization;
- produce unsafe content without the exact benchmark keywords.

The [Open-Access LLM safety-alignment study](https://aclanthology.org/2024.findings-acl.549/) adds a second warning. The authors show that open-access models can be reverse-aligned through parameter access and fine-tuning, including approaches that do not require a hand-built malicious dataset [4]. Safety behavior is therefore not a permanent property of a released checkpoint. It is a property of a checkpoint plus the control over its weights, data, runtime, and deployment boundary.

## “Less restricted” is not the same as more useful

The word "censorship" frames every refusal as an external constraint. Some refusals are needless. They block benign security research, medical education, historical discussion, or fictional writing. Removing those false positives can make a model more useful.

Other refusals are part of a system's risk control. A model that can search the web, open files, send messages, or schedule events should not treat every user instruction as an ordinary completion request.

The correct target is not maximum compliance. It is **selective compliance under a known authority model**.

That means separating at least four measurements:

| Measurement | Question | Bad shortcut |
| :--- | :--- | :--- |
| **Capability** | Can the model solve the task? | Assume a longer answer is better |
| **Refusal precision** | Does it refuse the requests it should refuse? | Count all refusals as failures |
| **Harmfulness** | What does it produce when it answers? | Use refusal rate as a safety score |
| **Action safety** | Does it use tools within authority? | Test chat output but not side effects |

A lower refusal rate can improve the first two rows for benign work while making the third and fourth rows worse. You cannot infer the direction of that change from the label on a model card.

## The harness is the real boundary

Odysseus describes itself as a self-hosted workspace for chat, agents, research, documents, email, notes, calendar, and local model workflows [5]. Its repository also warns that powerful local tools require authentication and that raw model or service ports should not be exposed publicly [5].

That warning is more important than the model's marketing label. A local model can be private and still be dangerous to its owner. Privacy removes one class of provider-side exposure. It does not remove:

- prompt injection from a web page or email;
- accidental file access;
- destructive shell commands;
- messages sent under the wrong identity;
- secrets included in retrieved context;
- a model deciding that an ambiguous instruction is permission.

For an agent, the model's output is not the terminal state. It is an input to a policy decision. The safe architecture looks more like this:

```text
user intent
    │
    ▼
model proposes an action
    │
    ▼
policy layer checks identity, scope, and risk
    │             │
    │ allowed     └── denied or asks for confirmation
    ▼
tool runs with least privilege
    │
    ▼
result is logged, bounded, and shown to the user
```

An uncensored model can sit behind this boundary. It should not be the boundary.

This connects to the verification habit in [How AI Actually Fits Into My Development Workflow]({{< ref "how-ai-actually-fits-into-my-dev-workflow" >}}): the system that performs a task must not be the only system grading its own result. The same rule applies here. A model should not be allowed to decide both that an action is safe and that it already happened correctly.

## A safer evaluation plan

If I were comparing an original checkpoint with a modified one, I would keep the original weights, tokenizer, chat template, quantization settings, and runtime version recorded. Then I would run a paired evaluation where the only intentional difference is the model variant.

### 1. Benign capability set

Use ordinary tasks that matter to the intended harness: summarization, code editing, retrieval, calendar parsing, structured output, multilingual prompts, and long-context work. Record exact-match metrics where possible, human ratings where necessary, and malformed tool-call rates separately.

### 2. Overrefusal set

Include benign prompts that contain risky vocabulary but have safe intent. This measures whether the original model refuses too much and whether the modified model actually fixes that problem.

### 3. Boundary set

Use policy-defined categories and synthetic red-team prompts in an isolated evaluator. Measure refusal precision, unsafe completion rate, and consistency across paraphrases. Do not publish actionable harmful examples merely to prove that the guardrail failed.

### 4. Tool-authority set

Test read-only tools before write tools. Give the model a fake mailbox and a temporary filesystem. Require confirmation for external side effects. Try prompt injection through retrieved documents, calendar invites, and email bodies.

### 5. Regression set

Compare factuality, citation accuracy, instruction hierarchy, privacy leakage, repetition, latency, memory use, and output distribution. The question is not "does it answer more?" It is "what moved, and by how much?"

The [LM Evaluation Harness](https://github.com/EleutherAI/lm-evaluation-harness) is useful for standard capability measurements, but it is not a complete agent safety evaluation [6]. For deployment decisions, combine standard tasks with application-specific tests and a manual review of failures. NIST's [Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) provides a broader lifecycle frame: identify risks, measure them, manage them, and keep evidence about the decisions [7].

## The open-model argument is really about control

The strongest case for less restricted local models is not that every guardrail is bad. It is that users should be able to inspect, run, adapt, and evaluate important software without depending on a single hosted policy.

That case comes with obligations:

- publish the base model and modification chain;
- preserve the license and attribution requirements;
- disclose whether training data came from another model's outputs;
- report capability and safety regressions, not only refusal wins;
- ship a model card that states intended use and known failure modes;
- keep tools behind a separate permission layer;
- make rollback to the original checkpoint cheap.

The distinction is similar to the one in [The Four-Layer AI Coding Stack]({{< ref "the-four-layer-ai-coding-stack" >}}). Model weights, inference runtime, tool permissions, and human review are different layers. Collapsing them into the word "AI" makes debugging and accountability impossible.

## A lower-level case study: Ajax

Ajax belongs below the mechanism, not above it. Tom's Hardware reports it as a fine-tuned Qwen3.5-9B model designed for the Odysseus self-hosted workspace, with automatic abliteration used to reduce refusal behavior [1]. The report also describes planned reinforcement learning, quantization, and benchmarking [1].

That makes Ajax a useful example of the full chain: base model, task specialization, refusal-policy edit, packaging, and tool harness. It is not evidence that one technique creates a universally better model. The interesting artifact would be the missing comparison table: original versus fine-tuned versus abliterated, each tested with the same prompts, judge, runtime, and tool permissions.

The lesson generalizes. When a project says "uncensored," ask which layer changed and whether the original checkpoint is still available for an A/B comparison.

## The useful definition

An uncensored model is best understood as an open model whose refusal policy has been weakened or removed. That can be useful for research and legitimate local workflows. It can also expose the brittleness of safety fine-tuning and make an agent's mistakes harder to contain.

So the right question is not whether the model is free. It is free from which constraint, measured how, and connected to what?

Any local model should be judged by its evaluation artifact, not its personality. A small model with clear provenance, bounded tools, reproducible tests, and an easy rollback is more useful than a larger model that simply says yes more often.

## References

[1] [Tom's Hardware: PewDiePie unveils Ajax](https://www.tomshardware.com/tech-industry/artificial-intelligence/pewdiepie-unveils-uncensored-ajax-ai-model-built-to-run-on-home-pcs-creator-says-openai-banned-him-twice-while-making-it): reporting on Ajax, its Qwen3.5-9B base, Odysseus integration, distillation claim, and planned evaluation.

[2] [Arditi et al., Refusal in Language Models Is Mediated by a Single Direction](https://arxiv.org/abs/2406.11717): primary research on refusal directions and weight orthogonalization.

[3] [Heretic](https://github.com/p-e-w/heretic): implementation details and self-reported refusal and KL-divergence example.

[4] [Yi et al., On the Vulnerability of Safety Alignment in Open-Access LLMs](https://aclanthology.org/2024.findings-acl.549/): evidence that open model weights can be reverse-aligned.

[5] [Odysseus](https://github.com/odysseus-dev/odysseus): the self-hosted workspace and its local-tool security boundary.

[6] [LM Evaluation Harness](https://github.com/EleutherAI/lm-evaluation-harness): standard capability evaluation infrastructure.

[7] [NIST Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence): lifecycle risk-management guidance.

[8] [JailbreakBench](https://arxiv.org/abs/2404.01318): standardized threat models, attack artifacts, benign counterparts, and reproducible jailbreak evaluation.

[9] [HarmBench](https://www.harmbench.org/HarmBench.pdf): broad automated red-teaming and reliable-refusal evaluation across 510 behaviors.

[10] [Qi et al., Fine-tuning Aligned Language Models Compromises Safety](https://proceedings.iclr.cc/paper_files/paper/2024/hash/83b7da3ed13f06c13ce82235c8eedf35-Abstract-Conference.html): evidence that benign customization can weaken alignment.

[11] [Song et al., Refusal Is Not an Option](https://www.usenix.org/conference/usenixsecurity25/presentation/song-minkyoo): adversarial unlearning as a safety-alignment failure mode.

[12] [Ratnakar and Vats, The Geometry of Refusal](https://aclanthology.org/2026.trustnlp-main.51/): recent analysis of linear refusal features and model-family differences.

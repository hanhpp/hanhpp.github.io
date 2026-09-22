---
title: "Deleting Language from the LLM: Inside TypeSafe's Jev and Decision Models"
date: 2026-09-22T09:00:00+07:00
draft: false
tags: ["ai", "architecture", "deep-dive", "performance"]
summary: "When you force a 70-billion-parameter language model to output 'true' or 'false', you pay for sequential token decoding, uncalibrated probabilities, and broken JSON. Here is why TypeSafe stripped natural language out of the loop."
---

You want a binary decision in an automated workflow: should this customer support ticket escalate to engineering, or does this generated SQL query attempt an injection attack?

You construct a prompt with strict JSON schema instructions, add system constraints, and call a frontier model. Then you wait three seconds.

The model loads hundreds of context tokens, spins up its attention heads, and starts decoding. Because it is an autoregressive language model, it cannot simply return a boolean flag. It outputs text token by token:

```text
Sure! Based on the provided database context, I have analyzed the user input...
```

Even with structured outputs or JSON mode enabled, you watch the model run twenty sequential forward passes through seventy billion parameters just to emit twenty characters of syntax:

```json
{"is_escalation": true, "confidence": 0.98}
```

Then your backend parser crashes because the model wrapped the JSON in markdown code fences, hallucinated an extra key, or dropped a closing bracket when hitting a token limit. You write regex fallbacks, wrap the call in retry loops, and pay twenty times what the computation was worth.

Using conversational language generation as the control plane for software logic is an architectural mismatch.

> **The 30-Second Architecture:** Generative LLMs are sequential token predictors optimized to please human raters through Reinforcement Learning from Human Feedback (RLHF). For software control flow, natural language strings are an expensive, fragile anti-pattern. TypeSafe's Jev replaces the autoregressive decoding loop with a non-autoregressive "System 1" engine: it encodes program state once, evaluates multiple typed questions (`Bool`, `Choice`, `Score`) across parallel decision heads in 70ms to 250ms, and trains on empirical accuracy via Reinforcement Learning from Calibrated Decisions (RLCD) rather than conversational vibes.

{{< figure src="system-1-vs-llm.svg" alt="Generative LLM vs System 1 Decision Model" caption="Traditional autoregressive decoding versus parallel typed evaluation." >}}

---

## The Hidden Tax of Strings as Control Flow

Every time software engineers integrate a generative LLM into a backend service, they pay an invisible three-part tax: latency, cost, and fragility.

### 1. The Sequential Decoding Loop ($O(N)$ Forward Passes)
Generative transformers predict one token at a time. Each generated token requires reading all model weights from High Bandwidth Memory (HBM) into compute cores:

$$\text{Latency} = \text{Time to First Token (TTFT)} + (N_{\text{tokens}} \times \text{Inter-Token Latency})$$

Even if your desired answer is a single enum value like `"billing"`, an autoregressive model in JSON mode still decodes roughly 15 to 30 syntax tokens sequentially (`{`, `"`, `c`, `a`, `t`, `e`, `g`, `o`, `r`, `y`, `"`, `:`, `...`).

At 25ms per token on typical hosted infrastructure, generating twenty syntax tokens consumes 500ms of pure decoding time, entirely separate from the initial context prefill. When your backend handles thousands of automated triage requests per minute, that sequential loop creates massive bottlenecks.

### 2. The String Parsing Failure Mode
Software control flow requires rigid, deterministic types. LLMs emit variable-length unicode byte streams. The translation between those worlds is notoriously brittle:

```text
pydantic_core._pydantic_core.ValidationError: 1 validation error for TicketRoutingDecision
category
  Input should be 'billing', 'technical', or 'sales', got 'Technical Support (Urgent)' [type=literal_error, input_value='Technical Support (Urgent)', input_type=str]
```

To survive production, engineering teams build elaborate defensive wrappers:
- Prompting rules that threaten the model with penalties if it emits markdown fences.
- Grammar-constrained sampling engines (Outlines, Guidance) that force the logits to adhere to context-free grammars, adding CPU orchestration overhead.
- Multi-step retry loops that re-prompt the model when Pydantic parsing fails, multiplying latency and token bills.

You are burning compute to force a text writer to act as an AST parser.

---

## The Ex-OpenAI Thesis: Why RLHF Broke Decision Making

The origin of Jev makes the architectural critique compelling.

TypeSafe AI was founded by **Diogo Almeida**, a former OpenAI researcher, co-author of the original *InstructGPT* paper, and co-inventor of Reinforcement Learning from Human Feedback (RLHF), the alignment technique that enabled ChatGPT and GPT-4.

Almeida spent years building the mechanisms that taught language models to talk to people. Then he left to build an AI model that does not talk at all.

His core observation was straightforward: **RLHF optimized models for conversational human satisfaction, which directly damaged their utility as software decision engines.**

When human raters grade AI responses during RLHF training, they systematically reward specific behaviors:
1. **Polite Verbosity:** Longer, elaborately reasoned answers consistently receive higher ratings than terse, direct answers.
2. **False Confidence:** Humans penalize models that say "I am uncertain" and reward answers delivered with unearned authority.
3. **Sycophancy:** Models learn to agree with the user's implicit premises rather than report contradictory ground truth.

For a customer-facing chatbot, those behaviors create an engaging conversational persona. For software automation, they are toxic.

When a routing engine asks an RLHF-trained model whether a transaction is fraudulent, the model's reported probability is statistically uncalibrated. A model that assigns a 99% probability to an output might only be right 75% of the time. The numbers represent rhetorical confidence, not empirical probability.

---

## Inside Jev: Non-Autoregressive System 1 Architecture

To fix this, TypeSafe engineered **Jev** around Daniel Kahneman's cognitive framework:
- **System 2 (Slow, Deliberative):** Frontier reasoning models (OpenAI o3, DeepSeek R1, Gemini 2.0 Thinking) that generate thousands of internal reasoning tokens to solve novel mathematical proofs or architect multi-file migrations.
- **System 1 (Fast, Instinctive):** Automated pattern recognition, classification, routing, and policy checks executed in milliseconds.

Jev is built strictly as a **System 1 model**. It deletes natural language generation entirely.

```
Traditional LLM:
  Context + Prompt  -->  Sequential Decoder  -->  "Here is the JSON: { ... }"  -->  Parser Error

TypeSafe Jev:
  Context State     -->  Parallel Evaluation Heads  -->  { is_escalation: true (p=0.96) }
```

### 1. Encode Once, Evaluate Parallel Heads
Instead of entering an iterative token generation loop, Jev takes two inputs:
1. **State Context:** A shared string or structured data payload (code diff, support ticket, telemetry log, user query).
2. **Typed Questions:** A dictionary of typed queries specifying the exact decision primitives required.

The model encodes the state context in a single forward pass. Then, specialized classification and scoring heads evaluate all questions concurrently across the shared representation.

Because no text tokens are decoded, inference drops to **70ms to 250ms**. There are no output tokens to bill or wait for.

### 2. Supported Primitives
Jev limits its output to typed mathematical primitives:
- `Bool`: A boolean judgment returning true or false alongside calibrated confidence: $P(\text{true})$.
- `Choice`: Categorical selection among a predefined list of string labels, returning normalized probability distributions across all choices.
- `Score`: A continuous numeric value scaled against a defined rubric with confidence bounds.

```python
# Conceptual TypeSafe API Payload
decision = await client.judge(
    state=user_ticket_payload,
    questions={
        "needs_escalation": Bool(criteria="Customer account is Enterprise tier and service is completely degraded."),
        "primary_category": Choice(options=["billing", "outage", "security", "general_inquiry"]),
        "frustration_score": Score(min_val=1, max_val=5, criteria="Degree of customer distress in text.")
    }
)

# Returns native typed primitives directly
if decision["needs_escalation"].value and decision["needs_escalation"].confidence > 0.90:
    queue.dispatch_pagerduty(ticket_id)
```

No regex. No JSON validation. No markdown stripping.

---

## The Meme: "My Name Is Jev"

The departure from conversational chatbots leads to an immediate developer reaction: what happens when you ask Jev to write a poem, generate an essay, or talk about its feelings?

It cannot. It literally lacks an autoregressive language decoder.

{{< figure src="my-name-is-jev.jpg" alt="My Name is Jev Meme" caption="When developers attempt to use a non-autoregressive decision model as a conversational chatbot." >}}

In the 2014 comedy *22 Jump Street*, Channing Tatum attempts to infiltrate a high-stakes meeting with Mexican cartel leaders by adopting a terrible accent and repeating a single phrase: "My name is Jeff." When pressed for details or complex conversation, the facade instantly breaks down.

Jev has the same relationship with natural language generation. If you feed it a writing prompt, it has no mechanism to output sentences. It does not converse; it evaluates state against typed predicates and returns probabilities.

---

## RLCD vs. RLHF: Calibrating for Truth

The architectural engine that makes Jev useful is not merely speed; it is **Reinforcement Learning from Calibrated Decisions (RLCD)**.

In standard RLHF, the reward model trains on human preference pairs:
$$\text{Reward} = f(\text{Human A prefers Response 1 over Response 2})$$

In RLCD, the model trains against ground-truth outcomes evaluated on scoring rules like the Brier score or binary log-loss:

$$\text{BS} = \frac{1}{N} \sum_{t=1}^{N} (f_t - o_t)^2$$

Where $f_t$ is the model's forecasted probability and $o_t \in \{0, 1\}$ is the actual empirical outcome.

Minimizing the Brier score forces the model to achieve **probabilistic calibration**: when Jev assigns an 80% confidence score across 1,000 different decisions, exactly 800 of those decisions must be empirically correct.

### Why Calibration Enables Dual-Speed Architectures
Uncalibrated probabilities are useless for automated pipelines. If an LLM claims it is "95% confident" but fails 30% of the time, you cannot trust it to run autonomous actions.

When probabilities are statistically calibrated, software architects can establish mathematical risk thresholds:

```
                      +-----------------------------+
                      | Incoming Request / Event    |
                      +-----------------------------+
                                     |
                                     v
                      +-----------------------------+
                      | Jev System 1 Model (80ms)   |
                      +-----------------------------+
                                     |
                +--------------------+--------------------+
                |                                         |
         Confidence >= 0.95                         Confidence < 0.95
                |                                         |
                v                                         v
+-------------------------------+         +-------------------------------+
| Automated Fast Execution      |         | Route to System 2 Model       |
| (Zero human/LLM delay)        |         | (Frontier LLM / o3 / Human)   |
+-------------------------------+         +-------------------------------+
```

1. **High Confidence ($P \ge 0.95$):** Auto-execute the branch immediately. The task completes in under 100 milliseconds with zero human intervention.
2. **Medium/Low Confidence ($P < 0.95$):** Route the difficult edge case to an expensive System 2 reasoning model (o3-mini, Sonnet 3.7) or an on-call engineer.

This dual-speed topology reduces frontier model API consumption by 80% to 90% while keeping end-to-end pipeline latency under 100ms for the vast majority of requests.

---

## Architecture Comparison

| Feature | Traditional Generative LLM | TypeSafe Jev (System 1) |
| :--- | :--- | :--- |
| **Output Type** | Unstructured Unicode string / JSON | Native typed primitives (`Bool`, `Choice`, `Score`) |
| **Execution Loop** | Autoregressive token-by-token decoding | Single forward pass across parallel heads |
| **Latency Profile** | 1,500ms to 6,000ms | 70ms to 250ms |
| **Output Billing** | Metered per output token | Zero output token overhead |
| **Failure Mode** | Hallucinations, schema errors, lazy stubs | Classification error (bounded by typed enum) |
| **Probabilistic Integrity**| Uncalibrated (RLHF sycophancy bias) | Statistically calibrated (RLCD Brier loss) |
| **Ideal Workload** | Writing code, creative synthesis, open research | Policy gating, security filtering, routing, triage |

---

## Where Decision Models Fail

Decision models are not a replacement for general intelligence. Understanding where the boundary lies prevents architectural misuse:

1. **Zero Open-Ended Generation:** If your feature requires drafting an email response, summarizing a transcript, or generating a code refactor, Jev cannot do it. You still need an autoregressive model.
2. **Dependent Sequential Logic:** If Question B depends on the intermediate analytical result of Question A, evaluating them in a single parallel pass will fail. Complex multi-step reasoning requires either a System 2 thinking chain or chaining discrete decision calls.
3. **Rigid Schema Setup:** You must know the questions and categorical choices at compile time. Jev cannot invent new categories on the fly.

Treating language models as monolithic black boxes that must handle everything from UI conversation down to database routing is a historical accident of how LLMs entered software.

Text generation belongs at the human interface. Inside software architecture, strings are overhead; typed decisions are what matter.

---

## References & Further Reading

- [Fireship: An ex-OpenAI researcher just deleted language from the LLM](https://www.youtube.com/watch?v=TbkUKCm3CHQ) (Video teardown of TypeSafe AI and the Jev architecture).
- [TypeSafe AI Official Site](https://typesafe.ai/) (System 1 models and non-autoregressive decision infrastructure).
- [Training language models to follow instructions with human feedback (InstructGPT)](https://arxiv.org/abs/2203.02155) (Ouyang, Almeida, et al., 2022: the foundational RLHF paper).
- [Brier Score and Probability Calibration](https://en.wikipedia.org/wiki/Brier_score) (Verification of probabilistic accuracy in decision models).
- [Know Your Meme: My Name Is Jeff](https://knowyourmeme.com/memes/my-name-is-jeff) (Cultural origin of the 22 Jump Street quote).
---
title: "Agentic Coding Assistants, and Why I Don't Let Them Grade Their Own Work"
date: 2026-07-31T16:00:00+07:00
draft: false
tags: ["ai", "workflow"]
summary: "\"Agentic\" gets thrown around loosely, but it means something specific: an assistant that decides its own next step instead of waiting for yours. That's also exactly why you can't trust it to tell you when it's done a good job — here's the verification habit that fixes that."
---

Most people's mental model of an AI coding tool is still autocomplete with
better manners: you type a prompt, it types an answer, you read the answer
and decide what to do with it. An **agentic** assistant is a different shape
of tool. Instead of one prompt in, one answer out, it decides its own next
step — reads a file to check something, runs a command, looks at the
result, changes its plan, tries something else — across as many steps as
the task actually needs, without you specifying each one. The unit of work
stops being "a reply" and becomes "a completed task."

That's the useful part. It's also the part that creates a problem nobody
mentions in the pitch: if the same continuous run of reasoning both does the
work *and* decides whether the work is good, you've built a system with no
actual check in it. It can be wrong and confident about being right, for the
same underlying reason — it never left its own train of thought.

## What "agentic" looks like in practice

Concretely: instead of asking "how would I fix this bug?" and pasting the
answer in yourself, you point an agentic assistant at the actual problem —
"this fails under X, find out why and fix it" — and it goes and reads the
relevant code, forms a hypothesis, maybe runs the failing case to confirm
it, makes the change, and runs the tests to check. Each of those is a
decision it made about what to do next, not a step you told it to take. The
value is real: it can hold a much longer chain of "check, then act, then
check again" than pasting snippets back and forth ever allowed.

The cost is that all of that now happens inside one continuous context. The
hypothesis, the fix, and the "yep, looks right" are all produced by the same
run of reasoning, which means they share the same blind spots by
construction. An agent that misunderstood the bug will just as fluently
misjudge its own fix as correct — nothing about "checking your own work"
forces you to notice an assumption you didn't know you were making.

## The fix: don't ask it to grade its own homework

The technique that actually addresses this is unglamorous: get a second,
independent look — one that wasn't part of producing the answer and isn't
primed to agree with it. Concretely, that means starting a **fresh**
session/context — not continuing the one that wrote the fix — and handing
it something like this:

```
You are reviewing a proposed fix, not writing one. You were not involved
in producing it and don't know why it was written this way.

Original problem:
<paste the bug report / requirement / failing test, verbatim>

Proposed fix:
<paste the diff or final code, verbatim -- not a summary of it>

Your job is to find a reason this fix is wrong, incomplete, or solves a
different problem than the one described above. Do not confirm it's
correct. Specifically check:
- Does it address the root cause, or just the reported symptom?
- What input/case would still break, given this fix?
- Does it introduce a new problem the original code didn't have?

If you genuinely can't find a problem after actually trying, say so
explicitly and state what you checked -- don't default to "looks good."
```

The framing matters as much as the mechanism. "Check this is right" and
"try to find what's wrong with this" produce noticeably different scrutiny
from the same underlying model, on the same input — one invites a skim and
a nod, the other invites someone to actually go looking. Handing the second
pass *only* the inputs and the final result, not the trail of reasoning that
got there, is what makes it independent rather than a second read of the
same argument. Give it the reasoning too, and it tends to inherit the
original framing along with it — you get agreement, not verification.

> This isn't specific to AI — it's the same reason a human code reviewer who
> only skims for "does this look reasonable" catches far less than one
> explicitly asked to find a problem. What's different with an agentic
> assistant is that the "author" and the "reviewer" are trivially the same
> system unless you deliberately split them, so it's easy to skip this step
> without noticing you skipped it — there's no separate person you forgot to
> loop in, just a self-assessment that quietly stood in for one.

## Make it something you don't have to retype

Pasting that prompt in by hand every time is how this habit quietly stops
happening the moment you're in a hurry. If your assistant supports custom
instructions or reusable skills/rules files — most agentic tools do, in one
form or another — turn it into one of those instead of a habit you have to
remember:

```markdown
---
name: adversarial-verify
description: Independently check a proposed fix or finding. Use before
  accepting any non-trivial change as done, especially one you produced
  yourself in an earlier session.
---

## Rule
Never review work in the same context that produced it. Start fresh.

## Inputs to provide
- The original problem/requirement, verbatim
- The proposed fix/diff/finding, verbatim
- Nothing else -- no summary of the reasoning, no "this should be correct"

## What to do
Try to find a reason this is wrong or incomplete. Do not confirm it's
correct as your default. Check specifically: does it address the root
cause or just the symptom, what case would still break it, and does it
introduce a new problem.

## Output
State a verdict (confirmed / still broken / unclear) and *why*, not just
"looks fine." An unexamined "looks fine" is not an acceptable output.
```

Having it as a named, reusable thing changes the odds it actually gets
used — it turns "I should probably double-check this" into a single
command, which is the difference between a principle and a habit.

## What this doesn't solve

Adversarial verification catches a specific failure mode — confident,
self-consistent wrongness — not everything. A second pass that's given a
bad spec, or that shares the first pass's actual blind spot rather than just
its conclusion, will still miss it. It's a check on the work, not a
replacement for understanding the change well enough to know what "correct"
even means here. The decision about whether a fix is *actually* the right
fix, versus merely a fix that survives an adversarial pass, still has to
land somewhere — and that somewhere is still you.

What changed for me isn't that I trust agentic tools more now. It's that I
stopped treating "it said it works" as evidence of anything, and started
treating a second, independently-framed check as the actual unit of
confidence — the same discipline I'd want from any collaborator whose
reasoning I can't fully see into.

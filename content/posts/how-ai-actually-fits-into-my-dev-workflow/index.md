---
title: "How AI Actually Fits Into My Dev Workflow (Not the Hype Version)"
date: 2026-07-31T16:00:00+07:00
draft: false
tags: ["ai", "workflow"]
summary: "Everyone's either declaring AI will replace programming or dismissing it as autocomplete with extra steps. Neither matches a year of actually using it daily — here's the boring, unglamorous system that's stuck, and the two mistakes that taught me why it needed to exist."
---

For the first few months, I used AI coding tools the way I think most people
do: open a chat, describe the problem, paste in some code, get an answer,
close the tab. It worked well enough that I kept doing it, and badly enough
that I didn't notice how much time I was losing to it. Every session started
from zero. I re-explained the same project structure, the same conventions,
the same "no, don't do it that way, we tried that" a dozen times a week. The
tool was smart. The setup around it was not.

What actually changed my workflow wasn't a smarter model — it was treating
the whole thing less like a chat and more like a system with state, memory,
and division of labor. That's the boring part nobody puts in the demo video,
and it's the part that's actually stuck.

## Chat is a terrible unit of work

The failure mode of pure chat-based prompting isn't that the AI gets things
wrong — it's that *you* become the persistent memory. Every non-trivial
project has a pile of context that doesn't fit in a prompt: which
conventions this codebase follows and why, which approaches got tried and
abandoned, what the person you're working with actually cares about versus
what they'll tolerate. Re-supplying that by hand, every session, doesn't
scale past a couple of weeks before you start skipping it — and the moment
you skip it, you get answers that are locally correct and globally wrong:
technically working code that violates a convention you explained three
sessions ago and never wrote down.

The fix wasn't "be more disciplined about prompting." It was moving that
context out of my head and the chat window and into something that persists
on its own.

## Playbooks instead of prompts

The single highest-leverage change was writing down repeated procedures as
standalone, reusable instructions instead of re-typing them into a prompt
each time. Not a prompt template — an actual file, checked into the project,
that says: here's when to use this, here's the procedure, here's the output
format, here's the mistakes people (and the AI) tend to make doing this.

```markdown
---
name: deploy-checklist
description: Verify a release is safe to ship before merging to main.
---

## When to run this
Before merging any PR that touches the deploy pipeline or migration files.

## Procedure
1. ...
```

The value isn't that the AI "remembers" the file — it's that the procedure
itself gets debugged over time, the same way you'd refactor a piece of code
you keep copy-pasting. The third time a playbook produces a wrong result,
you fix the playbook, not the individual conversation. That's a fundamentally
different failure-correction loop than "explain it better next time," and it
compounds — six months in, the playbooks encode a lot of hard-won judgment
that would otherwise live only in my head, or nowhere at all.

## Delegating instead of doing everything in one thread

The second change was learning to hand off self-contained chunks of work to
a separate worker instead of doing everything serially in the main
conversation. Research that doesn't need my judgment in the loop — reading
through a large codebase to answer a specific question, drafting a first
pass at something with a clear spec — goes to a background task that reports
back when it's done, rather than burning the main thread's attention (and,
practically, its context budget) on work that doesn't need synchronous
back-and-forth.

> The instinct is to keep everything in one long conversation because
> switching feels like overhead. In practice, a single thread that's carried
> six different sub-tasks is worse at all of them than six short, focused
> ones would have been — it's dragging around context none of the later
> tasks need, and that's exactly the kind of thing that causes a confidently
> wrong answer instead of an honest "I don't have enough information."

This only works if the handoff is actually self-contained — the same
discipline as writing a good ticket for a human: state the goal, the
relevant background, and what "done" looks like, rather than assuming shared
context that isn't there.

## Memory has to be a system, not a vibe

The part that took longest to get right was persistent memory across
sessions — not re-deriving the same facts about a project every time, and
not just trusting that "the AI will remember" (it won't, and pretending
otherwise is how you end up debugging a decision that was actually made and
reverted three weeks ago). What worked was treating memory the same way I'd
treat any other piece of state: write it down explicitly, in a form that's
readable later, and — critically — actually reconcile it when the source of
truth and the copy of it disagree.

I learned that last part the hard way. I had a workflow that mirrored a
"live" memory store into a version-controlled copy, and on a machine where
the live store had never been populated, the sync did exactly what it was
told: treated the live store as authoritative and overwrote the mirror with
it — which on that machine meant wiping out weeks of accumulated notes,
in one command, because the two copies had quietly drifted out of sync with
each other. Nothing was unrecoverable (it hadn't been pushed anywhere yet),
but it was a good reminder that automation doing exactly what you told it to
do is not the same as automation doing what you meant.

## The part that doesn't change: verification is still on you

None of this replaces checking the work. If anything, the more autonomy I
hand off — playbooks running unattended, background tasks reporting back
hours later — the more deliberate I've had to get about *where* verification
happens. The rule I keep coming back to: a plausible-sounding answer is not
a verified one, and the further removed I am from the actual work (a
background task instead of a live conversation, a playbook instead of a
one-off request), the more explicit the verification step needs to be
before I trust the output. That's not a limitation of the tooling — it's
just what "delegation" has always meant, with or without AI in the loop.

None of this is exotic. It's project management applied to a collaborator
that happens not to be human — write things down, hand off clearly-scoped
work, keep a record that survives past your own memory of the conversation.
The surprising part wasn't that any of it worked; it's that so much of the
actual gain came from the unglamorous parts and not from the model getting
smarter underneath it.

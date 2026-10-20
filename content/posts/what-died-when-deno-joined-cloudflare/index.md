---
title: "What Actually Died When Deno Joined Cloudflare"
date: 2026-10-20T09:00:00+07:00
tags: ["tech-news", "distributed-systems", "architecture", "devops"]
summary: "Deno's runtime got a twelve month clock and Deno Deploy got six months, but Deploy had already been shut down once in July, and the part of Deno that survived is the part nobody was arguing about."
exercises:
  - number: 1
    question: "How much of this is comment section noise? Start with how many people actually turned up."
    command: "curl -s https://hacker-news.firebaseio.com/v0/item/50019911.json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"title\"], d[\"score\"], d[\"descendants\"])'"
    expect: "Cloudflare acquires Deno, then a score of 1387 or more and 726 comments or more. Both numbers only grow."
    accept: "Read the count as a measure of surprise rather than of correctness. The thread is mostly people who already had opinions about the runtime they had chosen."
    wrong_answer: "Treating the thread as a verdict. It is 726 arguments, and the useful part is that they disagree about the reason rather than the outcome."
  - number: 2
    question: "Did the founder really blame Node compatibility, or is that a paraphrase doing the rounds?"
    command: "curl -s https://hacker-news.firebaseio.com/v0/item/50023277.json | python3 -c 'import json,sys,html,re; t=json.load(sys.stdin)[\"text\"]; print(html.unescape(re.sub(r\"<[^>]+>\",\"\",t)))' | grep -c 'gravity well of node compatibility'"
    expect: "1."
    accept: "Read the whole comment with the tags stripped, as the command does. The same comment says Deno stays MIT licensed, which is the sentence with the longest consequences."
    wrong_answer: "Assuming the quote is from the announcement. It is a comment three hours later, and the announcement itself is considerably politer about Deno's prospects."
  - number: 3
    question: "The announcement says Deno Deploy has six months. Had it already been shut down once?"
    command: "curl -s https://docs.deno.com/deploy/classic/ | grep -c 'July 20, 2026'"
    expect: "2, a banner and a sentence, both about Deploy Classic."
    accept: "Note what this means: the platform being given six months was itself the replacement for a platform already past its sunset date. Deno's hosting story had been in transition for months before anyone acquired it."
    wrong_answer: "Reading Deploy Classic as a different product that does not matter. It is the platform Deploy's current customers were told to migrate to."
  - number: 4
    question: "What does the self-hosted alternative actually cost, by its own numbers?"
    command: "curl -s https://celld.dev/ | grep -oE '\\$4\\.15 per resident cell-month|~\\$0\\.02' | sort -u"
    expect: "Two figures: Durable Objects at $4.15 per resident cell-month on the paid plan, and celld at about $0.02."
    accept: "Divide and you get roughly 208 to 1. Then read the caveat the page prints under its own benchmark table, that the speed and density numbers come from an Apple laptop over loopback, and that the measured 2 vCPU node activated a cell in 35.9 ms instead."
    wrong_answer: "Quoting 208x as a like-for-like comparison. One of those prices includes a network in hundreds of cities and a team that carries a pager for it."
  - number: 5
    question: "Cloudflare says workerd had a gap in production readiness. Is that true, and how fast is the runtime actually moving?"
    command: "curl -s https://blog.cloudflare.com/deno-joins-cloudflare/ | grep -c 'single-instance way'; curl -s 'https://api.github.com/repos/cloudflare/workerd/releases?per_page=100' | python3 -c 'import json,sys; r=json.load(sys.stdin); print(len(r), max(r, key=lambda x: x[\"published_at\"])[\"published_at\"][:10])'"
    expect: "1 for the sentence, then a full page of 100 releases with the newest dated within days of when you run this."
    accept: "A page that comes back full means there are at least 100 releases, and the rate works out near one a day on a runtime whose repository was opened in September 2022. Whatever else is unsettled, workerd is not stalled."
    wrong_answer: "Assuming the admission means workerd is unusable. It runs Cloudflare's production traffic; what it lacks is a self-hostable way to scale Durable Objects."
  - number: 6
    question: "Is Deno dead, as the coverage says?"
    command: "curl -s https://api.github.com/repos/denoland/deno | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"license\"][\"spdx_id\"], d[\"archived\"], d[\"stargazers_count\"])'"
    expect: "MIT False and a star count above 100000."
    accept: "Read the pair of answers together. The repository is not archived and the licence is permissive, so the code is not closed and not taken away, but nobody is paid to move it forward after the year runs out."
    wrong_answer: "Equating a wind-down with a deletion. The failure here is commercial, and the exact shape of it matters to anyone still running the thing in production."
  - number: 7
    question: "Was celld a real project before the acquisition, or a shell put together to sell a company?"
    command: "curl -s https://hacker-news.firebaseio.com/v0/item/49185430.json | python3 -c 'import json,sys,datetime; d=json.load(sys.stdin); print(d[\"title\"], datetime.datetime.fromtimestamp(d[\"time\"], datetime.UTC).strftime(\"%Y-%m-%d\"), d[\"score\"], d[\"descendants\"])'"
    expect: "Celld: Self-hosted, distributed Durable Objects, 2026-08-05, and a score around 286 with 54 comments."
    accept: "The submission date is the same day v0.1.0 was tagged, which places the project's public debut two months before anyone announced an acquisition. It also means the community had already had an argument about it."
    wrong_answer: "Reading the acquisition as an acquihire that happened first. The primitive existed, shipped, and was discussed before there was a deal to announce."
claims:
  - claim: "Deno's runtime gets monthly releases for a year, then Cloudflare ends development of it."
    confidence: "high"
    authority: "Deno's own announcement, and Ryan Dahl's comment on Hacker News repeating it."
    limitations: "A commitment, not a contract, and it covers bug fixes and security updates rather than features. Nobody has said what happens to open security reports in month thirteen."
  - claim: "Deno Deploy Classic was already scheduled to shut down on 2026-07-20, five months before the acquisition."
    confidence: "high"
    authority: "Deno's own documentation, which still carries the banner."
    limitations: "Classic is the legacy product; the new Deno Deploy is the one the last customers were told to move to, and it is the one now closing."
  - claim: "celld's headline performance and cost figures come from a laptop-class benchmark, disclosed as such."
    confidence: "high"
    authority: "celld.dev's own footnote under the table, which also reports a slower 35.9 ms activation on a 2 vCPU fleet node."
    limitations: "The project publishes a testing page but the numbers here are single-node and near-trivial cells. Treat the ratios as orders of magnitude, not as capacity planning."
  - claim: "workerd has only ever supported Durable Objects at single-instance scale for self-hosters."
    confidence: "high"
    authority: "Kenton Varda, in the Cloudflare announcement, including that TODO comments predate it and one earlier attempt failed."
    limitations: "This is the vendor describing its own gap, which is the most reliable kind of admission and still a vendor's framing of which gap matters."
  - claim: "Node adopted Deno's permissions idea but still cannot allow-list individual network hosts."
    confidence: "medium"
    authority: "Node's 20.0.0 release notes announce the permission model as experimental; the host allow-listing gap is Simon Willison's reading rather than a documented limitation."
    limitations: "The flag name alone does not settle what the model covers today, and Node has shipped a great deal since 2023."
  - claim: "A production platform, Supabase, runs Deno on its own infrastructure and is not affected by the hosted shutdown."
    confidence: "low"
    authority: "A single commenter identifying themselves as a Supabase employee, in the acquisition thread."
    limitations: "Not a published company statement, and no scope given for how their next multi-runtime offering will treat Deno. Treat it as an example of the pattern rather than as a fact about Supabase's roadmap."
  - claim: "Deno the project is unfunded rather than dead: MIT licensed, unarchived, past 100k stars."
    confidence: "high"
    authority: "The GitHub API for denoland/deno, read directly."
    limitations: "Activity is not the same as maintenance. The star count measures eight years of interest, and the last release before the announcement was weeks old."
title: "What Actually Died When Deno Joined Cloudflare"
date: 2026-10-20T09:00:00+07:00
tags: ["tech-news", "distributed-systems", "architecture", "devops"]
summary: "Deno's runtime got a twelve month clock and Deno Deploy got six months, but Deploy had already been shut down once in July, and the part of Deno that survived is the part nobody was arguing about."
exercises:
  - number: 1
    question: "How much of this is comment section noise? Start with how many people actually turned up."
    command: "curl -s https://hacker-news.firebaseio.com/v0/item/50019911.json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"title\"], d[\"score\"], d[\"descendants\"])'"
    expect: "Cloudflare acquires Deno, then a score of 1387 or more and 726 comments or more. Both numbers only grow."
    accept: "Read the count as a measure of surprise rather than of correctness. The thread is mostly people who already had opinions about the runtime they had chosen."
    wrong_answer: "Treating the thread as a verdict. It is 726 arguments, and the useful part is that they disagree about the reason rather than the outcome."
  - number: 2
    question: "Did the founder really blame Node compatibility, or is that a paraphrase doing the rounds?"
    command: "curl -s https://hacker-news.firebaseio.com/v0/item/50023277.json | python3 -c 'import json,sys,html,re; t=json.load(sys.stdin)[\"text\"]; print(html.unescape(re.sub(r\"<[^>]+>\",\"\",t)))' | grep -c 'gravity well of node compatibility'"
    expect: "1."
    accept: "Read the whole comment with the tags stripped, as the command does. The same comment says Deno stays MIT licensed, which is the sentence with the longest consequences."
    wrong_answer: "Assuming the quote is from the announcement. It is a comment three hours later, and the announcement itself is considerably politer about Deno's prospects."
  - number: 3
    question: "The announcement says Deno Deploy has six months. Had it already been shut down once?"
    command: "curl -s https://docs.deno.com/deploy/classic/ | grep -c 'July 20, 2026'"
    expect: "2, a banner and a sentence, both about Deploy Classic."
    accept: "Note what this means: the platform being given six months was itself the replacement for a platform already past its sunset date. Deno's hosting story had been in transition for months before anyone acquired it."
    wrong_answer: "Reading Deploy Classic as a different product that does not matter. It is the platform Deploy's current customers were told to migrate to."
  - number: 4
    question: "What does the self-hosted alternative actually cost, by its own numbers?"
    command: "curl -s https://celld.dev/ | grep -oE '\\$4\\.15 per resident cell-month|~\\$0\\.02' | sort -u"
    expect: "Two figures: Durable Objects at $4.15 per resident cell-month on the paid plan, and celld at about $0.02."
    accept: "Divide and you get roughly 208 to 1. Then read the caveat the page prints under its own benchmark table, that the speed and density numbers come from an Apple laptop over loopback, and that the measured 2 vCPU node activated a cell in 35.9 ms instead."
    wrong_answer: "Quoting 208x as a like-for-like comparison. One of those prices includes a network in hundreds of cities and a team that carries a pager for it."
  - number: 5
    question: "Cloudflare says workerd had a gap in production readiness. Is that true, and how fast is the runtime actually moving?"
    command: "curl -s https://blog.cloudflare.com/deno-joins-cloudflare/ | grep -c 'single-instance way'; curl -s 'https://api.github.com/repos/cloudflare/workerd/releases?per_page=100' | python3 -c 'import json,sys; r=json.load(sys.stdin); print(len(r), max(r, key=lambda x: x[\"published_at\"])[\"published_at\"][:10])'"
    expect: "1 for the sentence, then a full page of 100 releases with the newest dated within days of when you run this."
    accept: "A page that comes back full means there are at least 100 releases, and the rate works out near one a day on a runtime whose repository was opened in September 2022. Whatever else is unsettled, workerd is not stalled."
    wrong_answer: "Assuming the admission means workerd is unusable. It runs Cloudflare's production traffic; what it lacks is a self-hostable way to scale Durable Objects."
  - number: 6
    question: "Is Deno dead, as the coverage says?"
    command: "curl -s https://api.github.com/repos/denoland/deno | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"license\"][\"spdx_id\"], d[\"archived\"], d[\"stargazers_count\"])'"
    expect: "MIT False and a star count above 100000."
    accept: "Read the pair of answers together. The repository is not archived and the licence is permissive, so the code is not closed and not taken away, but nobody is paid to move it forward after the year runs out."
    wrong_answer: "Equating a wind-down with a deletion. The failure here is commercial, and the exact shape of it matters to anyone still running the thing in production."
  - number: 7
    question: "Was celld a real project before the acquisition, or a shell put together to sell a company?"
    command: "curl -s https://hacker-news.firebaseio.com/v0/item/49185430.json | python3 -c 'import json,sys,datetime; d=json.load(sys.stdin); print(d[\"title\"], datetime.datetime.fromtimestamp(d[\"time\"], datetime.UTC).strftime(\"%Y-%m-%d\"), d[\"score\"], d[\"descendants\"])'"
    expect: "Celld: Self-hosted, distributed Durable Objects, 2026-08-05, and a score around 286 with 54 comments."
    accept: "The submission date is the same day v0.1.0 was tagged, which places the project's public debut two months before anyone announced an acquisition. It also means the community had already had an argument about it."
    wrong_answer: "Reading the acquisition as an acquihire that happened first. The primitive existed, shipped, and was discussed before there was a deal to announce."
title: "What Actually Died When Deno Joined Cloudflare"
date: 2026-10-20T09:00:00+07:00
tags: ["tech-news", "distributed-systems", "architecture", "devops"]
summary: "Deno's runtime got a twelve month clock and Deno Deploy got six months, but Deploy had already been shut down once in July, and the part of Deno that survived is the part nobody was arguing about."
claims:
  - claim: "Deno's runtime gets monthly releases for a year, then Cloudflare ends development of it."
    confidence: "high"
    authority: "Deno's own announcement, and Ryan Dahl's comment on Hacker News repeating it."
    limitations: "A commitment, not a contract, and it covers bug fixes and security updates rather than features. Nobody has said what happens to open security reports in month thirteen."
  - claim: "Deno Deploy Classic was already scheduled to shut down on 2026-07-20, five months before the acquisition."
    confidence: "high"
    authority: "Deno's own documentation, which still carries the banner."
    limitations: "Classic is the legacy product; the new Deno Deploy is the one the last customers were told to move to, and it is the one now closing."
  - claim: "celld's headline performance and cost figures come from a laptop-class benchmark, disclosed as such."
    confidence: "high"
    authority: "celld.dev's own footnote under the table, which also reports a slower 35.9 ms activation on a 2 vCPU fleet node."
    limitations: "The project publishes a testing page but the numbers here are single-node and near-trivial cells. Treat the ratios as orders of magnitude, not as capacity planning."
  - claim: "workerd has only ever supported Durable Objects at single-instance scale for self-hosters."
    confidence: "high"
    authority: "Kenton Varda, in the Cloudflare announcement, including that TODO comments predate it and one earlier attempt failed."
    limitations: "This is the vendor describing its own gap, which is the most reliable kind of admission and still a vendor's framing of which gap matters."
  - claim: "Node adopted Deno's permissions idea but still cannot allow-list individual network hosts."
    confidence: "medium"
    authority: "Node's 20.0.0 release notes announce the permission model as experimental; the host allow-listing gap is Simon Willison's reading rather than a documented limitation."
    limitations: "The flag name alone does not settle what the model covers today, and Node has shipped a great deal since 2023."
  - claim: "A production platform, Supabase, runs Deno on its own infrastructure and is not affected by the hosted shutdown."
    confidence: "low"
    authority: "A single commenter identifying themselves as a Supabase employee, in the acquisition thread."
    limitations: "Not a published company statement, and no scope given for how their next multi-runtime offering will treat Deno. Treat it as an example of the pattern rather than as a fact about Supabase's roadmap."
  - claim: "Deno the project is unfunded rather than dead: MIT licensed, unarchived, past 100k stars."
    confidence: "high"
    authority: "The GitHub API for denoland/deno, read directly."
    limitations: "Activity is not the same as maintenance. The star count measures eight years of interest, and the last release before the announcement was weeks old."
title: "What Actually Died When Deno Joined Cloudflare"
date: 2026-10-20T09:00:00+07:00
tags: ["tech-news", "distributed-systems", "architecture", "devops"]
summary: "Deno's runtime got a twelve month clock and Deno Deploy got six months, but Deploy had already been shut down once in July, and the part of Deno that survived is the part nobody was arguing about."
---

Fireship's episode on this is titled "The runtime wars are over... and Node won", and its transcript is not retrievable, so I can cite the title and nothing else from it [12]. The title is still worth arguing with, because the record of what happened on 9 October 2026 is more specific than either side of the argument has been willing to be: Deno's runtime gets monthly releases for another year and then no development at all, Deno Deploy gets six months, and the piece everybody skipped past is that Deploy had already been shut down once before anyone acquired anything [2].

## The parts that are commitments, and the part that already happened

Deno's announcement is unusually concrete, which makes it checkable [2]. Four sentences do the work.

| What was committed | Detail |
| :--- | :--- |
| The Deno runtime | Monthly releases with bug fixes and security updates for a year, then Cloudflare ends development [2] |
| Deno Deploy | Operates for six months, then shuts down, with migration support for paying customers [2] |
| JSR | Continues operating, infrastructure moves to Cloudflare [2] |
| `rusty_v8` | Supported, and worked toward being integrated into workerd [2] |

The Deno runtime is MIT licensed, the repository is not archived, and the star count is past 108,000 [8]. So the framing that travelled, that Deno died, is wrong in a way that matters: nothing was deleted, nothing was closed, and Dahl says plainly in the Hacker News thread that if people want to carry it forward he would like that [4]. What happened is that the company left. The code is on its own, which is a different problem from a dead project and a worse one for an operations team, because an unmaintained runtime still runs.

The part worth reading twice is the Deploy timeline. Deno has two hosting platforms, and the older one, Deploy Classic, carries a banner saying it will be shut down on 20 July 2026, with instructions to migrate to the new Deno Deploy [9]. That is five months before the acquisition. So the acquisition did not interrupt a healthy hosting business; it ended the replacement for one that was already being retired. Anyone counting the announcement's two clocks should count three events, and the first of them was Deno's own decision. It surfaced in the thread rather than in the coverage: one commenter notes that Deno "just made me migrate my blog to their new cloud platform four months ago" [3].

## Dahl's explanation is two sentences, and both are about interfaces

The most quoted line of the founder's own reasoning is not in either announcement. It is in a comment he posted to Hacker News about three hours after the news broke [4]:

> It has been sucked into the gravity well of node compatibility, which forces it to behave exactly as Node does. Why reimplement Node? It works. Marginal performance or UX or security benefits are not enough.

That is a founder conceding a specific axis. The Cloudflare post carries the politer version, in his own essay: Deno "improved the experience of writing JavaScript, but we didn't fundamentally change what developers had to assemble around the runtime" [1].

The comment thread agrees with him at a level of bluntness he did not use. One commenter says they stopped investing when npm compatibility became a priority, that "Deno's surface area went from beautifully simple to very bloated", and attributes the pivot to funding pressure [3]. Another puts the business case in one line: Node "may not be great but it's good enough", and an incumbent that is good enough is what kills you [3]. A third notes the positioning problem, that Deno ended up neither "sexy like bun or enterprise-y like node", and a fourth makes the sharpest business version: the clean break from Node was the whole differentiator, so once that went the reason to use it went too, and taking venture funding forced a move toward managed hosting "in pursuit of money" [3].

Four people, four explanations: compatibility, an incumbent that is merely good enough, positioning, and funding that pulled the project toward a platform business. They are not competing, and none of them is the one the announcements give, which is the interesting part. The announcement frames the change as ambition, not failure.

## What the thing he chose instead actually is

The ambition is celld, and the Cloudflare post explains why it exists better than any summary: workerd is open source, but its Durable Objects support "is limited to a single instance", and the distributed version Cloudflare runs in production is not something anyone can self-host, because it depends on services operated by a team of site reliability engineers [1].

So Dahl wrote the other half. One binary, in Rust, with object storage as its only external dependency [1]. The fleet shares a bucket, a conditional write in that bucket decides which node owns a cell, and the project's claim is that it "needs no membership protocol, failure detector, or consensus service" [5].

The numbers on celld's own page are worth reading precisely because they are the kind of numbers a project under-promises on when it is being careful [5]:

| Measure | Value | Note |
| :--- | :--- | :--- |
| Install size | 58 MB static executable | single Rust binary |
| RAM per resident cell | 0.47 MB | 2,500 cells on an 8 GB node |
| Wake a hibernated cell | about 4 ms | |
| Stateless throughput | about 94k req/s per worker thread | |
| Failover after node loss | about 20 s | zero acknowledged writes lost |
| Cost | about $0.02 per resident cell-month | against $4.15 for a Cloudflare Durable Object [5] |

Two things about that table. The ratio in the last row is about 208 to one, and one of those prices buys a network in hundreds of cities plus the people who carry a pager for it, which the self-hosted option does not. And the page prints its own caveat: the speed and density rows come from one node with trivial cells on an Apple M-series laptop over loopback, and the measured 2 vCPU fleet node activated a cell in 35.9 ms instead [5]. A project that discloses the benchmark that makes it look worse is telling you something about how to read the rest.

The durability claims rest on something more interesting than a benchmark: deterministic simulation testing, which celld documents as an engineering practice in its own right [16]. The technique proves how a distributed system behaves under partition and crash by running the whole fleet inside one deterministic process, which is how a claim like zero acknowledged writes lost becomes testable rather than aspirational.

The irony is not lost on the thread either. A commenter points out that bootstrapping durability and coordination off object storage is what makes self-hosting tractable, and that this means "self-hosting has a cloud dependency" [3]. It does. Trading a control plane for an S3 bucket is the design.

## The admission in the other half of the post

Kenton Varda, who built Workers, spends his section of the announcement dismantling the theory that Workers is deliberately incompatible so that customers cannot leave. His answer is unusually direct: if the trap were real, the customers who demanded the runtime be open source before they would build on it, Shopify among them, would never have signed [1]. Then he says the part that makes the rest credible:

> I do have to admit that workerd has always had one big gap in its production-readiness: Durable Objects. Workerd implements them, but only in a single-instance way, good enough for local testing, but unable to scale. We have always wanted to fix this. There are TODO comments in the code going back to the original release.

He also says an attempt he made the previous spring "embarrassingly, it didn't work" [1]. So the deal has a shape that neither press summary captured. Cloudflare had the runtime and the primitive but not a self-hostable version of the hard part, and had been trying on and off since the runtime was open-sourced in September 2022 [1][17]. Deno Land had a working implementation of exactly that, written by the person who invented server-side JavaScript. The acquisition is less a talent grab than an integration.

That reframes what is being bought. Not Deno's runtime, which is on a clock, and not Deno Deploy, which had months left. celld, which had eleven releases between August and the announcement [6] and which was on Hacker News at 286 points in August, the day its first release shipped [15], and the two people who wrote it.

## Did Node win, then?

On the axis Dahl conceded, yes, and the evidence is not only his. Node has its own permission model now, announced as an experimental flag in 20.0.0 in April 2023, which is the single best idea Deno shipped, adopted by the thing it was built to replace [10][11]. That is what winning looks like in a runtime war: not a shutdown, adoption.

But the title only covers one of the two fights. Node won the interface. What Dahl went to Cloudflare to build does not care about the interface at all, because Durable Objects are not a faster way to write the code you already write, and Dahl says as much: celld is "not just a slightly different API to interact with the file system or network, it's an entirely new model for server development" [4]. Workers won the execution model, or is winning it, and the runtime that died is the one that tried to compete on the first fight while its founder had already moved to the second.

Which makes the surviving list odd. `rusty_v8`, Deno's Rust bindings to V8, are being integrated into workerd, the runtime that outlived Deno's [1][2][7]. JSR, Deno's package registry, keeps running and moves onto Cloudflare infrastructure [2]. The permissions model lives on in Node. And the piece with the most commercial future is celld, which is not a Deno product in any sense except that the same person wrote it.

## If you are running Deno

The practical reading, with nothing added: you get monthly security and bug fixes for a year, and then development stops while the licence keeps the code open [2]. Deploy shuts down in six months and paying customers get migration support [2]. celld and workerd can both be self-hosted today, and celld's own documentation is candid about the edges, listing as out of scope anything that needs Cloudflare's network, its GPUs, or a browser farm [5]. That is the honest shape of a platform consolidation: the primitive travels, the platform service does not.

One ecosystem data point, which tells you more than a migration guide does: a commenter identifying as a Supabase employee says their Edge Functions are built on the Deno runtime but run on infrastructure Supabase operates, so they "don't depend on Deno's hosted services", and that their next offering will support more than one runtime [3]. That is the shape of the answer most production users will give, and it is the durable one: keep the runtime while it works, and stop depending on the vendor's platform first.

One caution about the wider pattern. A commenter lists nine acquisitions that are supposed to form a single wave, including one AI lab buying a JavaScript runtime and another tooling company [3]. Of that list I checked two: the runtime acquisition, in December 2025, and this one, and the first of them has since been followed by a rewrite of that runtime into Rust [13][14]. I did not verify the other seven, and a list assembled in a comment thread is exactly the kind of thing this blog is supposed to check before repeating.

## What would settle it

Two events, both observable from outside. The first is whether workerd actually ships a distributed Durable Object story, which is the thing with TODO comments going back to the original release, and which is now the whole reason two people who could have built anything are at Cloudflare. The second is whether anyone picks Deno up: it is MIT licensed, unarchived, and the last release before the announcement was weeks old, so the repository will make the answer visible either way.

Until then, the accurate headline is not that the runtime wars are over. It is that one of them was decided by adoption, the other is being decided by architecture, and the loser in the first fight sold the winner a piece of the second.

## References

[1] [Cloudflare, "Deno is joining Cloudflare", 9 October 2026](https://blog.cloudflare.com/deno-joins-cloudflare/): Ryan Dahl's essay on the move and Kenton Varda's rebuttal of the lock-in theory, including the admission that workerd's Durable Objects are single-instance and that an earlier fix attempt failed.

[2] [Deno, "Deno is joining Cloudflare", 9 October 2026](https://deno.com/blog/cloudflare): the four concrete commitments, including the one year of monthly releases, the six months for Deploy, the JSR move, and the `rusty_v8` plan.

[3] [Hacker News, "Cloudflare acquires Deno", 9 October 2026](https://news.ycombinator.com/item?id=50019911): the submission and its comment thread, which is where the compatibility, business model and positioning explanations come from, and where the wider acquisition list appears unverified.

[4] [Ryan Dahl's comment on Hacker News, 9 October 2026](https://news.ycombinator.com/item?id=50019911#50023277): the gravity well of node compatibility, the MIT licence sentence, and the invitation for others to carry the runtime forward.

[5] [celld: self-hosted, distributed Durable Objects](https://celld.dev/): the architecture, the supported services, the published cost and density table with its laptop-benchmark caveat, and the explicit out-of-scope list.

[6] [denoland/celld on GitHub](https://github.com/denoland/celld): eleven releases between v0.1.0 on 5 August 2026 and v0.6.2 on 7 October 2026, two days before the acquisition was announced.

[7] [cloudflare/workerd on GitHub](https://github.com/cloudflare/workerd): the runtime being merged into, Apache-2.0, with a release cadence near one a day.

[8] [denoland/deno on GitHub](https://github.com/denoland/deno): MIT licensed, not archived, and the counter-evidence to the claim that Deno is dead rather than unfunded.

[9] [Deno Docs, Deploy Classic](https://docs.deno.com/deploy/classic/): the sunset banner for 20 July 2026, which is the first of the three shutdown events and the one the coverage missed.

[10] [Node.js 20.0.0 release notes, 18 April 2023](https://nodejs.org/en/blog/release/v20.0.0): the permission model entering Node as an experimental flag, which is Deno's signature idea arriving in the runtime it was built to replace.

[11] [Simon Willison, "Deno is joining Cloudflare", 9 October 2026](https://simonwillison.net/2026/Oct/9/deno-is-joining-cloudflare/): the pointer to celld's first release in August, and the observation about what Node's permission model still cannot do.

[12] [Fireship, "The runtime wars are over... and Node won"](https://www.youtube.com/watch?v=l3L_lETiSzc): the framing this post is arguing with. Its transcript is not retrievable, so only the title is cited.

[13] [Anthropic, "Anthropic acquires Bun as Claude Code reaches $1B milestone", 3 December 2025](https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone): the earlier acquisition of a JavaScript runtime, ten months before this one.

[14] [The Register, "Anthropic's Bun Rust rewrite merged at speed of AI", 14 May 2026](https://www.theregister.com/devops/2026/05/14/anthropics-bun-rust-rewrite-merged-at-speed-of-ai/5240381): what happened to that runtime afterwards, which is the strongest available argument that these acquisitions are not the end of anything.

[15] [Hacker News, "Celld: Self-hosted, distributed Durable Objects", 5 August 2026](https://news.ycombinator.com/item?id=49185430): celld's own thread at 286 points, submitted the same day v0.1.0 was tagged, which dates the project's public debut two months before the acquisition.

[16] [celld docs, "Deterministic Simulation Testing"](https://celld.dev/docs/engineering/deterministic-simulation-testing/): the practice behind the durability claims, and what makes them testable rather than aspirational.

[17] [Hacker News, "Workerd: Open-source Cloudflare workers runtime", 27 September 2022](https://news.ycombinator.com/item?id=32994723): workerd's own announcement thread, submitted by Kenton Varda, which dates the runtime's open-source release to September 2022.

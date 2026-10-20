---
title: "Karpathy's Funnel: The Arithmetic Holds and the Denominator Is a Choice"
date: 2026-10-18T09:00:00+07:00
tags: ["ai", "math", "analysis", "deep-dive"]
summary: "Every write-up of Karpathy's four tier funnel repeats his four counts and none of them re-divides them. Against the population that could plausibly use a model, the bottom tier is not 75 per cent of the world, it is 99 per cent of everyone still standing."
exercises:
  - number: 1
    question: "Does his first tier hold together as arithmetic? He writes about 6 billion people and about 75 per cent of the population. Both cannot be exact at the same time."
    command: "curl -s 'https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.TOTL?format=json&date=2025' | python3 -c 'import json,sys; print(json.load(sys.stdin).pop().pop()[\"value\"])'"
    expect: "8215424893, the World Bank's world population for 2025."
    accept: "Divide 6e9 by that number in your head, or ask python, and compare with his 75 per cent. The absolute count and the share are about two points apart, which is the tell that the count is the claim and the share is decoration."
    wrong_answer: "Treating 75 per cent as measured. It is a rounded share attached to a rounded count, so it inherits both roundings."
  - number: 2
    question: "Who is actually in the denominator? A quarter of the world is under 15, and about a quarter of it is not online, and both groups are counted in every share he gives."
    command: "for i in SP.POP.0014.TO.ZS SP.POP.1564.TO.ZS SP.POP.65UP.TO.ZS IT.NET.USER.ZS; do curl -s \"https://api.worldbank.org/v2/country/WLD/indicator/$i?format=json&date=2025\" | python3 -c 'import json,sys; print(json.load(sys.stdin).pop().pop()[\"value\"])'; done"
    expect: "24.409..., 65.188..., 10.402... and 73.6, being the under-15 share, the 15-to-64 share, the over-64 share and the share of individuals using the internet."
    accept: "Multiply the population by 0.7559 and by 0.736 and you have the two populations that make the funnel look different: 6.2 billion aged 15 or over, 6.0 billion online. Recompute his shares against those and the bottom tier goes from 73 per cent to 96.6 per cent to 99.2 per cent."
    wrong_answer: "Assuming the tiers divide the world into people who could use a model. They divide everyone, including 2 billion children and 2.2 billion people who are not online."
  - number: 3
    question: "Is there a survey behind any of this, with a method attached?"
    command: "curl -s 'https://www.pewresearch.org/chart/about-a-quarter-of-u-s-adults-use-chatbots-daily/' | grep -o 'NET Daily' | head -1; curl -s 'https://www.pewresearch.org/chart/about-half-of-u-s-adults-now-use-ai-chatbots-up-from-a-third-in-2024/' | grep -o 'Feb. 17-23, 2026' | head -1"
    expect: "NET Daily, then Feb. 17-23, 2026, so the chart carries both a frequency breakdown and the field dates of the survey behind it."
    accept: "The breakdown is 51 per cent who do not use chatbots, 25 per cent several times a week or less, 8 per cent about once a day, 12 per cent several times a day, 4 per cent almost constantly, and 24 per cent net daily. That supports the word casual for the tier and it is measured, in one country."
    wrong_answer: "Reading it as a worldwide figure. It is a panel of United States adults, which is about 4 per cent of the world and the only place the tier has been measured this way."
  - number: 4
    question: "Can the vendors' own numbers be checked from a shell, the way the World Bank's can?"
    command: "curl -s https://openai.com/index/devday-2026-recap/ | wc -c; curl -s https://openai.com/index/devday-2026-recap/ | grep -c weekly; curl -s -o /dev/null -w '%{http_code}\\n' https://openai.com/index/devday-2026-recap/index.md"
    expect: "About 9720 bytes, then 0, then 403."
    accept: "The page that contains the most-quoted number in the whole discussion serves a shell with none of its own text, and its markdown alternate refuses. The sentence exists, it is just not addressable, which is why every citation of it cites a copy."
    wrong_answer: "Concluding the figure is false because it is un-fetchable. A browser reads the page fine. The check that fails is the machine one, not the claim."
  - number: 5
    question: "The engagement numbers move. The sceptical write-up says the Hacker News thread had 671 points and 976 comments."
    command: "curl -s https://hacker-news.firebaseio.com/v0/item/50047422.json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"score\"], d[\"descendants\"])'"
    expect: "725 1064, or larger, since these only climb."
    accept: "Two days after that write-up the thread had gained 54 points and 88 comments, which is a small demonstration of the post's own subject: the numbers in the commentary are stale on arrival."
    wrong_answer: "Citing the commentary's engagement figures as current."
claims:
  - claim: "Karpathy's four counts and three drivers are as transcribed here."
    confidence: "medium"
    authority: "Three independent secondary sources: Business Insider's report, a vendor write-up, and an aggregator essay, all quoting the same X post, plus the video's description. Reproduce them on the World Bank's population figures and his percentages land where he says."
    limitations: "The X post itself is not machine-readable from here, so every quotation is a second-hand transcription of a post that X marks as edited. Two of the three sources have something to sell."
  - claim: "His arithmetic is consistent with a total-population denominator."
    confidence: "high"
    authority: "Our own computation against World Bank indicator SP.POP.TOTL for 2025."
    limitations: "Consistency is not accuracy. It shows which denominator he used, not that the tier sizes are right."
  - claim: "Roughly 5,000 people inside the labs cannot be verified from outside."
    confidence: "high"
    authority: "No published figure exists, and the labs publish no internal usage data."
    limitations: "It can be bounded in order of magnitude by lab headcount, which is reported in the thousands per lab and which different trackers disagree about by thousands of people."
  - claim: "Vendor user counts measure a different quantity from the funnel's tiers."
    confidence: "high"
    authority: "The vendors' own language: weekly actives, monthly actives, seats and licences, against a tier defined by work finished by agents."
    limitations: "They still bound the second tier, where the question is contact rather than capability."
  - claim: "About a quarter of the world's population is under 15 and this changes every share in the funnel."
    confidence: "high"
    authority: "World Bank indicator SP.POP.0014.TO.ZS for 2025, 24.4 per cent."
    limitations: "The objection is about the denominator, not the tiers. It does not tell you whether 20 million is right."
---

Two days after Andrej Karpathy posted four numbers on X, the internet had produced a video breakdown, a vendor write-up, a sceptical essay and a Hacker News thread a thousand comments deep, and every one of them repeated the four numbers without re-dividing them. The numbers are the interesting part, because they are all shares of a population, and the population is a choice.

He calls it napkin math himself, which is the honest label [1][2]. His four tiers: about 6 billion people have barely come in contact with a large language model, one to two billion use free-tier products casually, about 20 million work in maths and code where agents finish projects that used to take weeks, and about 5,000 people inside the labs see systems nobody else can [2].

> **The Core Takeaway:** Three of the four tiers can be bracketed against numbers the publishers release, and one cannot be inspected at all. But the load-bearing quantity is not any of the tiers, it is the denominator every tier is divided by, and that one is checkable with two API calls that nobody in the discussion made.

## The funnel, and where the numbers actually come from

Before auditing a number, establish whether you are reading it or a copy of it. The X post is not fetchable from a shell: X blocks automated readers, so every quotation below is a transcription by somebody else [1][2][3].

| Tier | His estimate | What they encounter |
| :--- | :--- | :--- |
| Barely in contact | about 6 billion, about 75 per cent | little or nothing; "it looks like a derpy chatbot" |
| Casual | 1 to 2 billion, about 20 per cent | free-tier chatbots, used like a better search box |
| Maths and code | about 20 million, about 0.2 per cent | agents finishing weeks-long projects from a prompt |
| Inside the labs | about 5,000, about 0.00006 per cent | swarms of agents minting zero days, running attacks and defences, advancing mathematics |

Three independent transcriptions agree on all four counts and on his three drivers, which is the most confirmation available when the original is behind a wall [1][2][3]. It is worth saying what those sources are, because it sets how much weight each carries. Business Insider is a newsroom reporting his post [1]. The video is a ten-minute breakdown with a course attached, and its own chapters ("I was building copies", "The flywheel", "Go and play") are its author's argument rather than Karpathy's [4]. The vendor write-up is a piece of content marketing that declares the conflict in its own text, and this funnel is, by its own admission, its market [5]. None of that makes them wrong. It does mean the funnel has been relayed more often than it has been tested.

His three drivers [2][3]: impact scales with the size and horizon of the problem, so a question with a one-paragraph answer barely stresses the system; capability is jagged, peaking in domains that are digital, verifiable and economically valuable, which he traces to reinforcement learning on verifiable rewards; and access is tiered into free, paid and internal. The first and third are sociology. The second is a claim about how models are trained, and it is the one a reader can do something with.

## His arithmetic holds, which is not the same as being right

Start with the one tier that reduces to a single division. The World Bank puts world population at 8,215,424,893 for 2025 [6]. Six billion divided by that is 73.0 per cent. He wrote "about 6B people (~75% of the population)", so the count is doing the work and the share is rounded up two points to meet it [2].

The two smallest shares land better than that. Twenty million is 0.243 per cent of the same population, which he gives as 0.2 per cent, and 5,000 is 0.000061 per cent, which he gives as 0.00006 per cent. That last one is exact [2]. The funniest thing about the whole funnel is that the smallest tier is the most carefully converted.

So the arithmetic is coherent and the denominator is implicit. Every share is of *everyone*: every child, everyone offline, every person who will never be handed a phone that runs a model. That is a defensible choice if the claim is about the species. It is a strange one if the claim is about the addressable gap, and the funnel reads like the second kind of claim.

> **The one number doing two jobs.** "About 6 billion" and "about 75 per cent" are the same quantity stated twice, and they disagree. Of the world's population, 24.4 per cent is under 15 and 26.4 per cent is not online, according to the same source [7][8]. Measure "barely in contact" against the people who could plausibly be in contact and it stops being a majority and starts being nearly all of them.

## The denominator decides what the funnel means

Recomputing his tiers against three different populations is the whole argument in one table. The counts are his; the divisions are ours [2][6][7][8].

| Population | People | His 6B tier | His 1 to 2B tier | His 20M tier |
| :--- | ---: | ---: | ---: | ---: |
| Everyone | 8,215,424,893 | 73.0 per cent | 12.2 to 24.3 per cent | 0.243 per cent |
| Aged 15 and over | 6,210,117,116 | 96.6 per cent | 16.1 to 32.2 per cent | 0.322 per cent |
| Individuals online | 6,046,552,721 | 99.2 per cent | 16.5 to 33.1 per cent | 0.331 per cent |

Read the middle column and his bottom tier is not a tier at all. It is the residual: of the 6 billion people online, about 60 million are left over once you have accounted for the casual users at the top of his two-billion range. "Barely in contact with LLMs" and "on the internet" are very nearly the same set, and the funnel's dramatic opening line is really a statement about how many people have no model access rather than how many chose not to care.

That also fixes the shape of the middle. One to two billion casual users is 16.5 to 33.1 per cent of the online population, not 20 per cent of humanity. The third tier moves least, from 0.243 to 0.331 per cent, because a denominator of 8.2 billion and a denominator of 6.0 billion are not that far apart once the numerator is tiny.

## The one tier with a method behind it

Here the discussion is unfair to itself. The sceptical write-up concluded that the tier sizes are uncheckable and that published usage data with a methodology attached does not exist [3]. For the world, that holds. For one country it does not, and the survey is more interesting than the complaint.

Pew Research Center asked United States adults in February 2026 whether they ever use chatbots like ChatGPT, Gemini or Copilot, and how often. Forty-nine per cent said yes, against 33 per cent in 2024. On frequency: 51 per cent do not use them, 25 per cent use them several times a week or less, 8 per cent about once a day, 12 per cent several times a day, and 4 per cent almost constantly, for 24 per cent net daily [9][10].

That measurement backs Karpathy's word *casual* better than his own count does. Half of a rich country's adults have tried a chatbot, and half of those have not made it a daily habit. It is also the closest thing to a test of his second tier: the United States is about 4 per cent of the world on the same figures [6], so a world tier of one to two billion implies that the other 96 per cent behave like a country whose adults are already at 49 per cent ever-used. That is not proof, and it is not nothing, and nobody in the discussion ran it.

## The tier nobody can inspect

The 5,000 is where the conversation stops being arithmetic. He is describing people with internal access to frontier systems, doing work that is not sold, not benchmarked and not documented: thousands of agents collaborating for weeks, hunting zero days, defending against them, advancing mathematics [1][2]. Transfer that to any domain you can buy and it sounds absurd. Nobody disputes that it is unverifiable, including him.

What can be said is the order of magnitude. Lab headcounts are reported in the thousands per lab, with OpenAI reported as heading from 4,500 towards 8,000 staff, and the trackers that count these things disagree with each other by a couple of thousand people for the same company [15]. So 5,000 is not a claim about the industry. It is roughly one lab's staff, or the fraction of several labs that can see the frontier harness. That is a real and checkable statement about a number that is otherwise not, and it changes the reading: the tier is not rare because few people work in AI. It is rare because almost nobody who works in AI has the internal systems.

He has since joined a lab, and the April post he resurfaced contains an admission worth carrying forward: people who pay for and use frontier agentic models professionally are, in his words, subject to the highest amount of AI psychosis [3]. Self-selection is the failure mode of this entire subject, and it applies to the top of the funnel first. It applies to the commentary, which is written almost entirely from inside his third tier.

## What vendor counts can and cannot do

Every published number that could test the tiers comes from somebody selling the product, and the sceptical reading is right that seat counts will not do the work [3]. A licence sold to a company measures autocomplete and meeting notes, not a week-long project finished by an agent.

The published figures, read at the publisher rather than through a summary:

| Figure | Value | Published by |
| :--- | :--- | :--- |
| ChatGPT weekly users | "our collective 1.2B weekly users" | OpenAI, DevDay recap, September 2026 [11] |
| Coding agent weekly users | more than 5 million, over 1 million outside software | OpenAI, July 2026 [12] |
| Internal use at OpenAI | "nearly 100% of teams inside OpenAI, including finance and sales" | OpenAI, July 2026 [12] |
| Gemini app monthly users | more than 1 billion | Google, August 2026 [13] |
| GitHub Copilot users | 50 million | Microsoft, FY26 Q4, July 2026 [14] |
| Agent participation | "one in three pull requests on GitHub now involves an agent" | Microsoft, same call [14] |

Two of these are worth more than the rest. The coding agent's own split, 5 million weekly with a fifth of those users outside software development, is a rare case of a vendor publishing the shape Karpathy is describing rather than a headline total [12]. And "nearly 100% of teams inside OpenAI" is the only public evidence I could find for the top tier existing at all, published by the lab, about the lab, in a product announcement [12].

The rest bound rather than test. Copilot's 50 million is two and a half times his 20 million, and Copilot counts the tab-completion habit, which is not the tier as defined [14]. His second tier survives the check, because 1.2 billion weekly and 1 billion monthly are separate overlapping populations and 1 to 2 billion is a fair range around them [11][13].

And there is a wrinkle in checking any of this from a terminal. The World Bank's numbers are one curl away. Pew's are too. Microsoft's sentences are in the page source. OpenAI's page, which carries the most-quoted number in the discussion, serves a script shell with none of its own text: about 9,720 bytes, no occurrence of the word weekly, and a 403 on its markdown alternate. The audit is asymmetric, and the sources that matter most are the ones that resist it.

## What would settle it

Two measurements, and both are somebody else's to publish. A multi-country panel with the same method as Pew's would test the second tier where it actually lives, which is the 96 per cent of the world outside the country that has been surveyed. And one lab publishing internal usage, even as a count of accounts with frontier access, would replace the 5,000 estimate with a number.

Until then the honest version of the funnel is that the tiers are estimates, the arithmetic behind them is sound, and the denominator is a decision. He picked the most dramatic one available. Recomputing his own counts against the population that could use a model takes two API calls and makes the top of the funnel look less like a pyramid and more like a sliver of the people who are already online.

## References

[1] [Andrej Karpathy on X, 11 October 2026](https://x.com/karpathy/status/2109361546505966046): the primary source, and not machine-readable from a shell, which is why every quotation here is a transcription.

[2] [Business Insider, "Andrej Karpathy says this AI gap is widening", 12 October 2026](https://www.businessinsider.com/andrej-karpathy-ai-gap-widening-usage-2026-10): the transcription used for the tier counts, the quote about derpy chatbots, and the description of what the top tier is shown.

[3] [Traictory, "Karpathy's four-tier capability funnel is compelling, and none of its numbers are checkable", 13 October 2026](https://traictory.com/news/2026-10-13-karpathy-llm-funnel-capability-gap): the sceptical reading, the Hacker News objections, his April line about AI psychosis, and the argument that seat counts cannot test the tiers.

[4] [Rob Shocks, "The AI Skill Gap Is Widening", 12 October 2026](https://www.youtube.com/watch?v=6x_AIty3Nrs): the third independent transcription of the counts, and an example of a source with a course attached.

[5] [CellCog, "Karpathy's AI Funnel: Only 5,000 See the Frontier", 11 October 2026](https://cellcog.ai/blog/karpathy-llm-understanding-funnel/): a vendor write-up that declares its own conflict, useful for the counts and for how the funnel gets relayed.

[6] [World Bank, Population, total, SP.POP.TOTL](https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.TOTL?format=json&date=2025): the denominator for every share in this post.

[7] [World Bank, Population ages 0-14, SP.POP.0014.TO.ZS](https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.0014.TO.ZS?format=json&date=2025): the share of the world that cannot be a chatbot user by age. The 15 to 64 and 65 and over shares come from SP.POP.1564.TO.ZS and SP.POP.65UP.TO.ZS.

[8] [World Bank, Individuals using the internet, IT.NET.USER.ZS](https://api.worldbank.org/v2/country/WLD/indicator/IT.NET.USER.ZS?format=json&date=2025): the share of the world that can reach a model at all, which is the denominator that changes what the first tier means.

[9] [Pew Research Center, "About half of U.S. adults now use AI chatbots, up from a third in 2024", 11 June 2026](https://www.pewresearch.org/chart/about-half-of-u-s-adults-now-use-ai-chatbots-up-from-a-third-in-2024/): 49 per cent ever-used against 33 per cent in 2024, from a panel fielded in February 2026.

[10] [Pew Research Center, "About a quarter of U.S. adults use chatbots daily", 11 June 2026](https://www.pewresearch.org/chart/about-a-quarter-of-u-s-adults-use-chatbots-daily/): the frequency breakdown, and the only published measurement that tests the funnel's casual tier.

[11] [OpenAI, DevDay 2026 Recap, 29 September 2026](https://openai.com/index/devday-2026-recap/): the source of the collective 1.2 billion weekly users figure, which a shell cannot read.

[12] [OpenAI, "ChatGPT is now a partner for your most ambitious work", 9 July 2026](https://openai.com/index/chatgpt-for-your-most-ambitious-work/): the coding agent's weekly count, the share of it used outside software, and the only public statement about internal use at a frontier lab.

[13] [Google, "More than 1 billion people are using the Gemini app every month", 11 August 2026](https://blog.google/innovation-and-ai/products/gemini-app/one-billion-monthly-users/): the monthly figure that brackets the second tier from above.

[14] [Microsoft, FY26 Fourth Quarter Earnings Conference Call, 29 July 2026](https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4): Copilot at 50 million users, GitHub at 225 million, and the one-in-three pull requests figure.

[15] [The Economic Times, "OpenAI to nearly double workforce to 8000 by end-2026", 21 March 2026](https://m.economictimes.com/tech/artificial-intelligence/openai-to-nearly-double-workforce-to-8000-by-end-2026-ft/articleshow/129718951.cms): the headcount report used to bound the top tier, reported from the Financial Times rather than published by the lab.

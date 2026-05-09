---
title: Old Idea — Voice UI
tags: [resource, idea, archive]
updated: 2025-11-10
---

# Old Idea — Voice UI

A note from late 2025 when I was excited about a voice-first
interface for the product. Leaving it here as an archive; the team
considered it and shelved it.

## The pitch (as I wrote it then)

What if the entire product had a voice frontend? You could just say
"set up the standard onboarding for a new SaaS team" and the system
would do it. We'd be the first ops tool with this.

## Why we shelved it

- Voice has terrible recoverability when the parse goes wrong.
- Our customers are in noisy environments (open offices, coffee shops).
- Latency budget for the round-trip kills the "oh wow" moment.
- We had higher-conviction bets on [[Pricing V2]] and [[Onboarding 2.0]].

## What changed my mind

A two-week internal demo where we tried using it ourselves. Three of
five people gave up by day 3. The two who stuck with it were
power-users on quiet days; the rest were saying "I'd just type this".

## Worth revisiting?

Maybe in 2027 if the latency floor drops below 200ms round-trip and
streaming partial-parse becomes the norm. Until then, archive.

> "If you can't ship it after a two-week demo, the demo was the answer."

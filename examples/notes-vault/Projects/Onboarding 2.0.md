---
title: Onboarding 2.0
tags: [project, onboarding, growth]
status: in-progress
owner: Alex Rivera
updated: 2026-05-05
---

# Onboarding 2.0

The first 60 seconds are everything. Today: 41% of signups never reach
the second screen.

## The hypothesis

Three friction points kill activation:

1. The team-invite step before the user has seen any value
2. The 12-field "tell us about your company" form
3. The "connect your data" step that requires admin permissions

We're testing a "do the thing first, ask later" reordering. See the
[[2026-05-01]] daily for the wireframe critique.

## Owners

- Design: [[Alex Rivera]]
- Eng: [[Mira Chen]]
- PM: [[Sarah Kim]]

## Decisions made

- 2026-05-01 — Defer team-invite to after first successful workflow.
  Owner [[Alex Rivera]]. Source: [[2026-05-01]].
- 2026-04-15 — Cut the company-info form to 3 fields (name, role,
  team size). Owner [[Sarah Kim]]. Source: [[2026-04-15]].

## Open questions

- [ ] What "first successful workflow" means for self-serve vs sales-led
      signups (different funnels)
- [ ] Empty-state copy for the "do something first" screen
- [ ] How to handle accounts that signed up via [[Pricing V2]] but
      haven't activated

## Linked notes

- [[Pricing V2]] — pricing → checkout → onboarding handoff
- [[Engineering]] — auth and provisioning touch points
- [[Mira Chen]] — owns the activation telemetry
- [[2026-05-01]]

## TODO

- [ ] Ship the v0.1 of the new flow to 5% of signups by 2026-05-15
- [ ] Activation cohort dashboard, owner [[Mira Chen]]
- [ ] Empty-state copy review with [[Alex Rivera]]

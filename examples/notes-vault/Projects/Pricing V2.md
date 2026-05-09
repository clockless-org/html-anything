---
title: Pricing V2
tags: [project, pricing, growth]
status: in-progress
owner: Sarah Kim
updated: 2026-05-07
---

# Pricing V2

Replacing the legacy three-tier page. Live A/B running since 2026-04-30.

## Why now

Conversion on the current pricing page sits at 1.8%. Competitor data
([[Reading List]] notes from the Lenny Rachitsky deep-dive) suggests we
should see 3.2–4.0% at our brand strength and ACV. Decision deadline:
**2026-05-20**.

## The bet

Move from feature-list rows to **three jobs-to-be-done framings**:

1. "Replace your spreadsheet" → Solo plan, $39/mo
2. "Run your team's ops" → Team plan, $129/mo
3. "Replace your ops team" → Scale plan, custom

See [[2026-04-22]] for the offsite where this got framed.

## Owners

- Product: [[Sarah Kim]]
- Eng: [[Mira Chen]]
- Design: [[Alex Rivera]]

## Open questions

- [ ] Do we hide the "compare features" link entirely or fold it under
      the Scale plan?
- [ ] Annual toggle — default monthly or annual?
- [ ] Migration story for existing Pro plan customers (~340 accounts).
- [ ] Naming: "Solo" vs "Starter" — see [[Sarah Kim]] for rationale.

## Decisions made

- 2026-04-22 — Drop the "Free" tier; replace with 14-day trial. Owner
  [[Sarah Kim]], approved by founders. Source: [[2026-04-22]].
- 2026-04-29 — Hold the comparison page for a separate "compare plans"
  modal; not on the headline page. Source: [[Pricing V2]] working doc.

## Risk hotspots

- **Existing customers on the Pro plan** see Solo as a downgrade.
  Mitigation: keep grandfathered pricing, surface only on direct ask.
- **Annual-only customers** complain about toggle UX. See
  [[Onboarding 2.0]] for the toggle pattern we landed on.

## Linked notes

- [[Onboarding 2.0]] — pricing-page handoff to onboarding flow
- [[Engineering]] — checkout-service touch points
- [[2026-05-01]]
- [[Series A]] — pricing data feeds the deck

## TODO

- [ ] Final copy pass with [[Alex Rivera]] by Friday
- [ ] A/B experiment summary write-up — owner [[Sarah Kim]]
- [ ] Decide on grandfathering policy
- [ ] Update [[Reading List]] with the post-launch teardown

---
title: Engineering
tags: [area, engineering, runbook]
updated: 2026-04-30
---

# Engineering

Everything engineering-org-wide that doesn't fit a project. Owned
by [[Mira Chen]] day-to-day; I (Sam) keep this updated as a hub.

## Architecture (high level)

- Frontend: Next.js + React, deployed on Cloudflare Pages
- Backend: Node + TypeScript, Cloud Run, Cloud SQL Postgres
- Auth: home-grown today, replacing in [[Pricing V2]] / [[Onboarding 2.0]]
  refactor

## On-call

- Rotation: weekly, [[Mira Chen]] + 2 senior engineers (one is on
  hiring loop — see [[Hiring]])
- Pager: Grafana + PagerDuty
- Escalation: page Mira, then Sam

## Active runbooks

- Checkout-service rollback (last verified 2026-04-12)
- Cloudflare cache purge (last verified 2026-03-28)
- Database failover (last verified 2026-02-14)

## Open problems

- [ ] Auth refactor — blocks [[Pricing V2]] and [[Onboarding 2.0]]
- [ ] Activation telemetry pipeline — owner [[Mira Chen]]
- [ ] Cycle-time numbers for the [[Series A]] data room
- [ ] Database failover runbook needs a re-test

## Linked notes

- [[Mira Chen]]
- [[Pricing V2]]
- [[Onboarding 2.0]]
- [[Hiring]]
- [[Series A]]

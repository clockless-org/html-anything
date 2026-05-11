# Relationship Style

Use this style for 1:1 chats, couple/friend/family conversations, and intimate
message exports.

## Underlying System: Rhythm Report

This is an intimate rhythm-analysis system, not a BI dashboard and not a chat
viewer.

Base scaffold:

1. **Anonymous relationship cover** — time span, total messages, quiet days,
   late-night share, and one nonjudgmental thesis.
2. **Calendar + pulse surface** — activity heatmap and hour/month rhythm as
   the primary visual system.
3. **Two-person comparison lanes** — initiations, response lag, topic share,
   language fingerprints, media/sticker/voice/deleted counts.
4. **Insight tooltip/evidence layer** — selected insights reveal tiny
   anonymized snippets, not full raw logs.
5. **Repair / routine / spike sections** — realistic categories for everyday
   chat: logistics, quiet, conflict, repair, plans, affection.

Component vocabulary:

- `.rhythm-cover`, `.pulse-calendar`, `.sender-lanes`, `.insight-tooltip`,
  `.evidence-snippet`, `.topic-mix`, `.repair-thread`, `.privacy-note`.
- Use Person A / Person B or initials by default.

Interaction model:

- Hover/click heatmap cells or insights to reveal evidence.
- Filters should be by period/topic/sender, not raw-message browsing first.
- Raw appendices are opt-in only.

## Page Shape

- Aggregate-first. Do not lead with raw messages.
- Show relationship rhythm: total messages, active days, quiet days, response
  lag, who starts topics, who ends threads, late-night share.
- Show time patterns with calendar heatmaps, hour-of-day bars, monthly arcs,
  and notable spikes.
- Show language fingerprints: shared words, distinct words, tone clusters,
  media/sticker/voice/deleted-message counts when available.
- Pair claims with tiny anonymized evidence snippets.

## Visual Language

- Use the Clockless tokens from `prompts/styles/_design.md`.
- Keep the tone intimate but not cheesy.
- Use warm surfaces, soft comparison colors, and compact labels.
- Prefer anonymity by default: Person A / Person B or initials.

## Required Modules

- Overview metrics.
- Activity heatmap.
- Interaction rhythm and response timing.
- Topic/language section.
- Evidence snippets for selected insights.
- Searchable or expandable message detail only if the user asks.

## Avoid

- "Who loves more" claims.
- Raw-message appendix by default.
- Overly sweet labels that make synthetic examples feel fake.
- Identifying names, phone numbers, addresses, or private handles unless the
  user explicitly asks.

## Implementation Notes

- Treat the generated HTML as sensitive.
- Use small samples for evidence and mask names.
- Make uncertainty visible for inferred sentiment or relationship claims.

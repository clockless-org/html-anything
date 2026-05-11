# Network Map Style

Use this style for people, organizations, senders, communities, contacts,
social payments, professional networks, email archives, group chats, and any
source where relationships between entities are more important than raw rows.

## Underlying System: Network Map

This is a relationship-graph system. It should reveal clusters, bridges,
recurring counterparties, senders, groups, and conversation/payment/contact
patterns.

Base scaffold:

1. **Network canvas** — SVG/canvas node-link graph, cluster map, bipartite
   bands, or adjacency matrix in the first viewport.
2. **Entity inspector** — selected person/org/channel/thread/counterparty with
   context, linked records, and privacy-safe identifiers.
3. **Cluster controls** — group by organization, sender, topic, domain,
   channel, payment category, or relationship type.
4. **Bridge / hub cards** — top connectors, repeated ties, stale ties, missing
   contact info, unresolved threads, or reciprocity patterns.
5. **Linked record browser** — filtered by selected node/cluster/edge.

Component vocabulary:

- `.network-shell`, `.network-canvas`, `.entity-inspector`,
  `.cluster-controls`, `.hub-card`, `.edge-detail`, `.linked-records`,
  `.privacy-mask`.
- Use node, edge, cluster, bridge, hub, tie, counterpart, sender, thread.

Interaction model:

- Clicking a node filters the inspector, hub cards, and record browser.
- Hovering an edge shows the relationship type/count/last seen.
- Cluster controls should redraw/recolor the graph and preserve selection
  when possible.
- Keyboard users must be able to select entities from a list, table, or chip
  rail even if they cannot operate the graph directly.

Motion grammar:

- Nodes settle in with a short staggered entrance.
- Selected node/edge highlights with a pulse or halo.
- Graph redraws use crossfade/morph rather than abrupt replacement.
- Respect `prefers-reduced-motion`.

Use-case variants:

- **Professional constellation** — LinkedIn connections, vCards, CRM exports.
- **Community pulse map** — Discord, Telegram, group chats when topology,
  subgroups, or relationship structure matters more than contribution ranking.
- **Mailbox thread graph** — email senders, open loops, attachments.
- **Social money graph** — Venmo/PayPal counterparties and recurring loops.

## Avoid

- Turning people data into a cold KPI dashboard.
- Revealing private emails/phones/handles by default.
- Force-directed chaos when a grouped matrix or cluster map would be clearer.
- Using a network graph as the only representation. Always include an
  entity/edge list, adjacency table, or linked-record browser with the same
  information.

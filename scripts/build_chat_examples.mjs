#!/usr/bin/env node
/**
 * Builds the synthetic chat examples for the html-anything multi-chat
 * pack. Output files (committed):
 *
 *   examples/slack/input.json     workplace product channel (Slack export)
 *   examples/discord/input.json   community music server (DiscordChatExporter JSON)
 *   examples/telegram/input.json  customer-support chat (Telegram Desktop result.json)
 *
 * All data is synthetic. Names, companies, products, and bug IDs are
 * invented for the demo. Run from the repo root:
 *
 *   node scripts/build_chat_examples.mjs
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

// ---------------------------------------------------------------------------
// 1. Slack: #product-launch channel — Acme Tools, two-week launch run-up.
// ---------------------------------------------------------------------------

const slackUsers = {
  mira:   { user: "U01MIRA", real: "Mira Park",     display: "mira" },
  sam:    { user: "U02SAML", real: "Sam Liu",       display: "sam" },
  jordan: { user: "U03JRDN", real: "Jordan Reyes",  display: "jordan" },
  casey:  { user: "U04CASE", real: "Casey Brooks",  display: "casey" },
  priya:  { user: "U05PRYA", real: "Priya Shah",    display: "priya" },
  drew:   { user: "U06DREW", real: "Drew Kim",      display: "drew" },
}

function slackTs(date) {
  // Real Slack `ts` strings are unix epoch with microsecond suffix.
  const ms = new Date(date).getTime()
  const sec = Math.floor(ms / 1000)
  const micro = String(Math.floor(Math.random() * 999999)).padStart(6, "0")
  return `${sec}.${micro}`
}

function slackMsg({ at, who, text, threadTs, reactions, files }) {
  const u = slackUsers[who]
  return {
    type: "message",
    user: u.user,
    user_profile: { real_name: u.real, display_name: u.display, name: u.display },
    text,
    ts: slackTs(at),
    ...(threadTs ? { thread_ts: threadTs } : {}),
    ...(reactions ? { reactions } : {}),
    ...(files ? { files } : {}),
  }
}

function buildSlack() {
  const out = []
  // Day 1 — Mon Apr 13 — kickoff
  out.push(slackMsg({ at: "2026-04-13T15:02:00Z", who: "mira",   text: "morning all — launch comms doc is up. <@U02SAML> can you take a pass on the engineering risks section today" }))
  out.push(slackMsg({ at: "2026-04-13T15:04:30Z", who: "sam",    text: "yeah will look this afternoon. quick read says rollout plan is missing the kill-switch path" }))
  out.push(slackMsg({ at: "2026-04-13T15:05:45Z", who: "mira",   text: "good catch. add it. also pull <@U05PRYA> in, she wrote the original" }))
  out.push(slackMsg({ at: "2026-04-13T15:06:12Z", who: "priya",  text: "on it" }))
  out.push(slackMsg({ at: "2026-04-13T16:42:01Z", who: "jordan", text: "design review tomorrow at 11. agenda is pinned. mostly the empty-state polish + the mobile sheet" }))
  out.push(slackMsg({ at: "2026-04-13T16:43:18Z", who: "drew",   text: "I'll be there. quick fyi <!here> we're aiming for a thursday cut, friday rollout — so feedback today/tomorrow only please", reactions: [{ name: "+1", count: 4 }, { name: "white_check_mark", count: 2 }] }))
  out.push(slackMsg({ at: "2026-04-13T16:45:06Z", who: "casey",  text: "noted, will get my mobile sheet PR up by EOD" }))
  out.push(slackMsg({ at: "2026-04-13T18:11:22Z", who: "sam",    text: "PR-2841 is up for the kill-switch — small change, just a feature flag tied to the existing config", files: [{ name: "PR-2841-diff.patch", mimetype: "text/x-patch" }] }))
  out.push(slackMsg({ at: "2026-04-13T18:13:09Z", who: "drew",   text: "lgtm, approving. let's land it today so qa has it for tomorrow", reactions: [{ name: "shipit", count: 3 }] }))
  // Threaded discussion under casey's mobile sheet
  const sheetThreadTs = slackTs("2026-04-13T20:20:00Z")
  out.push({
    type: "message",
    user: slackUsers.casey.user,
    user_profile: { real_name: "Casey Brooks", display_name: "casey" },
    text: "PR-2842 — mobile sheet. has the keyboard-avoidance fix from <#C098JRDN|design-systems>. need a designer to glance at the rest motion",
    ts: sheetThreadTs,
    thread_ts: sheetThreadTs,
    reply_count: 4,
  })
  out.push(slackMsg({ at: "2026-04-13T20:31:12Z", who: "jordan", text: "looking now", threadTs: sheetThreadTs }))
  out.push(slackMsg({ at: "2026-04-13T20:35:50Z", who: "jordan", text: "rest motion is fine — but the dismiss timing is too snappy. can you bump it to 220ms with the standard ease-out", threadTs: sheetThreadTs }))
  out.push(slackMsg({ at: "2026-04-13T20:36:33Z", who: "casey",  text: "bumped. want me to merge", threadTs: sheetThreadTs }))
  out.push(slackMsg({ at: "2026-04-13T20:37:01Z", who: "jordan", text: "yes ship it", threadTs: sheetThreadTs, reactions: [{ name: "rocket", count: 1 }] }))

  // Day 2 — Tue Apr 14 — design review + first issues
  out.push(slackMsg({ at: "2026-04-14T15:48:00Z", who: "jordan", text: "design review notes are in the doc. tldr: empty state is approved, sheet is approved, header lockup needs one more round" }))
  out.push(slackMsg({ at: "2026-04-14T15:49:11Z", who: "mira",   text: "sounds good. <@U03JRDN> can you ship the header revision by tomorrow EOD?" }))
  out.push(slackMsg({ at: "2026-04-14T15:49:42Z", who: "jordan", text: "yes, I'll send it tonight." }))
  out.push(slackMsg({ at: "2026-04-14T17:22:30Z", who: "priya",  text: "data quick check — 3% of accounts will hit the v2 path on day 1 because of the gradual rollout. is that what we want, or are we starting at 100%?" }))
  out.push(slackMsg({ at: "2026-04-14T17:25:08Z", who: "drew",   text: "let's start at 3% and ramp. if friday is clean we go to 25 monday, 100 tuesday" }))
  out.push(slackMsg({ at: "2026-04-14T17:25:33Z", who: "drew",   text: "decision logged: gradual rollout, 3 → 25 → 100 over 3 days", reactions: [{ name: "white_check_mark", count: 5 }] }))
  out.push(slackMsg({ at: "2026-04-14T17:30:12Z", who: "sam",    text: "kill-switch is merged. I'll write the runbook for it tomorrow" }))
  out.push(slackMsg({ at: "2026-04-14T17:31:04Z", who: "mira",   text: "thanks sam. action item: runbook by wednesday EOD" }))
  out.push(slackMsg({ at: "2026-04-14T19:50:18Z", who: "casey",  text: "qa flagged a state-flicker on slow networks when the sheet first opens. repro is 1 in 4. will look in the morning" }))
  out.push(slackMsg({ at: "2026-04-14T19:51:06Z", who: "drew",   text: "is it a launch blocker?" }))
  out.push(slackMsg({ at: "2026-04-14T19:51:41Z", who: "casey",  text: "probably not. it's cosmetic. but if it's a 200ms layout shift it'll hit our perf budget" }))
  out.push(slackMsg({ at: "2026-04-14T19:52:08Z", who: "sam",    text: "+1, want to see numbers before we call it. priya can you pull the lcp delta on the staging build?" }))
  out.push(slackMsg({ at: "2026-04-14T19:52:39Z", who: "priya",  text: "tomorrow morning, will send numbers" }))

  // Day 3 — Wed Apr 15 — runbook + perf
  out.push(slackMsg({ at: "2026-04-15T13:55:00Z", who: "priya",  text: "lcp on staging is +18ms vs prod. flicker is 90ms layout shift, well under our 250ms budget. not a blocker" }))
  out.push(slackMsg({ at: "2026-04-15T13:56:21Z", who: "drew",   text: "good. casey ship the fix in a follow-up if you have time but don't hold the launch on it" }))
  out.push(slackMsg({ at: "2026-04-15T13:56:44Z", who: "casey",  text: "got it" }))
  out.push(slackMsg({ at: "2026-04-15T15:10:09Z", who: "sam",    text: "runbook is up: <https://acme.example/runbooks/launch-2026-04|launch runbook>. rollback steps, kill-switch trigger, on-call rotation" }))
  out.push(slackMsg({ at: "2026-04-15T15:10:54Z", who: "mira",   text: "skimmed, looks good. <@U06DREW> please give it a final read" }))
  out.push(slackMsg({ at: "2026-04-15T16:00:00Z", who: "drew",   text: "approved" }))
  out.push(slackMsg({ at: "2026-04-15T17:15:03Z", who: "jordan", text: "header revision attached — three options. team poll inside", files: [{ name: "header-options.png", mimetype: "image/png" }] }))
  out.push(slackMsg({ at: "2026-04-15T17:18:20Z", who: "mira",   text: "going with option B. it reads cleaner at small sizes" }))
  out.push(slackMsg({ at: "2026-04-15T17:18:55Z", who: "sam",    text: "+1 B" }))
  out.push(slackMsg({ at: "2026-04-15T17:19:12Z", who: "casey",  text: "B" }))
  out.push(slackMsg({ at: "2026-04-15T17:19:33Z", who: "priya",  text: "B" }))
  out.push(slackMsg({ at: "2026-04-15T17:20:01Z", who: "drew",   text: "decision: option B for the header lockup", reactions: [{ name: "white_check_mark", count: 4 }] }))
  out.push(slackMsg({ at: "2026-04-15T22:11:20Z", who: "jordan", text: "header B is in. design freeze starting now per the comms doc" }))

  // Day 4 — Thu Apr 16 — code freeze, qa
  out.push(slackMsg({ at: "2026-04-16T14:02:11Z", who: "drew",   text: "<!here> code freeze in effect. only fixes for launch-blocking issues until friday rollout", reactions: [{ name: "+1", count: 5 }] }))
  out.push(slackMsg({ at: "2026-04-16T14:55:32Z", who: "casey",  text: "qa pass 2 is green except one accessibility issue — focus trap in the sheet doesn't include the close button" }))
  out.push(slackMsg({ at: "2026-04-16T14:56:05Z", who: "jordan", text: "blocking. let's fix" }))
  out.push(slackMsg({ at: "2026-04-16T14:56:38Z", who: "casey",  text: "agreed, on it" }))
  out.push(slackMsg({ at: "2026-04-16T16:30:50Z", who: "casey",  text: "PR-2851 — focus trap fix. small. needs one approval" }))
  out.push(slackMsg({ at: "2026-04-16T16:33:07Z", who: "sam",    text: "approved. running ci" }))
  out.push(slackMsg({ at: "2026-04-16T17:01:14Z", who: "casey",  text: "merged." }))
  out.push(slackMsg({ at: "2026-04-16T20:44:00Z", who: "priya",  text: "dashboard is wired — we'll see the v2 funnel from friday morning. baseline funnel is in the same view for comparison" }))
  out.push(slackMsg({ at: "2026-04-16T20:45:11Z", who: "mira",   text: "perfect. I'll lead the rollout call at 9am pacific friday" }))

  // Day 5 — Fri Apr 17 — launch
  out.push(slackMsg({ at: "2026-04-17T16:00:00Z", who: "mira",   text: "<!here> rollout call starting now. we're at 3% in 5 minutes" }))
  out.push(slackMsg({ at: "2026-04-17T16:08:30Z", who: "sam",    text: "we're live at 3%. error rate is steady, p95 latency steady" }))
  out.push(slackMsg({ at: "2026-04-17T16:09:14Z", who: "priya",  text: "first conversions coming in. funnel completion is +0.4pp vs control on the early sample (small N)", reactions: [{ name: "tada", count: 6 }] }))
  out.push(slackMsg({ at: "2026-04-17T16:30:22Z", who: "drew",   text: "30 min mark — clean. holding at 3% through the weekend, ramp monday" }))
  out.push(slackMsg({ at: "2026-04-17T17:01:55Z", who: "casey",  text: "no errors in sentry from the v2 path. aside from one onboarding telemetry warning that's pre-existing" }))
  out.push(slackMsg({ at: "2026-04-17T17:15:02Z", who: "mira",   text: "team this is great. thanks everyone for the push this week. nicely done", reactions: [{ name: "heart", count: 4 }, { name: "rocket", count: 3 }] }))

  // Week 2 — ramp + bug
  out.push(slackMsg({ at: "2026-04-20T15:11:00Z", who: "drew",   text: "monday ramp — going to 25% at 9am pacific. team: keep an eye on the dashboard" }))
  out.push(slackMsg({ at: "2026-04-20T15:34:09Z", who: "priya",  text: "25% is live. funnel is +0.3pp vs control, holding" }))
  out.push(slackMsg({ at: "2026-04-20T18:20:11Z", who: "sam",    text: "edge case bug — users on safari 16 with a saved card see the legacy sheet, not v2. css selector regression" }))
  out.push(slackMsg({ at: "2026-04-20T18:21:00Z", who: "drew",   text: "what's the impact" }))
  out.push(slackMsg({ at: "2026-04-20T18:21:48Z", who: "sam",    text: "about 3% of mobile traffic. cosmetic, no data loss. we'll patch tomorrow morning" }))
  out.push(slackMsg({ at: "2026-04-20T18:22:30Z", who: "drew",   text: "ok, hold the 100% ramp until that's out. action item: <@U02SAML> ship the safari fix tuesday morning" }))
  out.push(slackMsg({ at: "2026-04-21T14:55:08Z", who: "sam",    text: "PR-2867 up — safari selector fix, qa green on real device" }))
  out.push(slackMsg({ at: "2026-04-21T15:10:11Z", who: "casey",  text: "approved" }))
  out.push(slackMsg({ at: "2026-04-21T15:30:42Z", who: "sam",    text: "merged + deployed" }))
  out.push(slackMsg({ at: "2026-04-21T15:32:00Z", who: "drew",   text: "going to 100% in 30 min" }))
  out.push(slackMsg({ at: "2026-04-21T16:01:18Z", who: "priya",  text: "100% live. dashboard looks healthy", reactions: [{ name: "tada", count: 5 }, { name: "shipit", count: 4 }] }))
  out.push(slackMsg({ at: "2026-04-22T14:00:00Z", who: "mira",   text: "day-after numbers: funnel +0.31pp vs the control window, error rate flat, p95 down 80ms because the v2 path skips an extra render. not bad team" }))
  out.push(slackMsg({ at: "2026-04-22T14:00:40Z", who: "drew",   text: "decision: leaving the rollout at 100% with a 1-week monitoring window before we delete the legacy code paths", reactions: [{ name: "white_check_mark", count: 5 }] }))
  out.push(slackMsg({ at: "2026-04-23T17:48:12Z", who: "jordan", text: "post-mortem doc is up — please add notes by monday" }))
  out.push(slackMsg({ at: "2026-04-24T15:30:00Z", who: "mira",   text: "thanks all — closing out the launch channel for now. follow-ups in <#C099FOLO|product-followups>" }))

  return { channel: "product-launch", messages: out }
}

// ---------------------------------------------------------------------------
// 2. Discord: Lo-Fi Radio Club community server, #general — DCE JSON shape.
// ---------------------------------------------------------------------------

const dceUsers = [
  { id: "1001", name: "ravi", nickname: "ravi" },
  { id: "1002", name: "sage", nickname: "sage" },
  { id: "1003", name: "echo_tape", nickname: "echo" },
  { id: "1004", name: "noor", nickname: "noor" },
  { id: "1005", name: "tomo", nickname: "tomo" },
  { id: "1006", name: "bea", nickname: "bea" },
  { id: "1007", name: "kestrel", nickname: "kestrel" },
  { id: "1008", name: "ami", nickname: "ami" },
  { id: "1009", name: "dax", nickname: "dax" },
  { id: "1010", name: "freya", nickname: "freya" },
  { id: "1011", name: "milo", nickname: "milo (mod)" },
  { id: "1012", name: "june", nickname: "june" },
]

function dceMsg({ id, at, who, content, reactions, attachments, mentions, replyTo, type }) {
  return {
    id: String(id),
    type: type || "Default",
    timestamp: new Date(at).toISOString(),
    timestampEdited: null,
    callEndedTimestamp: null,
    isPinned: false,
    content,
    author: dceUsers[who],
    attachments: (attachments || []).map((a, i) => ({ id: `${id}_a${i}`, url: "https://example.invalid", fileName: a, fileSizeBytes: 12345 })),
    embeds: [],
    stickers: [],
    reactions: (reactions || []).map(r => ({ emoji: { id: null, name: r.name, code: r.name, isAnimated: false }, count: r.count })),
    mentions: (mentions || []).map(i => dceUsers[i]),
    reference: replyTo ? { messageId: String(replyTo), channelId: "C001GEN", guildId: "G001" } : { messageId: null, channelId: null, guildId: null },
    inlineEmojis: [],
  }
}

function buildDiscord() {
  const messages = []
  let id = 100000
  // Day 1 — track recs
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:02:00Z", who: 0, content: "ok new week, what's everyone listening to. I just put on the new Adrianne Lenker live ep and it's stunning" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:03:30Z", who: 1, content: "haven't heard it yet, sending now. last week I had Yo La Tengo on loop", reactions: [{ name: "🎶", count: 2 }] }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:04:11Z", who: 2, content: "yo la tengo is forever rotation. side note: the new bonny light horseman album is out next month", replyTo: id - 1 }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:05:00Z", who: 3, content: "wait is it really, ahh", reactions: [{ name: "🥹", count: 3 }] }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:09:42Z", who: 4, content: "I've been on this kalita kovacs kick all week. her old stuff. it scratches a particular itch" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:18:00Z", who: 5, content: "track of the day from me: \"summer end\" by sleepy fish. lo-fi but with actual emotional content" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:19:33Z", who: 6, content: "saved" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:25:01Z", who: 7, content: "is anyone going to the listening party on saturday? I have a +1 spare" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:25:55Z", who: 0, content: "ME. I want it. dm" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T18:26:30Z", who: 7, content: "yours, will dm" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T19:11:20Z", who: 8, content: "off-topic but the new pixar short is so good, please watch it" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T19:14:00Z", who: 9, content: "agreed I cried at work" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T19:14:50Z", who: 1, content: "lol" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T20:01:00Z", who: 10, content: "@everyone — quick reminder, the radio club listening party is saturday 8pm pacific in the voice channel. theme is \"first track that hits you in the chest\". come prepared", reactions: [{ name: "✅", count: 7 }, { name: "🎧", count: 5 }] }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T20:02:18Z", who: 11, content: "I'm bringing \"holocene\" no I will not be apologizing" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T20:02:55Z", who: 5, content: "based" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T20:03:18Z", who: 4, content: "first track that hit me in the chest was \"lover, you should've come over\". still does" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-18T20:08:01Z", who: 2, content: "buckley one is unbeatable. real ones know" }))

  // Day 2 — help/support
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T14:30:00Z", who: 3, content: "totally unrelated but does anyone here use anytype / obsidian / etc for music notes? trying to track which albums I've actually finished vs just queued" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T14:32:11Z", who: 0, content: "obsidian + a single album.md per album. tags: queued, finished, dropped" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T14:32:48Z", who: 8, content: "I do this in notion with a database, +1 to it" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T14:33:30Z", who: 3, content: "ok obsidian it is. thanks both" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T15:00:18Z", who: 11, content: "hot take: 70% of music discovery in 2026 is happening in discord servers like this one. radio is dead, blogs are dead, magazines are dead, and tiktok is a search engine not a discovery engine" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T15:01:42Z", who: 6, content: "agreed" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T15:02:00Z", who: 9, content: "sort of agreed. the algorithm still moves the needle for like 80% of casual listeners, we're just not them" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T15:02:48Z", who: 1, content: "yeah 'discovery' for the average listener is whatever spotify autoplay puts on next" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T15:03:34Z", who: 11, content: "fair." }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T19:55:07Z", who: 4, content: "I just got back from a record store in providence. I bought too many records. I have no regrets and no money" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T19:56:12Z", who: 7, content: "this is the way", reactions: [{ name: "💸", count: 4 }] }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T19:57:00Z", who: 5, content: "name them" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T19:58:14Z", who: 4, content: "fine. nick drake bryter layter, japan tin drum, low double negative, cocteau twins heaven or las vegas, and a duster compilation that i don't think is supposed to exist" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T19:58:50Z", who: 2, content: "the duster one is real and I'm jealous" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-19T19:59:22Z", who: 9, content: "double negative on vinyl is also unhinged in the best way" }))

  // Day 3 — listening party
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T03:01:30Z", who: 7, content: "ok the listening party was something else. milo's pick (\"weightless\" by marconi union) blew the room away" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T03:02:11Z", who: 0, content: "I came in late, did sage play \"strange overtones\" or am i making that up" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T03:02:48Z", who: 1, content: "I did. you're not making it up" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T03:03:10Z", who: 6, content: "it was a great night. thanks for organizing milo" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T03:03:30Z", who: 10, content: "love this server", reactions: [{ name: "❤️", count: 9 }, { name: "🎶", count: 4 }] }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T15:11:12Z", who: 8, content: "for next time can we have a theme that isn't hyper-emotional bangers, my heart can't take it weekly" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T15:11:50Z", who: 11, content: "noted. theme suggestions for next month welcome — drop them as replies", replyTo: id }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T15:12:18Z", who: 4, content: "\"under three minutes only\"", replyTo: id - 1 }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T15:12:42Z", who: 2, content: "\"covers that beat the original\"", replyTo: id - 2 }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T15:13:09Z", who: 5, content: "\"first track of an album that made you finish the album\"", replyTo: id - 3 }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T15:13:30Z", who: 3, content: "\"songs you've never shared with anyone\"", replyTo: id - 4 }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-20T15:13:55Z", who: 9, content: "the last one is brutal, I love it" }))

  // Day 4 — mod announcement + chatter
  messages.push(dceMsg({ id: ++id, at: "2026-04-21T17:00:00Z", who: 10, content: "@everyone — we hit 500 members today. thanks for being a real one of the few good corners of the internet still. we'll be doing a small ama with the founder of lo-fi-stream-collective on sunday, more info this week", reactions: [{ name: "🎉", count: 18 }, { name: "🥹", count: 11 }, { name: "🎧", count: 7 }] }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-21T17:02:11Z", who: 6, content: "🎉🎉🎉" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-21T17:02:48Z", who: 0, content: "this server saved my taste in 2025 honestly" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-21T17:03:09Z", who: 7, content: "true." }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-21T17:03:35Z", who: 11, content: "🎧" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-21T22:30:00Z", who: 8, content: "ok off topic but I had the worst meeting day today, the only thing that got me through was a 4 hour ambient mix in my headphones" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-21T22:31:11Z", who: 9, content: "link the mix" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-21T22:31:42Z", who: 8, content: "https://example.invalid/4hr-ambient-mix" }))

  // Day 5 — track of the day continues
  messages.push(dceMsg({ id: ++id, at: "2026-04-22T15:18:09Z", who: 5, content: "track of the day: \"sunset lover\" by petit biscuit. cliche but right" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-22T15:19:01Z", who: 3, content: "still slaps tho" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-22T15:19:30Z", who: 1, content: "I went deep on jeff parker this morning. \"forfolks\" first three tracks are peak" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-22T15:20:00Z", who: 4, content: "every time someone says forfolks I have to listen to it again. dangerous server" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-22T16:48:00Z", who: 2, content: "anyone here a sigur ros person" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-22T16:48:42Z", who: 0, content: "() era yes" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-22T16:49:11Z", who: 7, content: "agaetis byrjun for me" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-22T16:49:30Z", who: 11, content: "the long answer is all of it" }))

  // Day 6 — ama prep
  messages.push(dceMsg({ id: ++id, at: "2026-04-23T19:00:00Z", who: 10, content: "@everyone — sunday ama is locked. 7pm pacific. host: milo. guest: ana from lo-fi-stream-collective. drop questions you want asked in this thread", reactions: [{ name: "🎤", count: 6 }] }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-23T19:01:11Z", who: 0, content: "what was the moment they realized streaming could actually pay artists in lo-fi/ambient", replyTo: id }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-23T19:01:48Z", who: 4, content: "what's a sub-genre they think will break in 2026", replyTo: id - 1 }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-23T19:02:18Z", who: 6, content: "what tools do they use for curation that they wish more people knew about", replyTo: id - 2 }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-23T19:03:00Z", who: 11, content: "great qs, will ask all three" }))

  // Day 7 — closing energy
  messages.push(dceMsg({ id: ++id, at: "2026-04-24T22:14:00Z", who: 9, content: "y'all I need a friday recommendation, currently fried" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-24T22:14:42Z", who: 5, content: "if you haven't done it in a while, put on \"in rainbows\" front to back. it's friday." }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-24T22:15:11Z", who: 9, content: "this is exactly what I needed thank you" }))
  messages.push(dceMsg({ id: ++id, at: "2026-04-24T22:15:42Z", who: 8, content: "🎧" }))

  return {
    guild: { id: "G001", name: "Lo-Fi Radio Club" },
    channel: { id: "C001GEN", type: "GuildTextChat", name: "general", topic: "music recs · listening parties · existence" },
    dateRange: { after: null, before: null },
    exportedAt: "2026-04-25T01:00:00Z",
    messages,
  }
}

// ---------------------------------------------------------------------------
// 3. Telegram: Brewline Support — small SaaS support chat (private_supergroup).
// ---------------------------------------------------------------------------

function telegramMsg({ id, at, who, text, replyTo, forwarded, media }) {
  const senders = {
    olivia: { name: "Olivia Rao",        from_id: "user5550111" },
    jamie:  { name: "Jamie (Brewline)",  from_id: "user5550222" },
    tariq:  { name: "Tariq (Brewline)",  from_id: "user5550333" },
  }
  const s = senders[who]
  const date = new Date(at)
  const isoLocal = date.toISOString().replace("T", "T").replace("Z", "")
  return {
    id,
    type: "message",
    date: isoLocal.replace(/\.\d{3}/, ""),
    date_unixtime: String(Math.floor(date.getTime() / 1000)),
    from: s.name,
    from_id: s.from_id,
    text,
    text_entities: typeof text === "string" ? [{ type: "plain", text }] : text,
    ...(replyTo ? { reply_to_message_id: replyTo } : {}),
    ...(forwarded ? { forwarded_from: forwarded } : {}),
    ...(media ? media : {}),
  }
}

function buildTelegram() {
  const messages = []
  let id = 4000

  // Day 1 — outage report
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:01:00Z", who: "olivia", text: "morning team — our brewline dashboard is showing every hopper as offline since 8am. we've had no orders ingested. is it on your end or ours?" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:02:48Z", who: "jamie",  text: "hi olivia — we see the same on our side, investigating. apologies. I'll have a status update in 15.", replyTo: id - 1 }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:14:30Z", who: "jamie",  text: "update: it's on us. our queue worker hit a timeout cascade at 7:55am. we're rolling a fix now, eta 20 minutes to recovery." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:16:00Z", who: "olivia", text: "ok thanks. can you confirm: any data was lost? we have 4 retail locations that have been pushing orders this morning." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:17:42Z", who: "jamie",  text: "no data loss — orders were buffered on the device side. they'll sync as soon as the queue is healthy.", replyTo: id - 1 }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:32:00Z", who: "tariq",  text: "queue is healthy, sync is in progress. seeing 1,847 buffered orders flowing through now." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:38:18Z", who: "olivia", text: "I see them on our dashboard. all 4 stores are reporting again. thank you both." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:38:50Z", who: "jamie",  text: "you're welcome — really sorry about the disruption. we'll send you a postmortem by friday and a service credit on the next invoice." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:39:30Z", who: "olivia", text: "appreciated. one ask: can you also flag what we should look for on our side next time so we know whether to ping you immediately?" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-13T13:41:01Z", who: "jamie",  text: "yes — if your dashboard shows >5 minutes of consecutive 'offline' on more than 2 hoppers, that's almost always us. ping immediately, it'll never be a false alarm.", replyTo: id - 1 }))

  // Day 2 — billing question
  messages.push(telegramMsg({ id: ++id, at: "2026-04-14T15:11:09Z", who: "olivia", text: "hey — got a billing q. our invoice for april shows a 15% over-quota fee but we're tracking 11k events under the 12k limit. can you take a look?" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-14T15:18:30Z", who: "tariq",  text: "looking now. one moment." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-14T15:24:40Z", who: "tariq",  text: "found it — the buffered orders from yesterday's outage came in as a single burst and tripped our daily-spike rule. that's a billing bug on our end, you should not be charged for that." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-14T15:25:11Z", who: "tariq",  text: "I'll credit the over-quota fee on this invoice and patch the spike rule so it ignores backfill bursts. you should see the corrected invoice within the hour." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-14T15:25:48Z", who: "olivia", text: "perfect, thanks tariq." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-14T16:32:00Z", who: "tariq",  text: "corrected invoice is sent — just resend, original is voided. credit of $186.40 applied." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-14T16:33:11Z", who: "olivia", text: "got it. thanks." }))

  // Day 3 — feature request
  messages.push(telegramMsg({ id: ++id, at: "2026-04-15T18:02:18Z", who: "olivia", text: "different topic: we've been asking for csv export on the orders dashboard for a while. any update?" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-15T18:08:30Z", who: "jamie",  text: "yes — it's on the roadmap for q2. our pm is actually writing the spec this week. would you be open to a 15-minute call to walk through what columns and filters matter most to you?" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-15T18:09:40Z", who: "olivia", text: "yes. tomorrow afternoon works, after 3pm pacific." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-15T18:10:18Z", who: "jamie",  text: "I'll send a calendar invite for thursday 3:30pm pacific with our pm." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-15T18:11:00Z", who: "olivia", text: "great." }))

  // Day 4 — followup
  messages.push(telegramMsg({ id: ++id, at: "2026-04-16T22:48:09Z", who: "olivia", text: "talked to your pm earlier — really helpful. she said the export will support all 12 columns we use plus a date-range filter. eta end of may?" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-16T22:50:18Z", who: "jamie",  text: "yes — she walked me through it after your call. we'll have a beta in two weeks for you to test, public release end of may." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-16T22:51:00Z", who: "olivia", text: "amazing. happy to be the beta tester." }))

  // Day 5 — postmortem
  messages.push(telegramMsg({ id: ++id, at: "2026-04-17T19:11:00Z", who: "tariq",  text: "as promised — postmortem for monday's outage is attached. tldr: a config drift from a deploy on sunday set our queue worker timeout 10x too low. the cascade was the symptom; the root cause was the config drift.", media: { file: "brewline-postmortem-2026-04-13.pdf", mime_type: "application/pdf" } }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-17T19:12:48Z", who: "tariq",  text: "we've added a config-drift monitor that pages on-call within 30 seconds of any prod-config change that doesn't match our terraform state. small thing, big effect." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-17T19:18:11Z", who: "olivia", text: "thanks for the writeup, that's a thorough postmortem. forwarding to our cto." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-17T19:24:00Z", who: "olivia", text: "[forwarded] our cto says 'this is the kind of postmortem I wish more vendors wrote, please thank them'", forwarded: "Olivia Rao" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-17T19:25:00Z", who: "jamie",  text: "that means a lot, thank you. and please thank your cto." }))

  // Day 6 — beta access
  messages.push(telegramMsg({ id: ++id, at: "2026-04-21T16:00:00Z", who: "jamie",  text: "good news — csv export beta is live for your account a week early. log in and you should see the new 'export' button on the orders page. would love your feedback this week." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-21T16:08:18Z", who: "olivia", text: "wow, fast. trying it now." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-21T16:14:09Z", who: "olivia", text: "first impressions: works, the date filter is exactly what we wanted. small thing — when I export over 50k rows the page hangs for a few seconds before the download starts. is there a progress indicator coming?" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-21T16:18:30Z", who: "jamie",  text: "good catch. progress bar + 'export in background, we'll email you the link' fallback for >25k rows is on the v2 list. I'll bump it up so it's in v1.", replyTo: id - 1 }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-21T16:19:00Z", who: "olivia", text: "thanks 🙏" }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-22T15:32:18Z", who: "olivia", text: "another small one — could the export include the 'cancellation_reason' column? we need it for our weekly ops review." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-22T15:40:00Z", who: "jamie",  text: "yes, easy add. it'll be in tomorrow's beta build.", replyTo: id - 1 }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-23T17:05:08Z", who: "jamie",  text: "tomorrow's beta is now today's beta — cancellation_reason column is in. progress bar lands monday." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-23T17:09:42Z", who: "olivia", text: "verified. perfect." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-24T16:20:00Z", who: "olivia", text: "appreciate the responsiveness this week. the outage on monday could have been a brutal start but you turned it around." }))
  messages.push(telegramMsg({ id: ++id, at: "2026-04-24T16:21:30Z", who: "jamie",  text: "thank you — that's the loop we try to close every time. have a good weekend." }))

  return {
    name: "Brewline Support · Acme Coffee",
    type: "private_supergroup",
    id: 9988776655,
    messages,
  }
}

// ---------------------------------------------------------------------------
// Write outputs.
// ---------------------------------------------------------------------------

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }) }

function writeJson(rel, obj) {
  const full = path.join(root, rel)
  ensureDir(path.dirname(full))
  fs.writeFileSync(full, JSON.stringify(obj, null, 2))
  console.log(`✓ ${rel} (${(fs.statSync(full).size / 1024).toFixed(1)} KB)`)
}

writeJson("examples/slack/input.json",    buildSlack())
writeJson("examples/discord/input.json",  buildDiscord())
writeJson("examples/telegram/input.json", buildTelegram())

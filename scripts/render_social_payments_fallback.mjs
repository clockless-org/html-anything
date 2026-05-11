#!/usr/bin/env node
/**
 * Offline fallback renderer for venmo-paypal-payments.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned template
 * that satisfies the prompts/sources/venmo-paypal-payments.md contract on top of
 * the _finance.md family contract:
 *
 *   1. Source-aware hero card (Venmo/PayPal · sent/received/net/people)
 *   2. Monthly cashflow timeline (twin bars + net line)
 *   3. People (counterparty leaderboard, click to filter)
 *   4. Stories (heuristic story-cluster bars, * = inferred)
 *   5. Recurring (regular reimbursement / subscription patterns)
 *   6. Flags (round-trip / refund / fee / held / dispute / self-transfer)
 *   7. Drill-down transaction table with chips + privacy-styled notes
 *   8. Privacy + analytical-only footer
 *
 * The page renders the FULL data (the `rows` array is inlined), so the
 * drill-down can grow without re-running the LLM.
 *
 * Usage:
 *   node scripts/render_social_payments_fallback.mjs INPUT --out OUT --title TITLE [--editorial "..."]
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { pickParser } from "../dist/parse/index.js"

const TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>__TITLE__</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
:root {
  --primary:#a03b00; --primary-container:#c94c00; --primary-fixed:#ffdbcd;
  --primary-fixed-dim:#ffb597; --on-primary:#fff; --accent-glow:#E8400D;
  --secondary:#d5baff; --secondary-container:#7b40e0; --tertiary:#4d44e3; --accent-cyan:#00D4FF;
  --bg:#fff8f6; --surface:#fff8f6; --surface-container-lowest:#fff;
  --surface-container-low:#fbf2ef; --surface-container:#f5ece9; --surface-container-high:#efe6e3;
  --fg-1:#1e1b19; --fg-2:#594138; --fg-muted:#8d7166;
  --border:rgba(0,0,0,.06); --border-strong:rgba(0,0,0,.12); --outline-variant:#e1bfb2;
  --green:#10b981; --blue:#3b82f6; --yellow:#f59e0b; --red:#ef4444;
  --font-headline:'Space Grotesk',ui-sans-serif,system-ui,sans-serif;
  --font-body:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;
  --font-mono:'SF Mono','Menlo',ui-monospace,monospace;
  --space-xs:4px; --space-sm:8px; --space-md:12px; --space-lg:16px;
  --space-xl:20px; --space-2xl:24px; --space-3xl:32px; --space-4xl:48px; --space-5xl:64px;
  --radius-sm:8px; --radius-md:12px; --radius-lg:16px; --radius-xl:20px; --radius-2xl:28px; --radius-pill:9999px;
  --shadow-sm:0 1px 2px rgba(30,27,25,.04); --shadow-md:0 4px 12px rgba(30,27,25,.08);
  --shadow-lg:0 8px 24px rgba(30,27,25,.12); --shadow-accent:0 8px 24px rgba(160,59,0,.15);
  --gradient-primary:linear-gradient(135deg,#a03b00 0%,#c94c00 100%);
  --gradient-hero:linear-gradient(135deg,#a03b00 0%,#7b40e0 100%);
  --gradient-text:linear-gradient(135deg,#a03b00 0%,#7b40e0 100%);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:#060B18; --surface:#0B1426; --surface-container-lowest:#101D35;
    --surface-container-low:#101D35; --surface-container:#162544; --surface-container-high:#1c2d52;
    --fg-1:#F8FAFC; --fg-2:#CBD5E1; --fg-muted:#64748B;
    --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.14);
    --primary:#FF6B35; --accent-glow:#00D4FF;
    --shadow-md:0 4px 12px rgba(0,0,0,.4); --shadow-lg:0 8px 24px rgba(0,0,0,.5);
  }
}
*,*::before,*::after{box-sizing:border-box;margin:0}
html,body{background:var(--bg);color:var(--fg-1);font-family:var(--font-body);
  font-size:15.5px;line-height:1.55;-webkit-font-smoothing:antialiased}
body{min-height:100vh}
main{max-width:1240px;margin:0 auto;padding:var(--space-2xl) var(--space-xl) var(--space-5xl)}
h1,h2,h3,h4{font-family:var(--font-headline);letter-spacing:-.01em;font-weight:600;color:var(--fg-1)}
h1{font-size:clamp(28px,5vw,46px);font-weight:700;line-height:1.05;letter-spacing:-.02em}
h2{font-size:clamp(20px,2.4vw,24px);margin-bottom:var(--space-md)}
h3{font-size:17px;margin-bottom:var(--space-sm)}
.muted{color:var(--fg-muted)}
.mono{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.num{font-variant-numeric:tabular-nums}
button{font:inherit;cursor:pointer;border:none;background:transparent;color:inherit}
input,select{font:inherit;color:var(--fg-1)}
a{color:var(--primary);text-decoration:none}
a:hover{text-decoration:underline}
.hero{padding:var(--space-3xl) 0 var(--space-2xl);border-bottom:1px solid var(--border)}
.hero .eyebrow{display:inline-flex;gap:var(--space-sm);align-items:center;
  background:var(--surface-container);color:var(--primary);
  padding:var(--space-xs) var(--space-md);border-radius:var(--radius-pill);
  font-family:var(--font-mono);font-size:11.5px;font-weight:500;
  text-transform:uppercase;letter-spacing:.08em;margin-bottom:var(--space-lg)}
.hero h1{background:var(--gradient-text);-webkit-background-clip:text;background-clip:text;color:transparent;max-width:24ch}
.hero .editorial{margin-top:var(--space-lg);max-width:64ch;color:var(--fg-2);font-size:17px;line-height:1.55}
.hero .source-caption{margin-top:var(--space-md);max-width:60ch;font-size:13.5px;color:var(--fg-muted);font-style:italic}
.privacy-banner{display:flex;align-items:center;gap:var(--space-sm);margin-top:var(--space-lg);
  padding:var(--space-sm) var(--space-md);background:var(--surface-container-low);
  border:1px solid var(--border);border-radius:var(--radius-pill);
  font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);max-width:max-content}
.privacy-banner .dot{width:7px;height:7px;border-radius:50%;background:var(--green)}
.hero-actions{display:flex;gap:var(--space-md);margin-top:var(--space-xl);flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) var(--space-lg);
  border-radius:var(--radius-pill);font-weight:600;font-size:14px;border:1px solid var(--border-strong);
  background:var(--surface-container-lowest);color:var(--fg-1);transition:all .15s ease;cursor:pointer}
.btn:hover{background:var(--surface-container);box-shadow:var(--shadow-sm)}
.btn.primary{background:var(--gradient-primary);color:var(--on-primary);border-color:transparent}
.btn.primary:hover{box-shadow:var(--shadow-accent)}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--space-lg);margin-top:var(--space-3xl)}
.kpi{background:var(--surface-container-lowest);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:var(--space-lg) var(--space-xl);box-shadow:var(--shadow-sm)}
.kpi .label{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);font-weight:500}
.kpi .value{font-family:var(--font-headline);font-size:28px;font-weight:600;margin-top:var(--space-xs);color:var(--fg-1);font-variant-numeric:tabular-nums}
.kpi .value.accent{color:var(--primary)}
.kpi .value.pos{color:var(--green)}
.kpi .value.neg{color:var(--red)}
.kpi .sub{font-size:12.5px;color:var(--fg-muted);margin-top:2px;font-family:var(--font-mono)}
.section{margin-top:var(--space-4xl)}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:var(--space-lg);gap:var(--space-md);flex-wrap:wrap}
.section-head .meta{font-size:13px;color:var(--fg-muted);font-family:var(--font-mono)}
.card{background:var(--surface-container-lowest);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:var(--space-xl);box-shadow:var(--shadow-sm)}
/* Cashflow */
.bars-svg{width:100%;height:230px;display:block;margin-top:var(--space-md)}
.bars-svg rect.bar.sent{fill:var(--primary);opacity:.7}
.bars-svg rect.bar.recvd{fill:var(--secondary-container);opacity:.7}
.bars-svg rect.bar:hover{opacity:1}
.bars-svg path.netline{fill:none;stroke:var(--fg-2);stroke-width:1.4;stroke-dasharray:3 3;opacity:.6}
.bars-svg circle.netdot{fill:var(--fg-2);opacity:.6}
.bars-svg text{font-family:var(--font-mono);font-size:10.5px;fill:var(--fg-muted)}
.bars-axis{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);margin-top:var(--space-xs)}
.bars-legend{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-md);font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.bars-legend strong{color:var(--fg-1);font-weight:600}
.bars-legend .swatch{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:middle;margin-right:6px}
.bars-legend .sent{background:var(--primary);opacity:.8}
.bars-legend .recvd{background:var(--secondary-container);opacity:.8}
/* People */
.people-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.people-tbl thead th{text-align:left;font-family:var(--font-mono);font-size:11.5px;font-weight:500;
  color:var(--fg-muted);text-transform:uppercase;letter-spacing:.06em;padding:var(--space-sm) var(--space-md);
  border-bottom:1px solid var(--border-strong)}
.people-tbl tbody tr{border-bottom:1px solid var(--border);cursor:pointer}
.people-tbl tbody tr:hover{background:var(--surface-container-low)}
.people-tbl td{padding:var(--space-sm) var(--space-md);vertical-align:top;font-variant-numeric:tabular-nums}
.people-tbl td.amt{text-align:right;font-family:var(--font-mono)}
.people-tbl td.amt.neg{color:var(--red)}
.people-tbl td.amt.pos{color:var(--green)}
.people-tbl td.name{font-weight:600;color:var(--fg-1)}
.people-tbl tr.loop td.name::after{content:"↻";color:var(--secondary-container);margin-left:6px;font-size:13px}
.story-chip{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-left:6px}
.story-chip.rent{background:rgba(123,64,224,.13);color:var(--secondary-container)}
.story-chip.food{background:rgba(245,158,11,.18);color:#a06200}
.story-chip.travel{background:rgba(0,212,255,.15);color:var(--tertiary)}
.story-chip.gifts{background:rgba(239,68,68,.13);color:var(--red)}
.story-chip.subscriptions{background:rgba(16,185,129,.13);color:var(--green)}
.story-chip.rides{background:rgba(245,158,11,.12);color:#a06200}
.story-chip.utilities{background:rgba(59,130,246,.13);color:var(--blue)}
.story-chip.reimbursement{background:rgba(160,59,0,.13);color:var(--primary)}
.story-chip.marketplace{background:rgba(123,64,224,.10);color:var(--secondary-container)}
.story-chip.other{background:var(--surface-container);color:var(--fg-muted)}
.story-chip.cash-out{background:var(--surface-container-high);color:var(--fg-2)}
@media (prefers-color-scheme:dark){
  .story-chip.food{background:rgba(245,158,11,.18);color:#fcd34d}
  .story-chip.rides{background:rgba(245,158,11,.18);color:#fcd34d}
}
.inferred-star{color:var(--fg-muted);font-size:11px;margin-left:3px;cursor:help}
/* Stories */
.story-row{display:grid;grid-template-columns:170px 1fr 110px;gap:var(--space-md);align-items:center;
  padding:var(--space-md) 0;border-bottom:1px solid var(--border);cursor:pointer}
.story-row:last-child{border-bottom:none}
.story-row:hover{background:var(--surface-container-low)}
.story-row .name{font-size:13.5px;color:var(--fg-1);font-weight:500;display:flex;align-items:center;gap:6px}
.story-row .barwrap{height:10px;background:var(--surface-container);border-radius:var(--radius-pill);overflow:hidden;position:relative;display:flex}
.story-row .barwrap .sent{height:100%;background:var(--primary);opacity:.8}
.story-row .barwrap .recvd{height:100%;background:var(--secondary-container);opacity:.8}
.story-row .stat{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-1);text-align:right;font-variant-numeric:tabular-nums}
.story-row .stat .sub{display:block;color:var(--fg-muted);font-size:11px;margin-top:1px}
.story-row .notes{grid-column:1 / -1;font-size:12px;color:var(--fg-muted);font-style:italic;margin-top:6px;padding-left:0}
@media (max-width:640px){.story-row{grid-template-columns:1fr 86px}.story-row .barwrap{display:none}}
/* Recurring */
.recurring-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-md)}
.recurring{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);transition:border-color .15s ease}
.recurring:hover{border-color:var(--primary)}
.recurring .who{font-weight:600;font-size:14px;color:var(--fg-1)}
.recurring .meta-row{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-xs);
  font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.recurring .meta-row b{color:var(--primary);font-weight:600}
/* Flags */
.flag-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-md)}
.flag{background:var(--surface-container-lowest);border:1px solid var(--border);border-left:3px solid var(--primary);
  border-radius:var(--radius-md);padding:var(--space-md) var(--space-lg);cursor:pointer;transition:border-color .15s ease}
.flag:hover{border-color:var(--primary)}
.flag .kind{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);
  font-family:var(--font-mono);font-weight:500;margin-bottom:var(--space-xs)}
.flag .label{font-weight:600;font-size:14px;color:var(--fg-1);margin-bottom:var(--space-xs)}
.flag .detail{font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.flag.refund{border-left-color:var(--secondary-container)}
.flag.fee{border-left-color:var(--yellow)}
.flag.held{border-left-color:var(--blue)}
.flag.dispute{border-left-color:var(--red)}
.flag.self-transfer{border-left-color:var(--fg-muted)}
.flag.round-trip{border-left-color:var(--green)}
.flag-empty{padding:var(--space-md);font-size:13px;color:var(--fg-muted);font-style:italic}
/* Drill-down */
.drill-toolbar{display:flex;gap:var(--space-md);margin-bottom:var(--space-md);flex-wrap:wrap;align-items:center}
.drill-search{flex:1 1 280px;min-width:220px;padding:var(--space-sm) var(--space-md);border:1px solid var(--border-strong);
  border-radius:var(--radius-md);background:var(--surface-container-lowest);font-size:14px;font-family:var(--font-mono)}
.drill-search:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:var(--primary)}
.drill-meta{font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.chips{display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:var(--space-md)}
.chip{display:inline-flex;align-items:center;gap:var(--space-sm);padding:6px var(--space-md);
  border-radius:var(--radius-pill);background:var(--surface-container);border:1px solid var(--border);
  font-size:12.5px;font-weight:500;cursor:pointer;transition:all .15s ease;user-select:none}
.chip:hover{background:var(--surface-container-high)}
.chip.active{background:var(--primary);color:var(--on-primary);border-color:transparent}
.chip .count{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);font-weight:400}
.chip.active .count{color:rgba(255,255,255,.8)}
.chip-row-label{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);
  font-family:var(--font-mono);font-weight:500;margin-bottom:var(--space-xs);margin-top:var(--space-md)}
details.drill{margin-top:var(--space-md);border:1px solid var(--border);border-radius:var(--radius-lg);
  background:var(--surface-container-lowest);overflow:hidden}
details.drill > summary{cursor:pointer;padding:var(--space-lg) var(--space-xl);font-weight:600;
  font-family:var(--font-headline);font-size:17px;list-style:none;display:flex;align-items:center;justify-content:space-between}
details.drill > summary::-webkit-details-marker{display:none}
details.drill > summary::after{content:"⌄";color:var(--fg-muted);transition:transform .2s ease;font-size:20px}
details.drill[open] > summary::after{transform:rotate(180deg)}
details.drill .drill-body{padding:0 var(--space-xl) var(--space-xl)}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.tbl thead th{text-align:left;font-family:var(--font-mono);font-size:11.5px;font-weight:500;
  color:var(--fg-muted);text-transform:uppercase;letter-spacing:.06em;padding:var(--space-sm) var(--space-md);
  border-bottom:1px solid var(--border-strong)}
.tbl tbody tr{border-bottom:1px solid var(--border);cursor:pointer}
.tbl tbody tr:hover{background:var(--surface-container-low)}
.tbl td{padding:var(--space-sm) var(--space-md);vertical-align:top}
.tbl td.amt{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.tbl td.amt.neg{color:var(--red)}
.tbl td.amt.pos{color:var(--green)}
.tbl td.note{max-width:30ch}
.tbl td.note .n{display:block;font-family:var(--font-mono);font-size:12.5px;color:var(--fg-2);
  background:var(--surface-container-low);padding:2px 6px;border-radius:4px;
  border-bottom:1px dashed var(--border-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbl td.cp{font-weight:500;color:var(--fg-1);max-width:18ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tbl td mark{background:var(--primary-fixed);color:var(--fg-1);padding:0 2px;border-radius:2px}
.tbl tr.refund td.amt,.tbl tr.held td.amt{color:var(--secondary-container)}
.tbl tr.internal{opacity:.65}
.dir-chip{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;
  background:var(--surface-container);font-size:13px;font-weight:600}
.dir-chip.sent{background:rgba(160,59,0,.18);color:var(--primary)}
.dir-chip.received{background:rgba(16,185,129,.16);color:var(--green)}
.dir-chip.internal{background:var(--surface-container-high);color:var(--fg-muted)}
.dir-chip.fee{background:rgba(245,158,11,.18);color:#a06200}
.badge{display:inline-block;padding:1px 6px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;margin-left:6px}
.badge.refund{background:rgba(123,64,224,.15);color:var(--secondary-container)}
.badge.held{background:rgba(59,130,246,.15);color:var(--blue)}
.badge.dispute{background:rgba(239,68,68,.15);color:var(--red)}
.badge.fee{background:rgba(245,158,11,.18);color:#a06200}
.badge.round-trip{background:rgba(16,185,129,.13);color:var(--green)}
.tbl tr.expanded > td{background:var(--surface-container-low)}
.tbl-detail{padding:var(--space-md) var(--space-lg);background:var(--surface-container-low);
  border-radius:var(--radius-md);margin:var(--space-xs) 0}
.tbl-detail dl{display:grid;grid-template-columns:max-content 1fr;gap:var(--space-xs) var(--space-md);
  font-family:var(--font-mono);font-size:12px}
.tbl-detail dt{color:var(--fg-muted)}
.tbl-detail dd{color:var(--fg-1);overflow-wrap:anywhere}
.tbl-loadmore{display:flex;justify-content:center;padding:var(--space-md);font-size:13px;color:var(--fg-muted)}
.tbl-loadmore button{padding:var(--space-sm) var(--space-lg);border-radius:var(--radius-pill);
  border:1px solid var(--border-strong);background:var(--surface-container-lowest)}
.empty-state{padding:var(--space-2xl);text-align:center;font-size:13.5px;color:var(--fg-muted)}
footer{margin-top:var(--space-5xl);padding-top:var(--space-2xl);border-top:1px solid var(--border);
  font-size:12.5px;color:var(--fg-muted);max-width:78ch;line-height:1.6}
footer .privacy{font-style:italic}
@media (max-width:540px){
  main{padding:var(--space-lg) var(--space-md) var(--space-4xl)}
  .tbl td.note{max-width:14ch}
  .tbl td.cp{max-width:12ch}
}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <span class="eyebrow"><span class="mono" id="source-badge">VENMO</span> · social payments · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial">__EDITORIAL__</p>
      <p class="source-caption" id="source-caption"></p>
      <div class="privacy-banner"><span class="dot"></span><span>This page never sent a network request. Everything you see is in this HTML file.</span></div>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy analysis as Markdown</button>
        <button class="btn" id="jump-drill-btn">Jump to all transactions</button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Activity summary">
      <div class="kpi"><div class="label">Sent</div><div class="value mono accent" id="kpi-sent">$0</div><div class="sub" id="kpi-sent-sub"></div></div>
      <div class="kpi"><div class="label">Received</div><div class="value mono" id="kpi-received">$0</div><div class="sub" id="kpi-received-sub"></div></div>
      <div class="kpi"><div class="label">Net</div><div class="value mono" id="kpi-net">$0</div><div class="sub" id="kpi-net-sub"></div></div>
      <div class="kpi"><div class="label">Transactions</div><div class="value mono" id="kpi-txns">0</div><div class="sub" id="kpi-txns-sub"></div></div>
      <div class="kpi"><div class="label">People</div><div class="value mono" id="kpi-people">0</div><div class="sub" id="kpi-people-sub"></div></div>
    </section>

    <section class="section" aria-labelledby="head-cashflow">
      <div class="section-head">
        <h2 id="head-cashflow">Monthly cashflow</h2>
        <span class="meta" id="cashflow-meta"></span>
      </div>
      <div class="card">
        <svg class="bars-svg" id="bars-svg" viewBox="0 0 1000 230" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="bars-axis" id="bars-axis"></div>
        <div class="bars-legend">
          <span><span class="swatch sent"></span><strong>Sent</strong></span>
          <span><span class="swatch recvd"></span><strong>Received</strong></span>
          <span style="margin-left:auto" id="cashflow-callout"></span>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-people">
      <div class="section-head">
        <h2 id="head-people">People</h2>
        <span class="meta" id="people-meta"></span>
      </div>
      <div class="card" style="overflow-x:auto">
        <table class="people-tbl" id="people-tbl">
          <thead><tr>
            <th>Name</th><th style="text-align:right">You paid</th>
            <th style="text-align:right">You received</th><th style="text-align:right">Net</th>
            <th style="text-align:right">Count</th><th>First / last seen</th><th>Story</th>
          </tr></thead>
          <tbody id="people-tbody"></tbody>
        </table>
      </div>
    </section>

    <section class="section" aria-labelledby="head-stories">
      <div class="section-head">
        <h2 id="head-stories">Stories</h2>
        <span class="meta">Heuristic clusters from notes · click a row to filter the drill-down</span>
      </div>
      <div class="card">
        <div id="story-list"></div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-recurring">
      <div class="section-head">
        <h2 id="head-recurring">Recurring</h2>
        <span class="meta" id="recurring-meta"></span>
      </div>
      <div class="recurring-grid" id="recurring-grid"></div>
    </section>

    <section class="section" aria-labelledby="head-flags">
      <div class="section-head">
        <h2 id="head-flags">Flags</h2>
        <span class="meta">Loops, refunds, fees, holds &amp; cash-outs</span>
      </div>
      <div class="flag-grid" id="flag-grid"></div>
    </section>

    <section class="section" aria-labelledby="head-drill">
      <details class="drill" id="drill" open>
        <summary><span><span id="drill-head">Browse all 0 transactions</span></span></summary>
        <div class="drill-body">
          <div class="drill-toolbar">
            <input class="drill-search" id="drill-search" type="search" placeholder="Search counterparty, note, story, status, id…" aria-label="Search transactions">
            <span class="drill-meta" id="drill-count">0 of 0</span>
            <button class="btn" id="drill-clear">Clear filters</button>
          </div>
          <div class="chip-row-label">Counterparty</div>
          <div class="chips" id="cp-chips"></div>
          <div class="chip-row-label">Story</div>
          <div class="chips" id="story-chips"></div>
          <div class="chip-row-label">Direction</div>
          <div class="chips" id="dir-chips"></div>
          <div class="chip-row-label">Status</div>
          <div class="chips" id="status-chips"></div>
          <div class="chip-row-label">Year</div>
          <div class="chips" id="year-chips"></div>
          <div style="overflow-x:auto">
            <table class="tbl" id="tbl">
              <thead><tr>
                <th>Date</th><th>Dir</th><th>Counterparty</th><th>Note</th>
                <th>Story</th><th>Status</th><th style="text-align:right">Amount</th>
              </tr></thead>
              <tbody id="tbody"></tbody>
            </table>
          </div>
          <div class="tbl-loadmore" id="loadmore"></div>
        </div>
      </details>
    </section>

    <footer>
      <p>Generated by <a href="https://github.com/clockless-org/html-anything">html-anything</a> from <span id="footer-source" class="mono"></span> (<span id="footer-bytes" class="mono"></span>) using the offline venmo-paypal-payments template. This file is fully self-contained and makes no network calls beyond the Google Fonts import shared with every html-anything output.</p>
      <p class="privacy" style="margin-top:var(--space-md)">Generated locally — your Venmo / PayPal export never left your machine. The full transaction list is embedded in this HTML and rendered offline in your browser. Notes and counterparty names are inlined as-is from the file you opened. <strong>For sharing, prefer an anonymized export.</strong></p>
      <p style="margin-top:var(--space-md);font-style:italic">Analytical summary, not tax, accounting, or legal advice. Story clusters are inferred from your payment notes — verify against your records before acting on anything here.</p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(function(){
  const fmt = new Intl.NumberFormat("en-US")
  const summary = DATA.summary || {}
  const sym = summary.currencySymbol || "$"
  const rows = DATA.rows || []
  const counterparties = DATA.counterparties || []
  const stories = DATA.stories || []
  const monthlyCashflow = DATA.monthlyCashflow || []
  const recurring = DATA.recurring || []
  const flags = DATA.flags || []
  const source = DATA.source || "venmo"

  function money(n){
    if (n == null) return "—"
    const a = Math.abs(n)
    const v = a >= 1000 ? fmt.format(Math.round(a)) : a.toFixed(2)
    return (n < 0 ? "−" : "") + sym + v
  }
  function pct(x){ return Math.round((x||0) * 1) + "%" }
  function escapeHtml(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])) }
  function ellipsize(s, n){ if (!s) return ""; return s.length > n ? s.slice(0, n-1) + "…" : s }
  function humanBytes(n){ if (!n) return "0 B"; const u = ["B","KB","MB","GB"]; let i=0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ } return n.toFixed(n < 10 && i ? 1 : 0) + " " + u[i] }
  function maskHandle(h){ if (!h) return ""; if (h.length < 10) return h; return h.slice(0,4) + "…" + h.slice(-4) }

  document.getElementById("footer-source").textContent = (DATA.meta && DATA.meta.sourceFile) || "input.csv"
  document.getElementById("footer-bytes").textContent = humanBytes((DATA.meta && DATA.meta.sizeBytes) || 0)

  // Source banner
  const sourceLabel = source === "venmo" ? "VENMO" : "PAYPAL"
  document.getElementById("source-badge").textContent = sourceLabel
  document.getElementById("source-caption").textContent = source === "venmo"
    ? "This is your Venmo statement export. Each row is a payment, charge, fee, or cash-out — notes are the human layer."
    : "This is your PayPal activity export. Each row is a payment, refund, fee, or withdrawal — item titles and notes are the human layer."

  // KPIs
  document.getElementById("kpi-sent").textContent = money(summary.sentTotal)
  document.getElementById("kpi-sent-sub").textContent = (rows.filter(r => r.direction === "sent").length) + " transactions"
  document.getElementById("kpi-received").textContent = money(summary.receivedTotal)
  document.getElementById("kpi-received-sub").textContent = (rows.filter(r => r.direction === "received").length) + " transactions"
  const netEl = document.getElementById("kpi-net")
  netEl.textContent = (summary.net >= 0 ? "+" : "") + money(summary.net).replace(/^−/, "")
  if (summary.net < 0) { netEl.classList.add("neg"); netEl.textContent = "−" + money(Math.abs(summary.net)).replace(/^−/, "") }
  else netEl.classList.add("pos")
  document.getElementById("kpi-net-sub").textContent = "received − sent over the window"
  document.getElementById("kpi-txns").textContent = fmt.format(summary.rowCount || 0)
  document.getElementById("kpi-txns-sub").textContent = (summary.durationLabel || "") + " · " + (summary.monthsActive || 0) + " active months"
  document.getElementById("kpi-people").textContent = fmt.format(summary.distinctCounterparties || 0)
  document.getElementById("kpi-people-sub").textContent = "top: " + ellipsize(summary.topCounterparty || "—", 18)

  // Editorial
  document.getElementById("hero-editorial").textContent = buildEditorial()

  // Cashflow timeline
  function buildCashflow(){
    const svg = document.getElementById("bars-svg")
    const axis = document.getElementById("bars-axis")
    svg.innerHTML = ""
    axis.innerHTML = ""
    if (!monthlyCashflow.length) { svg.innerHTML = '<text x="500" y="115" text-anchor="middle">No data</text>'; return }
    const W = 1000, H = 230, pad = 24, padBottom = 30
    const maxAbs = monthlyCashflow.reduce((m, c) => Math.max(m, c.sent, c.received), 0) || 1
    const bw = (W - pad*2) / monthlyCashflow.length
    const peakSent = monthlyCashflow.reduce((m, c) => c.sent > m.sent ? c : m, monthlyCashflow[0])
    const peakRecvd = monthlyCashflow.reduce((m, c) => c.received > m.received ? c : m, monthlyCashflow[0])
    let svgInner = ""
    monthlyCashflow.forEach((c, i) => {
      const x = pad + i * bw + bw * 0.10
      const halfW = bw * 0.36
      const sentH = ((H - pad - padBottom) * c.sent / maxAbs) || 0
      const recvdH = ((H - pad - padBottom) * c.received / maxAbs) || 0
      const baseY = H - padBottom
      svgInner += '<rect class="bar sent" x="'+x.toFixed(1)+'" y="'+(baseY - sentH).toFixed(1)+'" width="'+halfW.toFixed(1)+'" height="'+Math.max(0,sentH).toFixed(1)+'" rx="2"><title>'+c.month+' · sent '+money(c.sent)+'</title></rect>'
      svgInner += '<rect class="bar recvd" x="'+(x + halfW + 2).toFixed(1)+'" y="'+(baseY - recvdH).toFixed(1)+'" width="'+halfW.toFixed(1)+'" height="'+Math.max(0,recvdH).toFixed(1)+'" rx="2"><title>'+c.month+' · received '+money(c.received)+'</title></rect>'
      if (c === peakSent && c.sent > 0) svgInner += '<text x="'+(x + halfW/2).toFixed(1)+'" y="'+(baseY - sentH - 6).toFixed(1)+'" text-anchor="middle">'+money(c.sent)+'</text>'
      if (c === peakRecvd && c.received > 0 && c !== peakSent) svgInner += '<text x="'+(x + halfW + 2 + halfW/2).toFixed(1)+'" y="'+(baseY - recvdH - 6).toFixed(1)+'" text-anchor="middle" fill="var(--secondary-container)">'+money(c.received)+'</text>'
    })
    // Net dotted line (zero-baseline at 60% of plot height)
    const netZero = pad + (H - pad - padBottom) * 0.5
    const netMaxAbs = monthlyCashflow.reduce((m, c) => Math.max(m, Math.abs(c.net)), 0) || 1
    const netRange = (H - pad - padBottom) * 0.45
    let pathD = ""
    monthlyCashflow.forEach((c, i) => {
      const x = pad + i * bw + bw * 0.5
      const y = netZero - (c.net / netMaxAbs) * netRange
      pathD += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "
      svgInner += '<circle class="netdot" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="1.6"><title>'+c.month+' · net '+money(c.net)+'</title></circle>'
    })
    svgInner = '<path class="netline" d="'+pathD+'"/>' + svgInner
    svg.innerHTML = svgInner
    const step = Math.max(1, Math.ceil(monthlyCashflow.length / 12))
    const labels = monthlyCashflow.map((c, i) => (i % step === 0 || i === monthlyCashflow.length - 1) ? c.month : "")
    axis.innerHTML = labels.map(l => '<span>'+escapeHtml(l)+'</span>').join("")
    document.getElementById("cashflow-meta").textContent = monthlyCashflow.length + " months"
    document.getElementById("cashflow-callout").innerHTML = peakSent.sent > 0
      ? 'Peak month: <strong>'+escapeHtml(peakSent.month)+'</strong> · <strong>'+money(peakSent.sent)+'</strong> sent'
      : ""
  }
  buildCashflow()

  // People
  document.getElementById("people-meta").textContent = counterparties.length + " counterparties · loops marked ↻"
  const ptbody = document.getElementById("people-tbody")
  ptbody.innerHTML = counterparties.slice(0, 15).map(c => {
    const netCls = c.net > 0 ? "pos" : c.net < 0 ? "neg" : ""
    return '<tr class="'+(c.loopHint?"loop":"")+'" data-name="'+escapeHtml(c.name)+'">'+
      '<td class="name">'+escapeHtml(c.name)+'</td>'+
      '<td class="amt">'+money(c.paid)+'</td>'+
      '<td class="amt">'+money(c.received)+'</td>'+
      '<td class="amt '+netCls+'">'+(c.net > 0 ? "+" : "")+money(c.net)+'</td>'+
      '<td class="amt">'+c.count+'</td>'+
      '<td class="mono">'+escapeHtml(c.firstSeen)+' → '+escapeHtml(c.lastSeen)+'</td>'+
      '<td><span class="story-chip '+escapeHtml(c.story)+'">'+escapeHtml(c.story)+'</span></td>'+
    '</tr>'
  }).join("")
  ptbody.querySelectorAll("tr[data-name]").forEach(tr => {
    tr.addEventListener("click", () => {
      const name = tr.getAttribute("data-name")
      toggleChip("cp-chips", name)
      document.getElementById("drill").scrollIntoView({ behavior: "smooth" })
    })
  })

  // Stories
  const storyList = document.getElementById("story-list")
  const totalStoryAbs = stories.reduce((s, x) => s + x.paid + x.received, 0) || 1
  storyList.innerHTML = stories.slice(0, 10).map(s => {
    const sentW = ((s.paid / totalStoryAbs) * 100).toFixed(2)
    const recvdW = ((s.received / totalStoryAbs) * 100).toFixed(2)
    const notes = s.sampleNotes && s.sampleNotes.length
      ? '<div class="notes">e.g. ' + s.sampleNotes.map(n => '"'+escapeHtml(ellipsize(n, 60))+'"').join(' · ') + '</div>'
      : ''
    return '<div class="story-row" data-story="'+escapeHtml(s.story)+'">'+
      '<div class="name"><span class="story-chip '+escapeHtml(s.story)+'">'+escapeHtml(s.story)+'</span><span class="inferred-star" title="Heuristic — clustered from payment notes; not a categorical truth.">*</span></div>'+
      '<div class="barwrap"><div class="sent" style="width:'+sentW+'%"></div><div class="recvd" style="width:'+recvdW+'%"></div></div>'+
      '<div class="stat">'+money(s.paid + s.received)+'<span class="sub">'+s.count+' txns · '+pct(s.share)+'</span></div>'+
      notes +
    '</div>'
  }).join("")
  storyList.querySelectorAll(".story-row").forEach(el => {
    el.addEventListener("click", () => {
      toggleChip("story-chips", el.getAttribute("data-story"))
      document.getElementById("drill").scrollIntoView({ behavior: "smooth" })
    })
  })

  // Recurring
  document.getElementById("recurring-meta").textContent = recurring.length ? recurring.length + " patterns" : "no recurring patterns"
  const rg = document.getElementById("recurring-grid")
  if (!recurring.length) {
    rg.innerHTML = '<div class="muted" style="padding:var(--space-md)">No regular reimbursement patterns detected in this file.</div>'
  } else {
    rg.innerHTML = recurring.slice(0, 12).map(r =>
      '<div class="recurring">'+
        '<div class="who">'+escapeHtml(r.name)+'</div>'+
        '<div class="meta-row"><span><b>'+escapeHtml(r.cadence)+'</b> cadence</span>'+
          '<span><b>'+money(r.avgAmount)+'</b> avg</span>'+
          '<span>×'+r.count+'</span></div>'+
        '<div class="meta-row"><span class="story-chip '+escapeHtml(r.story)+'">'+escapeHtml(r.story)+'</span><span>last '+escapeHtml(r.lastSeen)+'</span></div>'+
      '</div>'
    ).join("")
  }

  // Flags
  const fg = document.getElementById("flag-grid")
  if (!flags.length) {
    fg.innerHTML = '<div class="flag-empty">Nothing flagged in this file.</div>'
  } else {
    fg.innerHTML = flags.map(f =>
      '<div class="flag '+escapeHtml(f.kind)+'" data-ids="'+escapeHtml((f.rowIds || []).join(","))+'">'+
        '<div class="kind">'+escapeHtml(f.kind.replace("-"," "))+'</div>'+
        '<div class="label">'+escapeHtml(f.label)+'</div>'+
        '<div class="detail">'+escapeHtml(f.detail)+'</div>'+
      '</div>'
    ).join("")
    fg.querySelectorAll(".flag").forEach(el => {
      el.addEventListener("click", () => {
        const ids = (el.getAttribute("data-ids") || "").split(",").filter(Boolean)
        if (ids.length === 0) return
        document.getElementById("drill-search").value = ids[0]
        applyFilters()
        document.getElementById("drill").scrollIntoView({ behavior: "smooth" })
      })
    })
  }

  // Drill-down
  document.getElementById("drill-head").textContent = "Browse all " + rows.length + " transactions"
  const PAGE = 100
  let visible = rows.slice()
  let limit = PAGE
  let activeFilters = { cps: new Set(), stories: new Set(), dirs: new Set(), statuses: new Set(), years: new Set() }
  let expandedId = null

  function makeChips(containerId, values, kind){
    const target = document.getElementById(containerId)
    if (!values.length) { target.innerHTML = '<span class="muted" style="font-size:13px">—</span>'; return }
    target.innerHTML = values.map(v =>
      '<button class="chip" data-val="'+escapeHtml(v.label)+'">'+escapeHtml(v.label)+' <span class="count">'+v.count+'</span></button>'
    ).join("")
    target.querySelectorAll(".chip").forEach(el => {
      el.addEventListener("click", () => {
        const v = el.getAttribute("data-val")
        const set = activeFilters[kind]
        if (set.has(v)) { set.delete(v); el.classList.remove("active") }
        else { set.add(v); el.classList.add("active") }
        applyFilters()
      })
    })
  }
  function toggleChip(containerId, value){
    const target = document.getElementById(containerId)
    if (!value) return
    const safe = value.replace(/"/g,'\\"')
    const el = target.querySelector('.chip[data-val="'+safe+'"]')
    if (el) el.click()
  }

  // Build chip options
  const cpCounts = {}, storyCounts = {}, dirCounts = {}, statusCounts = {}, yearCounts = {}
  for (const r of rows) {
    if (r.counterparty) cpCounts[r.counterparty] = (cpCounts[r.counterparty]||0) + 1
    storyCounts[r.story] = (storyCounts[r.story]||0) + 1
    dirCounts[r.direction] = (dirCounts[r.direction]||0) + 1
    statusCounts[r.status || "—"] = (statusCounts[r.status || "—"]||0) + 1
    const y = (r.date||"").slice(0,4); if (y) yearCounts[y] = (yearCounts[y]||0) + 1
  }
  function topN(rec, n){ return Object.entries(rec).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([label,count])=>({label,count})) }
  makeChips("cp-chips", topN(cpCounts, 12), "cps")
  makeChips("story-chips", topN(storyCounts, 12), "stories")
  makeChips("dir-chips", topN(dirCounts, 5), "dirs")
  makeChips("status-chips", topN(statusCounts, 6), "statuses")
  makeChips("year-chips", topN(yearCounts, 8).sort((a,b)=>a.label.localeCompare(b.label)), "years")

  function applyFilters(){
    const q = (document.getElementById("drill-search").value || "").toLowerCase().trim()
    visible = rows.filter(r => {
      if (activeFilters.cps.size && !activeFilters.cps.has(r.counterparty || "")) return false
      if (activeFilters.stories.size && !activeFilters.stories.has(r.story)) return false
      if (activeFilters.dirs.size && !activeFilters.dirs.has(r.direction)) return false
      if (activeFilters.statuses.size && !activeFilters.statuses.has(r.status || "—")) return false
      const y = (r.date||"").slice(0,4)
      if (activeFilters.years.size && !activeFilters.years.has(y)) return false
      if (!q) return true
      return ((r.counterparty||"") + " " + (r.note||"") + " " + (r.story||"") + " " + (r.status||"") + " " + (r.type||"") + " " + (r.id||"") + " " + (r.counterpartyHandle||"")).toLowerCase().includes(q)
    })
    limit = PAGE
    renderTable()
  }
  function dirGlyph(d){ return d === "sent" ? "↗" : d === "received" ? "↙" : d === "internal" ? "↻" : "•" }
  function renderTable(){
    document.getElementById("drill-count").textContent = visible.length + " of " + rows.length
    const tb = document.getElementById("tbody")
    if (!visible.length) { tb.innerHTML = '<tr><td colspan="7" class="empty-state">No transactions match these filters.</td></tr>'; document.getElementById("loadmore").innerHTML = ""; return }
    const slice = visible.slice(0, limit)
    const q = (document.getElementById("drill-search").value || "").trim()
    function highlight(s){ if (!q) return escapeHtml(s); const i = s.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return escapeHtml(s); return escapeHtml(s.slice(0,i)) + "<mark>" + escapeHtml(s.slice(i, i+q.length)) + "</mark>" + escapeHtml(s.slice(i+q.length)) }
    tb.innerHTML = slice.map(r => {
      const flag = (r.flags && r.flags[0]) || ""
      const rowCls = [r.direction, flag].filter(Boolean).join(" ")
      const expanded = expandedId === r.id ? "expanded" : ""
      const detail = expandedId === r.id ? renderDetail(r) : ""
      const amtCls = r.direction === "received" ? "pos" : r.direction === "sent" ? "neg" : ""
      const amtStr = r.direction === "received" ? "+" + money(Math.abs(r.amount)) : r.direction === "internal" ? money(r.amount) : "−" + money(Math.abs(r.amount))
      const cp = r.counterparty || (r.direction === "internal" ? "(self · cash-out)" : "—")
      return '<tr class="'+rowCls+' '+expanded+'" data-id="'+escapeHtml(r.id)+'">'+
        '<td class="mono">'+escapeHtml(r.date)+'</td>'+
        '<td><span class="dir-chip '+escapeHtml(r.direction)+'" title="'+escapeHtml(r.direction)+'">'+dirGlyph(r.direction)+'</span></td>'+
        '<td class="cp" title="'+escapeHtml(cp)+'">'+highlight(cp)+'</td>'+
        '<td class="note">'+(r.note ? '<span class="n">'+highlight(r.note)+'</span>' : '<span class="muted">—</span>')+'</td>'+
        '<td><span class="story-chip '+escapeHtml(r.story)+'">'+escapeHtml(r.story)+'</span></td>'+
        '<td>'+escapeHtml(r.status || "—")+(flag?'<span class="badge '+escapeHtml(flag)+'">'+escapeHtml(flag)+'</span>':'')+'</td>'+
        '<td class="amt '+amtCls+'">'+amtStr+'</td>'+
      '</tr>' + (detail ? '<tr class="detail-row"><td colspan="7">'+detail+'</td></tr>' : "")
    }).join("")
    tb.querySelectorAll("tr[data-id]").forEach(tr => {
      tr.addEventListener("click", () => {
        const id = tr.getAttribute("data-id")
        expandedId = expandedId === id ? null : id
        renderTable()
      })
    })
    const lm = document.getElementById("loadmore")
    if (limit < visible.length) lm.innerHTML = '<button id="lm-btn">Load '+Math.min(PAGE, visible.length-limit)+' more</button>'
    else lm.innerHTML = visible.length + ' shown'
    const btn = document.getElementById("lm-btn")
    if (btn) btn.onclick = () => { limit += PAGE; renderTable() }
  }
  function renderDetail(r){
    const entries = []
    for (const [k, v] of Object.entries(r.raw || {})) {
      if (!v) continue
      entries.push("<dt>"+escapeHtml(k)+"</dt><dd>"+escapeHtml(v)+"</dd>")
    }
    return '<div class="tbl-detail"><dl>'+entries.join("")+'</dl></div>'
  }
  document.getElementById("drill-search").addEventListener("input", applyFilters)
  document.getElementById("drill-clear").addEventListener("click", () => {
    document.getElementById("drill-search").value = ""
    activeFilters = { cps: new Set(), stories: new Set(), dirs: new Set(), statuses: new Set(), years: new Set() }
    document.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active"))
    applyFilters()
  })
  applyFilters()

  // Buttons
  document.getElementById("jump-drill-btn").addEventListener("click", () => document.getElementById("drill").scrollIntoView({ behavior: "smooth" }))
  document.getElementById("copy-md-btn").addEventListener("click", async () => {
    const md = buildMarkdown()
    try { await navigator.clipboard.writeText(md); flashBtn("copy-md-btn", "Copied ✓") }
    catch { window.prompt("Copy this Markdown:", md); flashBtn("copy-md-btn", "Copied ✓") }
  })
  function flashBtn(id, text){ const el = document.getElementById(id); const orig = el.textContent; el.textContent = text; setTimeout(()=>el.textContent = orig, 1600) }

  function buildEditorial(){
    const parts = []
    const sourceLabel = source === "venmo" ? "Venmo" : "PayPal"
    parts.push(sourceLabel + " activity over " + (summary.durationLabel || "this window") + ".")
    parts.push(money(summary.sentTotal) + " sent across " + (summary.distinctCounterparties || 0) + " people, " + money(summary.receivedTotal) + " received back" + (summary.net !== 0 ? " — net " + (summary.net >= 0 ? "+" : "−") + money(Math.abs(summary.net)) : "") + ".")
    const top = stories[0]
    if (top && top.share) parts.push(top.story + " led at " + pct(top.share) + " of activity (heuristic, from notes).")
    const cp = counterparties[0]
    if (cp) parts.push("Most-frequent counterparty: " + cp.name + " (" + cp.count + " transactions, paid " + money(cp.paid) + " / received " + money(cp.received) + ").")
    return parts.join(" ")
  }
  function buildMarkdown(){
    const lines = []
    lines.push("# "+(document.getElementById("hero-title").textContent || (source === "venmo" ? "Venmo activity" : "PayPal activity")))
    lines.push("")
    lines.push(buildEditorial())
    lines.push("")
    lines.push("## Headline")
    lines.push("- Sent: "+money(summary.sentTotal))
    lines.push("- Received: "+money(summary.receivedTotal))
    lines.push("- Net: "+(summary.net >= 0 ? "+" : "−")+money(Math.abs(summary.net)))
    lines.push("- Window: "+summary.period+" ("+summary.durationLabel+", "+summary.monthsActive+" active months)")
    lines.push("- People: "+summary.distinctCounterparties)
    if (summary.feeTotal) lines.push("- Fees: "+money(summary.feeTotal))
    if (summary.refundTotal) lines.push("- Refunds: "+money(summary.refundTotal))
    if (summary.internalTotal) lines.push("- Cash-out: "+money(summary.internalTotal))
    lines.push("")
    lines.push("## Top counterparties")
    for (const c of counterparties.slice(0, 8)) {
      lines.push("- "+c.name+" — paid "+money(c.paid)+", received "+money(c.received)+", net "+(c.net>=0?"+":"−")+money(Math.abs(c.net))+" ("+c.count+" txns, dominant story: "+c.story+(c.loopHint?", loop":"")+")")
    }
    lines.push("")
    lines.push("## Stories (heuristic)")
    for (const s of stories.slice(0, 8)) {
      lines.push("- "+s.story+" — "+pct(s.share)+" share · "+s.count+" txns · paid "+money(s.paid)+", received "+money(s.received))
    }
    lines.push("")
    if (recurring.length) {
      lines.push("## Recurring patterns")
      for (const r of recurring.slice(0, 8)) lines.push("- "+r.name+" — "+r.cadence+" · avg "+money(r.avgAmount)+" · ×"+r.count+" · last "+r.lastSeen)
      lines.push("")
    }
    if (flags.length) {
      lines.push("## Flags")
      for (const f of flags) lines.push("- ["+f.kind+"] "+f.label+" — "+f.detail)
      lines.push("")
    }
    return lines.join("\n")
  }
})()
  </script>
</body>
</html>`

async function main() {
  const args = process.argv.slice(2)
  if (!args.length) {
    console.error("Usage: node scripts/render_social_payments_fallback.mjs INPUT --out OUT --title TITLE")
    process.exit(1)
  }
  const input = args[0]
  const out = arg(args, "--out") || input.replace(/\.[^.]+$/, ".html")
  const title = arg(args, "--title") || path.basename(input).replace(/\.[^.]+$/, "")
  const editorial = arg(args, "--editorial") || ""

  const parser = await pickParser(input)
  if (!parser) { console.error("No parser matched", input); process.exit(2) }
  const parsed = await parser.parse(input)
  if (parsed.contentType !== "venmo-paypal-payments") {
    console.error("Expected venmo-paypal-payments, got", parsed.contentType)
    process.exit(3)
  }

  const html = TEMPLATE
    .replace(/__TITLE__/g, escapeHtml(title))
    .replace(/__EDITORIAL__/g, escapeHtml(editorial))
    .replace("__DATA__", inlineJson(parsed.data))
  await fs.writeFile(out, html, "utf8")
  console.log("Wrote " + out + " (" + (html.length / 1024).toFixed(1) + " KB)")
}

function arg(args, name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i+1] : null
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))
}
function inlineJson(o) {
  return JSON.stringify(o).replace(/<\/(script)/gi, "<\\/$1")
}

await main()

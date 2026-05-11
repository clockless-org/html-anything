#!/usr/bin/env node
/**
 * Offline fallback renderer for browser-history.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned template
 * that satisfies the prompts/sources/browser-history.md contract:
 *
 *   1. Hero summary (visits / domains / window / late-night share /
 *      privacy reminder chip)
 *   2. Monthly + weekly bars + day-of-week × hour heatmap with
 *      weekday/weekend toggle
 *   3. Domain leaderboard (eTLD+1, top 12)
 *   4. Topic clusters (heuristic, clearly labeled)
 *   5. Research sessions panel (with "looks like research" badge)
 *   6. Attention audit cards (late-night / work-vs-personal / rabbit
 *      holes / returners / repeated searches)
 *   7. Searchable / filterable drill-down table with row-expand;
 *      full URLs only appear here (and behind a "show query" toggle)
 *   8. Privacy footer
 *
 * The page renders the FULL data (the `rows` array is inlined), so the
 * drill-down can grow to thousands of visits without re-running the LLM.
 *
 * The embedded client script avoids `${...}` substitution because the
 * outer literal is a `String.raw` tagged template and JS template
 * substitution still fires inside one. All in-template JS uses string
 * concatenation instead.
 *
 * Usage:
 *   node scripts/render_browser_history_fallback.mjs INPUT --out OUT --title TITLE
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
  --font-headline:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  --font-body:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  --font-mono:ui-monospace,'SF Mono','Menlo',Consolas,monospace;
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
.hero .editorial{margin-top:var(--space-lg);max-width:62ch;color:var(--fg-2);font-size:17px;line-height:1.55}
.hero .privacy-chip{display:inline-flex;gap:6px;align-items:center;margin-top:var(--space-md);
  padding:6px var(--space-md);border-radius:var(--radius-pill);
  background:var(--surface-container);color:var(--fg-2);font-family:var(--font-mono);
  font-size:11.5px;font-weight:500;letter-spacing:.04em}
.hero .privacy-chip strong{color:var(--primary);font-weight:600}
.hero-actions{display:flex;gap:var(--space-md);margin-top:var(--space-xl);flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) var(--space-lg);
  border-radius:var(--radius-pill);font-weight:600;font-size:14px;border:1px solid var(--border-strong);
  background:var(--surface-container-lowest);color:var(--fg-1);transition:all .15s ease;cursor:pointer}
.btn:hover{background:var(--surface-container);box-shadow:var(--shadow-sm)}
.btn.primary{background:var(--gradient-primary);color:var(--on-primary);border-color:transparent}
.btn.primary:hover{box-shadow:var(--shadow-accent)}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:var(--space-lg);margin-top:var(--space-3xl)}
.kpi{background:var(--surface-container-lowest);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:var(--space-lg) var(--space-xl);box-shadow:var(--shadow-sm)}
.kpi .label{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);font-weight:500}
.kpi .value{font-family:var(--font-headline);font-size:30px;font-weight:600;margin-top:var(--space-xs);color:var(--fg-1);font-variant-numeric:tabular-nums}
.kpi .value.accent{color:var(--primary)}
.kpi .sub{font-size:12.5px;color:var(--fg-muted);margin-top:2px;font-family:var(--font-mono)}
.section{margin-top:var(--space-4xl)}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:var(--space-lg);gap:var(--space-md);flex-wrap:wrap}
.section-head .meta{font-size:13px;color:var(--fg-muted);font-family:var(--font-mono)}
.heuristic-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:var(--radius-pill);
  background:var(--surface-container);color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;
  text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.card{background:var(--surface-container-lowest);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:var(--space-xl);box-shadow:var(--shadow-sm)}
.timeline-toggle{display:inline-flex;gap:var(--space-xs);border:1px solid var(--border-strong);border-radius:var(--radius-pill);padding:3px}
.timeline-toggle button{padding:6px var(--space-md);border-radius:var(--radius-pill);font-size:13px;color:var(--fg-2)}
.timeline-toggle button.active{background:var(--primary);color:var(--on-primary)}
.bars-svg{width:100%;height:200px;display:block;margin-top:var(--space-md)}
.bars-svg rect.bar{fill:var(--primary);opacity:.85}
.bars-svg rect.bar.peak{fill:var(--accent-glow)}
.bars-svg text{font-family:var(--font-mono);font-size:10.5px;fill:var(--fg-muted)}
.bars-axis{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);margin-top:var(--space-xs)}
.bars-legend{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-md);font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.heatmap{display:grid;grid-template-columns:64px repeat(24,1fr);gap:2px;margin-top:var(--space-md);font-family:var(--font-mono);font-size:10.5px;color:var(--fg-muted)}
.heatmap .col-h{text-align:center}
.heatmap .row-d{display:flex;align-items:center;justify-content:flex-end;padding-right:6px}
.heatmap .cell{aspect-ratio:1;border-radius:3px;background:var(--surface-container)}
.heatmap .cell[data-c="1"]{background:rgba(160,59,0,.18)}
.heatmap .cell[data-c="2"]{background:rgba(160,59,0,.34)}
.heatmap .cell[data-c="3"]{background:rgba(160,59,0,.55)}
.heatmap .cell[data-c="4"]{background:rgba(160,59,0,.78)}
.heatmap .cell[data-c="5"]{background:var(--primary)}
@media (prefers-color-scheme:dark){
  .heatmap .cell[data-c="1"]{background:rgba(255,107,53,.20)}
  .heatmap .cell[data-c="2"]{background:rgba(255,107,53,.36)}
  .heatmap .cell[data-c="3"]{background:rgba(255,107,53,.55)}
  .heatmap .cell[data-c="4"]{background:rgba(255,107,53,.78)}
  .heatmap .cell[data-c="5"]{background:var(--primary)}
}
.heatmap-legend{display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-sm);font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.heatmap-legend .scale{display:inline-flex;gap:2px}
.heatmap-legend .swatch{width:12px;height:12px;border-radius:2px;background:var(--surface-container)}
.heatmap-legend .swatch[data-c="1"]{background:rgba(160,59,0,.18)}
.heatmap-legend .swatch[data-c="2"]{background:rgba(160,59,0,.34)}
.heatmap-legend .swatch[data-c="3"]{background:rgba(160,59,0,.55)}
.heatmap-legend .swatch[data-c="4"]{background:rgba(160,59,0,.78)}
.heatmap-legend .swatch[data-c="5"]{background:var(--primary)}
/* Sessions */
.session-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--space-md)}
.session{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);cursor:pointer;transition:border-color .15s ease}
.session:hover{border-color:var(--primary)}
.session .when{font-family:var(--font-mono);font-size:12px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.06em}
.session .top{font-weight:600;font-size:15px;margin-top:var(--space-xs);line-height:1.3}
.session .meta{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-2);margin-top:var(--space-xs);display:flex;flex-wrap:wrap;gap:var(--space-md);align-items:center}
.session .meta b{color:var(--primary);font-weight:600}
.session .badge-research{display:inline-flex;align-items:center;padding:1px 8px;border-radius:var(--radius-sm);
  background:rgba(123,64,224,.14);color:var(--secondary-container);font-family:var(--font-mono);
  font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.session .titles{font-size:12.5px;color:var(--fg-2);margin-top:var(--space-sm);line-height:1.45;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
/* Domain leaderboard */
.lb{display:grid;grid-template-columns:1fr;gap:var(--space-xs)}
.lb .row{display:grid;grid-template-columns:24px 1fr 90px 90px;gap:var(--space-md);align-items:center;
  padding:var(--space-sm) var(--space-md);border-radius:var(--radius-md);cursor:pointer;transition:background .15s ease}
.lb .row:hover{background:var(--surface-container)}
.lb .row .rank{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);text-align:right}
.lb .row .name{font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap}
.lb .row .topic-chip{padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.lb .row .name .hosts{font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);font-weight:400}
.lb .row .bar{position:relative;height:8px;border-radius:4px;background:var(--surface-container)}
.lb .row .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--gradient-primary);border-radius:4px}
.lb .row .count{font-family:var(--font-mono);font-variant-numeric:tabular-nums;text-align:right;color:var(--fg-1)}
.lb .row .count .share{display:block;font-size:11.5px;color:var(--fg-muted);font-weight:400}
@media (max-width:640px){
  .lb .row{grid-template-columns:24px 1fr 70px}
  .lb .row .bar{display:none}
}
/* Topics */
.topic-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-md)}
.topic{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);cursor:pointer;transition:border-color .15s ease;
  display:flex;flex-direction:column;gap:6px}
.topic:hover{border-color:var(--primary)}
.topic .label{font-weight:600;font-size:14.5px;text-transform:capitalize}
.topic .stats{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.topic .pct{font-family:var(--font-mono);font-size:11.5px;color:var(--primary);font-weight:600}
.topic .progress{position:relative;height:6px;border-radius:3px;background:var(--surface-container);margin-top:4px}
.topic .progress i{position:absolute;left:0;top:0;bottom:0;background:var(--gradient-primary);border-radius:3px}
/* Audit */
.audit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--space-md)}
.audit-card{padding:var(--space-lg) var(--space-xl);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest)}
.audit-card .label{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);font-weight:500}
.audit-card .value{font-family:var(--font-headline);font-size:24px;font-weight:600;margin-top:var(--space-xs);color:var(--fg-1);font-variant-numeric:tabular-nums}
.audit-card .value.accent{color:var(--primary)}
.audit-card .body{margin-top:var(--space-sm);font-size:13.5px;color:var(--fg-2);line-height:1.5}
.audit-card .body ul{padding-left:18px;margin:6px 0 0;color:var(--fg-2)}
.audit-card .body li{margin:3px 0;font-size:13px}
.audit-card .body .cad{color:var(--fg-muted);font-family:var(--font-mono);font-size:11.5px}
.split-bar{display:flex;height:14px;border-radius:8px;overflow:hidden;background:var(--surface-container);margin-top:var(--space-sm)}
.split-bar .seg{height:100%}
.split-bar .seg.work{background:var(--primary)}
.split-bar .seg.personal{background:var(--secondary-container)}
.split-bar .seg.search{background:var(--yellow)}
.split-bar .seg.other{background:var(--fg-muted)}
.split-legend{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-sm);font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.split-legend .key{display:inline-flex;align-items:center;gap:6px}
.split-legend .key .dot{width:10px;height:10px;border-radius:2px}
.split-legend .key .dot.work{background:var(--primary)}
.split-legend .key .dot.personal{background:var(--secondary-container)}
.split-legend .key .dot.search{background:var(--yellow)}
.split-legend .key .dot.other{background:var(--fg-muted)}
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
.tbl{width:100%;border-collapse:collapse}
.tbl thead th{text-align:left;padding:var(--space-sm) var(--space-md);font-size:11.5px;text-transform:uppercase;
  letter-spacing:.08em;color:var(--fg-muted);font-weight:500;border-bottom:1px solid var(--border)}
.tbl tbody td{padding:var(--space-sm) var(--space-md);font-size:13.5px;color:var(--fg-1);border-bottom:1px solid var(--border);vertical-align:top}
.tbl tbody tr.late td{background:rgba(123,64,224,.06)}
.tbl tbody tr.typed td{background:rgba(245,158,11,.06)}
.tbl .col-time{font-family:var(--font-mono);font-size:12px;color:var(--fg-2);white-space:nowrap}
.tbl .col-title{font-weight:500;line-height:1.4}
.tbl .col-domain{font-family:var(--font-mono);font-size:12px;color:var(--fg-2)}
.tbl .col-topic{font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.06em}
.tbl .col-visits{font-family:var(--font-mono);font-size:12px;color:var(--fg-2);text-align:right;font-variant-numeric:tabular-nums}
.tbl .badge{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-left:6px}
.tbl .badge.late{background:rgba(123,64,224,.18);color:var(--secondary-container)}
.tbl .badge.typed{background:rgba(245,158,11,.18);color:#b25e00}
@media (prefers-color-scheme:dark){
  .tbl .badge.typed{color:#f59e0b}
}
.row-detail{padding:var(--space-md) var(--space-lg);background:var(--surface-container-low);border-radius:var(--radius-md);
  margin:var(--space-xs) 0 var(--space-md);font-family:var(--font-mono);font-size:11.5px;color:var(--fg-2);
  display:grid;grid-template-columns:max-content 1fr;gap:6px var(--space-md)}
.row-detail dt{font-weight:600;color:var(--fg-muted)}
.row-detail dd{margin:0;word-break:break-all}
.row-detail a{color:var(--primary)}
.row-detail .qmask{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-muted);font-family:var(--font-mono);font-size:11px}
.row-detail .urlrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.row-detail .copy{font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
  padding:2px 8px;border-radius:var(--radius-sm);background:var(--surface-container);cursor:pointer;border:1px solid var(--border)}
.empty-state{padding:var(--space-2xl);text-align:center;font-size:13.5px;color:var(--fg-muted)}
.tbl-loadmore{display:flex;justify-content:center;padding:var(--space-md);font-size:13px;color:var(--fg-muted)}
.tbl-loadmore button{padding:var(--space-sm) var(--space-lg);border-radius:var(--radius-pill);
  border:1px solid var(--border-strong);background:var(--surface-container-lowest)}
footer{margin-top:var(--space-5xl);padding-top:var(--space-2xl);border-top:1px solid var(--border);
  font-size:12.5px;color:var(--fg-muted);max-width:78ch;line-height:1.6}
footer .privacy{font-style:italic}
@media (max-width:540px){
  main{padding:var(--space-lg) var(--space-md) var(--space-4xl)}
  .heatmap{grid-template-columns:48px repeat(24,1fr);font-size:9px}
}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <span class="eyebrow"><span class="mono">BROWSER HISTORY</span> · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial"></p>
      <span class="privacy-chip"><strong>Local only</strong> — your history stays in this file; no network calls.</span>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy attention note as Markdown</button>
        <button class="btn" id="jump-table-btn">Jump to drill-down</button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Visit summary">
      <div class="kpi"><div class="label">Visits</div><div class="value mono accent" id="kpi-visits">0</div><div class="sub" id="kpi-visits-sub"></div></div>
      <div class="kpi"><div class="label">Domains</div><div class="value mono" id="kpi-domains">0</div><div class="sub" id="kpi-domains-sub"></div></div>
      <div class="kpi"><div class="label">Window</div><div class="value mono" id="kpi-window">—</div><div class="sub" id="kpi-window-sub"></div></div>
      <div class="kpi"><div class="label">Late-night share</div><div class="value mono" id="kpi-late">—</div><div class="sub" id="kpi-late-sub"></div></div>
    </section>

    <section class="section" aria-labelledby="head-rhythm">
      <div class="section-head">
        <h2 id="head-rhythm">Activity timeline</h2>
        <div class="timeline-toggle" role="tablist">
          <button id="t-month" class="active" role="tab" aria-selected="true">Monthly</button>
          <button id="t-week" role="tab" aria-selected="false">Weekly</button>
        </div>
      </div>
      <div class="card">
        <svg class="bars-svg" id="bars-svg" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="bars-axis" id="bars-axis"></div>
        <div class="bars-legend" id="bars-legend"></div>
      </div>
      <div class="card" style="margin-top:var(--space-md)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:var(--space-md)">
          <div>
            <h3 style="margin-bottom:var(--space-xs)">When you reach for the browser</h3>
            <div class="muted" style="font-size:12.5px;font-family:var(--font-mono)">Day-of-week × hour-of-day · UTC</div>
          </div>
          <div class="timeline-toggle" role="tablist">
            <button id="hm-all" class="active" role="tab" aria-selected="true">All</button>
            <button id="hm-weekday" role="tab" aria-selected="false">Weekdays</button>
            <button id="hm-weekend" role="tab" aria-selected="false">Weekends</button>
          </div>
        </div>
        <div class="heatmap" id="heatmap"></div>
        <div class="heatmap-legend">
          <span>fewer</span>
          <span class="scale">
            <span class="swatch" data-c="0"></span>
            <span class="swatch" data-c="1"></span>
            <span class="swatch" data-c="2"></span>
            <span class="swatch" data-c="3"></span>
            <span class="swatch" data-c="4"></span>
            <span class="swatch" data-c="5"></span>
          </span>
          <span>more</span>
          <span class="heuristic-chip" style="margin-left:auto">Heuristic</span>
          <span>Hours read directly from the export timestamp (UTC); device timezone not included.</span>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-domains">
      <div class="section-head">
        <h2 id="head-domains">Domains</h2>
        <span class="meta" id="domains-meta"></span>
      </div>
      <div class="card">
        <div class="lb" id="lb-list"></div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-topics">
      <div class="section-head">
        <h2 id="head-topics">Topics</h2>
        <div style="display:flex;gap:var(--space-sm);align-items:center">
          <span class="heuristic-chip" title="Topic labels come from domain + title keyword matches over a curated list. No topic modeling, no LLM-derived labels.">Heuristic</span>
          <span class="meta" id="topics-meta"></span>
        </div>
      </div>
      <div class="topic-grid" id="topic-grid"></div>
    </section>

    <section class="section" aria-labelledby="head-sessions">
      <div class="section-head">
        <h2 id="head-sessions">Sessions</h2>
        <span class="meta" id="sessions-meta"></span>
      </div>
      <div class="session-grid" id="session-grid"></div>
      <div class="empty-state" id="sessions-empty" hidden>No multi-page sessions found — your browsing is in short bursts.</div>
    </section>

    <section class="section" aria-labelledby="head-audit">
      <div class="section-head">
        <h2 id="head-audit">Attention audit</h2>
      </div>
      <div class="audit-grid">
        <div class="audit-card">
          <div class="label">Late-night share</div>
          <div class="value accent" id="audit-late">—</div>
          <div class="body" id="audit-late-body"></div>
        </div>
        <div class="audit-card">
          <div class="label">Work vs personal</div>
          <div class="value" id="audit-bucket">—</div>
          <div class="split-bar" id="bucket-bar" aria-hidden="true"></div>
          <div class="split-legend" id="bucket-legend"></div>
        </div>
        <div class="audit-card">
          <div class="label">Returners (5+ visits)</div>
          <div class="value" id="audit-rd">—</div>
          <div class="body" id="audit-rd-body"></div>
        </div>
        <div class="audit-card">
          <div class="label">Repeated searches</div>
          <div class="value" id="audit-search">—</div>
          <div class="body" id="audit-search-body"></div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-drill">
      <div class="section-head">
        <h2 id="head-drill" style="scroll-margin-top:1em">Browse all visits</h2>
        <span class="meta">Click a row to expand · full URLs shown only inside detail</span>
      </div>
      <div class="card">
        <div class="drill-toolbar">
          <input class="drill-search" id="drill-search" type="search" placeholder="Search title, domain, topic…" aria-label="Search visits">
          <span class="drill-meta" id="drill-count">0 of 0</span>
          <button class="btn" id="drill-clear">Clear filters</button>
        </div>
        <div class="chip-row-label">Domain</div>
        <div class="chips" id="domain-chips"></div>
        <div class="chip-row-label">Topic</div>
        <div class="chips" id="topic-chips"></div>
        <div class="chip-row-label">Year</div>
        <div class="chips" id="year-chips"></div>
        <div class="chip-row-label">Filters</div>
        <div class="chips" id="flag-chips">
          <div class="chip" data-flag="late"><span>Late-night only</span> <span class="count" id="flag-late-count">0</span></div>
          <div class="chip" data-flag="typed"><span>Typed only</span> <span class="count" id="flag-typed-count">0</span></div>
          <div class="chip" data-flag="search"><span>Searches only</span> <span class="count" id="flag-search-count">0</span></div>
          <div class="chip" data-flag="returner"><span>Returners</span> <span class="count" id="flag-returner-count">0</span></div>
        </div>
        <table class="tbl" id="drill-table">
          <thead><tr><th>Time</th><th>Title</th><th>Domain</th><th>Topic</th><th class="col-visits">Visits</th></tr></thead>
          <tbody id="drill-body"></tbody>
        </table>
        <div class="tbl-loadmore" id="loadmore"></div>
      </div>
    </section>

    <footer>
      <p>Generated by <a href="https://github.com/clockless-org/html-anything">html-anything</a> from <span id="footer-source" class="mono"></span> (<span id="footer-bytes" class="mono"></span>) using the offline browser-history template. This file is fully self-contained and makes no network calls — it uses your operating system's default sans-serif font and never fetches favicons, thumbnails, or any third-party content.</p>
      <p class="privacy" style="margin-top:var(--space-md)">Generated locally — your browser history never left your machine. Every visit is embedded in this HTML and rendered offline in your browser. Topic labels are a heuristic domain/title roll-up, not topic modeling. Full URLs only appear in the drill-down detail panel below; query strings are masked when they look like account numbers, emails, or session tokens. <strong>The page does not fetch from any browser vendor, search engine, or third party.</strong> "Open" links open in a new tab only when you click them.</p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(function(){
  var fmt = new Intl.NumberFormat("en-US")
  var summary = DATA.summary || {}
  var rows = DATA.rows || []
  var domains = DATA.domains || []
  var topics = DATA.topics || []
  var bucketTotals = DATA.bucketTotals || []
  var monthTotals = DATA.monthTotals || []
  var weekTotals = DATA.weekTotals || []
  var heatmap = DATA.heatmap || Array.from({length:7}, function(){return new Array(24).fill(0)})
  var weekdayHeatmap = DATA.weekdayHeatmap || heatmap
  var weekendHeatmap = DATA.weekendHeatmap || heatmap
  var sessions = DATA.sessions || []
  var returners = DATA.returners || []
  var repeatedSearches = DATA.repeatedSearches || []
  var meta = DATA.meta || {}
  var DOW_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

  function escapeHtml(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return c === "&" ? "&amp;"
        : c === "<" ? "&lt;"
        : c === ">" ? "&gt;"
        : c === '"' ? "&quot;"
        : "&#39;"
    })
  }
  function ellipsize(s, n){ if (!s) return ""; return s.length > n ? s.slice(0, n - 1) + "…" : s }
  function pct(x){ return Math.round((x || 0) * 100) + "%" }
  function pct1(x){ return ((x || 0) * 100).toFixed(1) + "%" }
  function humanBytes(n){
    if (!n) return "0 B"
    var u = ["B","KB","MB","GB"], i = 0
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
    return (n < 10 && i ? n.toFixed(1) : Math.round(n)) + " " + u[i]
  }
  function fmtIso(s, withTime){
    if (!s) return ""
    var d = new Date(s)
    if (isNaN(d.getTime())) return s
    var date = d.toISOString().slice(0, 10)
    if (!withTime) return date
    var hh = String(d.getUTCHours()).padStart(2, "0")
    var mm = String(d.getUTCMinutes()).padStart(2, "0")
    return date + " " + hh + ":" + mm + "Z"
  }

  document.getElementById("footer-source").textContent = meta.sourceFile || "history.csv"
  document.getElementById("footer-bytes").textContent = humanBytes(meta.sizeBytes || 0)

  // ----- KPIs
  document.getElementById("kpi-visits").textContent = fmt.format(summary.totalCount || 0)
  document.getElementById("kpi-visits-sub").textContent =
    (summary.uniqueUrls || 0) + " unique URLs · " +
    (summary.activeDays || 0) + " active days"
  document.getElementById("kpi-domains").textContent = fmt.format(summary.uniqueDomains || 0)
  document.getElementById("kpi-domains-sub").textContent = summary.topDomain
    ? "Top: " + ellipsize(summary.topDomain, 24) + " · " + pct(summary.topDomainShare)
    : ""
  document.getElementById("kpi-window").textContent = summary.durationLabel || "—"
  document.getElementById("kpi-window-sub").textContent =
    (summary.dateRange || "") + (summary.activeMonths ? " · " + summary.activeMonths + " months" : "")
  document.getElementById("kpi-late").textContent = pct(summary.lateNightShare)
  document.getElementById("kpi-late-sub").textContent =
    (summary.lateNightCount || 0) + " of " + (summary.totalCount || 0) + " between 0–4 UTC"

  document.getElementById("hero-editorial").textContent = buildEditorial()

  // ----- Timeline bars
  var mode = "month"
  function buildBars(series, labelFn){
    var svg = document.getElementById("bars-svg")
    var axis = document.getElementById("bars-axis")
    svg.innerHTML = ""
    axis.innerHTML = ""
    if (!series.length) {
      svg.innerHTML = '<text x="500" y="100" text-anchor="middle">No visits in this window</text>'
      return
    }
    var W = 1000, H = 200, pad = 24, padBottom = 30
    var max = 0
    var peakIdx = 0
    series.forEach(function(s, i){
      if (s.count > max) { max = s.count; peakIdx = i }
    })
    if (!max) max = 1
    var bw = (W - pad * 2) / series.length
    var inner = ""
    series.forEach(function(s, i){
      if (!s.count) return
      var usable = H - pad - padBottom
      var h = (s.count / max) * usable
      var x = pad + i * bw + bw * 0.1
      var y = H - padBottom - h
      var w = bw * 0.8
      var cls = i === peakIdx ? "bar peak" : "bar"
      inner += '<rect class="' + cls + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"></rect>'
      if (i === peakIdx) {
        inner += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y - 6).toFixed(1) + '" text-anchor="middle">' + s.count + '</text>'
      }
    })
    inner += '<line x1="' + pad + '" y1="' + (H - padBottom) + '" x2="' + (W - pad) + '" y2="' + (H - padBottom) + '" stroke="rgba(0,0,0,.08)" />'
    svg.innerHTML = inner
    var first = labelFn(series[0])
    var peak = labelFn(series[peakIdx])
    var last = labelFn(series[series.length - 1])
    axis.innerHTML = '<span>' + escapeHtml(first) + '</span><span>peak: ' + escapeHtml(peak) + ' (' + series[peakIdx].count + ')</span><span>' + escapeHtml(last) + '</span>'
    document.getElementById("bars-legend").innerHTML =
      '<span><strong>' + series.length + '</strong> ' + (mode === "month" ? "months" : "weeks") + '</span>' +
      '<span>peak: <strong>' + series[peakIdx].count + '</strong> visits</span>' +
      '<span>average: <strong>' + Math.round(series.reduce(function(a,b){return a + b.count}, 0) / series.length) + '</strong> per ' + (mode === "month" ? "month" : "week") + '</span>'
  }
  function renderBars(){
    if (mode === "month") buildBars(monthTotals, function(s){ return s.month })
    else buildBars(weekTotals, function(s){ return s.week })
  }
  document.getElementById("t-month").addEventListener("click", function(){
    mode = "month"
    document.getElementById("t-month").classList.add("active")
    document.getElementById("t-week").classList.remove("active")
    renderBars()
  })
  document.getElementById("t-week").addEventListener("click", function(){
    mode = "week"
    document.getElementById("t-week").classList.add("active")
    document.getElementById("t-month").classList.remove("active")
    renderBars()
  })
  renderBars()

  // ----- Heatmap (with weekday/weekend toggle)
  var hmMode = "all"
  function renderHeatmap(){
    var src = hmMode === "weekday" ? weekdayHeatmap : (hmMode === "weekend" ? weekendHeatmap : heatmap)
    var max = 0
    for (var d = 0; d < 7; d++) for (var h = 0; h < 24; h++) if (src[d][h] > max) max = src[d][h]
    function bucket(v){
      if (!v) return 0
      if (max <= 1) return 5
      var n = Math.ceil((v / max) * 5)
      return Math.max(1, Math.min(5, n))
    }
    var html = '<span></span>'
    for (var hh = 0; hh < 24; hh++) html += '<span class="col-h">' + (hh % 6 === 0 ? hh : "") + '</span>'
    for (var dd = 0; dd < 7; dd++) {
      // Skip weekends row in weekday mode (visually) by leaving cells dim
      html += '<span class="row-d">' + DOW_NAMES[dd] + '</span>'
      for (var hh2 = 0; hh2 < 24; hh2++) {
        var v = src[dd][hh2] || 0
        var b = bucket(v)
        html += '<span class="cell" data-c="' + b + '" title="' + DOW_NAMES[dd] + " " + hh2 + ":00 — " + v + ' visits"></span>'
      }
    }
    document.getElementById("heatmap").innerHTML = html
  }
  function setHmMode(next){
    hmMode = next
    var ids = {all:"hm-all",weekday:"hm-weekday",weekend:"hm-weekend"}
    Object.keys(ids).forEach(function(k){
      var el = document.getElementById(ids[k])
      if (k === next) el.classList.add("active"); else el.classList.remove("active")
    })
    renderHeatmap()
  }
  document.getElementById("hm-all").addEventListener("click", function(){ setHmMode("all") })
  document.getElementById("hm-weekday").addEventListener("click", function(){ setHmMode("weekday") })
  document.getElementById("hm-weekend").addEventListener("click", function(){ setHmMode("weekend") })
  renderHeatmap()

  // ----- Sessions
  var sessionFilter = null
  ;(function(){
    var grid = document.getElementById("session-grid")
    var meta = document.getElementById("sessions-meta")
    var empty = document.getElementById("sessions-empty")
    if (!sessions.length) {
      grid.style.display = "none"
      empty.hidden = false
      meta.textContent = "0 sessions"
      return
    }
    var researchCount = sessions.filter(function(s){ return s.looksLikeResearch }).length
    meta.textContent = sessions.length + " sessions · ≥4 visits within 30-min gaps · " + researchCount + " look like research"
    grid.innerHTML = sessions.slice(0, 12).map(function(s){
      var when = fmtIso(s.start, true)
      var dur = s.durationMin >= 60
        ? Math.floor(s.durationMin / 60) + "h " + (s.durationMin % 60) + "m"
        : s.durationMin + " min"
      var titles = (s.sampleTitles || []).slice(0, 4).map(escapeHtml).join(" · ")
      var researchBadge = s.looksLikeResearch ? '<span class="badge-research">looks like research</span>' : ""
      return '<div class="session" data-ids="' + (s.itemIds || []).join(",") + '">' +
        '<div class="when">' + escapeHtml(when) + '</div>' +
        '<div class="top">' + escapeHtml(s.topDomain || "(mixed)") + '</div>' +
        '<div class="meta"><span><b>' + s.count + '</b> visits</span><span>' + escapeHtml(dur) + '</span>' + researchBadge + '</div>' +
        '<div class="titles">' + titles + '</div>' +
      '</div>'
    }).join("")
    Array.prototype.forEach.call(grid.querySelectorAll(".session"), function(el){
      el.addEventListener("click", function(){
        var ids = (el.getAttribute("data-ids") || "").split(",").filter(Boolean)
        sessionFilter = new Set(ids)
        searchInput.value = ""
        activeDomain = null; activeTopic = null; activeYear = null
        flagFilter = null
        document.getElementById("head-drill").scrollIntoView({behavior: "smooth"})
        renderTable()
      })
    })
  })()

  // ----- Domain leaderboard
  ;(function(){
    var top = domains.slice(0, 12)
    var maxCount = top.length ? top[0].count : 1
    document.getElementById("domains-meta").textContent =
      domains.length + " domains · top 12 shown · collapsed to eTLD+1"
    document.getElementById("lb-list").innerHTML = top.map(function(c, i){
      var w = Math.max(2, (c.count / maxCount) * 100)
      var hostLabel = c.hosts > 1 ? '<span class="hosts">across ' + c.hosts + ' hosts</span>' : ''
      return '<div class="row" data-domain="' + escapeHtml(c.domain) + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="name">' + escapeHtml(c.domain) + ' <span class="topic-chip">' + escapeHtml(c.topic) + '</span> ' + hostLabel + '</span>' +
        '<span class="bar"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
        '<span class="count">' + c.count + '<span class="share">' + pct(c.share) + '</span></span>' +
      '</div>'
    }).join("")
    Array.prototype.forEach.call(document.querySelectorAll(".lb .row"), function(el){
      el.addEventListener("click", function(){
        var name = el.getAttribute("data-domain")
        activeDomain = activeDomain === name ? null : name
        sessionFilter = null
        renderTable()
        renderChips()
        document.getElementById("head-drill").scrollIntoView({behavior: "smooth"})
      })
    })
  })()

  // ----- Topics
  ;(function(){
    var grid = document.getElementById("topic-grid")
    var maxCount = topics.length ? topics[0].count : 1
    document.getElementById("topics-meta").textContent = topics.length + " topic buckets"
    grid.innerHTML = topics.map(function(t){
      var w = Math.max(2, (t.count / maxCount) * 100)
      return '<div class="topic" data-topic="' + escapeHtml(t.topic) + '">' +
        '<span class="label">' + escapeHtml(t.topic.replace(/-/g, " ")) + '</span>' +
        '<div class="stats">' + t.count + ' visits · ' + t.domains + ' domains</div>' +
        '<div class="pct">' + pct1(t.share) + '</div>' +
        '<div class="progress"><i style="width:' + w.toFixed(1) + '%"></i></div>' +
      '</div>'
    }).join("")
    Array.prototype.forEach.call(grid.querySelectorAll(".topic"), function(el){
      el.addEventListener("click", function(){
        var t = el.getAttribute("data-topic")
        activeTopic = activeTopic === t ? null : t
        sessionFilter = null
        renderTable()
        renderChips()
        document.getElementById("head-drill").scrollIntoView({behavior: "smooth"})
      })
    })
  })()

  // ----- Attention audit
  ;(function(){
    document.getElementById("audit-late").textContent = pct(summary.lateNightShare) + " late-night"
    var lateBody = document.getElementById("audit-late-body")
    if (summary.lateNightCount) {
      var lateRows = rows.filter(function(r){ return r.isLateNight }).slice(-3).reverse()
      lateBody.innerHTML =
        '<div>' + summary.lateNightCount + ' visits between 00:00–04:00 UTC.</div>' +
        '<ul>' + lateRows.map(function(r){
          return '<li>' + escapeHtml(fmtIso(r.ts, true)) + ' — ' +
            escapeHtml(ellipsize(r.title, 60)) +
            ' <span class="cad">(' + escapeHtml(r.domain || "—") + ')</span></li>'
        }).join("") + '</ul>'
    } else {
      lateBody.textContent = "No visits in the 00:00–04:00 UTC window — your late-night browser is empty."
    }

    var bk = {}; bucketTotals.forEach(function(b){ bk[b.bucket] = b })
    var work = bk.work ? bk.work.share : 0
    var personal = bk.personal ? bk.personal.share : 0
    var search = bk.search ? bk.search.share : 0
    var other = bk.other ? bk.other.share : 0
    document.getElementById("audit-bucket").textContent =
      pct(work) + " work · " + pct(personal) + " personal"
    var bar = document.getElementById("bucket-bar")
    bar.innerHTML =
      '<span class="seg work" style="width:' + (work * 100).toFixed(1) + '%"></span>' +
      '<span class="seg personal" style="width:' + (personal * 100).toFixed(1) + '%"></span>' +
      '<span class="seg search" style="width:' + (search * 100).toFixed(1) + '%"></span>' +
      '<span class="seg other" style="width:' + (other * 100).toFixed(1) + '%"></span>'
    document.getElementById("bucket-legend").innerHTML =
      '<span class="key"><span class="dot work"></span>work ' + pct(work) + '</span>' +
      '<span class="key"><span class="dot personal"></span>personal ' + pct(personal) + '</span>' +
      '<span class="key"><span class="dot search"></span>search ' + pct(search) + '</span>' +
      '<span class="key"><span class="dot other"></span>other ' + pct(other) + '</span>'

    document.getElementById("audit-rd").textContent = (returners.length || 0) + " returners"
    var rdBody = document.getElementById("audit-rd-body")
    if (returners.length) {
      rdBody.innerHTML =
        '<div>URLs visited 5+ times — bookmarks in disguise.</div>' +
        '<ul>' + returners.slice(0, 4).map(function(v){
          return '<li>' + escapeHtml(ellipsize(v.title, 60)) +
            ' <span class="cad">' + v.timesVisited + '× · ' + escapeHtml(v.cadenceLabel || "—") +
            ' · ' + escapeHtml(v.domain || "—") + '</span></li>'
        }).join("") + '</ul>'
    } else {
      rdBody.textContent = "No URL visited 5+ times yet — your browsing is broad rather than repetitive."
    }

    document.getElementById("audit-search").textContent = (repeatedSearches.length || 0) + " repeated"
    var searchBody = document.getElementById("audit-search-body")
    if (repeatedSearches.length) {
      searchBody.innerHTML =
        '<div>Search queries that show up 3+ times.</div>' +
        '<ul>' + repeatedSearches.slice(0, 4).map(function(q){
          return '<li>' + escapeHtml(ellipsize(q.query, 60)) +
            ' <span class="cad">' + q.count + '× · ' + escapeHtml(q.engine) + ' · last ' + escapeHtml(q.lastSeen) + '</span></li>'
        }).join("") + '</ul>'
    } else {
      searchBody.textContent = "No search query repeated 3+ times — every search has been one-off."
    }
  })()

  // ----- Drill-down
  var returnerIds = new Set()
  returners.forEach(function(v){ (v.sampleIds || []).forEach(function(id){ returnerIds.add(id) }) })
  var typedCount = rows.filter(function(r){ return r.isTyped }).length
  var searchVisitCount = rows.filter(function(r){ return r.isSearch }).length
  document.getElementById("flag-late-count").textContent = summary.lateNightCount || 0
  document.getElementById("flag-typed-count").textContent = typedCount
  document.getElementById("flag-search-count").textContent = searchVisitCount
  document.getElementById("flag-returner-count").textContent = returnerIds.size

  var searchInput = document.getElementById("drill-search")
  var activeDomain = null
  var activeTopic = null
  var activeYear = null
  var flagFilter = null
  var pageSize = 60
  var visibleN = pageSize

  function years(){
    var s = new Set()
    rows.forEach(function(r){ s.add(r.date.slice(0, 4)) })
    return Array.from(s).sort()
  }

  function renderChips(){
    var topDoms = domains.slice(0, 12)
    document.getElementById("domain-chips").innerHTML = topDoms.map(function(c){
      var act = activeDomain === c.domain ? " active" : ""
      return '<div class="chip' + act + '" data-domain="' + escapeHtml(c.domain) + '">' +
        escapeHtml(c.domain) + ' <span class="count">' + c.count + '</span></div>'
    }).join("")
    document.getElementById("topic-chips").innerHTML = topics.map(function(t){
      var act = activeTopic === t.topic ? " active" : ""
      return '<div class="chip' + act + '" data-topic="' + escapeHtml(t.topic) + '">' +
        escapeHtml(t.topic.replace(/-/g, " ")) + ' <span class="count">' + t.count + '</span></div>'
    }).join("")
    document.getElementById("year-chips").innerHTML = years().map(function(y){
      var act = activeYear === y ? " active" : ""
      var n = rows.filter(function(r){ return r.date.slice(0, 4) === y }).length
      return '<div class="chip' + act + '" data-year="' + escapeHtml(y) + '">' +
        escapeHtml(y) + ' <span class="count">' + n + '</span></div>'
    }).join("")
    Array.prototype.forEach.call(document.querySelectorAll('#flag-chips .chip'), function(el){
      var f = el.getAttribute("data-flag")
      if (flagFilter === f) el.classList.add("active"); else el.classList.remove("active")
    })
    bindChipHandlers()
  }
  function bindChipHandlers(){
    Array.prototype.forEach.call(document.querySelectorAll("#domain-chips .chip"), function(el){
      el.onclick = function(){
        var name = el.getAttribute("data-domain")
        activeDomain = activeDomain === name ? null : name
        sessionFilter = null
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#topic-chips .chip"), function(el){
      el.onclick = function(){
        var t = el.getAttribute("data-topic")
        activeTopic = activeTopic === t ? null : t
        sessionFilter = null
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#year-chips .chip"), function(el){
      el.onclick = function(){
        var y = el.getAttribute("data-year")
        activeYear = activeYear === y ? null : y
        sessionFilter = null
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#flag-chips .chip"), function(el){
      el.onclick = function(){
        var f = el.getAttribute("data-flag")
        flagFilter = flagFilter === f ? null : f
        sessionFilter = null
        renderChips(); renderTable()
      }
    })
  }

  function applyFilters(){
    var q = (searchInput.value || "").trim().toLowerCase()
    return rows.filter(function(r){
      if (sessionFilter && !sessionFilter.has(r.id)) return false
      if (activeDomain && r.domain !== activeDomain) return false
      if (activeTopic && r.topic !== activeTopic) return false
      if (activeYear && r.date.slice(0, 4) !== activeYear) return false
      if (flagFilter === "late" && !r.isLateNight) return false
      if (flagFilter === "typed" && !r.isTyped) return false
      if (flagFilter === "search" && !r.isSearch) return false
      if (flagFilter === "returner" && !returnerIds.has(r.id)) return false
      if (q) {
        var hay = (r.title + " " + (r.domain || "") + " " + r.topic + " " + r.path).toLowerCase()
        if (hay.indexOf(q) < 0) return false
      }
      return true
    })
  }

  function renderTable(){
    var matches = applyFilters()
    document.getElementById("drill-count").textContent = matches.length + " of " + rows.length
    var body = document.getElementById("drill-body")
    if (!matches.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">No visits match the current filters.</td></tr>'
      document.getElementById("loadmore").innerHTML = ""
      return
    }
    var slice = matches.slice(0, visibleN)
    body.innerHTML = slice.map(function(r){
      var tcls = []
      if (r.isLateNight) tcls.push("late")
      if (r.isTyped) tcls.push("typed")
      var badge = ""
      if (r.isLateNight) badge += '<span class="badge late">late</span>'
      if (r.isTyped) badge += '<span class="badge typed">typed</span>'
      // Title only — never the URL — in the table.
      var titleHtml = escapeHtml(ellipsize(r.title, 90))
      return '<tr class="' + tcls.join(" ") + '" data-id="' + escapeHtml(r.id) + '">' +
        '<td class="col-time">' + escapeHtml(fmtIso(r.ts, true)) + '</td>' +
        '<td class="col-title">' + titleHtml + badge + '</td>' +
        '<td class="col-domain">' + escapeHtml(r.domain || "—") + '</td>' +
        '<td class="col-topic">' + escapeHtml(r.topic.replace(/-/g, " ")) + '</td>' +
        '<td class="col-visits">' + (r.visitCount || 1) + '</td>' +
      '</tr>'
    }).join("")
    Array.prototype.forEach.call(body.querySelectorAll("tr"), function(tr){
      tr.addEventListener("click", function(ev){
        if (ev.target && (ev.target.tagName === "A" || ev.target.classList.contains("copy") || ev.target.classList.contains("qmask"))) return
        toggleRowDetail(tr)
      })
    })
    var more = matches.length - slice.length
    document.getElementById("loadmore").innerHTML = more > 0
      ? '<button id="loadmore-btn">Show ' + Math.min(more, pageSize) + ' more (of ' + more + ')</button>'
      : ""
    var btn = document.getElementById("loadmore-btn")
    if (btn) btn.onclick = function(){ visibleN += pageSize; renderTable() }
  }
  function toggleRowDetail(tr){
    var id = tr.getAttribute("data-id")
    var next = tr.nextElementSibling
    if (next && next.classList.contains("detail-row") && next.getAttribute("data-for") === id) {
      next.parentNode.removeChild(next); return
    }
    var r = rows.find(function(x){ return x.id === id })
    if (!r) return
    var tr2 = document.createElement("tr")
    tr2.className = "detail-row"
    tr2.setAttribute("data-for", id)
    var td = document.createElement("td")
    td.colSpan = 5
    var pathLabel = escapeHtml(r.host + r.path)
    var queryLabel = ""
    if (r.query) {
      if (r.queryMasked) {
        queryLabel = '<span class="qmask">query masked — looks like ID/email/token</span>'
      } else {
        queryLabel = '<span class="qmask" data-show="0" data-q="' + escapeHtml(r.query) + '" id="q-' + escapeHtml(r.id) + '">show query (' + r.query.length + ' chars)</span>'
      }
    }
    var openLink = '<a href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener noreferrer">open in new tab</a>'
    var copyBtn = '<span class="copy" data-copy="' + escapeHtml(r.url) + '">copy URL</span>'
    td.innerHTML = '<dl class="row-detail">' +
      '<dt>id</dt><dd>' + escapeHtml(r.id) + '</dd>' +
      '<dt>title</dt><dd>' + escapeHtml(r.title) + '</dd>' +
      '<dt>time (UTC)</dt><dd>' + escapeHtml(r.ts) + '</dd>' +
      '<dt>domain</dt><dd>' + escapeHtml(r.domain) +
        (r.host !== r.domain ? ' <span class="qmask">host: ' + escapeHtml(r.host) + '</span>' : "") + '</dd>' +
      '<dt>path</dt><dd>' + pathLabel + (queryLabel ? ' ' + queryLabel : "") + '</dd>' +
      '<dt>url</dt><dd><div class="urlrow">' + openLink + copyBtn + '</div></dd>' +
      '<dt>visits</dt><dd>' + (r.visitCount || 1) + (r.typedCount ? ' (' + r.typedCount + ' typed)' : '') + '</dd>' +
      '<dt>transition</dt><dd>' + escapeHtml(r.transition) + '</dd>' +
      '<dt>topic</dt><dd>' + escapeHtml(r.topic) +
        (r.topicInferred ? ' <span class="qmask">heuristic</span>' : "") + '</dd>' +
      '<dt>flags</dt><dd>' +
        (r.isLateNight ? '<span class="badge late">late-night</span> ' : "") +
        (r.isTyped ? '<span class="badge typed">typed</span> ' : "") +
        (r.isSearch ? '<span class="badge">search</span>' : "") +
        (!r.isLateNight && !r.isTyped && !r.isSearch ? '—' : "") +
      '</dd>' +
    '</dl>'
    tr2.appendChild(td)
    tr.parentNode.insertBefore(tr2, tr.nextSibling)
    var qel = td.querySelector("#q-" + r.id.replace(/[^a-z0-9_-]/gi, "_"))
    // Re-query because id selector is dynamic; iterate fallback.
    Array.prototype.forEach.call(td.querySelectorAll(".qmask[data-show]"), function(el){
      el.addEventListener("click", function(){
        if (el.getAttribute("data-show") === "1") {
          el.setAttribute("data-show", "0")
          el.textContent = "show query (" + (el.getAttribute("data-q") || "").length + " chars)"
        } else {
          el.setAttribute("data-show", "1")
          el.textContent = "?" + (el.getAttribute("data-q") || "")
        }
      })
    })
    Array.prototype.forEach.call(td.querySelectorAll(".copy"), function(el){
      el.addEventListener("click", function(){
        var url = el.getAttribute("data-copy") || ""
        copy(url, el)
      })
    })
  }

  document.getElementById("drill-clear").addEventListener("click", function(){
    activeDomain = null; activeTopic = null; activeYear = null; flagFilter = null
    sessionFilter = null; searchInput.value = ""; visibleN = pageSize
    renderChips(); renderTable()
  })
  searchInput.addEventListener("input", function(){ visibleN = pageSize; renderTable() })
  document.getElementById("jump-table-btn").addEventListener("click", function(){
    document.getElementById("head-drill").scrollIntoView({behavior: "smooth"})
  })
  renderChips()
  renderTable()

  function copy(text, btn){
    var done = function(){
      if (!btn) return
      var prev = btn.textContent
      btn.textContent = "Copied"
      setTimeout(function(){ btn.textContent = prev }, 1500)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function(){
        var ta = document.createElement("textarea")
        ta.value = text; document.body.appendChild(ta); ta.select()
        try { document.execCommand("copy") } catch(e){}
        document.body.removeChild(ta); done()
      })
    } else {
      var ta = document.createElement("textarea")
      ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand("copy") } catch(e){}
      document.body.removeChild(ta); done()
    }
  }
  document.getElementById("copy-md-btn").addEventListener("click", function(){
    copy(buildAttentionNote(), document.getElementById("copy-md-btn"))
  })

  function buildEditorial(){
    var parts = []
    parts.push((summary.totalCount || 0) + " visits across " + (summary.uniqueDomains || 0) + " domains over " + (summary.durationLabel || "this window") + ".")
    if (summary.topDomain) {
      parts.push(summary.topDomain + " leads with " + Math.round(summary.topDomainShare * 100) + "% of visits.")
    }
    if (summary.busiestDay) {
      parts.push("Busiest single day: " + summary.busiestDay.date + " (" + summary.busiestDay.count + " visits).")
    }
    if (sessions.length) {
      var topS = sessions[0]
      parts.push("Longest session: " + topS.count + " visits in " + topS.durationMin + " min, mostly " + (topS.topDomain || "mixed") + ".")
    }
    if (summary.lateNightShare > 0.05) {
      parts.push(Math.round(summary.lateNightShare * 100) + "% of visits happen between midnight and 4am UTC.")
    }
    return parts.join(" ")
  }
  function buildAttentionNote(){
    var lines = []
    lines.push("# " + (document.getElementById("hero-title").textContent || "Browser history"))
    lines.push("")
    lines.push(buildEditorial())
    lines.push("")
    lines.push("## Headline")
    lines.push("- " + (summary.totalCount || 0) + " visits, " + (summary.uniqueDomains || 0) + " domains, " + (summary.uniqueUrls || 0) + " unique URLs")
    lines.push("- Window: " + (summary.dateRange || "—") + " (" + (summary.durationLabel || "—") + ", " + (summary.activeDays || 0) + " active days)")
    lines.push("- Late-night share: " + Math.round((summary.lateNightShare || 0) * 100) + "%")
    lines.push("- Typed share: " + Math.round((summary.typedShare || 0) * 100) + "%")
    lines.push("")
    lines.push("## Top domains")
    domains.slice(0, 8).forEach(function(c){
      lines.push("- " + c.domain + " — " + c.count + " visits (" + Math.round(c.share * 100) + "%, " + c.topic + ")")
    })
    lines.push("")
    lines.push("## Topic mix (heuristic)")
    topics.slice(0, 8).forEach(function(t){
      lines.push("- " + t.topic + " — " + t.count + " (" + Math.round(t.share * 100) + "%)")
    })
    if (returners.length) {
      lines.push("")
      lines.push("## Returners")
      returners.slice(0, 6).forEach(function(v){
        lines.push("- " + v.title + " — " + v.timesVisited + "× (" + (v.cadenceLabel || "—") + ", " + (v.domain || "—") + ")")
      })
    }
    if (sessions.length) {
      lines.push("")
      lines.push("## Sessions")
      sessions.slice(0, 5).forEach(function(s){
        lines.push("- " + s.start.slice(0, 16) + "Z — " + s.count + " visits in " + s.durationMin + " min, mostly " + (s.topDomain || "mixed") + (s.looksLikeResearch ? " (research)" : ""))
      })
    }
    if (repeatedSearches.length) {
      lines.push("")
      lines.push("## Repeated searches")
      repeatedSearches.slice(0, 6).forEach(function(q){
        lines.push("- \"" + q.query + "\" — " + q.count + "× (" + q.engine + ", last " + q.lastSeen + ")")
      })
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
    console.error("Usage: node scripts/render_browser_history_fallback.mjs INPUT --out OUT --title TITLE")
    process.exit(1)
  }
  const input = args[0]
  const out = arg(args, "--out") || input.replace(/\.[^.]+$/, ".html")
  const title = arg(args, "--title") || path.basename(input).replace(/\.[^.]+$/, "")

  const parser = await pickParser(input)
  if (!parser) { console.error("No parser matched", input); process.exit(2) }
  const parsed = await parser.parse(input)
  if (parsed.contentType !== "browser-history") {
    console.error("Expected browser-history, got", parsed.contentType)
    process.exit(3)
  }

  const html = TEMPLATE
    .replace(/__TITLE__/g, escapeHtml(title))
    .replace("__DATA__", inlineJson(parsed.data))
  await fs.writeFile(out, html, "utf8")
  console.log("Wrote " + out + " (" + (html.length / 1024).toFixed(1) + " KB)")
}

function arg(args, name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))
}
function inlineJson(o) {
  return JSON.stringify(o).replace(/<\/(script)/gi, "<\\/$1")
}

await main()

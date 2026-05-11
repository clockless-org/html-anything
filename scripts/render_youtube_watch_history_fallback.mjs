#!/usr/bin/env node
/**
 * Offline fallback renderer for youtube-watch-history.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned template
 * that satisfies the prompts/sources/youtube-watch-history.md contract:
 *
 *   1. Hero summary (watches / channels / window / late-night share)
 *   2. Monthly + weekly bars + day-of-week × hour heatmap
 *   3. Binge sessions panel
 *   4. Channel leaderboard
 *   5. Topic mix (heuristic, clearly labeled)
 *   6. Attention audit cards (late-night / learning-vs-entertainment /
 *      rediscovery list / surprising streaks)
 *   7. Searchable / filterable drill-down table with row-expand
 *   8. Privacy footer
 *
 * The page renders the FULL data (the `rows` array is inlined), so the
 * drill-down can grow to thousands of watches without re-running the LLM.
 *
 * The embedded client script avoids `${...}` substitution because the
 * outer literal is a `String.raw` tagged template and JS template
 * substitution still fires inside one. All in-template JS uses string
 * concatenation instead.
 *
 * Usage:
 *   node scripts/render_youtube_watch_history_fallback.mjs INPUT --out OUT --title TITLE
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
.heatmap-legend{display:flex;align-items:center;gap:var(--space-md);margin-top:var(--space-sm);font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.heatmap-legend .scale{display:inline-flex;gap:2px}
.heatmap-legend .swatch{width:12px;height:12px;border-radius:2px;background:var(--surface-container)}
.heatmap-legend .swatch[data-c="1"]{background:rgba(160,59,0,.18)}
.heatmap-legend .swatch[data-c="2"]{background:rgba(160,59,0,.34)}
.heatmap-legend .swatch[data-c="3"]{background:rgba(160,59,0,.55)}
.heatmap-legend .swatch[data-c="4"]{background:rgba(160,59,0,.78)}
.heatmap-legend .swatch[data-c="5"]{background:var(--primary)}
/* Binges */
.binge-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--space-md)}
.binge{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);cursor:pointer;transition:border-color .15s ease}
.binge:hover{border-color:var(--primary)}
.binge .when{font-family:var(--font-mono);font-size:12px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.06em}
.binge .top{font-weight:600;font-size:15px;margin-top:var(--space-xs);line-height:1.3}
.binge .meta{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-2);margin-top:var(--space-xs);display:flex;flex-wrap:wrap;gap:var(--space-md)}
.binge .meta b{color:var(--primary);font-weight:600}
.binge .titles{font-size:12.5px;color:var(--fg-2);margin-top:var(--space-sm);line-height:1.45;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
/* Channel leaderboard */
.lb{display:grid;grid-template-columns:1fr;gap:var(--space-xs)}
.lb .row{display:grid;grid-template-columns:24px 1fr 90px 70px;gap:var(--space-md);align-items:center;
  padding:var(--space-sm) var(--space-md);border-radius:var(--radius-md);cursor:pointer;transition:background .15s ease}
.lb .row:hover{background:var(--surface-container)}
.lb .row .rank{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);text-align:right}
.lb .row .name{font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:var(--space-sm)}
.lb .row .topic-chip{padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.lb .row .bar{position:relative;height:8px;border-radius:4px;background:var(--surface-container)}
.lb .row .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--gradient-primary);border-radius:4px}
.lb .row .count{font-family:var(--font-mono);font-variant-numeric:tabular-nums;text-align:right;color:var(--fg-1)}
.lb .row .count .share{display:block;font-size:11.5px;color:var(--fg-muted);font-weight:400}
@media (max-width:640px){
  .lb .row{grid-template-columns:24px 1fr 60px}
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
/* Attention audit */
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
.split-bar .seg.learning{background:var(--primary)}
.split-bar .seg.music{background:var(--secondary-container)}
.split-bar .seg.entertainment{background:var(--yellow)}
.split-bar .seg.other{background:var(--fg-muted)}
.split-legend{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-sm);font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.split-legend .key{display:inline-flex;align-items:center;gap:6px}
.split-legend .key .dot{width:10px;height:10px;border-radius:2px}
.split-legend .key .dot.learning{background:var(--primary)}
.split-legend .key .dot.music{background:var(--secondary-container)}
.split-legend .key .dot.entertainment{background:var(--yellow)}
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
.tbl tbody tr.removed td{color:var(--fg-muted);font-style:italic}
.tbl .col-time{font-family:var(--font-mono);font-size:12px;color:var(--fg-2);white-space:nowrap}
.tbl .col-title{font-weight:500;line-height:1.4}
.tbl .col-channel{font-family:var(--font-mono);font-size:12px;color:var(--fg-2)}
.tbl .col-topic{font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.06em}
.tbl .badge{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-left:6px}
.tbl .badge.late{background:rgba(123,64,224,.18);color:var(--secondary-container)}
.tbl .badge.removed{background:rgba(0,0,0,.06);color:var(--fg-muted)}
.row-detail{padding:var(--space-md) var(--space-lg);background:var(--surface-container-low);border-radius:var(--radius-md);
  margin:var(--space-xs) 0 var(--space-md);font-family:var(--font-mono);font-size:11.5px;color:var(--fg-2);
  display:grid;grid-template-columns:max-content 1fr;gap:6px var(--space-md)}
.row-detail dt{font-weight:600;color:var(--fg-muted)}
.row-detail dd{margin:0;word-break:break-all}
.row-detail a{color:var(--primary)}
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
      <span class="eyebrow"><span class="mono">YOUTUBE WATCH HISTORY</span> · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial"></p>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy attention note as Markdown</button>
        <button class="btn" id="jump-table-btn">Jump to drill-down</button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Watch summary">
      <div class="kpi"><div class="label">Watches</div><div class="value mono accent" id="kpi-watches">0</div><div class="sub" id="kpi-watches-sub"></div></div>
      <div class="kpi"><div class="label">Channels</div><div class="value mono" id="kpi-channels">0</div><div class="sub" id="kpi-channels-sub"></div></div>
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
        <h3 style="margin-bottom:var(--space-xs)">When you reach for YouTube</h3>
        <div class="muted" style="font-size:12.5px;font-family:var(--font-mono)">Day-of-week × hour-of-day · UTC</div>
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
          <span>Hours read directly from the Takeout timestamp (UTC); device timezone not included.</span>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-binge">
      <div class="section-head">
        <h2 id="head-binge">Binge sessions</h2>
        <span class="meta" id="binge-meta"></span>
      </div>
      <div class="binge-grid" id="binge-grid"></div>
      <div class="empty-state" id="binge-empty" hidden>No qualifying binge clusters in this file — your watching is spread out across the day.</div>
    </section>

    <section class="section" aria-labelledby="head-channels">
      <div class="section-head">
        <h2 id="head-channels">Channels</h2>
        <span class="meta" id="channels-meta"></span>
      </div>
      <div class="card">
        <div class="lb" id="lb-list"></div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-topics">
      <div class="section-head">
        <h2 id="head-topics">Topics</h2>
        <div style="display:flex;gap:var(--space-sm);align-items:center">
          <span class="heuristic-chip" title="Topic labels come from keyword matches over the title and channel name. YouTube does not include categories in the Takeout export.">Heuristic</span>
          <span class="meta" id="topics-meta"></span>
        </div>
      </div>
      <div class="topic-grid" id="topic-grid"></div>
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
          <div class="label">Learning vs entertainment vs music</div>
          <div class="value" id="audit-bucket">—</div>
          <div class="split-bar" id="bucket-bar" aria-hidden="true"></div>
          <div class="split-legend" id="bucket-legend"></div>
        </div>
        <div class="audit-card">
          <div class="label">Rediscovery list</div>
          <div class="value" id="audit-rd">—</div>
          <div class="body" id="audit-rd-body"></div>
        </div>
        <div class="audit-card">
          <div class="label">Surprising streaks</div>
          <div class="value" id="audit-streak">—</div>
          <div class="body" id="audit-streak-body"></div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-drill">
      <div class="section-head">
        <h2 id="head-drill" style="scroll-margin-top:1em">Browse all watches</h2>
        <span class="meta">Click a row to expand</span>
      </div>
      <div class="card">
        <div class="drill-toolbar">
          <input class="drill-search" id="drill-search" type="search" placeholder="Search title, channel, topic…" aria-label="Search watches">
          <span class="drill-meta" id="drill-count">0 of 0</span>
          <button class="btn" id="drill-clear">Clear filters</button>
        </div>
        <div class="chip-row-label">Channel</div>
        <div class="chips" id="channel-chips"></div>
        <div class="chip-row-label">Topic</div>
        <div class="chips" id="topic-chips"></div>
        <div class="chip-row-label">Year</div>
        <div class="chips" id="year-chips"></div>
        <div class="chip-row-label">Filters</div>
        <div class="chips" id="flag-chips">
          <div class="chip" data-flag="late"><span>Late-night only</span> <span class="count" id="flag-late-count">0</span></div>
          <div class="chip" data-flag="removed"><span>Removed / private</span> <span class="count" id="flag-removed-count">0</span></div>
          <div class="chip" data-flag="rediscovery"><span>Rediscoveries</span> <span class="count" id="flag-rediscovery-count">0</span></div>
        </div>
        <table class="tbl" id="drill-table">
          <thead><tr><th>Time</th><th>Title</th><th>Channel</th><th>Topic</th></tr></thead>
          <tbody id="drill-body"></tbody>
        </table>
        <div class="tbl-loadmore" id="loadmore"></div>
      </div>
    </section>

    <footer>
      <p>Generated by <a href="https://github.com/clockless-org/html-anything">html-anything</a> from <span id="footer-source" class="mono"></span> (<span id="footer-bytes" class="mono"></span>) using the offline youtube-watch-history template. This file is fully self-contained and makes no network calls — it uses your operating system's default sans-serif font.</p>
      <p class="privacy" style="margin-top:var(--space-md)">Generated locally — your YouTube watch history never left your machine. Every watch is embedded in this HTML and rendered offline in your browser. Topic labels are a heuristic keyword roll-up, not topic modeling. <strong>The page does not fetch from YouTube, ytimg.com, Google APIs, or any third party.</strong> "Watch on YouTube" links open a new tab only when you click them.</p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(function(){
  var fmt = new Intl.NumberFormat("en-US")
  var summary = DATA.summary || {}
  var rows = DATA.rows || []
  var channels = DATA.channels || []
  var topics = DATA.topics || []
  var bucketTotals = DATA.bucketTotals || []
  var monthTotals = DATA.monthTotals || []
  var weekTotals = DATA.weekTotals || []
  var hourCounts = DATA.hourCounts || new Array(24).fill(0)
  var dowCounts = DATA.dowCounts || new Array(7).fill(0)
  var heatmap = DATA.heatmap || Array.from({length:7}, function(){return new Array(24).fill(0)})
  var binges = DATA.binges || []
  var rediscoveries = DATA.rediscoveries || []
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

  document.getElementById("footer-source").textContent = meta.sourceFile || "watch-history.json"
  document.getElementById("footer-bytes").textContent = humanBytes(meta.sizeBytes || 0)

  // ----- KPIs
  document.getElementById("kpi-watches").textContent = fmt.format(summary.totalCount || 0)
  document.getElementById("kpi-watches-sub").textContent =
    (summary.uniqueVideos || 0) + " unique videos · " +
    (summary.activeDays || 0) + " active days"
  document.getElementById("kpi-channels").textContent = fmt.format(summary.uniqueChannels || 0)
  document.getElementById("kpi-channels-sub").textContent = summary.topChannel
    ? "Top: " + ellipsize(summary.topChannel, 24) + " · " + pct(summary.topChannelShare)
    : ""
  document.getElementById("kpi-window").textContent = summary.durationLabel || "—"
  document.getElementById("kpi-window-sub").textContent =
    (summary.dateRange || "") + (summary.activeMonths ? " · " + summary.activeMonths + " months" : "")
  document.getElementById("kpi-late").textContent = pct(summary.lateNightShare)
  document.getElementById("kpi-late-sub").textContent =
    (summary.lateNightCount || 0) + " of " + (summary.totalCount || 0) + " between 0–4 UTC"

  document.getElementById("hero-editorial").textContent = buildEditorial()

  // ----- Timeline bars (monthly + weekly)
  var mode = "month"
  function buildBars(series, labelFn){
    var svg = document.getElementById("bars-svg")
    var axis = document.getElementById("bars-axis")
    svg.innerHTML = ""
    axis.innerHTML = ""
    if (!series.length) {
      svg.innerHTML = '<text x="500" y="100" text-anchor="middle">No watches in this window</text>'
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
      '<span>peak: <strong>' + series[peakIdx].count + '</strong> watches</span>' +
      '<span>average: <strong>' + Math.round(series.reduce(function(a,b){return a + b.count}, 0) / series.length) + '</strong> per ' + (mode === "month" ? "month" : "week") + '</span>'
  }
  function renderBars(){
    if (mode === "month") {
      buildBars(monthTotals, function(s){ return s.month })
    } else {
      buildBars(weekTotals, function(s){ return s.week })
    }
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

  // ----- Heatmap
  ;(function(){
    var max = 0
    for (var d = 0; d < 7; d++) for (var h = 0; h < 24; h++) if (heatmap[d][h] > max) max = heatmap[d][h]
    function bucket(v){
      if (!v) return 0
      if (max <= 1) return 5
      var n = Math.ceil((v / max) * 5)
      return Math.max(1, Math.min(5, n))
    }
    var html = '<span></span>'
    for (var hh = 0; hh < 24; hh++) html += '<span class="col-h">' + (hh % 6 === 0 ? hh : "") + '</span>'
    for (var dd = 0; dd < 7; dd++) {
      html += '<span class="row-d">' + DOW_NAMES[dd] + '</span>'
      for (var hh2 = 0; hh2 < 24; hh2++) {
        var v = heatmap[dd][hh2] || 0
        var b = bucket(v)
        html += '<span class="cell" data-c="' + b + '" title="' + DOW_NAMES[dd] + " " + hh2 + ":00 — " + v + ' watches"></span>'
      }
    }
    document.getElementById("heatmap").innerHTML = html
  })()

  // ----- Binges
  ;(function(){
    var grid = document.getElementById("binge-grid")
    var meta = document.getElementById("binge-meta")
    var empty = document.getElementById("binge-empty")
    if (!binges.length) {
      grid.style.display = "none"
      empty.hidden = false
      meta.textContent = "0 clusters"
      return
    }
    meta.textContent = binges.length + " clusters · ≥4 videos within 45-min gaps"
    grid.innerHTML = binges.map(function(b){
      var when = fmtIso(b.start, true)
      var dur = b.durationMin >= 60
        ? Math.floor(b.durationMin / 60) + "h " + (b.durationMin % 60) + "m"
        : b.durationMin + " min"
      var titles = (b.sampleTitles || []).slice(0, 4).map(escapeHtml).join(" · ")
      return '<div class="binge" data-ids="' + (b.itemIds || []).join(",") + '">' +
        '<div class="when">' + escapeHtml(when) + '</div>' +
        '<div class="top">' + escapeHtml(b.topChannel || "(mixed)") + '</div>' +
        '<div class="meta"><span><b>' + b.count + '</b> watches</span><span>' + escapeHtml(dur) + '</span></div>' +
        '<div class="titles">' + titles + '</div>' +
      '</div>'
    }).join("")
    Array.prototype.forEach.call(grid.querySelectorAll(".binge"), function(el){
      el.addEventListener("click", function(){
        var ids = (el.getAttribute("data-ids") || "").split(",").filter(Boolean)
        bingeFilter = new Set(ids)
        searchInput.value = ""
        activeChannel = null; activeTopic = null; activeYear = null
        flagFilter = null
        document.getElementById("head-drill").scrollIntoView({behavior: "smooth"})
        renderTable()
      })
    })
  })()

  // ----- Channel leaderboard
  ;(function(){
    var top = channels.slice(0, 10)
    var maxCount = top.length ? top[0].count : 1
    document.getElementById("channels-meta").textContent =
      channels.length + " channels · top 10 shown"
    document.getElementById("lb-list").innerHTML = top.map(function(c, i){
      var w = Math.max(2, (c.count / maxCount) * 100)
      return '<div class="row" data-channel="' + escapeHtml(c.name) + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="name">' + escapeHtml(c.name) + ' <span class="topic-chip">' + escapeHtml(c.topic) + '</span></span>' +
        '<span class="bar"><i style="width:' + w.toFixed(1) + '%"></i></span>' +
        '<span class="count">' + c.count + '<span class="share">' + pct(c.share) + '</span></span>' +
      '</div>'
    }).join("")
    Array.prototype.forEach.call(document.querySelectorAll(".lb .row"), function(el){
      el.addEventListener("click", function(){
        var name = el.getAttribute("data-channel")
        activeChannel = activeChannel === name ? null : name
        bingeFilter = null
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
        '<span class="label">' + escapeHtml(t.topic) + '</span>' +
        '<div class="stats">' + t.count + ' watches · ' + t.channels + ' channels</div>' +
        '<div class="pct">' + pct1(t.share) + '</div>' +
        '<div class="progress"><i style="width:' + w.toFixed(1) + '%"></i></div>' +
      '</div>'
    }).join("")
    Array.prototype.forEach.call(grid.querySelectorAll(".topic"), function(el){
      el.addEventListener("click", function(){
        var t = el.getAttribute("data-topic")
        activeTopic = activeTopic === t ? null : t
        bingeFilter = null
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
        '<div>' + summary.lateNightCount + ' watches between 00:00–04:00 UTC.</div>' +
        '<ul>' + lateRows.map(function(r){
          return '<li>' + escapeHtml(fmtIso(r.ts, true)) + ' — ' +
            escapeHtml(ellipsize(r.title, 60)) +
            ' <span class="cad">(' + escapeHtml(r.channelName || "—") + ')</span></li>'
        }).join("") + '</ul>'
    } else {
      lateBody.textContent = "No watches in the 00:00–04:00 UTC window — your late-night feed is empty."
    }

    var bk = {}; bucketTotals.forEach(function(b){ bk[b.bucket] = b })
    var learning = bk.learning ? bk.learning.share : 0
    var music = bk.music ? bk.music.share : 0
    var entertainment = bk.entertainment ? bk.entertainment.share : 0
    var other = bk.other ? bk.other.share : 0
    document.getElementById("audit-bucket").textContent =
      pct(learning) + " learning · " + pct(entertainment) + " entertainment"
    var bar = document.getElementById("bucket-bar")
    bar.innerHTML =
      '<span class="seg learning" style="width:' + (learning * 100).toFixed(1) + '%"></span>' +
      '<span class="seg music" style="width:' + (music * 100).toFixed(1) + '%"></span>' +
      '<span class="seg entertainment" style="width:' + (entertainment * 100).toFixed(1) + '%"></span>' +
      '<span class="seg other" style="width:' + (other * 100).toFixed(1) + '%"></span>'
    document.getElementById("bucket-legend").innerHTML =
      '<span class="key"><span class="dot learning"></span>learning ' + pct(learning) + '</span>' +
      '<span class="key"><span class="dot music"></span>music ' + pct(music) + '</span>' +
      '<span class="key"><span class="dot entertainment"></span>entertainment ' + pct(entertainment) + '</span>' +
      '<span class="key"><span class="dot other"></span>other ' + pct(other) + '</span>'

    document.getElementById("audit-rd").textContent = (rediscoveries.length || 0) + " rediscoveries"
    var rdBody = document.getElementById("audit-rd-body")
    if (rediscoveries.length) {
      rdBody.innerHTML =
        '<div>Videos watched 3+ times — the ones that stuck.</div>' +
        '<ul>' + rediscoveries.slice(0, 4).map(function(v){
          return '<li>' + escapeHtml(ellipsize(v.title, 60)) +
            ' <span class="cad">' + v.timesWatched + '× · ' + escapeHtml(v.cadenceLabel || "—") +
            ' · ' + escapeHtml(v.channel || "—") + '</span></li>'
        }).join("") + '</ul>'
    } else {
      rdBody.textContent = "No video watched 3+ times yet — your watch history is broad rather than repetitive."
    }

    var bd = summary.busiestDay
    var bw = summary.busiestWeek
    var streakValue = bd ? bd.count + " watches" : "—"
    document.getElementById("audit-streak").textContent = streakValue
    var streakBody = document.getElementById("audit-streak-body")
    var lines = []
    if (bd) lines.push('<li>busiest day: <strong>' + escapeHtml(bd.date) + '</strong> — ' + bd.count + ' watches</li>')
    if (bw) lines.push('<li>busiest week: <strong>' + escapeHtml(bw.week) + '</strong> — ' + bw.count + ' watches</li>')
    if (binges.length) {
      var topB = binges[0]
      var dur = topB.durationMin >= 60
        ? Math.floor(topB.durationMin / 60) + "h " + (topB.durationMin % 60) + "m"
        : topB.durationMin + " min"
      lines.push('<li>longest binge: <strong>' + topB.count + '</strong> videos in ' + dur +
        ' (' + escapeHtml(fmtIso(topB.start, false)) + ', mostly ' + escapeHtml(topB.topChannel || "mixed") + ')</li>')
    }
    if (summary.removedCount) {
      lines.push('<li><span class="cad">' + summary.removedCount + ' watches reference removed or private videos</span></li>')
    }
    streakBody.innerHTML = lines.length ? '<ul>' + lines.join("") + '</ul>' : ""
  })()

  // ----- Drill-down
  var rediscoveryIds = new Set()
  rediscoveries.forEach(function(v){ (v.sampleIds || []).forEach(function(id){ rediscoveryIds.add(id) }) })
  document.getElementById("flag-late-count").textContent = summary.lateNightCount || 0
  document.getElementById("flag-removed-count").textContent = summary.removedCount || 0
  document.getElementById("flag-rediscovery-count").textContent = rediscoveryIds.size

  var searchInput = document.getElementById("drill-search")
  var activeChannel = null
  var activeTopic = null
  var activeYear = null
  var flagFilter = null
  var bingeFilter = null
  var pageSize = 60
  var visibleN = pageSize

  function years(){
    var s = new Set()
    rows.forEach(function(r){ s.add(r.date.slice(0, 4)) })
    return Array.from(s).sort()
  }

  function renderChips(){
    var topChans = channels.slice(0, 10)
    document.getElementById("channel-chips").innerHTML = topChans.map(function(c){
      var act = activeChannel === c.name ? " active" : ""
      return '<div class="chip' + act + '" data-channel="' + escapeHtml(c.name) + '">' +
        escapeHtml(c.name) + ' <span class="count">' + c.count + '</span></div>'
    }).join("")
    document.getElementById("topic-chips").innerHTML = topics.map(function(t){
      var act = activeTopic === t.topic ? " active" : ""
      return '<div class="chip' + act + '" data-topic="' + escapeHtml(t.topic) + '">' +
        escapeHtml(t.topic) + ' <span class="count">' + t.count + '</span></div>'
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
    Array.prototype.forEach.call(document.querySelectorAll("#channel-chips .chip"), function(el){
      el.onclick = function(){
        var name = el.getAttribute("data-channel")
        activeChannel = activeChannel === name ? null : name
        bingeFilter = null
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#topic-chips .chip"), function(el){
      el.onclick = function(){
        var t = el.getAttribute("data-topic")
        activeTopic = activeTopic === t ? null : t
        bingeFilter = null
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#year-chips .chip"), function(el){
      el.onclick = function(){
        var y = el.getAttribute("data-year")
        activeYear = activeYear === y ? null : y
        bingeFilter = null
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#flag-chips .chip"), function(el){
      el.onclick = function(){
        var f = el.getAttribute("data-flag")
        flagFilter = flagFilter === f ? null : f
        bingeFilter = null
        renderChips(); renderTable()
      }
    })
  }

  function applyFilters(){
    var q = (searchInput.value || "").trim().toLowerCase()
    return rows.filter(function(r){
      if (bingeFilter && !bingeFilter.has(r.id)) return false
      if (activeChannel && r.channelName !== activeChannel) return false
      if (activeTopic && r.topic !== activeTopic) return false
      if (activeYear && r.date.slice(0, 4) !== activeYear) return false
      if (flagFilter === "late" && !r.isLateNight) return false
      if (flagFilter === "removed" && !r.isRemoved) return false
      if (flagFilter === "rediscovery" && !rediscoveryIds.has(r.id)) return false
      if (q) {
        var hay = (r.title + " " + (r.channelName || "") + " " + r.topic).toLowerCase()
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
      body.innerHTML = '<tr><td colspan="4" class="empty-state">No watches match the current filters.</td></tr>'
      document.getElementById("loadmore").innerHTML = ""
      return
    }
    var slice = matches.slice(0, visibleN)
    body.innerHTML = slice.map(function(r){
      var tcls = []
      if (r.isLateNight) tcls.push("late")
      if (r.isRemoved) tcls.push("removed")
      var badge = ""
      if (r.isLateNight) badge += '<span class="badge late">late</span>'
      if (r.isRemoved) badge += '<span class="badge removed">removed</span>'
      var titleHtml = escapeHtml(r.title)
      if (r.videoUrl) {
        titleHtml = '<a href="' + escapeHtml(r.videoUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(r.title) + '</a>'
      }
      return '<tr class="' + tcls.join(" ") + '" data-id="' + escapeHtml(r.id) + '">' +
        '<td class="col-time">' + escapeHtml(fmtIso(r.ts, true)) + '</td>' +
        '<td class="col-title">' + titleHtml + badge + '</td>' +
        '<td class="col-channel">' + escapeHtml(r.channelName || "—") + '</td>' +
        '<td class="col-topic">' + escapeHtml(r.topic) + '</td>' +
      '</tr>'
    }).join("")
    Array.prototype.forEach.call(body.querySelectorAll("tr"), function(tr){
      tr.addEventListener("click", function(ev){
        if (ev.target && ev.target.tagName === "A") return
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
    td.colSpan = 4
    td.innerHTML = '<dl class="row-detail">' +
      '<dt>id</dt><dd>' + escapeHtml(r.id) + '</dd>' +
      '<dt>raw title</dt><dd>' + escapeHtml(r.rawTitle) + '</dd>' +
      '<dt>time (UTC)</dt><dd>' + escapeHtml(r.ts) + '</dd>' +
      '<dt>channel</dt><dd>' + escapeHtml(r.channelName || "—") +
        (r.channelId ? ' <span class="muted">(' + escapeHtml(r.channelId) + ')</span>' : "") + '</dd>' +
      '<dt>video</dt><dd>' + (r.videoUrl
        ? '<a href="' + escapeHtml(r.videoUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(r.videoUrl) + '</a>'
        : '(no titleUrl — removed or private)') + '</dd>' +
      '<dt>topic</dt><dd>' + escapeHtml(r.topic) +
        (r.topicInferred ? ' <span class="muted">(heuristic)</span>' : "") + '</dd>' +
      '<dt>flags</dt><dd>' +
        (r.isLateNight ? '<span class="badge late">late-night</span> ' : "") +
        (r.isRemoved ? '<span class="badge removed">removed</span>' : "") +
        (!r.isLateNight && !r.isRemoved ? '—' : "") +
      '</dd>' +
    '</dl>'
    tr2.appendChild(td)
    tr.parentNode.insertBefore(tr2, tr.nextSibling)
  }

  document.getElementById("drill-clear").addEventListener("click", function(){
    activeChannel = null; activeTopic = null; activeYear = null; flagFilter = null
    bingeFilter = null; searchInput.value = ""; visibleN = pageSize
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
    parts.push((summary.totalCount || 0) + " watches across " + (summary.uniqueChannels || 0) + " channels over " + (summary.durationLabel || "this window") + ".")
    if (summary.topChannel) {
      parts.push('"' + summary.topChannel + '" leads with ' + Math.round(summary.topChannelShare * 100) + '% of watches.')
    }
    if (summary.busiestDay) {
      parts.push("Busiest single day: " + summary.busiestDay.date + " (" + summary.busiestDay.count + " watches).")
    }
    if (binges.length) {
      var topB = binges[0]
      parts.push("Longest spiral: " + topB.count + " videos in " + topB.durationMin + " min, mostly " + (topB.topChannel || "mixed") + ".")
    }
    if (summary.lateNightShare > 0.05) {
      parts.push(Math.round(summary.lateNightShare * 100) + "% of watches happen between midnight and 4am UTC.")
    }
    return parts.join(" ")
  }
  function buildAttentionNote(){
    var lines = []
    lines.push("# " + (document.getElementById("hero-title").textContent || "YouTube watch history"))
    lines.push("")
    lines.push(buildEditorial())
    lines.push("")
    lines.push("## Headline")
    lines.push("- " + (summary.totalCount || 0) + " watches, " + (summary.uniqueChannels || 0) + " channels, " + (summary.uniqueVideos || 0) + " unique videos")
    lines.push("- Window: " + (summary.dateRange || "—") + " (" + (summary.durationLabel || "—") + ", " + (summary.activeDays || 0) + " active days)")
    lines.push("- Late-night share: " + Math.round((summary.lateNightShare || 0) * 100) + "%")
    if (summary.removedCount) lines.push("- Removed/private references: " + summary.removedCount)
    lines.push("")
    lines.push("## Top channels")
    channels.slice(0, 8).forEach(function(c){
      lines.push("- " + c.name + " — " + c.count + " watches (" + Math.round(c.share * 100) + "%, " + c.topic + ")")
    })
    lines.push("")
    lines.push("## Topic mix (heuristic)")
    topics.slice(0, 8).forEach(function(t){
      lines.push("- " + t.topic + " — " + t.count + " (" + Math.round(t.share * 100) + "%)")
    })
    if (rediscoveries.length) {
      lines.push("")
      lines.push("## Rediscoveries")
      rediscoveries.slice(0, 6).forEach(function(v){
        lines.push("- " + v.title + " — " + v.timesWatched + "× (" + (v.cadenceLabel || "—") + ", " + (v.channel || "—") + ")")
      })
    }
    if (binges.length) {
      lines.push("")
      lines.push("## Binge sessions")
      binges.slice(0, 5).forEach(function(b){
        lines.push("- " + b.start.slice(0, 16) + "Z — " + b.count + " videos in " + b.durationMin + " min, mostly " + (b.topChannel || "mixed"))
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
    console.error("Usage: node scripts/render_youtube_watch_history_fallback.mjs INPUT --out OUT --title TITLE")
    process.exit(1)
  }
  const input = args[0]
  const out = arg(args, "--out") || input.replace(/\.[^.]+$/, ".html")
  const title = arg(args, "--title") || path.basename(input).replace(/\.[^.]+$/, "")

  const parser = await pickParser(input)
  if (!parser) { console.error("No parser matched", input); process.exit(2) }
  const parsed = await parser.parse(input)
  if (parsed.contentType !== "youtube-watch-history") {
    console.error("Expected youtube-watch-history, got", parsed.contentType)
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

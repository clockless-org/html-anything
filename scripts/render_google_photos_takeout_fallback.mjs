#!/usr/bin/env node
/**
 * Offline fallback renderer for google-photos-takeout.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned template
 * that satisfies the prompts/sources/google-photos-takeout.md contract:
 *
 *   1. Hero summary (media / photos / videos / albums / geo / device)
 *   2. Activity timeline — monthly bars + year × month heatmap +
 *      day-of-week × hour heatmap
 *   3. Places — inline-SVG cosine-corrected scatter + cluster list
 *   4. Albums — tile-mosaic cards with overlap signals
 *   5. Cameras & devices — leaderboard with sparkline + first/last-seen
 *   6. Bursts & duplicates audit row
 *   7. Searchable / filterable drill-down with row-expand
 *   8. Privacy footer
 *
 * The page renders the FULL data (the `rows` array is inlined), so the
 * drill-down can grow to thousands of rows without re-running the LLM.
 *
 * The embedded client script avoids `${...}` substitution because the
 * outer literal is a `String.raw` tagged template and JS template
 * substitution still fires inside one. All in-template JS uses string
 * concatenation instead.
 *
 * Usage:
 *   node scripts/render_google_photos_takeout_fallback.mjs INPUT_DIR --out OUT --title TITLE
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { parser } from "../dist/parse/photos-takeout.js"

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
.bars-svg rect.bar.video{fill:var(--secondary-container);opacity:.85}
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
/* Year × month grid */
.ym-grid{display:grid;grid-template-columns:64px repeat(12,1fr);gap:3px;margin-top:var(--space-md);font-family:var(--font-mono);font-size:10.5px;color:var(--fg-muted)}
.ym-grid .col-h{text-align:center;text-transform:uppercase;letter-spacing:.05em}
.ym-grid .row-y{display:flex;align-items:center;justify-content:flex-end;padding-right:6px;font-weight:600;color:var(--fg-2)}
.ym-grid .cell{aspect-ratio:2/1;border-radius:4px;background:var(--surface-container);display:flex;align-items:center;justify-content:center;color:rgba(0,0,0,0)}
.ym-grid .cell[data-c="1"]{background:rgba(160,59,0,.18)}
.ym-grid .cell[data-c="2"]{background:rgba(160,59,0,.34)}
.ym-grid .cell[data-c="3"]{background:rgba(160,59,0,.55)}
.ym-grid .cell[data-c="4"]{background:rgba(160,59,0,.78)}
.ym-grid .cell[data-c="5"]{background:var(--primary)}
@media (prefers-color-scheme:dark){
  .ym-grid .cell[data-c="1"]{background:rgba(255,107,53,.20)}
  .ym-grid .cell[data-c="2"]{background:rgba(255,107,53,.36)}
  .ym-grid .cell[data-c="3"]{background:rgba(255,107,53,.55)}
  .ym-grid .cell[data-c="4"]{background:rgba(255,107,53,.78)}
}
/* Places */
.places-card{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:var(--space-xl);align-items:start}
@media (max-width:780px){.places-card{grid-template-columns:1fr}}
.places-svg{width:100%;border-radius:var(--radius-md);background:var(--surface-container);display:block;aspect-ratio:5/3}
.places-svg .grid{stroke:rgba(0,0,0,.07);stroke-width:.4;fill:none}
.places-svg .dot{fill:var(--primary);fill-opacity:.65}
.places-svg .dot.big{fill:var(--accent-glow);fill-opacity:.9}
@media (prefers-color-scheme:dark){
  .places-svg{background:var(--surface-container)}
  .places-svg .grid{stroke:rgba(255,255,255,.08)}
}
.cluster-list{display:flex;flex-direction:column;gap:var(--space-xs)}
.cluster-list .row{padding:var(--space-sm) var(--space-md);border-radius:var(--radius-md);border:1px solid var(--border);background:var(--surface-container-lowest)}
.cluster-list .row .label{font-weight:600;font-size:13.5px}
.cluster-list .row .meta{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);margin-top:2px}
/* Albums */
.album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-md)}
.album{padding:var(--space-md);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-container-lowest);cursor:pointer;transition:border-color .15s ease;display:flex;flex-direction:column;gap:var(--space-sm)}
.album:hover{border-color:var(--primary)}
.album .mosaic{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;border-radius:var(--radius-sm);overflow:hidden}
.album .mosaic .tile{aspect-ratio:1;border-radius:0}
.album .name{font-weight:600;font-size:14.5px;line-height:1.3}
.album .stats{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.album .device{font-family:var(--font-mono);font-size:11px;color:var(--fg-2)}
.album .overlap{font-family:var(--font-mono);font-size:10.5px;color:var(--fg-muted);font-style:italic}
/* Devices */
.dev-grid{display:grid;grid-template-columns:1fr;gap:var(--space-xs)}
.dev{display:grid;grid-template-columns:24px 1fr 90px 70px;gap:var(--space-md);align-items:center;
  padding:var(--space-sm) var(--space-md);border-radius:var(--radius-md);cursor:pointer;transition:background .15s ease}
.dev:hover{background:var(--surface-container)}
.dev .rank{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);text-align:right}
.dev .name{font-weight:600;font-size:14.5px;display:flex;flex-direction:column;gap:2px}
.dev .name .sub{font-family:var(--font-mono);font-size:10.5px;color:var(--fg-muted);font-weight:500;text-transform:uppercase;letter-spacing:.06em}
.dev .spark{height:32px;width:100%}
.dev .spark line{stroke:var(--primary);stroke-width:1.4;fill:none}
.dev .spark rect{fill:var(--primary);opacity:.7}
.dev .count{font-family:var(--font-mono);font-variant-numeric:tabular-nums;text-align:right;color:var(--fg-1)}
.dev .count .share{display:block;font-size:11.5px;color:var(--fg-muted);font-weight:400}
@media (max-width:640px){
  .dev{grid-template-columns:24px 1fr 60px}
  .dev .spark{display:none}
}
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
.tbl tbody tr.video td{background:rgba(123,64,224,.06)}
.tbl tbody tr.archived td{color:var(--fg-muted);font-style:italic}
.tbl .col-time{font-family:var(--font-mono);font-size:12px;color:var(--fg-2);white-space:nowrap}
.tbl .col-filename{font-weight:500;line-height:1.4;font-family:var(--font-mono);font-size:12px}
.tbl .col-album{font-family:var(--font-mono);font-size:12px;color:var(--fg-2)}
.tbl .col-device{font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.06em}
.tbl .badge{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-left:6px}
.tbl .badge.video{background:rgba(123,64,224,.18);color:var(--secondary-container)}
.tbl .badge.fav{background:rgba(245,158,11,.18);color:#b45309}
.tbl .badge.edited{background:rgba(0,212,255,.14);color:#0e7490}
.tbl .badge.archived{background:rgba(0,0,0,.06);color:var(--fg-muted)}
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
      <span class="eyebrow"><span class="mono">GOOGLE PHOTOS TAKEOUT</span> · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial"></p>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy library note as Markdown</button>
        <button class="btn" id="jump-table-btn">Jump to drill-down</button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Library summary">
      <div class="kpi"><div class="label">Media</div><div class="value mono accent" id="kpi-media">0</div><div class="sub" id="kpi-media-sub"></div></div>
      <div class="kpi"><div class="label">Albums</div><div class="value mono" id="kpi-albums">0</div><div class="sub" id="kpi-albums-sub"></div></div>
      <div class="kpi"><div class="label">Window</div><div class="value mono" id="kpi-window">—</div><div class="sub" id="kpi-window-sub"></div></div>
      <div class="kpi"><div class="label">Geotag coverage</div><div class="value mono" id="kpi-geo">—</div><div class="sub" id="kpi-geo-sub"></div></div>
      <div class="kpi"><div class="label">Top device</div><div class="value mono" id="kpi-device">—</div><div class="sub" id="kpi-device-sub"></div></div>
    </section>

    <section class="section" aria-labelledby="head-rhythm">
      <div class="section-head">
        <h2 id="head-rhythm">Activity timeline</h2>
        <div class="timeline-toggle" role="tablist">
          <button id="t-month" class="active" role="tab" aria-selected="true">Monthly</button>
          <button id="t-year" role="tab" aria-selected="false">Year × month</button>
        </div>
      </div>
      <div class="card">
        <svg class="bars-svg" id="bars-svg" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="bars-axis" id="bars-axis"></div>
        <div class="bars-legend" id="bars-legend"></div>
        <div id="ym-wrap" hidden style="margin-top:var(--space-md)">
          <div class="ym-grid" id="ym-grid"></div>
        </div>
      </div>
      <div class="card" style="margin-top:var(--space-md)">
        <h3 style="margin-bottom:var(--space-xs)">When you take photos</h3>
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

    <section class="section" aria-labelledby="head-places">
      <div class="section-head">
        <h2 id="head-places">Places</h2>
        <div style="display:flex;gap:var(--space-sm);align-items:center">
          <span class="heuristic-chip" title="Inline-SVG scatter from coordinates already present in the export. The page never fetches map tiles or contacts a geocoding service.">Offline · no map tiles</span>
          <span class="meta" id="places-meta"></span>
        </div>
      </div>
      <div class="card">
        <div class="places-card">
          <div>
            <svg class="places-svg" id="places-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>
          </div>
          <div class="cluster-list" id="cluster-list"></div>
        </div>
        <div class="empty-state" id="places-empty" hidden>No geotagged photos in this export — the camera was offline or stripping GPS.</div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-albums">
      <div class="section-head">
        <h2 id="head-albums">Albums</h2>
        <span class="meta" id="albums-meta"></span>
      </div>
      <div class="album-grid" id="album-grid"></div>
    </section>

    <section class="section" aria-labelledby="head-devices">
      <div class="section-head">
        <h2 id="head-devices">Cameras &amp; devices</h2>
        <span class="meta" id="devices-meta"></span>
      </div>
      <div class="card"><div class="dev-grid" id="dev-list"></div></div>
    </section>

    <section class="section" aria-labelledby="head-audit">
      <div class="section-head">
        <h2 id="head-audit">Bursts &amp; duplicates</h2>
        <span class="heuristic-chip">Heuristic</span>
      </div>
      <div class="audit-grid">
        <div class="audit-card">
          <div class="label">Burst clusters</div>
          <div class="value accent" id="audit-burst">—</div>
          <div class="body" id="audit-burst-body"></div>
        </div>
        <div class="audit-card">
          <div class="label">Edited / original pairs</div>
          <div class="value" id="audit-edit">—</div>
          <div class="body" id="audit-edit-body"></div>
        </div>
        <div class="audit-card">
          <div class="label">Possible duplicates</div>
          <div class="value" id="audit-dup">—</div>
          <div class="body" id="audit-dup-body"></div>
        </div>
        <div class="audit-card">
          <div class="label">Missing metadata</div>
          <div class="value" id="audit-missing">—</div>
          <div class="body" id="audit-missing-body"></div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-drill">
      <div class="section-head">
        <h2 id="head-drill" style="scroll-margin-top:1em">Browse all media</h2>
        <span class="meta">Click a row to expand the sidecar</span>
      </div>
      <div class="card">
        <div class="drill-toolbar">
          <input class="drill-search" id="drill-search" type="search" placeholder="Search filename, album, device…" aria-label="Search media">
          <span class="drill-meta" id="drill-count">0 of 0</span>
          <button class="btn" id="drill-clear">Clear filters</button>
        </div>
        <div class="chip-row-label">Album</div>
        <div class="chips" id="album-chips"></div>
        <div class="chip-row-label">Device</div>
        <div class="chips" id="device-chips"></div>
        <div class="chip-row-label">Year</div>
        <div class="chips" id="year-chips"></div>
        <div class="chip-row-label">Filters</div>
        <div class="chips" id="flag-chips">
          <div class="chip" data-flag="photo"><span>Photos only</span> <span class="count" id="flag-photo-count">0</span></div>
          <div class="chip" data-flag="video"><span>Videos only</span> <span class="count" id="flag-video-count">0</span></div>
          <div class="chip" data-flag="favorited"><span>Favorited</span> <span class="count" id="flag-fav-count">0</span></div>
          <div class="chip" data-flag="archived"><span>Archived</span> <span class="count" id="flag-arch-count">0</span></div>
          <div class="chip" data-flag="geo"><span>Geotagged only</span> <span class="count" id="flag-geo-count">0</span></div>
          <div class="chip" data-flag="missing"><span>Missing metadata</span> <span class="count" id="flag-missing-count">0</span></div>
        </div>
        <table class="tbl" id="drill-table">
          <thead><tr><th>Taken</th><th>Filename</th><th>Album</th><th>Device</th></tr></thead>
          <tbody id="drill-body"></tbody>
        </table>
        <div class="tbl-loadmore" id="loadmore"></div>
      </div>
    </section>

    <footer>
      <p>Generated by <a href="https://github.com/clockless-org/html-anything">html-anything</a> from <span id="footer-source" class="mono"></span> using the offline google-photos-takeout template. This file is fully self-contained and makes no network calls — it uses your operating system's default sans-serif font.</p>
      <p class="privacy" style="margin-top:var(--space-md)">Generated locally — your Google Photos library never left your machine. The page reads sidecar metadata only and never opened the actual photos or videos. Place clusters are derived from coordinates already present in the export, not from any geocoding service. <strong>The page does not fetch from photos.google.com, lh3.googleusercontent.com, Google APIs, map tile providers, or any third party.</strong></p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(function(){
  var fmt = new Intl.NumberFormat("en-US")
  var summary = DATA.summary || {}
  var rows = DATA.rows || []
  var albums = DATA.albums || []
  var devices = DATA.devices || []
  var monthTotals = DATA.monthTotals || []
  var yearMonthHeatmap = DATA.yearMonthHeatmap || { years: [], cells: [] }
  var heatmap = DATA.heatmap || Array.from({length:7}, function(){return new Array(24).fill(0)})
  var places = DATA.places || { points: [], clusters: [], bbox: null }
  var bursts = DATA.bursts || []
  var editedPairs = DATA.editedPairs || []
  var duplicates = DATA.duplicates || []
  var meta = DATA.meta || {}
  var DOW_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  var MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

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
  function fmtIso(s, withTime){
    if (!s) return "—"
    var d = new Date(s)
    if (isNaN(d.getTime())) return s
    var date = d.toISOString().slice(0, 10)
    if (!withTime) return date
    var hh = String(d.getUTCHours()).padStart(2, "0")
    var mm = String(d.getUTCMinutes()).padStart(2, "0")
    return date + " " + hh + ":" + mm + "Z"
  }

  document.getElementById("footer-source").textContent = (meta.sourceDir || meta.sourceFile || "Google Photos") + " (" + (meta.sidecarCount || 0) + " sidecars)"

  // ----- KPIs
  document.getElementById("kpi-media").textContent = fmt.format(summary.totalCount || 0)
  document.getElementById("kpi-media-sub").textContent =
    (summary.photoCount || 0) + " photo · " + (summary.videoCount || 0) + " video · " + (summary.activeDays || 0) + " active days"
  document.getElementById("kpi-albums").textContent = fmt.format(summary.albumCount || 0)
  document.getElementById("kpi-albums-sub").textContent = summary.topAlbum
    ? "Top: " + ellipsize(summary.topAlbum.name, 22) + " · " + fmt.format(summary.topAlbum.count)
    : ""
  document.getElementById("kpi-window").textContent = summary.durationLabel || "—"
  document.getElementById("kpi-window-sub").textContent =
    (summary.dateRange || "") + (summary.activeMonths ? " · " + summary.activeMonths + " months" : "")
  document.getElementById("kpi-geo").textContent = pct(summary.geoShare)
  document.getElementById("kpi-geo-sub").textContent =
    fmt.format(summary.geoCount || 0) + " of " + fmt.format(summary.totalCount || 0) + " carry coordinates"
  document.getElementById("kpi-device").textContent = ellipsize(summary.topDevice || "—", 22)
  document.getElementById("kpi-device-sub").textContent =
    summary.topDeviceCount ? fmt.format(summary.topDeviceCount) + " items" : ""

  document.getElementById("hero-editorial").textContent = buildEditorial()

  // ----- Monthly bars (with photo/video stack)
  var mode = "month"
  function renderMonthlyBars(){
    var svg = document.getElementById("bars-svg")
    var axis = document.getElementById("bars-axis")
    var ymWrap = document.getElementById("ym-wrap")
    ymWrap.hidden = true
    svg.style.display = "block"
    axis.style.display = "flex"
    if (!monthTotals.length) {
      svg.innerHTML = '<text x="500" y="100" text-anchor="middle">No timestamped media in this window</text>'
      axis.innerHTML = ""
      return
    }
    var W = 1000, H = 200, pad = 24, padBottom = 30
    var max = 0, peakIdx = 0
    monthTotals.forEach(function(s, i){ if (s.count > max) { max = s.count; peakIdx = i } })
    if (!max) max = 1
    var bw = (W - pad * 2) / monthTotals.length
    var inner = ""
    monthTotals.forEach(function(s, i){
      if (!s.count) return
      var usable = H - pad - padBottom
      var pH = (s.photo / max) * usable
      var vH = (s.video / max) * usable
      var x = pad + i * bw + bw * 0.1
      var w = bw * 0.8
      var photoY = H - padBottom - pH
      var videoY = photoY - vH
      var clsP = i === peakIdx ? "bar peak" : "bar"
      if (pH > 0) inner += '<rect class="' + clsP + '" x="' + x.toFixed(1) + '" y="' + photoY.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + pH.toFixed(1) + '" rx="2"></rect>'
      if (vH > 0) inner += '<rect class="bar video" x="' + x.toFixed(1) + '" y="' + videoY.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + vH.toFixed(1) + '" rx="2"></rect>'
      if (i === peakIdx) inner += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (photoY - 6).toFixed(1) + '" text-anchor="middle">' + s.count + '</text>'
    })
    inner += '<line x1="' + pad + '" y1="' + (H - padBottom) + '" x2="' + (W - pad) + '" y2="' + (H - padBottom) + '" stroke="rgba(0,0,0,.08)" />'
    svg.innerHTML = inner
    var first = monthTotals[0].month
    var peak = monthTotals[peakIdx].month
    var last = monthTotals[monthTotals.length - 1].month
    axis.innerHTML = '<span>' + escapeHtml(first) + '</span><span>peak: ' + escapeHtml(peak) + ' (' + monthTotals[peakIdx].count + ')</span><span>' + escapeHtml(last) + '</span>'
    var avg = Math.round(monthTotals.reduce(function(a,b){return a + b.count}, 0) / monthTotals.length)
    document.getElementById("bars-legend").innerHTML =
      '<span><strong>' + monthTotals.length + '</strong> months</span>' +
      '<span>peak: <strong>' + monthTotals[peakIdx].count + '</strong> media</span>' +
      '<span>average: <strong>' + avg + '</strong> per month</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:var(--primary);border-radius:2px;margin-right:4px"></span>photo</span>' +
      '<span><span style="display:inline-block;width:10px;height:10px;background:var(--secondary-container);border-radius:2px;margin-right:4px"></span>video</span>'
  }
  function renderYearMonth(){
    var svg = document.getElementById("bars-svg")
    var axis = document.getElementById("bars-axis")
    var ymWrap = document.getElementById("ym-wrap")
    var grid = document.getElementById("ym-grid")
    svg.style.display = "none"
    axis.style.display = "none"
    ymWrap.hidden = false
    var max = 0
    yearMonthHeatmap.cells.forEach(function(row){ row.forEach(function(v){ if (v > max) max = v }) })
    if (!max) max = 1
    function bucket(v){
      if (!v) return 0
      var n = Math.ceil((v / max) * 5)
      return Math.max(1, Math.min(5, n))
    }
    var html = '<span></span>'
    for (var m = 0; m < 12; m++) html += '<span class="col-h">' + MONTH_LABELS[m] + '</span>'
    yearMonthHeatmap.years.forEach(function(year, idx){
      html += '<span class="row-y">' + escapeHtml(year) + '</span>'
      var arr = yearMonthHeatmap.cells[idx] || []
      for (var m2 = 0; m2 < 12; m2++) {
        var v = arr[m2] || 0
        html += '<span class="cell" data-c="' + bucket(v) + '" title="' + year + '-' + String(m2 + 1).padStart(2, "0") + ' — ' + v + ' media">' + v + '</span>'
      }
    })
    grid.innerHTML = html
    document.getElementById("bars-legend").innerHTML =
      '<span><strong>' + yearMonthHeatmap.years.length + '</strong> years shown · cells colored by month volume</span>'
  }
  function renderTimeline(){ if (mode === "month") renderMonthlyBars(); else renderYearMonth() }
  document.getElementById("t-month").addEventListener("click", function(){
    mode = "month"
    document.getElementById("t-month").classList.add("active")
    document.getElementById("t-year").classList.remove("active")
    renderTimeline()
  })
  document.getElementById("t-year").addEventListener("click", function(){
    mode = "year"
    document.getElementById("t-year").classList.add("active")
    document.getElementById("t-month").classList.remove("active")
    renderTimeline()
  })
  renderTimeline()

  // ----- Hour × DOW heatmap
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
        html += '<span class="cell" data-c="' + bucket(v) + '" title="' + DOW_NAMES[dd] + " " + hh2 + ":00 — " + v + ' media"></span>'
      }
    }
    document.getElementById("heatmap").innerHTML = html
  })()

  // ----- Places (inline SVG, no map tiles)
  ;(function(){
    var meta = document.getElementById("places-meta")
    var empty = document.getElementById("places-empty")
    var svg = document.getElementById("places-svg")
    var list = document.getElementById("cluster-list")
    if (!places.points.length || !places.bbox) {
      svg.style.display = "none"
      list.style.display = "none"
      empty.hidden = false
      meta.textContent = "0 geotagged"
      return
    }
    meta.textContent = (summary.geoCount || 0) + " geotagged · " + places.clusters.length + " clusters"
    var W = 1000, H = 600, pad = 30
    var bb = places.bbox
    var midLat = (bb.minLat + bb.maxLat) / 2
    var cosMid = Math.cos(midLat * Math.PI / 180)
    var dLng = Math.max(0.01, (bb.maxLng - bb.minLng) * cosMid)
    var dLat = Math.max(0.01, bb.maxLat - bb.minLat)
    var pad2 = 0.05
    var lngExtent = dLng * (1 + pad2 * 2)
    var latExtent = dLat * (1 + pad2 * 2)
    var minLngP = bb.minLng - dLng / cosMid * pad2
    var maxLatP = bb.maxLat + dLat * pad2
    var scaleX = (W - pad * 2) / lngExtent
    var scaleY = (H - pad * 2) / latExtent
    var scale = Math.min(scaleX, scaleY)
    function project(lat, lng){
      var x = pad + (lng - minLngP) * cosMid * scale
      var y = pad + (maxLatP - lat) * scale
      return [x, y]
    }
    var inner = '<g class="grid">'
    // graticule: 30° steps
    for (var lng = -180; lng <= 180; lng += 30) {
      var p1 = project(bb.minLat - 1, lng), p2 = project(bb.maxLat + 1, lng)
      inner += '<line x1="' + p1[0].toFixed(1) + '" y1="' + p1[1].toFixed(1) + '" x2="' + p2[0].toFixed(1) + '" y2="' + p2[1].toFixed(1) + '" />'
    }
    for (var lat = -90; lat <= 90; lat += 15) {
      var q1 = project(lat, bb.minLng - 5), q2 = project(lat, bb.maxLng + 5)
      inner += '<line x1="' + q1[0].toFixed(1) + '" y1="' + q1[1].toFixed(1) + '" x2="' + q2[0].toFixed(1) + '" y2="' + q2[1].toFixed(1) + '" />'
    }
    inner += '</g>'
    var maxC = 0
    places.points.forEach(function(p){ if (p.count > maxC) maxC = p.count })
    places.points.forEach(function(p){
      var pos = project(p.lat, p.lng)
      var r = 1.6 + Math.min(7, Math.sqrt(p.count) * 1.4)
      var cls = p.count > Math.max(2, maxC * 0.5) ? "dot big" : "dot"
      inner += '<circle class="' + cls + '" cx="' + pos[0].toFixed(1) + '" cy="' + pos[1].toFixed(1) + '" r="' + r.toFixed(1) + '"><title>' + escapeHtml(p.lat + ", " + p.lng + " — " + p.count + " photos") + '</title></circle>'
    })
    svg.innerHTML = inner
    list.innerHTML = places.clusters.map(function(c){
      return '<div class="row">' +
        '<div class="label">' + escapeHtml(c.label) + '</div>' +
        '<div class="meta">' + c.count + ' photos · ' + (c.first ? c.first + " → " + c.last : "(no dates)") + '</div>' +
      '</div>'
    }).join("")
  })()

  // ----- Albums
  ;(function(){
    var grid = document.getElementById("album-grid")
    document.getElementById("albums-meta").textContent = albums.length + " albums"
    grid.innerHTML = albums.map(function(a){
      var hashes = a.mosaicHashes && a.mosaicHashes.length ? a.mosaicHashes.slice(0, 8) : [180, 200, 220, 60, 30, 280, 320, 100]
      while (hashes.length < 8) hashes.push(hashes[hashes.length % hashes.length])
      var mosaic = hashes.map(function(h){
        return '<div class="tile" style="background:linear-gradient(135deg, hsl(' + h + ',55%,45%), hsl(' + ((h + 30) % 360) + ',55%,55%));"></div>'
      }).join("")
      var span = (a.first && a.last) ? a.first + " → " + a.last : "(no dates)"
      var stats = a.itemCount + " items · " + a.photoCount + " photo / " + a.videoCount + " video · " + span
      var overlap = (a.overlap && a.overlap.length)
        ? '<div class="overlap">shares ' + a.overlap[0].shared + ' items with “' + escapeHtml(a.overlap[0].other) + '”' +
          (a.overlap.length > 1 ? ' (+ ' + (a.overlap.length - 1) + ' more)' : '') + '</div>'
        : ''
      return '<div class="album" data-album="' + escapeHtml(a.name) + '">' +
        '<div class="mosaic">' + mosaic + '</div>' +
        '<div class="name">' + escapeHtml(a.name) + '</div>' +
        '<div class="stats">' + escapeHtml(stats) + '</div>' +
        '<div class="device">' + escapeHtml(a.topDevice || "—") + '</div>' +
        overlap +
      '</div>'
    }).join("")
    Array.prototype.forEach.call(grid.querySelectorAll(".album"), function(el){
      el.addEventListener("click", function(){
        var name = el.getAttribute("data-album")
        activeAlbum = activeAlbum === name ? null : name
        renderChips(); renderTable()
        document.getElementById("head-drill").scrollIntoView({behavior: "smooth"})
      })
    })
  })()

  // ----- Devices
  ;(function(){
    var list = document.getElementById("dev-list")
    document.getElementById("devices-meta").textContent = devices.length + " devices · top " + Math.min(devices.length, 8) + " shown"
    var top = devices.slice(0, 8)
    var maxCount = top.length ? top[0].itemCount : 1
    list.innerHTML = top.map(function(d, i){
      var months = d.monthly || []
      var maxM = 0
      months.forEach(function(m){ if (m.count > maxM) maxM = m.count })
      var spark = ""
      if (months.length && maxM > 0) {
        var W = 200, H = 32, bw = W / Math.max(months.length, 1)
        var inner = ""
        months.forEach(function(m, j){
          if (!m.count) return
          var h = (m.count / maxM) * H
          var x = j * bw
          var y = H - h
          inner += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + h.toFixed(1) + '" />'
        })
        spark = '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + inner + '</svg>'
      }
      var first = d.first || "—"
      var last = d.last || "—"
      return '<div class="dev" data-device="' + escapeHtml(d.name) + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="name"><span>' + escapeHtml(d.name) + '</span><span class="sub">' + escapeHtml(first) + ' → ' + escapeHtml(last) + ' · ' + d.photoCount + ' photo / ' + d.videoCount + ' video</span></span>' +
        '<span class="spark-cell">' + spark + '</span>' +
        '<span class="count">' + d.itemCount + '<span class="share">' + pct(d.share) + '</span></span>' +
      '</div>'
    }).join("")
    Array.prototype.forEach.call(list.querySelectorAll(".dev"), function(el){
      el.addEventListener("click", function(){
        var name = el.getAttribute("data-device")
        activeDevice = activeDevice === name ? null : name
        renderChips(); renderTable()
        document.getElementById("head-drill").scrollIntoView({behavior: "smooth"})
      })
    })
  })()

  // ----- Audit
  ;(function(){
    document.getElementById("audit-burst").textContent = (summary.burstCount || 0) + " clusters"
    var bb = document.getElementById("audit-burst-body")
    if (bursts.length) {
      bb.innerHTML =
        '<div>Sequences of ≥4 photos within ~3 minutes in the same album.</div>' +
        '<ul>' + bursts.slice(0, 4).map(function(b){
          var dur = b.durationSec >= 60 ? Math.floor(b.durationSec / 60) + "m " + (b.durationSec % 60) + "s" : b.durationSec + "s"
          return '<li>' + escapeHtml(fmtIso(b.start, true)) + ' — <strong>' + b.count + '</strong> in ' + dur +
            ' <span class="cad">' + escapeHtml(b.album || "(loose)") + '</span></li>'
        }).join("") + '</ul>'
    } else {
      bb.textContent = "No burst clusters detected — your shutter rhythm is spread out."
    }

    document.getElementById("audit-edit").textContent = (summary.editedPairCount || 0) + " pairs"
    var eb = document.getElementById("audit-edit-body")
    if (editedPairs.length) {
      eb.innerHTML =
        '<div>Originals you edited inside Google Photos. Both versions live in this export.</div>' +
        '<ul>' + editedPairs.slice(0, 3).map(function(p){
          return '<li>' + escapeHtml(p.base) + ' <span class="cad">' + p.original + ' / ' + p.edited + '</span></li>'
        }).join("") + '</ul>'
    } else {
      eb.textContent = "No edited / original pairs detected in this export."
    }

    document.getElementById("audit-dup").textContent = (summary.duplicateCount || 0) + " groups"
    var db = document.getElementById("audit-dup-body")
    if (duplicates.length) {
      db.innerHTML =
        '<div>Sidecars sharing the same photoTakenTime in the same album. Heuristic — could be re-uploads, multi-shot bursts, or simultaneous device captures.</div>' +
        '<ul>' + duplicates.slice(0, 3).map(function(d){
          return '<li>' + escapeHtml(fmtIso(d.ts, true)) + ' — ' + escapeHtml(d.album || "(loose)") + ' <span class="cad">' + d.sampleIds.length + ' rows</span></li>'
        }).join("") + '</ul>'
    } else {
      db.textContent = "No same-timestamp duplicates detected."
    }

    var miss = (summary.missingTimestampCount || 0) + (summary.missingGeoCount || 0) + (summary.missingDeviceCount || 0)
    document.getElementById("audit-missing").textContent = miss + " gaps"
    document.getElementById("audit-missing-body").innerHTML =
      '<ul>' +
        '<li>' + (summary.missingTimestampCount || 0) + ' without photoTakenTime <span class="cad">undated</span></li>' +
        '<li>' + (summary.missingGeoCount || 0) + ' without coordinates <span class="cad">no GPS</span></li>' +
        '<li>' + (summary.missingDeviceCount || 0) + ' without device hint <span class="cad">unknown source</span></li>' +
      '</ul>'
  })()

  // ----- Drill-down
  document.getElementById("flag-photo-count").textContent = summary.photoCount || 0
  document.getElementById("flag-video-count").textContent = summary.videoCount || 0
  document.getElementById("flag-fav-count").textContent = summary.favoritedCount || 0
  document.getElementById("flag-arch-count").textContent = summary.archivedCount || 0
  document.getElementById("flag-geo-count").textContent = summary.geoCount || 0
  document.getElementById("flag-missing-count").textContent =
    (summary.missingTimestampCount || 0) + (summary.missingGeoCount || 0) + (summary.missingDeviceCount || 0)

  var searchInput = document.getElementById("drill-search")
  var activeAlbum = null
  var activeDevice = null
  var activeYear = null
  var flagFilter = null
  var pageSize = 60
  var visibleN = pageSize

  function years(){
    var s = new Set()
    rows.forEach(function(r){ if (r.year) s.add(r.year) })
    return Array.from(s).sort()
  }

  function renderChips(){
    var topAlbums = albums.slice(0, 10)
    document.getElementById("album-chips").innerHTML = topAlbums.map(function(a){
      var act = activeAlbum === a.name ? " active" : ""
      return '<div class="chip' + act + '" data-album="' + escapeHtml(a.name) + '">' +
        escapeHtml(a.name) + ' <span class="count">' + a.itemCount + '</span></div>'
    }).join("")
    var topDevices = devices.slice(0, 8)
    document.getElementById("device-chips").innerHTML = topDevices.map(function(d){
      var act = activeDevice === d.name ? " active" : ""
      return '<div class="chip' + act + '" data-device="' + escapeHtml(d.name) + '">' +
        escapeHtml(d.name) + ' <span class="count">' + d.itemCount + '</span></div>'
    }).join("")
    document.getElementById("year-chips").innerHTML = years().map(function(y){
      var act = activeYear === y ? " active" : ""
      var n = rows.filter(function(r){ return r.year === y }).length
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
    Array.prototype.forEach.call(document.querySelectorAll("#album-chips .chip"), function(el){
      el.onclick = function(){
        var name = el.getAttribute("data-album")
        activeAlbum = activeAlbum === name ? null : name
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#device-chips .chip"), function(el){
      el.onclick = function(){
        var name = el.getAttribute("data-device")
        activeDevice = activeDevice === name ? null : name
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#year-chips .chip"), function(el){
      el.onclick = function(){
        var y = el.getAttribute("data-year")
        activeYear = activeYear === y ? null : y
        renderChips(); renderTable()
      }
    })
    Array.prototype.forEach.call(document.querySelectorAll("#flag-chips .chip"), function(el){
      el.onclick = function(){
        var f = el.getAttribute("data-flag")
        flagFilter = flagFilter === f ? null : f
        renderChips(); renderTable()
      }
    })
  }

  function applyFilters(){
    var q = (searchInput.value || "").trim().toLowerCase()
    return rows.filter(function(r){
      if (activeAlbum && r.album !== activeAlbum) return false
      if (activeDevice && r.device !== activeDevice) return false
      if (activeYear && r.year !== activeYear) return false
      if (flagFilter === "photo" && r.isVideo) return false
      if (flagFilter === "video" && !r.isVideo) return false
      if (flagFilter === "favorited" && !r.favorited) return false
      if (flagFilter === "archived" && !r.archived) return false
      if (flagFilter === "geo" && !r.hasGeo) return false
      if (flagFilter === "missing" && r.hasTimestamp && r.hasGeo && r.device) return false
      if (q) {
        var hay = (r.filename + " " + (r.album || "") + " " + (r.device || "") + " " + (r.year || "")).toLowerCase()
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
      body.innerHTML = '<tr><td colspan="4" class="empty-state">No media match the current filters.</td></tr>'
      document.getElementById("loadmore").innerHTML = ""
      return
    }
    var slice = matches.slice(0, visibleN)
    body.innerHTML = slice.map(function(r){
      var tcls = []
      if (r.isVideo) tcls.push("video")
      if (r.archived) tcls.push("archived")
      var badge = ""
      if (r.isVideo) badge += '<span class="badge video">video</span>'
      if (r.favorited) badge += '<span class="badge fav">★</span>'
      if (r.isEdited) badge += '<span class="badge edited">edited</span>'
      if (r.archived) badge += '<span class="badge archived">archived</span>'
      return '<tr class="' + tcls.join(" ") + '" data-id="' + escapeHtml(r.id) + '">' +
        '<td class="col-time">' + escapeHtml(fmtIso(r.ts, true)) + '</td>' +
        '<td class="col-filename">' + escapeHtml(ellipsize(r.filename, 60)) + badge + '</td>' +
        '<td class="col-album">' + escapeHtml(r.album || "—") + '</td>' +
        '<td class="col-device">' + escapeHtml(r.device || "—") + '</td>' +
      '</tr>'
    }).join("")
    Array.prototype.forEach.call(body.querySelectorAll("tr"), function(tr){
      tr.addEventListener("click", function(){ toggleRowDetail(tr) })
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
      '<dt>filename</dt><dd>' + escapeHtml(r.filename) + '</dd>' +
      '<dt>album</dt><dd>' + escapeHtml(r.album || "(loose)") + '</dd>' +
      '<dt>type</dt><dd>' + (r.isVideo ? "video" : "photo") + ' · ' + escapeHtml(r.ext || "") + '</dd>' +
      '<dt>photoTakenTime</dt><dd>' + escapeHtml(r.ts || "—") + '</dd>' +
      '<dt>creationTime</dt><dd>' + escapeHtml(r.tsCreation || "—") + '</dd>' +
      '<dt>geo</dt><dd>' + (r.hasGeo
        ? r.lat + ", " + r.lng + (r.altitude !== null ? " · alt " + r.altitude : "")
        : "(no coordinates)") + '</dd>' +
      '<dt>device</dt><dd>' + escapeHtml(r.device || "(unknown)") + ' <span class="muted">[' + escapeHtml(r.deviceKind || "unknown") + ']</span></dd>' +
      '<dt>flags</dt><dd>' +
        (r.favorited ? '<span class="badge fav">favorited</span> ' : "") +
        (r.archived ? '<span class="badge archived">archived</span> ' : "") +
        (r.trashed ? '<span class="badge archived">trashed</span> ' : "") +
        (r.isEdited ? '<span class="badge edited">edited</span> ' : "") +
        (!r.favorited && !r.archived && !r.trashed && !r.isEdited ? '—' : "") +
      '</dd>' +
      '<dt>sidecar path</dt><dd>' + escapeHtml(r.sidecarFile) + '</dd>' +
    '</dl>'
    tr2.appendChild(td)
    tr.parentNode.insertBefore(tr2, tr.nextSibling)
  }

  document.getElementById("drill-clear").addEventListener("click", function(){
    activeAlbum = null; activeDevice = null; activeYear = null; flagFilter = null
    searchInput.value = ""; visibleN = pageSize
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
    copy(buildLibraryNote(), document.getElementById("copy-md-btn"))
  })

  function buildEditorial(){
    var parts = []
    parts.push((summary.totalCount || 0) + " media (" + (summary.photoCount || 0) + " photos · " +
      (summary.videoCount || 0) + " videos) over " + (summary.durationLabel || "this window") + ".")
    if (summary.topAlbum) {
      parts.push('"' + summary.topAlbum.name + '" leads with ' + (summary.topAlbum.count) + ' items.')
    }
    if (summary.busiestDay) {
      parts.push("Busiest single day: " + summary.busiestDay.date + " (" + summary.busiestDay.count + " media).")
    }
    if (summary.busiestMonth) {
      parts.push("Busiest month: " + summary.busiestMonth.month + " (" + summary.busiestMonth.count + " media).")
    }
    if (summary.topDevice) {
      parts.push("Top device: " + summary.topDevice + ".")
    }
    if (summary.geoShare) {
      parts.push(Math.round(summary.geoShare * 100) + "% carry GPS coordinates.")
    }
    return parts.join(" ")
  }
  function buildLibraryNote(){
    var lines = []
    lines.push("# " + (document.getElementById("hero-title").textContent || "Google Photos library"))
    lines.push("")
    lines.push(buildEditorial())
    lines.push("")
    lines.push("## Headline")
    lines.push("- " + (summary.totalCount || 0) + " media · " + (summary.photoCount || 0) + " photo / " + (summary.videoCount || 0) + " video")
    lines.push("- Window: " + (summary.dateRange || "—") + " (" + (summary.durationLabel || "—") + ", " + (summary.activeDays || 0) + " active days)")
    lines.push("- Albums: " + (summary.albumCount || 0) + " · Devices: " + (summary.deviceCount || 0))
    lines.push("- Geotag coverage: " + Math.round((summary.geoShare || 0) * 100) + "%")
    if (summary.busiestMonth) lines.push("- Busiest month: " + summary.busiestMonth.month + " (" + summary.busiestMonth.count + ")")
    if (summary.missingTimestampCount) lines.push("- Missing timestamps: " + summary.missingTimestampCount)
    if (summary.missingGeoCount) lines.push("- Missing GPS: " + summary.missingGeoCount)
    lines.push("")
    lines.push("## Top albums")
    albums.slice(0, 8).forEach(function(a){
      var span = (a.first && a.last) ? a.first + " → " + a.last : "(no dates)"
      lines.push("- " + a.name + " — " + a.itemCount + " items (" + span + ", top: " + (a.topDevice || "—") + ")")
    })
    lines.push("")
    lines.push("## Devices")
    devices.slice(0, 6).forEach(function(d){
      lines.push("- " + d.name + " — " + d.itemCount + " items (" + Math.round(d.share * 100) + "%, " + (d.first || "—") + " → " + (d.last || "—") + ")")
    })
    if (bursts.length) {
      lines.push("")
      lines.push("## Burst clusters")
      bursts.slice(0, 5).forEach(function(b){
        lines.push("- " + b.start.slice(0, 16) + "Z — " + b.count + " photos in " + b.durationSec + "s, " + (b.album || "(loose)"))
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
    console.error("Usage: node scripts/render_google_photos_takeout_fallback.mjs INPUT_DIR --out OUT --title TITLE")
    process.exit(1)
  }
  const input = args[0]
  const out = arg(args, "--out") || path.join(input, "output.html")
  const title = arg(args, "--title") || path.basename(input)

  const parsed = await parser.parse(input)
  if (parsed.contentType !== "google-photos-takeout") {
    console.error("Expected google-photos-takeout, got", parsed.contentType)
    process.exit(3)
  }

  // Strip the per-row `raw` sidecar from the inlined payload — the renderer
  // builds the row detail from parsed fields directly, so the verbose raw
  // copy would just bloat the HTML by ~5–10× without adding render value.
  const slim = {
    ...parsed.data,
    rows: parsed.data.rows.map(r => { const { raw, ...rest } = r; return rest }),
  }

  const html = TEMPLATE
    .replace(/__TITLE__/g, escapeHtml(title))
    .replace("__DATA__", inlineJson(slim))
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

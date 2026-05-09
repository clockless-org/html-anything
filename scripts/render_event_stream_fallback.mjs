/**
 * Offline fallback renderer for the event-stream family (jsonl-events,
 * log-events). The canonical pipeline is `dist/cli.js → htmlize → LLM`,
 * but some operators run example regeneration on machines without an
 * Anthropic / OpenAI key. This script reuses the same parser, then
 * applies a hand-tuned shared template that satisfies the
 * _event_stream.md contract (volume histogram, severity panel,
 * outliers, top-N leaderboard, virtualized drill-down).
 *
 * The template still emits `__DATA__` and is injected with the SAME
 * substitution logic htmlize.ts uses, so the resulting page renders
 * the full inlined data identically to an LLM-designed page.
 *
 * Usage:
 *   node scripts/render_event_stream_fallback.mjs INPUT --out OUT --title TITLE [--editorial "..."]
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
h1{font-size:clamp(28px,5vw,44px);font-weight:700;line-height:1.05;letter-spacing:-.02em}
h2{font-size:clamp(20px,2.4vw,24px);margin-bottom:var(--space-md)}
h3{font-size:17px;margin-bottom:var(--space-sm)}
.muted{color:var(--fg-muted)}
.mono{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
button{font:inherit;cursor:pointer;border:none;background:transparent;color:inherit}
input,select{font:inherit;color:var(--fg-1)}
.hero{padding:var(--space-3xl) 0 var(--space-2xl);border-bottom:1px solid var(--border)}
.hero .eyebrow{display:inline-flex;gap:var(--space-sm);align-items:center;
  background:var(--surface-container);color:var(--primary);
  padding:var(--space-xs) var(--space-md);border-radius:var(--radius-pill);
  font-family:var(--font-mono);font-size:11.5px;font-weight:500;
  text-transform:uppercase;letter-spacing:.08em;margin-bottom:var(--space-lg)}
.hero h1{background:var(--gradient-text);-webkit-background-clip:text;background-clip:text;color:transparent;max-width:18ch}
.hero .editorial{margin-top:var(--space-lg);max-width:62ch;color:var(--fg-2);font-size:17px;line-height:1.55}
.hero-actions{display:flex;gap:var(--space-md);margin-top:var(--space-xl);flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) var(--space-lg);
  border-radius:var(--radius-pill);font-weight:600;font-size:14px;border:1px solid var(--border-strong);
  background:var(--surface-container-lowest);color:var(--fg-1);transition:all .15s ease;cursor:pointer}
.btn:hover{background:var(--surface-container);box-shadow:var(--shadow-sm)}
.btn.primary{background:var(--gradient-primary);color:var(--on-primary);border-color:transparent}
.btn.primary:hover{box-shadow:var(--shadow-accent)}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:var(--space-lg);margin-top:var(--space-3xl)}
.kpi{background:var(--surface-container-lowest);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:var(--space-lg) var(--space-xl);box-shadow:var(--shadow-sm)}
.kpi .label{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);font-weight:500}
.kpi .value{font-family:var(--font-headline);font-size:28px;font-weight:600;margin-top:var(--space-xs);color:var(--fg-1)}
.kpi .value.accent{color:var(--primary)}
.kpi .sub{font-size:12.5px;color:var(--fg-muted);margin-top:2px;font-family:var(--font-mono)}
.section{margin-top:var(--space-4xl)}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:var(--space-lg);gap:var(--space-md);flex-wrap:wrap}
.section-head .meta{font-size:13px;color:var(--fg-muted);font-family:var(--font-mono)}
.card{background:var(--surface-container-lowest);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:var(--space-xl);box-shadow:var(--shadow-sm)}
/* Histogram */
.hist-card{padding:var(--space-2xl)}
.hist-svg{width:100%;height:220px;display:block}
.hist-svg .bar-info{fill:var(--secondary-container);opacity:.55}
.hist-svg .bar-info:hover{opacity:.85}
.hist-svg .bar-error{fill:var(--red)}
.hist-svg .bar-warn{fill:var(--yellow);opacity:.85}
.hist-svg text{font-family:var(--font-mono);font-size:11px;fill:var(--fg-muted)}
.hist-pin{font-size:11px}
.hist-pin circle{fill:var(--primary);stroke:var(--bg);stroke-width:2}
.hist-legend{display:flex;gap:var(--space-md);margin-top:var(--space-md);flex-wrap:wrap;font-size:12.5px;color:var(--fg-muted)}
.hist-legend span{display:inline-flex;align-items:center;gap:6px}
.hist-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
.burst-pins{display:flex;flex-direction:column;gap:var(--space-xs);margin-top:var(--space-md);font-size:12.5px;color:var(--fg-2)}
.burst-pins div{font-family:var(--font-mono)}
/* Two-col grids */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-xl)}
@media (max-width:780px){.grid-2{grid-template-columns:1fr}}
/* Severity chips */
.chips{display:flex;gap:var(--space-sm);flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) var(--space-md);
  border-radius:var(--radius-pill);background:var(--surface-container);border:1px solid var(--border);
  font-size:13px;font-weight:500;cursor:pointer;transition:all .15s ease;user-select:none}
.chip:hover{background:var(--surface-container-high)}
.chip.active{background:var(--primary);color:var(--on-primary);border-color:transparent}
.chip[data-empty="true"]{opacity:.45;cursor:default}
.chip .count{font-family:var(--font-mono);font-size:12px;color:var(--fg-muted)}
.chip.active .count{color:rgba(255,255,255,.8)}
.chip-dot{width:9px;height:9px;border-radius:50%;display:inline-block}
.chip-dot.error{background:var(--red)}
.chip-dot.warn{background:var(--yellow)}
.chip-dot.info{background:var(--secondary-container)}
.chip-dot.debug{background:var(--fg-muted)}
.chip-dot.trace{background:var(--accent-cyan)}
/* Status donut */
.donut-row{display:flex;align-items:center;gap:var(--space-2xl);flex-wrap:wrap}
.donut-svg{flex:0 0 auto}
.donut-legend{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);min-width:200px}
.donut-legend div{display:flex;align-items:center;gap:var(--space-sm);font-size:13px}
.donut-legend i{width:12px;height:12px;border-radius:3px;flex:0 0 auto}
.donut-legend strong{font-family:var(--font-mono);font-weight:600;color:var(--fg-1)}
/* Leaderboard */
.leader{display:flex;flex-direction:column;gap:0}
.leader-row{display:grid;grid-template-columns:1fr auto auto;gap:var(--space-md);align-items:center;
  padding:var(--space-sm) 0;border-bottom:1px solid var(--border)}
.leader-row:last-child{border-bottom:none}
.leader-row .lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px}
.leader-row .lbl .badge{display:inline-block;font-size:10.5px;font-family:var(--font-mono);
  background:var(--surface-container);color:var(--fg-muted);
  padding:2px 6px;border-radius:var(--radius-sm);margin-left:var(--space-sm)}
.leader-row .lbl .badge.warn{background:rgba(245,158,11,.15);color:#a06200}
.leader-row .lbl .badge.err{background:rgba(239,68,68,.15);color:var(--red)}
.leader-row .cnt{font-family:var(--font-mono);font-size:13px;color:var(--fg-1);font-weight:500;text-align:right}
.leader-row .bar{width:64px;height:6px;background:var(--surface-container);border-radius:var(--radius-pill);overflow:hidden}
.leader-row .bar i{display:block;height:100%;background:var(--gradient-primary);border-radius:var(--radius-pill)}
@media (prefers-color-scheme:dark){.leader-row .lbl .badge.warn{background:rgba(245,158,11,.18);color:#fcd34d}}
/* Schema panel */
.schema-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-sm)}
.schema-item{padding:var(--space-md);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);cursor:pointer;transition:all .15s ease}
.schema-item:hover{border-color:var(--border-strong);box-shadow:var(--shadow-sm)}
.schema-item.active{border-color:var(--primary);box-shadow:var(--shadow-accent)}
.schema-item .field{font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--fg-1)}
.schema-item .type-row{display:flex;justify-content:space-between;font-size:11.5px;color:var(--fg-muted);margin-top:var(--space-xs);font-family:var(--font-mono)}
.schema-item .type-row .fill{color:var(--secondary-container)}
.schema-item .type-row .fill.sparse{color:var(--yellow)}
.schema-item .examples{margin-top:var(--space-xs);font-size:11.5px;color:var(--fg-2);font-family:var(--font-mono);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Outliers */
.outliers-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-md)}
.outlier-card{padding:var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);border-left:3px solid var(--primary)}
.outlier-card.kind-burst{border-left-color:var(--primary)}
.outlier-card.kind-top-error{border-left-color:var(--red)}
.outlier-card.kind-top-source{border-left-color:var(--secondary-container)}
.outlier-card.kind-schema{border-left-color:var(--yellow)}
.outlier-card.kind-slow{border-left-color:var(--blue)}
.outlier-card.kind-rare{border-left-color:var(--accent-cyan)}
.outlier-card .kind{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);
  font-family:var(--font-mono);font-weight:500;margin-bottom:var(--space-xs)}
.outlier-card .label{font-size:14.5px;font-weight:600;color:var(--fg-1);margin-bottom:var(--space-xs);line-height:1.3}
.outlier-card .detail{font-size:13px;color:var(--fg-2);font-family:var(--font-mono)}
.outlier-card .ts{font-size:11.5px;color:var(--fg-muted);font-family:var(--font-mono);margin-top:var(--space-xs)}
/* Drill-down */
.drill-toolbar{display:flex;gap:var(--space-md);margin-bottom:var(--space-md);flex-wrap:wrap;align-items:center}
.drill-search{flex:1 1 220px;min-width:220px;padding:var(--space-sm) var(--space-md);border:1px solid var(--border-strong);
  border-radius:var(--radius-md);background:var(--surface-container-lowest);font-size:14px;font-family:var(--font-mono)}
.drill-search:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:var(--primary)}
.drill-meta{font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
details.drill{margin-top:var(--space-md);border:1px solid var(--border);border-radius:var(--radius-lg);
  background:var(--surface-container-lowest);overflow:hidden}
details.drill > summary{cursor:pointer;padding:var(--space-lg) var(--space-xl);font-weight:600;
  font-family:var(--font-headline);font-size:17px;list-style:none;display:flex;align-items:center;justify-content:space-between}
details.drill > summary::-webkit-details-marker{display:none}
details.drill > summary::after{content:"⌄";color:var(--fg-muted);transition:transform .2s ease;font-size:20px}
details.drill[open] > summary::after{transform:rotate(180deg)}
details.drill .drill-body{padding:0 var(--space-xl) var(--space-xl)}
.tbl-wrap{max-height:560px;overflow:auto;border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--bg)}
table.events{width:100%;border-collapse:collapse;font-size:13px}
table.events thead{position:sticky;top:0;background:var(--surface-container);z-index:1}
table.events th{text-align:left;padding:var(--space-sm) var(--space-md);
  font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;
  color:var(--fg-muted);font-weight:500;border-bottom:1px solid var(--border)}
table.events td{padding:var(--space-sm) var(--space-md);border-bottom:1px solid var(--border);
  vertical-align:top}
table.events tr.row{cursor:pointer}
table.events tr.row:hover td{background:var(--surface-container-low)}
table.events tr.row.error td{box-shadow:inset 3px 0 0 var(--red)}
table.events tr.row.warn td{box-shadow:inset 3px 0 0 var(--yellow)}
table.events tr.expand-row td{background:var(--surface-container);padding:0}
table.events tr.expand-row pre{margin:0;padding:var(--space-md) var(--space-xl);
  font-family:var(--font-mono);font-size:12px;color:var(--fg-2);white-space:pre-wrap;
  word-break:break-word;max-height:320px;overflow:auto}
.col-ts{font-family:var(--font-mono);color:var(--fg-muted);white-space:nowrap}
.col-sev{font-family:var(--font-mono);font-size:11px;font-weight:600;text-transform:uppercase}
.col-sev.error{color:var(--red)}
.col-sev.warn{color:var(--yellow)}
.col-sev.info{color:var(--fg-muted)}
.col-msg{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-1);
  word-break:break-word;max-width:520px}
.col-msg mark{background:var(--primary-fixed);color:var(--fg-1);padding:0 2px;border-radius:2px}
.col-src{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-2);white-space:nowrap}
.tbl-loadmore{display:flex;justify-content:center;padding:var(--space-md);font-size:13px;color:var(--fg-muted)}
.tbl-loadmore button{padding:var(--space-sm) var(--space-lg);border-radius:var(--radius-pill);
  border:1px solid var(--border-strong);background:var(--surface-container-lowest)}
footer{margin-top:var(--space-5xl);padding-top:var(--space-2xl);border-top:1px solid var(--border);
  font-size:12.5px;color:var(--fg-muted);max-width:78ch;line-height:1.6}
footer .privacy{font-style:italic}
@media (max-width:540px){
  main{padding:var(--space-lg) var(--space-md) var(--space-4xl)}
  .hist-card{padding:var(--space-lg)}
  .donut-row{flex-direction:column;align-items:flex-start;gap:var(--space-lg)}
  .donut-legend{grid-template-columns:1fr}
}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <span class="eyebrow"><span class="mono" id="hero-format">EVENTS</span> · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial">__EDITORIAL__</p>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy analysis as Markdown</button>
        <button class="btn" id="jump-drill-btn">Jump to event table</button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Stream summary">
      <div class="kpi"><div class="label">Events</div><div class="value mono" id="kpi-events">0</div><div class="sub" id="kpi-events-sub"></div></div>
      <div class="kpi"><div class="label">Error rate</div><div class="value mono accent" id="kpi-errrate">0%</div><div class="sub" id="kpi-errrate-sub"></div></div>
      <div class="kpi"><div class="label">Window</div><div class="value mono" id="kpi-window">—</div><div class="sub" id="kpi-window-sub"></div></div>
      <div class="kpi"><div class="label">Sources</div><div class="value mono" id="kpi-sources">0</div><div class="sub" id="kpi-sources-sub"></div></div>
    </section>

    <section class="section" aria-labelledby="head-volume">
      <div class="section-head">
        <h2 id="head-volume">Volume over time</h2>
        <span class="meta" id="hist-meta"></span>
      </div>
      <div class="card hist-card">
        <svg class="hist-svg" id="hist-svg" viewBox="0 0 800 220" preserveAspectRatio="none" aria-label="Event volume over time, stacked by severity"></svg>
        <div class="hist-legend">
          <span><i style="background:var(--secondary-container)"></i>info / debug</span>
          <span><i style="background:var(--yellow)"></i>warn</span>
          <span><i style="background:var(--red)"></i>error</span>
          <span style="margin-left:auto" class="muted">Click a bar to filter the event table to that bucket.</span>
        </div>
        <div class="burst-pins" id="burst-pins"></div>
      </div>
    </section>

    <section class="section" id="schema-section" hidden aria-labelledby="head-schema">
      <div class="section-head">
        <h2 id="head-schema">Schema</h2>
        <span class="meta" id="schema-meta"></span>
      </div>
      <div class="schema-list" id="schema-list"></div>
    </section>

    <section class="section">
      <div class="grid-2">
        <div>
          <div class="section-head"><h2>Severity</h2><span class="meta" id="sev-meta"></span></div>
          <div class="card">
            <div class="chips" id="sev-chips"></div>
          </div>
        </div>
        <div id="categories-card-wrapper" hidden>
          <div class="section-head"><h2 id="head-categories">Categories</h2><span class="meta" id="cat-meta"></span></div>
          <div class="card"><div class="chips" id="cat-chips"></div></div>
        </div>
        <div id="status-donut-wrapper" hidden>
          <div class="section-head"><h2>Status classes</h2><span class="meta">HTTP response code distribution</span></div>
          <div class="card">
            <div class="donut-row">
              <svg class="donut-svg" id="donut-svg" width="180" height="180" viewBox="0 0 180 180" aria-label="HTTP status class distribution"></svg>
              <div class="donut-legend" id="donut-legend"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="grid-2">
        <div>
          <div class="section-head"><h2 id="head-top-msgs">Top messages</h2><span class="meta">Leaderboard</span></div>
          <div class="card"><div class="leader" id="top-msgs"></div></div>
        </div>
        <div>
          <div class="section-head"><h2 id="head-top-src">Top sources</h2><span class="meta">Leaderboard</span></div>
          <div class="card"><div class="leader" id="top-src"></div></div>
        </div>
      </div>
    </section>

    <section class="section" id="endpoints-section" hidden aria-labelledby="head-endpoints">
      <div class="section-head"><h2 id="head-endpoints">Top endpoints</h2><span class="meta">Path leaderboard with error-rate flags</span></div>
      <div class="card"><div class="leader" id="top-endpoints"></div></div>
    </section>

    <section class="section" aria-labelledby="head-outliers">
      <div class="section-head">
        <h2 id="head-outliers">Outliers &amp; anomalies</h2>
        <span class="meta" id="outliers-meta"></span>
      </div>
      <div class="outliers-grid" id="outliers-grid"></div>
    </section>

    <section class="section" id="drill-section" aria-labelledby="head-drill">
      <details class="drill" id="drill">
        <summary>
          <span><span id="drill-summary-text">Browse all events</span></span>
          <span class="meta" id="drill-summary-count"></span>
        </summary>
        <div class="drill-body">
          <div class="drill-toolbar">
            <input class="drill-search" type="search" placeholder="Search messages and sources…" id="drill-search">
            <span class="drill-meta" id="drill-meta">0 / 0 shown</span>
          </div>
          <div class="tbl-wrap" id="tbl-wrap">
            <table class="events">
              <thead id="tbl-head"></thead>
              <tbody id="tbl-body"></tbody>
            </table>
            <div class="tbl-loadmore" id="tbl-loadmore" hidden><button id="tbl-loadmore-btn">Load 200 more</button></div>
          </div>
        </div>
      </details>
    </section>

    <footer>
      <p class="privacy">Generated locally — your event stream never left your machine. The full log is embedded in this HTML and rendered in your browser. For sharing, prefer an anonymized export.</p>
      <p style="margin-top:var(--space-md)">
        <span class="mono" id="footer-meta"></span>
      </p>
    </footer>
  </main>

  <script>
    const DATA = __DATA__;
    const EDITORIAL = "__EDITORIAL__";
    const HERO_TITLE = "__TITLE__";

    /* ---------- helpers ---------- */
    const $ = (sel, root) => (root || document).querySelector(sel);
    const fmtNum = n => n == null ? "—" : (typeof n === "number" ? n.toLocaleString() : n);
    const fmtPct = n => n == null ? "—" : (Math.round(n * 10) / 10).toFixed(1) + "%";
    const fmtBytes = b => b == null ? "—" : (b < 1024 ? b + " B" : b < 1048576 ? (b/1024).toFixed(1) + " KB" : (b/1048576).toFixed(1) + " MB");
    const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const escAttr = s => escHtml(s);
    const escapeRegex = s => String(s).replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");

    /* ---------- header / KPI ---------- */
    document.title = HERO_TITLE;
    $("#hero-format").textContent = (DATA.format || "events").toUpperCase();
    $("#hero-title").textContent = HERO_TITLE;
    $("#hero-editorial").textContent = EDITORIAL;
    $("#kpi-events").textContent = fmtNum(DATA.eventCount);
    $("#kpi-events-sub").textContent = (DATA.errorCount || 0) + " errors / " + (DATA.eventCount - (DATA.errorCount || 0)) + " ok";
    $("#kpi-errrate").textContent = fmtPct(DATA.errorRate);
    $("#kpi-errrate-sub").textContent = (DATA.errorCount || 0) + " events flagged";
    $("#kpi-window").textContent = DATA.durationLabel || "—";
    $("#kpi-window-sub").textContent = DATA.timeRange || "";
    $("#kpi-sources").textContent = fmtNum(DATA.sourceCount);
    $("#kpi-sources-sub").textContent = "distinct " + (DATA.format === "access-log" ? "client IPs" : "sources");
    $("#footer-meta").textContent = (DATA.sourceFile || "input") + " · " + fmtBytes(DATA.sizeBytes) + " · " + fmtNum(DATA.eventCount) + " events · bucket " + (DATA.bucketSize || "—");

    /* ---------- histogram ---------- */
    (() => {
      const buckets = DATA.timeBuckets || [];
      const svg = $("#hist-svg");
      const W = 800, H = 220, PAD_L = 36, PAD_R = 12, PAD_T = 12, PAD_B = 28;
      const n = buckets.length;
      const max = buckets.reduce((m, b) => Math.max(m, b.count), 1);
      const bw = (W - PAD_L - PAD_R) / Math.max(n, 1);
      const sevFor = b => {
        // The parser only gives us total + errorCount per bucket. Approximate
        // warn share by global ratio so the stack is correctly proportioned
        // visually without inventing per-bucket fidelity we don't have.
        const totalErr = b.errorCount || 0;
        const totalRest = b.count - totalErr;
        const globalErr = DATA.severityCounts?.error || 0;
        const globalWarn = DATA.severityCounts?.warn || 0;
        const globalInfo = DATA.severityCounts?.info + (DATA.severityCounts?.debug || 0) + (DATA.severityCounts?.trace || 0) + (DATA.severityCounts?.other || 0);
        const restTotal = globalWarn + globalInfo;
        const warnShare = restTotal > 0 ? globalWarn / restTotal : 0;
        const warn = Math.round(totalRest * warnShare);
        const info = totalRest - warn;
        return { error: totalErr, warn, info };
      };
      const parts = [];
      const yScale = c => (H - PAD_T - PAD_B) * (c / max);
      buckets.forEach((b, i) => {
        const x = PAD_L + i * bw;
        const w = Math.max(bw - 1.2, 0.8);
        const sv = sevFor(b);
        let yCursor = H - PAD_B;
        if (sv.info > 0) {
          const h = yScale(sv.info);
          parts.push('<rect class="bar-info" data-bucket="' + escAttr(b.bucket) + '" x="' + x.toFixed(1) + '" y="' + (yCursor - h).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"><title>' + escHtml(b.label) + ' · ' + b.count + ' events (' + sv.info + ' info)</title></rect>');
          yCursor -= h;
        }
        if (sv.warn > 0) {
          const h = yScale(sv.warn);
          parts.push('<rect class="bar-warn" data-bucket="' + escAttr(b.bucket) + '" x="' + x.toFixed(1) + '" y="' + (yCursor - h).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"><title>' + escHtml(b.label) + ' · ' + sv.warn + ' warn</title></rect>');
          yCursor -= h;
        }
        if (sv.error > 0) {
          const h = yScale(sv.error);
          parts.push('<rect class="bar-error" data-bucket="' + escAttr(b.bucket) + '" x="' + x.toFixed(1) + '" y="' + (yCursor - h).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '"><title>' + escHtml(b.label) + ' · ' + sv.error + ' errors</title></rect>');
        }
      });
      // Y-axis labels (0 / max)
      parts.push('<text x="' + (PAD_L - 6) + '" y="' + (H - PAD_B + 4) + '" text-anchor="end">0</text>');
      parts.push('<text x="' + (PAD_L - 6) + '" y="' + (PAD_T + 8) + '" text-anchor="end">' + max + '</text>');
      // X-axis: first / mid / last labels
      const showAt = [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < n);
      showAt.forEach(i => {
        const b = buckets[i];
        const x = PAD_L + i * bw + bw / 2;
        parts.push('<text x="' + x.toFixed(1) + '" y="' + (H - PAD_B + 16) + '" text-anchor="middle">' + escHtml(b.label) + '</text>');
      });
      // Burst pins
      const burstSet = new Map();
      (DATA.outliers || []).forEach(o => { if (o.kind === "burst" && o.ts) burstSet.set(o.ts, o); });
      buckets.forEach((b, i) => {
        if (!burstSet.has(b.bucket)) return;
        const x = PAD_L + i * bw + bw / 2;
        const y = PAD_T + 6;
        parts.push('<g class="hist-pin"><circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="5"><title>' + escHtml(burstSet.get(b.bucket).label + " — " + burstSet.get(b.bucket).detail) + '</title></circle></g>');
      });
      svg.innerHTML = parts.join("");
      $("#hist-meta").textContent = n + " buckets · " + (DATA.bucketSize || "—") + " each";
      // Burst pin captions
      const captions = (DATA.outliers || []).filter(o => o.kind === "burst").map(o => "● " + o.label + " — " + o.detail);
      $("#burst-pins").innerHTML = captions.map(c => "<div>" + escHtml(c) + "</div>").join("");
      // Click bar → filter table
      svg.addEventListener("click", e => {
        const target = e.target.closest("rect");
        if (!target) return;
        const bucket = target.getAttribute("data-bucket");
        if (!bucket) return;
        bucketFilter = bucket;
        applyFilters();
        document.getElementById("drill").open = true;
        document.getElementById("drill").scrollIntoView({behavior: "smooth", block: "start"});
      });
    })();

    /* ---------- severity chips ---------- */
    let activeSev = "all";
    let activeCat = "all";
    let activeSchemaField = null;
    let bucketFilter = null;
    (() => {
      const chips = $("#sev-chips");
      const sc = DATA.severityCounts || {};
      const order = ["error", "warn", "info", "debug", "trace"];
      const total = Object.values(sc).reduce((a, b) => a + b, 0);
      let html = '<button class="chip active" data-sev="all"><span class="chip-dot" style="background:var(--primary)"></span>All <span class="count">' + fmtNum(total) + '</span></button>';
      order.forEach(k => {
        const v = sc[k] || 0;
        html += '<button class="chip" data-sev="' + k + '" ' + (v === 0 ? 'data-empty="true"' : '') + '><span class="chip-dot ' + k + '"></span>' + k + ' <span class="count">' + fmtNum(v) + '</span></button>';
      });
      chips.innerHTML = html;
      $("#sev-meta").textContent = "Filter chips · " + Object.keys(sc).filter(k => sc[k] > 0).length + " active levels";
      chips.addEventListener("click", e => {
        const btn = e.target.closest("button[data-sev]");
        if (!btn || btn.getAttribute("data-empty") === "true") return;
        chips.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        activeSev = btn.getAttribute("data-sev");
        applyFilters();
      });
    })();

    /* ---------- categories ---------- */
    (() => {
      const cats = DATA.categoryCounts || [];
      if (!cats.length) return;
      $("#categories-card-wrapper").hidden = false;
      const chips = $("#cat-chips");
      const total = cats.reduce((a, b) => a + (b.count || 0), 0);
      let html = '<button class="chip active" data-cat="all">All <span class="count">' + fmtNum(total) + '</span></button>';
      cats.slice(0, 12).forEach(c => {
        html += '<button class="chip" data-cat="' + escAttr(c.category) + '">' + escHtml(c.category) + ' <span class="count">' + fmtNum(c.count) + '</span></button>';
      });
      chips.innerHTML = html;
      $("#cat-meta").textContent = cats.length + " categories";
      chips.addEventListener("click", e => {
        const btn = e.target.closest("button[data-cat]");
        if (!btn) return;
        chips.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        activeCat = btn.getAttribute("data-cat");
        applyFilters();
      });
    })();

    /* ---------- schema panel (jsonl only) ---------- */
    (() => {
      const schema = DATA.schema || [];
      if (!schema.length) return;
      $("#schema-section").hidden = false;
      $("#schema-meta").textContent = schema.length + " inferred fields · click a field to filter the table to non-null rows";
      const list = $("#schema-list");
      list.innerHTML = schema.map(s => {
        const sparse = (s.fillPct || 0) < 25;
        const examples = (s.examples || []).slice(0, 3).map(v => JSON.stringify(v)).join(", ");
        return '<button class="schema-item" data-field="' + escAttr(s.field) + '">' +
          '<div class="field">' + escHtml(s.field) + '</div>' +
          '<div class="type-row"><span>' + escHtml(s.type) + '</span><span class="fill ' + (sparse ? "sparse" : "") + '">' + fmtPct(s.fillPct) + '</span></div>' +
          '<div class="examples">' + escHtml(examples) + '</div>' +
          '</button>';
      }).join("");
      list.addEventListener("click", e => {
        const btn = e.target.closest("button[data-field]");
        if (!btn) return;
        const field = btn.getAttribute("data-field");
        if (activeSchemaField === field) {
          activeSchemaField = null;
          btn.classList.remove("active");
        } else {
          list.querySelectorAll(".schema-item").forEach(c => c.classList.remove("active"));
          btn.classList.add("active");
          activeSchemaField = field;
        }
        applyFilters();
      });
    })();

    /* ---------- status donut (access-log only) ---------- */
    (() => {
      const ax = DATA.accessExtras;
      if (!ax || !ax.statusClasses || !ax.statusClasses.length) return;
      $("#status-donut-wrapper").hidden = false;
      const colors = { "2xx": "var(--green)", "3xx": "var(--blue)", "4xx": "var(--yellow)", "5xx": "var(--red)" };
      const total = ax.statusClasses.reduce((a, b) => a + b.count, 0);
      let svg = '';
      const cx = 90, cy = 90, r = 62, sw = 22;
      let acc = 0;
      ax.statusClasses.forEach(s => {
        const frac = s.count / total;
        const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
        acc += s.count;
        const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
        const large = frac > 0.5 ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        svg += '<path d="M ' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + '" fill="none" stroke="' + (colors[s.class] || "var(--fg-muted)") + '" stroke-width="' + sw + '"><title>' + s.class + ' · ' + s.count + ' (' + fmtPct(s.share) + ')</title></path>';
      });
      svg += '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-family="var(--font-headline)" font-size="22" font-weight="600" fill="var(--fg-1)">' + fmtNum(total) + '</text>';
      svg += '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--fg-muted)">requests</text>';
      $("#donut-svg").innerHTML = svg;
      $("#donut-legend").innerHTML = ax.statusClasses.map(s =>
        '<div><i style="background:' + (colors[s.class] || "var(--fg-muted)") + '"></i><span>' + s.class + '</span> <strong>' + fmtNum(s.count) + '</strong> <span class="muted">' + fmtPct(s.share) + '</span></div>'
      ).join("");
    })();

    /* ---------- top messages / sources / endpoints ---------- */
    function renderLeader(rows, getLabel, getCount, getBadges) {
      if (!rows || !rows.length) return '<div class="muted" style="padding:var(--space-md) 0">Nothing to show.</div>';
      const max = Math.max.apply(null, rows.map(getCount));
      return rows.map(r => {
        const cnt = getCount(r);
        const pct = max > 0 ? Math.round((cnt / max) * 100) : 0;
        const badges = getBadges ? getBadges(r) : "";
        return '<div class="leader-row"><div class="lbl" title="' + escAttr(getLabel(r)) + '">' + escHtml(getLabel(r)) + badges + '</div>' +
          '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
          '<div class="cnt">' + fmtNum(cnt) + '</div></div>';
      }).join("");
    }
    (() => {
      const tm = DATA.topMessages || [];
      $("#top-msgs").innerHTML = renderLeader(tm.slice(0, 10), r => r.message, r => r.count);
      const ts = DATA.topSources || [];
      const isPrivate = (DATA.accessExtras?.topIps || []).reduce((acc, ip) => { acc[ip.ip] = ip.isPrivate; return acc; }, {});
      $("#top-src").innerHTML = renderLeader(ts.slice(0, 10), r => r.source, r => r.count, r => {
        const tags = [];
        if (isPrivate[r.source] === true) tags.push('<span class="badge">internal</span>');
        if (r.share != null && r.share > 5) tags.push('<span class="badge warn">' + fmtPct(r.share) + '</span>');
        return tags.join(" ");
      });
      const ax = DATA.accessExtras;
      if (ax && ax.topEndpoints && ax.topEndpoints.length) {
        $("#endpoints-section").hidden = false;
        $("#top-endpoints").innerHTML = renderLeader(ax.topEndpoints.slice(0, 12), r => r.path, r => r.count, r => {
          const tags = [];
          if (r.errorRate > 5) tags.push('<span class="badge err">' + fmtPct(r.errorRate) + ' errors</span>');
          return tags.join(" ");
        });
      }
    })();

    /* ---------- outliers ---------- */
    (() => {
      const outs = DATA.outliers || [];
      const grid = $("#outliers-grid");
      if (!outs.length) {
        grid.innerHTML = '<div class="outlier-card"><div class="kind">heads up</div><div class="label">Stream is small enough that nothing stands out as unusual.</div></div>';
        $("#outliers-meta").textContent = "0 anomalies";
        return;
      }
      grid.innerHTML = outs.map(o =>
        '<div class="outlier-card kind-' + escAttr(o.kind) + '">' +
          '<div class="kind">' + escHtml(o.kind) + '</div>' +
          '<div class="label">' + escHtml(o.label) + '</div>' +
          '<div class="detail">' + escHtml(o.detail) + '</div>' +
          (o.ts ? '<div class="ts">' + escHtml(o.ts) + '</div>' : '') +
        '</div>'
      ).join("");
      $("#outliers-meta").textContent = outs.length + " anomalies";
    })();

    /* ---------- drill-down table ---------- */
    const events = DATA.events || [];
    const isAccess = DATA.format === "access-log";
    const drillBody = $("#tbl-body");
    const drillHead = $("#tbl-head");
    drillHead.innerHTML = isAccess
      ? '<tr><th>ts</th><th>status</th><th>method</th><th>path</th><th>ip</th><th>bytes</th></tr>'
      : '<tr><th>ts</th><th>severity</th><th>category</th><th>source</th><th>message</th></tr>';
    $("#drill-summary-text").textContent = "Browse all " + events.length + " events";
    $("#drill-summary-count").textContent = events.length + " events · click any row to expand fields";
    let filtered = events.slice();
    let renderedCount = 0;
    const PAGE = 200;

    function applyFilters() {
      const q = ($("#drill-search").value || "").trim().toLowerCase();
      filtered = events.filter(e => {
        if (activeSev !== "all" && (e.severity || "info") !== activeSev) return false;
        if (activeCat !== "all" && (e.category || "") !== activeCat) return false;
        if (activeSchemaField && (!e.fields || e.fields[activeSchemaField] == null)) return false;
        if (bucketFilter) {
          const eb = (e.ts || "").replace(" ", "T").slice(0, bucketFilter.length);
          if (eb !== bucketFilter) return false;
        }
        if (q) {
          const hay = (e.message || "") + " " + (e.source || "") + " " + (e.raw || "");
          if (!hay.toLowerCase().includes(q)) return false;
        }
        return true;
      });
      renderedCount = 0;
      drillBody.innerHTML = "";
      renderMore();
    }
    function highlight(s, q) {
      if (!q) return escHtml(s);
      const re = new RegExp("(" + escapeRegex(q) + ")", "ig");
      return escHtml(s).replace(re, "<mark>$1</mark>");
    }
    function renderRow(e, q) {
      const sev = e.severity || "info";
      const fieldsBlock = e.fields ? JSON.stringify(e.fields, null, 2) : (e.raw || "");
      if (isAccess) {
        const f = e.fields || {};
        return '<tr class="row ' + sev + '" data-id="' + escAttr(e.id) + '">' +
          '<td class="col-ts">' + escHtml(e.ts) + '</td>' +
          '<td class="col-sev ' + sev + '">' + escHtml(f.status ?? "") + '</td>' +
          '<td class="col-msg">' + escHtml(f.method ?? "") + '</td>' +
          '<td class="col-msg">' + highlight(f.path ?? "", q) + '</td>' +
          '<td class="col-src">' + highlight(f.ip ?? e.source ?? "", q) + '</td>' +
          '<td class="col-msg">' + escHtml(f.bytes ?? "") + '</td>' +
          '</tr>' +
          '<tr class="expand-row" data-for="' + escAttr(e.id) + '" hidden><td colspan="6"><pre>' + escHtml(fieldsBlock) + (e.raw ? "\n\n— raw —\n" + escHtml(e.raw) : "") + '</pre></td></tr>';
      }
      return '<tr class="row ' + sev + '" data-id="' + escAttr(e.id) + '">' +
        '<td class="col-ts">' + escHtml(e.ts) + '</td>' +
        '<td class="col-sev ' + sev + '">' + escHtml(sev) + '</td>' +
        '<td class="col-src">' + escHtml(e.category || "") + '</td>' +
        '<td class="col-src">' + highlight(e.source || "", q) + '</td>' +
        '<td class="col-msg">' + highlight(e.message || "", q) + '</td>' +
        '</tr>' +
        '<tr class="expand-row" data-for="' + escAttr(e.id) + '" hidden><td colspan="5"><pre>' + escHtml(fieldsBlock) + (e.raw ? "\n\n— raw —\n" + escHtml(e.raw) : "") + '</pre></td></tr>';
    }
    function renderMore() {
      const q = ($("#drill-search").value || "").trim().toLowerCase();
      const slice = filtered.slice(renderedCount, renderedCount + PAGE);
      slice.forEach(e => { drillBody.insertAdjacentHTML("beforeend", renderRow(e, q)); });
      renderedCount += slice.length;
      $("#drill-meta").textContent = (renderedCount + " / " + filtered.length + " shown" + (bucketFilter ? " · bucket " + bucketFilter : "") + (activeSchemaField ? " · field " + activeSchemaField : ""));
      $("#tbl-loadmore").hidden = renderedCount >= filtered.length;
    }
    drillBody.addEventListener("click", e => {
      const row = e.target.closest("tr.row");
      if (!row) return;
      const id = row.getAttribute("data-id");
      const expand = drillBody.querySelector('tr.expand-row[data-for="' + CSS.escape(id) + '"]');
      if (!expand) return;
      expand.hidden = !expand.hidden;
    });
    $("#tbl-loadmore-btn").addEventListener("click", renderMore);
    $("#drill-search").addEventListener("input", applyFilters);
    $("#jump-drill-btn").addEventListener("click", () => {
      document.getElementById("drill").open = true;
      document.getElementById("drill").scrollIntoView({behavior: "smooth", block: "start"});
    });
    applyFilters();

    /* ---------- copy as markdown ---------- */
    function buildMarkdown() {
      const lines = [];
      lines.push("# " + HERO_TITLE);
      lines.push("");
      lines.push(EDITORIAL);
      lines.push("");
      lines.push("- Format: " + (DATA.format || "events"));
      lines.push("- Events: " + DATA.eventCount);
      lines.push("- Window: " + (DATA.timeRange || "—") + " (" + (DATA.durationLabel || "") + ")");
      lines.push("- Error rate: " + fmtPct(DATA.errorRate) + " (" + (DATA.errorCount || 0) + " errors)");
      lines.push("- Sources: " + DATA.sourceCount);
      lines.push("");
      lines.push("## Severity");
      Object.entries(DATA.severityCounts || {}).forEach(([k, v]) => { if (v > 0) lines.push("- " + k + ": " + v); });
      lines.push("");
      if ((DATA.outliers || []).length) {
        lines.push("## Outliers");
        DATA.outliers.forEach(o => lines.push("- **" + o.label + "** — " + o.detail + (o.ts ? " (" + o.ts + ")" : "")));
        lines.push("");
      }
      if ((DATA.topMessages || []).length) {
        lines.push("## Top messages");
        DATA.topMessages.slice(0, 8).forEach(m => lines.push("- " + m.message + " — " + m.count + " (" + fmtPct(m.share) + ")"));
        lines.push("");
      }
      if ((DATA.topSources || []).length) {
        lines.push("## Top sources");
        DATA.topSources.slice(0, 8).forEach(s => lines.push("- " + s.source + " — " + s.count + " (" + fmtPct(s.share) + ")"));
        lines.push("");
      }
      return lines.join("\n");
    }
    $("#copy-md-btn").addEventListener("click", async () => {
      const md = buildMarkdown();
      try { await navigator.clipboard.writeText(md); $("#copy-md-btn").textContent = "Copied!"; setTimeout(() => { $("#copy-md-btn").textContent = "Copy analysis as Markdown"; }, 1500); }
      catch { window.prompt("Copy this Markdown:", md); }
    });
  </script>
</body>
</html>
`

function injectData(html, data) {
  const json = JSON.stringify(data)
  const safe = json.replace(/<\/script/gi, "<\\/script")
  return html.replace(/__DATA__/g, () => safe)
}

function parseArgs(argv) {
  let input = "", out = "", title = "", editorial = ""
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--out" || a === "-o") out = argv[++i]
    else if (a === "--title") title = argv[++i]
    else if (a === "--editorial") editorial = argv[++i]
    else if (!input) input = a
  }
  if (!input || !out) { console.error("usage: render_event_stream_fallback.mjs INPUT --out OUT --title TITLE [--editorial '...']"); process.exit(2) }
  return { input, out, title, editorial }
}

async function main() {
  const { input, out, title, editorial } = parseArgs(process.argv.slice(2))
  const parser = await pickParser(input)
  if (!parser) throw new Error("no parser for " + input)
  const parsed = await parser.parse(input)
  if (parsed.contentType !== "jsonl-events" && parsed.contentType !== "log-events") {
    throw new Error("not an event-stream source: contentType=" + parsed.contentType)
  }
  const docTitle = title || path.basename(path.dirname(input))
  const editorialLine = editorial || parsed.summary
  // Title and editorial inject as plain attribute-safe text; backslash and "
  // are the only risky chars in a JS string literal.
  const safeTitle = docTitle.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")
  const safeEditorial = editorialLine.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, " ")
  let html = TEMPLATE.replace(/__TITLE__/g, () => safeTitle).replace(/__EDITORIAL__/g, () => safeEditorial)
  html = injectData(html, parsed.data)
  await fs.writeFile(out, html)
  console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB, ${parsed.data.events?.length ?? 0} events inlined)`)
}

main().catch(e => { console.error(e); process.exit(1) })

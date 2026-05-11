#!/usr/bin/env node
/**
 * Offline fallback renderer for amazon-orders.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned template
 * that satisfies the prompts/sources/amazon-orders.md contract:
 *
 *   1. Hero summary card (spend / orders / years / top category)
 *   2. Yearly + monthly spend timeline
 *   3. Reorder DNA panel
 *   4. Category breakdown
 *   5. Shipping recipients (when ≥2 distinct)
 *   6. Returns / refunds / cancellations callouts
 *   7. Searchable drill-down table with category / recipient / status chips
 *   8. Privacy footer
 *
 * The page renders the FULL data (the `rows` array is inlined), so the
 * drill-down can grow without re-running the LLM.
 *
 * Usage:
 *   node scripts/render_amazon_orders_fallback.mjs INPUT --out OUT --title TITLE [--editorial "..."]
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
.hero h1{background:var(--gradient-text);-webkit-background-clip:text;background-clip:text;color:transparent;max-width:22ch}
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
.card{background:var(--surface-container-lowest);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:var(--space-xl);box-shadow:var(--shadow-sm)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-xl)}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-xl)}
@media (max-width:980px){.grid-3{grid-template-columns:1fr 1fr}}
@media (max-width:780px){.grid-2{grid-template-columns:1fr}.grid-3{grid-template-columns:1fr}}
/* Timeline */
.timeline-toggle{display:inline-flex;gap:var(--space-xs);border:1px solid var(--border-strong);border-radius:var(--radius-pill);padding:3px}
.timeline-toggle button{padding:6px var(--space-md);border-radius:var(--radius-pill);font-size:13px;color:var(--fg-2)}
.timeline-toggle button.active{background:var(--primary);color:var(--on-primary)}
.bars-svg{width:100%;height:200px;display:block;margin-top:var(--space-md)}
.bars-svg rect.bar{fill:var(--secondary-container);opacity:.7}
.bars-svg rect.bar.peak{fill:var(--primary);opacity:1}
.bars-svg rect.bar:hover{opacity:1}
.bars-svg text{font-family:var(--font-mono);font-size:10.5px;fill:var(--fg-muted)}
.bars-axis{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);margin-top:var(--space-xs)}
.bars-legend{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-md);font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.bars-legend strong{color:var(--fg-1);font-weight:600}
/* Reorder cards */
.reorder-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-md)}
.reorder{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);transition:border-color .15s ease;cursor:pointer}
.reorder:hover{border-color:var(--primary)}
.reorder .title{font-weight:600;font-size:14px;color:var(--fg-1);line-height:1.35;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.reorder .meta-row{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-xs);
  font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.reorder .meta-row b{color:var(--primary);font-weight:600}
.reorder .tag{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-top:var(--space-xs)}
.reorder .tag.subscribe{background:rgba(16,185,129,.15);color:var(--green)}
.reorder .tag.habit{background:rgba(123,64,224,.13);color:var(--secondary-container)}
.reorder .tag.splurge-rebuy{background:rgba(245,158,11,.18);color:#a06200}
.reorder .tag.habit-candidate{background:rgba(123,64,224,.10);color:var(--secondary-container)}
@media (prefers-color-scheme:dark){
  .reorder .tag.splurge-rebuy{background:rgba(245,158,11,.18);color:#fcd34d}
}
/* Categories */
.cat-row{display:grid;grid-template-columns:140px 1fr 96px;gap:var(--space-md);align-items:center;
  padding:var(--space-sm) 0;border-bottom:1px solid var(--border);cursor:pointer}
.cat-row:last-child{border-bottom:none}
.cat-row:hover{background:var(--surface-container-low)}
.cat-row .name{font-size:13.5px;color:var(--fg-1);font-weight:500;display:flex;align-items:center;gap:6px}
.cat-row .name .star{color:var(--fg-muted);font-size:11px;cursor:help}
.cat-row .barwrap{height:8px;background:var(--surface-container);border-radius:var(--radius-pill);overflow:hidden;position:relative}
.cat-row .barwrap i{display:block;height:100%;background:var(--gradient-primary);border-radius:var(--radius-pill)}
.cat-row .stat{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-1);text-align:right;font-variant-numeric:tabular-nums}
.cat-row .stat .sub{display:block;color:var(--fg-muted);font-size:11px;margin-top:1px}
@media (max-width:640px){.cat-row{grid-template-columns:1fr 80px}.cat-row .barwrap{display:none}}
/* Recipients */
.recip{display:flex;justify-content:space-between;align-items:flex-start;
  padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);gap:var(--space-md);cursor:pointer;transition:border-color .15s ease}
.recip:hover{border-color:var(--primary)}
.recip .head .name{font-weight:600;font-size:15px;color:var(--fg-1)}
.recip .head .sub{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);margin-top:2px}
.recip .titles{font-size:12px;color:var(--fg-2);margin-top:var(--space-sm);line-height:1.4}
.recip .stat{font-family:var(--font-headline);font-size:22px;color:var(--primary);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.recip-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-md)}
/* Callouts */
.callouts{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-xl)}
@media (max-width:980px){.callouts{grid-template-columns:1fr}}
.callout{background:var(--surface-container-lowest);border:1px solid var(--border);border-left:3px solid var(--primary);
  border-radius:var(--radius-md);padding:var(--space-lg)}
.callout.refund{border-left-color:var(--secondary-container)}
.callout.cancel{border-left-color:var(--yellow)}
.callout.problem{border-left-color:var(--red)}
.callout .label{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);
  font-family:var(--font-mono);font-weight:500;margin-bottom:var(--space-xs)}
.callout h3{font-size:24px;margin:0 0 var(--space-xs);font-variant-numeric:tabular-nums}
.callout .sub{font-size:13px;color:var(--fg-muted);margin-bottom:var(--space-md)}
.callout .row{display:block;padding:var(--space-sm) 0;border-bottom:1px solid var(--border);font-size:13px;line-height:1.4;cursor:pointer}
.callout .row:last-child{border-bottom:none}
.callout .row:hover{color:var(--primary)}
.callout .row .meta{display:block;font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);margin-top:2px}
.callout .row .amt{font-family:var(--font-mono);font-weight:600;color:var(--fg-1)}
.callout .empty{font-size:13px;color:var(--fg-muted);font-style:italic;padding:var(--space-md) 0}
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
.tbl td.title{max-width:34ch}
.tbl td.title .t{font-weight:500;color:var(--fg-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
.tbl td.title mark{background:var(--primary-fixed);color:var(--fg-1);padding:0 2px;border-radius:2px}
.tbl tr.refund td.amt,.tbl tr.return td.amt{color:var(--red)}
.tbl tr.cancelled{opacity:.65}
.badge{display:inline-block;padding:1px 6px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;margin-left:6px}
.badge.refund{background:rgba(123,64,224,.15);color:var(--secondary-container)}
.badge.return{background:rgba(123,64,224,.10);color:var(--secondary-container)}
.badge.cancelled{background:rgba(245,158,11,.18);color:#a06200}
.badge.problem{background:rgba(239,68,68,.15);color:var(--red)}
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
  .tbl td.title{max-width:18ch}
}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <span class="eyebrow"><span class="mono">AMAZON ORDERS</span> · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial">__EDITORIAL__</p>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy analysis as Markdown</button>
        <button class="btn" id="jump-drill-btn">Jump to all items</button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Order summary">
      <div class="kpi"><div class="label">Total spent</div><div class="value mono accent" id="kpi-spend">$0</div><div class="sub" id="kpi-spend-sub"></div></div>
      <div class="kpi"><div class="label">Orders &amp; items</div><div class="value mono" id="kpi-orders">0</div><div class="sub" id="kpi-orders-sub"></div></div>
      <div class="kpi"><div class="label">Active window</div><div class="value mono" id="kpi-window">—</div><div class="sub" id="kpi-window-sub"></div></div>
      <div class="kpi"><div class="label">Top category</div><div class="value mono" id="kpi-cat">—</div><div class="sub" id="kpi-cat-sub"></div></div>
    </section>

    <section class="section" aria-labelledby="head-spend">
      <div class="section-head">
        <h2 id="head-spend">Spend over time</h2>
        <div class="timeline-toggle" role="tablist">
          <button id="t-year" class="active" role="tab" aria-selected="true">Yearly</button>
          <button id="t-month" role="tab" aria-selected="false">Monthly</button>
        </div>
      </div>
      <div class="card">
        <svg class="bars-svg" id="bars-svg" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="bars-axis" id="bars-axis"></div>
        <div class="bars-legend" id="bars-legend"></div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-reorder">
      <div class="section-head">
        <h2 id="head-reorder" data-default-label="Reorder DNA">Reorder DNA</h2>
        <span class="meta" id="reorder-meta"></span>
      </div>
      <div class="card">
        <div class="reorder-grid" id="reorder-grid"></div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-categories">
      <div class="section-head">
        <h2 id="head-categories">Categories</h2>
        <span class="meta" id="cat-meta"></span>
      </div>
      <div class="card">
        <div id="cat-list"></div>
      </div>
    </section>

    <section class="section" id="recip-section" aria-labelledby="head-recip">
      <div class="section-head">
        <h2 id="head-recip">Shipping recipients</h2>
        <span class="meta" id="recip-meta"></span>
      </div>
      <div class="recip-grid" id="recip-grid"></div>
    </section>

    <section class="section" aria-labelledby="head-flags">
      <div class="section-head">
        <h2 id="head-flags">Returns &amp; refunds</h2>
        <span class="meta">Click a row to filter the drill-down</span>
      </div>
      <div class="callouts">
        <div class="callout refund">
          <div class="label">Returned / refunded</div>
          <h3 id="refund-h">0</h3>
          <div class="sub" id="refund-sub">Items marked Returned or Refunded</div>
          <div id="refund-list"></div>
        </div>
        <div class="callout cancel">
          <div class="label">Cancelled</div>
          <h3 id="cancel-h">0</h3>
          <div class="sub" id="cancel-sub">Orders that never shipped</div>
          <div id="cancel-list"></div>
        </div>
        <div class="callout problem">
          <div class="label">Delivery issues</div>
          <h3 id="problem-h">0</h3>
          <div class="sub" id="problem-sub">Late, lost, or damaged exceptions</div>
          <div id="problem-list"></div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-drill">
      <details class="drill" id="drill" open>
        <summary><span><span id="drill-head">Browse all 0 items</span></span></summary>
        <div class="drill-body">
          <div class="drill-toolbar">
            <input class="drill-search" id="drill-search" type="search" placeholder="Search title, ASIN, order ID, recipient…" aria-label="Search items">
            <span class="drill-meta" id="drill-count">0 of 0</span>
            <button class="btn" id="drill-clear">Clear filters</button>
          </div>
          <div class="chip-row-label">Category</div>
          <div class="chips" id="cat-chips"></div>
          <div class="chip-row-label">Recipient</div>
          <div class="chips" id="recip-chips"></div>
          <div class="chip-row-label">Status</div>
          <div class="chips" id="status-chips"></div>
          <div class="chip-row-label">Year</div>
          <div class="chips" id="year-chips"></div>
          <div style="overflow-x:auto">
            <table class="tbl" id="tbl">
              <thead><tr>
                <th>Date</th><th>Title</th><th>Category</th><th>Recipient</th>
                <th style="text-align:right">Qty</th><th style="text-align:right">Item total</th><th>Status</th>
              </tr></thead>
              <tbody id="tbody"></tbody>
            </table>
          </div>
          <div class="tbl-loadmore" id="loadmore"></div>
        </div>
      </details>
    </section>

    <footer>
      <p>Generated by <a href="https://github.com/clockless-org/html-anything">html-anything</a> from <span id="footer-source" class="mono"></span> (<span id="footer-bytes" class="mono"></span>) using the offline amazon-orders template. This file is fully self-contained and makes no network calls beyond the Google Fonts import shared with every html-anything output.</p>
      <p class="privacy" style="margin-top:var(--space-md)">Generated locally — your Amazon export never left your machine. The full purchase list is embedded in this HTML and rendered offline in your browser. Order IDs are masked in summary views; full IDs appear only when you expand a row. <strong>No product images, ASIN-linked URLs, or Amazon CDNs are fetched at render or click time.</strong> For sharing, prefer an anonymized export.</p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(function(){
  const fmt = new Intl.NumberFormat("en-US")
  const sym = (DATA.summary && DATA.summary.currencySymbol) || "$"
  const summary = DATA.summary || {}
  const rows = DATA.rows || []
  const yearTotals = DATA.yearTotals || []
  const monthTotals = DATA.monthTotals || []
  const categoryTotals = DATA.categoryTotals || []
  const reorders = DATA.reorders || []
  const recipients = DATA.recipients || []
  const rr = DATA.returnsAndRefunds || { returned: [], cancelled: [], problem: [] }

  function money(n){ if (n == null) return "—"; const a = Math.abs(n); const v = a >= 1000 ? fmt.format(Math.round(a)) : a.toFixed(2); return (n < 0 ? "−" : "") + sym + v }
  function pct(x){ return Math.round((x||0) * 100) + "%" }
  function mask(id){ if (!id || id.length < 10) return id || ""; return id.slice(0,4) + "…" + id.slice(-4) }
  function ellipsize(s, n){ if (!s) return ""; return s.length > n ? s.slice(0, n-1) + "…" : s }
  function escapeHtml(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])) }
  function humanBytes(n){ if (!n) return "0 B"; const u = ["B","KB","MB","GB"]; let i=0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ } return n.toFixed(n < 10 && i ? 1 : 0) + " " + u[i] }
  function flagOf(it){ const s = (it.flags && it.flags[0]) || ""; if (s) return s; const st = (it.status||"").toLowerCase(); if (/cancel/.test(st)) return "cancelled"; if (/refund/.test(st)) return "refund"; if (/return/.test(st)) return "return"; if (/lost|damag|delay|exception|problem/.test(st)) return "problem"; return "" }

  document.getElementById("footer-source").textContent = (DATA.meta && DATA.meta.sourceFile) || "input.csv"
  document.getElementById("footer-bytes").textContent = humanBytes((DATA.meta && DATA.meta.sizeBytes) || 0)

  // KPIs
  document.getElementById("kpi-spend").textContent = money(summary.totalSpend)
  document.getElementById("kpi-spend-sub").textContent = "subtotal " + money(summary.totalSubtotal) + " · refunded " + money(summary.refundedAmount)
  document.getElementById("kpi-orders").textContent = fmt.format(summary.orderCount || 0)
  document.getElementById("kpi-orders-sub").textContent = (summary.rowCount || 0) + " items · " + (summary.distinctItemCount || 0) + " distinct"
  document.getElementById("kpi-window").textContent = (summary.durationLabel || "—")
  document.getElementById("kpi-window-sub").textContent = (summary.period || "") + " · " + (summary.activeMonths || 0) + " active months"
  document.getElementById("kpi-cat").textContent = ellipsize(summary.topCategory || "—", 18)
  document.getElementById("kpi-cat-sub").textContent = summary.topCategoryShare ? pct(summary.topCategoryShare) + " of spend · " + (summary.distinctCategories || 0) + " categories total" : "—"

  document.getElementById("hero-editorial").textContent = buildEditorial()

  // Timeline
  let mode = "year"
  function buildBars(series, labelFn){
    const svg = document.getElementById("bars-svg")
    const axis = document.getElementById("bars-axis")
    svg.innerHTML = ""
    axis.innerHTML = ""
    if (!series.length) { svg.innerHTML = '<text x="500" y="110" text-anchor="middle">No data</text>'; return }
    const W = 1000, H = 220, pad = 24, padBottom = 30
    const max = series.reduce((m, s) => s.spend > m ? s.spend : m, 0) || 1
    const peak = series.reduce((m, s) => s.spend > m.spend ? s : m, series[0])
    const bw = (W - pad*2) / series.length
    let svgInner = ""
    series.forEach((s, i) => {
      const h = ((H - pad - padBottom) * s.spend / max) || 0
      const x = pad + i * bw + bw * 0.12
      const y = H - padBottom - h
      const w = bw * 0.76
      const cls = s === peak ? "bar peak" : "bar"
      svgInner += '<rect class="'+cls+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+Math.max(0,h).toFixed(1)+'" rx="3" data-idx="'+i+'"><title>'+escapeHtml(labelFn(s))+': '+money(s.spend)+' · '+s.orders+' orders</title></rect>'
      if (s.spend === peak.spend && s.spend > 0) {
        svgInner += '<text x="'+(x + w/2).toFixed(1)+'" y="'+(y - 6).toFixed(1)+'" text-anchor="middle" fill="var(--primary)">'+money(s.spend)+'</text>'
      }
    })
    svg.innerHTML = svgInner
    // Axis labels (sparse for monthly)
    const step = Math.max(1, Math.ceil(series.length / 12))
    const labels = []
    for (let i = 0; i < series.length; i++) {
      if (i % step === 0 || i === series.length - 1) labels.push(labelFn(series[i]))
      else labels.push("")
    }
    axis.innerHTML = labels.map(l => '<span>'+escapeHtml(l)+'</span>').join("")
    document.getElementById("bars-legend").innerHTML =
      'Peak <strong>'+escapeHtml(labelFn(peak))+'</strong> at <strong>'+money(peak.spend)+'</strong> · ' +
      series.length + ' bins · ' + 'avg <strong>'+money(series.reduce((s,x)=>s+x.spend,0)/series.length)+'</strong>/'+(mode==="year"?"yr":"mo")
  }
  function renderBars(){
    if (mode === "year") buildBars(yearTotals, s => s.year)
    else buildBars(monthTotals, s => s.month)
  }
  document.getElementById("t-year").onclick = () => { mode = "year"; document.getElementById("t-year").classList.add("active"); document.getElementById("t-month").classList.remove("active"); renderBars() }
  document.getElementById("t-month").onclick = () => { mode = "month"; document.getElementById("t-month").classList.add("active"); document.getElementById("t-year").classList.remove("active"); renderBars() }
  renderBars()

  // Reorder DNA
  const reorderHead = document.getElementById("head-reorder")
  if (DATA.reordersKind === "habit-candidate") reorderHead.textContent = "Habit candidates"
  document.getElementById("reorder-meta").textContent = reorders.length
    ? reorders.length + ' tracked items'
    : 'Nothing bought 3+ times'
  const grid = document.getElementById("reorder-grid")
  if (!reorders.length) {
    grid.innerHTML = '<div class="muted" style="padding:var(--space-md)">No items in this file were ordered three or more times.</div>'
  } else {
    grid.innerHTML = reorders.slice(0, 12).map(r => {
      const tag = r.cadenceTag || "habit"
      return '<div class="reorder" data-asin="'+escapeHtml(r.key)+'">'+
        '<div class="title" title="'+escapeHtml(r.title)+'">'+escapeHtml(r.title)+'</div>'+
        '<div class="meta-row"><span><b>×'+r.timesOrdered+'</b> ordered</span>'+
          '<span><b>'+money(r.totalSpend)+'</b> total</span>'+
          '<span>'+escapeHtml(r.cadenceLabel)+'</span></div>'+
        '<div class="meta-row"><span>first '+r.firstSeen+'</span><span>last '+r.lastSeen+'</span></div>'+
        '<span class="tag '+tag+'">'+tag.replace("-"," ")+'</span>'+
      '</div>'
    }).join("")
    grid.querySelectorAll(".reorder").forEach(el => {
      el.addEventListener("click", () => {
        const asin = el.getAttribute("data-asin")
        document.getElementById("drill-search").value = asin
        applyFilters()
        document.getElementById("drill").scrollIntoView({ behavior: "smooth" })
      })
    })
  }

  // Categories
  const catList = document.getElementById("cat-list")
  document.getElementById("cat-meta").textContent = categoryTotals.length + ' categories · ' + (categoryTotals.filter(c=>c.inferred).length ? 'some inferred from titles' : 'all from file')
  const totalForBar = categoryTotals[0] ? categoryTotals[0].spend : 1
  catList.innerHTML = categoryTotals.slice(0, 10).map(c => {
    const w = Math.max(2, (c.spend / totalForBar) * 100).toFixed(1)
    const star = c.inferred ? '<span class="star" title="Category inferred from product title; not present in source export">*</span>' : ''
    return '<div class="cat-row" data-cat="'+escapeHtml(c.category)+'">'+
      '<div class="name">'+escapeHtml(c.category)+star+'</div>'+
      '<div class="barwrap"><i style="width:'+w+'%"></i></div>'+
      '<div class="stat">'+money(c.spend)+'<span class="sub">'+c.items+' items · '+pct(c.share)+'</span></div>'+
    '</div>'
  }).join("")
  catList.querySelectorAll(".cat-row").forEach(el => {
    el.addEventListener("click", () => {
      const cat = el.getAttribute("data-cat")
      toggleChip("cat-chips", cat)
      document.getElementById("drill").scrollIntoView({ behavior: "smooth" })
    })
  })

  // Recipients
  const recipSection = document.getElementById("recip-section")
  if (recipients.length < 2) {
    recipSection.style.display = "none"
  } else {
    document.getElementById("recip-meta").textContent = recipients.length + ' distinct shipping addresses'
    document.getElementById("recip-grid").innerHTML = recipients.map(r =>
      '<div class="recip" data-recip="'+escapeHtml(r.name)+'">'+
        '<div class="head"><div class="name">'+escapeHtml(r.name)+'</div>'+
          '<div class="sub">'+r.items+' items · '+pct(r.share)+' of spend</div>'+
          '<div class="titles">Top: '+r.topItems.map(t => escapeHtml(ellipsize(t.title, 36))).join(" · ")+'</div></div>'+
        '<div class="stat">'+money(r.spend)+'</div>'+
      '</div>'
    ).join("")
    document.querySelectorAll(".recip").forEach(el => {
      el.addEventListener("click", () => {
        toggleChip("recip-chips", el.getAttribute("data-recip"))
        document.getElementById("drill").scrollIntoView({ behavior: "smooth" })
      })
    })
  }

  // Returns / refunds / cancellations / problem
  function fillCallout(idH, idSub, idList, items, sub){
    document.getElementById(idH).textContent = items.length
    document.getElementById(idSub).textContent = sub(items)
    const target = document.getElementById(idList)
    if (!items.length) { target.innerHTML = '<div class="empty">No rows in this file.</div>'; return }
    target.innerHTML = items.slice(0, 6).map(it =>
      '<div class="row" data-id="'+escapeHtml(it.id)+'"><strong>'+escapeHtml(ellipsize(it.title, 60))+'</strong>'+
        '<span class="meta">'+it.date+' · order '+escapeHtml(mask(it.orderId))+' · <span class="amt">'+money(it.amount)+'</span></span></div>'
    ).join("")
    target.querySelectorAll(".row").forEach(el => {
      el.addEventListener("click", () => {
        document.getElementById("drill-search").value = el.getAttribute("data-id").split("_")[1] || ""
        applyFilters()
        document.getElementById("drill").scrollIntoView({ behavior: "smooth" })
      })
    })
  }
  fillCallout("refund-h", "refund-sub", "refund-list", rr.returned, items =>
    items.length ? items.length + ' items · ' + money(items.reduce((s, i) => s + i.amount, 0)) + ' refunded' : 'No returns or refunds in this file.')
  fillCallout("cancel-h", "cancel-sub", "cancel-list", rr.cancelled, items =>
    items.length ? items.length + ' cancellations · ' + money(items.reduce((s, i) => s + i.amount, 0)) + ' would-have-been spend' : 'No cancellations in this file.')
  fillCallout("problem-h", "problem-sub", "problem-list", rr.problem, items =>
    items.length ? items.length + ' delivery exceptions' : 'No delivery problems flagged in this file.')

  // Drill-down
  document.getElementById("drill-head").textContent = "Browse all " + rows.length + " items"
  const PAGE = 80
  let visible = rows.slice()
  let limit = PAGE
  let activeFilters = { categories: new Set(), recipients: new Set(), statuses: new Set(), years: new Set() }
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
    const el = target.querySelector('.chip[data-val="'+value.replace(/"/g,'\\"')+'"]')
    if (el) el.click()
  }
  // Build chip options
  const catCounts = {}, recipCounts = {}, statusCounts = {}, yearCounts = {}
  for (const r of rows) {
    if (r.category) catCounts[r.category] = (catCounts[r.category]||0) + 1
    if (r.recipient) recipCounts[r.recipient] = (recipCounts[r.recipient]||0) + 1
    const f = flagOf(r) || "delivered"
    statusCounts[f] = (statusCounts[f]||0) + 1
    const y = (r.date||"").slice(0,4); if (y) yearCounts[y] = (yearCounts[y]||0) + 1
  }
  function topN(rec, n){ return Object.entries(rec).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([label,count])=>({label,count})) }
  makeChips("cat-chips", topN(catCounts, 10), "categories")
  makeChips("recip-chips", topN(recipCounts, 6), "recipients")
  makeChips("status-chips", topN(statusCounts, 6), "statuses")
  makeChips("year-chips", topN(yearCounts, 8).sort((a,b)=>a.label.localeCompare(b.label)), "years")

  function applyFilters(){
    const q = (document.getElementById("drill-search").value || "").toLowerCase().trim()
    visible = rows.filter(r => {
      if (activeFilters.categories.size && !activeFilters.categories.has(r.category||"")) return false
      if (activeFilters.recipients.size && !activeFilters.recipients.has(r.recipient||"")) return false
      const f = flagOf(r) || "delivered"
      if (activeFilters.statuses.size && !activeFilters.statuses.has(f)) return false
      const y = (r.date||"").slice(0,4)
      if (activeFilters.years.size && !activeFilters.years.has(y)) return false
      if (!q) return true
      return ((r.title||"") + " " + (r.asin||"") + " " + (r.orderId||"") + " " + (r.recipient||"") + " " + (r.category||"") + " " + (r.id||"")).toLowerCase().includes(q)
    })
    limit = PAGE
    renderTable()
  }
  function renderTable(){
    document.getElementById("drill-count").textContent = visible.length + " of " + rows.length
    const tb = document.getElementById("tbody")
    if (!visible.length) { tb.innerHTML = '<tr><td colspan="7" class="empty-state">No items match these filters.</td></tr>'; document.getElementById("loadmore").innerHTML = ""; return }
    const slice = visible.slice(0, limit)
    const q = (document.getElementById("drill-search").value || "").trim()
    function highlight(s){ if (!q) return escapeHtml(s); const i = s.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return escapeHtml(s); return escapeHtml(s.slice(0,i)) + "<mark>" + escapeHtml(s.slice(i, i+q.length)) + "</mark>" + escapeHtml(s.slice(i+q.length)) }
    tb.innerHTML = slice.map(r => {
      const flag = flagOf(r)
      const rowCls = flag ? flag : ""
      const expanded = expandedId === r.id ? "expanded" : ""
      const detail = expandedId === r.id ? renderDetail(r) : ""
      return '<tr class="'+rowCls+' '+expanded+'" data-id="'+escapeHtml(r.id)+'">'+
        '<td class="mono">'+r.date+'</td>'+
        '<td class="title"><span class="t" title="'+escapeHtml(r.title)+'">'+highlight(r.title)+'</span></td>'+
        '<td>'+escapeHtml(r.category||"—")+'</td>'+
        '<td>'+escapeHtml(r.recipient||"—")+'</td>'+
        '<td class="amt">'+r.quantity+'</td>'+
        '<td class="amt">'+money(r.itemTotal)+'</td>'+
        '<td>'+escapeHtml(r.status||"—")+(flag?'<span class="badge '+flag+'">'+flag+'</span>':'')+'</td>'+
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
    activeFilters = { categories: new Set(), recipients: new Set(), statuses: new Set(), years: new Set() }
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
    const peakYear = yearTotals.reduce((m,y)=> y.spend > m.spend ? y : m, yearTotals[0] || { year:"—", spend:0 })
    const top = categoryTotals[0]
    const reorder = reorders[0]
    const parts = []
    parts.push((summary.totalSpend?money(summary.totalSpend):"$0")+" across "+(summary.orderCount||0)+" orders over "+(summary.durationLabel||"this window")+".")
    if (peakYear && peakYear.spend) parts.push((peakYear.year)+" was the biggest year ("+money(peakYear.spend)+", "+peakYear.orders+" orders).")
    if (top) parts.push(top.category+" leads at "+money(top.spend)+" — "+pct(top.share)+" of spend"+(top.inferred?" (category inferred from titles)":"")+".")
    if (reorder) parts.push("\""+ellipsize(reorder.title, 60)+"\" came back ×"+reorder.timesOrdered+" ("+reorder.cadenceLabel+").")
    return parts.join(" ")
  }
  function buildMarkdown(){
    const lines = []
    lines.push("# "+(document.getElementById("hero-title").textContent || "Amazon order history"))
    lines.push("")
    lines.push(buildEditorial())
    lines.push("")
    lines.push("## Headline")
    lines.push("- Total spent: "+money(summary.totalSpend)+" ("+summary.orderCount+" orders, "+summary.rowCount+" items)")
    lines.push("- Window: "+summary.period+" ("+summary.durationLabel+", "+summary.activeMonths+" active months)")
    if (summary.refundedCount) lines.push("- Refunded: "+money(summary.refundedAmount)+" across "+summary.refundedCount+" items")
    if (summary.cancelledCount) lines.push("- Cancelled: "+summary.cancelledCount+" orders")
    lines.push("")
    lines.push("## Top categories")
    for (const c of categoryTotals.slice(0, 8)) {
      lines.push("- "+c.category+" — "+money(c.spend)+" ("+pct(c.share)+", "+c.items+" items"+(c.inferred?", inferred":"")+")")
    }
    lines.push("")
    if (reorders.length) {
      lines.push("## Reorder DNA")
      for (const r of reorders.slice(0, 8)) {
        lines.push("- "+ellipsize(r.title, 70)+" — ×"+r.timesOrdered+" ("+r.cadenceLabel+", "+money(r.totalSpend)+")")
      }
      lines.push("")
    }
    if (recipients.length >= 2) {
      lines.push("## Shipping recipients")
      for (const r of recipients) {
        lines.push("- "+r.name+" — "+money(r.spend)+" ("+r.items+" items, "+pct(r.share)+")")
      }
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
    console.error("Usage: node scripts/render_amazon_orders_fallback.mjs INPUT --out OUT --title TITLE")
    process.exit(1)
  }
  const input = args[0]
  const out = arg(args, "--out") || input.replace(/\.[^.]+$/, ".html")
  const title = arg(args, "--title") || path.basename(input).replace(/\.[^.]+$/, "")
  const editorial = arg(args, "--editorial") || ""

  const parser = await pickParser(input)
  if (!parser) { console.error("No parser matched", input); process.exit(2) }
  const parsed = await parser.parse(input)
  if (parsed.contentType !== "amazon-orders") {
    console.error("Expected amazon-orders, got", parsed.contentType)
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

#!/usr/bin/env node
/**
 * Offline fallback renderer for rideshare-history.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned template
 * that satisfies the `prompts/sources/rideshare-history.md` contract:
 *
 *   1. Source-aware hero card (Uber/Lyft · rides / spend / miles / hours)
 *   2. Privacy banner
 *   3. Spend timeline (monthly twin bars: count + spend)
 *   4. When you ride (weekday × hour heatmap)
 *   5. Top places (pickup + dropoff, masked by default)
 *   6. Cities
 *   7. Trip lengths (distance buckets)
 *   8. Places (offline SVG scatter, only when hasCoordinates)
 *   9. Money (fare / tip / fees / refund split + product breakdown)
 *  10. Flags (cancelled / refund / expensive / long / airport / late-night
 *      cluster / commute-loop / no-fare)
 *  11. Drill-down ride table with chips + privacy-styled labels
 *  12. Privacy + analytical-only footer
 *
 * The page renders the FULL data (the `rows` array is inlined), so the
 * drill-down can grow without re-running the LLM.
 *
 * Usage:
 *   node scripts/render_rideshare_history_fallback.mjs INPUT --out OUT --title TITLE [--editorial "..."]
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
.neg{color:var(--red)}
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
.privacy-banner{display:inline-flex;align-items:center;gap:var(--space-sm);margin-top:var(--space-lg);
  padding:var(--space-sm) var(--space-md);background:var(--surface-container-low);
  border:1px solid var(--border);border-radius:var(--radius-pill);
  font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);max-width:max-content}
.privacy-banner .dot{width:7px;height:7px;border-radius:50%;background:var(--green)}

.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--space-md);margin-top:var(--space-2xl)}
.kpi{background:var(--surface-container-low);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--space-lg)}
.kpi .label{font-size:11.5px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.07em;color:var(--fg-muted)}
.kpi .value{font-family:var(--font-headline);font-size:clamp(22px,3.4vw,30px);font-weight:600;font-variant-numeric:tabular-nums;color:var(--fg-1);margin-top:var(--space-xs)}
.kpi .sub{font-size:12.5px;color:var(--fg-muted);margin-top:var(--space-xs);font-variant-numeric:tabular-nums}

section{margin-top:var(--space-5xl)}
.section-header{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-md);margin-bottom:var(--space-lg);flex-wrap:wrap}
.section-header .meta{font-size:13px;color:var(--fg-muted);font-variant-numeric:tabular-nums}

.card{background:var(--surface-container-low);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--space-2xl)}
.cards-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2xl)}
@media (max-width:780px){.cards-grid-2{grid-template-columns:1fr}}

/* Spend timeline (twin bars) */
.timeline{display:flex;align-items:flex-end;gap:6px;height:240px;padding:var(--space-md) 0;overflow-x:auto}
.timeline .col{display:flex;flex-direction:column;align-items:center;min-width:32px;flex:1}
.timeline .stack{display:flex;align-items:flex-end;gap:3px;height:200px}
.timeline .bar{width:9px;border-radius:3px 3px 0 0;background:var(--primary-fixed-dim)}
.timeline .bar.spend{background:var(--primary)}
.timeline .bar.empty{background:var(--surface-container-high);height:2px;align-self:flex-end}
.timeline .col.peak .bar.spend{background:var(--accent-glow)}
.timeline .label{font-size:10px;font-family:var(--font-mono);color:var(--fg-muted);margin-top:6px;writing-mode:vertical-rl;transform:rotate(180deg)}
.timeline-legend{display:flex;gap:var(--space-md);font-size:12px;color:var(--fg-muted);font-family:var(--font-mono);margin-top:var(--space-sm)}
.timeline-legend .swatch{display:inline-block;width:10px;height:10px;border-radius:2px;vertical-align:middle;margin-right:4px}
.peak-callout{margin-top:var(--space-md);font-size:13px;color:var(--fg-2);font-style:italic}

/* Heatmap */
.heatmap-wrap{overflow-x:auto;padding-bottom:var(--space-sm)}
.heatmap{display:grid;grid-template-columns:36px repeat(24,1fr);gap:3px;min-width:560px}
.heatmap .corner,.heatmap .hour-head{font-size:10px;font-family:var(--font-mono);color:var(--fg-muted);text-align:center}
.heatmap .day-head{font-size:11px;font-family:var(--font-mono);color:var(--fg-muted);display:flex;align-items:center;justify-content:flex-end;padding-right:6px}
.heatmap .cell{aspect-ratio:1/1;border-radius:3px;background:var(--surface-container);border:1px solid var(--border)}
.heatmap .cell.late-band{outline:1px dashed var(--outline-variant);outline-offset:-1px}
.heatmap .cell[data-count]:hover{outline:2px solid var(--primary)}
.heatmap-legend{display:flex;align-items:center;gap:var(--space-sm);margin-top:var(--space-md);font-size:12px;color:var(--fg-muted);font-family:var(--font-mono)}
.heatmap-legend .ramp{display:flex;gap:2px}
.heatmap-legend .ramp span{width:14px;height:10px;border-radius:2px}

/* Place panels */
.place-list{display:flex;flex-direction:column;gap:var(--space-sm)}
.place-row{display:grid;grid-template-columns:1fr auto auto;gap:var(--space-md);align-items:center;padding:var(--space-sm) var(--space-md);background:var(--surface-container);border-radius:var(--radius-md)}
.place-row .place-label{font-size:14px;color:var(--fg-1);font-family:var(--font-mono);overflow-wrap:anywhere}
.place-row .place-count{font-size:12.5px;color:var(--fg-muted);font-variant-numeric:tabular-nums}
.place-row .place-spend{font-size:13px;color:var(--fg-1);font-variant-numeric:tabular-nums;font-weight:500}

/* Bars panel */
.bar-list{display:flex;flex-direction:column;gap:var(--space-sm)}
.bar-row{display:grid;grid-template-columns:140px 1fr 80px;gap:var(--space-md);align-items:center}
.bar-row .lbl{font-size:13px;color:var(--fg-1)}
.bar-row .bar-track{position:relative;height:18px;background:var(--surface-container);border-radius:var(--radius-pill);overflow:hidden}
.bar-row .bar-fill{position:absolute;inset:0 auto 0 0;background:var(--gradient-primary);border-radius:var(--radius-pill)}
.bar-row .val{font-size:12.5px;color:var(--fg-2);font-variant-numeric:tabular-nums;text-align:right}

/* Money breakdown */
.money-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2xl);align-items:start}
@media (max-width:780px){.money-grid{grid-template-columns:1fr}}
.money-stack{display:flex;height:32px;border-radius:var(--radius-pill);overflow:hidden;background:var(--surface-container)}
.money-stack > div{height:100%}
.money-legend{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);margin-top:var(--space-md);font-size:13px}
.money-legend .item{display:flex;align-items:center;gap:var(--space-sm)}
.money-legend .swatch{width:12px;height:12px;border-radius:3px}

/* SVG places scatter */
.places-svg-wrap{background:var(--surface-container);border-radius:var(--radius-lg);padding:var(--space-md);overflow:hidden}
.places-svg{width:100%;height:auto;display:block}
.places-svg .grid{stroke:var(--border);stroke-width:.5;fill:none}
.places-svg .pickup{fill:var(--primary);opacity:.85}
.places-svg .dropoff{fill:var(--tertiary);opacity:.75}
.places-toggle{margin-top:var(--space-md);display:flex;gap:var(--space-md);align-items:center;font-size:13px;color:var(--fg-muted)}

/* Flags */
.flag-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-md)}
.flag-card{background:var(--surface-container);border:1px solid var(--border);border-left:3px solid var(--yellow);border-radius:var(--radius-md);padding:var(--space-lg)}
.flag-card.cancelled{border-left-color:var(--fg-muted)}
.flag-card.refund{border-left-color:var(--green)}
.flag-card.expensive-outlier{border-left-color:var(--red)}
.flag-card.long-trip{border-left-color:var(--blue)}
.flag-card.airport-run{border-left-color:var(--accent-glow)}
.flag-card.late-night-cluster{border-left-color:var(--secondary-container)}
.flag-card.commute-loop{border-left-color:var(--primary)}
.flag-card.no-fare{border-left-color:var(--yellow)}
.flag-card .label{font-size:14px;font-weight:600;color:var(--fg-1);margin-bottom:var(--space-xs)}
.flag-card .detail{font-size:12.5px;color:var(--fg-2)}
.flag-card .kind{display:inline-block;font-size:10px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.07em;color:var(--fg-muted);margin-bottom:var(--space-sm)}

/* Chips & filters */
.filter-bar{display:flex;flex-direction:column;gap:var(--space-md);margin-bottom:var(--space-lg)}
.chip-row{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center}
.chip-row .lbl{font-size:11px;font-family:var(--font-mono);text-transform:uppercase;color:var(--fg-muted);letter-spacing:.07em;margin-right:var(--space-xs)}
.chip{display:inline-flex;align-items:center;gap:var(--space-xs);padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius-pill);
  background:var(--surface-container-low);color:var(--fg-2);font-size:12.5px;cursor:pointer;font-family:var(--font-mono)}
.chip:hover{border-color:var(--border-strong)}
.chip.active{background:var(--primary);color:var(--on-primary);border-color:transparent}
.chip.stamp{background:var(--surface-container-high);color:var(--primary);font-weight:600;letter-spacing:.1em;cursor:default}

.search-row{display:flex;gap:var(--space-md);align-items:center}
.search-row input{flex:1;padding:var(--space-sm) var(--space-md);background:var(--surface-container-low);border:1px solid var(--border);
  border-radius:var(--radius-md);font-size:14px}

/* Drill-down table */
.table-wrap{overflow-x:auto;background:var(--surface-container-low);border:1px solid var(--border);border-radius:var(--radius-lg)}
table.rides{width:100%;border-collapse:collapse;font-size:13px}
table.rides th{text-align:left;font-family:var(--font-mono);font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-muted);
  padding:var(--space-sm) var(--space-md);border-bottom:1px solid var(--border);background:var(--surface-container);font-weight:500;position:sticky;top:0}
table.rides td{padding:var(--space-sm) var(--space-md);border-bottom:1px solid var(--border);vertical-align:top;font-variant-numeric:tabular-nums}
table.rides tr:hover{background:var(--surface-container)}
table.rides td.product .chip{font-size:10.5px;padding:2px 8px}
table.rides td.amount{text-align:right;white-space:nowrap}
table.rides td.label{font-family:var(--font-mono);max-width:230px;overflow-wrap:anywhere}
table.rides .row-flag{display:inline-block;font-size:9.5px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.07em;
  padding:1px 6px;border-radius:var(--radius-pill);margin-right:4px;background:var(--surface-container-high);color:var(--fg-muted)}
table.rides .row-flag.airport-run{background:var(--accent-glow);color:#fff}
table.rides .row-flag.late-night{background:var(--secondary-container);color:#fff}
table.rides .row-flag.commute-loop{background:var(--primary);color:#fff}
table.rides .row-flag.cancelled{background:var(--fg-muted);color:#fff}
table.rides .row-flag.refund{background:var(--green);color:#fff}
table.rides .row-flag.expensive-outlier{background:var(--red);color:#fff}
table.rides .row-flag.long-trip{background:var(--blue);color:#fff}
table.rides .row-flag.no-fare{background:var(--yellow);color:#000}
table.rides tr.expanded .raw{display:block}
table.rides .raw{display:none;padding:var(--space-md);background:var(--surface-container);font-family:var(--font-mono);font-size:11.5px;
  white-space:pre-wrap;border-radius:var(--radius-md);margin-top:var(--space-sm);overflow-x:auto}
table.rides .raw .field{display:grid;grid-template-columns:200px 1fr;gap:var(--space-md);padding:2px 0}
table.rides .raw .key{color:var(--fg-muted)}
.row-toggle{font-size:11px;color:var(--primary);font-family:var(--font-mono);cursor:pointer;text-decoration:underline;margin-left:8px}
.label-mask{cursor:pointer}
.label-mask:hover{color:var(--primary)}

.btn{display:inline-flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) var(--space-md);
  background:var(--surface-container-low);border:1px solid var(--border);border-radius:var(--radius-md);
  color:var(--fg-1);font-size:13px;cursor:pointer}
.btn.primary{background:var(--primary);color:var(--on-primary);border-color:transparent}
.btn:hover{border-color:var(--border-strong)}

.toggle{display:inline-flex;align-items:center;gap:var(--space-sm);font-size:12.5px;color:var(--fg-muted);cursor:pointer}
.toggle input[type=checkbox]{accent-color:var(--primary)}

.copy-area{display:flex;justify-content:flex-end;margin-top:var(--space-2xl)}
footer{margin-top:var(--space-5xl);padding-top:var(--space-2xl);border-top:1px solid var(--border);font-size:12.5px;color:var(--fg-muted);max-width:64ch;line-height:1.65}
footer p + p{margin-top:var(--space-md)}
.disclaimer{font-style:italic}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <span class="eyebrow"><span id="src-stamp">UBER</span> · ride history</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial">__EDITORIAL__</p>
      <p class="source-caption" id="src-caption"></p>
      <div class="privacy-banner"><span class="dot"></span>This page never sent a network request. Addresses and coordinates are masked by default.</div>
      <div class="kpi-grid" id="kpi-grid"></div>
    </header>

    <section id="timeline-section">
      <div class="section-header"><h2>Spend timeline</h2><span class="meta" id="timeline-meta"></span></div>
      <div class="card">
        <div class="timeline" id="timeline"></div>
        <div class="timeline-legend">
          <span><span class="swatch" style="background:var(--primary-fixed-dim)"></span>Rides</span>
          <span><span class="swatch" style="background:var(--primary)"></span>Spend</span>
        </div>
        <p class="peak-callout muted" id="peak-callout"></p>
      </div>
    </section>

    <section id="heatmap-section">
      <div class="section-header"><h2>When you ride</h2><span class="meta" id="heatmap-meta"></span></div>
      <div class="card">
        <div class="heatmap-wrap"><div class="heatmap" id="heatmap"></div></div>
        <div class="heatmap-legend">
          <span>Less</span>
          <div class="ramp" id="heat-ramp"></div>
          <span>More</span>
          <span class="muted" style="margin-left:auto">Late-night band: Fri / Sat / Sun · 22:00–04:00</span>
        </div>
      </div>
    </section>

    <section id="places-section">
      <div class="section-header"><h2>Top places</h2><span class="meta">Pickup vs dropoff · masked by default</span></div>
      <div class="cards-grid-2">
        <div class="card">
          <h3>Pickups</h3>
          <div class="place-list" id="pickup-list"></div>
        </div>
        <div class="card">
          <h3>Dropoffs</h3>
          <div class="place-list" id="dropoff-list"></div>
        </div>
      </div>
    </section>

    <section id="cities-section">
      <div class="section-header"><h2>Cities</h2><span class="meta" id="cities-meta"></span></div>
      <div class="card"><div class="bar-list" id="cities-list"></div></div>
    </section>

    <section id="trip-lengths">
      <div class="section-header"><h2>Trip lengths</h2><span class="meta">Distance distribution</span></div>
      <div class="card"><div class="bar-list" id="distance-list"></div></div>
    </section>

    <section id="geo-section">
      <div class="section-header"><h2>Places</h2><span class="meta" id="geo-meta">Offline SVG · no map tiles, no geocoding</span></div>
      <div class="card">
        <div class="places-svg-wrap" id="places-svg-wrap"></div>
        <div class="places-toggle">
          <label class="toggle"><input type="checkbox" id="show-coords"> Show coordinates (rounded to 0.01°)</label>
          <span style="margin-left:auto;font-size:12px" class="muted"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--primary);vertical-align:middle;margin-right:4px"></span>Pickup
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--tertiary);margin-left:8px;vertical-align:middle;margin-right:4px"></span>Dropoff</span>
        </div>
      </div>
    </section>

    <section id="money-section">
      <div class="section-header"><h2>Money</h2><span class="meta" id="money-meta"></span></div>
      <div class="card">
        <div class="money-grid">
          <div>
            <h3>Spend split</h3>
            <div class="money-stack" id="money-stack"></div>
            <div class="money-legend" id="money-legend"></div>
          </div>
          <div>
            <h3>Product types</h3>
            <div class="bar-list" id="product-list"></div>
          </div>
        </div>
      </div>
    </section>

    <section id="flags-section">
      <div class="section-header"><h2>Flags</h2><span class="meta">Heuristic — review before acting on anything here</span></div>
      <div class="flag-grid" id="flag-grid"></div>
    </section>

    <section id="rides-section">
      <div class="section-header"><h2 id="rides-title">Browse all rides</h2>
        <label class="toggle"><input type="checkbox" id="show-labels"> Show full pickup / dropoff labels</label>
      </div>
      <div class="card">
        <div class="filter-bar">
          <div class="chip-row" id="filter-source"><span class="lbl">Source</span></div>
          <div class="chip-row" id="filter-product"><span class="lbl">Product</span></div>
          <div class="chip-row" id="filter-city"><span class="lbl">City</span></div>
          <div class="chip-row" id="filter-status"><span class="lbl">Status</span></div>
          <div class="chip-row" id="filter-year"><span class="lbl">Year</span></div>
          <div class="chip-row" id="filter-flag"><span class="lbl">Flags</span></div>
          <div class="search-row"><input id="search" type="search" placeholder="Search pickup, dropoff, product, city, status, id..."></div>
        </div>
        <div class="table-wrap">
          <table class="rides">
            <thead><tr>
              <th>Date</th><th>Time</th><th>Day</th><th>Product</th>
              <th>Pickup</th><th>Dropoff</th>
              <th class="amount">Miles</th><th class="amount">Min</th>
              <th class="amount">Fare</th><th class="amount">Tip</th><th class="amount">Total</th>
            </tr></thead>
            <tbody id="rides-tbody"></tbody>
          </table>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--space-md);font-size:12.5px;color:var(--fg-muted)" class="mono">
          <span id="row-count"></span>
          <button class="btn" id="load-more">Load more</button>
        </div>
      </div>
    </section>

    <div class="copy-area"><button class="btn primary" id="copy-md">Copy as Markdown</button></div>

    <footer>
      <p>Generated locally — your Uber / Lyft export never left your machine. The full ride list is embedded in this HTML and rendered offline in your browser. Pickup / dropoff addresses and coordinates are inlined as-is from the file you opened. For sharing, prefer an anonymized export.</p>
      <p class="disclaimer">Analytical summary, not tax, accounting, or insurance advice. Airport runs, commute loops, and late-night clusters are inferred from your trip labels and timestamps — verify against your records before acting on anything here.</p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(() => {
  const $ = (id) => document.getElementById(id);
  const fmtMoney = (n) => (DATA.summary.currencySymbol || "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtMoneyShort = (n) => (DATA.summary.currencySymbol || "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtNum = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const SOURCE_LABEL = DATA.source === "uber" ? "Uber" : "Lyft";
  const SOURCE_STAMP = DATA.source.toUpperCase();

  // ---- Hero ----
  $("src-stamp").textContent = SOURCE_STAMP;
  $("src-caption").textContent = DATA.source === "uber"
    ? "This is your Uber trip history export. Each row is a requested ride — completed, cancelled, or refunded. Addresses and coordinates are masked by default."
    : "This is your Lyft ride history export. Each row is a requested ride. Addresses and coordinates are masked by default.";

  const kpis = [
    { label: "Rides", value: fmtNum(DATA.summary.rideCount), sub: DATA.summary.cancelledCount + " cancelled · " + DATA.summary.refundCount + " refunded" },
    { label: "Spend", value: fmtMoneyShort(DATA.summary.totalSpend), sub: "avg " + fmtMoney(DATA.summary.avgFare) + " / ride" },
    { label: "Miles", value: fmtNum(DATA.summary.totalMiles), sub: "avg " + DATA.summary.avgMiles.toFixed(1) + " mi / ride" },
    { label: "Hours in cars", value: fmtNum(DATA.summary.totalHours), sub: "avg " + DATA.summary.avgDurationMin.toFixed(0) + " min / ride" },
    { label: "Period", value: DATA.summary.durationLabel, sub: DATA.summary.period.replace(" → ", " → ") },
    { label: "Late-night", value: DATA.summary.lateNightShare.toFixed(1) + "%", sub: "10pm–4am of all rides" },
    { label: "Airport rides", value: DATA.summary.airportShare.toFixed(1) + "%", sub: "label heuristic" },
    { label: "Top product", value: DATA.summary.topProduct, sub: "most-used vehicle type" },
  ];
  const kpiHost = $("kpi-grid");
  for (const k of kpis) {
    const el = document.createElement("div");
    el.className = "kpi";
    el.innerHTML = '<div class="label">' + k.label + '</div><div class="value">' + k.value + '</div><div class="sub">' + k.sub + '</div>';
    kpiHost.appendChild(el);
  }

  // ---- Timeline ----
  const months = DATA.monthly;
  $("timeline-meta").textContent = months.length + " months · " + fmtMoney(DATA.summary.totalSpend) + " total spend";
  if (months.length) {
    const maxCount = Math.max(...months.map(m => m.count), 1);
    const maxSpend = Math.max(...months.map(m => m.spend), 1);
    const peakSpend = months.reduce((a, b) => b.spend > a.spend ? b : a, months[0]);
    const peakCount = months.reduce((a, b) => b.count > a.count ? b : a, months[0]);
    const tl = $("timeline");
    months.forEach(m => {
      const col = document.createElement("div");
      col.className = "col" + (m.month === peakSpend.month ? " peak" : "");
      const stack = document.createElement("div");
      stack.className = "stack";
      const cBar = document.createElement("div");
      cBar.className = "bar" + (m.count === 0 ? " empty" : "");
      cBar.style.height = m.count > 0 ? Math.max(2, (m.count / maxCount) * 200) + "px" : "2px";
      cBar.title = m.month + " · " + m.count + " rides";
      const sBar = document.createElement("div");
      sBar.className = "bar spend" + (m.spend === 0 ? " empty" : "");
      sBar.style.height = m.spend > 0 ? Math.max(2, (m.spend / maxSpend) * 200) + "px" : "2px";
      sBar.title = m.month + " · " + fmtMoney(m.spend);
      stack.appendChild(cBar); stack.appendChild(sBar);
      const lbl = document.createElement("div");
      lbl.className = "label";
      lbl.textContent = m.month;
      col.appendChild(stack); col.appendChild(lbl);
      tl.appendChild(col);
    });
    $("peak-callout").textContent = "Biggest spend month: " + peakSpend.month + " (" + fmtMoney(peakSpend.spend) + ", " + peakSpend.count + " rides). Most rides: " + peakCount.month + " (" + peakCount.count + " rides).";
  }

  // ---- Heatmap ----
  const cells = DATA.heatmap;
  $("heatmap-meta").textContent = "Busiest weekday: " + DATA.summary.busiestWeekday + " · busiest month: " + DATA.summary.busiestMonth;
  const heat = $("heatmap");
  const corner = document.createElement("div"); corner.className = "corner"; heat.appendChild(corner);
  for (let h = 0; h < 24; h++) { const t = document.createElement("div"); t.className = "hour-head"; t.textContent = String(h).padStart(2,"0"); heat.appendChild(t); }
  const maxC = Math.max(1, ...cells.map(c => c.count));
  for (let w = 0; w < 7; w++) {
    const dh = document.createElement("div"); dh.className = "day-head"; dh.textContent = WEEKDAYS[w]; heat.appendChild(dh);
    for (let h = 0; h < 24; h++) {
      const c = cells[w * 24 + h];
      const cell = document.createElement("div");
      cell.className = "cell";
      if ((w === 5 || w === 6 || w === 0) && (h >= 22 || h < 4)) cell.classList.add("late-band");
      if (c.count > 0) {
        const t = c.count / maxC;
        cell.style.background = "color-mix(in oklab, var(--primary) " + Math.max(8, Math.round(t * 92)) + "%, var(--surface-container))";
        cell.dataset.count = c.count;
        cell.title = WEEKDAYS[w] + " · " + String(h).padStart(2,"0") + ":00 — " + c.count + " ride" + (c.count === 1 ? "" : "s");
      } else {
        cell.title = WEEKDAYS[w] + " · " + String(h).padStart(2,"0") + ":00 — no rides";
      }
      heat.appendChild(cell);
    }
  }
  const ramp = $("heat-ramp");
  for (let i = 1; i <= 6; i++) {
    const sw = document.createElement("span");
    sw.style.background = "color-mix(in oklab, var(--primary) " + (i * 14) + "%, var(--surface-container))";
    ramp.appendChild(sw);
  }

  // ---- Places (top pickups + dropoffs) ----
  const renderPlaceList = (host, places) => {
    host.innerHTML = "";
    places.slice(0, 8).forEach(p => {
      const row = document.createElement("div");
      row.className = "place-row";
      const lbl = document.createElement("div");
      lbl.className = "place-label label-mask";
      lbl.dataset.full = p.label;
      lbl.textContent = maskLabel(p.label);
      lbl.title = "Click to reveal";
      lbl.addEventListener("click", () => { lbl.textContent = lbl.dataset.full; });
      const cnt = document.createElement("div"); cnt.className = "place-count"; cnt.textContent = p.count + "×";
      const spd = document.createElement("div"); spd.className = "place-spend"; spd.textContent = fmtMoney(p.spend);
      row.appendChild(lbl); row.appendChild(cnt); row.appendChild(spd);
      host.appendChild(row);
    });
  };
  function maskLabel(label) {
    if (!label) return "—";
    if (label.length <= 8) return label[0] + "…" + label[label.length - 1];
    return label.slice(0, 3) + "…" + label.slice(-3);
  }
  renderPlaceList($("pickup-list"), DATA.pickupPlaces);
  renderPlaceList($("dropoff-list"), DATA.dropoffPlaces);

  // ---- Cities ----
  const cityHost = $("cities-list");
  $("cities-meta").textContent = DATA.cities.length + " cities · busiest " + DATA.summary.busiestCity;
  if (DATA.cities.length) {
    const maxC = Math.max(...DATA.cities.map(c => c.count));
    DATA.cities.slice(0, 6).forEach(c => {
      const row = document.createElement("div"); row.className = "bar-row";
      const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = c.city;
      const tr = document.createElement("div"); tr.className = "bar-track";
      const fill = document.createElement("div"); fill.className = "bar-fill"; fill.style.width = (c.count / maxC * 100) + "%";
      tr.appendChild(fill);
      const val = document.createElement("div"); val.className = "val"; val.textContent = c.count + "× · " + fmtMoney(c.spend);
      row.appendChild(lbl); row.appendChild(tr); row.appendChild(val);
      cityHost.appendChild(row);
    });
  } else {
    cityHost.innerHTML = '<div class="muted">No city info in this file.</div>';
  }

  // ---- Distance buckets ----
  const distHost = $("distance-list");
  const maxBucket = Math.max(...DATA.distanceBuckets.map(b => b.count), 1);
  DATA.distanceBuckets.forEach(b => {
    const row = document.createElement("div"); row.className = "bar-row";
    const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = b.label;
    const tr = document.createElement("div"); tr.className = "bar-track";
    const fill = document.createElement("div"); fill.className = "bar-fill"; fill.style.width = (b.count / maxBucket * 100) + "%";
    tr.appendChild(fill);
    const val = document.createElement("div"); val.className = "val"; val.textContent = b.count + " (" + b.share.toFixed(1) + "%)";
    row.appendChild(lbl); row.appendChild(tr); row.appendChild(val);
    distHost.appendChild(row);
  });

  // ---- Places SVG scatter ----
  const geo = DATA.geo;
  const geoWrap = $("places-svg-wrap");
  if (geo.hasCoordinates && geo.points.length) {
    const w = geo.viewBox.width, h = geo.viewBox.height;
    let svg = '<svg class="places-svg" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">';
    // graticule
    for (let i = 1; i < 5; i++) svg += '<line class="grid" x1="0" y1="' + (h * i / 5).toFixed(1) + '" x2="' + w + '" y2="' + (h * i / 5).toFixed(1) + '"/>';
    for (let i = 1; i < 8; i++) svg += '<line class="grid" x1="' + (w * i / 8).toFixed(1) + '" y1="0" x2="' + (w * i / 8).toFixed(1) + '" y2="' + h + '"/>';
    geo.points.forEach(p => {
      const r = Math.min(18, 4 + Math.log2(p.count + 1) * 2.5);
      svg += '<circle class="' + p.kind + '" cx="' + p.x + '" cy="' + p.y + '" r="' + r.toFixed(1) + '"></circle>';
    });
    svg += '</svg>';
    geoWrap.innerHTML = svg;
    $("geo-meta").textContent = geo.pointCount + " coordinate points · " + geo.points.length + " unique cells (no map tiles, no geocoding)";
  } else {
    geoWrap.innerHTML = '<div class="muted">No coordinates in this file. Showing places by label only.</div>';
    $("geo-meta").textContent = "Coordinates not in this file";
  }
  $("show-coords").addEventListener("change", (e) => {
    document.querySelectorAll(".places-svg circle").forEach((c, i) => {
      const p = geo.points[i];
      if (!p) return;
      c.title = e.target.checked ? (p.kind + " · " + (p.count > 1 ? p.count + "× · " : "") + "lat " + (p.y).toFixed(0) + " · lng " + (p.x).toFixed(0)) : "";
    });
  });

  // ---- Money ----
  const m = DATA.money;
  $("money-meta").textContent = "Total " + fmtMoney(m.total) + " · refund " + fmtMoney(m.refund);
  const stack = $("money-stack");
  const totalStack = m.fare + m.tip + m.fee;
  const segs = [
    { k: "Fare", v: m.fare, c: "var(--primary)" },
    { k: "Tip", v: m.tip, c: "var(--primary-fixed-dim)" },
    { k: "Fees / surcharges", v: m.fee, c: "var(--secondary-container)" },
  ];
  segs.forEach(s => {
    if (s.v <= 0) return;
    const seg = document.createElement("div");
    seg.style.width = (s.v / Math.max(1, totalStack) * 100) + "%";
    seg.style.background = s.c;
    seg.title = s.k + ": " + fmtMoney(s.v);
    stack.appendChild(seg);
  });
  const legend = $("money-legend");
  segs.concat([{ k: "Refund (absolute)", v: m.refund, c: "var(--green)" }]).forEach(s => {
    const item = document.createElement("div"); item.className = "item";
    const sw = document.createElement("div"); sw.className = "swatch"; sw.style.background = s.c;
    item.appendChild(sw);
    const lbl = document.createElement("span"); lbl.innerHTML = '<strong>' + fmtMoney(s.v) + '</strong> ' + s.k;
    item.appendChild(lbl);
    legend.appendChild(item);
  });
  const productHost = $("product-list");
  const products = m.byProduct.slice(0, 6);
  if (products.length) {
    const maxProd = Math.max(...products.map(p => p.count));
    products.forEach(p => {
      const row = document.createElement("div"); row.className = "bar-row";
      const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = p.product;
      const tr = document.createElement("div"); tr.className = "bar-track";
      const fill = document.createElement("div"); fill.className = "bar-fill"; fill.style.width = (p.count / maxProd * 100) + "%";
      tr.appendChild(fill);
      const val = document.createElement("div"); val.className = "val"; val.textContent = p.count + "× · " + fmtMoney(p.spend);
      row.appendChild(lbl); row.appendChild(tr); row.appendChild(val);
      productHost.appendChild(row);
    });
  } else {
    productHost.innerHTML = '<div class="muted">No product types detected.</div>';
  }

  // ---- Flags ----
  const flagHost = $("flag-grid");
  if (DATA.flags.length) {
    DATA.flags.forEach(f => {
      const card = document.createElement("div"); card.className = "flag-card " + f.kind;
      card.innerHTML = '<div class="kind">' + f.kind.replace(/-/g, " ") + '</div><div class="label">' + f.label + '</div><div class="detail">' + f.detail + '</div>';
      flagHost.appendChild(card);
    });
  } else {
    flagHost.innerHTML = '<div class="muted">Nothing flagged in this file.</div>';
  }

  // ---- Filters + drill-down ----
  const rows = DATA.rows;
  $("rides-title").textContent = "Browse all " + rows.length + " rides";
  const state = { source: SOURCE_STAMP, product: "ALL", city: "ALL", status: "ALL", year: "ALL", flag: "ALL", search: "", limit: 100 };

  function chipRow(host, label, values, key, allLabel = "All") {
    host.innerHTML = '<span class="lbl">' + label + '</span>';
    const all = document.createElement("button"); all.className = "chip active"; all.textContent = allLabel; all.dataset.value = "ALL";
    all.addEventListener("click", () => { state[key] = "ALL"; state.limit = 100; renderChips(); render(); });
    host.appendChild(all);
    values.forEach(v => {
      const c = document.createElement("button"); c.className = "chip"; c.textContent = v; c.dataset.value = v;
      c.addEventListener("click", () => { state[key] = v; state.limit = 100; renderChips(); render(); });
      host.appendChild(c);
    });
  }

  // Source chip is a stamp.
  const srcHost = $("filter-source");
  srcHost.innerHTML = '<span class="lbl">Source</span><span class="chip stamp">' + SOURCE_STAMP + '</span>';

  const productValues = uniqueTop(rows.map(r => r.productType), 8);
  const cityValues = uniqueTop(rows.map(r => r.city).filter(Boolean), 6);
  const statusValues = ["completed", "cancelled", "refunded"];
  const yearValues = Array.from(new Set(rows.map(r => r.date.slice(0, 4)).filter(Boolean))).sort();
  const flagValues = ["airport-run", "late-night", "commute-loop", "expensive-outlier", "long-trip", "cancelled", "refund"];

  chipRow($("filter-product"), "Product", productValues, "product");
  chipRow($("filter-city"), "City", cityValues, "city");
  chipRow($("filter-status"), "Status", statusValues, "status");
  chipRow($("filter-year"), "Year", yearValues, "year");
  chipRow($("filter-flag"), "Flags", flagValues, "flag");

  function uniqueTop(arr, n) {
    const counts = new Map();
    arr.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  }

  function renderChips() {
    document.querySelectorAll(".chip-row").forEach(row => {
      const key = row.id.replace("filter-", "");
      const stateKey = key === "source" ? "source" : key;
      row.querySelectorAll(".chip").forEach(c => {
        if (c.classList.contains("stamp")) return;
        c.classList.toggle("active", (c.dataset.value === state[stateKey]) || (state[stateKey] === "ALL" && c.dataset.value === "ALL"));
      });
    });
  }

  $("search").addEventListener("input", (e) => { state.search = e.target.value.toLowerCase(); state.limit = 100; render(); });
  $("show-labels").addEventListener("change", () => render());
  $("load-more").addEventListener("click", () => { state.limit += 200; render(); });

  function rideMatches(r) {
    if (state.product !== "ALL" && r.productType !== state.product) return false;
    if (state.city !== "ALL" && r.city !== state.city) return false;
    if (state.status !== "ALL") {
      if (state.status === "cancelled" && !/cancel|no_show|no-show/.test(r.status)) return false;
      if (state.status === "completed" && !/^complete/.test(r.status)) return false;
      if (state.status === "refunded" && !/refund|reversal/.test(r.status)) return false;
    }
    if (state.year !== "ALL" && r.date.slice(0, 4) !== state.year) return false;
    if (state.flag !== "ALL" && !r.flags.includes(state.flag)) return false;
    if (state.search) {
      const hay = [r.pickupLabel, r.dropoffLabel, r.productType, r.city, r.status, r.id].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(state.search)) return false;
    }
    return true;
  }

  function renderLabel(label, showFull) {
    if (!label) return '<span class="muted">—</span>';
    if (showFull) return escapeHtml(label);
    return '<span class="label-mask" title="Click to reveal">' + escapeHtml(maskLabel(label)) + '</span>';
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function render() {
    const showFull = $("show-labels").checked;
    const filtered = rows.filter(rideMatches);
    const tbody = $("rides-tbody");
    tbody.innerHTML = "";
    const slice = filtered.slice(0, state.limit);
    for (const r of slice) {
      const tr = document.createElement("tr");
      const time = r.dateEpoch ? new Date(r.dateEpoch).toISOString().slice(11, 16) : "—";
      const dayShort = r.dateEpoch ? WEEKDAYS[r.weekday] : "—";
      const totalCls = r.total < 0 ? "amount neg" : "amount";
      const totalTxt = r.total < 0 ? "−" + fmtMoney(r.total) : fmtMoney(r.total);
      const flagBadges = r.flags.map(f => '<span class="row-flag ' + f + '">' + f.replace(/-/g, " ") + '</span>').join("");
      tr.innerHTML =
        '<td>' + r.date + '</td>' +
        '<td class="num">' + time + '</td>' +
        '<td>' + dayShort + '</td>' +
        '<td class="product"><span class="chip">' + escapeHtml(r.productType) + '</span></td>' +
        '<td class="label">' + flagBadges + renderLabel(r.pickupLabel, showFull) + '</td>' +
        '<td class="label">' + renderLabel(r.dropoffLabel, showFull) + '</td>' +
        '<td class="amount">' + r.distanceMiles.toFixed(1) + '</td>' +
        '<td class="amount">' + r.durationMin.toFixed(0) + '</td>' +
        '<td class="amount">' + fmtMoney(r.fare) + '</td>' +
        '<td class="amount">' + (r.tip > 0 ? fmtMoney(r.tip) : '—') + '</td>' +
        '<td class="' + totalCls + '">' + totalTxt + ' <span class="row-toggle">▾</span></td>';
      tr.querySelector(".row-toggle").addEventListener("click", () => {
        if (tr.classList.contains("expanded")) { tr.classList.remove("expanded"); rawTr.remove(); return; }
        tr.classList.add("expanded");
        const rawTr = document.createElement("tr");
        rawTr.dataset.raw = "1";
        rawTr.innerHTML = '<td colspan="11"><div class="raw"><div class="field"><span class="key">id</span><span>' + escapeHtml(r.id) + '</span></div>' +
          (r.pickupLat != null ? '<div class="field"><span class="key">pickup lat / lng (coarse)</span><span>' + r.pickupLat.toFixed(2) + ', ' + r.pickupLng.toFixed(2) + '</span></div>' : '') +
          (r.dropoffLat != null ? '<div class="field"><span class="key">dropoff lat / lng (coarse)</span><span>' + r.dropoffLat.toFixed(2) + ', ' + r.dropoffLng.toFixed(2) + '</span></div>' : '') +
          Object.entries(r.raw).map(([k, v]) => '<div class="field"><span class="key">' + escapeHtml(k) + '</span><span>' + escapeHtml(v) + '</span></div>').join("") + '</div></td>';
        tr.after(rawTr);
        // wire label-mask reveal
        rawTr.querySelectorAll(".label-mask").forEach(el => el.addEventListener("click", () => { el.textContent = el.dataset.full || el.textContent; }));
      });
      tbody.appendChild(tr);
    }
    // Wire any newly-rendered masks in the row body (pickup/dropoff cells).
    document.querySelectorAll("table.rides .label-mask").forEach(el => {
      el.addEventListener("click", () => { el.textContent = (el.dataset.full || ""); });
    });
    // Inject data-full for masked cells (per-cell click reveal; page-wide toggle re-renders).
    document.querySelectorAll("table.rides .label-mask").forEach((el) => {
      el.dataset.full = el.dataset.full || el.textContent || "";
    });
    $("row-count").textContent = "Showing " + Math.min(state.limit, filtered.length) + " of " + filtered.length + " match" + (filtered.length === 1 ? "" : "es") + " (out of " + rows.length + " total).";
    $("load-more").style.display = state.limit < filtered.length ? "" : "none";
  }
  render();

  // ---- Copy as Markdown ----
  $("copy-md").addEventListener("click", async () => {
    const lines = [];
    lines.push("# " + SOURCE_LABEL + " ride history");
    lines.push("");
    lines.push("- " + DATA.summary.rideCount + " rides + " + DATA.summary.cancelledCount + " cancelled · " + fmtMoney(DATA.summary.totalSpend) + " spent · " + Math.round(DATA.summary.totalMiles).toLocaleString() + " mi · " + Math.round(DATA.summary.totalHours) + " hr in cars");
    lines.push("- Period: " + DATA.summary.period + " (" + DATA.summary.durationLabel + ")");
    lines.push("- Busiest weekday: " + DATA.summary.busiestWeekday + " · busiest month: " + DATA.summary.busiestMonth);
    lines.push("- Late-night share: " + DATA.summary.lateNightShare.toFixed(1) + "% · airport share: " + DATA.summary.airportShare.toFixed(1) + "%");
    lines.push("");
    lines.push("## Top product types");
    DATA.productTypes.slice(0, 5).forEach(p => lines.push("- " + p.product + " — " + p.count + "× · " + fmtMoney(p.spend) + " · " + p.miles.toFixed(0) + " mi"));
    lines.push("");
    lines.push("## Headline patterns");
    DATA.flags.slice(0, 6).forEach(f => lines.push("- " + f.label + " — " + f.detail));
    lines.push("");
    lines.push("_Analytical summary, not tax / accounting / insurance advice. Heuristic clusters from labels and timestamps._");
    try { await navigator.clipboard.writeText(lines.join("\n")); $("copy-md").textContent = "Copied"; setTimeout(() => $("copy-md").textContent = "Copy as Markdown", 1600); }
    catch { alert(lines.join("\n")); }
  });
})();
  </script>
</body>
</html>`

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error("Usage: node scripts/render_rideshare_history_fallback.mjs INPUT --out OUT [--title TITLE] [--editorial 'sentence']")
    process.exit(1)
  }
  let input = ""
  let out = ""
  let title = ""
  let editorial = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") out = args[++i]
    else if (args[i] === "--title") title = args[++i]
    else if (args[i] === "--editorial") editorial = args[++i]
    else input = args[i]
  }
  if (!input) { console.error("missing INPUT"); process.exit(1) }
  out = out || input.replace(/\.[^.]+$/, "") + ".html"
  title = title || path.basename(input).replace(/\.[^.]+$/, "")

  const parser = await pickParser(input)
  if (!parser || parser.name !== "rideshare-history") {
    console.error("not a rideshare-history input — picked parser: " + (parser?.name || "(none)"))
    process.exit(1)
  }
  const parsed = await parser.parse(input)
  const data = parsed.data

  if (!editorial) {
    const s = data.summary
    editorial = `${s.rideCount} ${s.source === "uber" ? "Uber" : "Lyft"} rides over ${s.durationLabel} — ${data.summary.currencySymbol}${Math.round(s.totalSpend).toLocaleString()} spent, ${Math.round(s.totalMiles).toLocaleString()} miles, ${Math.round(s.totalHours)} hours in cars. Busiest weekday ${s.busiestWeekday}; ${s.lateNightShare.toFixed(0)}% of rides between 10pm and 4am.`
  }

  const json = JSON.stringify(data).replace(/<\/script/gi, "<\\/script")
  const html = TEMPLATE
    .replace(/__TITLE__/g, escapeHtml(title))
    .replace(/__EDITORIAL__/g, escapeHtml(editorial))
    .replace(/__DATA__/g, json)
  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, html, "utf8")
  console.log("wrote " + out + " (" + (Buffer.byteLength(html, "utf8") / 1024).toFixed(1) + " KB · " + data.rows.length + " rides)")
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
}

main().catch(e => { console.error(e); process.exit(1) })

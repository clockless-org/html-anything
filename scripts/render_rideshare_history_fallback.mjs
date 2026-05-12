#!/usr/bin/env node
/**
 * Offline fallback renderer for travel-history (Uber/Lyft trip exports).
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned template
 * that satisfies the `prompts/sources/rideshare-history.md` contract:
 *
 *   1. Source-aware global travel hero (Uber/Lyft · trips / spend / miles / hours)
 *   2. Privacy banner
 *   3. Spend timeline (monthly twin bars: count + spend)
 *   4. When you travel (weekday × hour heatmap)
 *   5. Top places (pickup + dropoff, masked by default)
 *   6. Cities
 *   7. Trip lengths (distance buckets)
 *   8. Places (offline SVG scatter, only when hasCoordinates)
 *   9. Money (fare / tip / fees / refund split + product breakdown)
 *  10. Flags (cancelled / refund / expensive / long / airport / late-night
 *      cluster / commute-loop / no-fare)
 *  11. Drill-down trip table with chips + privacy-styled labels
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
<html lang="en" data-ha-style="global-travel">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>__TITLE__</title>
  <style>
:root {
  --primary:#ff5b2e; --primary-container:#e84a20; --primary-fixed:#ffe2d6;
  --primary-fixed-dim:#ffb59f; --on-primary:#fff; --accent-glow:#ff5b2e;
  --secondary:#c7d8d5; --secondary-container:#6f9690; --tertiary:#4f767a; --accent-cyan:#83c7d3;
  --bg:#eef7f6; --surface:#eef7f6; --surface-container-lowest:#fff;
  --surface-container-low:#f8fbfb; --surface-container:#e3eeee; --surface-container-high:#d5e5e3;
  --fg-1:#20262b; --fg-2:#4f5e61; --fg-muted:#849295;
  --border:rgba(48,78,80,.12); --border-strong:rgba(48,78,80,.22); --outline-variant:#c8d9d6;
  --green:#10b981; --blue:#3b82f6; --yellow:#f59e0b; --red:#ef4444;
  --font-headline:'Space Grotesk',ui-sans-serif,system-ui,sans-serif;
  --font-body:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;
  --font-mono:'SF Mono','Menlo',ui-monospace,monospace;
  --space-xs:4px; --space-sm:8px; --space-md:12px; --space-lg:16px;
  --space-xl:20px; --space-2xl:24px; --space-3xl:32px; --space-4xl:48px; --space-5xl:64px;
  --radius-sm:4px; --radius-md:6px; --radius-lg:8px; --radius-xl:8px; --radius-2xl:8px; --radius-pill:9999px;
  --shadow-sm:0 1px 2px rgba(32,38,43,.04); --shadow-md:0 12px 32px rgba(44,69,71,.08);
  --shadow-lg:0 22px 54px rgba(44,69,71,.12); --shadow-accent:0 14px 28px rgba(255,91,46,.16);
  --gradient-primary:linear-gradient(135deg,#ff5b2e 0%,#ff7a50 100%);
  --gradient-hero:linear-gradient(135deg,#ff5b2e 0%,#5f8f8a 100%);
  --gradient-text:linear-gradient(135deg,#20262b 0%,#20262b 100%);
}
*,*::before,*::after{box-sizing:border-box;margin:0}
html,body{background:var(--bg);color:var(--fg-1);font-family:var(--font-body);
  font-size:15.5px;line-height:1.55;-webkit-font-smoothing:antialiased}
body{min-height:100vh;background:
  radial-gradient(circle at 50% 28%, rgba(255,255,255,.9), transparent 34rem),
  linear-gradient(180deg,#eef7f6 0%,#f7fbfb 100%)}
main.travel-shell{width:100%;max-width:1180px;margin:0 auto;padding:var(--space-3xl) var(--space-xl) var(--space-5xl)}
h1,h2,h3,h4{font-family:var(--font-headline);letter-spacing:-.01em;font-weight:600;color:var(--fg-1)}
h1{font-size:clamp(28px,5vw,46px);font-weight:700;line-height:1.05;letter-spacing:-.02em;text-wrap:balance;overflow-wrap:break-word}
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

.global-travel-hero{min-height:calc(100dvh - 56px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:var(--space-2xl) 0 var(--space-xl);text-align:center}
.travel-heading{width:100%;max-width:720px;margin:0 auto;display:flex;flex-direction:column;align-items:center}
.hero .eyebrow{display:inline-flex;gap:var(--space-sm);align-items:center;
  color:var(--fg-muted);font-family:var(--font-mono);font-size:11px;font-weight:700;
  text-transform:uppercase;letter-spacing:.14em;margin-bottom:var(--space-md)}
.hero .eyebrow #src-stamp{color:var(--primary)}
.hero h1{width:100%;max-width:680px;background:var(--gradient-text);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .editorial{margin-top:var(--space-md);max-width:58ch;color:var(--fg-2);font-size:15px;line-height:1.55;text-wrap:balance}
.hero .source-caption{margin-top:var(--space-sm);max-width:60ch;font-size:12.5px;color:var(--fg-muted)}
.travel-selector{margin-top:var(--space-xl);display:grid;grid-template-columns:minmax(210px,1fr) auto;gap:0;width:100%;max-width:430px;filter:drop-shadow(0 18px 32px rgba(48,78,80,.08))}
.travel-select{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 16px;background:#fff;border:1px solid rgba(48,78,80,.08);border-right:0;text-align:left}
.travel-select svg{width:20px;height:20px;flex:0 0 auto;color:var(--primary)}
.travel-select svg path{stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round}
.travel-select label{display:block;font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--fg-muted)}
.travel-select select{width:100%;border:0;background:transparent;color:var(--fg-1);font-weight:700;outline:none;appearance:none;padding-right:16px}
.travel-action{min-height:48px;padding:0 24px;background:var(--primary);color:var(--on-primary);font-weight:700;font-size:12px}
.travel-action:focus-visible,.travel-select select:focus-visible,.map-pin:focus-visible,.btn:focus-visible,.chip:focus-visible{outline:3px solid color-mix(in srgb,var(--primary) 35%, transparent);outline-offset:3px}
.privacy-banner{display:flex;align-items:center;justify-content:center;gap:var(--space-sm);margin-top:var(--space-md);width:100%;
  padding:var(--space-sm) var(--space-md);background:rgba(255,255,255,.58);
  border:1px solid var(--border);border-radius:var(--radius-pill);
  font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);max-width:620px;white-space:normal;overflow-wrap:anywhere}
.privacy-banner .dot{width:7px;height:7px;border-radius:50%;background:var(--green)}

.global-map-stage{position:relative;width:100%;max-width:940px;height:clamp(210px,26vw,270px);margin:var(--space-xl) auto 0}
.dotted-world-map{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:.88}
.map-dots circle{fill:#a9b9b8;opacity:.45}
.map-pin{position:absolute;width:14px;height:14px;border-radius:50%;background:var(--primary);border:2px solid rgba(255,255,255,.86);box-shadow:0 0 0 6px rgba(255,91,46,.14),0 8px 18px rgba(255,91,46,.22);transform:translate(-50%,-50%);cursor:pointer}
.map-pin.dropoff{background:#ff7148}
.map-pin.selected{box-shadow:0 0 0 9px rgba(255,91,46,.18),0 12px 28px rgba(255,91,46,.28)}
@media (prefers-reduced-motion: no-preference){.map-pin.selected{animation:travelPulse 1.8s ease-out infinite}@keyframes travelPulse{0%{box-shadow:0 0 0 0 rgba(255,91,46,.26),0 12px 28px rgba(255,91,46,.28)}100%{box-shadow:0 0 0 14px rgba(255,91,46,0),0 12px 28px rgba(255,91,46,.28)}}}
.location-callout{position:absolute;left:18%;top:48%;min-width:160px;max-width:230px;padding:12px 18px;background:#fff;border-radius:6px;text-align:left;box-shadow:0 18px 38px rgba(56,82,84,.14);border:1px solid rgba(48,78,80,.08)}
.location-callout::after{content:"";position:absolute;left:24px;bottom:-8px;width:16px;height:16px;background:#fff;transform:rotate(45deg);border-right:1px solid rgba(48,78,80,.08);border-bottom:1px solid rgba(48,78,80,.08)}
.location-callout .city{font-size:12px;line-height:1.1;text-transform:uppercase;font-weight:800;color:var(--primary);letter-spacing:.04em}
.location-callout .detail{font-size:12px;color:var(--fg-2);margin-top:3px}
.travel-stat-row{display:grid;grid-template-columns:repeat(5,minmax(108px,1fr));gap:clamp(14px,4vw,48px);width:100%;max-width:880px;margin:var(--space-xl) auto 0}
.travel-stat{background:transparent;border:0;border-radius:0;padding:0;text-align:center}
.travel-stat .kpi-icon{display:flex;align-items:center;justify-content:center;width:30px;height:30px;margin:0 auto 6px;color:var(--primary);opacity:.72}
.travel-stat .kpi-icon svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:1.7}
.travel-stat .label{font-size:10px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.08em;color:var(--fg-1);font-weight:800;margin-top:2px}
.travel-stat .value{font-family:var(--font-headline);font-size:clamp(28px,4.8vw,48px);line-height:1;font-weight:800;font-variant-numeric:tabular-nums;color:var(--fg-1)}
.travel-stat .sub{display:none}
@media (max-width:780px){
  main.travel-shell{padding-top:var(--space-xl)}
  .global-travel-hero{min-height:auto;justify-content:flex-start}
  .travel-heading{width:calc(100vw - 40px);max-width:calc(100vw - 40px)}
  .hero h1{max-width:100%}
  .travel-selector,.privacy-banner,.global-map-stage,.travel-stat-row{max-width:100%}
  .travel-selector{grid-template-columns:1fr}
  .travel-select{border-right:1px solid rgba(48,78,80,.08)}
  .travel-action{width:100%}
  .privacy-banner{border-radius:18px;text-align:left;align-items:flex-start}
  .global-map-stage{height:250px}
  .location-callout{left:8%;top:54%;transform:scale(.9);transform-origin:left top}
  .travel-stat-row{grid-template-columns:repeat(2,minmax(120px,1fr));gap:22px 28px}
}

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
  <main class="travel-shell">
    <header class="hero global-travel-hero">
      <div class="travel-heading">
        <span class="eyebrow"><span id="src-stamp">UBER</span> · travel history</span>
        <h1 id="hero-title">__TITLE__</h1>
        <p class="editorial" id="hero-editorial">__EDITORIAL__</p>
        <form class="travel-selector" aria-label="Travel history controls">
          <div class="travel-select">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18"/><path d="M7 5v14M17 5v14"/></svg>
            <div>
              <label for="source-select">Source</label>
              <select id="source-select" aria-label="Travel source"></select>
            </div>
          </div>
          <button class="travel-action" type="button" id="see-trips">See trips</button>
        </form>
        <p class="source-caption" id="src-caption"></p>
        <div class="privacy-banner"><span class="dot"></span>This page never sent a network request. Addresses and coordinates are masked by default.</div>
      </div>
      <div class="global-map-stage" aria-label="Travel map summary">
        <svg class="dotted-world-map" viewBox="0 0 1000 420" role="img" aria-label="Dotted world map background" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="travel-dot" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="2.1" fill="#a9b9b8"></circle>
            </pattern>
          </defs>
          <g class="map-dots" fill="url(#travel-dot)" opacity=".56">
            <path d="M142 120c45-36 126-43 184-22 33 12 58 33 78 60 19 26 56 31 76 58 22 30-1 70-34 78-41 10-59-30-90-42-36-14-67 8-96 22-46 23-103 17-134-24-29-39-24-95 16-130z"/>
            <path d="M306 266c23 2 44 18 54 40 13 29 1 71-27 92-21 16-47 18-69 5-26-15-37-43-31-72 7-33 35-68 73-65z"/>
            <path d="M498 100c51-26 128-25 184 3 44 22 73 58 113 83 39 24 94 26 127 56 24 22 27 58 6 77-29 26-80 9-113-6-46-20-74-8-110 18-32 24-91 31-125-2-27-27-22-63-42-91-19-27-58-32-75-62-17-29 6-59 35-76z"/>
            <path d="M520 204c27 5 59 30 72 56 19 38 8 95-25 121-30 24-70 12-87-24-15-31 4-58 11-87 6-26 2-48 29-66z"/>
            <path d="M708 293c30-14 75-6 103 14 25 18 30 52 6 68-31 22-80 4-109-15-26-18-29-51 0-67z"/>
          </g>
        </svg>
        <div id="map-pins"></div>
        <div class="location-callout" id="hero-callout">
          <div class="city" id="callout-city">Travel</div>
          <div class="detail" id="callout-detail">Loading trip anchors...</div>
        </div>
      </div>
      <div class="travel-stat-row" id="kpi-grid"></div>
    </header>

    <section id="timeline-section">
      <div class="section-header"><h2>Spend timeline</h2><span class="meta" id="timeline-meta"></span></div>
      <div class="card">
        <div class="timeline" id="timeline"></div>
        <div class="timeline-legend">
          <span><span class="swatch" style="background:var(--primary-fixed-dim)"></span>Trips</span>
          <span><span class="swatch" style="background:var(--primary)"></span>Spend</span>
        </div>
        <p class="peak-callout muted" id="peak-callout"></p>
      </div>
    </section>

    <section id="heatmap-section">
      <div class="section-header"><h2>When you travel</h2><span class="meta" id="heatmap-meta"></span></div>
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

    <section id="rides-section" class="itinerary-browser">
      <div class="section-header"><h2 id="rides-title">Browse all trips</h2>
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
      <p>Generated locally — your Uber / Lyft export never left your machine. The full trip list is embedded in this HTML and rendered offline in your browser. Pickup / dropoff addresses and coordinates are inlined as-is from the file you opened. For sharing, prefer an anonymized export.</p>
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
  const REDUCE_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const iconSvg = {
    trips: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v14l5-3 5 3 4-2V2l-4 2-5-3-5 3z"/><path d="M10 1v14M15 4v14"/></svg>',
    spend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z"/><path d="M4 7V5a2 2 0 0 1 2-2h11"/><path d="M17 13h.01"/></svg>',
    miles: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c4-8 12-12 16-10"/><path d="M5 18h14"/><path d="M8 14l3 3 5-7"/></svg>',
    hours: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>',
    cities: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16"/><path d="M6 20V8h5v12"/><path d="M13 20V4h5v16"/><path d="M8 11h1M8 15h1M15 8h1M15 12h1M15 16h1"/></svg>',
    night: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15.5A7 7 0 0 1 8.5 6 8 8 0 1 0 18 15.5z"/></svg>'
  };

  // ---- Hero ----
  $("src-stamp").textContent = SOURCE_STAMP;
  const sourceSelect = $("source-select");
  sourceSelect.innerHTML = '<option>' + SOURCE_LABEL + ' travel history</option>';
  $("see-trips").addEventListener("click", () => $("rides-section").scrollIntoView({ behavior: REDUCE_MOTION ? "auto" : "smooth", block: "start" }));
  $("src-caption").textContent = DATA.source === "uber"
    ? "This is your Uber trip history export. Each row is a requested trip — completed, cancelled, or refunded. Addresses and coordinates are masked by default."
    : "This is your Lyft travel history export. Each row is a requested trip. Addresses and coordinates are masked by default.";

  const kpis = [
    { icon: "trips", label: "Trips", value: fmtNum(DATA.summary.rideCount), sub: DATA.summary.cancelledCount + " cancelled · " + DATA.summary.refundCount + " refunded" },
    { icon: "spend", label: "Spend", value: fmtMoneyShort(DATA.summary.totalSpend), sub: "avg " + fmtMoney(DATA.summary.avgFare) + " / trip" },
    { icon: "miles", label: "Miles", value: fmtNum(DATA.summary.totalMiles), sub: "avg " + DATA.summary.avgMiles.toFixed(1) + " mi / trip" },
    { icon: "hours", label: "Hours", value: fmtNum(DATA.summary.totalHours), sub: "avg " + DATA.summary.avgDurationMin.toFixed(0) + " min / trip" },
    { icon: "cities", label: "Cities", value: fmtNum(DATA.summary.distinctCities), sub: DATA.summary.busiestCity || "city data" },
  ];
  const kpiHost = $("kpi-grid");
  for (const k of kpis) {
    const el = document.createElement("div");
    el.className = "travel-stat kpi";
    el.innerHTML = '<div class="kpi-icon">' + iconSvg[k.icon] + '</div><div class="value">' + k.value + '</div><div class="label">' + k.label + '</div><div class="sub">' + k.sub + '</div>';
    kpiHost.appendChild(el);
  }
  renderHeroMap();

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
      cBar.title = m.month + " · " + m.count + " trips";
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
    $("peak-callout").textContent = "Biggest spend month: " + peakSpend.month + " (" + fmtMoney(peakSpend.spend) + ", " + peakSpend.count + " trips). Most trips: " + peakCount.month + " (" + peakCount.count + " trips).";
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
        cell.title = WEEKDAYS[w] + " · " + String(h).padStart(2,"0") + ":00 — " + c.count + " trip" + (c.count === 1 ? "" : "s");
      } else {
        cell.title = WEEKDAYS[w] + " · " + String(h).padStart(2,"0") + ":00 — no trips";
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
  function renderHeroMap() {
    const host = $("map-pins");
    const calloutCity = $("callout-city");
    const calloutDetail = $("callout-detail");
    const anchors = new Map();
    function addPoint(label, lat, lng, kind, spend) {
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const key = (label || "Unknown") + "|" + lat.toFixed(2) + "|" + lng.toFixed(2);
      const item = anchors.get(key) || { label: label || "Unknown", lat, lng, kind, count: 0, spend: 0 };
      item.count += 1;
      item.spend += spend || 0;
      anchors.set(key, item);
    }
    DATA.rows.forEach(r => {
      addPoint(r.pickupLabel, r.pickupLat, r.pickupLng, "pickup", r.total);
      addPoint(r.dropoffLabel, r.dropoffLat, r.dropoffLng, "dropoff", 0);
    });
    const points = Array.from(anchors.values()).sort((a, b) => b.count - a.count).slice(0, 9);
    function placeCallout(p) {
      if (!p) {
        calloutCity.textContent = "Travel history";
        calloutDetail.textContent = DATA.summary.period + " · " + DATA.summary.rideCount + " trips";
        return;
      }
      calloutCity.textContent = p.label.replace(/\s*\(synthetic[^)]*\)/gi, "").slice(0, 28) || "Waypoint";
      calloutDetail.textContent = p.count + " trips" + (p.spend > 0 ? " · " + fmtMoneyShort(p.spend) : "") + " · coarse " + p.lat.toFixed(2) + ", " + p.lng.toFixed(2);
    }
    points.forEach((p, i) => {
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "map-pin " + p.kind + (i === 0 ? " selected" : "");
      pin.style.left = ((p.lng + 180) / 360 * 100).toFixed(2) + "%";
      pin.style.top = ((90 - p.lat) / 180 * 100).toFixed(2) + "%";
      pin.setAttribute("aria-label", p.label + ": " + p.count + " trips");
      pin.title = p.label + " · " + p.count + " trips";
      pin.addEventListener("click", () => {
        document.querySelectorAll(".map-pin").forEach(el => el.classList.remove("selected"));
        pin.classList.add("selected");
        placeCallout(p);
      });
      host.appendChild(pin);
    });
    placeCallout(points[0]);
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
  $("rides-title").textContent = "Browse all " + rows.length + " trips";
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
    return '<span class="label-mask" data-full="' + escapeHtml(label) + '" title="Click to reveal">' + escapeHtml(maskLabel(label)) + '</span>';
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
    $("row-count").textContent = "Showing " + Math.min(state.limit, filtered.length) + " of " + filtered.length + " match" + (filtered.length === 1 ? "" : "es") + " (out of " + rows.length + " total).";
    $("load-more").style.display = state.limit < filtered.length ? "" : "none";
  }
  render();

  // ---- Copy as Markdown ----
  $("copy-md").addEventListener("click", async () => {
    const lines = [];
    lines.push("# " + SOURCE_LABEL + " travel history");
    lines.push("");
    lines.push("- " + DATA.summary.rideCount + " trips + " + DATA.summary.cancelledCount + " cancelled · " + fmtMoney(DATA.summary.totalSpend) + " spent · " + Math.round(DATA.summary.totalMiles).toLocaleString() + " mi · " + Math.round(DATA.summary.totalHours) + " hr in cars");
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
    editorial = `${s.rideCount} ${s.source === "uber" ? "Uber" : "Lyft"} trips over ${s.durationLabel} — ${data.summary.currencySymbol}${Math.round(s.totalSpend).toLocaleString()} spent, ${Math.round(s.totalMiles).toLocaleString()} miles, ${Math.round(s.totalHours)} hours in cars. Busiest weekday ${s.busiestWeekday}; ${s.lateNightShare.toFixed(0)}% of trips between 10pm and 4am.`
  }

  const json = JSON.stringify(data).replace(/<\/script/gi, "<\\/script")
  const html = TEMPLATE
    .replace(/__TITLE__/g, escapeHtml(title))
    .replace(/__EDITORIAL__/g, escapeHtml(editorial))
    .replace(/__DATA__/g, json)
  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, html, "utf8")
  console.log("wrote " + out + " (" + (Buffer.byteLength(html, "utf8") / 1024).toFixed(1) + " KB · " + data.rows.length + " trips)")
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
}

main().catch(e => { console.error(e); process.exit(1) })

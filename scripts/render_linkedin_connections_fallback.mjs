#!/usr/bin/env node
/**
 * Offline fallback renderer for linkedin-connections.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned
 * template that satisfies the prompts/sources/linkedin-connections.md
 * contract:
 *
 *   1. Hero summary (connections / year window / coverage / top
 *      company)
 *   2. Network growth (yearly bars + cumulative line, spike callouts)
 *   3. Relationship atlas: top companies, role-keyword clusters,
 *      industries, email domains
 *   4. Reconnect queue (heuristic, read-only — no auto-drafted
 *      outreach copy)
 *   5. Audit row (missing email / company / position, stale, very
 *      recent, duplicate-name, duplicate-url)
 *   6. Searchable contact grid with mask-by-default email + per-card
 *      reveal, sort, filter chips
 *   7. Privacy footer
 *
 * The page renders the FULL `rows` array client-side, so the contact
 * grid can grow to thousands without re-running the LLM. Email values
 * are masked by default; URLs are shown but never clickable; the
 * page makes no network calls.
 *
 * Usage:
 *   node scripts/render_linkedin_connections_fallback.mjs INPUT --out OUT --title TITLE
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
h4{font-size:14.5px;margin-bottom:var(--space-xs);color:var(--fg-1);font-weight:600}
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
.hero-actions{display:flex;gap:var(--space-md);margin-top:var(--space-xl);flex-wrap:wrap;align-items:center}
.btn{display:inline-flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) var(--space-lg);
  border-radius:var(--radius-pill);font-weight:600;font-size:14px;border:1px solid var(--border-strong);
  background:var(--surface-container-lowest);color:var(--fg-1);transition:all .15s ease;cursor:pointer}
.btn:hover{background:var(--surface-container);box-shadow:var(--shadow-sm)}
.btn.primary{background:var(--gradient-primary);color:var(--on-primary);border-color:transparent}
.btn.primary:hover{box-shadow:var(--shadow-accent)}
.btn .eye{font-size:13px}
.btn.toggle.on{background:var(--surface-container-high);color:var(--primary);border-color:var(--primary)}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--space-lg);margin-top:var(--space-3xl)}
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
.audit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--space-md)}
.audit{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);display:flex;flex-direction:column;gap:var(--space-xs)}
.audit .audit-label{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-muted);font-family:var(--font-mono);font-weight:500}
.audit .audit-count{font-family:var(--font-headline);font-size:24px;font-weight:600;color:var(--fg-1);font-variant-numeric:tabular-nums}
.audit .audit-count.zero{color:var(--fg-muted)}
.audit .audit-sub{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-2);margin-top:var(--space-xs);line-height:1.45}
.audit .audit-sub b{color:var(--primary);font-weight:600}
.atlas-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-md)}
.atlas{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-container-lowest);display:flex;flex-direction:column;gap:var(--space-xs)}
.atlas .atlas-head{display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-sm)}
.atlas .atlas-head h4{margin:0}
.atlas .atlas-head .count{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.atlas .row{display:flex;justify-content:space-between;align-items:center;gap:var(--space-sm);padding:3px 0;font-family:var(--font-mono);font-size:12.5px}
.atlas .row .v{color:var(--fg-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.atlas .row .c{color:var(--primary);font-weight:600;font-variant-numeric:tabular-nums;font-size:12px}
.atlas .row .bar{flex:1 1 auto;height:4px;background:var(--surface-container);border-radius:2px;position:relative;margin:0 var(--space-sm);min-width:30px}
.atlas .row .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--primary);border-radius:2px;display:block}
.growth{padding:var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface-container-lowest)}
.growth .axis{display:grid;grid-template-columns:48px 1fr 1fr 70px;gap:var(--space-sm);align-items:center;font-family:var(--font-mono);font-size:11.5px;padding:6px 0;border-bottom:1px dashed var(--border)}
.growth .axis.head{font-weight:600;color:var(--fg-muted);text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--border-strong)}
.growth .axis .y{color:var(--fg-1);font-weight:600}
.growth .axis .bar-cell{position:relative;height:14px;background:var(--surface-container);border-radius:3px}
.growth .axis .bar-cell i{position:absolute;left:0;top:0;bottom:0;background:var(--gradient-primary);border-radius:3px}
.growth .axis .bar-cell .bar-label{position:absolute;left:6px;top:50%;transform:translateY(-50%);font-family:var(--font-mono);font-size:10.5px;color:var(--on-primary);font-weight:600;mix-blend-mode:luminosity}
.growth .axis .cum{color:var(--fg-2);font-variant-numeric:tabular-nums}
.growth .axis .running{height:8px;background:var(--surface-container);border-radius:2px;position:relative}
.growth .axis .running i{position:absolute;left:0;top:0;bottom:0;background:var(--secondary-container);border-radius:2px;opacity:.85}
.spikes{margin-top:var(--space-md);display:flex;gap:var(--space-sm);flex-wrap:wrap}
.spike-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:var(--radius-pill);background:var(--primary-fixed);color:var(--primary);font-family:var(--font-mono);font-size:11.5px;font-weight:600}
.spike-pill .dot{width:6px;height:6px;border-radius:50%;background:var(--primary)}
.queue-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-md)}
.queue{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-container-lowest);display:flex;flex-direction:column;gap:var(--space-xs)}
.queue .qhead{display:flex;justify-content:space-between;align-items:baseline;gap:var(--space-sm)}
.queue .qname{font-weight:600;font-size:14px;color:var(--fg-1);line-height:1.3;flex:1 1 auto}
.queue .qscore{font-family:var(--font-mono);font-size:11px;color:var(--primary);font-weight:600;background:var(--primary-fixed);padding:2px 8px;border-radius:var(--radius-pill)}
.queue .qsub{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);line-height:1.4}
.queue .qreasons{display:flex;flex-wrap:wrap;gap:4px;margin-top:var(--space-xs)}
.queue .qreason{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;font-weight:500}
.queue .qcopy{font-size:11px;font-weight:500;color:var(--fg-muted);text-decoration:underline dotted var(--border-strong);text-underline-offset:3px;cursor:pointer;align-self:flex-start;background:transparent;padding:0;margin-top:var(--space-xs)}
.queue .qcopy:hover{color:var(--primary);text-decoration-color:var(--primary)}
.drill-toolbar{display:flex;gap:var(--space-md);margin-bottom:var(--space-md);flex-wrap:wrap;align-items:center}
.drill-search{flex:1 1 280px;min-width:220px;padding:var(--space-sm) var(--space-md);border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-container-lowest);font-size:14px;font-family:var(--font-mono)}
.drill-search:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:var(--primary)}
.drill-meta{font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.drill-sort{padding:var(--space-sm) var(--space-md);border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-container-lowest);font-size:13px;font-family:var(--font-mono)}
.chips{display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:var(--space-md)}
.chip{display:inline-flex;align-items:center;gap:var(--space-sm);padding:6px var(--space-md);border-radius:var(--radius-pill);background:var(--surface-container);border:1px solid var(--border);font-size:12.5px;font-weight:500;cursor:pointer;transition:all .15s ease;user-select:none}
.chip:hover{background:var(--surface-container-high)}
.chip.active{background:var(--primary);color:var(--on-primary);border-color:transparent}
.chip .count{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);font-weight:400}
.chip.active .count{color:rgba(255,255,255,.8)}
.chip-row-label{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);font-family:var(--font-mono);font-weight:500;margin-bottom:var(--space-xs);margin-top:var(--space-md)}
.contact-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--space-md)}
.contact{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-container-lowest);display:flex;flex-direction:column;gap:var(--space-xs);overflow:hidden}
.contact .name{font-weight:600;font-size:15px;color:var(--fg-1);line-height:1.3}
.contact .name.italic{font-style:italic;color:var(--fg-muted)}
.contact .org-line{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);line-height:1.4}
.contact .org-line b{color:var(--fg-2);font-weight:500}
.contact .field{font-family:var(--font-mono);font-size:12px;color:var(--fg-2);display:flex;gap:var(--space-sm);align-items:center}
.contact .field .label{font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--fg-muted);background:var(--surface-container);padding:1px 6px;border-radius:4px;flex-shrink:0}
.contact .field .v{cursor:pointer;text-decoration:underline dotted var(--border-strong);text-underline-offset:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.contact .field .v:hover{color:var(--primary);text-decoration-color:var(--primary)}
.contact .field .v.url{cursor:default;color:var(--fg-muted);text-decoration:none}
.contact .badges{display:flex;flex-wrap:wrap;gap:var(--space-xs);margin-top:var(--space-xs)}
.contact .badge{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.contact .badge.dup{background:rgba(245,158,11,.18);color:#a06200}
@media (prefers-color-scheme:dark){.contact .badge.dup{color:#fcd34d}.contact .badge.flag{color:#f87171}}
.contact .badge.recent{background:rgba(16,185,129,.18);color:#0e7c5a}
@media (prefers-color-scheme:dark){.contact .badge.recent{color:#34d399}}
.contact .badge.stale{background:rgba(123,64,224,.15);color:var(--secondary-container)}
.contact .badge.flag{background:rgba(239,68,68,.12);color:var(--red)}
.contact .badge.cat{background:var(--primary-fixed);color:var(--primary)}
.contact .rev{font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)}
.contact .reasons{display:flex;flex-wrap:wrap;gap:4px;margin-top:var(--space-xs)}
.contact .reason{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container-low);color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;font-weight:500}
.empty-state{padding:var(--space-2xl);text-align:center;font-size:13.5px;color:var(--fg-muted)}
.tbl-loadmore{display:flex;justify-content:center;padding:var(--space-md);font-size:13px;color:var(--fg-muted);grid-column:1/-1}
.tbl-loadmore button{padding:var(--space-sm) var(--space-lg);border-radius:var(--radius-pill);border:1px solid var(--border-strong);background:var(--surface-container-lowest)}
footer{margin-top:var(--space-5xl);padding-top:var(--space-2xl);border-top:1px solid var(--border);font-size:12.5px;color:var(--fg-muted);max-width:78ch;line-height:1.6}
footer .privacy{font-style:italic}
@media (max-width:540px){
  main{padding:var(--space-lg) var(--space-md) var(--space-4xl)}
  .growth .axis{grid-template-columns:42px 1fr 60px;gap:6px}
  .growth .axis .running{display:none}
  .growth .axis.head .running-h{display:none}
}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <span class="eyebrow"><span class="mono">LINKEDIN CONNECTIONS</span> · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial"></p>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy audit summary as Markdown</button>
        <button class="btn" id="jump-table-btn">Jump to connections</button>
        <button class="btn toggle" id="mask-toggle"><span class="eye">&#128065;</span> <span id="mask-toggle-label">Show real emails</span></button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Network summary">
      <div class="kpi"><div class="label">Connections</div><div class="value mono accent" id="kpi-count">0</div><div class="sub" id="kpi-count-sub"></div></div>
      <div class="kpi"><div class="label">Year window</div><div class="value mono" id="kpi-window">&mdash;</div><div class="sub" id="kpi-window-sub"></div></div>
      <div class="kpi"><div class="label">Coverage</div><div class="value mono" id="kpi-coverage">&mdash;</div><div class="sub" id="kpi-coverage-sub"></div></div>
      <div class="kpi"><div class="label">Top company</div><div class="value mono" id="kpi-org">&mdash;</div><div class="sub" id="kpi-org-sub"></div></div>
    </section>

    <section class="section" aria-labelledby="head-growth">
      <div class="section-head">
        <h2 id="head-growth">Network growth</h2>
        <span class="meta" id="growth-meta"></span>
      </div>
      <div class="growth">
        <div class="axis head"><span>Year</span><span>New connections</span><span class="running-h">Running total</span><span style="text-align:right">Cumulative</span></div>
        <div id="growth-rows"></div>
        <div class="spikes" id="spikes-row"></div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-atlas">
      <div class="section-head">
        <h2 id="head-atlas">Network atlas</h2>
        <span class="meta" id="atlas-meta"></span>
      </div>
      <div class="atlas-grid">
        <div class="atlas">
          <div class="atlas-head"><h4>Top companies</h4><span class="count" id="org-count"></span></div>
          <div id="org-list"></div>
        </div>
        <div class="atlas">
          <div class="atlas-head"><h4>Role keyword clusters</h4><span class="count" id="role-count"></span></div>
          <div id="role-list"></div>
        </div>
        <div class="atlas">
          <div class="atlas-head"><h4>Industries <span class="heuristic-chip" style="margin-left:6px">heuristic</span></h4><span class="count" id="ind-count"></span></div>
          <div id="ind-list"></div>
        </div>
        <div class="atlas">
          <div class="atlas-head"><h4>Email domains</h4><span class="count" id="dom-count"></span></div>
          <div id="dom-list"></div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-queue">
      <div class="section-head">
        <h2 id="head-queue">Reconnect queue</h2>
        <span class="heuristic-chip" title="Read-only heuristic. The page makes no calls to LinkedIn.">Heuristic · read-only</span>
      </div>
      <p class="muted" style="font-size:13px;margin-bottom:var(--space-md)">Heuristic ranking: connections from years ago, missing current company, with email present, or just-connected. Use it as a thinking aid, not an outreach tool — the page never contacts LinkedIn or drafts a message.</p>
      <div class="queue-grid" id="queue-grid"></div>
    </section>

    <section class="section" aria-labelledby="head-audit">
      <div class="section-head">
        <h2 id="head-audit">Network audit</h2>
        <span class="heuristic-chip" title="Observational. Most LinkedIn connections never share email — that is normal.">Observational</span>
      </div>
      <div class="card">
        <div class="audit-grid" id="audit-grid"></div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-table">
      <div class="section-head">
        <h2 id="head-table" style="scroll-margin-top:1em">Browse all connections</h2>
        <span class="meta">Emails masked by default. URLs shown but never clickable — page is fully offline.</span>
      </div>
      <div class="card">
        <div class="drill-toolbar">
          <input class="drill-search" id="drill-search" type="search" placeholder="Search name, company, role, email, URL slug&hellip;" aria-label="Search connections">
          <select class="drill-sort" id="drill-sort" aria-label="Sort">
            <option value="recent">Most recent connection</option>
            <option value="oldest">Oldest connection</option>
            <option value="name">Name (A→Z)</option>
            <option value="reconnect">Reconnect score (high→low)</option>
          </select>
          <span class="drill-meta" id="drill-count">0 of 0</span>
          <button class="btn" id="drill-clear">Clear filters</button>
        </div>
        <div class="chip-row-label">Has</div>
        <div class="chips" id="has-chips"></div>
        <div class="chip-row-label">Industry</div>
        <div class="chips" id="ind-chips"></div>
        <div class="chip-row-label">Company</div>
        <div class="chips" id="org-chips"></div>
        <div class="chip-row-label">Audit</div>
        <div class="chips" id="audit-chips"></div>
        <div class="contact-list" id="contact-list"></div>
        <div class="tbl-loadmore" id="loadmore"></div>
      </div>
    </section>

    <footer>
      <p>Generated by <a href="https://github.com/clockless-org/html-anything">html-anything</a> from <span id="footer-source" class="mono"></span> (<span id="footer-bytes" class="mono"></span>) using the offline linkedin-connections template. This file is fully self-contained and makes no network calls — it uses your operating system's default sans-serif font.</p>
      <p class="privacy" style="margin-top:var(--space-md)">Generated locally — your LinkedIn connections never left your machine. Every row is embedded in this HTML and rendered offline in your browser. Email addresses are masked by default; the toggle is local-only and does not transmit anything. <strong>The page makes no network calls — no LinkedIn, no avatars, no analytics.</strong></p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(function(){
  const fmt = new Intl.NumberFormat("en-US")
  const summary = DATA.summary || {}
  const rows = DATA.rows || []
  const companies = DATA.companyLeaderboard || []
  const positions = DATA.positionKeywords || []
  const industries = DATA.industries || []
  const domains = DATA.emailDomains || []
  const yearly = DATA.yearlyGrowth || []
  const monthly = DATA.monthlyGrowth || []
  const spikes = DATA.spikes || []
  const audit = DATA.audit || {}
  const queue = DATA.reconnectQueue || []
  const meta = DATA.meta || {}

  function escapeHtml(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])) }
  function ellipsize(s, n){ if (!s) return ""; return s.length > n ? s.slice(0, n-1) + "…" : s }
  function pct(x){ return Math.round((x||0) * 100) + "%" }
  function humanBytes(n){ if (!n) return "0 B"; const u = ["B","KB","MB","GB"]; let i=0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ } return n.toFixed(n < 10 && i ? 1 : 0) + " " + u[i] }
  function lookupRow(id){ return rows.find(r => r.id === id) }
  function visibleName(r){ return (r.fullName || "").trim() || "(no name)" }
  function fmtMonthYear(month){
    if (!month) return ""
    const parts = month.split("-")
    if (parts.length < 2) return month
    const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    const m = Number(parts[1])
    return (labels[m - 1] || "") + " " + parts[0]
  }
  function relYearsAgo(y){
    if (y == null) return ""
    if (y < 0.08) return "this month"
    if (y < 0.25) return "last 90 days"
    if (y < 1) return Math.round(y * 12) + " months ago"
    if (y < 2) return "1 year ago"
    return Math.round(y) + " years ago"
  }

  document.getElementById("footer-source").textContent = meta.sourceFile || "Connections.csv"
  document.getElementById("footer-bytes").textContent = humanBytes(meta.sizeBytes || 0)

  // ---------- KPIs ----------
  document.getElementById("kpi-count").textContent = fmt.format(summary.contactCount || 0)
  document.getElementById("kpi-count-sub").textContent = (summary.distinctIndustries || 0) + " industries · " + (summary.distinctCompanies || 0) + " companies"
  document.getElementById("kpi-window").textContent = summary.yearWindow || "—"
  document.getElementById("kpi-window-sub").textContent = summary.durationLabel || ""
  document.getElementById("kpi-coverage").textContent = (summary.withCompany || 0) + " / " + (summary.withPosition || 0) + " / " + (summary.withEmail || 0)
  document.getElementById("kpi-coverage-sub").textContent = "company · role · email"
  document.getElementById("kpi-org").textContent = ellipsize(summary.topCompany || "—", 18)
  document.getElementById("kpi-org-sub").textContent = summary.topCompany
    ? (summary.topCompanyCount + " connections")
    : "no company metadata"

  document.getElementById("hero-editorial").textContent = buildEditorial()
  function buildEditorial(){
    const parts = []
    parts.push((summary.contactCount || 0) + " connections from " + (summary.period || "(empty)") + ".")
    if (summary.topCompany) parts.push("Top company: " + summary.topCompany + " (" + (summary.topCompanyCount || 0) + ").")
    // Skip "Other" as a lede — it's the heuristic catch-all and isn't
    // editorially interesting. Fall back to the next non-Other cluster.
    const namedIndustry = (industries || []).find(i => i.industry && i.industry !== "Other")
    if (namedIndustry) parts.push("Largest named industry cluster: " + namedIndustry.industry + " (" + namedIndustry.count + ").")
    if (audit.missingCompany && audit.missingCompany.count) parts.push(audit.missingCompany.count + " no longer list a current company.")
    if (audit.missingEmail && audit.missingEmail.count) parts.push(audit.missingEmail.count + " have no email — most LinkedIn connections never share it.")
    if (audit.staleOld && audit.staleOld.count) parts.push(audit.staleOld.count + " were added 5+ years ago.")
    if (spikes && spikes.length) parts.push("Spike: " + spikes[0].label + ".")
    return parts.join(" ")
  }

  // ---------- Growth ----------
  document.getElementById("growth-meta").textContent =
    (yearly.length || 0) + " year" + (yearly.length === 1 ? "" : "s") +
    (monthly.length ? " · " + monthly.length + " months with new connections" : "")
  const maxYear = yearly.reduce((m, y) => Math.max(m, y.count), 0) || 1
  const maxCum = yearly.length ? yearly[yearly.length - 1].cumulative : 1
  document.getElementById("growth-rows").innerHTML = yearly.map(y => {
    const w = Math.max(2, Math.round((y.count / maxYear) * 100))
    const cumW = Math.max(2, Math.round((y.cumulative / maxCum) * 100))
    return '<div class="axis"><span class="y">' + y.year + '</span>' +
      '<div class="bar-cell" title="' + y.count + ' new in ' + y.year + '"><i style="width:' + w + '%"></i><span class="bar-label">' + y.count + '</span></div>' +
      '<div class="running" title="' + y.cumulative + ' total by end of ' + y.year + '"><i style="width:' + cumW + '%"></i></div>' +
      '<span class="cum" style="text-align:right">' + fmt.format(y.cumulative) + '</span></div>'
  }).join("")
  document.getElementById("spikes-row").innerHTML = spikes.length
    ? spikes.map(s => '<span class="spike-pill"><span class="dot"></span>' + escapeHtml(s.label) + '</span>').join("")
    : ""

  // ---------- Atlas ----------
  document.getElementById("atlas-meta").textContent =
    (summary.distinctCompanies || 0) + " companies · " +
    (summary.distinctPositions || 0) + " role keywords · " +
    (summary.distinctIndustries || 0) + " industries · " +
    (summary.distinctEmailDomains || 0) + " email domains"
  function renderAtlas(target, items, getKey, getCount){
    const max = items.reduce((m, it) => Math.max(m, getCount(it)), 0) || 1
    target.innerHTML = items.slice(0, 10).map(it => {
      const w = Math.max(4, Math.round((getCount(it) / max) * 100))
      return '<div class="row"><span class="v" title="' + escapeHtml(getKey(it)) + '">' + escapeHtml(ellipsize(getKey(it), 26)) + '</span>' +
        '<span class="bar"><i style="width:' + w + '%"></i></span>' +
        '<span class="c">' + fmt.format(getCount(it)) + '</span></div>'
    }).join("") || '<div class="empty-state" style="padding:var(--space-md);text-align:left">no data</div>'
  }
  renderAtlas(document.getElementById("org-list"), companies, c => c.name, c => c.count)
  document.getElementById("org-count").textContent = (summary.distinctCompanies || 0)
  renderAtlas(document.getElementById("role-list"), positions, p => p.keyword, p => p.count)
  document.getElementById("role-count").textContent = (summary.distinctPositions || 0)
  renderAtlas(document.getElementById("ind-list"), industries, i => i.industry, i => i.count)
  document.getElementById("ind-count").textContent = (summary.distinctIndustries || 0)
  renderAtlas(document.getElementById("dom-list"), domains.map(d => Object.assign({}, d, { label: d.domain + (d.kind === "personal" ? " · personal" : "") })), d => d.label, d => d.count)
  document.getElementById("dom-count").textContent = (summary.distinctEmailDomains || 0)

  // ---------- Reconnect queue ----------
  document.getElementById("queue-grid").innerHTML = queue.slice(0, 20).map(q => {
    const r = lookupRow(q.id)
    if (!r) return ""
    const name = escapeHtml(visibleName(r))
    const orgLine = [escapeHtml(r.position || ""), escapeHtml(r.company || "")].filter(Boolean).join(" · ")
    const sub = [orgLine || "(no company / role)", r.connectedOn ? relYearsAgo(r.yearsAgo) : "(no date)"].join(" — ")
    const reasons = (q.reasons || []).map(rsn => '<span class="qreason">' + escapeHtml(rsn) + '</span>').join("")
    return '<div class="queue">' +
      '<div class="qhead"><span class="qname">' + name + '</span>' +
      '<span class="qscore" title="Reconnect score: 0..1, heuristic">' + (q.score || 0).toFixed(2) + '</span></div>' +
      '<span class="qsub">' + sub + '</span>' +
      '<div class="qreasons">' + reasons + '</div>' +
      '<button class="qcopy" data-copy="' + name + '">Copy name</button>' +
      '</div>'
  }).join("") || '<div class="empty-state">No reconnect candidates — every contact is either freshly connected or has both company and email already.</div>'

  // ---------- Audit ----------
  function auditCard(label, count, sub, sampleIds){
    const c = (count || 0)
    const cls = c === 0 ? "audit-count zero" : "audit-count"
    let subHtml = ""
    if (sub) subHtml = '<div class="audit-sub">' + sub + '</div>'
    else if (sampleIds && sampleIds.length) {
      const names = sampleIds.slice(0, 3).map(id => {
        const r = lookupRow(id)
        return r ? escapeHtml(ellipsize(visibleName(r), 22)) : id
      }).join(" · ")
      subHtml = '<div class="audit-sub">e.g. ' + names + '</div>'
    }
    return '<div class="audit"><div class="audit-label">' + escapeHtml(label) + '</div>' +
      '<div class="' + cls + '">' + fmt.format(c) + '</div>' + subHtml + '</div>'
  }
  function auditFromBlock(label, block){
    if (!block) return auditCard(label, 0)
    return auditCard(label, block.count, null, block.sampleIds)
  }
  function auditDupCard(label, clusters){
    if (!clusters || !clusters.length) return auditCard(label, 0)
    const samples = clusters.slice(0, 3).map(c => {
      const r = lookupRow(c.ids[0])
      const display = r ? visibleName(r) : (c.name || c.url || "?")
      return escapeHtml(ellipsize(display, 22)) + " (" + c.ids.length + ")"
    }).join(" · ")
    return '<div class="audit"><div class="audit-label">' + escapeHtml(label) + '</div>' +
      '<div class="audit-count">' + clusters.length + '</div>' +
      '<div class="audit-sub">' + samples + '</div></div>'
  }
  const auditCards = [
    auditFromBlock("Missing email", audit.missingEmail),
    auditFromBlock("Missing current company", audit.missingCompany),
    auditFromBlock("Missing role", audit.missingPosition),
    auditFromBlock("Stale (5y+)", audit.staleOld),
    auditFromBlock("Very recent (<90d)", audit.veryRecent),
    auditDupCard("Duplicate names", audit.duplicateNameClusters),
    auditDupCard("Duplicate URLs", audit.duplicateUrlClusters),
  ]
  document.getElementById("audit-grid").innerHTML = auditCards.join("")

  // ---------- Filter chips ----------
  const state = {
    search: "",
    sort: "recent",
    has: new Set(),
    industry: new Set(),
    company: new Set(),
    audit: new Set(),
    page: 1,
  }
  const PAGE_SIZE = 36

  function buildChip(label, key, group, count){
    return '<span class="chip" data-group="' + group + '" data-key="' + escapeHtml(key) + '">' +
      escapeHtml(label) + (count != null ? ' <span class="count">' + fmt.format(count) + '</span>' : "") +
      '</span>'
  }
  document.getElementById("has-chips").innerHTML = [
    buildChip("Email", "email", "has", summary.withEmail),
    buildChip("Company", "company", "has", summary.withCompany),
    buildChip("Role", "position", "has", summary.withPosition),
    buildChip("LinkedIn URL", "url", "has", summary.withUrl),
  ].join("")
  document.getElementById("ind-chips").innerHTML = industries.slice(0, 8).map(i =>
    buildChip(i.industry, i.industry, "industry", i.count)
  ).join("")
  document.getElementById("org-chips").innerHTML = companies.slice(0, 8).map(c =>
    buildChip(c.name, c.name, "company", c.count)
  ).join("")
  document.getElementById("audit-chips").innerHTML = [
    buildChip("Stale 5y+", "stale", "audit", audit.staleOld && audit.staleOld.count),
    buildChip("Very recent", "recent", "audit", audit.veryRecent && audit.veryRecent.count),
    buildChip("Missing company", "no-company", "audit", audit.missingCompany && audit.missingCompany.count),
    buildChip("Missing email", "no-email", "audit", audit.missingEmail && audit.missingEmail.count),
    buildChip("Possible duplicate", "duplicate", "audit", (audit.duplicateNameClusters || []).length + (audit.duplicateUrlClusters || []).length),
  ].join("")

  document.getElementById("contact-list").addEventListener("click", onCardClick)
  document.querySelectorAll(".chips").forEach(c => c.addEventListener("click", onChipClick))
  document.getElementById("drill-search").addEventListener("input", e => { state.search = e.target.value.toLowerCase(); state.page = 1; renderList() })
  document.getElementById("drill-sort").addEventListener("change", e => { state.sort = e.target.value; renderList() })
  document.getElementById("drill-clear").addEventListener("click", () => {
    state.search = ""
    state.has.clear(); state.industry.clear(); state.company.clear(); state.audit.clear()
    state.page = 1
    document.getElementById("drill-search").value = ""
    document.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active"))
    renderList()
  })

  function onChipClick(ev){
    const chip = ev.target.closest(".chip")
    if (!chip) return
    const group = chip.dataset.group
    const key = chip.dataset.key
    const set = state[group]
    if (!set) return
    if (set.has(key)) set.delete(key)
    else set.add(key)
    chip.classList.toggle("active")
    state.page = 1
    renderList()
  }

  function matchRow(r){
    if (state.search) {
      const hay = ((r.fullName || "") + " " + (r.company || "") + " " + (r.position || "") + " " +
        (r.email || "") + " " + (r.url || "") + " " + (r.industry || "")).toLowerCase()
      if (hay.indexOf(state.search) === -1) return false
    }
    if (state.has.size) {
      for (const h of state.has) {
        if (h === "email" && !r.email) return false
        if (h === "company" && !r.company) return false
        if (h === "position" && !r.position) return false
        if (h === "url" && !r.url) return false
      }
    }
    if (state.industry.size && !state.industry.has(r.industry || "")) return false
    if (state.company.size && !state.company.has(r.company || "")) return false
    if (state.audit.size) {
      for (const a of state.audit) {
        if (a === "stale" && !r.flags.includes("stale-old")) return false
        if (a === "recent" && !r.flags.includes("very-recent")) return false
        if (a === "no-company" && !r.flags.includes("missing-company")) return false
        if (a === "no-email" && !r.flags.includes("missing-email")) return false
        if (a === "duplicate" && !(r.flags.includes("duplicate-name") || r.flags.includes("duplicate-url"))) return false
      }
    }
    return true
  }

  function compareRows(a, b){
    if (state.sort === "name") return (a.fullName || "").localeCompare(b.fullName || "")
    if (state.sort === "oldest") return (a.connectedOn || "").localeCompare(b.connectedOn || "")
    if (state.sort === "reconnect") return (b.reconnectScore || 0) - (a.reconnectScore || 0)
    return (b.connectedOn || "").localeCompare(a.connectedOn || "")
  }

  function renderList(){
    const pool = rows.filter(matchRow).sort(compareRows)
    const visible = pool.slice(0, state.page * PAGE_SIZE)
    document.getElementById("drill-count").textContent = visible.length + " of " + pool.length
    document.getElementById("contact-list").innerHTML = visible.map(renderContact).join("") ||
      '<div class="empty-state">No connections match these filters.</div>'
    const more = document.getElementById("loadmore")
    if (pool.length > visible.length) {
      more.innerHTML = '<button id="loadmore-btn">Show more (' + (pool.length - visible.length) + ' remaining)</button>'
      const btn = document.getElementById("loadmore-btn")
      if (btn) btn.addEventListener("click", () => { state.page += 1; renderList() })
    } else {
      more.innerHTML = ""
    }
  }

  function renderContact(r){
    const masked = !maskState
    const name = escapeHtml(visibleName(r))
    const orgLine = [escapeHtml(r.position || ""), escapeHtml(r.company || "")].filter(Boolean).join(" · ")
    const indBadge = r.industry ? '<span class="badge cat">' + escapeHtml(r.industry) + '</span>' : ""
    const dupBadge = r.flags.includes("duplicate-name") || r.flags.includes("duplicate-url") ? '<span class="badge dup">Possible duplicate</span>' : ""
    const recentBadge = r.flags.includes("very-recent") ? '<span class="badge recent">Just connected</span>' : ""
    const staleBadge = r.flags.includes("stale-old") ? '<span class="badge stale">Stale ' + Math.round(r.yearsAgo || 0) + 'y</span>' : ""
    const flagBadges = []
    if (r.flags.includes("missing-company")) flagBadges.push('<span class="badge flag">No company</span>')
    if (r.flags.includes("missing-email")) flagBadges.push('<span class="badge flag" style="opacity:.6">No email</span>')
    const emailLine = r.email
      ? '<div class="field"><span class="label">Email</span><span class="v" data-real="' + escapeHtml(r.email) + '" data-mask="' + escapeHtml(r.emailMasked || maskEmail(r.email)) + '">' + escapeHtml(masked ? (r.emailMasked || maskEmail(r.email)) : r.email) + '</span></div>'
      : '<div class="field"><span class="label">Email</span><span class="v" style="cursor:default;color:var(--fg-muted);text-decoration:none">(not shared)</span></div>'
    const urlLine = r.url
      ? '<div class="field"><span class="label">URL</span><span class="v url" title="Page is offline. Use the copy button to copy the URL.">' + escapeHtml(ellipsize(r.url.replace(/^https?:\/\/(www\.)?/, ""), 36)) + '</span></div>'
      : ""
    const dateLine = r.connectedOn
      ? '<div class="rev">Connected ' + escapeHtml(r.connectedOn) + ' · ' + escapeHtml(relYearsAgo(r.yearsAgo)) + '</div>'
      : '<div class="rev muted">No connection date</div>'
    const reasonsLine = r.reconnectScore > 0.4
      ? '<div class="reasons"><span class="reason">reconnect score ' + (r.reconnectScore || 0).toFixed(2) + '</span></div>'
      : ""
    return '<article class="contact" data-id="' + r.id + '">' +
      '<div class="name' + (visibleName(r) === "(no name)" ? " italic" : "") + '">' + name + '</div>' +
      (orgLine ? '<div class="org-line">' + orgLine + '</div>' : '<div class="org-line muted">(no role / company)</div>') +
      emailLine + urlLine + dateLine +
      '<div class="badges">' + indBadge + recentBadge + staleBadge + dupBadge + flagBadges.join("") + '</div>' +
      reasonsLine +
      '</article>'
  }

  function maskEmail(email){
    const at = (email || "").indexOf("@")
    if (at <= 0) return email || ""
    const local = email.slice(0, at)
    const domain = email.slice(at + 1)
    if (local.length <= 2) return (local[0] || "•") + "•@" + domain
    return local[0] + "••••" + local[local.length - 1] + "@" + domain
  }

  // Per-card click → reveal/hide email
  function onCardClick(ev){
    const v = ev.target.closest(".contact .field .v")
    if (!v) return
    if (v.classList.contains("url")) return
    if (!v.dataset.real) return
    if (v.textContent === v.dataset.real) v.textContent = v.dataset.mask
    else v.textContent = v.dataset.real
  }

  // ---------- Mask toggle (page-wide) ----------
  let maskState = true
  const maskBtn = document.getElementById("mask-toggle")
  const maskLbl = document.getElementById("mask-toggle-label")
  function applyMask(){
    document.querySelectorAll(".contact .field .v[data-real]").forEach(v => {
      v.textContent = maskState ? v.dataset.mask : v.dataset.real
    })
    maskBtn.classList.toggle("on", !maskState)
    maskLbl.textContent = maskState ? "Show real emails" : "Hide real emails"
  }
  maskBtn.addEventListener("click", () => { maskState = !maskState; applyMask() })

  // ---------- Copy controls ----------
  document.getElementById("queue-grid").addEventListener("click", ev => {
    const btn = ev.target.closest(".qcopy")
    if (!btn) return
    copyToClipboard(btn.dataset.copy || "", btn)
  })
  document.getElementById("copy-md-btn").addEventListener("click", e => {
    copyToClipboard(buildMarkdownSummary(), e.currentTarget)
  })
  document.getElementById("jump-table-btn").addEventListener("click", () => {
    document.getElementById("head-table").scrollIntoView({ behavior: "smooth", block: "start" })
  })

  function buildMarkdownSummary(){
    const lines = []
    lines.push("# " + (document.title || "LinkedIn connections"))
    lines.push("")
    lines.push("**Connections:** " + (summary.contactCount || 0))
    lines.push("**Period:** " + (summary.period || "(empty)"))
    lines.push("**Top company:** " + (summary.topCompany || "(none)") + " (" + (summary.topCompanyCount || 0) + ")")
    lines.push("**Top industry:** " + (summary.topIndustry || "(none)"))
    lines.push("**Coverage:** " + (summary.withCompany || 0) + " with company · " + (summary.withPosition || 0) + " with role · " + (summary.withEmail || 0) + " with email")
    lines.push("")
    if (spikes.length) {
      lines.push("## Growth spikes")
      for (const s of spikes) lines.push("- " + s.label)
      lines.push("")
    }
    lines.push("## Top companies")
    for (const c of companies.slice(0, 8)) lines.push("- " + c.name + " — " + c.count)
    lines.push("")
    lines.push("## Industries")
    for (const i of industries.slice(0, 8)) lines.push("- " + i.industry + " — " + i.count)
    lines.push("")
    lines.push("## Audit")
    if (audit.missingEmail) lines.push("- Missing email: " + audit.missingEmail.count)
    if (audit.missingCompany) lines.push("- Missing company: " + audit.missingCompany.count)
    if (audit.missingPosition) lines.push("- Missing role: " + audit.missingPosition.count)
    if (audit.staleOld) lines.push("- Stale (5y+): " + audit.staleOld.count)
    if (audit.veryRecent) lines.push("- Very recent (<90d): " + audit.veryRecent.count)
    if (audit.duplicateNameClusters) lines.push("- Duplicate names: " + audit.duplicateNameClusters.length)
    if (audit.duplicateUrlClusters) lines.push("- Duplicate URLs: " + audit.duplicateUrlClusters.length)
    lines.push("")
    lines.push("_Audit summary only — individual connections intentionally omitted._")
    return lines.join("\n")
  }
  function copyToClipboard(text, btn){
    const orig = btn.textContent
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "Copied"
      setTimeout(() => { btn.textContent = orig }, 1400)
    }).catch(() => {
      window.prompt("Copy this:", text)
      btn.textContent = "Copied"
      setTimeout(() => { btn.textContent = orig }, 1400)
    })
  }

  renderList()
})()
  </script>
</body>
</html>`

async function main() {
  const args = process.argv.slice(2)
  if (!args.length) {
    console.error("Usage: node scripts/render_linkedin_connections_fallback.mjs INPUT --out OUT --title TITLE")
    process.exit(1)
  }
  const input = args[0]
  const out = arg(args, "--out") || input.replace(/\.[^.]+$/, ".html")
  const title = arg(args, "--title") || path.basename(input).replace(/\.[^.]+$/, "")

  const parser = await pickParser(input)
  if (!parser) { console.error("No parser matched", input); process.exit(2) }
  const parsed = await parser.parse(input)
  if (parsed.contentType !== "linkedin-connections") {
    console.error("Expected linkedin-connections, got", parsed.contentType)
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
  return i >= 0 ? args[i+1] : null
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))
}
function inlineJson(o) {
  return JSON.stringify(o).replace(/<\/(script)/gi, "<\\/$1")
}

await main()

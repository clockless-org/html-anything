/**
 * Offline fallback renderer for the sensitive-record family
 * (lab-results, medical-visit, legal-chronology). The canonical
 * pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI
 * key. This script reuses the same parser, then applies a
 * hand-tuned shared template that satisfies the `_sensitive.md`
 * contract (timeline, parties, documents, missing-and-next-
 * questions, drill-down) plus subtype-specific sections (lab
 * out-of-reference + trends; medical encounters + medications;
 * legal case header + deadlines + filings).
 *
 * The template still emits `__DATA__` and is injected with the
 * SAME substitution logic htmlize.ts uses, so the resulting page
 * renders the full inlined data identically to an LLM-designed
 * page.
 *
 * Usage:
 *   node scripts/render_sensitive_fallback.mjs INPUT --out OUT --title TITLE
 */
import * as fs from "node:fs/promises"
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
  --primary-fixed-dim:#ffb597; --on-primary:#fff;
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
  --radius-sm:8px; --radius-md:12px; --radius-lg:16px; --radius-xl:20px; --radius-pill:9999px;
  --shadow-sm:0 1px 2px rgba(30,27,25,.04); --shadow-md:0 4px 12px rgba(30,27,25,.08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:#060B18; --surface:#0B1426; --surface-container-lowest:#101D35;
    --surface-container-low:#101D35; --surface-container:#162544; --surface-container-high:#1c2d52;
    --fg-1:#F8FAFC; --fg-2:#CBD5E1; --fg-muted:#64748B;
    --border:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.14);
    --primary:#FF6B35;
    --shadow-md:0 4px 12px rgba(0,0,0,.4);
  }
}
*,*::before,*::after{box-sizing:border-box;margin:0}
html,body{background:var(--bg);color:var(--fg-1);font-family:var(--font-body);
  font-size:15.5px;line-height:1.55;-webkit-font-smoothing:antialiased}
body{min-height:100vh}
main{max-width:1200px;margin:0 auto;padding:var(--space-2xl) var(--space-xl) var(--space-5xl)}
h1,h2,h3,h4{font-family:var(--font-headline);letter-spacing:-.01em;font-weight:600;color:var(--fg-1)}
h1{font-size:clamp(28px,4.6vw,42px);font-weight:700;line-height:1.05;letter-spacing:-.02em}
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
.hero h1 .accent{background:linear-gradient(135deg,var(--primary) 0%,#7b40e0 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.hero p.editorial{margin-top:var(--space-lg);color:var(--fg-2);font-size:17px;
  max-width:78ch;line-height:1.5}
.privacy-strip{background:var(--surface-container);border:1px solid var(--border-strong);
  border-radius:var(--radius-md);padding:var(--space-md) var(--space-lg);
  font-size:13px;color:var(--fg-2);margin-top:var(--space-xl);
  display:flex;gap:var(--space-md);align-items:flex-start}
.privacy-strip .lock{font-family:var(--font-mono);font-size:11px;color:var(--primary);
  background:var(--surface-container-lowest);padding:2px 8px;border-radius:var(--radius-pill);
  border:1px solid var(--border-strong);text-transform:uppercase;letter-spacing:.08em;flex-shrink:0}
.section{margin-top:var(--space-3xl)}
.section-head{display:flex;justify-content:space-between;align-items:baseline;
  gap:var(--space-md);margin-bottom:var(--space-lg);flex-wrap:wrap}
.section-head .meta{color:var(--fg-muted);font-size:13px;font-family:var(--font-mono)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--space-md)}
.kpi{background:var(--surface-container-lowest);border:1px solid var(--border);
  border-radius:var(--radius-lg);padding:var(--space-lg)}
.kpi .label{font-size:12px;color:var(--fg-muted);text-transform:uppercase;
  letter-spacing:.08em;font-family:var(--font-mono);margin-bottom:var(--space-sm)}
.kpi .value{font-family:var(--font-headline);font-size:32px;font-weight:700;
  letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--fg-1)}
.kpi .sub{margin-top:var(--space-xs);color:var(--fg-muted);font-size:13px}
.card{background:var(--surface-container-lowest);border:1px solid var(--border);
  border-radius:var(--radius-lg);padding:var(--space-lg);box-shadow:var(--shadow-sm)}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2xl)}
@media (max-width:760px){.grid-2{grid-template-columns:1fr}}
.timeline{display:flex;flex-direction:column;gap:var(--space-md)}
.tl-row{display:grid;grid-template-columns:120px 1fr;gap:var(--space-md);
  padding:var(--space-md);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest)}
.tl-row .date{font-family:var(--font-mono);font-size:12.5px;font-variant-numeric:tabular-nums;
  color:var(--fg-2);align-self:start}
.tl-row .body{font-size:14.5px;color:var(--fg-1)}
.tl-row .body .kind{display:inline-block;font-family:var(--font-mono);font-size:11px;
  padding:1px 8px;border-radius:var(--radius-pill);background:var(--surface-container);
  color:var(--primary);text-transform:uppercase;letter-spacing:.08em;margin-right:var(--space-sm)}
.tl-row .body .party{font-size:13px;color:var(--fg-muted);margin-top:2px}
.tl-row .body .detail{font-size:13px;color:var(--fg-muted);margin-top:4px}
.list{display:flex;flex-direction:column;gap:var(--space-sm)}
.list-row{display:flex;justify-content:space-between;align-items:baseline;
  padding:var(--space-sm) var(--space-md);border-radius:var(--radius-sm);
  background:var(--surface-container)}
.list-row .name{font-size:14.5px;font-weight:500}
.list-row .role{font-size:12px;color:var(--fg-muted);font-family:var(--font-mono);
  text-transform:uppercase;letter-spacing:.06em}
.list-row .count{font-size:13px;color:var(--fg-muted);font-family:var(--font-mono);
  font-variant-numeric:tabular-nums}
.pill{display:inline-block;padding:1px 8px;border-radius:var(--radius-pill);
  font-family:var(--font-mono);font-size:11px;letter-spacing:.04em;
  text-transform:uppercase;font-weight:500;margin-left:var(--space-sm)}
.pill.inferred{background:var(--surface-container-high);color:var(--fg-2);border:1px solid var(--border-strong)}
.pill.missing{background:rgba(239,68,68,.12);color:var(--red);border:1px solid rgba(239,68,68,.4)}
.pill.present{background:rgba(16,185,129,.12);color:var(--green);border:1px solid rgba(16,185,129,.4)}
.pill.above{background:rgba(245,158,11,.12);color:#a05a00;border:1px solid rgba(245,158,11,.4)}
.pill.below{background:rgba(59,130,246,.12);color:var(--blue);border:1px solid rgba(59,130,246,.4)}
.pill.in-range{background:rgba(16,185,129,.10);color:#0b7355;border:1px solid rgba(16,185,129,.3)}
.pill.no-range{background:var(--surface-container-high);color:var(--fg-muted);border:1px solid var(--border-strong)}
.q-list{display:flex;flex-direction:column;gap:var(--space-sm)}
.q-list .q{padding:var(--space-md);border-left:3px solid var(--primary);
  background:var(--surface-container-low);border-radius:0 var(--radius-md) var(--radius-md) 0;
  font-size:14.5px;line-height:1.5}
.miss-list{display:flex;flex-direction:column;gap:var(--space-sm);margin-bottom:var(--space-lg)}
.miss-list .miss{padding:var(--space-md);background:rgba(245,158,11,.06);
  border-left:3px solid var(--yellow);border-radius:0 var(--radius-md) var(--radius-md) 0;
  font-size:14px}
.miss-list .miss .lbl{font-weight:500}
.miss-list .miss .det{font-size:13px;color:var(--fg-muted);margin-top:2px}
.empty-state{padding:var(--space-md);color:var(--fg-muted);font-size:14px;font-style:italic}
.lab-table,.row-table{width:100%;border-collapse:collapse;font-size:14px}
.lab-table th,.lab-table td,.row-table th,.row-table td{
  padding:var(--space-sm) var(--space-md);text-align:left;
  border-bottom:1px solid var(--border)}
.lab-table th,.row-table th{font-family:var(--font-mono);font-size:11.5px;
  text-transform:uppercase;letter-spacing:.06em;color:var(--fg-muted);
  background:var(--surface-container);font-weight:500}
.lab-table tbody tr:hover{background:var(--surface-container)}
.lab-table .num,.row-table .num{font-family:var(--font-mono);font-variant-numeric:tabular-nums;text-align:right}
.lab-table .out{background:rgba(245,158,11,.06)}
.lab-table .below-row{background:rgba(59,130,246,.06)}
.panel-group{margin-bottom:var(--space-xl)}
.panel-group h3{font-size:15px;margin-bottom:var(--space-sm);
  display:flex;justify-content:space-between;align-items:baseline}
.panel-group h3 .meta{font-size:12px;font-family:var(--font-mono);color:var(--fg-muted)}
.trends{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-md)}
.trend{background:var(--surface-container-lowest);border:1px solid var(--border);
  border-radius:var(--radius-md);padding:var(--space-md)}
.trend h4{font-size:13.5px;margin-bottom:var(--space-xs)}
.trend .reading{font-family:var(--font-mono);font-size:12px;color:var(--fg-muted);
  margin-bottom:var(--space-sm)}
.trend svg{width:100%;height:60px;display:block}
.trend .latest{font-family:var(--font-mono);font-size:12.5px;margin-top:var(--space-xs);
  font-variant-numeric:tabular-nums;color:var(--fg-2)}
.encounter{background:var(--surface-container-lowest);border:1px solid var(--border);
  border-radius:var(--radius-lg);padding:var(--space-lg);margin-bottom:var(--space-md)}
.encounter .head{display:flex;justify-content:space-between;align-items:baseline;
  gap:var(--space-md);flex-wrap:wrap;margin-bottom:var(--space-sm)}
.encounter .head .date{font-family:var(--font-mono);font-size:13px;color:var(--fg-2);
  font-variant-numeric:tabular-nums}
.encounter .head .type{font-family:var(--font-mono);font-size:11px;text-transform:uppercase;
  letter-spacing:.08em;color:var(--primary);background:var(--surface-container);
  padding:2px 8px;border-radius:var(--radius-pill)}
.encounter .meta-row{font-size:13px;color:var(--fg-muted);margin-bottom:var(--space-sm)}
.encounter .reason{font-size:14.5px;color:var(--fg-1);margin-bottom:var(--space-sm)}
.encounter .vitals{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-sm)}
.encounter .vital{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-2);
  background:var(--surface-container);padding:2px 8px;border-radius:var(--radius-sm)}
.encounter .plan{margin-top:var(--space-sm);padding:var(--space-sm) var(--space-md);
  background:var(--surface-container);border-radius:var(--radius-sm);
  font-style:italic;font-size:13.5px;color:var(--fg-2)}
.deadlines{display:flex;flex-direction:column;gap:var(--space-sm)}
.deadline{display:grid;grid-template-columns:120px 80px 1fr;gap:var(--space-md);
  padding:var(--space-md);background:var(--surface-container-lowest);
  border:1px solid var(--border);border-radius:var(--radius-md);font-size:13.5px}
.deadline .d{font-family:var(--font-mono);font-variant-numeric:tabular-nums;color:var(--fg-1)}
.deadline .rel{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);
  background:var(--surface-container);padding:2px 8px;border-radius:var(--radius-pill);
  text-align:center;align-self:start}
.deadline .src{color:var(--fg-2)}
.case-card{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:var(--space-md);padding:var(--space-lg);background:var(--surface-container-lowest);
  border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)}
.case-card .field .label{font-family:var(--font-mono);font-size:11px;text-transform:uppercase;
  letter-spacing:.08em;color:var(--fg-muted);margin-bottom:2px}
.case-card .field .value{font-family:var(--font-mono);font-size:13.5px;color:var(--fg-1)}
.drill{background:var(--surface-container-lowest);border:1px solid var(--border);
  border-radius:var(--radius-lg);overflow:hidden}
.drill > summary{cursor:pointer;padding:var(--space-lg);
  display:flex;justify-content:space-between;align-items:center;font-weight:500;
  list-style:none;font-size:15px}
.drill > summary::-webkit-details-marker{display:none}
.drill > summary::after{content:"▾";color:var(--fg-muted);font-size:14px;
  transition:transform .2s}
.drill[open] > summary::after{transform:rotate(180deg)}
.drill > summary:hover{background:var(--surface-container)}
.drill-body{padding:var(--space-lg);border-top:1px solid var(--border)}
.drill-body input[type=search]{width:100%;padding:var(--space-md);
  background:var(--surface-container);border:1px solid var(--border-strong);
  border-radius:var(--radius-sm);font-size:14px;margin-bottom:var(--space-md)}
.toolbar{display:flex;gap:var(--space-sm);flex-wrap:wrap;align-items:center;
  margin-bottom:var(--space-md)}
.chip{padding:var(--space-xs) var(--space-md);border-radius:var(--radius-pill);
  background:var(--surface-container);border:1px solid var(--border-strong);
  font-size:12.5px;font-family:var(--font-mono);cursor:pointer;color:var(--fg-2)}
.chip.active{background:var(--primary);color:var(--on-primary);
  border-color:var(--primary)}
.copy-btn{padding:var(--space-xs) var(--space-md);background:var(--surface-container);
  border:1px solid var(--border-strong);border-radius:var(--radius-pill);
  font-size:12.5px;font-family:var(--font-mono);cursor:pointer;color:var(--fg-2)}
.copy-btn:hover{background:var(--surface-container-high)}
.callout-card{padding:var(--space-md);background:var(--surface-container-lowest);
  border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:var(--space-sm)}
.callout-card .head{display:flex;justify-content:space-between;align-items:baseline;
  gap:var(--space-md);flex-wrap:wrap;margin-bottom:var(--space-xs)}
.callout-card .head .test{font-weight:500;font-size:14.5px}
.callout-card .head .value{font-family:var(--font-mono);font-variant-numeric:tabular-nums;
  font-size:14px;color:var(--fg-1)}
.callout-card .ref{font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.callout-card .meta{font-size:12px;color:var(--fg-muted);margin-top:var(--space-xs)}
footer{margin-top:var(--space-5xl);padding-top:var(--space-2xl);
  border-top:1px solid var(--border);color:var(--fg-muted);font-size:13px}
footer p{margin-bottom:var(--space-md)}
footer .caveat{font-style:italic}
.med-list{display:flex;flex-direction:column;gap:var(--space-sm)}
.med{padding:var(--space-sm) var(--space-md);background:var(--surface-container);
  border-radius:var(--radius-sm);font-size:14px;display:flex;justify-content:space-between;
  gap:var(--space-md);flex-wrap:wrap}
.med .name{font-weight:500}
.med .dose{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-2)}
.med .ix{font-size:12.5px;color:var(--fg-muted)}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="eyebrow"><span id="eyebrow-text">Sensitive record</span></span>
      <h1><span class="accent" id="hero-title">__TITLE__</span></h1>
      <p class="editorial" id="hero-editorial"></p>
      <div class="privacy-strip">
        <span class="lock">Local</span>
        <span>Names, MRNs, case numbers, policy IDs, and dates inlined in this page never leave your machine. For sharing, generate from a redacted export. <strong>This page is an organizational summary, not medical / legal / insurance advice.</strong></span>
      </div>
    </section>

    <section class="section" aria-labelledby="head-summary">
      <div class="section-head">
        <h2 id="head-summary">Summary</h2>
        <span class="meta" id="summary-meta"></span>
      </div>
      <div class="kpis" id="kpis"></div>
    </section>

    <section class="section" id="case-section" hidden aria-labelledby="head-case">
      <div class="section-head"><h2 id="head-case">Case header</h2><span class="meta">Verbatim from chronology</span></div>
      <div class="case-card" id="case-card"></div>
    </section>

    <section class="section" aria-labelledby="head-timeline">
      <div class="section-head"><h2 id="head-timeline">Timeline</h2><span class="meta" id="tl-meta"></span></div>
      <div class="card"><div class="timeline" id="timeline"></div></div>
    </section>

    <section class="section" id="oor-section" hidden aria-labelledby="head-oor">
      <div class="section-head">
        <h2 id="head-oor">Outside reference range</h2>
        <span class="meta">Numeric comparison to range printed on each row</span>
      </div>
      <div class="card" id="oor-card"></div>
    </section>

    <section class="section" id="trends-section" hidden aria-labelledby="head-trends">
      <div class="section-head"><h2 id="head-trends">Trends</h2><span class="meta">Repeated tests over time</span></div>
      <div class="trends" id="trends"></div>
    </section>

    <section class="section" id="encounters-section" hidden aria-labelledby="head-enc">
      <div class="section-head"><h2 id="head-enc">Encounters</h2><span class="meta" id="enc-meta"></span></div>
      <div id="encounters"></div>
    </section>

    <section class="section" id="meds-section" hidden aria-labelledby="head-meds">
      <div class="section-head"><h2 id="head-meds">Medications</h2><span class="meta">Verbatim from record</span></div>
      <div class="card"><div class="med-list" id="meds"></div></div>
    </section>

    <section class="section" id="filings-section" hidden aria-labelledby="head-filings">
      <div class="section-head"><h2 id="head-filings">Filings</h2><span class="meta" id="filings-meta"></span></div>
      <div class="card"><div class="list" id="filings"></div></div>
    </section>

    <section class="section" id="deadlines-section" hidden aria-labelledby="head-deadlines">
      <div class="section-head"><h2 id="head-deadlines">Deadlines</h2><span class="meta">Dates listed on the document</span></div>
      <div class="deadlines" id="deadlines"></div>
    </section>

    <section class="section">
      <div class="grid-2">
        <div>
          <div class="section-head"><h2 id="head-parties">Parties</h2><span class="meta" id="parties-meta"></span></div>
          <div class="card"><div class="list" id="parties"></div></div>
        </div>
        <div>
          <div class="section-head"><h2 id="head-docs">Documents</h2><span class="meta" id="docs-meta"></span></div>
          <div class="card"><div class="list" id="documents"></div></div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-mq">
      <div class="section-head"><h2 id="head-mq">Missing &amp; next questions</h2><span class="meta">Inferred from the record's text</span></div>
      <div class="card">
        <h3 style="margin-bottom:var(--space-sm)">Missing information</h3>
        <div class="miss-list" id="miss-list"></div>
        <h3 style="margin-bottom:var(--space-sm);margin-top:var(--space-lg)">Questions to ask</h3>
        <div class="q-list" id="q-list"></div>
        <div style="margin-top:var(--space-lg)">
          <button class="copy-btn" id="copy-md">Copy as Markdown</button>
          <span class="muted mono" id="copy-status" style="margin-left:var(--space-md);font-size:12px"></span>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-drill">
      <details class="drill" id="drill">
        <summary>
          <span><span id="drill-summary-text">Browse the full record</span></span>
          <span class="meta mono" id="drill-summary-count"></span>
        </summary>
        <div class="drill-body">
          <input type="search" placeholder="Search rows, events, encounters…" id="drill-search">
          <div class="toolbar" id="drill-chips"></div>
          <div id="drill-content"></div>
        </div>
      </details>
    </section>

    <footer>
      <p class="caveat" id="caveat-line"></p>
      <p>Generated locally — your record never left your machine. The full content is embedded in this HTML and rendered in your browser. For sharing, generate from a redacted export with names, MRNs, case numbers, and policy IDs replaced or removed.</p>
      <p>Organizational summary, not medical / legal / insurance advice. Dates, parties, values, and missing-item callouts are pattern-matched from the file's text — verify against the original record and ask your clinician, attorney, or case manager before acting on anything here.</p>
      <p class="mono" id="footer-meta" style="margin-top:var(--space-md)"></p>
    </footer>
  </main>

  <script>
    const DATA = __DATA__;
    const HERO_TITLE = "__TITLE__";

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
    const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const fmtNum = n => n == null ? "—" : n.toLocaleString();

    document.title = HERO_TITLE;
    $("#hero-title").textContent = HERO_TITLE;

    const SUBTYPE_LABEL = {
      "lab-results": "Lab results",
      "medical-visit": "Medical visit record",
      "legal-chronology": "Legal case chronology",
    };
    const CAVEAT = {
      "lab-results": "Out-of-range flags compare numbers to the reference range printed on the same row in your file — they are not a diagnosis. Bring the original lab report to your clinician and ask whether any value here changes your care.",
      "medical-visit": "Visit dates, providers, and out-of-reference values are inferred from the file's text — bring the original record to your clinician and ask them whether anything here changes your care.",
      "legal-chronology": "Dates, parties, filings, and deadlines are inferred from the chronology's text — verify against the original case file and ask your attorney before relying on anything here. Deadlines listed in this page are dates the document mentions; they are not legal computations of filing windows or statutes of limitations.",
    };
    const subtype = DATA.subtype || DATA.format;
    $("#eyebrow-text").textContent = SUBTYPE_LABEL[subtype] || "Sensitive record";
    $("#caveat-line").textContent = CAVEAT[subtype] || "";

    const headlineSentence = () => {
      const parts = (DATA.summary?.headlineCount || []).map(h => h.value + " " + h.label).slice(0, 4).join(" · ");
      const period = DATA.summary?.period ? " over " + DATA.summary.period : "";
      const sub = SUBTYPE_LABEL[subtype] || "Record";
      return sub + " — " + parts + period + ".";
    };
    $("#hero-editorial").textContent = headlineSentence();
    $("#summary-meta").textContent = (DATA.summary?.period || "") + (DATA.summary?.durationLabel ? " · " + DATA.summary.durationLabel : "");

    /* ---- KPIs ---- */
    (() => {
      const kpis = DATA.summary?.headlineCount || [];
      const root = $("#kpis");
      kpis.forEach(k => {
        const el = document.createElement("div");
        el.className = "kpi";
        el.innerHTML = '<div class="label">' + escHtml(k.label) + '</div>' +
          '<div class="value">' + fmtNum(k.value) + '</div>';
        root.appendChild(el);
      });
    })();

    /* ---- Case header (legal only) ---- */
    if (subtype === "legal-chronology" && DATA.caseHeader) {
      $("#case-section").hidden = false;
      const fields = [
        ["Caption", DATA.caseHeader.caption],
        ["Docket", DATA.caseHeader.docket],
        ["Court", DATA.caseHeader.court],
        ["Matter", DATA.caseHeader.matter],
        ["Period", DATA.summary?.period],
      ];
      const root = $("#case-card");
      fields.forEach(([label, value]) => {
        const el = document.createElement("div");
        el.className = "field";
        el.innerHTML = '<div class="label">' + escHtml(label) + '</div>' +
          '<div class="value">' + escHtml(value || "(not present in this record)") + '</div>';
        root.appendChild(el);
      });
    }

    /* ---- Timeline ---- */
    (() => {
      const events = (DATA.events || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const root = $("#timeline");
      $("#tl-meta").textContent = events.length + " event" + (events.length === 1 ? "" : "s");
      events.forEach(e => {
        const el = document.createElement("div");
        el.className = "tl-row";
        el.innerHTML = '<div class="date">' + escHtml(e.dateText || e.date || "(undated)") + '</div>' +
          '<div class="body">' +
            '<span class="kind">' + escHtml(e.kind) + '</span>' +
            escHtml(e.title) +
            (e.party ? '<div class="party">' + escHtml(e.party) + '</div>' : '') +
            (e.detail ? '<div class="detail">' + escHtml(e.detail) + '</div>' : '') +
          '</div>';
        root.appendChild(el);
      });
    })();

    /* ---- Out-of-reference panel (lab only) ---- */
    if (subtype === "lab-results") {
      $("#oor-section").hidden = false;
      const oor = DATA.outOfRange || [];
      const root = $("#oor-card");
      if (oor.length === 0) {
        root.innerHTML = '<p class="empty-state">No values fall outside the reference ranges printed in this file.</p>';
      } else {
        oor.forEach(r => {
          const card = document.createElement("div");
          card.className = "callout-card";
          const dirLabel = r.direction === "above" ? "above" : "below";
          card.innerHTML =
            '<div class="head">' +
              '<div><span class="test">' + escHtml(r.test) + '</span>' +
                ' <span class="pill ' + r.direction + '">' + dirLabel + ' band</span>' +
                ' <span class="pill inferred">Inferred</span></div>' +
              '<div class="value">' + escHtml(r.valueText) + (r.unit ? " " + escHtml(r.unit) : "") + '</div>' +
            '</div>' +
            '<div class="ref">Reference printed on row: ' + escHtml(r.referenceText || "(none)") + '</div>' +
            '<div class="meta">' + (r.collectedAt ? "Drawn " + escHtml(r.collectedAt) : "Date not present") +
              (r.orderingProvider ? " · Ordered by " + escHtml(r.orderingProvider) : "") +
              (r.lab ? " · " + escHtml(r.lab) : "") + '</div>';
          root.appendChild(card);
        });
      }
    }

    /* ---- Trend sparklines (lab only) ---- */
    if (subtype === "lab-results" && (DATA.trends || []).length > 0) {
      $("#trends-section").hidden = false;
      const root = $("#trends");
      DATA.trends.forEach(t => {
        const W = 240, H = 60, PAD = 6;
        const pts = t.points;
        const ys = pts.map(p => p.value);
        const lo = Math.min(...ys, t.referenceLow ?? Infinity);
        const hi = Math.max(...ys, t.referenceHigh ?? -Infinity);
        const yMin = isFinite(lo) ? lo : Math.min(...ys);
        const yMax = isFinite(hi) ? hi : Math.max(...ys);
        const span = yMax - yMin || 1;
        const x = i => PAD + (W - 2 * PAD) * (i / Math.max(pts.length - 1, 1));
        const y = v => H - PAD - (H - 2 * PAD) * ((v - yMin) / span);
        const bandTop = t.referenceHigh != null ? y(t.referenceHigh) : 0;
        const bandBot = t.referenceLow != null ? y(t.referenceLow) : H;
        const bandRect = (t.referenceLow != null || t.referenceHigh != null)
          ? '<rect x="' + PAD + '" y="' + Math.min(bandTop, bandBot) + '" width="' + (W - 2 * PAD) + '" height="' + Math.abs(bandTop - bandBot) + '" fill="rgba(16,185,129,.10)"/>'
          : '';
        const path = pts.map((p, i) => (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + y(p.value).toFixed(1)).join(" ");
        const dots = pts.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="3" fill="var(--primary)"/>').join("");
        const refText = (t.referenceLow != null && t.referenceHigh != null) ? t.referenceLow + "–" + t.referenceHigh
          : (t.referenceHigh != null ? "<" + t.referenceHigh : (t.referenceLow != null ? ">" + t.referenceLow : ""));
        const latest = pts[pts.length - 1];
        const div = document.createElement("div");
        div.className = "trend";
        div.innerHTML = '<h4>' + escHtml(t.test) + '</h4>' +
          '<div class="reading">' + (refText ? "Reference: " + escHtml(refText) + (t.unit ? " " + escHtml(t.unit) : "") : "No reference range on row") + '</div>' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '">' +
            bandRect +
            '<path d="' + path + '" fill="none" stroke="var(--primary)" stroke-width="1.6"/>' +
            dots +
          '</svg>' +
          '<div class="latest">Latest: ' + escHtml(latest.value + (t.unit ? " " + t.unit : "")) + (latest.date ? " · " + escHtml(latest.date) : "") + '</div>';
        root.appendChild(div);
      });
    }

    /* ---- Encounters (medical only) ---- */
    if (subtype === "medical-visit") {
      $("#encounters-section").hidden = false;
      const root = $("#encounters");
      const encounters = DATA.encounters || [];
      $("#enc-meta").textContent = encounters.length + " encounter" + (encounters.length === 1 ? "" : "s");
      encounters.forEach(e => {
        const card = document.createElement("div");
        card.className = "encounter";
        card.innerHTML =
          '<div class="head">' +
            '<span class="date">' + escHtml(e.date || "(undated)") + '</span>' +
            (e.encounterType ? '<span class="type">' + escHtml(e.encounterType) + '</span>' : '') +
          '</div>' +
          (e.provider ? '<div class="meta-row">Provider: ' + escHtml(e.provider) + '</div>' : '') +
          (e.reason ? '<div class="reason">' + escHtml(e.reason) + '</div>' : '') +
          (e.vitals && e.vitals.length ? '<div class="vitals">' + e.vitals.map(v => '<span class="vital">' + escHtml(v.label) + ': ' + escHtml(v.value) + '</span>').join("") + '</div>' : '') +
          (e.plan ? '<div class="plan">Plan: ' + escHtml(e.plan) + '</div>' : '') +
          (e.followUp ? '<div class="meta-row" style="margin-top:var(--space-sm)">Follow-up: ' + escHtml(e.followUp) + '</div>' : '<div class="meta-row" style="margin-top:var(--space-sm)"><span class="pill missing">no follow-up date in record</span></div>');
        root.appendChild(card);
      });
    }

    /* ---- Medications (medical only) ---- */
    if (subtype === "medical-visit" && (DATA.medications || []).length > 0) {
      $("#meds-section").hidden = false;
      const root = $("#meds");
      DATA.medications.forEach(m => {
        const el = document.createElement("div");
        el.className = "med";
        el.innerHTML = '<div><span class="name">' + escHtml(m.name) + '</span>' +
          (m.dose ? ' <span class="dose">' + escHtml(m.dose) + '</span>' : '') +
          ' <span class="pill inferred">Inferred</span></div>' +
          (m.instructions ? '<span class="ix">' + escHtml(m.instructions) + '</span>' : '');
        root.appendChild(el);
      });
    }

    /* ---- Filings + Deadlines (legal only) ---- */
    if (subtype === "legal-chronology") {
      const filings = DATA.filings || [];
      if (filings.length > 0) {
        $("#filings-section").hidden = false;
        $("#filings-meta").textContent = filings.length + " filing" + (filings.length === 1 ? "" : "s");
        const root = $("#filings");
        filings.forEach(f => {
          const el = document.createElement("div");
          el.className = "list-row";
          el.innerHTML = '<div><span class="name">' + escHtml(f.title) + '</span>' +
            (f.party ? ' <span class="role">' + escHtml(f.party) + '</span>' : '') + '</div>' +
            '<div class="count">' + escHtml(f.date || "(undated)") + '</div>';
          root.appendChild(el);
        });
      }
      const deadlines = DATA.deadlines || [];
      if (deadlines.length > 0) {
        $("#deadlines-section").hidden = false;
        const root = $("#deadlines");
        deadlines.forEach(d => {
          const el = document.createElement("div");
          el.className = "deadline";
          const rel = d.daysFromToday == null ? "—"
            : (d.daysFromToday === 0 ? "today"
              : d.daysFromToday > 0 ? "in " + d.daysFromToday + "d"
              : Math.abs(d.daysFromToday) + "d ago");
          el.innerHTML = '<div class="d">' + escHtml(d.date) + '</div>' +
            '<div class="rel">' + escHtml(rel) + '</div>' +
            '<div class="src">' + escHtml(d.source) + ' <span class="pill inferred">Inferred</span></div>';
          root.appendChild(el);
        });
      }
    }

    /* ---- Parties + Documents ---- */
    (() => {
      const root = $("#parties");
      const parties = DATA.parties || [];
      $("#parties-meta").textContent = parties.length + " " + (parties.length === 1 ? "party" : "parties");
      if (parties.length === 0) {
        root.innerHTML = '<p class="empty-state">No parties extracted from this record.</p>';
      } else {
        parties.forEach(p => {
          const el = document.createElement("div");
          el.className = "list-row";
          el.innerHTML = '<div><span class="name">' + escHtml(p.name) + '</span></div>' +
            '<div><span class="role">' + escHtml(p.role) + '</span> <span class="count">×' + p.count + '</span></div>';
          root.appendChild(el);
        });
      }
    })();

    (() => {
      const root = $("#documents");
      const docs = DATA.documents || [];
      $("#docs-meta").textContent = docs.length + " document" + (docs.length === 1 ? "" : "s");
      if (docs.length === 0) {
        root.innerHTML = '<p class="empty-state">No documents referenced in this record.</p>';
      } else {
        docs.forEach(d => {
          const el = document.createElement("div");
          el.className = "list-row";
          el.innerHTML = '<div><span class="name">' + escHtml(d.name) + '</span> <span class="role">' + escHtml(d.kind) + '</span></div>' +
            '<div>' + (d.missing ? '<span class="pill missing">not present in this record</span>' : '<span class="pill present">present</span>') + '</div>';
          root.appendChild(el);
        });
      }
    })();

    /* ---- Missing items + Open questions ---- */
    (() => {
      const missRoot = $("#miss-list");
      const items = DATA.missingItems || [];
      if (items.length === 0) {
        missRoot.innerHTML = '<p class="empty-state">Nothing obvious missing in this record.</p>';
      } else {
        items.forEach(m => {
          const el = document.createElement("div");
          el.className = "miss";
          el.innerHTML = '<div class="lbl">' + escHtml(m.label) + ' <span class="pill inferred">Inferred</span></div>' +
            (m.detail ? '<div class="det">' + escHtml(m.detail) + '</div>' : '');
          missRoot.appendChild(el);
        });
      }
      const qRoot = $("#q-list");
      const qs = DATA.openQuestions || [];
      if (qs.length === 0) {
        qRoot.innerHTML = '<p class="empty-state">No follow-up questions surfaced from this record — bring it to your provider / attorney for a fuller review.</p>';
      } else {
        qs.forEach(q => {
          const el = document.createElement("div");
          el.className = "q";
          el.innerHTML = escHtml(q.question);
          qRoot.appendChild(el);
        });
      }
    })();

    /* ---- Copy as Markdown ---- */
    $("#copy-md").addEventListener("click", async () => {
      const lines = [];
      lines.push("# " + HERO_TITLE);
      lines.push("");
      lines.push("> " + headlineSentence());
      lines.push("");
      if (subtype === "legal-chronology" && DATA.caseHeader) {
        const c = DATA.caseHeader;
        if (c.caption) lines.push("**Caption:** " + c.caption);
        if (c.docket) lines.push("**Docket:** " + c.docket);
        if (c.court) lines.push("**Court:** " + c.court);
        lines.push("");
      }
      lines.push("## Timeline");
      (DATA.events || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).forEach(e => {
        lines.push("- " + (e.dateText || e.date || "(undated)") + " · [" + e.kind + "] " + e.title + (e.party ? " (" + e.party + ")" : ""));
      });
      lines.push("");
      lines.push("## Parties");
      (DATA.parties || []).forEach(p => lines.push("- " + p.name + " — " + p.role + " (×" + p.count + ")"));
      lines.push("");
      lines.push("## Documents");
      (DATA.documents || []).forEach(d => lines.push("- " + d.name + " — " + d.kind + (d.missing ? " (not present in this record)" : "")));
      lines.push("");
      lines.push("## Missing information");
      (DATA.missingItems || []).forEach(m => lines.push("- " + m.label + (m.detail ? " — " + m.detail : "")));
      lines.push("");
      lines.push("## Questions to ask");
      (DATA.openQuestions || []).forEach(q => lines.push("- " + q.question));
      lines.push("");
      lines.push("---");
      lines.push("");
      lines.push("*" + (CAVEAT[subtype] || "Organizational summary, not advice.") + "*");
      const md = lines.join("\n");
      try {
        await navigator.clipboard.writeText(md);
        $("#copy-status").textContent = "copied";
        setTimeout(() => { $("#copy-status").textContent = ""; }, 2000);
      } catch {
        $("#copy-status").textContent = "select-and-copy below ↓";
        const ta = document.createElement("textarea");
        ta.value = md;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); $("#copy-status").textContent = "copied"; } catch {}
        document.body.removeChild(ta);
      }
    });

    /* ---- Drill-down ---- */
    (() => {
      const content = $("#drill-content");
      const search = $("#drill-search");
      const chips = $("#drill-chips");
      let activeKind = "all";
      let allItems = [];
      let columns = [];

      if (subtype === "lab-results") {
        $("#drill-summary-text").textContent = "Browse all lab rows";
        $("#drill-summary-count").textContent = (DATA.rows || []).length + " rows";
        columns = ["test", "panel", "value", "unit", "reference", "direction", "date", "provider"];
        allItems = (DATA.rows || []).map(r => ({
          kind: r.direction,
          fields: {
            test: r.test, panel: r.panel || "—",
            value: r.valueText, unit: r.unit,
            reference: r.referenceText || "—",
            direction: r.direction === "in-range" ? "in range" : r.direction === "no-range" ? "no range" : r.direction,
            date: r.collectedAt || "—",
            provider: r.orderingProvider || "—",
          },
          searchText: [r.test, r.panel, r.valueText, r.unit, r.referenceText, r.direction, r.collectedAt, r.orderingProvider, r.lab].filter(Boolean).join(" ").toLowerCase(),
        }));
        const kinds = ["all", "above", "below", "in-range", "no-range", "non-numeric"];
        chips.innerHTML = kinds.map(k => '<button class="chip ' + (k === "all" ? "active" : "") + '" data-kind="' + k + '">' + k + '</button>').join("");
      } else {
        $("#drill-summary-text").textContent = "Browse the full record";
        $("#drill-summary-count").textContent = (DATA.events || []).length + " events";
        const events = (DATA.events || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        allItems = events.map(e => ({
          kind: e.kind,
          fields: {
            date: e.dateText || e.date || "—",
            kind: e.kind,
            title: e.title,
            party: e.party || "—",
            detail: e.detail || "—",
          },
          quote: e.source && e.source.quote,
          searchText: [e.dateText, e.title, e.party, e.detail, e.source && e.source.quote].filter(Boolean).join(" ").toLowerCase(),
        }));
        const kinds = Array.from(new Set(["all", ...allItems.map(i => i.kind)]));
        chips.innerHTML = kinds.map(k => '<button class="chip ' + (k === "all" ? "active" : "") + '" data-kind="' + k + '">' + k + '</button>').join("");
      }

      const render = () => {
        const q = search.value.trim().toLowerCase();
        const filtered = allItems.filter(item =>
          (activeKind === "all" || item.kind === activeKind) &&
          (q === "" || item.searchText.includes(q))
        ).slice(0, 500);
        if (subtype === "lab-results") {
          let html = '<table class="lab-table"><thead><tr>' +
            columns.map(c => '<th>' + escHtml(c) + '</th>').join("") +
            '</tr></thead><tbody>';
          filtered.forEach(item => {
            const cls = item.kind === "above" ? "out" : item.kind === "below" ? "below-row" : "";
            html += '<tr class="' + cls + '">' +
              columns.map(c => '<td' + (["value", "date"].includes(c) ? ' class="num"' : '') + '>' + escHtml(item.fields[c] || "—") + '</td>').join("") +
              '</tr>';
          });
          html += '</tbody></table>';
          if (filtered.length === 0) html = '<p class="empty-state">No rows match your filter.</p>';
          content.innerHTML = html;
        } else {
          let html = '<table class="row-table"><thead><tr><th>date</th><th>kind</th><th>title</th><th>party</th><th>detail</th></tr></thead><tbody>';
          filtered.forEach(item => {
            html += '<tr><td class="num">' + escHtml(item.fields.date) + '</td>' +
              '<td><span class="pill in-range">' + escHtml(item.fields.kind) + '</span></td>' +
              '<td>' + escHtml(item.fields.title) + '</td>' +
              '<td>' + escHtml(item.fields.party) + '</td>' +
              '<td>' + escHtml(item.fields.detail) + '</td></tr>';
          });
          html += '</tbody></table>';
          if (filtered.length === 0) html = '<p class="empty-state">No rows match your filter.</p>';
          content.innerHTML = html;
        }
      };
      render();
      search.addEventListener("input", render);
      chips.addEventListener("click", e => {
        const btn = e.target.closest("button[data-kind]");
        if (!btn) return;
        chips.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        activeKind = btn.getAttribute("data-kind");
        render();
      });
    })();

    /* ---- Footer meta ---- */
    $("#footer-meta").textContent = (DATA.sourceFile || "input") + " · " + (DATA.sizeBytes ? Math.round(DATA.sizeBytes / 1024) + " KB" : "");
  </script>
</body>
</html>
`

const args = parseArgs(process.argv.slice(2))
if (!args.input || !args.out || !args.title) {
  console.error("usage: render_sensitive_fallback.mjs INPUT --out OUT --title TITLE")
  process.exit(1)
}

const parser = await pickParser(args.input)
if (!parser) {
  console.error("No parser matched", args.input)
  process.exit(1)
}
const parsed = await parser.parse(args.input)
if (!["lab-results", "medical-visit", "legal-chronology"].includes(parsed.contentType)) {
  console.error("Parsed contentType is not in the sensitive family:", parsed.contentType)
  process.exit(1)
}

const html = TEMPLATE
  .replace(/__TITLE__/g, escapeJs(args.title))
  .replace(/__DATA__/g, injectableJson({ ...(parsed.data || {}), sourceFile: parsed.meta.sourceFile, sizeBytes: parsed.meta.sizeBytes }))

await fs.writeFile(args.out, html, "utf8")
console.log("Wrote", args.out, "(" + Math.round(Buffer.byteLength(html, "utf8") / 1024) + " KB)")

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i]
    if (v === "--out") out.out = argv[++i]
    else if (v === "--title") out.title = argv[++i]
    else if (!out.input) out.input = v
  }
  return out
}

function escapeJs(s) {
  return String(s).replace(/[&<>"'`]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[c]))
}

function injectableJson(obj) {
  return JSON.stringify(obj).replace(/<\/script/gi, "<\\/script")
}

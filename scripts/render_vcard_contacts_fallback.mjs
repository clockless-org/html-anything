#!/usr/bin/env node
/**
 * Offline fallback renderer for vcard-contacts.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned
 * template that satisfies the prompts/sources/vcard-contacts.md contract:
 *
 *   1. Hero summary (contacts / reachability / window / top org)
 *   2. Address-book health audit (issue cards)
 *   3. Relationship atlas: organizations, email domains, cities,
 *      birthdays, categories
 *   4. Duplicate merge worksheet (read-only side-by-side cards)
 *   5. Searchable contact table with mask-by-default toggle and
 *      filter chips
 *   6. Privacy footer
 *
 * The page renders the FULL `rows` array client-side, so the contact
 * table can grow to hundreds without re-running the LLM. Phone +
 * email values are masked by default; the toggle is local-only and
 * does not transmit anything.
 *
 * Usage:
 *   node scripts/render_vcard_contacts_fallback.mjs INPUT --out OUT --title TITLE
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
.audit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-md)}
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
.atlas .row .c{color:var(--primary);font-weight:600;font-variant-numeric:tabular-nums}
.atlas .row .bar{flex:1 1 auto;height:4px;background:var(--surface-container);border-radius:2px;position:relative;margin:0 var(--space-sm)}
.atlas .row .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--primary);border-radius:2px;display:block}
.bday-strip{display:grid;grid-template-columns:repeat(12,1fr);gap:3px;margin-top:var(--space-md)}
.bday-strip .m{background:var(--surface-container);border-radius:3px;text-align:center;font-family:var(--font-mono);font-size:10.5px;color:var(--fg-muted);padding:8px 2px;position:relative;overflow:hidden;cursor:pointer}
.bday-strip .m i{position:absolute;left:0;right:0;bottom:0;background:var(--gradient-primary);border-radius:0 0 3px 3px}
.bday-strip .m span{position:relative;z-index:1;font-weight:500}
.bday-strip .m .c{position:relative;z-index:1;display:block;font-size:11px;color:var(--fg-1);font-weight:600}
.dup-list{display:grid;grid-template-columns:1fr;gap:var(--space-md)}
.dup{padding:var(--space-lg) var(--space-xl);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-container-lowest)}
.dup .dup-head{display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap;margin-bottom:var(--space-md)}
.dup .dup-reason{display:inline-flex;padding:2px 10px;border-radius:var(--radius-pill);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;background:var(--surface-container-high);color:var(--fg-2)}
.dup .dup-reason.shared-phone{background:rgba(245,158,11,.18);color:#a06200}
.dup .dup-reason.shared-email{background:rgba(123,64,224,.15);color:var(--secondary-container)}
.dup .dup-reason.normalized-name{background:rgba(0,0,0,.06);color:var(--fg-muted)}
@media (prefers-color-scheme:dark){.dup .dup-reason.shared-phone{color:#fcd34d}.dup .dup-reason.normalized-name{color:var(--fg-2)}}
.dup .dup-key{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-2)}
.dup-table{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--space-md)}
.dup-cell{padding:var(--space-md);border:1px dashed var(--border-strong);border-radius:var(--radius-sm);background:var(--surface-container-low);font-size:13px}
.dup-cell .name{font-weight:600;font-size:14px;color:var(--fg-1);margin-bottom:var(--space-xs)}
.dup-cell .field{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-2);line-height:1.4;display:block}
.dup-cell .field b{color:var(--fg-muted);font-weight:500}
.drill-toolbar{display:flex;gap:var(--space-md);margin-bottom:var(--space-md);flex-wrap:wrap;align-items:center}
.drill-search{flex:1 1 280px;min-width:220px;padding:var(--space-sm) var(--space-md);border:1px solid var(--border-strong);border-radius:var(--radius-md);background:var(--surface-container-lowest);font-size:14px;font-family:var(--font-mono)}
.drill-search:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:var(--primary)}
.drill-meta{font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.chips{display:flex;gap:var(--space-sm);flex-wrap:wrap;margin-bottom:var(--space-md)}
.chip{display:inline-flex;align-items:center;gap:var(--space-sm);padding:6px var(--space-md);border-radius:var(--radius-pill);background:var(--surface-container);border:1px solid var(--border);font-size:12.5px;font-weight:500;cursor:pointer;transition:all .15s ease;user-select:none}
.chip:hover{background:var(--surface-container-high)}
.chip.active{background:var(--primary);color:var(--on-primary);border-color:transparent}
.chip .count{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);font-weight:400}
.chip.active .count{color:rgba(255,255,255,.8)}
.chip-row-label{font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg-muted);font-family:var(--font-mono);font-weight:500;margin-bottom:var(--space-xs);margin-top:var(--space-md)}
.contact-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:var(--space-md)}
.contact{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-container-lowest);display:flex;flex-direction:column;gap:var(--space-xs)}
.contact .name{font-weight:600;font-size:15px;color:var(--fg-1);line-height:1.3}
.contact .name.italic{font-style:italic;color:var(--fg-muted)}
.contact .org-line{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);line-height:1.4}
.contact .org-line b{color:var(--fg-2);font-weight:500}
.contact .field{font-family:var(--font-mono);font-size:12px;color:var(--fg-2);display:flex;gap:var(--space-sm);align-items:center}
.contact .field .label{font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--fg-muted);background:var(--surface-container);padding:1px 6px;border-radius:4px;flex-shrink:0}
.contact .field .v{cursor:pointer;text-decoration:underline dotted var(--border-strong);text-underline-offset:3px}
.contact .field .v:hover{color:var(--primary);text-decoration-color:var(--primary)}
.contact .badges{display:flex;flex-wrap:wrap;gap:var(--space-xs);margin-top:var(--space-xs)}
.contact .badge{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.contact .badge.dup{background:rgba(245,158,11,.18);color:#a06200}
@media (prefers-color-scheme:dark){.contact .badge.dup{color:#fcd34d}}
.contact .badge.photo{background:rgba(123,64,224,.15);color:var(--secondary-container)}
.contact .badge.flag{background:rgba(239,68,68,.12);color:var(--red)}
.contact .badge.cat{background:var(--primary-fixed);color:var(--primary)}
.contact .note{font-size:12.5px;color:var(--fg-2);font-style:italic;line-height:1.45;margin-top:var(--space-xs);padding-top:var(--space-xs);border-top:1px dashed var(--border)}
.contact .rev{font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)}
.empty-state{padding:var(--space-2xl);text-align:center;font-size:13.5px;color:var(--fg-muted)}
.tbl-loadmore{display:flex;justify-content:center;padding:var(--space-md);font-size:13px;color:var(--fg-muted);grid-column:1/-1}
.tbl-loadmore button{padding:var(--space-sm) var(--space-lg);border-radius:var(--radius-pill);border:1px solid var(--border-strong);background:var(--surface-container-lowest)}
footer{margin-top:var(--space-5xl);padding-top:var(--space-2xl);border-top:1px solid var(--border);font-size:12.5px;color:var(--fg-muted);max-width:78ch;line-height:1.6}
footer .privacy{font-style:italic}
@media (max-width:540px){
  main{padding:var(--space-lg) var(--space-md) var(--space-4xl)}
  .bday-strip{grid-template-columns:repeat(6,1fr)}
}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <span class="eyebrow"><span class="mono">VCARD CONTACTS</span> · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial"></p>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy audit summary as Markdown</button>
        <button class="btn" id="jump-table-btn">Jump to contacts</button>
        <button class="btn toggle" id="mask-toggle"><span class="eye">&#128065;</span> <span id="mask-toggle-label">Show real phone &amp; email</span></button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Address book summary">
      <div class="kpi"><div class="label">Contacts</div><div class="value mono accent" id="kpi-contacts">0</div><div class="sub" id="kpi-contacts-sub"></div></div>
      <div class="kpi"><div class="label">Reachability</div><div class="value mono" id="kpi-reach">0</div><div class="sub" id="kpi-reach-sub"></div></div>
      <div class="kpi"><div class="label">Revision window</div><div class="value mono" id="kpi-window">&mdash;</div><div class="sub" id="kpi-window-sub"></div></div>
      <div class="kpi"><div class="label">Top organization</div><div class="value mono" id="kpi-org">&mdash;</div><div class="sub" id="kpi-org-sub"></div></div>
    </section>

    <section class="section" aria-labelledby="head-audit">
      <div class="section-head">
        <h2 id="head-audit">Health audit</h2>
        <span class="heuristic-chip" title="Read-only audit. Verify in your Contacts app before deleting anything.">Heuristic</span>
      </div>
      <div class="card">
        <div class="audit-grid" id="audit-grid"></div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-atlas">
      <div class="section-head">
        <h2 id="head-atlas">Address book atlas</h2>
        <span class="meta" id="atlas-meta"></span>
      </div>
      <div class="atlas-grid">
        <div class="atlas">
          <div class="atlas-head"><h4>Organizations</h4><span class="count" id="org-count"></span></div>
          <div id="org-list"></div>
        </div>
        <div class="atlas">
          <div class="atlas-head"><h4>Email domains</h4><span class="count" id="domain-count"></span></div>
          <div id="domain-list"></div>
        </div>
        <div class="atlas">
          <div class="atlas-head"><h4>Cities</h4><span class="count" id="city-count"></span></div>
          <div id="city-list"></div>
        </div>
        <div class="atlas">
          <div class="atlas-head"><h4>Birthdays</h4><span class="count" id="bday-count"></span></div>
          <div class="bday-strip" id="bday-strip"></div>
        </div>
        <div class="atlas">
          <div class="atlas-head"><h4>Tags / categories</h4><span class="count" id="cat-count"></span></div>
          <div id="cat-list"></div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-dup">
      <div class="section-head">
        <h2 id="head-dup">Duplicate merge worksheet</h2>
        <span class="heuristic-chip" title="Heuristic. Verify before deleting.">Heuristic</span>
      </div>
      <p class="muted" style="font-size:13px;margin-bottom:var(--space-md)">Read-only. Each cluster shows the candidate cards side-by-side so you can compare and decide. The page does not offer a merge button.</p>
      <div class="dup-list" id="dup-list"></div>
    </section>

    <section class="section" aria-labelledby="head-table">
      <div class="section-head">
        <h2 id="head-table" style="scroll-margin-top:1em">Browse all contacts</h2>
        <span class="meta">Phone &amp; email masked by default — toggle in the header.</span>
      </div>
      <div class="card">
        <div class="drill-toolbar">
          <input class="drill-search" id="drill-search" type="search" placeholder="Search name, org, title, phone, email, note&hellip;" aria-label="Search contacts">
          <span class="drill-meta" id="drill-count">0 of 0</span>
          <button class="btn" id="drill-clear">Clear filters</button>
        </div>
        <div class="chip-row-label">Has</div>
        <div class="chips" id="has-chips"></div>
        <div class="chip-row-label">Organization</div>
        <div class="chips" id="org-chips"></div>
        <div class="chip-row-label">City</div>
        <div class="chips" id="city-chips"></div>
        <div class="chip-row-label">Tag</div>
        <div class="chips" id="cat-chips"></div>
        <div class="chip-row-label">Audit</div>
        <div class="chips" id="audit-chips"></div>
        <div class="contact-list" id="contact-list"></div>
        <div class="tbl-loadmore" id="loadmore"></div>
      </div>
    </section>

    <footer>
      <p>Generated by <a href="https://github.com/clockless-org/html-anything">html-anything</a> from <span id="footer-source" class="mono"></span> (<span id="footer-bytes" class="mono"></span>) using the offline vcard-contacts template. This file is fully self-contained and makes no network calls — it uses your operating system's default sans-serif font.</p>
      <p class="privacy" style="margin-top:var(--space-md)">Generated locally — your contacts never left your machine. Every card is embedded in this HTML and rendered offline in your browser. Phone numbers and emails are masked by default; the toggle is local-only and does not transmit anything. <strong>Photos are not embedded — only a "PHOTO present" flag.</strong> The page makes no network calls.</p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(function(){
  const fmt = new Intl.NumberFormat("en-US")
  const summary = DATA.summary || {}
  const rows = DATA.rows || []
  const orgs = DATA.organizations || []
  const domains = DATA.emailDomains || []
  const cities = DATA.cities || []
  const bdayMonths = DATA.birthdayMonths || []
  const cats = DATA.categories || []
  const audit = DATA.audit || {}
  const dupClusters = DATA.duplicateClusters || []
  const meta = DATA.meta || {}
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

  function escapeHtml(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])) }
  function ellipsize(s, n){ if (!s) return ""; return s.length > n ? s.slice(0, n-1) + "…" : s }
  function pct(x){ return Math.round((x||0) * 100) + "%" }
  function humanBytes(n){ if (!n) return "0 B"; const u = ["B","KB","MB","GB"]; let i=0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ } return n.toFixed(n < 10 && i ? 1 : 0) + " " + u[i] }
  function lookupName(id){
    const r = rows.find(x => x.id === id)
    if (!r) return id
    return r.fn || ((r.givenName || "") + " " + (r.familyName || "")).trim() || "(no name)"
  }
  function visibleName(r){ return r.fn || ((r.givenName||"")+" "+(r.familyName||"")).trim() || "(no name)" }

  document.getElementById("footer-source").textContent = meta.sourceFile || "Contacts.vcf"
  document.getElementById("footer-bytes").textContent = humanBytes(meta.sizeBytes || 0)

  // ---------- KPIs ----------
  document.getElementById("kpi-contacts").textContent = fmt.format(summary.contactCount || 0)
  document.getElementById("kpi-contacts-sub").textContent = (summary.individualCount || 0) + " people · " + (summary.groupCount || 0) + " groups"
  document.getElementById("kpi-reach").textContent = fmt.format(summary.withPhone || 0)
  document.getElementById("kpi-reach-sub").textContent =
    (summary.withPhone || 0) + " with phone · " +
    (summary.withEmail || 0) + " with email · " +
    (summary.withAddress || 0) + " with address"
  document.getElementById("kpi-window").textContent = summary.revDurationLabel || "—"
  document.getElementById("kpi-window-sub").textContent = summary.revWindow || ""
  document.getElementById("kpi-org").textContent = ellipsize(summary.topOrganization || "—", 18)
  document.getElementById("kpi-org-sub").textContent = summary.topOrganization
    ? pct(summary.topOrganizationShare) + " of contacts"
    : "no organization metadata"

  document.getElementById("hero-editorial").textContent = buildEditorial()

  function buildEditorial(){
    const parts = []
    parts.push((summary.contactCount || 0) + " contacts " +
      "(" + (summary.withPhone || 0) + " with phone, " + (summary.withEmail || 0) + " with email).")
    if (summary.topOrganization) parts.push("Top organization: " + summary.topOrganization + " (" + pct(summary.topOrganizationShare) + ").")
    if (audit.missingPhone && audit.missingPhone.count) parts.push(audit.missingPhone.count + " missing a phone number.")
    if (summary.duplicateClusterCount) parts.push(summary.duplicateClusterCount + " possible duplicate clusters worth merging.")
    if (audit.staleRev && audit.staleRev.count) parts.push(audit.staleRev.count + " contacts last revised before " + (audit.staleRev.threshold || "the threshold") + " (heuristic).")
    return parts.join(" ")
  }

  // ---------- Health audit ----------
  function auditCard(label, count, sub, sampleIds){
    const c = (count || 0)
    const cls = c === 0 ? "audit-count zero" : "audit-count"
    let subHtml = ""
    if (sub) subHtml = '<div class="audit-sub">' + sub + '</div>'
    else if (sampleIds && sampleIds.length) {
      const names = sampleIds.slice(0, 3).map(id => escapeHtml(ellipsize(lookupName(id), 24))).join(" · ")
      subHtml = '<div class="audit-sub">e.g. ' + names + '</div>'
    }
    return '<div class="audit"><div class="audit-label">' + escapeHtml(label) + '</div>' +
      '<div class="' + cls + '">' + fmt.format(c) + '</div>' + subHtml + '</div>'
  }
  function auditFromBlock(label, block){
    if (!block) return auditCard(label, 0)
    return auditCard(label, block.count, null, block.sampleIds)
  }
  function repeatedCard(label, items){
    if (!items || !items.length) return auditCard(label, 0)
    const lines = items.slice(0, 3).map(it => {
      return '<b>' + escapeHtml(it.value) + '</b> on ' + it.count + ' cards'
    }).join('<br>')
    return '<div class="audit"><div class="audit-label">' + escapeHtml(label) + '</div>' +
      '<div class="audit-count">' + items.length + '</div>' +
      '<div class="audit-sub">' + lines + '</div></div>'
  }
  const auditCards = [
    auditFromBlock("Missing phone", audit.missingPhone),
    auditFromBlock("Missing email", audit.missingEmail),
    auditFromBlock("Missing both", audit.missingBoth),
    auditFromBlock("Malformed email", audit.malformedEmail && {
      count: audit.malformedEmail.count,
      sampleIds: (audit.malformedEmail.samples || []).map(s => s.id),
    }),
    auditFromBlock("Stale revisions (5y+)", audit.staleRev),
    repeatedCard("Repeated phone", audit.repeatedPhone),
    repeatedCard("Repeated email", audit.repeatedEmail),
    auditFromBlock("Note-only contacts", audit.noteOnly),
    auditFromBlock("Nameless cards", audit.nameless),
    auditFromBlock("Legacy vCard 2.1", audit.legacy21),
  ]
  document.getElementById("audit-grid").innerHTML = auditCards.join("")

  // ---------- Atlas ----------
  document.getElementById("atlas-meta").textContent =
    (summary.distinctOrgs || 0) + " orgs · " +
    (summary.distinctEmailDomains || 0) + " domains · " +
    (summary.distinctCities || 0) + " cities · " +
    (summary.distinctCountries || 0) + " countries"

  function renderBars(targetId, items, fmtRow){
    const target = document.getElementById(targetId)
    if (!items.length) { target.innerHTML = '<div class="empty-state">—</div>'; return }
    const max = items[0].count || 1
    target.innerHTML = items.slice(0, 8).map(item => {
      const w = Math.max(8, Math.round((item.count / max) * 100))
      return '<div class="row">' +
        '<span class="v" title="' + escapeHtml(fmtRow.label(item)) + '">' + escapeHtml(ellipsize(fmtRow.label(item), 30)) + '</span>' +
        '<span class="bar"><i style="width:' + w + '%"></i></span>' +
        '<span class="c">' + fmt.format(item.count) + '</span>' +
      '</div>'
    }).join("")
  }
  document.getElementById("org-count").textContent = orgs.length + " distinct"
  renderBars("org-list", orgs, { label: o => o.name })
  document.getElementById("domain-count").textContent = domains.length + " distinct"
  renderBars("domain-list", domains, { label: d => d.domain + (d.kind === "personal" ? " · personal" : "") })
  document.getElementById("city-count").textContent = cities.length + " distinct"
  renderBars("city-list", cities, { label: c => c.city })
  document.getElementById("cat-count").textContent = cats.length + " tags"
  renderBars("cat-list", cats, { label: c => c.name })

  // Birthday strip
  const bdayTotal = bdayMonths.reduce((s, m) => s + (m.count || 0), 0)
  document.getElementById("bday-count").textContent = bdayTotal + " with birthday"
  const bdayMax = Math.max(...bdayMonths.map(m => m.count || 0), 1)
  document.getElementById("bday-strip").innerHTML = bdayMonths.map(m => {
    const h = m.count ? Math.max(8, (m.count / bdayMax) * 100) : 0
    return '<div class="m" data-month="' + m.month + '" title="' + MONTH_LABELS[m.month-1] + ': ' + m.count + ' birthday' + (m.count===1?"":"s") + '">' +
      '<i style="height:' + h.toFixed(1) + '%"></i>' +
      '<span class="c">' + (m.count || 0) + '</span>' +
      '<span>' + MONTH_LABELS[m.month-1] + '</span>' +
    '</div>'
  }).join("")

  // ---------- Duplicate worksheet ----------
  const dupTarget = document.getElementById("dup-list")
  if (!dupClusters.length) {
    dupTarget.innerHTML = '<div class="empty-state">No likely duplicates detected.</div>'
  } else {
    dupTarget.innerHTML = dupClusters.slice(0, 12).map(c => {
      const cells = c.contactIds.map(id => {
        const r = rows.find(x => x.id === id)
        if (!r) return '<div class="dup-cell"><div class="name">' + escapeHtml(id) + '</div></div>'
        const tels = r.phones.slice(0, 3).map(p => '<span class="field"><b>' + (p.type || "TEL") + '</b> <span class="dup-mask" data-real="' + escapeHtml(p.value) + '" data-mask="' + escapeHtml(p.masked) + '">' + escapeHtml(p.masked) + '</span></span>').join("")
        const emails = r.emails.slice(0, 2).map(e => '<span class="field"><b>' + (e.type || "EMAIL") + '</b> <span class="dup-mask" data-real="' + escapeHtml(e.value) + '" data-mask="' + escapeHtml(e.masked) + '">' + escapeHtml(e.masked) + '</span></span>').join("")
        const orgChip = r.org ? '<span class="field"><b>ORG</b> ' + escapeHtml(r.org) + '</span>' : ''
        const rev = r.rev ? '<span class="field"><b>REV</b> ' + escapeHtml(r.rev) + '</span>' : ''
        return '<div class="dup-cell">' +
          '<div class="name">' + escapeHtml(visibleName(r)) + '</div>' +
          tels + emails + orgChip + rev +
        '</div>'
      }).join("")
      const reasonLabel = c.reason === "shared-phone" ? "Shared phone"
        : c.reason === "shared-email" ? "Shared email"
        : "Same name"
      return '<div class="dup">' +
        '<div class="dup-head">' +
          '<span class="dup-reason ' + c.reason + '">' + reasonLabel + '</span>' +
          '<span class="dup-key">' + escapeHtml(c.key) + '</span>' +
          '<span class="muted" style="font-family:var(--font-mono);font-size:11.5px">' + c.contactIds.length + ' candidates</span>' +
        '</div>' +
        '<div class="dup-table">' + cells + '</div>' +
      '</div>'
    }).join("")
  }

  // ---------- Browse all contacts ----------
  const PAGE = 30
  let limit = PAGE
  let queryStr = ""
  let activeFilters = {
    has: new Set(),
    orgs: new Set(),
    cities: new Set(),
    cats: new Set(),
    audit: new Set(),
  }
  let unmasked = false  // mask toggle state

  function makeChips(containerId, values, kind){
    const target = document.getElementById(containerId)
    if (!values.length) { target.innerHTML = '<span class="muted" style="font-size:13px">—</span>'; return }
    target.innerHTML = values.map(v => {
      const labelSafe = String(v.label).replace(/"/g,'&quot;')
      return '<button class="chip" data-val="' + labelSafe + '">' + escapeHtml(ellipsize(String(v.label), 28)) + ' <span class="count">' + (v.count != null ? v.count : "") + '</span></button>'
    }).join("")
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
  // Has-X chips
  const hasOptions = [
    { label: "Has phone",     count: rows.filter(r => r.phones.length).length },
    { label: "Has email",     count: rows.filter(r => r.emails.length).length },
    { label: "Has address",   count: rows.filter(r => r.addresses.length).length },
    { label: "Has birthday",  count: rows.filter(r => r.bday).length },
    { label: "Has photo",     count: rows.filter(r => r.hasPhoto).length },
    { label: "Has note",      count: rows.filter(r => r.note).length },
    { label: "Possible duplicate", count: rows.filter(r => r.duplicateOfClusterId).length },
  ]
  makeChips("has-chips", hasOptions, "has")
  makeChips("org-chips", orgs.slice(0, 8).map(o => ({ label: o.name, count: o.count })), "orgs")
  makeChips("city-chips", cities.slice(0, 8).map(c => ({ label: c.city, count: c.count })), "cities")
  makeChips("cat-chips", cats.slice(0, 10).map(c => ({ label: c.name, count: c.count })), "cats")
  const auditOptions = []
  const af = audit
  if (af.missingPhone && af.missingPhone.count) auditOptions.push({ label: "missing-phone", count: af.missingPhone.count })
  if (af.missingEmail && af.missingEmail.count) auditOptions.push({ label: "missing-email", count: af.missingEmail.count })
  if (af.malformedEmail && af.malformedEmail.count) auditOptions.push({ label: "malformed-email", count: af.malformedEmail.count })
  if (af.staleRev && af.staleRev.count) auditOptions.push({ label: "stale-rev", count: af.staleRev.count })
  if (af.noteOnly && af.noteOnly.count) auditOptions.push({ label: "note-only", count: af.noteOnly.count })
  if (af.nameless && af.nameless.count) auditOptions.push({ label: "nameless", count: af.nameless.count })
  if (af.legacy21 && af.legacy21.count) auditOptions.push({ label: "legacy-vcard", count: af.legacy21.count })
  makeChips("audit-chips", auditOptions, "audit")

  // Filter logic
  let filtered = rows.slice()
  function applyFilters(){
    const q = queryStr.toLowerCase().trim()
    filtered = rows.filter(r => {
      // Has-X
      for (const h of activeFilters.has) {
        if (h === "Has phone" && !r.phones.length) return false
        if (h === "Has email" && !r.emails.length) return false
        if (h === "Has address" && !r.addresses.length) return false
        if (h === "Has birthday" && !r.bday) return false
        if (h === "Has photo" && !r.hasPhoto) return false
        if (h === "Has note" && !r.note) return false
        if (h === "Possible duplicate" && !r.duplicateOfClusterId) return false
      }
      if (activeFilters.orgs.size && (!r.org || !activeFilters.orgs.has(r.org))) return false
      if (activeFilters.cities.size) {
        const cityLabels = r.addresses.map(a => a.region ? a.city + ", " + a.region : a.city).filter(Boolean)
        let ok = false
        for (const c of activeFilters.cities) if (cityLabels.includes(c)) { ok = true; break }
        if (!ok) return false
      }
      if (activeFilters.cats.size) {
        let ok = false
        for (const c of activeFilters.cats) if (r.categories.includes(c)) { ok = true; break }
        if (!ok) return false
      }
      if (activeFilters.audit.size) {
        let ok = false
        for (const f of activeFilters.audit) if (r.auditFlags.includes(f)) { ok = true; break }
        if (!ok) return false
      }
      if (!q) return true
      const haystack = [
        r.fn, r.givenName, r.familyName, r.org, r.title, r.nickname, r.note,
        r.id, (r.categories || []).join(" "),
        r.phones.map(p => p.value).join(" "),
        r.emails.map(e => e.value).join(" "),
        r.addresses.map(a => a.formatted).join(" "),
      ].filter(Boolean).join(" ").toLowerCase()
      return haystack.includes(q)
    })
    limit = PAGE
    renderTable()
  }
  function fieldCell(label, value, real){
    const v = '<span class="v contact-mask" data-real="' + escapeHtml(real || value) + '" data-mask="' + escapeHtml(value) + '" title="Click to reveal locally">' + escapeHtml(value) + '</span>'
    return '<span class="field"><span class="label">' + escapeHtml(label) + '</span> ' + v + '</span>'
  }
  function renderTable(){
    document.getElementById("drill-count").textContent = filtered.length + " of " + rows.length
    const target = document.getElementById("contact-list")
    if (!filtered.length) { target.innerHTML = '<div class="empty-state">No contacts match these filters.</div>'; document.getElementById("loadmore").innerHTML = ""; return }
    const slice = filtered.slice(0, limit)
    target.innerHTML = slice.map(r => {
      const nameClass = r.fn ? "name" : "name italic"
      const nameText = r.fn ? r.fn : "(no name)"
      const orgLineParts = []
      if (r.org) orgLineParts.push('<b>' + escapeHtml(r.org) + '</b>')
      if (r.title) orgLineParts.push(escapeHtml(r.title))
      const orgLine = orgLineParts.length ? '<div class="org-line">' + orgLineParts.join(" · ") + '</div>' : ''
      const phoneFields = r.phones.slice(0, 3).map(p =>
        fieldCell(p.type || "tel", p.masked, p.value)).join("")
      const emailFields = r.emails.slice(0, 3).map(e =>
        fieldCell(e.type || "email", e.masked, e.value)).join("")
      const addrFields = r.addresses.slice(0, 2).map(a =>
        '<span class="field"><span class="label">' + (a.type || "addr") + '</span> ' + escapeHtml(a.formatted || "—") + '</span>').join("")
      const bdayField = r.bday ? '<span class="field"><span class="label">bday</span> ' + escapeHtml(r.bday) + '</span>' : ''
      const badges = []
      if (r.duplicateOfClusterId) badges.push('<span class="badge dup">duplicate?</span>')
      if (r.hasPhoto) badges.push('<span class="badge photo">photo</span>')
      if (r.kind === "group") badges.push('<span class="badge cat">group</span>')
      if (r.kind === "org") badges.push('<span class="badge cat">organization</span>')
      for (const f of (r.auditFlags || []).slice(0, 4)) badges.push('<span class="badge flag">' + escapeHtml(f) + '</span>')
      for (const c of r.categories.slice(0, 3)) badges.push('<span class="badge cat">' + escapeHtml(c) + '</span>')
      const note = r.note ? '<div class="note">' + escapeHtml(ellipsize(r.note, 200)) + '</div>' : ''
      const rev = r.rev ? '<div class="rev">last revised ' + escapeHtml(r.rev) + '</div>' : ''
      return '<div class="contact" data-id="' + escapeHtml(r.id) + '">' +
        '<div class="' + nameClass + '">' + escapeHtml(nameText) + '</div>' +
        orgLine +
        phoneFields + emailFields + addrFields + bdayField +
        (badges.length ? '<div class="badges">' + badges.join("") + '</div>' : '') +
        note + rev +
      '</div>'
    }).join("")
    if (unmasked) revealAll()
    target.querySelectorAll(".contact-mask").forEach(el => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation()
        const cur = el.textContent
        const real = el.getAttribute("data-real")
        const mask = el.getAttribute("data-mask")
        el.textContent = cur === real ? mask : real
      })
    })
    const lm = document.getElementById("loadmore")
    if (limit < filtered.length) lm.innerHTML = '<button id="lm-btn">Load ' + Math.min(PAGE, filtered.length-limit) + ' more</button>'
    else lm.innerHTML = filtered.length + ' shown'
    const btn = document.getElementById("lm-btn")
    if (btn) btn.onclick = () => { limit += PAGE; renderTable() }
  }
  function revealAll(){
    document.querySelectorAll(".contact-mask, .dup-mask").forEach(el => {
      el.textContent = el.getAttribute("data-real")
    })
  }
  function maskAll(){
    document.querySelectorAll(".contact-mask, .dup-mask").forEach(el => {
      el.textContent = el.getAttribute("data-mask")
    })
  }
  document.getElementById("mask-toggle").addEventListener("click", () => {
    unmasked = !unmasked
    const btn = document.getElementById("mask-toggle")
    btn.classList.toggle("on", unmasked)
    document.getElementById("mask-toggle-label").textContent = unmasked
      ? "Hide phone & email"
      : "Show real phone & email"
    if (unmasked) revealAll(); else maskAll()
  })
  document.getElementById("drill-search").addEventListener("input", (ev) => {
    queryStr = ev.target.value || ""
    applyFilters()
  })
  document.getElementById("drill-clear").addEventListener("click", () => {
    document.getElementById("drill-search").value = ""
    queryStr = ""
    activeFilters = { has: new Set(), orgs: new Set(), cities: new Set(), cats: new Set(), audit: new Set() }
    document.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active"))
    applyFilters()
  })
  applyFilters()

  document.getElementById("jump-table-btn").addEventListener("click", () => document.getElementById("head-table").scrollIntoView({ behavior: "smooth" }))

  // Birthday-month click → filter table to "Has birthday" + month match.
  document.getElementById("bday-strip").querySelectorAll(".m").forEach(el => {
    el.addEventListener("click", () => {
      const month = parseInt(el.getAttribute("data-month"), 10)
      activeFilters.has.add("Has birthday")
      const hasButton = document.querySelector('#has-chips .chip[data-val="Has birthday"]')
      if (hasButton) hasButton.classList.add("active")
      // Also restrict via search: type the month abbreviation. Crude but works.
      const ms = String(month).padStart(2, "0")
      document.getElementById("drill-search").value = "-" + ms + "-"
      queryStr = "-" + ms + "-"
      applyFilters()
      document.getElementById("head-table").scrollIntoView({ behavior: "smooth" })
    })
  })

  // Copy summary as Markdown — audit + atlas only, NEVER the contact list.
  document.getElementById("copy-md-btn").addEventListener("click", () => {
    const md = buildMarkdown()
    copyToClipboard(md, document.getElementById("copy-md-btn"))
  })
  function buildMarkdown(){
    const lines = []
    lines.push("# " + (document.getElementById("hero-title").textContent || "Address book audit"))
    lines.push("")
    lines.push(buildEditorial())
    lines.push("")
    lines.push("## Headline")
    lines.push("- " + (summary.contactCount || 0) + " contacts (" + (summary.individualCount || 0) + " people, " + (summary.groupCount || 0) + " groups)")
    lines.push("- " + (summary.withPhone || 0) + " with phone, " + (summary.withEmail || 0) + " with email, " + (summary.withAddress || 0) + " with address")
    lines.push("- Revision window: " + (summary.revWindow || "—") + " (" + (summary.revDurationLabel || "—") + ")")
    lines.push("- " + (summary.distinctOrgs || 0) + " orgs · " + (summary.distinctEmailDomains || 0) + " email domains · " + (summary.distinctCities || 0) + " cities · " + (summary.distinctCountries || 0) + " countries")
    lines.push("- " + (summary.duplicateClusterCount || 0) + " possible duplicate clusters")
    lines.push("")
    lines.push("## Health audit")
    if (audit.missingPhone) lines.push("- Missing phone: " + audit.missingPhone.count)
    if (audit.missingEmail) lines.push("- Missing email: " + audit.missingEmail.count)
    if (audit.missingBoth) lines.push("- Missing both phone + email: " + audit.missingBoth.count)
    if (audit.malformedEmail) lines.push("- Malformed email: " + audit.malformedEmail.count)
    if (audit.staleRev) lines.push("- Stale revisions (5y+): " + audit.staleRev.count)
    if (audit.noteOnly) lines.push("- Note-only: " + audit.noteOnly.count)
    if (audit.nameless) lines.push("- Nameless cards: " + audit.nameless.count)
    if (audit.legacy21) lines.push("- Legacy vCard 2.1: " + audit.legacy21.count)
    lines.push("")
    lines.push("## Top organizations")
    for (const o of orgs.slice(0, 8)) lines.push("- " + o.name + " — " + o.count)
    lines.push("")
    lines.push("## Top email domains")
    for (const d of domains.slice(0, 8)) lines.push("- " + d.domain + " — " + d.count + " (" + d.kind + ")")
    lines.push("")
    lines.push("## Top cities")
    for (const c of cities.slice(0, 8)) lines.push("- " + c.city + " — " + c.count)
    lines.push("")
    lines.push("_Audit summary only — individual contacts intentionally omitted._")
    return lines.join("\n")
  }
  function copyToClipboard(text, btn){
    const orig = btn.querySelector("span") ? btn.innerHTML : btn.textContent
    const useText = !btn.querySelector("span")
    const reset = () => { if (useText) btn.textContent = orig; else btn.innerHTML = orig }
    navigator.clipboard.writeText(text).then(() => {
      if (useText) btn.textContent = "Copied"
      else btn.innerHTML = "Copied"
      setTimeout(reset, 1400)
    }).catch(() => {
      window.prompt("Copy this:", text)
      if (useText) btn.textContent = "Copied"
      else btn.innerHTML = "Copied"
      setTimeout(reset, 1400)
    })
  }
})()
  </script>
</body>
</html>`

async function main() {
  const args = process.argv.slice(2)
  if (!args.length) {
    console.error("Usage: node scripts/render_vcard_contacts_fallback.mjs INPUT --out OUT --title TITLE")
    process.exit(1)
  }
  const input = args[0]
  const out = arg(args, "--out") || input.replace(/\.[^.]+$/, ".html")
  const title = arg(args, "--title") || path.basename(input).replace(/\.[^.]+$/, "")

  const parser = await pickParser(input)
  if (!parser) { console.error("No parser matched", input); process.exit(2) }
  const parsed = await parser.parse(input)
  if (parsed.contentType !== "vcard-contacts") {
    console.error("Expected vcard-contacts, got", parsed.contentType)
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

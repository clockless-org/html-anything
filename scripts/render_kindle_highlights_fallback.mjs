#!/usr/bin/env node
/**
 * Offline fallback renderer for kindle-highlights.
 *
 * The canonical pipeline is `dist/cli.js → htmlize → LLM`, but example
 * regeneration may run on machines without an Anthropic / OpenAI key.
 * This script reuses the same parser, then applies a hand-tuned
 * template that satisfies the prompts/sources/kindle-highlights.md contract:
 *
 *   1. Hero summary (books / clippings / window / top author)
 *   2. Yearly + monthly stacked bars (highlights / notes / bookmarks)
 *   3. Hour-of-day strip (when the reader highlights)
 *   4. Bookshelf cards (per-book counts + sparkline)
 *   5. Theme clusters (heuristic keyword roll-up — clearly labeled)
 *   6. Quote browser with full data inlined, search + filter chips
 *      for book / author / type / year / theme
 *   7. Privacy footer
 *
 * The page renders the FULL `rows` array client-side, so the quote
 * browser can grow to thousands of clippings without re-running the
 * LLM.
 *
 * Usage:
 *   node scripts/render_kindle_highlights_fallback.mjs INPUT --out OUT --title TITLE
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
.heuristic-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:var(--radius-pill);
  background:var(--surface-container);color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;
  text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.card{background:var(--surface-container-lowest);border:1px solid var(--border);border-radius:var(--radius-lg);
  padding:var(--space-xl);box-shadow:var(--shadow-sm)}
.timeline-toggle{display:inline-flex;gap:var(--space-xs);border:1px solid var(--border-strong);border-radius:var(--radius-pill);padding:3px}
.timeline-toggle button{padding:6px var(--space-md);border-radius:var(--radius-pill);font-size:13px;color:var(--fg-2)}
.timeline-toggle button.active{background:var(--primary);color:var(--on-primary)}
.bars-svg{width:100%;height:220px;display:block;margin-top:var(--space-md)}
.bars-svg rect.bar.h{fill:var(--primary);opacity:.85}
.bars-svg rect.bar.n{fill:var(--secondary-container);opacity:.85}
.bars-svg rect.bar.b{fill:var(--yellow);opacity:.85}
.bars-svg text{font-family:var(--font-mono);font-size:10.5px;fill:var(--fg-muted)}
.bars-axis{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);margin-top:var(--space-xs)}
.bars-legend{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-md);font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
.bars-legend strong{color:var(--fg-1);font-weight:600}
.legend-key{display:inline-flex;align-items:center;gap:6px}
.legend-key .swatch{display:inline-block;width:10px;height:10px;border-radius:2px}
.legend-key .swatch.h{background:var(--primary)}
.legend-key .swatch.n{background:var(--secondary-container)}
.legend-key .swatch.b{background:var(--yellow)}
.hours-strip{display:grid;grid-template-columns:repeat(24,1fr);gap:3px;margin-top:var(--space-md)}
.hours-strip .hr{background:var(--surface-container);border-radius:3px;text-align:center;font-family:var(--font-mono);font-size:10.5px;color:var(--fg-muted);padding:6px 2px;position:relative;overflow:hidden}
.hours-strip .hr i{position:absolute;left:0;right:0;bottom:0;background:var(--gradient-primary);border-radius:0 0 3px 3px}
.hours-strip .hr span{position:relative;z-index:1;font-weight:500}
.hours-legend{display:flex;flex-wrap:wrap;gap:var(--space-md);margin-top:var(--space-sm);font-size:12.5px;color:var(--fg-muted);font-family:var(--font-mono)}
/* Bookshelf cards */
.shelf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-md)}
.shelf{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);transition:border-color .15s ease;cursor:pointer;display:flex;flex-direction:column;gap:var(--space-xs)}
.shelf:hover{border-color:var(--primary)}
.shelf .title{font-weight:600;font-size:14.5px;color:var(--fg-1);line-height:1.35;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.shelf .author{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.shelf .counts{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-2);margin-top:var(--space-xs);display:flex;gap:var(--space-md);flex-wrap:wrap}
.shelf .counts b{color:var(--primary);font-weight:600}
.shelf .range{font-family:var(--font-mono);font-size:11px;color:var(--fg-muted)}
.shelf .spark{margin-top:var(--space-xs)}
.shelf .spark svg{width:100%;height:24px;display:block}
.shelf .spark path{fill:none;stroke:var(--primary);stroke-width:1.5}
.shelf .chip{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;align-self:flex-start;margin-top:var(--space-xs)}
.shelf .chip.bookmarks-only{background:rgba(245,158,11,.18);color:#a06200}
@media (prefers-color-scheme:dark){.shelf .chip.bookmarks-only{color:#fcd34d}}
.shelf-toolbar{display:flex;gap:var(--space-md);margin-bottom:var(--space-md);flex-wrap:wrap;align-items:center}
.shelf-toolbar .meta{font-family:var(--font-mono);font-size:12.5px;color:var(--fg-muted);margin-left:auto}
.sort-toggle{display:inline-flex;gap:var(--space-xs);border:1px solid var(--border-strong);border-radius:var(--radius-pill);padding:3px}
.sort-toggle button{padding:5px var(--space-md);border-radius:var(--radius-pill);font-size:12.5px;color:var(--fg-2)}
.sort-toggle button.active{background:var(--primary);color:var(--on-primary)}
/* Theme clusters */
.themes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:var(--space-md)}
.theme{padding:var(--space-md) var(--space-lg);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);cursor:pointer;transition:border-color .15s ease}
.theme:hover{border-color:var(--primary)}
.theme .keyword{font-family:var(--font-headline);font-weight:600;font-size:15px;color:var(--fg-1);line-height:1.3}
.theme .stats{font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted);margin-top:var(--space-xs)}
.theme .books{font-size:12px;color:var(--fg-2);margin-top:var(--space-xs);line-height:1.4}
/* Quote browser */
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
.quote-list{display:grid;grid-template-columns:1fr;gap:var(--space-md)}
.quote{padding:var(--space-lg) var(--space-xl);border:1px solid var(--border);border-radius:var(--radius-md);
  background:var(--surface-container-lowest);position:relative}
.quote .body{font-size:15.5px;line-height:1.55;color:var(--fg-1);white-space:pre-wrap;overflow-wrap:break-word}
.quote.note .body{font-style:italic;color:var(--fg-2)}
.quote.bookmark .body{color:var(--fg-muted);font-style:italic}
.quote .footer{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-md);margin-top:var(--space-md);
  font-family:var(--font-mono);font-size:11.5px;color:var(--fg-muted)}
.quote .footer .book{color:var(--fg-1);font-weight:600;font-family:var(--font-body);font-size:13px}
.quote .footer .author{color:var(--fg-2);font-family:var(--font-body);font-size:12.5px}
.quote .footer .pos{font-family:var(--font-mono)}
.quote .footer .badge{display:inline-block;padding:1px 8px;border-radius:var(--radius-sm);background:var(--surface-container);
  color:var(--fg-2);font-family:var(--font-mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
.quote .footer .badge.note{background:rgba(123,64,224,.15);color:var(--secondary-container)}
.quote .footer .badge.bookmark{background:rgba(245,158,11,.18);color:#a06200}
.quote .footer .badge.duplicate{background:rgba(0,0,0,.06);color:var(--fg-muted)}
.quote .footer .badge.attached{background:rgba(16,185,129,.15);color:var(--green)}
.quote .footer .actions{margin-left:auto;display:flex;gap:var(--space-xs)}
.quote .footer .actions button{padding:3px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);
  font-size:11.5px;background:var(--surface-container-lowest);color:var(--fg-2);cursor:pointer;font-family:var(--font-mono)}
.quote .footer .actions button:hover{border-color:var(--primary);color:var(--primary)}
.quote mark{background:var(--primary-fixed);color:var(--fg-1);padding:0 2px;border-radius:2px}
.empty-state{padding:var(--space-2xl);text-align:center;font-size:13.5px;color:var(--fg-muted)}
.tbl-loadmore{display:flex;justify-content:center;padding:var(--space-md);font-size:13px;color:var(--fg-muted)}
.tbl-loadmore button{padding:var(--space-sm) var(--space-lg);border-radius:var(--radius-pill);
  border:1px solid var(--border-strong);background:var(--surface-container-lowest)}
footer{margin-top:var(--space-5xl);padding-top:var(--space-2xl);border-top:1px solid var(--border);
  font-size:12.5px;color:var(--fg-muted);max-width:78ch;line-height:1.6}
footer .privacy{font-style:italic}
@media (max-width:540px){
  main{padding:var(--space-lg) var(--space-md) var(--space-4xl)}
  .hours-strip{grid-template-columns:repeat(12,1fr)}
}
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <span class="eyebrow"><span class="mono">KINDLE HIGHLIGHTS</span> · html-anything</span>
      <h1 id="hero-title">__TITLE__</h1>
      <p class="editorial" id="hero-editorial"></p>
      <div class="hero-actions">
        <button class="btn primary" id="copy-md-btn">Copy reading note as Markdown</button>
        <button class="btn" id="jump-quotes-btn">Jump to quote browser</button>
      </div>
    </header>

    <section class="kpi-row" aria-label="Reading summary">
      <div class="kpi"><div class="label">Books</div><div class="value mono accent" id="kpi-books">0</div><div class="sub" id="kpi-books-sub"></div></div>
      <div class="kpi"><div class="label">Clippings</div><div class="value mono" id="kpi-clips">0</div><div class="sub" id="kpi-clips-sub"></div></div>
      <div class="kpi"><div class="label">Reading window</div><div class="value mono" id="kpi-window">—</div><div class="sub" id="kpi-window-sub"></div></div>
      <div class="kpi"><div class="label">Top author</div><div class="value mono" id="kpi-author">—</div><div class="sub" id="kpi-author-sub"></div></div>
    </section>

    <section class="section" aria-labelledby="head-rhythm">
      <div class="section-head">
        <h2 id="head-rhythm">Reading rhythm</h2>
        <div class="timeline-toggle" role="tablist">
          <button id="t-year" class="active" role="tab" aria-selected="true">Yearly</button>
          <button id="t-month" role="tab" aria-selected="false">Monthly</button>
        </div>
      </div>
      <div class="card">
        <svg class="bars-svg" id="bars-svg" viewBox="0 0 1000 220" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="bars-axis" id="bars-axis"></div>
        <div class="bars-legend" id="bars-legend">
          <span class="legend-key"><span class="swatch h"></span>Highlights</span>
          <span class="legend-key"><span class="swatch n"></span>Notes</span>
          <span class="legend-key"><span class="swatch b"></span>Bookmarks</span>
        </div>
        <div class="hours-strip" id="hours-strip" aria-label="Hour-of-day clipping density"></div>
        <div class="hours-legend"><span class="heuristic-chip">Heuristic</span> Hour-of-day uses the Kindle device clock; timezones are device-local.</div>
      </div>
    </section>

    <section class="section" aria-labelledby="head-shelf">
      <div class="section-head">
        <h2 id="head-shelf">Bookshelf</h2>
        <span class="meta" id="shelf-meta"></span>
      </div>
      <div class="shelf-toolbar">
        <div class="sort-toggle" role="tablist">
          <button id="sort-most" class="active" role="tab" aria-selected="true">Most highlighted</button>
          <button id="sort-recent" role="tab" aria-selected="false">Most recent</button>
          <button id="sort-alpha" role="tab" aria-selected="false">A → Z</button>
        </div>
        <span class="meta" id="shelf-stats"></span>
      </div>
      <div class="shelf-grid" id="shelf-grid"></div>
    </section>

    <section class="section" aria-labelledby="head-themes">
      <div class="section-head">
        <h2 id="head-themes">Themes you return to</h2>
        <div style="display:flex;gap:var(--space-sm);align-items:center">
          <span class="heuristic-chip" title="Coarse keyword roll-up — not topic modeling, not semantic clustering, not LLM-derived.">Heuristic</span>
          <span class="meta" id="themes-meta"></span>
        </div>
      </div>
      <div class="themes-grid" id="themes-grid"></div>
    </section>

    <section class="section" aria-labelledby="head-quotes">
      <div class="section-head">
        <h2 id="head-quotes" style="scroll-margin-top:1em">Quote browser</h2>
        <span class="meta">Click a card to copy</span>
      </div>
      <div class="card">
        <div class="drill-toolbar">
          <input class="drill-search" id="drill-search" type="search" placeholder="Search highlight text, book, author…" aria-label="Search clippings">
          <span class="drill-meta" id="drill-count">0 of 0</span>
          <button class="btn" id="drill-clear">Clear filters</button>
        </div>
        <div class="chip-row-label">Book</div>
        <div class="chips" id="book-chips"></div>
        <div class="chip-row-label">Author</div>
        <div class="chips" id="author-chips"></div>
        <div class="chip-row-label">Type</div>
        <div class="chips" id="type-chips"></div>
        <div class="chip-row-label">Year</div>
        <div class="chips" id="year-chips"></div>
        <div class="chip-row-label">Theme</div>
        <div class="chips" id="theme-chips"></div>
        <div class="quote-list" id="quote-list"></div>
        <div class="tbl-loadmore" id="loadmore"></div>
      </div>
    </section>

    <footer>
      <p>Generated by <a href="https://github.com/clockless-org/html-anything">html-anything</a> from <span id="footer-source" class="mono"></span> (<span id="footer-bytes" class="mono"></span>) using the offline kindle-highlights template. This file is fully self-contained and makes no network calls — it uses your operating system's default sans-serif font.</p>
      <p class="privacy" style="margin-top:var(--space-md)">Generated locally — your Kindle highlights never left your machine. Every clipping is embedded in this HTML and rendered offline in your browser. Theme clusters are a heuristic keyword roll-up, not topic modeling. <strong>The page does not fetch from Amazon, Goodreads, Kindle CDN, OpenLibrary, Google Books, or any cover-art service.</strong></p>
    </footer>
  </main>

  <script>const DATA = __DATA__;</script>
  <script>
(function(){
  const fmt = new Intl.NumberFormat("en-US")
  const summary = DATA.summary || {}
  const rows = DATA.rows || []
  const books = DATA.books || []
  const authors = DATA.authors || []
  const yearTotals = DATA.yearTotals || []
  const monthTotals = DATA.monthTotals || []
  const hourCounts = DATA.hourCounts || new Array(24).fill(0)
  const themes = DATA.themeClusters || []
  const meta = DATA.meta || {}
  const visible = rows.filter(r => !r.duplicateOf)

  function escapeHtml(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])) }
  function ellipsize(s, n){ if (!s) return ""; return s.length > n ? s.slice(0, n-1) + "…" : s }
  function pct(x){ return Math.round((x||0) * 100) + "%" }
  function humanBytes(n){ if (!n) return "0 B"; const u = ["B","KB","MB","GB"]; let i=0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ } return n.toFixed(n < 10 && i ? 1 : 0) + " " + u[i] }

  document.getElementById("footer-source").textContent = meta.sourceFile || "My Clippings.txt"
  document.getElementById("footer-bytes").textContent = humanBytes(meta.sizeBytes || 0)

  // KPIs
  document.getElementById("kpi-books").textContent = fmt.format(summary.bookCount || 0)
  document.getElementById("kpi-books-sub").textContent = (summary.authorCount || 0) + " authors · " + (summary.bookmarksOnlyBookCount || 0) + " bookmarks-only"
  document.getElementById("kpi-clips").textContent = fmt.format(summary.rowCount || 0)
  document.getElementById("kpi-clips-sub").textContent =
    (summary.highlightCount || 0) + " highlights · " +
    (summary.noteCount || 0) + " notes · " +
    (summary.bookmarkCount || 0) + " bookmarks"
  document.getElementById("kpi-window").textContent = summary.durationLabel || "—"
  document.getElementById("kpi-window-sub").textContent = (summary.period || "") + (summary.activeMonths ? " · " + summary.activeMonths + " active months" : "")
  document.getElementById("kpi-author").textContent = ellipsize(summary.topAuthor || "—", 18)
  document.getElementById("kpi-author-sub").textContent = summary.topAuthor
    ? pct(summary.topAuthorShare) + " of clippings"
    : "no author metadata"

  document.getElementById("hero-editorial").textContent = buildEditorial()

  // Stacked timeline (highlights / notes / bookmarks)
  let mode = "year"
  function buildBars(series, labelFn){
    const svg = document.getElementById("bars-svg")
    const axis = document.getElementById("bars-axis")
    svg.innerHTML = ""
    axis.innerHTML = ""
    if (!series.length) { svg.innerHTML = '<text x="500" y="110" text-anchor="middle">No dated clippings</text>'; return }
    const W = 1000, H = 220, pad = 24, padBottom = 30
    const max = series.reduce((m, s) => {
      const t = (s.highlights || 0) + (s.notes || 0) + (s.bookmarks || 0)
      return t > m ? t : m
    }, 0) || 1
    const peak = series.reduce((m, s) => {
      const t = (s.highlights || 0) + (s.notes || 0) + (s.bookmarks || 0)
      const mt = (m.highlights || 0) + (m.notes || 0) + (m.bookmarks || 0)
      return t > mt ? s : m
    }, series[0])
    const bw = (W - pad*2) / series.length
    let svgInner = ""
    series.forEach((s, i) => {
      const total = (s.highlights || 0) + (s.notes || 0) + (s.bookmarks || 0)
      if (!total) return
      const usable = H - pad - padBottom
      const x = pad + i * bw + bw * 0.12
      const w = bw * 0.76
      let yCursor = H - padBottom
      function stackBar(count, cls){
        if (!count) return
        const h = (usable * count / max)
        yCursor -= h
        svgInner += '<rect class="bar '+cls+'" x="'+x.toFixed(1)+'" y="'+yCursor.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2"><title>'+escapeHtml(labelFn(s))+': '+count+' '+cls+'</title></rect>'
      }
      stackBar(s.bookmarks || 0, "b")
      stackBar(s.notes || 0, "n")
      stackBar(s.highlights || 0, "h")
      if (s === peak) {
        svgInner += '<text x="'+(x + w/2).toFixed(1)+'" y="'+(yCursor - 6).toFixed(1)+'" text-anchor="middle" fill="var(--primary)">'+total+'</text>'
      }
    })
    svg.innerHTML = svgInner
    const step = Math.max(1, Math.ceil(series.length / 12))
    const labels = []
    for (let i = 0; i < series.length; i++) {
      labels.push((i % step === 0 || i === series.length - 1) ? labelFn(series[i]) : "")
    }
    axis.innerHTML = labels.map(l => '<span>'+escapeHtml(l)+'</span>').join("")
  }
  function renderBars(){
    if (mode === "year") buildBars(yearTotals, s => s.year)
    else buildBars(monthTotals, s => s.month)
  }
  document.getElementById("t-year").onclick = () => { mode = "year"; document.getElementById("t-year").classList.add("active"); document.getElementById("t-month").classList.remove("active"); renderBars() }
  document.getElementById("t-month").onclick = () => { mode = "month"; document.getElementById("t-month").classList.add("active"); document.getElementById("t-year").classList.remove("active"); renderBars() }
  renderBars()

  // Hour-of-day strip
  const hoursMax = Math.max(...hourCounts, 1)
  const hoursTarget = document.getElementById("hours-strip")
  hoursTarget.innerHTML = hourCounts.map((c, i) => {
    const pctH = c ? Math.max(8, (c / hoursMax) * 100) : 0
    return '<div class="hr" title="'+i+':00 — '+c+' clippings"><i style="height:'+pctH.toFixed(1)+'%"></i><span>'+i+'</span></div>'
  }).join("")

  // Bookshelf
  let shelfSort = "most"
  function sortBooks(){
    const out = books.slice()
    if (shelfSort === "most") {
      out.sort((a,b) => (b.highlightCount + b.noteCount + b.bookmarkCount) - (a.highlightCount + a.noteCount + a.bookmarkCount))
    } else if (shelfSort === "recent") {
      out.sort((a,b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""))
    } else if (shelfSort === "alpha") {
      out.sort((a,b) => a.title.localeCompare(b.title))
    }
    return out
  }
  function sparkline(spark){
    if (!spark || !spark.length) return ""
    const W = 100, H = 24
    const max = Math.max(...spark.map(s => s.count), 1)
    const step = spark.length > 1 ? W / (spark.length - 1) : W
    const points = spark.map((s, i) => (i * step).toFixed(1) + "," + (H - 2 - (H - 4) * (s.count / max)).toFixed(1))
    return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true"><path d="M '+points.join(" L ")+'"/></svg>'
  }
  function renderShelf(){
    const sorted = sortBooks()
    document.getElementById("shelf-meta").textContent = books.length + ' books'
    const stats = books.length ? books.reduce((s, b) => s + b.highlightCount + b.noteCount + b.bookmarkCount, 0) : 0
    document.getElementById("shelf-stats").textContent = stats + ' clippings · sorted'
    const grid = document.getElementById("shelf-grid")
    if (!sorted.length) { grid.innerHTML = '<div class="empty-state">No books in this file.</div>'; return }
    grid.innerHTML = sorted.map(b => {
      const bookmarkOnly = b.highlightCount === 0 && b.noteCount === 0 && b.bookmarkCount > 0
      const author = b.author ? '<div class="author">'+escapeHtml(b.author)+'</div>' : ''
      const counts = '<div class="counts">'+
        '<span><b>'+b.highlightCount+'</b> H</span>'+
        '<span><b>'+b.noteCount+'</b> N</span>'+
        '<span><b>'+b.bookmarkCount+'</b> B</span>'+
      '</div>'
      const range = b.firstSeen ? '<div class="range">'+b.firstSeen+' → '+b.lastSeen+'</div>' : ''
      const chip = bookmarkOnly ? '<span class="chip bookmarks-only">Bookmarks only</span>' : ''
      const spark = '<div class="spark">'+sparkline(b.monthlySparkline)+'</div>'
      return '<div class="shelf" data-book="'+escapeHtml(b.id)+'">'+
        '<div class="title" title="'+escapeHtml(b.title)+'">'+escapeHtml(b.title)+'</div>'+
        author + counts + range + spark + chip +
      '</div>'
    }).join("")
    grid.querySelectorAll(".shelf").forEach(el => {
      el.addEventListener("click", () => {
        toggleChip("book-chips", findBookLabel(el.getAttribute("data-book")))
        document.getElementById("head-quotes").scrollIntoView({ behavior: "smooth" })
      })
    })
  }
  function findBookLabel(id){
    const b = books.find(x => x.id === id)
    return b ? b.title : ""
  }
  document.getElementById("sort-most").onclick = () => { shelfSort = "most"; refreshSortToggle(); renderShelf() }
  document.getElementById("sort-recent").onclick = () => { shelfSort = "recent"; refreshSortToggle(); renderShelf() }
  document.getElementById("sort-alpha").onclick = () => { shelfSort = "alpha"; refreshSortToggle(); renderShelf() }
  function refreshSortToggle(){
    document.querySelectorAll(".sort-toggle button").forEach(b => b.classList.remove("active"))
    document.getElementById("sort-" + shelfSort).classList.add("active")
  }
  renderShelf()

  // Themes
  document.getElementById("themes-meta").textContent = themes.length + ' clusters · click to filter quotes'
  const themesGrid = document.getElementById("themes-grid")
  if (!themes.length) {
    themesGrid.innerHTML = '<div class="empty-state">Not enough English-language highlights for a keyword roll-up.</div>'
  } else {
    themesGrid.innerHTML = themes.map(t => {
      const bookList = t.bookIds.slice(0, 3).map(id => {
        const b = books.find(x => x.id === id)
        return b ? escapeHtml(ellipsize(b.title, 28)) : ""
      }).filter(Boolean).join(" · ")
      return '<div class="theme" data-key="'+escapeHtml(t.key)+'">'+
        '<div class="keyword">'+escapeHtml(t.keyword)+'</div>'+
        '<div class="stats">'+t.count+' highlights · '+t.bookIds.length+' books</div>'+
        (bookList ? '<div class="books">'+bookList+'</div>' : '')+
      '</div>'
    }).join("")
    themesGrid.querySelectorAll(".theme").forEach(el => {
      el.addEventListener("click", () => {
        toggleChip("theme-chips", el.getAttribute("data-key"))
        document.getElementById("head-quotes").scrollIntoView({ behavior: "smooth" })
      })
    })
  }

  // Quote browser
  const PAGE = 40
  let visibleSet = visible.slice()
  let limit = PAGE
  let activeFilters = { books: new Set(), authors: new Set(), types: new Set(), years: new Set(), themes: new Set() }
  let queryStr = ""

  function makeChips(containerId, values, kind){
    const target = document.getElementById(containerId)
    if (!values.length) { target.innerHTML = '<span class="muted" style="font-size:13px">—</span>'; return }
    target.innerHTML = values.map(v =>
      '<button class="chip" data-val="'+escapeHtml(v.label)+'">'+escapeHtml(ellipsize(v.label, 28))+' <span class="count">'+v.count+'</span></button>'
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
    if (!value) return
    const target = document.getElementById(containerId)
    const safe = value.replace(/"/g,'\\"')
    const el = target.querySelector('.chip[data-val="'+safe+'"]')
    if (el) el.click()
  }
  // Build chip options
  const bookCounts = {}, authorCounts = {}, typeCounts = {}, yearCounts = {}, themeCounts = {}
  for (const r of visible) {
    if (r.title) bookCounts[r.title] = (bookCounts[r.title]||0) + 1
    if (r.author) authorCounts[r.author] = (authorCounts[r.author]||0) + 1
    typeCounts[r.kind] = (typeCounts[r.kind]||0) + 1
    if (r.date) {
      const y = r.date.slice(0,4)
      yearCounts[y] = (yearCounts[y]||0) + 1
    }
  }
  for (const t of themes) themeCounts[t.key] = t.count
  function topN(rec, n){ return Object.entries(rec).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([label,count])=>({label,count})) }
  makeChips("book-chips", topN(bookCounts, 12), "books")
  makeChips("author-chips", topN(authorCounts, 8), "authors")
  makeChips("type-chips", topN(typeCounts, 4), "types")
  makeChips("year-chips", topN(yearCounts, 12).sort((a,b)=>a.label.localeCompare(b.label)), "years")
  makeChips("theme-chips", topN(themeCounts, 10), "themes")

  function clippingMatchesTheme(r, themeKey){
    const t = themes.find(x => x.key === themeKey)
    if (!t) return false
    return t.sampleClippingIds.includes(r.id)
  }
  // Theme membership goes beyond sampleClippingIds — we need full ids.
  // Reconstruct cluster → id-set lazily on first use.
  const themeMembers = new Map()
  function buildThemeMembers(){
    if (themeMembers.size) return
    for (const t of themes) themeMembers.set(t.key, new Set(t.sampleClippingIds))
    // Walk visible rows and re-bucket — same coarse logic as the parser.
    const stops = new Set("the and for with that this from your you not are was were have has but they them their there here what when where which while into upon over under just like also some many much even ever very onto onto only after before between because while their about because itself within such still then than would could should might must thing things people would been being".split(" "))
    for (const r of visible) {
      if (r.kind !== "highlight") continue
      if (r.lang !== "en") continue
      const words = (r.text || "").toLowerCase().match(/[a-z][a-z'-]{4,}/g) || []
      const seen = new Set()
      for (const w of words) {
        const stem = w.replace(/(?:'s|ies|ied|ing|ed|es|s)$/, "")
        if (stem.length < 5 || stops.has(stem) || seen.has(stem)) continue
        seen.add(stem)
        if (themeMembers.has(stem)) themeMembers.get(stem).add(r.id)
      }
    }
  }
  function clippingInTheme(r, themeKey){
    buildThemeMembers()
    const set = themeMembers.get(themeKey)
    return !!(set && set.has(r.id))
  }

  function applyFilters(){
    const q = queryStr.toLowerCase().trim()
    visibleSet = visible.filter(r => {
      if (activeFilters.books.size && !activeFilters.books.has(r.title)) return false
      if (activeFilters.authors.size && !activeFilters.authors.has(r.author||"")) return false
      if (activeFilters.types.size && !activeFilters.types.has(r.kind)) return false
      const y = (r.date||"").slice(0,4)
      if (activeFilters.years.size && !activeFilters.years.has(y)) return false
      if (activeFilters.themes.size) {
        let ok = false
        for (const t of activeFilters.themes) if (clippingInTheme(r, t)) { ok = true; break }
        if (!ok) return false
      }
      if (!q) return true
      return ((r.text||"") + " " + (r.title||"") + " " + (r.author||"") + " " + (r.id||"")).toLowerCase().includes(q)
    })
    limit = PAGE
    renderQuotes()
  }
  function highlight(s){
    if (!queryStr) return escapeHtml(s)
    const i = s.toLowerCase().indexOf(queryStr.toLowerCase())
    if (i < 0) return escapeHtml(s)
    return escapeHtml(s.slice(0,i)) + "<mark>" + escapeHtml(s.slice(i, i+queryStr.length)) + "</mark>" + escapeHtml(s.slice(i+queryStr.length))
  }
  function renderQuotes(){
    document.getElementById("drill-count").textContent = visibleSet.length + " of " + visible.length
    const target = document.getElementById("quote-list")
    if (!visibleSet.length) { target.innerHTML = '<div class="empty-state">No clippings match these filters.</div>'; document.getElementById("loadmore").innerHTML = ""; return }
    const slice = visibleSet.slice(0, limit)
    target.innerHTML = slice.map(r => {
      const cls = r.kind
      const body = r.kind === "bookmark" && !r.text
        ? "Bookmark — page saved without a highlight."
        : (r.text || "(empty)")
      const pos = r.page != null ? "page " + r.page : (r.locationStart != null ? "loc " + r.locationStart + (r.locationEnd ? "-" + r.locationEnd : "") : "")
      const badges = []
      if (r.kind === "note") badges.push('<span class="badge note">note</span>')
      if (r.kind === "bookmark") badges.push('<span class="badge bookmark">bookmark</span>')
      if (r.noteAttachedTo) badges.push('<span class="badge attached" title="A note appears at the same location within 5 minutes — heuristic">note attached</span>')
      const bookSafe = JSON.stringify(r.title || "")
      const authorSafe = JSON.stringify(r.author || "")
      return '<article class="quote '+cls+'" data-id="'+escapeHtml(r.id)+'">'+
        '<div class="body">'+highlight(body)+'</div>'+
        '<div class="footer">'+
          '<span class="book">'+escapeHtml(ellipsize(r.title || "(untitled)", 60))+'</span>'+
          (r.author ? '<span class="author">'+escapeHtml(r.author)+'</span>' : '')+
          (r.date ? '<span class="pos">'+r.date+'</span>' : '')+
          (pos ? '<span class="pos">'+escapeHtml(pos)+'</span>' : '')+
          badges.join("")+
          '<span class="actions">'+
            '<button data-act="copy" data-id="'+escapeHtml(r.id)+'">Copy quote</button>'+
            '<button data-act="md" data-id="'+escapeHtml(r.id)+'">Copy as Markdown</button>'+
          '</span>'+
        '</div>'+
      '</article>'
    }).join("")
    target.querySelectorAll("button[data-act]").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation()
        const id = btn.getAttribute("data-id")
        const r = rows.find(x => x.id === id)
        if (!r) return
        const txt = btn.getAttribute("data-act") === "md" ? toMarkdown(r) : (r.text || "")
        copy(txt, btn)
      })
    })
    const lm = document.getElementById("loadmore")
    if (limit < visibleSet.length) lm.innerHTML = '<button id="lm-btn">Load '+Math.min(PAGE, visibleSet.length-limit)+' more</button>'
    else lm.innerHTML = visibleSet.length + ' shown'
    const btn = document.getElementById("lm-btn")
    if (btn) btn.onclick = () => { limit += PAGE; renderQuotes() }
  }
  function toMarkdown(r){
    if (r.kind === "bookmark" && !r.text) {
      const pos = r.page != null ? "page " + r.page : (r.locationStart != null ? "loc " + r.locationStart : "")
      return "Bookmark in *"+(r.title||"")+"*"+(r.author ? " by "+r.author : "")+(pos ? " ("+pos+")" : "")+"."
    }
    const lines = (r.text || "").split(/\n/).map(l => "> " + l).join("\n")
    const cite = "— *"+(r.title||"")+"*"+(r.author ? ", "+r.author : "")+(r.page != null ? " (page "+r.page+")" : (r.locationStart != null ? " (loc "+r.locationStart+")" : ""))
    return lines + "\n>\n" + "> " + cite
  }
  function copy(text, btn){
    const orig = btn.textContent
    const reset = () => { btn.textContent = orig }
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = "Copied"
      setTimeout(reset, 1400)
    }).catch(() => {
      window.prompt("Copy this:", text)
      btn.textContent = "Copied"
      setTimeout(reset, 1400)
    })
  }

  document.getElementById("drill-search").addEventListener("input", (ev) => {
    queryStr = ev.target.value || ""
    applyFilters()
  })
  document.getElementById("drill-clear").addEventListener("click", () => {
    document.getElementById("drill-search").value = ""
    queryStr = ""
    activeFilters = { books: new Set(), authors: new Set(), types: new Set(), years: new Set(), themes: new Set() }
    document.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active"))
    applyFilters()
  })
  applyFilters()

  document.getElementById("jump-quotes-btn").addEventListener("click", () => document.getElementById("head-quotes").scrollIntoView({ behavior: "smooth" }))
  document.getElementById("copy-md-btn").addEventListener("click", () => {
    const md = buildReadingNote()
    copy(md, document.getElementById("copy-md-btn"))
  })

  function buildEditorial(){
    const peakYear = yearTotals.reduce((m, y) => {
      const total = (y.highlights || 0) + (y.notes || 0) + (y.bookmarks || 0)
      const mt = (m.highlights || 0) + (m.notes || 0) + (m.bookmarks || 0)
      return total > mt ? y : m
    }, yearTotals[0] || { year: "—", highlights: 0, notes: 0, bookmarks: 0 })
    const top = books[0]
    const theme = themes[0]
    const parts = []
    parts.push((summary.rowCount || 0)+" clippings across "+(summary.bookCount || 0)+" books over "+(summary.durationLabel||"this window")+".")
    if (peakYear && peakYear.year !== "—") {
      const total = (peakYear.highlights || 0) + (peakYear.notes || 0) + (peakYear.bookmarks || 0)
      if (total) parts.push(peakYear.year+" was the biggest year ("+total+" clippings).")
    }
    if (top) {
      const t = top.highlightCount + top.noteCount + top.bookmarkCount
      parts.push("\""+ellipsize(top.title, 50)+"\""+(top.author?" by "+top.author:"")+" leads with "+t+" clippings.")
    }
    if (theme) parts.push("Recurring keyword: "+theme.keyword.split(" · ")[0]+" ("+theme.count+" highlights, heuristic).")
    return parts.join(" ")
  }
  function buildReadingNote(){
    const lines = []
    lines.push("# " + (document.getElementById("hero-title").textContent || "Kindle highlights"))
    lines.push("")
    lines.push(buildEditorial())
    lines.push("")
    lines.push("## Headline")
    lines.push("- " + (summary.rowCount || 0) + " clippings (" + (summary.highlightCount||0) + " highlights, " + (summary.noteCount||0) + " notes, " + (summary.bookmarkCount||0) + " bookmarks)")
    lines.push("- " + (summary.bookCount || 0) + " books, " + (summary.authorCount || 0) + " authors")
    lines.push("- Window: " + (summary.period || "—") + " (" + (summary.durationLabel || "—") + ", " + (summary.activeMonths || 0) + " active months)")
    if (summary.duplicateGroupCount) lines.push("- " + summary.duplicateGroupCount + " duplicate-extension groups collapsed")
    lines.push("")
    lines.push("## Most-highlighted books")
    for (const b of books.slice(0, 8)) {
      lines.push("- *" + b.title + "*" + (b.author ? " — " + b.author : "") + " · " + b.highlightCount + " H · " + b.noteCount + " N · " + b.bookmarkCount + " B")
    }
    lines.push("")
    if (themes.length) {
      lines.push("## Themes (heuristic keyword roll-up)")
      for (const t of themes.slice(0, 6)) {
        lines.push("- " + t.keyword + " — " + t.count + " highlights")
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
    console.error("Usage: node scripts/render_kindle_highlights_fallback.mjs INPUT --out OUT --title TITLE")
    process.exit(1)
  }
  const input = args[0]
  const out = arg(args, "--out") || input.replace(/\.[^.]+$/, ".html")
  const title = arg(args, "--title") || path.basename(input).replace(/\.[^.]+$/, "")

  const parser = await pickParser(input)
  if (!parser) { console.error("No parser matched", input); process.exit(2) }
  const parsed = await parser.parse(input)
  if (parsed.contentType !== "kindle-highlights") {
    console.error("Expected kindle-highlights, got", parsed.contentType)
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

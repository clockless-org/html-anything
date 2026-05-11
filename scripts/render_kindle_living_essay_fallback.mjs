#!/usr/bin/env node
/**
 * Offline example renderer for the living-essay / Concept Weave style using
 * the checked-in Kindle highlights fixture.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { pickParser } from "../dist/parse/index.js"

const TEMPLATE = String.raw`<!doctype html>
<html lang="en" data-ha-style="living-essay">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__</title>
<!-- html-anything family sections: Reading rhythm | Bookshelf | Themes you return to | Quote browser | Heuristic | Hour-of-day | Generated locally | kindle-highlights -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --primary: #a03b00; --primary-container: #c94c00; --primary-fixed: #ffdbcd;
  --primary-fixed-dim: #ffb597; --on-primary: #ffffff; --accent-glow: #E8400D;
  --secondary: #d5baff; --secondary-container: #7b40e0; --tertiary: #4d44e3; --accent-cyan: #00D4FF;
  --bg: #fff8f6; --surface: #fff8f6; --surface-container-lowest: #ffffff;
  --surface-container-low: #fbf2ef; --surface-container: #f5ece9; --surface-container-high: #efe6e3;
  --fg-1: #1e1b19; --fg-2: #594138; --fg-muted: #8d7166;
  --border: rgba(0, 0, 0, 0.06); --border-strong: rgba(0, 0, 0, 0.12); --outline-variant: #e1bfb2;
  --green: #10b981; --blue: #3b82f6; --yellow: #f59e0b; --red: #ef4444;
  --font-headline: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-body: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'SF Mono', 'Menlo', ui-monospace, monospace;
  --space-xs: 4px; --space-sm: 8px; --space-md: 12px; --space-lg: 16px;
  --space-xl: 20px; --space-2xl: 24px; --space-3xl: 32px; --space-4xl: 48px; --space-5xl: 64px;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 20px; --radius-2xl: 28px; --radius-pill: 9999px;
  --shadow-sm: 0 1px 2px rgba(30, 27, 25, 0.04); --shadow-md: 0 4px 12px rgba(30, 27, 25, 0.08);
  --shadow-lg: 0 8px 24px rgba(30, 27, 25, 0.12); --shadow-accent: 0 8px 24px rgba(160, 59, 0, 0.15);
  --gradient-primary: linear-gradient(135deg, #a03b00 0%, #c94c00 100%);
  --gradient-hero: linear-gradient(135deg, #a03b00 0%, #7b40e0 100%);
  --gradient-text: linear-gradient(135deg, #a03b00 0%, #7b40e0 100%);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #060B18; --surface: #0B1426; --surface-container-lowest: #101D35;
    --surface-container-low: #101D35; --surface-container: #162544; --surface-container-high: #1c2d52;
    --fg-1: #F8FAFC; --fg-2: #CBD5E1; --fg-muted: #64748B;
    --border: rgba(255,255,255,.08); --border-strong: rgba(255,255,255,.14);
    --primary: #FF6B35; --accent-glow: #00D4FF;
    --shadow-md: 0 4px 12px rgba(0,0,0,.4); --shadow-lg: 0 8px 24px rgba(0,0,0,.5);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--fg-1);
  font-family: var(--font-body);
  background:
    linear-gradient(90deg, rgba(160,59,0,.07) 1px, transparent 1px),
    linear-gradient(rgba(160,59,0,.035) 1px, transparent 1px),
    radial-gradient(820px 420px at 88% -120px, rgba(123,64,224,.08), transparent 62%),
    var(--bg);
  background-size: 76px 100%, 100% 34px, auto, auto;
  line-height: 1.72;
  -webkit-font-smoothing: antialiased;
}
button, input { font: inherit; }
button { color: inherit; }
a { color: var(--primary); }
.weave-layer { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; }
.weave-path { fill: none; stroke: var(--primary); stroke-width: 1.2; stroke-linecap: round; opacity: .42; filter: drop-shadow(0 1px 5px rgba(160,59,0,.22)); stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .72s ease forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.living-shell {
  position: relative;
  z-index: 3;
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: 76px 0 96px;
  display: grid;
  grid-template-columns: 230px minmax(0, 760px);
  gap: 58px;
}
.question-rail { position: relative; }
.rail-inner { position: sticky; top: 86px; display: grid; gap: var(--space-lg); justify-items: end; }
.rail-kicker {
  color: var(--fg-muted);
  font: 700 11px/1 var(--font-mono);
  letter-spacing: .12em;
  text-transform: uppercase;
}
.question-capsule {
  min-height: 242px;
  width: 74px;
  border: 1px solid color-mix(in srgb, var(--primary) 22%, var(--border));
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--surface-container-lowest) 86%, var(--primary-fixed));
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl) var(--space-sm);
  writing-mode: vertical-rl;
  text-orientation: mixed;
  color: var(--fg-1);
  font-family: var(--font-headline);
  font-size: 17px;
  letter-spacing: .08em;
  text-align: center;
}
.question-capsule::before {
  content: "";
  position: absolute;
  width: 86px;
  min-height: 262px;
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  animation: pulse 3.4s ease-in-out infinite;
}
@keyframes pulse { 50% { transform: scale(1.035); opacity: .42; } }
.concept-list { display: grid; gap: var(--space-sm); width: 100%; }
.concept-tab {
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-container-lowest);
  color: var(--fg-2);
  padding: 8px 12px;
  text-align: right;
  cursor: pointer;
}
.concept-tab[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--primary) 44%, var(--border));
  color: var(--primary);
  background: var(--primary-fixed);
}
.manuscript-stage { min-width: 0; }
.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xl);
  padding-bottom: var(--space-xl);
  border-bottom: 1px solid var(--border);
  color: var(--fg-muted);
  font: 600 12px/1.4 var(--font-mono);
}
h1 {
  margin: 62px 0 24px;
  color: var(--fg-1);
  font-family: var(--font-headline);
  font-size: clamp(44px, 8vw, 86px);
  line-height: .94;
  letter-spacing: -.055em;
}
.dek, .synthesis {
  color: var(--fg-2);
  font-size: clamp(18px, 2vw, 21px);
  line-height: 1.95;
  max-width: 68ch;
}
.synthesis { margin-top: var(--space-3xl); }
.spore {
  border: 0;
  padding: 0 .12em;
  background: linear-gradient(transparent 64%, color-mix(in srgb, var(--primary) 22%, transparent) 64%);
  color: color-mix(in srgb, var(--primary) 72%, var(--fg-1));
  cursor: pointer;
  border-radius: 3px;
}
.spore.connected { background: linear-gradient(transparent 46%, color-mix(in srgb, var(--secondary-container) 22%, transparent) 46%); color: var(--secondary-container); }
.summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-md);
  margin: var(--space-4xl) 0;
}
.stat-slip {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-container-lowest) 86%, transparent);
  padding: var(--space-lg);
}
.stat-slip strong { display: block; color: var(--primary); font: 700 29px/1 var(--font-headline); letter-spacing: -.03em; }
.stat-slip span { display: block; margin-top: 6px; color: var(--fg-muted); font: 600 11px/1.3 var(--font-mono); text-transform: uppercase; letter-spacing: .08em; }
.living-section { margin-top: 76px; scroll-margin-top: 48px; }
.section-head { display: flex; justify-content: space-between; align-items: end; gap: var(--space-lg); margin-bottom: var(--space-lg); }
.section-head h2 { margin: 0; font-family: var(--font-headline); font-size: 28px; letter-spacing: -.03em; line-height: 1; }
.section-note { color: var(--fg-muted); font: 600 12px/1.4 var(--font-mono); }
.heuristic-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-container);
  color: var(--fg-2);
  padding: 4px 9px;
  font: 700 10px/1 var(--font-mono);
  letter-spacing: .08em;
  text-transform: uppercase;
}
.paper-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: color-mix(in srgb, var(--surface-container-lowest) 88%, transparent);
  box-shadow: var(--shadow-sm);
  padding: var(--space-xl);
}
.rhythm-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: var(--space-lg); align-items: stretch; }
.year-bars { display: grid; gap: 9px; }
.year-row { display: grid; grid-template-columns: 54px 1fr 46px; align-items: center; gap: 10px; color: var(--fg-muted); font: 600 12px/1 var(--font-mono); }
.year-track { height: 10px; border-radius: var(--radius-pill); background: var(--surface-container); overflow: hidden; }
.year-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--primary), var(--secondary-container)); transform-origin: left; animation: grow .7s ease both; }
@keyframes grow { from { transform: scaleX(0); } }
.hour-strip { display: grid; grid-template-columns: repeat(12, 1fr); gap: 5px; }
.hour-cell { min-height: 44px; border-radius: var(--radius-sm); background: var(--surface-container); position: relative; overflow: hidden; color: var(--fg-muted); font: 600 10px/1 var(--font-mono); display: flex; align-items: start; justify-content: center; padding-top: 6px; }
.hour-cell::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: var(--h); background: linear-gradient(180deg, var(--primary), var(--primary-container)); opacity: .72; }
.hour-cell span { position: relative; z-index: 1; }
.concept-garden, .bookshelf-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-md); }
.concept-card, .book-card, .passage-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-container-lowest);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
}
.concept-card { cursor: pointer; transition: transform .18s ease, border-color .18s ease; }
.concept-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--primary) 42%, var(--border)); }
.concept-card.active { border-color: color-mix(in srgb, var(--primary) 54%, var(--border)); background: color-mix(in srgb, var(--primary-fixed) 42%, var(--surface-container-lowest)); }
.concept-card strong, .book-card strong { display: block; font-family: var(--font-headline); font-size: 18px; letter-spacing: -.02em; }
.concept-card p, .book-card p { margin: 7px 0 0; color: var(--fg-muted); font-size: 13px; line-height: 1.45; }
.book-card { cursor: pointer; }
.book-card.selected { border-color: color-mix(in srgb, var(--secondary-container) 42%, var(--border)); }
.folio-tools { display: flex; gap: var(--space-sm); align-items: center; flex-wrap: wrap; margin-bottom: var(--space-lg); }
.folio-search {
  flex: 1 1 260px;
  min-height: 42px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--surface-container-lowest);
  color: var(--fg-1);
  padding: 0 14px;
}
.folio-search:focus { outline: 2px solid color-mix(in srgb, var(--primary) 44%, transparent); outline-offset: 2px; }
.folio-button {
  min-height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-container-lowest);
  color: var(--fg-2);
  padding: 0 13px;
  cursor: pointer;
}
.quote-list { display: grid; gap: var(--space-md); }
.passage-card { position: relative; transition: opacity .18s ease, border-color .18s ease, transform .18s ease; }
.passage-card.theme-match { border-color: color-mix(in srgb, var(--primary) 34%, var(--border)); }
.passage-card:hover { transform: translateY(-2px); }
.passage-body { margin: 0; color: var(--fg-1); font-size: 16px; line-height: 1.72; }
.passage-body.note { color: var(--fg-2); font-style: italic; }
.passage-meta { display: flex; flex-wrap: wrap; gap: 9px; margin-top: var(--space-md); color: var(--fg-muted); font: 600 11px/1.4 var(--font-mono); }
.passage-actions { margin-left: auto; display: flex; gap: 7px; }
.passage-actions button { border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--surface-container); color: var(--fg-2); padding: 5px 9px; cursor: pointer; font: inherit; }
footer { margin-top: 92px; padding-top: var(--space-xl); border-top: 1px solid var(--border); color: var(--fg-muted); font-size: 13px; max-width: 74ch; }
@media (max-width: 880px) {
  .living-shell { width: min(100% - 28px, 760px); display: block; padding-top: 34px; }
  .rail-inner { position: sticky; top: 0; z-index: 5; justify-items: stretch; padding: 10px 0 14px; background: linear-gradient(var(--bg) 76%, transparent); }
  .question-capsule { min-height: 0; width: auto; writing-mode: horizontal-tb; padding: 13px 16px; justify-content: flex-start; }
  .question-capsule::before { display: none; }
  .concept-list { display: flex; overflow-x: auto; padding-bottom: 4px; }
  .concept-tab { flex: 0 0 auto; text-align: center; }
  h1 { margin-top: 38px; }
  .summary-strip, .rhythm-grid, .concept-garden, .bookshelf-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
  .weave-path { stroke-dashoffset: 0; }
}
</style>
</head>
<body>
<svg class="weave-layer" id="weave-layer" aria-hidden="true"></svg>
<main class="living-shell">
  <aside class="question-rail" aria-label="Concept rail">
    <div class="rail-inner">
      <div class="rail-kicker">Concept weave</div>
      <div class="question-capsule" id="question-capsule">What keeps returning?</div>
      <div class="concept-list" id="rail-concepts"></div>
    </div>
  </aside>

  <article class="manuscript-stage">
    <div class="meta-line">
      <span>kindle-highlights</span>
      <span id="meta-period">reading window</span>
      <span id="meta-count">0 clippings</span>
    </div>
    <h1>What this reading archive keeps returning to</h1>
    <p class="dek" id="dek"></p>
    <p class="synthesis" id="synthesis"></p>

    <div class="summary-strip" id="summary-strip"></div>

    <section class="living-section reading-rhythm" id="reading-rhythm" aria-labelledby="rhythm-title">
      <div class="section-head">
        <h2 id="rhythm-title">Reading rhythm</h2>
        <span class="section-note">Yearly volume + Hour-of-day strip</span>
      </div>
      <div class="paper-panel rhythm-grid">
        <div>
          <div class="heuristic-chip">Reading seasons</div>
          <div class="year-bars" id="year-bars"></div>
        </div>
        <div>
          <div class="heuristic-chip">Hour-of-day</div>
          <div class="hour-strip" id="hour-strip"></div>
        </div>
      </div>
    </section>

    <section class="living-section" aria-labelledby="themes-title">
      <div class="section-head">
        <h2 id="themes-title">Themes you return to</h2>
        <span class="heuristic-chip">Heuristic</span>
      </div>
      <div class="concept-garden" id="concept-garden"></div>
    </section>

    <section class="living-section" aria-labelledby="books-title">
      <div class="section-head">
        <h2 id="books-title">Bookshelf</h2>
        <span class="section-note">Click a book to focus the folio</span>
      </div>
      <div class="bookshelf-grid" id="bookshelf-grid"></div>
    </section>

    <section class="living-section evidence-folio" aria-labelledby="quote-title">
      <div class="section-head">
        <h2 id="quote-title">Quote browser</h2>
        <span class="section-note" id="folio-count">0 passages</span>
      </div>
      <div class="paper-panel">
        <div class="folio-tools">
          <input class="folio-search" id="folio-search" type="search" placeholder="Search passages, books, authors..." aria-label="Search quote browser">
          <button class="folio-button" id="clear-focus" type="button">Clear focus</button>
          <button class="folio-button" id="copy-note" type="button">Copy reading note</button>
        </div>
        <div class="quote-list" id="quote-list"></div>
      </div>
    </section>

    <footer>
      <p><strong>Generated locally</strong> by html-anything from <span id="source-file">input.txt</span>. The page uses the <code>living-essay</code> style and embeds the full Kindle export for offline browsing. Theme links are a heuristic keyword roll-up from the parser, not semantic topic modeling.</p>
    </footer>
  </article>
</main>

<script>const DATA = __DATA__;</script>
<script>
(() => {
  const rows = (DATA.rows || []).filter(row => !row.duplicateOf);
  const quotes = rows.filter(row => row.text && row.text.trim());
  const books = DATA.books || [];
  const themes = (DATA.themeClusters || []).slice(0, 6);
  const yearTotals = DATA.yearTotals || [];
  const hourCounts = DATA.hourCounts || Array.from({ length: 24 }, () => 0);
  const summary = DATA.summary || {};
  const meta = DATA.meta || {};
  const fmt = new Intl.NumberFormat("en-US");
  let activeTheme = themes[0]?.key || "";
  let activeBook = "";
  let query = "";

  const conceptNames = {
    every: "recurring everyday",
    small: "small rituals",
    weather: "weather and patience",
    other: "otherness",
    different: "difference as signal",
    forest: "forest thinking",
  };

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function conceptLabel(theme) {
    if (!theme) return "reading";
    return conceptNames[theme.key] || theme.keyword || theme.key;
  }
  function conceptWords(theme) {
    if (!theme) return [];
    const raw = [theme.key, theme.keyword].join(" ");
    return [...new Set((raw.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).map(w => w.replace(/(?:'s|ing|ed|es|s)$/, "")))];
  }
  function rowMatchesTheme(row, key) {
    const theme = themes.find(t => t.key === key);
    if (!theme) return false;
    if ((theme.sampleClippingIds || []).includes(row.id)) return true;
    const text = \`\${row.text || ""} \${row.title || ""}\`.toLowerCase();
    return conceptWords(theme).some(word => text.includes(word));
  }
  function currentTheme() {
    return themes.find(t => t.key === activeTheme) || themes[0];
  }
  function filteredQuotes() {
    const q = query.trim().toLowerCase();
    return quotes.filter(row => {
      if (activeTheme && !rowMatchesTheme(row, activeTheme)) return false;
      if (activeBook && row.bookId !== activeBook) return false;
      if (!q) return true;
      return \`\${row.text} \${row.title} \${row.author || ""}\`.toLowerCase().includes(q);
    });
  }
  function topBook() {
    return books.slice().sort((a, b) => (b.highlightCount + b.noteCount + b.bookmarkCount) - (a.highlightCount + a.noteCount + a.bookmarkCount))[0];
  }

  function renderHeader() {
    $("meta-period").textContent = summary.period || meta.period || "reading window";
    $("meta-count").textContent = \`\${fmt.format(summary.rowCount || rows.length)} clippings\`;
    const top = topBook();
    const theme = currentTheme();
    $("dek").textContent = \`\${fmt.format(summary.rowCount || rows.length)} clippings across \${fmt.format(summary.bookCount || books.length)} books. Instead of a report, this page treats the archive as a manuscript: choose a concept in the margin and the relevant passages light up.\`;
    $("synthesis").innerHTML = [
      \`This archive keeps circling <button class="spore" data-concept="\${esc(theme?.key || "")}">\${esc(conceptLabel(theme))}</button>.\`,
      top ? \`The strongest shelf signal comes from <button class="spore" data-book="\${esc(top.id)}">\${esc(top.title)}</button>.\` : "",
      \`The reading pattern is less about volume than return: small phrases repeat across months, books, and notes.\`
    ].filter(Boolean).join(" ");
    $("source-file").textContent = meta.sourceFile || "input.txt";
    $("summary-strip").innerHTML = [
      ["Books", summary.bookCount || books.length],
      ["Clippings", summary.rowCount || rows.length],
      ["Highlights", summary.highlightCount || rows.filter(r => r.kind === "highlight").length],
      ["Active months", summary.activeMonths || "—"],
    ].map(([label, value]) => \`<div class="stat-slip"><strong>\${esc(fmt.format(value))}</strong><span>\${esc(label)}</span></div>\`).join("");
    document.querySelectorAll(".spore[data-concept]").forEach(el => el.addEventListener("click", () => selectTheme(el.dataset.concept)));
    document.querySelectorAll(".spore[data-book]").forEach(el => el.addEventListener("click", () => selectBook(el.dataset.book)));
  }

  function renderConcepts() {
    const rail = $("rail-concepts");
    const garden = $("concept-garden");
    rail.innerHTML = themes.map(theme => \`<button class="concept-tab" type="button" data-key="\${esc(theme.key)}" aria-pressed="\${theme.key === activeTheme}">\${esc(conceptLabel(theme))}</button>\`).join("");
    garden.innerHTML = themes.map(theme => {
      const bookNames = (theme.bookIds || []).slice(0, 3).map(id => books.find(b => b.id === id)?.title).filter(Boolean);
      return \`<button class="concept-card \${theme.key === activeTheme ? "active" : ""}" type="button" data-key="\${esc(theme.key)}">
        <strong>\${esc(conceptLabel(theme))}</strong>
        <p>\${fmt.format(theme.count || 0)} matching highlights · \${fmt.format((theme.bookIds || []).length)} books</p>
        <p>\${esc(bookNames.join(" · ") || "Theme found in highlight text")}</p>
      </button>\`;
    }).join("");
    document.querySelectorAll("[data-key]").forEach(el => el.addEventListener("click", () => selectTheme(el.dataset.key)));
    const theme = currentTheme();
    $("question-capsule").textContent = theme ? \`Where does \${conceptLabel(theme)} appear?\` : "What keeps returning?";
  }

  function renderRhythm() {
    const max = Math.max(1, ...yearTotals.map(y => (y.highlights || 0) + (y.notes || 0) + (y.bookmarks || 0)));
    $("year-bars").innerHTML = yearTotals.map(y => {
      const total = (y.highlights || 0) + (y.notes || 0) + (y.bookmarks || 0);
      return \`<div class="year-row"><span>\${esc(y.year)}</span><div class="year-track"><div class="year-fill" style="width:\${Math.max(4, total / max * 100).toFixed(1)}%"></div></div><span>\${fmt.format(total)}</span></div>\`;
    }).join("") || \`<p class="section-note">No dated highlights.</p>\`;
    const hourMax = Math.max(1, ...hourCounts);
    $("hour-strip").innerHTML = hourCounts.map((count, hour) => \`<div class="hour-cell" title="\${hour}:00 · \${count} clippings" style="--h:\${Math.max(4, count / hourMax * 100).toFixed(1)}%"><span>\${hour}</span></div>\`).join("");
  }

  function renderBookshelf() {
    const topBooks = books.slice().sort((a, b) => (b.highlightCount + b.noteCount + b.bookmarkCount) - (a.highlightCount + a.noteCount + a.bookmarkCount)).slice(0, 8);
    $("bookshelf-grid").innerHTML = topBooks.map(book => {
      const total = book.highlightCount + book.noteCount + book.bookmarkCount;
      return \`<button class="book-card \${book.id === activeBook ? "selected" : ""}" type="button" data-book-id="\${esc(book.id)}">
        <strong>\${esc(book.title)}</strong>
        <p>\${esc(book.author || "Unknown author")}</p>
        <p>\${fmt.format(total)} clippings · \${book.highlightCount} H · \${book.noteCount} N · \${book.bookmarkCount} B</p>
      </button>\`;
    }).join("");
    document.querySelectorAll(".book-card").forEach(card => card.addEventListener("click", () => selectBook(card.dataset.bookId)));
  }

  function renderQuotes() {
    const list = filteredQuotes();
    $("folio-count").textContent = \`\${fmt.format(list.length)} passages\`;
    $("quote-list").innerHTML = list.slice(0, 18).map(row => {
      const match = activeTheme && rowMatchesTheme(row, activeTheme);
      const place = row.page ? \`page \${row.page}\` : row.locationStart ? \`loc \${row.locationStart}\` : "kindle clipping";
      return \`<article class="passage-card \${match ? "theme-match" : ""}" data-id="\${esc(row.id)}">
        <p class="passage-body \${row.kind === "note" ? "note" : ""}">\${esc(row.text)}</p>
        <div class="passage-meta">
          <span>\${esc(row.title)}</span>
          <span>\${esc(row.author || "Unknown")}</span>
          <span>\${esc(row.date || "")}</span>
          <span>\${esc(place)}</span>
          <span>\${esc(row.kind)}</span>
          <span class="passage-actions">
            <button type="button" data-copy="\${esc(row.id)}">Copy</button>
          </span>
        </div>
      </article>\`;
    }).join("") || \`<div class="passage-card"><p class="passage-body">No passages match this focus.</p></div>\`;
    document.querySelectorAll("[data-copy]").forEach(btn => btn.addEventListener("click", () => {
      const row = rows.find(r => r.id === btn.dataset.copy);
      if (!row) return;
      const cite = row.author ? \`\${row.title}, \${row.author}\` : row.title;
      const text = \`> \${row.text}\n>\n> — \${cite}\`;
      navigator.clipboard?.writeText(text).then(() => {
        const old = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(() => { btn.textContent = old; }, 1000);
      }).catch(() => window.prompt("Copy this:", text));
    }));
    requestAnimationFrame(drawWeave);
  }

  function selectTheme(key) {
    activeTheme = key || activeTheme;
    activeBook = "";
    renderAll();
  }
  function selectBook(id) {
    activeBook = id || "";
    renderBookshelf();
    renderQuotes();
  }
  function renderAll() {
    renderHeader();
    renderConcepts();
    renderRhythm();
    renderBookshelf();
    renderQuotes();
    document.querySelectorAll(".spore").forEach(spore => spore.classList.toggle("connected", spore.dataset.concept === activeTheme || spore.dataset.book === activeBook));
  }

  function drawWeave() {
    const svg = $("weave-layer");
    svg.innerHTML = "";
    const capsule = $("question-capsule");
    if (!capsule) return;
    const start = capsule.getBoundingClientRect();
    const sx = start.right;
    const sy = start.top + start.height / 2;
    const spores = [...document.querySelectorAll(".spore[data-concept]")].filter(spore => {
      if (spore.dataset.concept !== activeTheme) return false;
      const r = spore.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    });
    const cards = [...document.querySelectorAll(".passage-card.theme-match")].filter(card => {
      const r = card.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    }).slice(0, 5);
    const targets = [...spores, ...cards].slice(0, 6);
    for (const target of targets) {
      const r = target.getBoundingClientRect();
      const ex = r.left + 6;
      const ey = r.top + Math.min(86, r.height / 2);
      const cx1 = sx + Math.max(80, (ex - sx) * .32);
      const cx2 = ex - Math.max(80, (ex - sx) * .22);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "weave-path");
      path.setAttribute("pathLength", "1");
      path.setAttribute("d", \`M \${sx} \${sy} C \${cx1} \${sy}, \${cx2} \${ey}, \${ex} \${ey}\`);
      svg.appendChild(path);
    }
  }

  $("folio-search").addEventListener("input", event => {
    query = event.target.value || "";
    renderQuotes();
  });
  $("clear-focus").addEventListener("click", () => {
    activeBook = "";
    query = "";
    $("folio-search").value = "";
    renderAll();
  });
  $("copy-note").addEventListener("click", () => {
    const theme = currentTheme();
    const note = [
      "# " + document.title,
      "",
      $("dek").textContent,
      "",
      "## Active concept",
      "- " + conceptLabel(theme),
      "",
      "## Sample passages",
      ...filteredQuotes().slice(0, 5).map(row => \`- "\${row.text}" — \${row.title}\`)
    ].join("\n");
    navigator.clipboard?.writeText(note).catch(() => window.prompt("Copy this:", note));
  });
  window.addEventListener("resize", () => requestAnimationFrame(drawWeave));
  window.addEventListener("scroll", () => requestAnimationFrame(drawWeave), { passive: true });

  renderAll();
})();
</script>
</body>
</html>`;

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("Usage: node scripts/render_kindle_living_essay_fallback.mjs INPUT --out OUT --title TITLE");
    process.exit(1);
  }
  const input = args[0];
  const out = arg(args, "--out") || input.replace(/\.[^.]+$/, ".html");
  const title = arg(args, "--title") || path.basename(input).replace(/\.[^.]+$/, "");

  const parser = await pickParser(input);
  if (!parser) {
    console.error("No parser matched " + input);
    process.exit(2);
  }
  const parsed = await parser.parse(input);
  if (parsed.contentType !== "kindle-highlights") {
    console.error("Expected kindle-highlights, got " + parsed.contentType);
    process.exit(3);
  }
  const html = unescapeInnerTemplateLiterals(TEMPLATE)
    .replace(/__TITLE__/g, escapeHtml(title))
    .replace("__DATA__", inlineJson(parsed.data));
  await fs.writeFile(out, html, "utf8");
  console.log("Wrote " + out + " (" + (html.length / 1024).toFixed(1) + " KB)");
}

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function inlineJson(value) {
  return JSON.stringify(value).replace(/<\/(script)/gi, "<\\/$1");
}
function unescapeInnerTemplateLiterals(value) {
  return value
    .replace(/\\`/g, "`")
    .replace(/\\\$\{/g, "${");
}

await main();

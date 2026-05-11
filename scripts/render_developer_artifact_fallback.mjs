/**
 * Offline fallback renderer for the developer-artifact family
 * (git-diff, pr-review, ci-log, stack-trace). The canonical pipeline
 * is `dist/cli.js → htmlize → LLM`, but some operators run example
 * regeneration on machines without an Anthropic / OpenAI key. This
 * script reuses the same parser, then applies a hand-tuned shared
 * template that satisfies the _developer.md contract:
 *
 *   - Review checklist (concrete, evidence-based)
 *   - Risk hotspots (with visible "Hypothesis" chips)
 *   - Suspected cause(s) for ci-log + stack-trace (with chips)
 *   - Collapsible raw diff / log / trace
 *   - Copyable Markdown summary
 *   - Hypothesis discipline — every inferred sentence gets a chip
 *
 * The template emits `__DATA__` and is injected with the SAME
 * substitution logic htmlize.ts uses, so the resulting page renders
 * the full inlined data identically to an LLM-designed page.
 *
 * Heuristics fill the "Hypothesis"-chipped slots from the parser
 * output (top files by churn, exception + topmost app frame,
 * first failing test, first error marker). They are intentionally
 * conservative and labeled — the LLM-driven path will produce
 * richer commentary, but every required-section label still
 * renders on the offline path.
 *
 * Usage:
 *   node scripts/render_developer_artifact_fallback.mjs INPUT --out OUT --title TITLE
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { pickParser } from "../dist/parse/index.js"

// ---------------------------------------------------------------------------
// Shared shell — design tokens + chrome that every developer-artifact page
// reuses. Body content slots into `__BODY__`.
// ---------------------------------------------------------------------------

const SHELL = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>__TITLE__</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
:root {
  color-scheme:dark;
  --primary:#33ff00; --secondary:#ffb000; --muted:#1f521f; --accent:#33ff00;
  --error:#ff3333; --on-primary:#050505;
  --bg:#0a0a0a; --surface:#0a0a0a; --surface-container-lowest:#0a0a0a;
  --surface-container-low:#0d160d; --surface-container:#102610; --surface-container-high:#153315;
  --fg-1:#33ff00; --fg-2:#b7ff9a; --fg-muted:#1f521f;
  --border:#1f521f; --border-strong:#33ff00; --outline-variant:#33ff00;
  --green:#33ff00; --blue:#72d5ff; --yellow:#ffb000; --red:#ff3333;
  --primary-container:#33ff00; --primary-fixed:#102610; --primary-fixed-dim:#1f521f;
  --secondary-container:#ffb000; --tertiary:#72d5ff; --accent-cyan:#72d5ff;
  --font-headline:'JetBrains Mono','Fira Code','SF Mono','Menlo','Consolas',monospace;
  --font-body:'JetBrains Mono','Fira Code','SF Mono','Menlo','Consolas',monospace;
  --font-mono:'JetBrains Mono','Fira Code','SF Mono','Menlo','Consolas',monospace;
  --space-xs:4px; --space-sm:8px; --space-md:12px; --space-lg:16px;
  --space-xl:20px; --space-2xl:24px; --space-3xl:32px; --space-4xl:48px; --space-5xl:64px;
  --radius-sm:0; --radius-md:0; --radius-lg:0; --radius-xl:0; --radius-2xl:0; --radius-pill:0;
  --shadow-sm:none; --shadow-md:none; --shadow-lg:none; --shadow-accent:none;
  --gradient-primary:none; --gradient-hero:none; --gradient-text:none;
  --text-glow:0 0 5px rgba(51,255,0,.5);
}
*,*::before,*::after{box-sizing:border-box;margin:0}
html,body{background:var(--bg);color:var(--fg-1);font-family:var(--font-body);
  font-size:15px;line-height:1.55;-webkit-font-smoothing:none;text-rendering:geometricPrecision}
body{min-height:100vh;text-shadow:var(--text-glow)}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:999;
  background:repeating-linear-gradient(to bottom,rgba(51,255,0,.045) 0,rgba(51,255,0,.045) 1px,transparent 1px,transparent 4px);
  mix-blend-mode:screen;opacity:.32}
main{max-width:1240px;margin:0 auto;padding:var(--space-2xl) var(--space-xl) var(--space-5xl)}
h1,h2,h3,h4{font-family:var(--font-headline);letter-spacing:0;font-weight:700;color:var(--fg-1);text-transform:uppercase}
h1{font-size:32px;font-weight:800;line-height:1.12}
h2{font-size:20px;margin-bottom:var(--space-md)}
h3{font-size:16px;margin-bottom:var(--space-sm)}
.muted{color:var(--fg-muted)}
.mono{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
button{font:inherit;cursor:pointer;border:none;background:transparent;color:inherit}
input,select{font:inherit;color:var(--fg-1)}
.hero{padding:var(--space-2xl) 0 var(--space-2xl);border-bottom:1px dashed var(--border)}
.hero .eyebrow{display:inline-flex;gap:var(--space-sm);align-items:center;
  background:transparent;color:var(--secondary);
  padding:0;font-family:var(--font-mono);font-size:12px;font-weight:700;
  text-transform:uppercase;letter-spacing:0;margin-bottom:var(--space-md)}
.hero .eyebrow::before{content:"review@html-anything:~/artifact$";color:var(--fg-muted)}
.hero .eyebrow::after{content:"_";display:inline-block;color:var(--primary);animation:blink 1s steps(1,end) infinite}
.hero h1{color:var(--fg-1);max-width:34ch}
.hero h1::before{content:"> ";color:var(--fg-muted)}
.hero .editorial{margin-top:var(--space-md);max-width:82ch;color:var(--fg-2);font-size:14px;line-height:1.55}
.hero-actions{display:flex;gap:var(--space-md);margin-top:var(--space-xl);flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:var(--space-sm);padding:var(--space-sm) var(--space-lg);
  border-radius:0;font-weight:700;font-size:13px;border:1px solid var(--border-strong);
  background:var(--surface-container-lowest);color:var(--fg-1);transition:background .12s ease,color .12s ease;cursor:pointer;
  text-transform:uppercase;text-decoration:none}
.btn::before{content:"["}.btn::after{content:"]"}
.btn:hover,.btn:focus-visible{background:var(--primary);color:var(--on-primary);outline:1px solid var(--primary);outline-offset:2px;text-shadow:none}
.btn.primary{background:var(--primary);color:var(--on-primary);border-color:var(--primary);text-shadow:none}
.btn.primary:hover,.btn.primary:focus-visible{background:var(--bg);color:var(--primary)}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:var(--space-lg);margin-top:var(--space-3xl)}
.kpi{background:var(--surface-container-lowest);border:1px solid var(--border);
  padding:var(--space-lg) var(--space-xl)}
.kpi .label{font-size:11.5px;text-transform:uppercase;letter-spacing:0;color:var(--fg-muted);font-weight:700}
.kpi .label::before{content:"["}.kpi .label::after{content:"]"}
.kpi .value{font-family:var(--font-headline);font-size:26px;font-weight:800;margin-top:var(--space-xs);color:var(--fg-1)}
.kpi .value.accent{color:var(--primary)}
.kpi .value.green{color:var(--green)} .kpi .value.red{color:var(--red)} .kpi .value.yellow{color:var(--yellow)}
.kpi .sub{font-size:12.5px;color:var(--fg-muted);margin-top:2px;font-family:var(--font-mono)}
.section{margin-top:var(--space-4xl)}
.section-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:var(--space-lg);gap:var(--space-md);flex-wrap:wrap;
  border-bottom:1px dashed var(--border);padding-bottom:var(--space-sm)}
.section-head h2::before,details > summary h2::before{content:"+--- ";color:var(--fg-muted)}
.section-head h2::after,details > summary h2::after{content:" ---+";color:var(--fg-muted)}
.section-head .meta{font-size:13px;color:var(--fg-muted);font-family:var(--font-mono)}
.card{background:var(--surface-container-lowest);border:1px solid var(--border);
  padding:var(--space-xl)}
.card h3{margin-bottom:var(--space-md)}
.hyp{display:inline-flex;align-items:center;padding:1px 6px;border-radius:0;
  background:transparent;color:var(--yellow);font-family:var(--font-mono);font-size:11px;
  font-weight:700;text-transform:uppercase;letter-spacing:0;border:1px solid var(--yellow)}
.hyp::before{content:"[HYP]";color:var(--yellow)}
.hyp{font-size:0}.hyp::before{font-size:11px}
.badge{display:inline-flex;align-items:center;padding:1px 6px;border-radius:0;
  background:transparent;color:var(--fg-2);font-family:var(--font-mono);font-size:11px;font-weight:700;border:1px solid var(--border)}
.badge::before{content:"["}.badge::after{content:"]"}
.badge.green{background:transparent;color:var(--green);border-color:var(--green)}
.badge.red{background:transparent;color:var(--red);border-color:var(--red)}
.badge.yellow{background:transparent;color:var(--yellow);border-color:var(--yellow)}
.badge.blue{background:transparent;color:var(--blue);border-color:var(--blue)}
.badge.app{background:transparent;color:var(--primary);border-color:var(--primary)}
.badge.vendor{background:var(--surface-container);color:var(--fg-muted)}
.checklist{list-style:none;margin:0;padding:0}
.checklist li{display:flex;gap:var(--space-md);align-items:flex-start;padding:var(--space-sm) 0;
  border-bottom:1px solid var(--border)}
.checklist li:last-child{border-bottom:none}
.checklist .num{font-family:var(--font-mono);font-size:11px;color:var(--fg-muted);
  background:transparent;border:1px solid var(--border);padding:2px 8px;
  min-width:26px;text-align:center;flex-shrink:0}
.checklist .text{flex:1;color:var(--fg-2)}
.checklist .text code{font-family:var(--font-mono);font-size:13px;background:var(--surface-container);
  padding:1px 6px;border:1px solid var(--border)}
.hotspots{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-lg)}
.hotspot{background:var(--surface-container-lowest);border:1px solid var(--border);
  padding:var(--space-lg);position:relative}
.hotspot .head{display:flex;align-items:center;justify-content:space-between;gap:var(--space-md);margin-bottom:var(--space-sm)}
.hotspot .path{font-family:var(--font-mono);font-size:13.5px;color:var(--fg-1);font-weight:600;
  word-break:break-all}
.hotspot .why{color:var(--fg-2);font-size:13.5px;line-height:1.5;margin-top:var(--space-xs)}
.hotspot .why .hyp{margin-right:var(--space-xs)}
.searchbox{display:flex;gap:var(--space-sm);align-items:center;background:var(--surface-container-lowest);
  border:1px solid var(--border);padding:var(--space-xs) var(--space-md);
  max-width:380px}
.searchbox::before{content:"grep@raw:~$";color:var(--fg-muted);font-weight:700}
.searchbox input{flex:1;border:none;outline:none;background:transparent;padding:var(--space-xs) 0;font-size:14px}
mark{background:var(--primary);color:var(--on-primary);padding:0 2px;text-shadow:none}
details{background:var(--surface-container-lowest);border:1px solid var(--border);
  padding:var(--space-md) var(--space-lg);transition:background .15s ease}
details > summary{cursor:pointer;font-weight:600;font-size:15.5px;color:var(--fg-1);list-style:none;
  display:flex;align-items:center;justify-content:space-between;gap:var(--space-md)}
details > summary::-webkit-details-marker{display:none}
details > summary::after{content:"▾";color:var(--fg-muted);transition:transform .15s ease}
details[open] > summary::after{transform:rotate(180deg)}
details > .body{margin-top:var(--space-md)}
.diff{font-family:var(--font-mono);font-size:12.5px;line-height:1.5;white-space:pre;overflow-x:auto;
  background:var(--surface-container-low);padding:var(--space-md);
  border:1px solid var(--border)}
.diff .ln{display:inline-block;width:54px;color:var(--fg-muted);user-select:none;text-align:right;
  padding-right:var(--space-md)}
.diff .add{background:rgba(51,255,0,.08);display:block}
.diff .add .ln{color:var(--green)}
.diff .del{background:rgba(255,51,51,.10);display:block}
.diff .del .ln{color:var(--red)}
.diff .ctx{display:block;color:var(--fg-2)}
.diff .hunk{display:block;color:var(--secondary-container);background:var(--surface-container);
  padding:var(--space-xs) var(--space-md);margin:var(--space-md) calc(-1 * var(--space-md)) var(--space-xs);
  font-weight:600}
.diff .file-head{display:block;color:var(--primary);font-weight:600;
  background:var(--primary-fixed);padding:var(--space-sm) var(--space-md);
  margin:var(--space-md) calc(-1 * var(--space-md)) var(--space-sm)}
.log-table{width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:12px}
.log-table td{padding:2px var(--space-sm);vertical-align:top;border-bottom:1px solid rgba(31,82,31,.35)}
.log-table tr.error td{background:rgba(255,51,51,.10)}
.log-table tr.warning td{background:rgba(255,176,0,.10)}
.log-table tr.group td{background:var(--surface-container);color:var(--secondary-container);font-weight:600}
.log-table .ln{width:54px;text-align:right;color:var(--fg-muted);padding-right:var(--space-md)}
.log-table .text{white-space:pre-wrap;color:var(--fg-1)}
.log-table tr.error .text{color:var(--red)}
.log-table tr.warning .text{color:var(--yellow)}
.frames{list-style:none;padding:0;margin:0}
.frames li{padding:var(--space-sm) var(--space-md);border-bottom:1px solid var(--border);
  font-family:var(--font-mono);font-size:13px;display:flex;gap:var(--space-md);align-items:flex-start}
.frames li:last-child{border-bottom:none}
.frames .marker{width:90px;flex-shrink:0;color:var(--fg-muted);font-size:11px;text-transform:uppercase;
  letter-spacing:0;font-weight:700}
.frames .marker.app{color:var(--primary)}
.frames .marker.vendor{color:var(--fg-muted)}
.frames .body{flex:1;min-width:0}
.frames .file{color:var(--fg-1);font-weight:500;word-break:break-all}
.frames .fn{color:var(--fg-2);font-size:12.5px}
.frames .fold-toggle{cursor:pointer;background:var(--surface-container);color:var(--fg-muted);
  padding:var(--space-sm) var(--space-md);border:1px dashed var(--border);font-style:italic;font-size:12.5px}
.frames .fold-toggle:hover{color:var(--fg-1)}
.commits{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--space-md)}
.commits li{padding:var(--space-md) var(--space-lg);background:var(--surface-container-lowest);
  border:1px solid var(--border);display:flex;gap:var(--space-md);align-items:flex-start}
.commits .hash{font-family:var(--font-mono);font-size:12px;background:var(--surface-container);
  color:var(--secondary-container);padding:2px 10px;border:1px solid var(--secondary-container);flex-shrink:0;
  align-self:flex-start;margin-top:2px}
.commits .meta{flex:1}
.commits .subject{font-weight:600;color:var(--fg-1);margin-bottom:2px}
.commits .author{color:var(--fg-muted);font-size:12.5px;font-family:var(--font-mono)}
.commits .stat{margin-top:var(--space-xs);color:var(--fg-2);font-size:13px}
.cause-chain{display:flex;flex-direction:column;gap:var(--space-md)}
.cause{background:var(--surface-container-lowest);border:1px solid var(--border);
  padding:var(--space-lg)}
.cause.deepest{border-color:var(--primary)}
.cause .type{font-family:var(--font-mono);font-size:13.5px;color:var(--fg-1);font-weight:600}
.cause .msg{color:var(--fg-2);margin-top:2px;font-size:13.5px}
.cause .top-frame{margin-top:var(--space-sm);font-family:var(--font-mono);font-size:12.5px;color:var(--fg-muted)}
.failing-tests{display:flex;flex-direction:column;gap:var(--space-md)}
.failing-test{background:var(--surface-container-lowest);border:1px solid var(--border);border-left:3px solid var(--red);
  padding:var(--space-md) var(--space-lg)}
.failing-test .name{font-family:var(--font-mono);font-size:13.5px;color:var(--fg-1);font-weight:600}
.failing-test .where{font-family:var(--font-mono);font-size:12px;color:var(--fg-muted);margin-top:2px}
.failing-test .msg{color:var(--fg-2);font-size:13.5px;margin-top:var(--space-xs)}
.risk-table{width:100%;border-collapse:collapse;font-size:13.5px}
.risk-table th{text-align:left;padding:var(--space-sm) var(--space-md);font-weight:600;font-size:12px;
  color:var(--fg-muted);text-transform:uppercase;letter-spacing:0;border-bottom:1px solid var(--border-strong)}
.risk-table td{padding:var(--space-sm) var(--space-md);border-bottom:1px solid var(--border);vertical-align:top}
.risk-table .path{font-family:var(--font-mono);font-size:13px;color:var(--fg-1);word-break:break-all}
.risk-table .delta{font-family:var(--font-mono);font-size:12.5px;white-space:nowrap}
.risk-table .delta .add{color:var(--green)}
.risk-table .delta .del{color:var(--red)}
.risk-table .why{color:var(--fg-2);font-size:13px}
.empty{color:var(--fg-muted);font-style:italic;padding:var(--space-md) 0}
footer{margin-top:var(--space-5xl);padding-top:var(--space-xl);border-top:1px solid var(--border);
  color:var(--fg-muted);font-size:13px;line-height:1.5}
@keyframes blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
@media (max-width:780px){
  .frames .marker{width:70px}
}
  </style>
</head>
<body>
<main>
  <header class="hero">
    <div class="eyebrow">__EYEBROW__</div>
    <h1>__HERO_TITLE__</h1>
    <p class="editorial">__EDITORIAL__</p>
    <div class="hero-actions">
      <button class="btn primary" id="copy-md-btn">Copy summary</button>
      <a class="btn" href="#raw-section">Jump to raw artifact</a>
    </div>
    <div class="kpi-row" id="kpi-row">__KPI_ROW__</div>
  </header>
  __BODY__
  <footer>
    <p><em>[LOCAL] Generated locally — your diff / log / trace never left your machine. The full artifact is embedded in this HTML and rendered in your browser. The analysis above is a <strong>hypothesis</strong> from a sample, not a verdict; verify against the runtime before acting on it.</em></p>
  </footer>
</main>
<script>const DATA = __DATA__;</script>
<script>
(function(){
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function escHtml(s){return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function escapeRegex(s){return String(s).replace(/[.*+?^()|[\]\\{}]/g, "\\$&")}
  function highlight(s, q){
    if (!q) return escHtml(s);
    const re = new RegExp("(" + escapeRegex(q) + ")", "ig");
    return escHtml(s).replace(re, "<mark>$1</mark>");
  }

  /* ---------- search across raw drill-down ---------- */
  const rawSearch = $("#raw-search");
  if (rawSearch) {
    rawSearch.addEventListener("input", () => {
      const q = rawSearch.value.trim();
      const target = $("#raw-content");
      if (!target) return;
      const lines = target.querySelectorAll("[data-text]");
      let firstHit = null;
      lines.forEach(el => {
        const text = el.getAttribute("data-text") || "";
        if (!q) {
          el.innerHTML = el.getAttribute("data-original") || escHtml(text);
          el.style.display = "";
        } else {
          if (text.toLowerCase().includes(q.toLowerCase())) {
            el.innerHTML = highlight(text, q);
            el.style.display = "";
            if (!firstHit) firstHit = el;
          } else {
            el.style.display = "none";
          }
        }
      });
      const summary = $("#raw-section");
      if (summary && q) summary.open = true;
      if (firstHit) firstHit.scrollIntoView({block: "center", behavior: "smooth"});
    });
  }

  /* ---------- vendor frame fold (stack-trace) ---------- */
  $$(".fold-toggle").forEach(t => {
    t.addEventListener("click", () => {
      const list = t.closest("ul").querySelectorAll("li.frame.vendor");
      const folded = t.getAttribute("data-folded") === "1";
      list.forEach(el => { el.style.display = folded ? "" : "none"; });
      t.setAttribute("data-folded", folded ? "0" : "1");
      t.textContent = folded ? "Hide framework / vendor frames" : ("Show " + list.length + " framework / vendor frames");
    });
    // start folded
    const list = t.closest("ul").querySelectorAll("li.frame.vendor");
    list.forEach(el => { el.style.display = "none"; });
  });

  /* ---------- copy summary ---------- */
  const btn = $("#copy-md-btn");
  if (btn) {
    btn.addEventListener("click", async () => {
      const md = window.__MARKDOWN_SUMMARY__ || "";
      try {
        await navigator.clipboard.writeText(md);
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy summary"; }, 1500);
      } catch {
        window.prompt("Copy this Markdown:", md);
      }
    });
  }
})();
</script>
<script>window.__MARKDOWN_SUMMARY__ = __MARKDOWN_LITERAL__;</script>
</body>
</html>
`

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))
const escAttr = escHtml

function kpi(label, value, sub = "", color = "") {
  return `<div class="kpi"><div class="label">${escHtml(label)}</div><div class="value ${color}">${escHtml(value)}</div>${sub ? `<div class="sub">${escHtml(sub)}</div>` : ""}</div>`
}

function hyp() { return `<span class="hyp">Hypothesis</span>` }

// ---------------------------------------------------------------------------
// git-diff renderer
// ---------------------------------------------------------------------------

function renderGitDiff(data, isPr = false) {
  const totals = data.totals
  const files = data.files || []
  const ranked = rankFilesByRisk(files)

  const checklist = buildDiffChecklist(files)
  const hotspots = ranked.slice(0, Math.min(5, ranked.length))

  const eyebrow = isPr ? "PR review · " + (totals.commits || 1) + " commits" : "Unified diff"
  const heroTitle = isPr ? (data.pr?.title || "Pull request review") : "Diff review"
  const editorial = `${totals.files} file${totals.files === 1 ? "" : "s"} · +${totals.additions} / −${totals.deletions} · ${totals.hunks} hunk${totals.hunks === 1 ? "" : "s"}.` +
    (isPr ? ` ${totals.commits || 1} commit${(totals.commits || 1) === 1 ? "" : "s"}.` : "")

  const kpis = [
    kpi("Files changed", totals.files, ""),
    kpi("Additions", "+" + totals.additions, "", "green"),
    kpi("Deletions", "−" + totals.deletions, "", "red"),
    kpi("Hunks", totals.hunks, ""),
  ]
  if (isPr) {
    const testTouched = files.filter(f => f.hasMatchingTestChange).length
    kpis.push(kpi("Tests touched", testTouched + " / " + totals.files, "files with paired test changes", testTouched > 0 ? "green" : "yellow"))
  }

  const body = [
    section("Review checklist", `<ol class="checklist">${
      checklist.map((item, i) =>
        `<li><span class="num">${i + 1}</span><span class="text">${item}</span></li>`
      ).join("")
    }</ol>`, "card", "review-checklist"),

    section("Risk hotspots", `<div class="hotspots">${
      hotspots.length === 0 ? `<div class="empty">No files in this diff stand out as high-risk on size alone.</div>` :
      hotspots.map(h =>
        `<div class="hotspot">
          <div class="head"><span class="path">${escHtml(h.path)}</span>${riskBadge(h)}</div>
          <div class="why">${hyp()} ${escHtml(buildRiskNote(h))}</div>
        </div>`
      ).join("")
    }</div>`),

    isPr && (data.commits && data.commits.length) ? section("Commits", `<ul class="commits">${
      data.commits.map(c =>
        `<li>
          <span class="hash mono">${escHtml(c.shortHash || c.hash || "—")}</span>
          <div class="meta">
            <div class="subject">${escHtml(c.subject || "")}</div>
            <div class="author">${escHtml(c.authorName || c.author || "")}${c.date ? " · " + escHtml(c.date) : ""}</div>
            <div class="stat">${c.fileIds?.length || 0} files · <span class="mono"><span style="color:var(--green)">+${c.additions}</span> / <span style="color:var(--red)">−${c.deletions}</span></span></div>
          </div>
        </li>`
      ).join("")
    }</ul>`) : "",

    section("Risk map by file", `<table class="risk-table">
      <thead><tr><th>File</th><th>Status</th><th>Δ</th>${isPr ? "<th>Tests touched?</th>" : ""}<th>Why look here</th></tr></thead>
      <tbody>${
        ranked.map(f =>
          `<tr>
            <td><span class="path">${escHtml(f.path)}</span></td>
            <td><span class="badge ${statusBadgeClass(f.status)}">${escHtml(f.status)}</span></td>
            <td class="delta"><span class="add">+${f.additions}</span> / <span class="del">−${f.deletions}</span></td>
            ${isPr ? `<td>${f.hasMatchingTestChange ? `<span class="badge green">yes</span>` : `<span class="badge yellow">no</span> ${hyp()}`}</td>` : ""}
            <td class="why">${hyp()} ${escHtml(buildRiskNote(f))}</td>
          </tr>`
        ).join("")
      }</tbody>
    </table>`),

    section("Diff", renderRawDiff(files), "", "raw-section",
      `<div class="searchbox" style="display:inline-flex"><input id="raw-search" type="search" placeholder="Search the diff…"></div>`,
      true /* details */),
  ].filter(Boolean).join("\n")

  const md = buildDiffMarkdown(data, ranked.slice(0, 4), checklist, isPr)
  return { eyebrow, heroTitle, editorial, kpis, body, md }
}

function rankFilesByRisk(files) {
  // Score: deletions weight more (regression risk), security/auth/migration paths bonus.
  return files.slice().sort((a, b) => fileRiskScore(b) - fileRiskScore(a))
}

function fileRiskScore(f) {
  const churn = (f.additions || 0) + (f.deletions || 0) * 1.4
  const p = (f.path || "").toLowerCase()
  let bonus = 0
  if (/auth|session|crypt|password|token|jwt/.test(p)) bonus += 60
  if (/migration|schema/.test(p)) bonus += 50
  if (/payment|charge|billing|invoice|order/.test(p)) bonus += 40
  if (/^migrations\/|\.sql$/.test(p)) bonus += 40
  if (f.status === "deleted") bonus += 30
  return churn + bonus
}

function buildRiskNote(f) {
  const p = (f.path || "").toLowerCase()
  const churn = (f.additions || 0) + (f.deletions || 0)
  if (/migration|\.sql$/.test(p)) {
    return `Schema migration — verify it runs against a populated table without locking out concurrent writers, and that the rollback path is captured.`
  }
  if (/auth|session|jwt|token/.test(p)) {
    return `Auth boundary touched — confirm every empty / malformed input case is still rejected and that the change does not loosen any existing guard.`
  }
  if (/payment|charge|billing|invoice/.test(p)) {
    return `Payment-pipeline file — confirm the failure / retry / pending paths still leave the order in a recoverable state.`
  }
  if (/test|spec/.test(p)) {
    return `Test file — confirm the new cases match the production-side change rather than just exercising the new function.`
  }
  if (f.status === "added") {
    return `New file (${churn} lines) — confirm it has at least one direct caller and a corresponding test, and that no existing file already covers the responsibility.`
  }
  if (f.status === "deleted") {
    return `File deleted — grep the rest of the codebase for imports of the removed paths to confirm no caller is left dangling.`
  }
  if (churn >= 30) {
    return `${churn}-line change — large enough that a hunk-by-hunk read is worth it; the surrounding context lines may have implicit assumptions worth verifying.`
  }
  return `${churn}-line change — small but still worth a careful read; the surrounding context may carry the real risk.`
}

function statusBadgeClass(s) {
  if (s === "added") return "green"
  if (s === "deleted") return "red"
  if (s === "renamed") return "blue"
  return ""
}

function riskBadge(f) {
  const score = fileRiskScore(f)
  if (score >= 80) return `<span class="badge red">high</span>`
  if (score >= 30) return `<span class="badge yellow">elevated</span>`
  return `<span class="badge">moderate</span>`
}

function buildDiffChecklist(files) {
  const items = []
  // Pull concrete signals from the actual diff.
  for (const f of files) {
    const p = f.path || ""
    if (/auth|session|jwt|token/i.test(p)) {
      items.push(`Re-test <code>${escHtml(path.basename(p))}</code> with empty, expired, and malformed tokens — confirm the new guard still rejects each.`)
    } else if (/migration|\.sql$/i.test(p)) {
      items.push(`Apply <code>${escHtml(path.basename(p))}</code> to a populated table in staging and watch for lock contention before promoting to production.`)
    } else if (/payment|charge|billing|invoice/i.test(p)) {
      items.push(`Walk every status branch in <code>${escHtml(path.basename(p))}</code> and confirm the order ends up in a recoverable state for each.`)
    } else if (/test|spec/i.test(p) && f.status === "modified") {
      items.push(`Read <code>${escHtml(path.basename(p))}</code> against the production-side change — the test should fail without the fix, not just pass with it.`)
    } else if (f.status === "added") {
      items.push(`Confirm <code>${escHtml(path.basename(p))}</code> has a caller and a paired test before merging.`)
    } else if (f.status === "deleted") {
      items.push(`Grep for usages of the symbols defined in <code>${escHtml(path.basename(p))}</code> before merging the deletion.`)
    }
    if (items.length >= 8) break
  }
  if (items.length < 4) {
    items.push(`Run the test suite locally and confirm all assertions still pass on the new branch.`)
  }
  if (items.length < 4) {
    items.push(`Review every <code>@@</code> hunk header below to make sure no unrelated change crept in.`)
  }
  return items
}

function renderRawDiff(files) {
  return `<div class="diff" id="raw-content">${
    files.map(f => {
      const head = `<span class="file-head" data-text="${escAttr(f.path)}" data-original="${escAttr("file " + f.path)}">${escHtml(f.path)} (${escHtml(f.status)})  +${f.additions} / −${f.deletions}</span>`
      const body = (f.hunks || []).map(h => {
        const hunkLine = `<span class="hunk" data-text="${escAttr(h.header)}" data-original="${escAttr(h.header)}">${escHtml(h.header)}</span>`
        const lines = (h.lines || []).map(L => {
          const cls = L.kind === "add" ? "add" : L.kind === "del" ? "del" : "ctx"
          const num = L.kind === "add" ? L.newNum : L.kind === "del" ? L.oldNum : (L.newNum || L.oldNum || "")
          const text = L.text || ""
          const dataText = (L.kind === "add" ? "+" : L.kind === "del" ? "-" : " ") + text
          return `<span class="${cls}" data-text="${escAttr(dataText)}"><span class="ln">${escHtml(num)}</span>${escHtml((L.kind === "add" ? "+" : L.kind === "del" ? "-" : " ") + text)}</span>`
        }).join("")
        return hunkLine + lines
      }).join("")
      return head + body
    }).join("")
  }</div>`
}

function buildDiffMarkdown(data, topHotspots, checklist, isPr) {
  const lines = []
  lines.push("# " + (isPr ? (data.pr?.title || "PR review") : "Diff review"))
  lines.push("")
  lines.push("- Files: " + data.totals.files)
  lines.push("- Diff: +" + data.totals.additions + " / −" + data.totals.deletions + " across " + data.totals.hunks + " hunks")
  if (isPr) lines.push("- Commits: " + (data.totals.commits || 1))
  lines.push("")
  lines.push("## Risk hotspots (hypothesis)")
  topHotspots.forEach(h => lines.push("- **" + h.path + "** (+" + h.additions + " / −" + h.deletions + ") — " + buildRiskNote(h)))
  lines.push("")
  lines.push("## Review checklist")
  checklist.forEach((c, i) => lines.push((i + 1) + ". " + c.replace(/<[^>]+>/g, "")))
  lines.push("")
  lines.push("_Hypothesis from a sample diff. Verify against the runtime before acting._")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// ci-log renderer
// ---------------------------------------------------------------------------

function renderCiLog(data) {
  const totals = data.totals
  const errors = data.errors || []
  const failingTests = data.failingTests || []
  const groups = data.groups || []

  const eyebrow = `CI log · ${escHtml(data.provider || "generic")} · ${escHtml(data.status || "unknown")}`
  const headlineErr = (errors.find(e => e.severity === "error") || errors[0])
  const heroTitle = headlineErr
    ? `Failed: ${headlineErr.text.replace(/^.*\bError: /, "Error: ").slice(0, 90)}`
    : (data.status === "passed" ? "Run passed" : "CI run summary")
  const editorial = headlineErr
    ? `Failure first appears at line ${headlineErr.lineNum}${headlineErr.groupId ? ` (in step ${groupName(groups, headlineErr.groupId)})` : ""}. ${failingTests.length} failing test${failingTests.length === 1 ? "" : "s"} detected. Exit code ${data.exitCode ?? "—"}.`
    : `Run completed without explicit failure markers. ${groups.length} step${groups.length === 1 ? "" : "s"}, ${totals.lines} line${totals.lines === 1 ? "" : "s"}.`

  const kpis = [
    kpi("Status", (data.status || "unknown").toUpperCase(), "", data.status === "failed" ? "red" : data.status === "passed" ? "green" : ""),
    kpi("Steps", groups.length, ""),
    kpi("Errors", totals.errors, "", totals.errors > 0 ? "red" : ""),
    kpi("Failing tests", totals.failingTests, "", totals.failingTests > 0 ? "red" : ""),
    kpi("Warnings", totals.warnings, "", totals.warnings > 0 ? "yellow" : ""),
    kpi("Total lines", totals.lines, ""),
  ]

  const causes = buildCiCauseHypotheses(data)
  const checklist = buildCiChecklist(data)
  const hotspots = buildCiHotspots(data)

  const body = [
    section("Run summary", `<div class="card">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--space-md)">
        <div><div class="muted mono" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Provider</div><div style="font-weight:600">${escHtml(data.provider || "—")}</div></div>
        <div><div class="muted mono" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Status</div><div style="font-weight:600;color:${data.status === "failed" ? "var(--red)" : data.status === "passed" ? "var(--green)" : "var(--fg-1)"}">${escHtml((data.status || "unknown").toUpperCase())}</div></div>
        <div><div class="muted mono" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Exit code</div><div style="font-weight:600">${escHtml(data.exitCode ?? "—")}</div></div>
        <div><div class="muted mono" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em">Headline</div><div>${headlineErr ? escHtml(headlineErr.text.slice(0, 200)) : `<span class="muted">No errors detected.</span>`}</div></div>
      </div>
      ${groups.length ? `<div style="margin-top:var(--space-lg);display:flex;flex-wrap:wrap;gap:var(--space-xs)">${
        groups.map(g => `<span class="badge ${g.status === "fail" ? "red" : g.status === "warning" ? "yellow" : g.status === "ok" ? "green" : ""}" title="lines ${g.startLine}–${g.endLine}">${escHtml(g.name)} <span class="muted mono" style="margin-left:6px">${g.lineCount}L</span></span>`).join("")
      }</div>` : ""}
    </div>`),

    section("Review checklist", `<ol class="checklist">${
      checklist.map((c, i) => `<li><span class="num">${i + 1}</span><span class="text">${c}</span></li>`).join("")
    }</ol>`, "card"),

    section("Risk hotspots", `<div class="hotspots">${
      hotspots.length === 0 ? `<div class="empty">Run looks clean — nothing in this log stands out.</div>` :
      hotspots.map(h =>
        `<div class="hotspot">
          <div class="head"><span class="path">${escHtml(h.title)}</span><span class="badge ${h.kind === "error" ? "red" : "yellow"}">line ${h.lineNum}</span></div>
          <div class="why">${hyp()} ${escHtml(h.why)}</div>
        </div>`
      ).join("")
    }</div>`),

    section("Suspected root cause", `<div class="cause-chain">${
      causes.map((c, i) =>
        `<div class="cause ${i === 0 ? "deepest" : ""}">
          <div style="display:flex;align-items:center;gap:var(--space-sm);justify-content:space-between">${hyp()}<span class="muted mono" style="font-size:11.5px">candidate ${i + 1} of ${causes.length}</span></div>
          <div class="msg" style="margin-top:var(--space-sm)">${escHtml(c.summary)}</div>
          <div class="top-frame">${escHtml(c.evidence || "")}</div>
          <div class="msg" style="margin-top:var(--space-sm);font-size:13px"><strong>Distinguishing test:</strong> ${escHtml(c.distinguish)}</div>
        </div>`
      ).join("")
    }</div>`),

    section("Failing tests", failingTests.length === 0
      ? `<div class="card"><span class="empty">No failing test signatures found — the failure was likely in build / setup / lint; check the error markers above.</span></div>`
      : `<div class="failing-tests">${
          failingTests.map(t =>
            `<div class="failing-test">
              <div class="name">${escHtml(t.name)}</div>
              <div class="where">${t.file ? escHtml(t.file) + (t.line ? ":" + t.line : "") : "(file not detected)"} · log line ${t.lineNum}</div>
              ${t.message ? `<div class="msg">${escHtml(t.message)}</div>` : ""}
            </div>`
          ).join("")
        }</div>`),

    section("Log", `<div class="searchbox" style="margin-bottom:var(--space-md);max-width:100%"><input id="raw-search" type="search" placeholder="Search every log line…"></div>
      <div style="overflow-x:auto;background:var(--surface-container-low);border-radius:var(--radius-md);padding:var(--space-md);border:1px solid var(--border);max-height:560px;overflow-y:auto">
      <table class="log-table" id="raw-content"><tbody>${
        (data.rawLines || []).map(L => {
          const isErr = errors.some(e => e.lineNum === L.num && e.severity === "error")
          const isWarn = errors.some(e => e.lineNum === L.num && e.severity === "warning")
          const isGroupHead = (groups || []).some(g => g.startLine === L.num)
          const cls = isGroupHead ? "group" : isErr ? "error" : isWarn ? "warning" : ""
          const text = L.text
          return `<tr class="${cls}"><td class="ln">${L.num}</td><td class="text" data-text="${escAttr(text)}" data-original="${escAttr(text)}">${escHtml(text)}</td></tr>`
        }).join("")
      }</tbody></table></div>`, "", "raw-section", "", true),
  ].join("\n")

  const md = buildCiMarkdown(data, causes, checklist, hotspots)
  return { eyebrow, heroTitle, editorial, kpis, body, md }
}

function groupName(groups, id) {
  const g = (groups || []).find(g => g.id === id)
  return g ? g.name : id
}

function buildCiHotspots(data) {
  const out = []
  const errors = data.errors || []
  for (const e of errors.filter(x => x.severity === "error").slice(0, 3)) {
    out.push({
      kind: "error",
      title: e.text.slice(0, 80),
      lineNum: e.lineNum,
      why: `First error at line ${e.lineNum}; whatever ran in the seconds before may be the source. Read the prior 6–10 lines for setup state.`,
    })
  }
  for (const t of (data.failingTests || []).slice(0, 3)) {
    out.push({
      kind: "test",
      title: t.name,
      lineNum: t.lineNum,
      why: `Failing assertion${t.message ? ` "${t.message.slice(0, 80)}"` : ""}. Reproduce locally with the same revision before treating it as a real regression.`,
    })
  }
  return out.slice(0, 5)
}

function buildCiCauseHypotheses(data) {
  const errors = (data.errors || []).filter(e => e.severity === "error")
  const failing = data.failingTests || []
  const out = []
  if (failing.length) {
    out.push({
      summary: `The failing assertion${failing.length === 1 ? "" : "s"} (${failing.slice(0, 2).map(t => t.name).join("; ")}${failing.length > 2 ? "; …" : ""}) reflects a real production-code regression introduced on this branch.`,
      evidence: failing[0].file ? `${failing[0].file}${failing[0].line ? ":" + failing[0].line : ""} (log line ${failing[0].lineNum})` : `log line ${failing[0].lineNum}`,
      distinguish: `Re-run on the same revision; if it fails again, this is a real regression. If it passes, see the next hypothesis (flaky test).`,
    })
    out.push({
      summary: `The failure is environmental — a flaky test, a slow setup step, or a network call to an external service that was momentarily unavailable.`,
      evidence: `No evidence in the log itself; this is the null hypothesis to rule out before touching code.`,
      distinguish: `Re-run the job. If the failure does not reproduce, this is the cause.`,
    })
  } else if (errors.length) {
    out.push({
      summary: `The build / setup step that emitted the first error marker is the failure point. Whatever it was building or downloading at line ${errors[0].lineNum} is missing, broken, or returned an unexpected status.`,
      evidence: `${errors[0].text.slice(0, 160)} (line ${errors[0].lineNum})`,
      distinguish: `Re-run the same step locally with the same toolchain; the error text usually points directly at the cause.`,
    })
  } else {
    out.push({
      summary: `Cause not identifiable from this log alone — visible markers do not flag a clear failure. The failure may be in a step whose output was redirected or suppressed.`,
      evidence: `(no error / failing-test markers found in the parsed log)`,
      distinguish: `Re-run with verbose logging on the suspect step.`,
    })
  }
  return out
}

function buildCiChecklist(data) {
  const items = []
  const failing = data.failingTests || []
  if (failing.length) {
    items.push(`Re-run the workflow on the same revision to confirm the failure reproduces (flaky vs real regression).`)
    items.push(`Reproduce <code>${escHtml(failing[0].name)}</code> locally with the same node / python / go version.`)
    if (failing[0].file) items.push(`Open <code>${escHtml(failing[0].file)}${failing[0].line ? ":" + failing[0].line : ""}</code> and read the assertion in context.`)
  }
  const firstErr = (data.errors || []).find(e => e.severity === "error")
  if (firstErr && !failing.length) {
    items.push(`Reproduce the build / setup step locally; the first <code>${escHtml(firstErr.text.slice(0, 60))}</code> at line ${firstErr.lineNum} usually points directly at the cause.`)
  }
  items.push(`Compare the failing run's environment (runner image, node version, package-lock) against the last passing run.`)
  items.push(`Walk the log's step strip above and skim the failed step's first 10 and last 10 lines.`)
  if (items.length < 4) items.push(`Re-run with verbose logging on the suspect step.`)
  return items
}

function buildCiMarkdown(data, causes, checklist, hotspots) {
  const lines = []
  lines.push("# CI run — " + (data.status || "unknown"))
  lines.push("")
  lines.push("- Provider: " + (data.provider || "generic"))
  lines.push("- Exit code: " + (data.exitCode ?? "—"))
  lines.push("- Lines: " + data.totals.lines + " · Steps: " + data.totals.groups + " · Errors: " + data.totals.errors + " · Failing tests: " + data.totals.failingTests)
  lines.push("")
  if (causes.length) {
    lines.push("## Suspected cause (hypothesis)")
    causes.forEach((c, i) => lines.push((i + 1) + ". " + c.summary + " — distinguishing test: " + c.distinguish))
    lines.push("")
  }
  if ((data.failingTests || []).length) {
    lines.push("## Failing tests")
    data.failingTests.slice(0, 8).forEach(t => lines.push("- **" + t.name + "** — " + (t.file || "?") + (t.line ? ":" + t.line : "") + (t.message ? " — " + t.message : "")))
    lines.push("")
  }
  lines.push("## Review checklist")
  checklist.forEach((c, i) => lines.push((i + 1) + ". " + c.replace(/<[^>]+>/g, "")))
  lines.push("")
  lines.push("_Hypothesis from log scan. Verify against the runtime before acting._")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// stack-trace renderer
// ---------------------------------------------------------------------------

function renderStackTrace(data) {
  const causes = data.causes || []
  const exception = data.exception || { type: null, message: null }
  const allFrames = causes.flatMap(c => c.frames)
  const topAppFrames = allFrames.filter(f => f.isApp)

  const eyebrow = `Stack trace · ${escHtml(data.language || "unknown")}${causes.length > 1 ? ` · ${causes.length}-deep cause chain` : ""}`
  const heroTitle = exception.type
    ? `${exception.type}${exception.message ? ": " + exception.message : ""}`.slice(0, 120)
    : "Stack trace triage"
  const editorial = topAppFrames.length
    ? `Trace has ${data.frameCount} frame${data.frameCount === 1 ? "" : "s"}; ${data.appFrameCount} look like application code, the rest are framework / vendor internals. Topmost app frame: ${escHtml(topAppFrames[0].file || "")}${topAppFrames[0].line ? ":" + topAppFrames[0].line : ""}.`
    : `No app frames visible — the trace likely terminates inside framework code; the cause may be in a caller not captured in this trace.`

  const kpis = [
    kpi("Language", data.language || "—"),
    kpi("Frames (total)", data.frameCount, ""),
    kpi("App frames", data.appFrameCount, "", data.appFrameCount > 0 ? "accent" : ""),
    kpi("Vendor frames", data.vendorFrameCount, ""),
    kpi("Cause chain depth", causes.length, ""),
  ]

  const checklist = buildStackChecklist(data, topAppFrames)
  const causeHypotheses = buildStackCauseHypotheses(data, topAppFrames)
  const hotspots = topAppFrames.slice(0, 3).map(f => ({
    title: f.function || "(anonymous)",
    where: `${f.file || ""}${f.line ? ":" + f.line : ""}${f.col ? ":" + f.col : ""}`,
    why: `Topmost app-shaped frame in this cause chain — most likely the local entry point that triggered the exception. Read the surrounding code in ${path.basename(f.file || "")} for the assumed shape of inputs vs what was provided.`,
  }))

  const body = [
    section("Trace summary", `<div class="card">
      <div style="font-family:var(--font-mono);font-size:14px;color:var(--fg-1);margin-bottom:var(--space-sm)"><strong>${escHtml(exception.type || "(unknown exception)")}</strong></div>
      <div style="color:var(--fg-2);font-size:14.5px;line-height:1.5">${escHtml(exception.message || "(no message)")}</div>
      ${topAppFrames.length ? `<div style="margin-top:var(--space-lg);padding:var(--space-md);background:var(--primary-fixed);border-radius:var(--radius-md)">
        <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-xs)">${hyp()}<span class="badge app">topmost app frame</span></div>
        <div class="mono" style="font-size:13.5px;font-weight:600;color:var(--fg-1);word-break:break-all">${escHtml(topAppFrames[0].function || "(anonymous)")} — ${escHtml(topAppFrames[0].file || "")}${topAppFrames[0].line ? ":" + topAppFrames[0].line : ""}</div>
      </div>` : `<div style="margin-top:var(--space-lg);padding:var(--space-md);background:var(--surface-container);border-radius:var(--radius-md);color:var(--fg-muted);font-size:13.5px">${hyp()} No app frames visible in this trace; the cause may be outside the captured frames.</div>`}
    </div>`),

    section("Review checklist", `<ol class="checklist">${
      checklist.map((c, i) => `<li><span class="num">${i + 1}</span><span class="text">${c}</span></li>`).join("")
    }</ol>`, "card"),

    section("Risk hotspots", `<div class="hotspots">${
      hotspots.length === 0 ? `<div class="empty">No app-shaped frames in this trace; nothing local to flag.</div>` :
      hotspots.map(h =>
        `<div class="hotspot">
          <div class="head"><span class="path">${escHtml(h.title)}</span><span class="badge app">app</span></div>
          <div style="font-family:var(--font-mono);font-size:12.5px;color:var(--fg-muted);margin-top:2px;word-break:break-all">${escHtml(h.where)}</div>
          <div class="why">${hyp()} ${escHtml(h.why)}</div>
        </div>`
      ).join("")
    }</div>`),

    section("Suspected cause", `<div class="cause-chain">${
      causeHypotheses.map((c, i) =>
        `<div class="cause ${i === 0 ? "deepest" : ""}">
          <div style="display:flex;align-items:center;gap:var(--space-sm);justify-content:space-between">${hyp()}<span class="muted mono" style="font-size:11.5px">candidate ${i + 1} of ${causeHypotheses.length}</span></div>
          <div class="msg" style="margin-top:var(--space-sm)">${escHtml(c.summary)}</div>
          <div class="top-frame">${escHtml(c.evidence || "")}</div>
          <div class="msg" style="margin-top:var(--space-sm);font-size:13px"><strong>Distinguishing test:</strong> ${escHtml(c.distinguish)}</div>
        </div>`
      ).join("")
    }</div>`),

    section("Frames", causes.length === 0 || allFrames.length === 0
      ? `<div class="card"><span class="empty">No structured frames extracted; see the raw trace below.</span></div>`
      : `<div class="card">${
          causes.map((c, ci) => `
            <div style="margin-bottom:var(--space-lg)">
              ${causes.length > 1 ? `<div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-sm)">${ci === causes.length - 1 ? `<span class="badge red">deepest cause</span>` : `<span class="badge">cause ${ci + 1}</span>`}<span class="mono" style="font-size:13.5px;font-weight:600">${escHtml(c.type || "(unknown)")}: ${escHtml((c.message || "").slice(0, 100))}</span></div>` : ""}
              <ul class="frames">
                ${c.frames.length === 0 ? `<li><span class="muted">(no frames)</span></li>` : ""}
                ${c.frames.some(f => f.isVendor) ? `<li><div class="fold-toggle" data-folded="1">Show ${c.frames.filter(f => f.isVendor).length} framework / vendor frames</div></li>` : ""}
                ${c.frames.map(f => `
                  <li class="frame ${f.isApp ? "app" : f.isVendor ? "vendor" : "unknown"}">
                    <div class="marker ${f.isApp ? "app" : f.isVendor ? "vendor" : ""}">${f.isApp ? "APP" : f.isVendor ? "vendor" : "?"}</div>
                    <div class="body">
                      <div class="file">${escHtml(f.function || "(anonymous)")}</div>
                      <div class="fn">${escHtml(f.file || "")}${f.line ? ":" + f.line : ""}${f.col ? ":" + f.col : ""}</div>
                    </div>
                  </li>
                `).join("")}
              </ul>
            </div>
          `).join("")
        }</div>`),

    section("Trace", `<div class="searchbox" style="margin-bottom:var(--space-md);max-width:100%"><input id="raw-search" type="search" placeholder="Search the trace…"></div>
      <pre class="diff" id="raw-content" style="white-space:pre-wrap"><span data-text="${escAttr(data.rawText || "")}" data-original="${escAttr(data.rawText || "")}">${escHtml(data.rawText || "")}</span></pre>`,
      "", "raw-section", "", true),
  ].join("\n")

  const md = buildStackMarkdown(data, topAppFrames, causeHypotheses, checklist)
  return { eyebrow, heroTitle, editorial, kpis, body, md }
}

function buildStackChecklist(data, topAppFrames) {
  const items = []
  if (topAppFrames.length) {
    const f = topAppFrames[0]
    items.push(`Open <code>${escHtml(f.file || "")}${f.line ? ":" + f.line : ""}</code> and read <code>${escHtml(f.function || "(anonymous)")}</code> in context — confirm what input shape it assumes vs what may have been passed.`)
    items.push(`Reproduce locally with inputs that mirror the production request that triggered this trace (use the request body / params from the log line preceding the trace, if available).`)
    if (data.language === "python" || data.language === "javascript") {
      items.push(`Add an early-return assertion or type-guard in <code>${escHtml(f.function || "")}</code> for the input shape that triggered this exception.`)
    }
  } else {
    items.push(`No app frames visible — instrument the upstream caller (the request handler that invoked the framework code in this trace) with debug logs to capture the input.`)
  }
  if (data.causes && data.causes.length > 1) {
    const deepest = data.causes[data.causes.length - 1]
    if (deepest.type) items.push(`The deepest cause in the chain is <code>${escHtml(deepest.type)}</code> — investigate that one before the wrapper exception(s).`)
  }
  items.push(`Search your error tracker for <code>${escHtml(data.exception?.type || "")}</code> in the last 24h to confirm whether this is a one-off or part of a pattern.`)
  items.push(`Verify the runtime / framework version in the failing environment matches the version this code was tested against.`)
  return items.slice(0, 8)
}

function buildStackCauseHypotheses(data, topAppFrames) {
  const out = []
  const ex = data.exception || {}
  if (topAppFrames.length) {
    const f = topAppFrames[0]
    out.push({
      summary: `The exception (${ex.type || "?"}: ${(ex.message || "").slice(0, 80)}) was raised inside ${f.function || "the topmost app frame"} because the input shape it assumed at ${f.file}:${f.line || "?"} did not match what the caller provided.`,
      evidence: `Topmost app frame: ${f.function || "(anonymous)"} at ${f.file}:${f.line || "?"}`,
      distinguish: `Reproduce locally with the same input shape; if the exception fires at the same frame, this is the cause.`,
    })
    if (data.causes.length > 1) {
      const deepest = data.causes[data.causes.length - 1]
      out.push({
        summary: `The wrapper exception (${ex.type}) is masking a deeper failure: ${deepest.type || "(unknown)"} — that is the real origin and should be addressed first.`,
        evidence: `Deepest cause in chain: ${deepest.type || "(unknown)"} — ${(deepest.message || "").slice(0, 100)}`,
        distinguish: `Trace through the cause chain in the raw trace below; the deepest cause is the real bug, the others are wrappers.`,
      })
    }
  } else {
    out.push({
      summary: `Cause is in framework / library code that was called from a request handler whose frame is not captured in this trace. The visible frames cannot identify the local origin.`,
      evidence: `No app-shaped frames found in any of the ${data.causes?.length || 0} cause(s).`,
      distinguish: `Capture a trace with deeper stack-frame depth, or instrument the request handler directly.`,
    })
  }
  return out.slice(0, 3)
}

function buildStackMarkdown(data, topAppFrames, causes, checklist) {
  const lines = []
  lines.push("# Stack trace — " + (data.exception?.type || "unknown"))
  lines.push("")
  if (data.exception?.message) lines.push("> " + data.exception.message)
  lines.push("")
  lines.push("- Language: " + (data.language || "—"))
  lines.push("- Frames: " + data.frameCount + " (" + data.appFrameCount + " app, " + data.vendorFrameCount + " vendor)")
  lines.push("- Cause chain depth: " + (data.causes?.length || 0))
  lines.push("")
  if (topAppFrames.length) {
    lines.push("## Topmost app frame (hypothesis)")
    const f = topAppFrames[0]
    lines.push("- `" + (f.function || "(anonymous)") + "` at `" + f.file + (f.line ? ":" + f.line : "") + "`")
    lines.push("")
  }
  lines.push("## Suspected cause (hypothesis)")
  causes.forEach((c, i) => lines.push((i + 1) + ". " + c.summary))
  lines.push("")
  lines.push("## Review checklist")
  checklist.forEach((c, i) => lines.push((i + 1) + ". " + c.replace(/<[^>]+>/g, "")))
  lines.push("")
  lines.push("_Hypothesis from a stack trace — not a verdict. Reproduce against the runtime before acting._")
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Section helper + page assembly
// ---------------------------------------------------------------------------

function section(title, body, extraCardClass = "", id = "", rightHud = "", asDetails = false) {
  const headExtra = rightHud ? rightHud : ""
  const inner = extraCardClass ? `<div class="${extraCardClass}">${body}</div>` : body
  if (asDetails) {
    return `<details class="section" ${id ? `id="${id}"` : ""}><summary><h2 style="margin:0">${escHtml(title)}</h2>${headExtra ? `<div>${headExtra}</div>` : ""}</summary><div class="body">${body}</div></details>`
  }
  return `<section class="section" ${id ? `id="${id}"` : ""}>
    <div class="section-head"><h2>${escHtml(title)}</h2>${headExtra ? `<div>${headExtra}</div>` : ""}</div>
    ${inner}
  </section>`
}

function injectData(html, data) {
  const json = JSON.stringify(data)
  const safe = json.replace(/<\/script/gi, "<\\/script")
  return html.replace(/__DATA__/g, () => safe)
}

function jsStringLiteral(s) {
  return JSON.stringify(String(s))
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  let input = "", out = "", title = ""
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--out" || a === "-o") out = argv[++i]
    else if (a === "--title") title = argv[++i]
    else if (!input) input = a
  }
  if (!input || !out) { console.error("usage: render_developer_artifact_fallback.mjs INPUT --out OUT --title TITLE"); process.exit(2) }
  return { input, out, title }
}

async function main() {
  const { input, out, title } = parseArgs(process.argv.slice(2))
  const parser = await pickParser(input)
  if (!parser) throw new Error("no parser for " + input)
  const parsed = await parser.parse(input)
  let r
  if (parsed.contentType === "git-diff") r = renderGitDiff(parsed.data, false)
  else if (parsed.contentType === "pr-review") r = renderGitDiff(parsed.data, true)
  else if (parsed.contentType === "ci-log") r = renderCiLog(parsed.data)
  else if (parsed.contentType === "stack-trace") r = renderStackTrace(parsed.data)
  else throw new Error("not a developer-artifact source: contentType=" + parsed.contentType)

  const docTitle = title || path.basename(path.dirname(input))
  let html = SHELL
    .replace(/__TITLE__/g, () => docTitle)
    .replace(/__EYEBROW__/g, () => r.eyebrow)
    .replace(/__HERO_TITLE__/g, () => r.heroTitle)
    .replace(/__EDITORIAL__/g, () => r.editorial)
    .replace(/__KPI_ROW__/g, () => r.kpis.join(""))
    .replace(/__BODY__/g, () => r.body)
    .replace(/__MARKDOWN_LITERAL__/g, () => jsStringLiteral(r.md))
  html = injectData(html, parsed.data)
  await fs.writeFile(out, html)
  console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB · ${parsed.contentType})`)
}

main().catch(e => { console.error(e); process.exit(1) })

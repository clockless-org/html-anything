#!/usr/bin/env node
/**
 * Apply lightweight visual skins to checked-in example HTML files.
 *
 * The canonical generation path is still parser -> htmlize -> LLM. This
 * script exists because the examples are committed static artifacts, and
 * not every contributor machine has an API key to regenerate all examples.
 * It makes the current live examples visibly reflect the built-in auto
 * styles while htmlize injects the full style prompts for future renders.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

const STYLE_BY_EXAMPLE = {
  "solar-system-studio": "teaching",
  "wechat-couple": "relationship",
  "whatsapp": "relationship",

  "amazon-orders": "timeline-story",
  "browser-history": "timeline-story",
  "spotify-history": "timeline-story",
  "youtube-watch-history": "timeline-story",
  "iphone-health": "timeline-story",
  "kindle-highlights": "timeline-story",
  "twitch-history": "timeline-story",
  "chatgpt-export": "timeline-story",
  "ai-chat-log": "timeline-story",

  "google-photos-takeout": "map-atlas",
  "google-maps-stars": "map-atlas",
  "rideshare-history": "map-atlas",

  "vcard-contacts": "network-map",
  "linkedin-connections": "network-map",
  "venmo-paypal-payments": "network-map",
  "slack": "network-map",
  "discord": "network-map",
  "telegram": "network-map",
  "email": "network-map",

  "csv": "dashboard",
  "jsonl": "dashboard",
  "log-access": "dashboard",
  "log-error": "dashboard",
  "transcript-sales-call": "dashboard",
  "transcript-product-meeting": "dashboard",

  "markdown": "document",
  "bookmarks-market-research": "document",
  "reading-list-academic": "document",
  "pdf": "document",
  "docx": "document",
  "medical-visit": "document",
  "lab-results": "document",
  "legal-chronology": "document",

  "git-diff": "developer",
  "pr-review": "developer",
  "ci-log": "developer",
  "stack-trace": "developer",
}

const START = "<!-- html-anything example style skin:start -->"
const END = "<!-- html-anything example style skin:end -->"

const SKIN_CSS = String.raw`
<style id="html-anything-example-style-skin">
html[data-ha-style] {
  --ha-style-accent: var(--primary, #a03b00);
  --ha-style-accent-2: var(--secondary-container, #7b40e0);
  --ha-style-badge-bg: rgba(255,255,255,.78);
  --ha-style-badge-fg: var(--fg-1, #1e1b19);
}
html[data-ha-style] body {
  position: relative;
  background-attachment: fixed;
}
html[data-ha-style] body::before {
  position: fixed;
  z-index: 9999;
  top: 12px;
  right: 12px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--ha-style-accent) 26%, transparent);
  border-radius: 999px;
  background: var(--ha-style-badge-bg);
  color: var(--ha-style-badge-fg);
  box-shadow: 0 6px 24px rgba(0,0,0,.10);
  font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .1em;
  text-transform: uppercase;
  backdrop-filter: blur(16px);
}
html[data-ha-style] .hero,
html[data-ha-style] header.hero,
html[data-ha-style] .top,
html[data-ha-style] .header {
  position: relative;
}
html[data-ha-style] .hero::before,
html[data-ha-style] header.hero::before {
  content: "";
  display: block;
  width: 64px;
  height: 6px;
  margin-bottom: 18px;
  border-radius: 999px;
  background: var(--ha-style-accent);
}

html[data-ha-style="teaching"] {
  --ha-style-accent: #0f766e;
  --ha-style-accent-2: #f59e0b;
  --primary: #0f766e;
  --primary-container: #115e59;
  --primary-fixed: #ccfbf1;
  --secondary-container: #f59e0b;
  --bg: #f6fbfb;
  --surface: #f6fbfb;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #edf7f5;
  --surface-container: #e5f1ee;
  --surface-container-high: #d8e8e4;
  --fg-1: #10201f;
  --fg-2: #304c49;
  --fg-muted: #647b78;
  --border: rgba(15,118,110,.14);
  --gradient-hero: linear-gradient(135deg, #0f766e 0%, #f59e0b 100%);
  --gradient-text: linear-gradient(135deg, #0f766e 0%, #f59e0b 100%);
}
html[data-ha-style="teaching"] body {
  background-color: var(--bg) !important;
  background-image:
    linear-gradient(rgba(15,118,110,.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15,118,110,.07) 1px, transparent 1px);
  background-size: 32px 32px;
}
html[data-ha-style="teaching"] body::before { content: "teaching"; }

html[data-ha-style="relationship"] {
  --ha-style-accent: #be3455;
  --ha-style-accent-2: #317b93;
  --primary: #be3455;
  --primary-container: #a52d4b;
  --primary-fixed: #ffe1e8;
  --secondary-container: #317b93;
  --bg: #fff7f8;
  --surface: #fff7f8;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #fff0f3;
  --surface-container: #f8e7eb;
  --surface-container-high: #efdde3;
  --fg-1: #28181c;
  --fg-2: #5f3e48;
  --fg-muted: #8d6b75;
  --border: rgba(190,52,85,.14);
  --rose: #e25b74;
  --blue: #4f95a8;
  --gradient-hero: linear-gradient(135deg, #be3455 0%, #317b93 100%);
  --gradient-text: linear-gradient(135deg, #be3455 0%, #317b93 100%);
}
html[data-ha-style="relationship"] body {
  background-color: var(--bg) !important;
  background-image:
    linear-gradient(120deg, rgba(190,52,85,.08), transparent 36%),
    linear-gradient(300deg, rgba(49,123,147,.08), transparent 40%);
}
html[data-ha-style="relationship"] body::before { content: "relationship"; }

html[data-ha-style="timeline-story"] {
  --ha-style-accent: #9a4b14;
  --ha-style-accent-2: #2f6f73;
  --primary: #9a4b14;
  --primary-container: #7a3b10;
  --primary-fixed: #ffe8cf;
  --secondary-container: #2f6f73;
  --bg: #fbf8f1;
  --surface: #fbf8f1;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f4ecdf;
  --surface-container: #eee3d3;
  --surface-container-high: #e4d7c4;
  --fg-1: #241b12;
  --fg-2: #5c4b3d;
  --fg-muted: #8a7968;
  --border: rgba(154,75,20,.16);
  --gradient-hero: linear-gradient(135deg, #9a4b14 0%, #2f6f73 100%);
  --gradient-text: linear-gradient(135deg, #9a4b14 0%, #2f6f73 100%);
}
html[data-ha-style="timeline-story"] body {
  background-color: var(--bg) !important;
  background-image:
    linear-gradient(90deg, transparent 0 calc(50% - 1px), rgba(154,75,20,.16) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)),
    radial-gradient(circle at 50% 72px, rgba(154,75,20,.20) 0 4px, transparent 5px);
  background-size: 100% 100%, 100% 96px;
}
html[data-ha-style="timeline-story"] body::before { content: "timeline story"; }
html[data-ha-style="timeline-story"] .hero::before,
html[data-ha-style="timeline-story"] header.hero::before {
  width: 8px;
  height: 72px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--ha-style-accent), var(--ha-style-accent-2));
}

html[data-ha-style="map-atlas"] {
  --ha-style-accent: #17695a;
  --ha-style-accent-2: #2f66a8;
  --primary: #17695a;
  --primary-container: #115346;
  --primary-fixed: #daf5ec;
  --secondary-container: #2f66a8;
  --bg: #f4faf7;
  --surface: #f4faf7;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #eaf4ef;
  --surface-container: #e0eee8;
  --surface-container-high: #d4e6de;
  --fg-1: #10221d;
  --fg-2: #365149;
  --fg-muted: #6e837b;
  --border: rgba(23,105,90,.16);
  --gradient-hero: linear-gradient(135deg, #17695a 0%, #2f66a8 100%);
  --gradient-text: linear-gradient(135deg, #17695a 0%, #2f66a8 100%);
}
html[data-ha-style="map-atlas"] body {
  background-color: var(--bg) !important;
  background-image:
    repeating-linear-gradient(24deg, rgba(23,105,90,.09) 0 1px, transparent 1px 34px),
    repeating-linear-gradient(116deg, rgba(47,102,168,.08) 0 1px, transparent 1px 42px);
}
html[data-ha-style="map-atlas"] body::before { content: "map atlas"; }
html[data-ha-style="map-atlas"] .hero::before,
html[data-ha-style="map-atlas"] header.hero::before {
  width: 78px;
  height: 78px;
  border: 2px solid var(--ha-style-accent);
  border-radius: 50%;
  background:
    radial-gradient(circle at 55% 42%, var(--ha-style-accent) 0 4px, transparent 5px),
    linear-gradient(45deg, transparent 47%, rgba(47,102,168,.55) 48% 52%, transparent 53%);
}

html[data-ha-style="network-map"] {
  --ha-style-accent: #355f91;
  --ha-style-accent-2: #a34d67;
  --primary: #355f91;
  --primary-container: #294b75;
  --primary-fixed: #deebff;
  --secondary-container: #a34d67;
  --bg: #f7f8fb;
  --surface: #f7f8fb;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #eef1f7;
  --surface-container: #e6ebf3;
  --surface-container-high: #dbe2ee;
  --fg-1: #151b24;
  --fg-2: #3f4a5b;
  --fg-muted: #737e8f;
  --border: rgba(53,95,145,.16);
  --gradient-hero: linear-gradient(135deg, #355f91 0%, #a34d67 100%);
  --gradient-text: linear-gradient(135deg, #355f91 0%, #a34d67 100%);
}
html[data-ha-style="network-map"] body {
  background-color: var(--bg) !important;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(53,95,145,.22) 0 3px, transparent 4px),
    radial-gradient(circle at 68% 34%, rgba(163,77,103,.18) 0 3px, transparent 4px),
    linear-gradient(38deg, transparent 0 48%, rgba(53,95,145,.10) 49% 51%, transparent 52%);
  background-size: 88px 88px, 118px 118px, 132px 132px;
}
html[data-ha-style="network-map"] body::before { content: "network map"; }
html[data-ha-style="network-map"] .hero::before,
html[data-ha-style="network-map"] header.hero::before {
  width: 86px;
  height: 46px;
  border-radius: 999px;
  background:
    radial-gradient(circle at 18px 24px, var(--ha-style-accent) 0 7px, transparent 8px),
    radial-gradient(circle at 44px 12px, var(--ha-style-accent-2) 0 6px, transparent 7px),
    radial-gradient(circle at 70px 30px, var(--ha-style-accent) 0 7px, transparent 8px),
    linear-gradient(22deg, transparent 0 31%, color-mix(in srgb, var(--ha-style-accent) 60%, transparent) 32% 36%, transparent 37%),
    linear-gradient(160deg, transparent 0 43%, color-mix(in srgb, var(--ha-style-accent-2) 60%, transparent) 44% 48%, transparent 49%);
}

html[data-ha-style="dashboard"] {
  --ha-style-accent: #0f5f6f;
  --ha-style-accent-2: #8a5a16;
  --primary: #0f5f6f;
  --primary-container: #0b4c59;
  --primary-fixed: #d8f2f5;
  --secondary-container: #8a5a16;
  --bg: #f5f7f9;
  --surface: #f5f7f9;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #eef2f5;
  --surface-container: #e7edf1;
  --surface-container-high: #dce5ea;
  --fg-1: #111827;
  --fg-2: #374151;
  --fg-muted: #6b7280;
  --border: rgba(15,95,111,.16);
  --gradient-hero: linear-gradient(135deg, #0f5f6f 0%, #083344 100%);
  --gradient-text: linear-gradient(135deg, #0f5f6f 0%, #083344 100%);
}
html[data-ha-style="dashboard"] body {
  background-color: var(--bg) !important;
  background-image: linear-gradient(90deg, rgba(15,95,111,.08) 0 1px, transparent 1px);
  background-size: 18px 100%;
}
html[data-ha-style="dashboard"] body::before { content: "dashboard"; }
html[data-ha-style="dashboard"] .hero::before,
html[data-ha-style="dashboard"] header.hero::before {
  width: 100%;
  height: 3px;
  margin-bottom: 14px;
}

html[data-ha-style="document"] {
  --ha-style-accent: #8b3f1f;
  --ha-style-accent-2: #2f6f73;
  --primary: #8b3f1f;
  --primary-container: #703319;
  --primary-fixed: #ffe4d5;
  --secondary-container: #2f6f73;
  --bg: #fbfaf7;
  --surface: #fbfaf7;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f2efe8;
  --surface-container: #e9e4da;
  --surface-container-high: #ded7c9;
  --fg-1: #211d18;
  --fg-2: #554d44;
  --fg-muted: #82786c;
  --border: rgba(139,63,31,.16);
  --font-headline: Georgia, "Iowan Old Style", "Times New Roman", serif;
  --gradient-hero: linear-gradient(135deg, #8b3f1f 0%, #2f6f73 100%);
  --gradient-text: linear-gradient(135deg, #8b3f1f 0%, #2f6f73 100%);
}
html[data-ha-style="document"] body {
  background-color: var(--bg) !important;
  background-image: linear-gradient(90deg, rgba(139,63,31,.18) 0 4px, transparent 4px);
  background-size: 100% 100%;
}
html[data-ha-style="document"] body::before { content: "document"; }
html[data-ha-style="document"] .hero::before,
html[data-ha-style="document"] header.hero::before {
  width: 42px;
  height: 42px;
  border-radius: 0;
  background: transparent;
  border-top: 4px solid var(--ha-style-accent);
  border-left: 4px solid var(--ha-style-accent);
}

html[data-ha-style="developer"] {
  color-scheme: dark;
  --ha-style-accent: #33ff00;
  --ha-style-accent-2: #ffb000;
  --ha-style-badge-bg: #0a0a0a;
  --ha-style-badge-fg: #33ff00;
  --primary: #33ff00;
  --on-primary: #050505;
  --primary-container: #33ff00;
  --primary-fixed: #102610;
  --secondary-container: #ffb000;
  --bg: #0a0a0a;
  --surface: #0a0a0a;
  --surface-container-lowest: #0a0a0a;
  --surface-container-low: #0d160d;
  --surface-container: #102610;
  --surface-container-high: #153315;
  --fg-1: #33ff00;
  --fg-2: #b7ff9a;
  --fg-muted: #1f521f;
  --border: #1f521f;
  --border-strong: #33ff00;
  --green: #33ff00;
  --red: #ff3333;
  --yellow: #ffb000;
  --gradient-hero: none;
  --gradient-text: none;
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-accent: none;
  --font-headline: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --font-body: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --font-mono: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;
  --radius-xl: 0;
  --radius-2xl: 0;
  --radius-pill: 0;
}
html[data-ha-style="developer"] body {
  background-color: var(--bg) !important;
  background-image: repeating-linear-gradient(to bottom, rgba(51,255,0,.045) 0, rgba(51,255,0,.045) 1px, transparent 1px, transparent 4px);
  background-size: auto;
  text-shadow: 0 0 5px rgba(51,255,0,.5);
}
html[data-ha-style="developer"] body::before {
  content: "developer";
  border-radius: 0;
  border-color: var(--primary);
  box-shadow: none;
  text-shadow: 0 0 5px rgba(51,255,0,.5);
}
html[data-ha-style="developer"] .hero::before,
html[data-ha-style="developer"] header.hero::before {
  width: 100%;
  height: auto;
  margin-bottom: 16px;
  border-radius: 0;
  background: transparent;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: 12px;
  content: "review@html-anything:~/artifact$ scan --risk --evidence";
}
html[data-ha-style="developer"] pre,
html[data-ha-style="developer"] code,
html[data-ha-style="developer"] .mono {
  color: inherit;
}
</style>`

async function main() {
  const entries = Object.entries(STYLE_BY_EXAMPLE)
  let changed = 0
  for (const [slug, style] of entries) {
    const file = path.join(ROOT, "examples", slug, "output.html")
    let html
    try {
      html = await fs.readFile(file, "utf8")
    } catch {
      continue
    }
    const next = applySkin(html, style)
    if (next !== html) {
      changed++
      await fs.writeFile(file, next, "utf8")
    }
  }
  console.log(`Applied example style skins to ${entries.length} mapped examples (${changed} changed).`)
}

function applySkin(html, style) {
  let out = html
    .replace(new RegExp(`${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}\\n?`, "g"), "")
    .replace(/<html\b([^>]*)>/i, (_, attrs) => {
      const cleanAttrs = attrs.replace(/\sdata-ha-style="[^"]*"/i, "")
      return `<html${cleanAttrs} data-ha-style="${style}">`
    })

  const block = `${START}\n${SKIN_CSS}\n${END}\n`
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${block}</head>`)
  return `${block}${out}`
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

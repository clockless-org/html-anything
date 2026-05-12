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
  "wechat-couple": "love-romance-3d",
  "whatsapp": "relationship",

  "amazon-orders": "timeline-story",
  "browser-history": "timeline-story",
  "spotify-history": "timeline-story",
  "youtube-watch-history": "timeline-story",
  "iphone-health": "timeline-story",
  "kindle-highlights": "living-essay",
  "twitch-history": "timeline-story",
  "chatgpt-export": "timeline-story",
  "ai-chat-log": "timeline-story",

  "google-photos-takeout": "map-atlas",
  "google-maps-stars": "map-atlas",
  "travel-history": "global-travel",

  "vcard-contacts": "network-map",
  "linkedin-connections": "network-map",
  "venmo-paypal-payments": "network-map",
  "slack": "kinetic-scoreboard",
  "discord": "network-map",
  "telegram": "network-map",
  "email": "soft-saas",

  "csv": "dashboard",
  "jsonl": "dashboard",
  "log-access": "dashboard",
  "log-error": "dashboard",
  "transcript-sales-call": "dashboard",
  "transcript-product-meeting": "dashboard",

  "markdown": "document",
  "bookmarks-market-research": "document",
  "reading-list-academic": "document",
  "pdf": "digital-eguide",
  "docx": "document",
  "medical-visit": "document",
  "lab-results": "document",
  "legal-chronology": "document",
  "editorial-carousel": "editorial-carousel",

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

html[data-ha-style="love-romance-3d"] {
  --ha-style-accent: #f04d72;
  --ha-style-accent-2: #45a6b7;
  --primary: #d9355d;
  --primary-container: #b72b4e;
  --primary-fixed: #ffe2ea;
  --secondary-container: #45a6b7;
  --bg: #fff5f7;
  --surface: #fff7f9;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #ffeef3;
  --surface-container: #f9dfe7;
  --surface-container-high: #efcbd7;
  --fg-1: #29161c;
  --fg-2: #663744;
  --fg-muted: #906b75;
  --border: rgba(217,53,93,.16);
  --rose: #f04d72;
  --blue: #45a6b7;
  --gold: #f4bd55;
  --gradient-hero: linear-gradient(135deg, #ff7d9c 0%, #f04d72 46%, #45a6b7 100%);
  --gradient-text: linear-gradient(135deg, #d9355d 0%, #8f2b5d 58%, #2b7e8c 100%);
}
html[data-ha-style="love-romance-3d"] body {
  background-color: var(--bg) !important;
  background-image:
    linear-gradient(120deg, rgba(240,77,114,.10), transparent 42%),
    linear-gradient(300deg, rgba(69,166,183,.09), transparent 44%),
    linear-gradient(rgba(217,53,93,.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(217,53,93,.035) 1px, transparent 1px);
  background-size: auto, auto, 28px 28px, 28px 28px;
}
html[data-ha-style="love-romance-3d"] body::before { content: "love romance 3d"; }
html[data-ha-style="love-romance-3d"] .hero::before,
html[data-ha-style="love-romance-3d"] header.hero::before {
  width: 82px;
  height: 82px;
  border-radius: 22px;
  background:
    radial-gradient(circle at 30% 24%, rgba(255,255,255,.86) 0 7px, transparent 8px),
    linear-gradient(135deg, #ff9bb2 0%, #f04d72 58%, #b72b4e 100%);
  box-shadow: inset -12px -14px 20px rgba(115,14,45,.18), inset 10px 9px 18px rgba(255,255,255,.48), 0 18px 36px rgba(217,53,93,.22);
  transform: rotate(-8deg);
}

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

html[data-ha-style="living-essay"] {
  --ha-style-accent: #cfa86e;
  --ha-style-accent-2: #8c7040;
  --primary: #8c7040;
  --primary-container: #cfa86e;
  --primary-fixed: #f0efe9;
  --secondary-container: #cfa86e;
  --bg: #faf9f7;
  --surface: #faf9f7;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f0efe9;
  --surface-container: #eae8e0;
  --surface-container-high: #e0ded5;
  --fg-1: #2b2b2b;
  --fg-2: #42403c;
  --fg-muted: #68645d;
  --border: #eae8e0;
  --gradient-hero: linear-gradient(135deg, #cfa86e 0%, #8c7040 100%);
  --gradient-text: linear-gradient(135deg, #2b2b2b 0%, #8c7040 100%);
}
html[data-ha-style="living-essay"] body {
  background-color: var(--bg) !important;
  background-image: none;
}
html[data-ha-style="living-essay"] body::before { content: "mycelium essay"; }
html[data-ha-style="living-essay"] .hero::before,
html[data-ha-style="living-essay"] header.hero::before {
  width: 40px;
  height: 92px;
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 22px, color-mix(in srgb, var(--ha-style-accent) 55%, transparent) 0 4px, transparent 5px),
    linear-gradient(180deg, transparent 0 14px, color-mix(in srgb, var(--ha-style-accent) 55%, transparent) 15px 74px, transparent 75px);
  border: 1px solid #e0ded5;
  box-shadow: 0 4px 20px rgba(0,0,0,.03);
}

html[data-ha-style="global-travel"] {
  --ha-style-accent: #ff5b2e;
  --ha-style-accent-2: #9fb8b5;
  --primary: #ff5b2e;
  --primary-container: #e84a20;
  --primary-fixed: #ffe2d6;
  --secondary-container: #9fb8b5;
  --bg: #eef7f6;
  --surface: #eef7f6;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f7fbfa;
  --surface-container: #e2eeee;
  --surface-container-high: #d4e4e2;
  --fg-1: #20262b;
  --fg-2: #4f5e61;
  --fg-muted: #839294;
  --border: rgba(58,85,86,.13);
  --gradient-hero: linear-gradient(135deg, #ff5b2e 0%, #5f8f8a 100%);
  --gradient-text: linear-gradient(135deg, #20262b 0%, #20262b 100%);
}
html[data-ha-style="global-travel"] body {
  background-color: var(--bg) !important;
  background-image:
    radial-gradient(circle at 50% 44%, rgba(255,255,255,.72), transparent 34rem),
    linear-gradient(180deg, #eef7f6 0%, #f6fbfa 100%);
}
html[data-ha-style="global-travel"] body::before { content: "global travel"; }
html[data-ha-style="global-travel"] .hero::before,
html[data-ha-style="global-travel"] header.hero::before {
  width: 92px;
  height: 52px;
  border-radius: 4px;
  background:
    radial-gradient(circle at 18% 62%, var(--ha-style-accent) 0 5px, transparent 6px),
    radial-gradient(circle at 52% 38%, var(--ha-style-accent) 0 5px, transparent 6px),
    radial-gradient(circle at 78% 68%, var(--ha-style-accent) 0 5px, transparent 6px),
    radial-gradient(circle, color-mix(in srgb, #7f9696 45%, transparent) 1px, transparent 1.5px);
  background-size: auto, auto, auto, 8px 8px;
  box-shadow: none;
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

html[data-ha-style="kinetic-scoreboard"] {
  --ha-style-accent: #e63946;
  --ha-style-accent-2: #0d0d0d;
  --primary: #0d0d0d;
  --primary-container: #0d0d0d;
  --primary-fixed: #ffe3e6;
  --secondary-container: #e63946;
  --bg: #f0efea;
  --surface: #f0efea;
  --surface-container-lowest: #fffdf6;
  --surface-container-low: #e9e7df;
  --surface-container: #dedbd1;
  --surface-container-high: #d2cec2;
  --fg-1: #0d0d0d;
  --fg-2: #292621;
  --fg-muted: #635f56;
  --border: rgba(13,13,13,.24);
  --gradient-hero: linear-gradient(135deg, #0d0d0d 0%, #e63946 100%);
  --gradient-text: linear-gradient(135deg, #0d0d0d 0%, #e63946 100%);
}
html[data-ha-style="kinetic-scoreboard"] body {
  background-color: var(--bg) !important;
  background-image:
    linear-gradient(rgba(13,13,13,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(13,13,13,.055) 1px, transparent 1px);
  background-size: 20px 20px;
}
html[data-ha-style="kinetic-scoreboard"] body::before { content: "kinetic"; }
html[data-ha-style="kinetic-scoreboard"] .hero::before,
html[data-ha-style="kinetic-scoreboard"] header.hero::before {
  width: 92px;
  height: 32px;
  border-radius: 0;
  background:
    linear-gradient(90deg, transparent 0 8px, #0d0d0d 8px 16px, transparent 16px 76px, #0d0d0d 76px 84px, transparent 84px),
    linear-gradient(0deg, transparent 0 12px, #0d0d0d 12px 18px, transparent 18px);
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

html[data-ha-style="soft-saas"] {
  --ha-style-accent: #5b7cf6;
  --ha-style-accent-2: #e978ae;
  --primary: #5b7cf6;
  --primary-container: #4964d8;
  --primary-fixed: #e6ecff;
  --secondary-container: #e978ae;
  --bg: #f5f7fb;
  --surface: #f5f7fb;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f0f3fb;
  --surface-container: #e8edf8;
  --surface-container-high: #dfe6f5;
  --fg-1: #172033;
  --fg-2: #344057;
  --fg-muted: #6b7288;
  --border: rgba(106,119,150,.15);
  --gradient-hero: linear-gradient(135deg, #5b7cf6 0%, #aebcff 58%, #65d6ce 100%);
  --gradient-text: linear-gradient(135deg, #172033 0%, #5b7cf6 100%);
}
html[data-ha-style="soft-saas"] body {
  background-color: var(--bg) !important;
  background-image:
    radial-gradient(circle at 48% 20%, rgba(91,124,246,.10), transparent 26rem),
    radial-gradient(circle at 76% 6%, rgba(101,214,206,.12), transparent 22rem);
}
html[data-ha-style="soft-saas"] body::before { content: "soft-saas"; }
html[data-ha-style="soft-saas"] .hero::before,
html[data-ha-style="soft-saas"] header.hero::before {
  width: 42px;
  height: 42px;
  border-radius: 16px;
  background:
    radial-gradient(circle at 30% 30%, #fff 0 3px, transparent 4px),
    linear-gradient(135deg, #dbe4ff, #ffffff);
  box-shadow: 0 10px 26px rgba(91,124,246,.16);
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

html[data-ha-style="digital-eguide"] {
  --ha-style-accent: #c44a47;
  --ha-style-accent-2: #e07d52;
  --ha-style-badge-bg: rgba(250,243,234,.86);
  --ha-style-badge-fg: #1f1c14;
  --primary: #c44a47;
  --secondary-container: #e07d52;
  --bg: #d8c8c0;
  --surface: #faf3ea;
  --surface-container-lowest: #faf3ea;
  --surface-container-low: #f4ecdf;
  --surface-container: #eadfd0;
  --surface-container-high: #d3c9b3;
  --fg-1: #1f1c14;
  --fg-2: #4e4435;
  --fg-muted: #837964;
  --border: rgba(31,28,20,.13);
  --font-headline: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --font-body: Georgia, "Times New Roman", serif;
  --gradient-hero: linear-gradient(135deg, #c44a47 0%, #e07d52 100%);
  --gradient-text: linear-gradient(135deg, #c44a47 0%, #e07d52 100%);
}
html[data-ha-style="digital-eguide"] body {
  background-color: var(--bg) !important;
  background-image:
    radial-gradient(ellipse 80% 60% at 50% 18%, #ead7cf, transparent 70%),
    radial-gradient(ellipse 58% 58% at 82% 92%, #c79a8e, transparent 72%) !important;
}
html[data-ha-style="digital-eguide"] body::before { content: "digital e-guide"; }
html[data-ha-style="digital-eguide"] .hero::before,
html[data-ha-style="digital-eguide"] header.hero::before {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  background: var(--ha-style-accent-2);
  transform: rotate(8deg);
  box-shadow: inset 0 0 0 6px rgba(255,255,255,.24);
}

html[data-ha-style="editorial-carousel"] {
  --ha-style-accent: #9f3f24;
  --ha-style-accent-2: #1f6a64;
  --primary: #9f3f24;
  --secondary-container: #1f6a64;
  --bg: #f3efe7;
  --surface: #f3efe7;
  --surface-container-lowest: #fbf8f1;
  --surface-container-low: #eee6d9;
  --surface-container: #e7ded0;
  --surface-container-high: #d8cbbb;
  --fg-1: #161412;
  --fg-2: #4b4037;
  --fg-muted: #81746a;
  --border: rgba(22,20,18,.16);
  --gradient-hero: linear-gradient(135deg, #9f3f24 0%, #1f6a64 100%);
  --gradient-text: linear-gradient(135deg, #9f3f24 0%, #1f6a64 100%);
}
html[data-ha-style="editorial-carousel"] body {
  background-color: var(--bg) !important;
  background-image:
    linear-gradient(90deg, rgba(22,20,18,.05) 1px, transparent 1px),
    linear-gradient(rgba(22,20,18,.035) 1px, transparent 1px);
  background-size: 18px 18px;
}
html[data-ha-style="editorial-carousel"] body::before { content: "editorial carousel"; }
html[data-ha-style="editorial-carousel"] .hero::before,
html[data-ha-style="editorial-carousel"] header.hero::before {
  width: 78px;
  height: 12px;
  border-radius: 0;
  background:
    linear-gradient(90deg, var(--ha-style-accent) 0 38%, transparent 38% 48%, var(--ha-style-accent-2) 48% 100%);
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

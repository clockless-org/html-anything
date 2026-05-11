# Developer Style

Use this style for GitHub repos, diffs, PR patches, CI/build/test logs, stack
traces, and technical artifacts.

## Underlying System: Terminal Evidence Workbench

This is a technical investigation system rendered as a clean ZSH/BASH terminal
environment. It should feel like `tmux` panes, a review shell, or an incident
console: brutally functional, high-contrast, auditable, and fast to scan.

The developer style intentionally overrides the shared Clockless visual tokens.
Keep the Evidence Workbench information architecture, but express it through
the Terminal CLI design system below.

Base scaffold:

1. **Prompt line / finding bar** — top command prompt with status, suspected
   cause/risk, changed files/failing tests, confidence/hypothesis labels, and
   a blinking cursor.
2. **Terminal panes** — strict grid of bordered windows for review checklist,
   risk hotspots, failing tests, stack frames, diff/log/search, and copyable
   handoff.
3. **Risk checklist** — concrete findings ordered by severity, each grounded
   in evidence and prefixed with terminal status codes such as `[ERR]`,
   `[WARN]`, `[OK]`, or `[HYP]`.
4. **Raw artifact drill-down** — collapsible full diff/log/trace, searchable,
   line-numbered, and visually close to the claim it supports.
5. **Copyable handoff** — bracketed action button (`[ COPY SUMMARY ]`) for PR
   comments, tickets, or incident notes.

Component vocabulary:

- `.dev-shell`, `.terminal-prompt`, `.finding-bar`, `.terminal-pane`,
  `.pane-title`, `.evidence-workbench`, `.hotspot-map`, `.risk-checklist`,
  `.raw-artifact`, `.frame-stack`, `.copy-handoff`, `.hypothesis-chip`,
  `.status-code`, `.ascii-divider`, `.terminal-cursor`.
- Use shell words and labels: `user@host:~$`, `--filter`, `--severity`,
  `[OK]`, `[WARN]`, `[ERR]`, `[HYP]`, `exit=1`, `pid`, `sha`, `line`.

Interaction model:

- Every inferred claim is labeled as hypothesis unless directly evidenced.
- Clicking a finding should jump to or reveal supporting raw evidence.
- Raw artifact is available but never the first thing the user has to parse.
- Provide keyboard-accessible controls. Focus should use inverted video
  (green background, black text) or a crisp 1px outline.

## Terminal Token Override

Use these tokens in `:root` for every developer-style page. This is a dark-mode
only surface. Do not add a light theme.

```css
:root {
  color-scheme: dark;

  --bg: #0a0a0a;
  --surface: #0a0a0a;
  --surface-container-lowest: #0a0a0a;
  --surface-container-low: #0d160d;
  --surface-container: #102610;
  --surface-container-high: #153315;

  --primary: #33ff00;
  --secondary: #ffb000;
  --muted: #1f521f;
  --accent: #33ff00;
  --error: #ff3333;
  --border: #1f521f;
  --border-strong: #33ff00;

  --fg-1: #33ff00;
  --fg-2: #b7ff9a;
  --fg-muted: #1f521f;
  --on-primary: #050505;

  --green: #33ff00;
  --yellow: #ffb000;
  --red: #ff3333;
  --blue: #72d5ff;

  --font-headline: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace;
  --font-body: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace;

  --space-xs: 4px; --space-sm: 8px; --space-md: 12px;
  --space-lg: 16px; --space-xl: 20px; --space-2xl: 24px;
  --space-3xl: 32px; --space-4xl: 48px; --space-5xl: 64px;

  --radius-sm: 0; --radius-md: 0; --radius-lg: 0;
  --radius-xl: 0; --radius-2xl: 0; --radius-pill: 0;

  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --shadow-accent: none;
  --text-glow: 0 0 5px rgba(51, 255, 0, 0.5);
}
```

Use this Google Fonts import if a font import is useful:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

## Page Shape

- Lead with a shell prompt, not a marketing hero. Example:
  `review@html-anything:~/artifact$ scan --risk --evidence`.
- The first viewport should reveal a terminal split layout: status prompt,
  KPI/status codes, checklist pane, and hotspot pane.
- Use a strict character-grid rhythm. Align numbers, paths, statuses, and
  command flags.
- Use ASCII separators where useful: `//`, `===`, `---`, `+--- RAW LOG ---+`.
- Stack panes vertically on mobile. Preserve line wrapping and avoid horizontal
  overflow except inside raw code/log panes.

## Visual Language

- Monospace supremacy: every visible character uses `var(--font-mono)`.
- Headers are uppercase, compact, and terminal-native. Do not use large
  editorial headlines.
- Use black panels with 1px green borders. No rounded corners. No drop shadows.
- Text uses terminal green with a subtle phosphor glow. Use amber for warnings
  and accents, red for failures, dim green for inactive labels and borders.
- Add a subtle CRT scanline overlay with `pointer-events: none`. Keep opacity
  low enough that long logs remain readable.
- Do not use gradients, glassmorphism, blurred cards, pill chips, soft shadows,
  cream surfaces, or smooth product-dashboard styling.

## Component Styling

- Buttons: bracketed text (`[ COPY SUMMARY ]`, `[ JUMP RAW ]`) or inverted
  terminal blocks. Hover/focus fills green and flips text to black.
- Cards/windows: call them panes. Use `.terminal-pane` with `border: 1px solid
  var(--border)` and a title bar such as `+--- RISK HOTSPOTS ---+`.
- Inputs: render as a prompt plus field, e.g. `grep@raw:~$ <input>`. No rounded
  box. Focus shows a cursor/inverted prompt.
- Chips: square bracket labels, not pills: `[HYP]`, `[ERR]`, `[WARN]`, `[OK]`.
- Raw data visualization: use ASCII-style bars such as
  `[||||||||||.....]`, directory rollups, hunk strips, and status ledgers
  rather than glossy charts.

## Effects And Motion

- Include a blinking block or underscore cursor in the prompt/finding bar.
- Use a short typewriter reveal for the main command/status line when it does
  not delay access to content.
- Optional hover glitch should be subtle: a 1px offset/flicker on labels only.
- Respect `prefers-reduced-motion`; disable typing, blinking, and glitch for
  users who request reduced motion.

## Required Modules

- Prompt/finding strip.
- Evidence-backed findings.
- Review checklist.
- Risk hotspots or architecture/hotspot map.
- Raw artifact drill-down.
- Copyable technical summary.

## Avoid

- Vague "looks good" prose.
- Certainty claims for inferred root causes.
- Decorative visuals that bury file/line evidence.
- Large unstructured log dumps as the first screen.
- Matrix rain, neon-purple cyberpunk, rounded SaaS cards, or one-off inline
  colors outside the token system.

## Implementation Notes

- Label inferred causes as `[HYP]` / `Hypothesis`.
- Keep file paths and line references copyable.
- Do not mutate source code from a generated report unless the user asked for a
  code change.
- Keep the generated page self-contained. Inline CSS and JS. No icon libraries
  are needed for this style; use text/status codes before decorative icons.

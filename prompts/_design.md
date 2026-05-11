# Design system (shared)

Every HTML page produced by html-anything uses the **Clockless design
system** by default. The LLM picks the layout and the visual story; the
tokens below keep outputs feeling like one product line.

Style-specific prompts may provide a complete replacement token system for a
specialized surface. When they do, the style prompt wins for that selected
style only, and the output should still centralize every color, font, spacing,
radius, and effect in CSS variables.

## How to use

Paste this into the `:root` of your inline `<style>` and use the
variables (`var(--primary)`, `var(--font-headline)`, etc.) for every
color, font, spacing and radius decision unless the selected style prompt
explicitly replaces the token system. Do not invent your own palette. Do not
pick a different font outside those style-level tokens.

## Tokens (light theme — default)

```css
:root {
  /* Brand */
  --primary: #a03b00;
  --primary-container: #c94c00;
  --primary-fixed: #ffdbcd;
  --primary-fixed-dim: #ffb597;
  --on-primary: #ffffff;
  --accent-glow: #E8400D;

  /* Secondary / tertiary */
  --secondary: #d5baff;
  --secondary-container: #7b40e0;
  --tertiary: #4d44e3;
  --accent-cyan: #00D4FF;

  /* Surfaces */
  --bg: #fff8f6;
  --surface: #fff8f6;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #fbf2ef;
  --surface-container: #f5ece9;
  --surface-container-high: #efe6e3;

  /* Text */
  --fg-1: #1e1b19;
  --fg-2: #594138;
  --fg-muted: #8d7166;

  /* Borders */
  --border: rgba(0, 0, 0, 0.06);
  --border-strong: rgba(0, 0, 0, 0.12);
  --outline-variant: #e1bfb2;

  /* Status */
  --green: #10b981;
  --blue: #3b82f6;
  --yellow: #f59e0b;
  --red: #ef4444;

  /* Typography */
  --font-headline: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  --font-body: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'SF Mono', 'Menlo', ui-monospace, monospace;

  /* Spacing (4px base) */
  --space-xs: 4px; --space-sm: 8px; --space-md: 12px;
  --space-lg: 16px; --space-xl: 20px; --space-2xl: 24px;
  --space-3xl: 32px; --space-4xl: 48px; --space-5xl: 64px;

  /* Radius */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px;
  --radius-xl: 20px; --radius-2xl: 28px; --radius-pill: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(30, 27, 25, 0.04);
  --shadow-md: 0 4px 12px rgba(30, 27, 25, 0.08);
  --shadow-lg: 0 8px 24px rgba(30, 27, 25, 0.12);
  --shadow-accent: 0 8px 24px rgba(160, 59, 0, 0.15);

  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #a03b00 0%, #c94c00 100%);
  --gradient-hero: linear-gradient(135deg, #a03b00 0%, #7b40e0 100%);
  --gradient-text: linear-gradient(135deg, #a03b00 0%, #7b40e0 100%);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #060B18;
    --surface: #0B1426;
    --surface-container-lowest: #101D35;
    --surface-container-low: #101D35;
    --surface-container: #162544;
    --surface-container-high: #1c2d52;
    --fg-1: #F8FAFC;
    --fg-2: #CBD5E1;
    --fg-muted: #64748B;
    --border: rgba(255, 255, 255, 0.08);
    --border-strong: rgba(255, 255, 255, 0.14);
    --primary: #FF6B35;
    --accent-glow: #00D4FF;
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
}
```

Plus this Google Fonts import at the top of `<head>` (Space Grotesk +
Plus Jakarta Sans, the only two web-font calls allowed):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

## Tone & rules

- **Headlines** in `var(--font-headline)` (Space Grotesk), letter-spacing
  slightly tightened (`-0.01em`), weight 600–700.
- **Body** in `var(--font-body)` (Plus Jakarta Sans), 14.5–16px,
  line-height 1.5–1.6.
- **Mono** in `var(--font-mono)` for numerics, code, IDs.
- **Surfaces are warm cream in light mode** (`var(--surface)`,
  `var(--surface-container-*)`) — not white. Cards on cream feel right.
- **Accent is brand orange** `var(--primary)` — use sparingly, mainly
  on CTAs, key callout numbers, primary KPI in an infographic.
- **Use the spacing scale** (`var(--space-*)`) — don't pick arbitrary
  pixel values like 18px, 22px.
- **Use the radius scale** (`var(--radius-*)`) — pill for buttons,
  lg/xl for cards, sm for inline tags.
- **Use the shadow scale** — `--shadow-md` for cards, `--shadow-lg`
  for elevated panels, `--shadow-accent` for branded emphasis.
- **Charts** should pick from the brand palette: primary, secondary
  (`#7b40e0`), tertiary (`#4d44e3`), accent-cyan (`#00D4FF`), green,
  blue, yellow. Up to 6 colors max in a single chart.
- **Never use random Tailwind-default neutrals** like `#9ca3af` or
  `#1f2937` — use `--fg-muted`, `--fg-2`, etc.

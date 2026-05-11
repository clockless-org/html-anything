# github-repo — github.com/owner/repo URL

The user pointed at a GitHub repository (or specific files inside one).
Use the `gh` CLI or WebFetch to gather material before designing the page.

## What to fetch

- Repo metadata: `gh api repos/<owner>/<repo>` → name, description,
  language, star count, license, dates.
- README: `gh api repos/<owner>/<repo>/readme` → decoded markdown.
- File tree: `gh api repos/<owner>/<repo>/git/trees/<branch>?recursive=1`
  → list of files (limit to ~200 entries for the sample).
- 2–3 key files: pick by heuristic — `package.json` / `pyproject.toml` /
  `Cargo.toml`, the largest source file, anything mentioned in the
  README. Read each via `gh api repos/<owner>/<repo>/contents/<path>`.

Don't read every file. The LLM only needs enough to describe shape.

## Layout

A **repo explainer** page. Sections in this order:

1. **Header**: repo name, description, language pill, star count, license,
   primary CTA (link to repo).
2. **What this is**: 2-3 sentence summary you derive from the README +
   the file shape (small lib? big monorepo? CLI tool? web app?).
3. **File tree**: collapsible tree showing the top 2 levels of directories
   plus the README/config files at root. Click a file to see content
   (inlined data) in a side panel or modal.
4. **README**: rendered markdown.
5. **Key files**: 2–3 source files you fetched, each with a 2-3 sentence
   "what this does" you wrote, plus the code (syntax-highlighted).

## Always include

- Light + dark mode.
- Click-to-copy for any code block.
- Mobile responsive — file tree collapses to a dropdown on small screens.
- "Open on GitHub" button next to every file.

## Data shape

```ts
DATA = {
  repo: { owner, name, description, language, stars, license, url, defaultBranch },
  readme: "raw markdown",
  tree: [{ path, type: "blob"|"tree", size?: number }],
  files: [{ path, content: "...", lang?: string }],
}
```

## Tone

Confident, technical, restrained. Like a well-designed docs site —
not a marketing page.

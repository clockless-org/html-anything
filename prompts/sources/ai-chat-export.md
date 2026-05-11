# AI chat export — generic / markdown logs

Used for two ingestion paths that both render through the same family
contract in `_ai_chat_export.md`:

1. **Markdown / text "User: / Assistant:" logs** — manually saved
   ChatGPT or Claude conversations, transcripts pasted out of an
   AI app, or third-party chat clients that export to plain text.
   The parser splits on `# Heading` / `## Conversation N` /
   `---` separators when several conversations live in one file.
2. **Generic JSON** with a `{ conversations: [...] }` (or
   `{ chats: [...] }`, `{ threads: [...] }`, `{ sessions: [...] }`)
   wrapper, where each item has a `messages` (or `turns`) array.
   Common shape for OSS clients, exports from open-source chat
   UIs, and scraped-and-normalized histories.

The shared `_ai_chat_export.md` family prompt covers the page
contract — read that first; this file only adds notes that apply
when the data is *not* a recognized ChatGPT or Claude export.

## Export instructions

If the user is asking how to get their data out of a less-common
chat tool:

- **Open-source chat UIs** (LibreChat, OpenWebUI, Ollama Web UI):
  most expose Settings → Data → Export. The result is usually
  an array of `{ title, messages: [...] }`.
- **Pasted / saved conversations**: ask the user to copy each
  conversation from the AI app, paste into a markdown file with
  this shape:
  ```
  # Conversation title
  Date: 2026-04-12

  User: First prompt...
  Assistant: First reply...
  User: Follow-up...
  Assistant: ...
  ```
  Multiple conversations can live in one `.md` file separated by
  `---` or by another `# heading`.

## Generic-format framing

- The platform label is usually "Generic AI chat export" or
  "AI chat log" — keep that label in the page chrome rather than
  trying to guess the underlying tool.
- Model names may be missing; render the model breakdown only if
  `DATA.modelBreakdown` is non-empty.
- Markdown logs may have no per-message timestamps. The parser
  attempts to lift a date from a leading `Date:` line or a
  parenthesized timestamp on the role line — anything else stays
  date-less. The activity timeline / heatmap should fall back to
  conversation-level `createdEpoch` (also possibly missing) —
  hide the timeline gracefully if there are zero dated points.
- The user wrote these by hand or extracted them from a tool, so
  don't blame the data when something is missing — surface what's
  there and skip what isn't.

Stick to the required six sections from `_ai_chat_export.md`.

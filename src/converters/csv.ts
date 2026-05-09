/**
 * CSV → sortable, filterable, searchable HTML table.
 *
 * No deps; tiny RFC-4180-ish parser handles quoted fields, escaped
 * quotes, and embedded newlines. Renders all rows into a single
 * <table>, then a sprinkle of inline JS makes columns sortable and
 * the search box filters rows.
 *
 * For files larger than ~50K rows, we'd need pagination / virtual
 * scrolling — out of scope for v0; flag in the README and switch on
 * when it bites.
 */
import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { Converter, ConverterInput } from "../types.js"
import { htmlShell, escapeHtml } from "../shared/shell.js"

export const converter: Converter = {
  name: "csv",
  matches: [".csv", ".tsv"],
  async render(input: ConverterInput): Promise<string> {
    const raw = await fs.readFile(input.filepath, "utf8")
    const sep = path.extname(input.filepath).toLowerCase() === ".tsv" ? "\t" : detectSep(raw)
    const rows = parseCsv(raw, sep)
    if (rows.length === 0) {
      return htmlShell({
        title: path.basename(input.filepath),
        eyebrow: "CSV · empty",
        body: `<p>No rows parsed from this file.</p>`,
      })
    }

    const headers = rows[0]
    const data = rows.slice(1)
    const title = input.options.title || path.basename(input.filepath, path.extname(input.filepath))
    const eyebrow = `CSV · ${data.length.toLocaleString()} rows · ${headers.length} columns`

    // Detect numeric columns for right-align + (later) charts.
    const numericCols = new Set<number>()
    for (let c = 0; c < headers.length; c++) {
      let numHits = 0
      const sample = data.slice(0, Math.min(50, data.length))
      for (const row of sample) {
        const v = row[c]
        if (v && /^-?[\d,]+(\.\d+)?$/.test(v.replace(/[,$%]/g, ""))) numHits++
      }
      if (numHits >= sample.length * 0.7) numericCols.add(c)
    }

    const headerHtml = headers
      .map((h, i) => `<th data-col="${i}" data-numeric="${numericCols.has(i)}"><button class="csv-sort">${escapeHtml(h)}<span class="csv-sort__arrow"></span></button></th>`)
      .join("")
    const rowsHtml = data
      .map(row => {
        const cells = row
          .map((v, i) => `<td${numericCols.has(i) ? ` class="csv-num"` : ""}>${escapeHtml(v)}</td>`)
          .join("")
        return `<tr data-searchable data-searchable-text="${escapeHtml(row.join(" "))}">${cells}</tr>`
      })
      .join("\n")

    const body = `
<div class="csv-meta">${data.length.toLocaleString()} rows · ${headers.length} columns · ${numericCols.size} numeric</div>
<div class="csv-wrap">
  <table class="csv-table">
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</div>`

    return htmlShell({
      title,
      eyebrow,
      body,
      extraCss: CSV_CSS,
      extraJs: CSV_JS,
    })
  },
}

function detectSep(raw: string): string {
  // Look at the first line; pick whichever of comma/semicolon/tab/pipe
  // shows up most. Falls back to comma.
  const line = raw.split(/\r?\n/, 1)[0] || ""
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 }
  for (const ch of line) if (ch in counts) counts[ch]++
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best && best[1] > 0 ? best[0] : ","
}

function parseCsv(raw: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let i = 0
  let inQuotes = false
  while (i < raw.length) {
    const ch = raw[i]
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false
        i++
      } else {
        field += ch
        i++
      }
    } else {
      if (ch === '"') { inQuotes = true; i++; continue }
      if (ch === sep) { row.push(field); field = ""; i++; continue }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue }
      if (ch === "\r") { i++; continue }
      field += ch
      i++
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const CSV_CSS = `
.csv-meta {
  font-size: 13px;
  color: var(--ha-fg-muted);
  margin-bottom: 12px;
}
.csv-wrap {
  border: 1px solid var(--ha-border);
  border-radius: var(--ha-radius);
  overflow: auto;
  max-height: 78vh;
  background: var(--ha-surface);
  box-shadow: var(--ha-shadow);
}
.csv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
.csv-table thead th {
  position: sticky;
  top: 0;
  background: var(--ha-surface);
  border-bottom: 1px solid var(--ha-border);
  padding: 0;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ha-fg-muted);
  text-align: left;
}
.csv-sort {
  width: 100%;
  background: none;
  border: 0;
  text-align: inherit;
  padding: 12px 14px;
  cursor: pointer;
  font: inherit;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 6px;
}
.csv-sort:hover { background: var(--ha-accent-soft); color: var(--ha-fg); }
.csv-sort__arrow::before { content: ""; opacity: 0.5; }
.csv-table th[data-sort="asc"] .csv-sort__arrow::before { content: " ↑"; opacity: 1; }
.csv-table th[data-sort="desc"] .csv-sort__arrow::before { content: " ↓"; opacity: 1; }
.csv-table td {
  padding: 8px 14px;
  border-bottom: 1px solid var(--ha-border);
  white-space: nowrap;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.csv-table tbody tr:hover { background: var(--ha-accent-soft); }
.csv-num { text-align: right; font-variant-numeric: tabular-nums; }
`

const CSV_JS = `
(function () {
  var ths = document.querySelectorAll('.csv-table th');
  ths.forEach(function (th) {
    th.querySelector('.csv-sort').addEventListener('click', function () {
      var col = parseInt(th.getAttribute('data-col'), 10);
      var numeric = th.getAttribute('data-numeric') === 'true';
      var dir = th.getAttribute('data-sort') === 'asc' ? 'desc' : 'asc';
      ths.forEach(function (other) { other.removeAttribute('data-sort'); });
      th.setAttribute('data-sort', dir);
      var tbody = th.closest('table').querySelector('tbody');
      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      rows.sort(function (a, b) {
        var av = a.children[col].textContent.trim();
        var bv = b.children[col].textContent.trim();
        if (numeric) {
          var an = parseFloat(av.replace(/[\\$,\\s%]/g, '')) || 0;
          var bn = parseFloat(bv.replace(/[\\$,\\s%]/g, '')) || 0;
          return dir === 'asc' ? an - bn : bn - an;
        }
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
    });
  });
})();
`

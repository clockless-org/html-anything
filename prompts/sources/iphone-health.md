# iphone-health — Apple Health export

Apple Health export — steps, sleep, workouts, heart rate, weight,
activity rings, mindfulness sessions, anything else the user has been
logging. Output is a **personal health story**, not a clinical
dashboard. Strava-style visual joy, not Sheets.

## Export instructions (surface to the user before converting)

Apple Health export is built into iOS:

1. Open the **Health** app on iPhone.
2. Tap the user profile icon (top right).
3. Scroll down to **Export All Health Data**.
4. Tap → confirm. iPhone takes ~1–5 minutes to bundle everything.
5. Share to themselves (AirDrop to Mac is fastest, or Mail / iCloud
   Drive). Result: a `export.zip` containing `export.xml` (the actual
   data) plus a `workout-routes/` folder with per-workout GPX files.
6. Unzip. Drop the `export.xml` path into Claude Code:
   `convert this Apple Health export to HTML`.

Heads up to mention to the user: **Apple Health exports can be huge**
(hundreds of MB if they've been logging for years). The skill samples
~5 KB of records for layout decisions; the full data is inlined into
the output HTML. If the export is > 50 MB, the resulting HTML will
also be large (~50–100 MB). It still opens fine in a browser, just
takes a moment.

## What to surface (the experience)

The user's body, year by year. Make it feel like an annual report
they'd actually want to see.

### Hero

A big year-style line: *"In 2024 you walked 4.7 million steps, slept
2,847 hours, and ran 482 km. That's 47 marathons in steps."*

### Activity rings (if available)

Apple's three rings — Move (calories), Exercise (minutes), Stand
(hours). Show them as a giant SVG ring chart for the latest week + a
calendar heatmap for the year (one cell per day, ring closure as the
fill). Tasteful animation: the rings fill on first view.

### Sleep

- A **sleep duration sparkline** for the period (per day).
- **Bedtime histogram** — when does this person actually sleep?
- **Average over the period** in big display type with a sentence
  comparison: *"You averaged 7h 12m — about 1h 4m more than the same
  period in 2023."*

### Workouts

- **Workout calendar** — every day with a workout shaded; dot color =
  workout type.
- **Top 5 workout types** by total minutes.
- For run / bike / walk: show one route from `workout-routes/` if
  available — a single SVG polyline of a memorable workout (the
  longest? the fastest? LLM picks).
- **Personal records** — fastest 5K, longest run, max heart rate
  during exercise. One line each.

### Heart rate

If the user has Apple Watch data, show the **resting heart rate trend**
as a sparkline across the full period. Comment on direction
("trending down — likely fitter than at the start of the year") only
if the LLM can defend it from the data.

### Drill-down

Searchable + filterable table of all workout sessions. Date, type,
duration, distance, calories, route link.

## Tone

Strava + Whoop's better moments + a bit of Apple's own clean Health
typography. Use the Clockless tokens but lean into space, big numbers,
calm sans-serif. **Avoid clinical / WebMD vibes** — this is a personal
record, not a medical record.

## Always include

- **Privacy callout** at the top: *"Apple Health data is sensitive.
  This file lives only on your machine — nothing was uploaded. Don't
  share the HTML unless you'd be okay sharing the underlying data."*
- "Copy as Markdown" of the year summary.
- Charts inline SVG, no external libraries.

## Hard rules

- **Do not infer medical conditions or interpret values clinically**.
  The skill is showing the user their own data, not diagnosing.
- **Do not include "trends" the data doesn't actually support**. If
  there are only 8 days of resting-heart-rate samples, don't draw a
  trend line.
- **Don't hide outliers**. If the user has a day with 50,000 steps
  (probably a hike), it should show as the outlier it is — that's
  a memory, not a glitch.

## Data shape

```ts
DATA = {
  records: [
    { type: "HKQuantityTypeIdentifierStepCount", value: 8234,
      startDate: "2024-08-12", source: "iPhone" },
    ...
  ],
  workouts: [
    { type: "Running", durationSec: 2160, distanceM: 5230,
      kcal: 412, startDate: "2024-08-15", routeFile?: "..." }
  ],
  byType: { "StepCount": { totalDays: 365, total: 4_700_000 }, ... },
  yearStats: { 2024: { steps: 4_700_000, sleepHours: 2847, runKm: 482 } },
  dateRange: "2018-09-12 → 2025-01-04",
  meta: { sourceFile, sizeBytes }
}
```

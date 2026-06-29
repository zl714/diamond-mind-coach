# Diamond Mind — Foundation Contract (read before building a view)

> **Brand/design:** This app is **Diamond Mind**. `<html data-app="diamond-mind">`
> sets the accent to logo **cyan `#00AEEF`**; baseball-red **seam `#EF4444`** / coral
> `#FB7185` is the SECONDARY data accent only. Follow `DESIGN_SYSTEM.md` exactly
> (Geist + Geist Mono + Lucide via CDN, navy near-black surfaces, slate text,
> `tabular-nums` on every numeric cell, 4px spacing grid, ONE accent + separate
> up/down axis, color+glyph never color-alone, no emoji icons). The old green
> theme is gone — never reintroduce `#7FFF00`/lime.

This documents the shared foundation every feature view sits on. Phase-2 agents
build the 7 remaining views by **replacing the placeholder file** in `js/views/`
(keep the `CT.registerView(...)` call). Do **not** edit the foundation files unless
the contract is insufficient — extend it instead.

Everything lives under the single global namespace **`window.CT`**:

```
window.CT = {
  // constants/helpers (constants.js)
  STORAGE_KEY, SCHEMA_VERSION, uid, todayISO, formatDate, daysAgo, relativeDate,
  escapeHtml, initials, clampNumber, METRICS, METRIC_BY_KEY, POSITIONS, FOCUS_AREAS,
  // foundation modules
  model, store, stats, pitchsmart, benchmarks, programs, io, ui, charts,
  // app shell
  registerView, router, buildSampleData
}
```

Script load order (set in `index.html`, do not reorder):
`constants → model → benchmarks → programs-data → stats → pitchsmart → sample-data
→ store → io → ui → charts → app → views/*`. The view files load **after** `app.js`
so `CT.registerView` exists when they run.

---

## 1. Registering & rendering a view (THE pattern)

Every view file is an IIFE that registers itself at load time:

```js
(function () {
  'use strict';
  var CT = window.CT;
  function render(root, ctx) {
    // root = the <main id="view-root"> element (already emptied for you)
    // ctx  = { param: string|null, navigate: function(hash) }
    root.innerHTML = CT.ui.pageHead('My View', 'subtitle') + '...';
    // wire events on elements inside root here
  }
  CT.registerView('myid', { label: 'My View', render: render });
})();
```

- `registerView(id, { label, render })` adds a **nav tab** (`#/<id>`) and routes to it.
- The router calls `render(rootEl, ctx)` on navigation. It **empties `root` first**,
  **destroys prior charts** (`CT.charts.destroyAll()`), and **wraps `render` in
  try/catch** — a thrown error shows an inline error card, never a blank app.
- Deep links: `#/<id>/<param>` → `ctx.param` is the string after the id (e.g. a
  playerId for a detail view). Build links as `#/<id>/<param>`.
- To re-render after a mutation call **`CT.router.route()`**. To navigate use
  `ctx.navigate('#/season/' + playerId)` or `CT.router.navigate(hash)`.
- `id` must match the filename (`js/views/<id>.js`) and the `<script>` tag already
  in `index.html`. The 8 ids are: `roster, dashboard, assessment, games, season,
  armsafety, programs, alerts`.

---

## 2. `CT.store` — versioned immutable localStorage (store.js)

State is **flat top-level collections** (arrays) keyed by foreign IDs. Key =
`coachTracker.v2`, `schemaVersion = 2`. Mutations replace state immutably and
persist + notify subscribers. On first load it seeds clearly-labeled demo data.

Collections (`CT.store.COLLECTION_NAMES`):
`teams, seasons, players, anthroReadings, assessmentSessions, metricReadings,
games, battingStatLines, pitchingAppearances, fieldingStatLines, workloadLogs,
dailyCheckIns, programs, programAssignments, programSessions, drills, lessons,
benchmarks`.

**Append-only** (`CT.store.APPEND_ONLY`): `metricReadings`, `workloadLogs`.
`update()` throws on these — corrections add a NEW row (use `append`, set
`correctsId`/`voided` on the new/old logical row via a fresh insert).

### Queries (read-only, return copies)
```
store.getState()                       -> whole state object
store.all(collection)                  -> array copy
store.getById(collection, id)          -> record | null
store.where(collection, field, value)  -> array
store.query(collection, predicateFn)   -> array
store.byPlayer(collection, playerId)   -> array (filters field 'playerId')
store.getPlayers()                     -> players array
store.getPlayer(id)                    -> player | null
store.latestMetric(playerId, metricKey, context?) -> newest non-voided MetricReading | null
store.lastAssessmentDate(playerId)     -> 'yyyy-mm-dd' | null
store.isUsingSample()                  -> bool (demo badge)
// Drill library + lessons (coaching-session workflow)
store.drillLibrary()                   -> all drills, sorted by category then name
store.getDrill(id)                     -> Drill | null
store.drillsByCategory(cat)            -> Drill[] (cat ∈ model.DRILL_CATEGORIES)
store.getLesson(id)                    -> Lesson | null
store.lessonsForPlayer(playerId)       -> Lesson[] newest-first (timeline order)
store.subscribe(fn)                    -> unsubscribe fn (called with state on every commit)
```

### Mutations (immutable; clear the demo flag)
```
store.insert(collection, data)         -> normalized record (factory-applied)
store.append(collection, data)         -> same as insert; use for append-only intent
store.update(collection, id, patch)    -> updated record (NOT for append-only)
store.remove(collection, id)           -> void (hard delete)
store.deletePlayerCascade(playerId)    -> deletes player + all child records (incl. lessons)
// Lesson writers (append-only-friendly: drag-drop reorder + notes-by-id)
store.setLessonDrills(lessonId, ids[]) -> persist reordered drillIds (call from Sortable onEnd)
store.setLessonNotes(lessonId, body)   -> persist notes keyed on the STABLE lesson id
```

### Bulk
```
store.exportAll()                      -> plain object of every collection (used by io.exportJSON)
store.importAll(data, {isSample})      -> replace ALL data (validates players[])
store.resetToSample()                  -> reseed demo data
store.clearAll()                       -> empty (keeps seeded benchmarks)
```

`data` passed to `insert/append/update` is normalized through the matching
`CT.model` factory, so missing fields get safe defaults — you can pass partials.

---

## 3. `CT.model` — entities, factories, age logic, validation (model.js)

Each factory `CT.model.<Name>(partial)` returns a fully-defaulted, normalized
record (pure; never mutates). Use them when you need a shaped object; `store.insert`
applies them for you.

Factories & key fields (all have `id`, most have `createdAt`):
- **Player**: `name, birthdate('yyyy-mm-dd'), ageBand, level('youth'|'HS'|'college'|'pro'),
  bats('R'|'L'|'S'), throws('R'|'L'), positions[], teamId, jersey, notes`.
  `ageBand` is derived from birthdate on insert (set it via `ageBandFromBirthdate`).
- **AnthroReading**: `playerId, date, heightIn, weightLb, notes` (time-series).
- **AssessmentSession**: `playerId, date, type('assessment'|'showcase'|'practice'), location, notes`.
- **MetricReading** (append-only): `playerId, assessmentSessionId, metricKey, value,
  unit, aggregation('max'|'avg'), context, device('device'|'manual'),
  confidence('high'|'med'|'low'), basePath, date, correctsId, voided`.
- **Game**: `seasonId, teamId, date, opponent, homeAway, scoreFor, scoreAgainst, notes`.
- **BattingStatLine** (RAW counters): `gameId, playerId, pa?, ab, h, b2, b3, hr, bb,
  hbp, sf, so, sb, cs, r, rbi, qab?`. (`b2`=doubles, `b3`=triples; 1B is derived.)
- **PitchingAppearance** (RAW): `gameId, playerId, outs (IP as OUTS), bf?, h, r, er,
  bb, so, hbp, hr, pitches, strikes, firstPitchStrikes, firstPitchPA`.
- **FieldingStatLine** (RAW): `gameId, playerId, position, po, a, e`.
- **WorkloadLog** (append-only): `playerId, date, type('game'|'bullpen'|'practice'|'long-toss'),
  pitches, outs, rpe, notes`.
- **DailyCheckIn**: `playerId, date, soreness(0-10), fatigue(0-10), sleepHours, mood(1-5),
  armPain(bool), painLocation, notes`.
- **Program**: `templateId, name, category, description, ageBands[], ageGateMin,
  weeks, sessionsPerWeek, checklist[], clinicianRequired, isTemplate`.
- **ProgramAssignment**: `playerId, programId, startDate, status('active'|'completed'|'paused'), notes`.
- **ProgramSession**: `assignmentId, playerId, programId, date, weekIndex, planned,
  completed, warmupDone, armCareDone, rpe, soreness, notes`.
- **Drill** (coach-managed library): `name, category, defaultNotes`. `category` ∈
  `model.DRILL_CATEGORIES` = `['Hitting','Pitching','Fielding','Baserunning','Strength','Mobility']`
  (defaults to `'Hitting'` if invalid). The **DrillLibrary** is simply the `drills`
  collection; drills are referenced (cloned by id) into a Lesson's `drillIds`.
- **Lesson** (a coaching session): `playerId, date, drillIds[] (ORDERED Drill ids),
  notes (rich session note), quickStats ({metricKey:value} map), ratingDelta (number|null)`.
  `notes` is carried by the **stable lesson id** — never a board position — so it
  follows the lesson through any drag/reorder. `quickStats` keys should be
  `model.METRIC_BY_KEY` keys (e.g. `exitVeloMax`, `fastballVelo`, `sixtyYard`);
  non-numeric values are dropped on normalize. Use `store.setLessonDrills` /
  `store.setLessonNotes` to mutate; both go through the normal immutable `update`.
- **Benchmark**: `ageBand, metricKey, unit, p10, p25, p50, p75, p90, source`.
- **Team**: `name, ageBand, level, season`. **Season**: `name, year, startDate, endDate, level`.

Age & level helpers:
```
model.ageFromBirthdate(iso)            -> integer years | null
model.ageBandFromAge(age)              -> '9-10U'|'11-12U'|'13-14U'|'15-16U'|'17-18U'
model.ageBandFromBirthdate(iso)        -> ageBand | null
model.defaultLevelFromAge(age)         -> level
model.inningsPerGame(level)            -> 6 youth / 7 HS / 9 college|pro
model.AGE_BANDS, model.LEVELS, model.INNINGS_PER_GAME
```

Metric catalog (`model.METRIC_CATALOG`, lookup `model.METRIC_BY_KEY` /
`model.metric(key)` / `model.metricsByGroup('hitting'|'pitching'|'throwing'|'athleticism'|'anthro')`).
Each entry: `{ key, label, unit, group, tier('core'|'advanced'|'derived'),
contexts[], range:[min,max], lowerBetter?, youthNA?, bandMax?, minLevel? }`.
Context lists: `model.HITTING_CONTEXTS, PITCHING_CONTEXTS, GENERIC_CONTEXTS`.
Aggregations: `model.AGGREGATIONS` (`['max','avg']`).

Validation (use at form boundaries; fail fast):
```
model.validatePlayer(data)             -> { ok, errors:[], warnings:[] }
model.validateMetricReading(reading, player) -> { ok, errors:[], warnings:[] }
```
`validateMetricReading` rejects out-of-range values and **warns** on implausible
per-age-band game readings (e.g. 95 mph EV from an 11U) and youth-N/A metrics.

---

## 4. `CT.stats` — pure derived stats (stats.js)

GOLDEN RULE: raw counters are truth; **season rates are recomputed from SUMMED
counters**, never averaged per game. IP is stored as **outs**.

```
stats.sumBatting(lines)                -> totals object (sums counters + derives pa)
stats.deriveBatting(totals)            -> { avg, obp, slg, ops, tb, iso, kPct, bbPct,
                                            bbK, sbPct, qabPct, ...counts }
stats.battingFromLines(lines)          -> deriveBatting(sumBatting(lines))   [convenience]

stats.sumPitching(apps)                -> totals
stats.derivePitching(totals, ipg)      -> { ip, ipDisplay, era, whip, k9, bb9, kbb,
                                            strikePct, fpsPct, pitchesPerInning, ... }
stats.pitchingFromApps(apps, ipg)      -> convenience. PASS ipg = model.inningsPerGame(player.level)

stats.sumFielding(lines) / deriveFielding(totals) / fieldingFromLines(lines)
                                        -> { fieldingPct (reliability, NOT a ranking), po, a, e }

Formatting: stats.formatIP(outs)->'2.1', stats.fmtRate(v)->'.321', stats.fmtPct(v,d),
            stats.fmt2(v), stats.fmt1(v). All null-safe (null -> '—').
```
ERA/K9/BB9 are scaled by `ipg` (innings-per-game for the level). Always pass
`model.inningsPerGame(player.level)`; omitting `ipg` defaults to 9.

---

## 5. `CT.pitchsmart` — hard rule engine (pitchsmart.js)

```
pitchsmart.evaluate(player, workloadLogsForPlayer, { asOf? }) -> {
  ageBand, dailyMax, cleared(bool), status('green'|'yellow'|'red'),
  daysUntilEligible, remainingToday, thrownToday,
  lastOuting { date, pitches, restNeeded, daysSince } | null,
  rolling12moInnings, inningsCap(80), overInningsCap(bool),
  consecutiveDayWarning(bool), consecutiveStreak,
  acwr { acute, chronicWeekly, ratio, zone('low'|'optimal'|'caution'|'danger'|'unknown') },
  reasons: [human-readable strings]
}
```
Pass the player's own workload logs: `store.byPlayer('workloadLogs', player.id)`.
Also exposed: `pitchsmart.dailyMax(band)`, `restRequired(band, pitches)`,
`computeACWR(byDay)`, `inningsInWindow(logs, days)`, `pitchesByDay(logs)`,
`DAILY_MAX`, `REST_TABLE`, `ANNUAL_INNINGS_CAP`.
Use `status` to color a `status-dot`/badge (green/yellow/red CSS classes exist).

---

## 6. `CT.benchmarks` — seeded age-band percentiles (benchmarks.js)

```
benchmarks.get(ageBand, metricKey)     -> { p10,p25,p50,p75,p90, unit, source } | null
benchmarks.percentileFor(ageBand, metricKey, value) -> 10..90 | null  (handles lowerBetter)
benchmarks.bandsFor(metricKey)         -> rows across all bands (for overlay charts)
benchmarks.table()                     -> all rows
benchmarks.SOURCE_NOTE                  -> honest disclaimer string (SHOW IT in UI)
```
These are **illustrative composites, not validated norms** — frame youth numbers as
TREND vs self, and surface `SOURCE_NOTE`. The same rows are also seeded into
`store.all('benchmarks')`.

---

## 7. `CT.programs` — templates, gating, scheduling (programs-data.js)

```
programs.templates()                    -> array of template objects
programs.byTemplateId(id)               -> one template | null
programs.eligibility(template, player)  -> { eligible(bool), reason } (honors hard age gates)
programs.generateSessions(program, assignment) -> array of ProgramSession stubs (dated)
programs.CATEGORIES                      -> category list for filters
```
To assign: create a `Program` instance from a template
(`store.insert('programs', Object.assign({}, template, {isTemplate:false}))`), then
`store.insert('programAssignments', { playerId, programId, startDate })`, then
`generateSessions(program, assignment).forEach(s => store.insert('programSessions', s))`.
Respect `eligibility().eligible` (e.g. weighted-ball/periodized throwing is
hard-gated to 15+) and show `clinicianRequired` warnings.

---

## 8. `CT.ui` — consistent builders (ui.js). Builders return HTML STRINGS.

```
ui.pageHead(title, subtitle?, actionsHtml?)   -> page header block
ui.card({ title?, subtitle?, body?, actions?, clickable?, className?, attrs?,
          rawTitle?, rawSubtitle? })           -> card HTML (escapes text unless raw*)
ui.formField({ type:'text'|'number'|'date'|'select'|'textarea'|'checkbox',
               name, label?, value?, options?, placeholder?, help?,
               min?, max?, step?, required? })  -> field HTML (name="<name>" for read-back)
ui.pill(text, tone?)                            -> pill   (tone: green|yellow|red|neutral)
ui.badge(text, tone)                            -> badge
ui.statTile(num, label)                         -> .stat tile (wrap in <div class="stats">)
ui.emptyState(icon, title, message?, actionHtml?) -> never-blank empty panel
ui.toneStyle(tone)                              -> inline CSS string for custom elements
ui.esc(str)                                     -> escapeHtml

ui.toast(message)
ui.openModal(title, contentHtml, onMount(modal, close))   // wire buttons in onMount
ui.closeModal()
ui.confirmDialog(title, message, confirmLabel, onConfirm)
```
Read form values in `onMount` via `modal.querySelector('[name="field"]').value`.
For `select`, `options` accepts `['a','b']` or `[{value,label}]`.

**Design-system class conventions (use these — do NOT hand-roll inline color):**
`.btn .btn-primary .btn-ghost .btn-danger .btn-sm .btn-block`, `.card .clickable`,
`.grid-cards`, `.kpi-grid .kpi`, `.kv-row`, `.stats .stat`, `.pill`, `.badge`,
`.status-dot.green|.yellow|.red`, `.ct-table` (+ `.table-wrap`; add class `num` to
numeric `<td>/<th>` for right-align + tabular figures), `.field .field-row`,
`.tabbar .tabbar-item.active` (underline tabs), `.chart-wrap` (280px canvas box),
`.empty`, `.pct-bar > span` (Savant percentile bar), `.timeline .session-card`,
`.sortable-ghost/.sortable-chosen/.sortable-drag/.drag-handle/.sr-only` (drag-drop).
- `ui.statTile/ui.pill/ui.badge/ui.toneStyle` tones: `green|up`, `red|down`,
  `yellow|warn`, `accent|cyan`, `seam`, else neutral — all token-backed. Pair
  color + glyph + text (Lucide `<i data-lucide>`) — never color alone.
- Lucide icons: emit `<i data-lucide="name">`; the **router repaints icons after
  every render** (`lucide.createIcons()`), so you don't call it yourself.
- `ui.emptyState(iconName, …)` takes a **Lucide icon name** (e.g. `'users'`,
  `'inbox'`), not an emoji.

**Design tokens (`DESIGN_SYSTEM.md` `:root`)** — surfaces `--bg-base/--bg-sunken/
--surface-1..4`; text `--text-hi/-strong/-body/-secondary/-muted`; accent
`--accent-300..600` (cyan) + `--accent-soft`; axis `--up/--down/--warn` (+ `*-soft`);
Savant `--pct-hot/-mid/-cold`; `--seam/--seam-2`; spacing `--sp-1..16` (4px grid);
radii `--r-chip/-control/-card/-panel/-modal/-pill`; type `--fs-*`, `--fw-*`; fonts
`--font-ui` (Geist) / `--font-mono` (Geist Mono). A **legacy alias layer** maps the
old names (`--accent → --accent-500`, `--panel → --surface-2`, `--body-2 →
--text-secondary`, `--danger → --down`, etc.) onto tokens so existing `var(--…)`
keeps working — prefer the new token names in new code. Mobile-first; the desktop
sidebar rail collapses to a bottom tab bar + elevated center '+' under 768px.

---

## 9. `CT.charts` — themed Chart.js 4 wrappers (charts.js)

Put a `<canvas>` inside `<div class="chart-wrap">`. The router auto-destroys charts
on navigation. Degrades gracefully if the CDN is offline.
```
charts.line(canvas, { labels, datasets:[{label, data, color?, fill?}], options? })
charts.bar(canvas, { labels, data, label?, colors?, options? })
charts.scatter(canvas, { points:[{x,y}], label?, pointColors?, options? })
charts.make(canvas, chartJsConfig)     -> generic; merges DM cyan theme into options
charts.THEME                            -> { accent (cyan), accentFill, seam, seam2,
                                            text, tick, grid, panel, border, up, down,
                                            danger, warn, pctHot, pctMid, pctCold }
charts.savantColor(pct)                 -> rgb() on the Savant diverging scale (0..100)
                                           — use for percentile/tool bars
charts.directionColor(net)              -> THEME.up if net>=0 else THEME.down
                                           — Robinhood-style trend coloring
charts.destroyAll()                     -> (router calls this; call if you redraw in place)
```
Series default to **cyan** (`THEME.accent`); use `THEME.seam`/`seam2` as the second
data accent, the `up`/`down` axis for signed deltas, and `savantColor()` for
percentile bars. Never reintroduce green chrome.
For a metric-over-time line, sort `store.byPlayer('metricReadings', id)` for a
`metricKey`/`context` by `date`, then feed labels = `CT.formatDate(r.date)`.

---

## 10. `CT.io` — export/import (io.js)
`io.exportJSON()` downloads all data; `io.importJSON(onDone)` replaces all data then
calls `onDone`. The top nav already wires Export/Import/Reset buttons — you usually
don't need these in a view.

---

## 11. Drill / Lesson workflow + SortableJS drag-drop (drills view + profile)

The drills view assigns **Drills** from the coach-managed library into a player's
**Lesson** (coaching session) by drag-drop. Use **SortableJS** (loaded via CDN in
`index.html`) — NOT native HTML5 DnD (silently dead on touch, no keyboard path).

**Clone-from-library pattern:**
```js
// Library list: drag ASSIGNS A COPY, library stays intact.
new Sortable(libraryEl, {
  group: { name: 'board', pull: 'clone', put: false },
  sort: false,
  animation: 150, handle: '.drag-handle',
  delay: 120, delayOnTouchOnly: true   // swipes still scroll
});
// Each session column shares the board group (accepts clones + reorders).
new Sortable(sessionColEl, {
  group: 'board', animation: 150, handle: '.drag-handle',
  delay: 120, delayOnTouchOnly: true,
  onEnd: function () { CT.store.setLessonDrills(lessonId, col.toArray()); }
});
```
- Every draggable row carries `data-id="<drillId>"`; persist on `onEnd` via
  `col.toArray()` (array of `data-id`s) → `store.setLessonDrills(lessonId, ids)`.
- Style hooks already in CSS: `.sortable-ghost` (faint + accent-soft),
  `.sortable-chosen` (2px accent ring), `.sortable-drag`, `.drag-handle`.
- **WCAG 2.5.7 fallback (required):** every drill row ALSO needs visible
  "Move up / Move down" buttons + an "Assign to session…" menu, and an
  `aria-live="polite"` `.sr-only` region announcing pickup / "Moved to position 2
  of 5" / "Dropped into <session>".

**Per-session notes keyed on a STABLE id:** store notes via
`store.setLessonNotes(lessonId, body)` — they live on the Lesson record's `id`,
**never a board/column position**, so a note follows its lesson regardless of how
drills are dragged. Use an inline low-chrome auto-growing textarea, debounced
autosave (~500ms) + on blur, Cmd/Ctrl+Enter to commit, with a quiet "Saved" tell.

**Player profile** reads `store.lessonsForPlayer(id)` (newest-first) for the session
timeline, `store.drillLibrary()` / `store.getDrill(id)` to resolve drill names,
and renders tool/percentile bars with `.pct-bar > span` colored by
`charts.savantColor(pct)`; signed stat deltas use the `up`/`down`/`seam` tones.

## Conventions checklist for a new view
- IIFE + `'use strict'`; grab `var CT = window.CT;`.
- Build HTML with `CT.ui.*`; **escape all user text** (`CT.escapeHtml`).
- Read with `store.where/byPlayer/getById`; write with `store.insert/append/update`.
- Derive stats only via `CT.stats`; never average per-game rates.
- For pitchers, gate/flag with `CT.pitchsmart.evaluate`.
- After any mutation, call `CT.router.route()` to re-render.
- Never leave a blank screen — use `ui.emptyState`.
- Keep youth-safety framing: trend not pass/fail, surface pain/Pitch-Smart flags,
  show `benchmarks.SOURCE_NOTE`. No public youth leaderboards.
- Files stay small/focused (< ~400 lines). `js/views/roster.js` is the worked example.

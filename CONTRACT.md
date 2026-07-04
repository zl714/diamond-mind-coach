# Diamond Mind — Foundation Contract (v3, read before building a view)

> **Brand/design:** This app is **Diamond Mind**. `<html data-app="diamond-mind">`
> sets the accent to logo **cyan `#00AEEF`** (text role = `--accent-700 #0072A8`);
> **seam red `#DC2626`** means DANGER ONLY on the light "Clinic" theme. Follow
> `DESIGN_SYSTEM.md` exactly (Geist + Geist Mono + Lucide via CDN, white surfaces
> on `#F8F9FB`, ink-alpha borders, `tabular-nums` on every numeric cell, 4px grid,
> ONE accent + separate up/down semantic axis, color+glyph never color-alone,
> no emoji icons).

Everything lives under the single global namespace **`window.CT`**:

```
window.CT = {
  // constants/helpers (constants.js)
  uid, todayISO, formatDate, daysAgo, relativeDate, escapeHtml, initials, clampNumber,
  // foundation modules
  model, migrate, store, stats, pitchsmart, benchmarks, programs, io, ui, charts,
  // app shell + cross-view helpers
  registerView, getViewRender, router, alerts, sessionLog, checkin, playersUI,
  views: { drillLibrary, programBuilder, programs, season }   // embedded children
}
```

Script load order (set in `index.html`, do not reorder):
`constants → model → benchmarks → programs-data → stats → pitchsmart → migrate
→ store → io → ui → charts → app → views/*`. View files load **after** `app.js`
so `CT.registerView` exists when they run. **Registration order = sidebar order.**

---

## 1. Registering & rendering a view (THE pattern)

```js
(function () {
  'use strict';
  var CT = window.CT;
  function render(root, ctx) {
    // root = <main id="view-root"> (already emptied)
    // ctx  = { param: string|null, navigate: function(hash) }
    root.innerHTML = CT.ui.pageHead('My View', 'subtitle') + '...';
  }
  CT.registerView('myid', { label: 'My View', render: render });      // nav tab
  CT.registerView('myid', { ..., hidden: true });                      // routable, no tab
})();
```

- Nav views (in order): `dashboard, players, assess, programs, games, armsafety`.
  Hidden routes: `player` (profile), `alerts`. Children hosted via `CT.views.*`:
  drillLibrary (+ programBuilder) inside Programs, season inside Games.
- Router empties root, calls `CT.charts.destroyAll()`, try/catches every render
  (an error shows an inline card, never a blank app), repaints Lucide icons.
- Deep links: `#/<id>/<param>` → `ctx.param` is everything after the first `/`
  (may itself contain `/`, e.g. `#/programs/edit/<programId>`).
- Re-render after a mutation with **`CT.router.route()`**; navigate with
  `ctx.navigate(hash)` or `CT.router.navigate(hash)`.
- Legacy redirects (app.js `legacyRedirect`): `roster→players`,
  `drills→programs/drills`, `sessions[/drills|/programs]→programs[...]`,
  `season→games/season`, `assessment[/pid]→assess[/pid]`,
  `dashboard/<pid>→player/<pid>`.

### Route map

| Hash | View |
| --- | --- |
| `#/dashboard` | status hero + **Today** program panel + tiles + activity feed |
| `#/players`, `#/player/<id>` | roster / profile (grade, tools, program card, trends, feed) |
| `#/assess`, `#/assess/new[/pid]`, `#/assess/<sessionId|pid>` | assessment history / 3-step wizard / receipt |
| `#/programs` | program list + assignments + adherence chart |
| `#/programs/drills` | drill library CRUD tab |
| `#/programs/new`, `#/programs/edit/<id>` | program builder (week × day grid) |
| `#/programs/<programId>` | program detail (read grid + assign) — unknown params fall back to the list |
| `#/games`, `#/games/<id>`, `#/games/season` | games / box score / season stats |
| `#/armsafety[/<pid>]` | Pitch Smart console (all arms / one arm) |
| `#/armsafety/checkin` | daily check-in (arm-health data lives here) |
| `#/alerts` | full alerts page (header bell shares `CT.alerts.build()`) |

---

## 2. `CT.store` — versioned immutable localStorage (store.js)

Key = **`diamondMind.v3`**, `schemaVersion = 4`. Boots EMPTY; a legacy real
(non-demo) `coachTracker.v2` blob is migrated once via `CT.migrate` (v2 blob kept
as rollback). There is **no demo/sample data** anymore.

**v3 ⇄ v4 compatibility:** v4 is a strict superset of v3 (adds
`SessionLog.focus`, `MetricReading.sessionLogId`, `Player.readiness`,
`Program.source/goalId/generatorMeta`, `ProgramDay.intensity`, and settings
`lessonFocusDefault` + `drillSeedVersion`). A v3 blob upgrades in place on
`load()` (factory defaults; no transform); a v4 export re-imports into a v3
build cleanly (that build's factories drop the unknown fields). Note the v3
blob is overwritten in place — export a backup before downgrading.

Collections (`CT.store.COLLECTION_NAMES`):
`teams, seasons, players, anthroReadings, assessmentSessions, metricReadings,
games, battingStatLines, pitchingAppearances, fieldingStatLines, workloadLogs,
dailyCheckIns, drills, programs, programAssignments, sessionLogs` — plus a
`settings` singleton (NOT a collection): `{ orgName, coachName,
onboarding:{dismissed}, assessPreset[], speedDefault, lessonFocusDefault,
drillSeedVersion }`.

**Append-only:** `metricReadings`, `workloadLogs` (update() throws; corrections
add a new row; `remove()` exists for hard deletes only).

```js
store.load() / getState() / subscribe(fn)
store.getSettings() / updateSettings(patch)
store.all(name) / getById(name, id) / where(name, field, v) / query(name, pred)
store.byPlayer(name, playerId) / getPlayers() / getPlayer(id)
store.latestMetric(playerId, metricKey[, context])   // newest non-voided
store.lastAssessmentDate(playerId)
store.drillLibrary() / getDrill(id) / drillsByCategory(cat)
store.getSessionLog(id) / sessionLogsForPlayer(pid)  // newest-first
store.setSessionDrills(logId, ids) / setSessionNotes(logId, text)
store.insert(name, data) / append(name, data) / update(name, id, patch) / remove(name, id)
store.deletePlayerCascade(playerId)   // driven by declarative playerFk on the registry;
                                      // RETURNS { player, removed:{collection: rows[]} }
store.playerSnapshot(playerId)        // same shape, read-only (delete preview + player export)
store.stashTrash(snapshot) / peekTrash() / restoreTrash() / clearTrash()
                                      // single-slot 10-min delete-undo (diamondMind.v3.trash,
                                      // OUTSIDE state so exports stay clean)
store.exportAll() / importAll(data) / clearAll()
```

---

## 3. `CT.model` — factories, catalog, age bands (model.js)

- `bandFor(player[, asOf])` — age band is ALWAYS derived from birthdate at read
  time (never stored). `isPitcher(p)` / `isCatcher(p)` — positions are an enum
  array (`model.POSITIONS`); **never** regex-match position text.
- `METRIC_CATALOG` (25 keys) + `ASSESS_MODULES` (hitting/throwing/speed/fielding/body).
- Key factories: `Player, AssessmentSession (modules/moduleNotes), MetricReading
  (source: assessment|session|migrated-quickstat), Game (ipg/final/boxVersion/
  decisions as REAL fields), WorkloadLog (sourceRef {kind:'box'|'session', id}),
  DailyCheckIn (painLevel 0-10 real field; armPain derived ≥3), Drill (category
  enum hitting|throwing|fielding|speed|strength, description, videoUrl,
  equipment[]), Program, ProgramAssignment, SessionLog`.
- `Program` = `{ name, type throwing|hitting|strength|custom, description, weeks,
  daysPerWeek (0 = overlay), days:[{weekIndex, dayIndex, title, items:[
  {id, kind:'drill', drillId, sets|null, reps|null, notes} |
  {id, kind:'step', text}]}], ageBands[], ageGateMin|null, clinicianRequired,
  archived }`.
- `ProgramAssignment` = `{ playerId, programId, startDate,
  daysOfWeek:[0-6]|null (drives the dashboard Today list; null = flexible),
  status active|paused|completed, notes }`. Sessions are **never pre-generated**.
- `SessionLog` (replaces Lesson + ProgramSession) = `{ playerId, date,
  assignmentId|null, programDayRef:{weekIndex,dayIndex}|null,
  itemChecks:{itemId:bool}, extraDrillIds[], notes, rpe|null, throws|null,
  ratingDelta|null }`.
- `validatePlayer(d)` / `validateMetricReading(reading, player)` →
  `{ ok, errors[], warnings[] }` — errors reject, warnings toast.

---

## 4. `CT.programs` — templates, gating, scheduling (programs-data.js)

```js
programs.templates() / byTemplateId(id)      // static starters, NEVER auto-stored
programs.toProgram(template)                 // template -> v3 Program shape
programs.eligibility(programOrTemplate, player)  // { eligible, reason } hard age gates
programs.expectedSessions(program, assignment[, asOf])  // schedule-derived due count
programs.adherenceFor(program, assignment, logs[, asOf]) // { done, due, pct|null } (per-day dedupe)
programs.weekIndexFor(assignment, program[, asOf])       // 0-based, clamped
programs.dayFor(program, weekIndex, dayIndex)  // exact -> week-1 pattern -> days[0]
```

Templates are offered as "Start from template" in the **program builder** and only
persisted when the coach saves. Adherence = logged days vs due count (no stale
pre-generated sessions).

## 5. `CT.sessionLog` — the shared Log-Session modal (views/session-log.js)

```js
CT.sessionLog.open({ playerId, assignmentId?, weekIndex?, dayIndex?, date?, onSaved? })
```

Program mode (assignmentId) shows that day's items as a pre-checked checklist;
ad-hoc mode offers the drill library instead. On throwing-type programs (or any
pitcher ad-hoc) it shows a **throws** field with a live `pitchsmart.evaluate`
readout that **hard-blocks** saving when the arm is red or the count exceeds the
daily max. Saving inserts ONE sessionLog; `throws > 0` auto-appends a workloadLog
tagged `sourceRef {kind:'session', id}` (idempotent — one row per save). Launch
points: Dashboard Today rows, Programs assignment cards, player profile.

## 6. `CT.checkin.open(presetPlayer|null)` — daily check-in modal (views/armsafety.js)

Writes `dailyCheckIns` with a REAL `painLevel` (0-10); `armPain` derives at ≥3 and
feeds the red pain alert + referral messaging. Page at `#/armsafety/checkin`.

## 7. `CT.pitchsmart` / `CT.stats` / `CT.benchmarks` — unchanged pure engines

`pitchsmart.evaluate(player, workloadLogs, {asOf})` → full verdict (status
red|yellow|green, cleared, remainingToday, daysUntilEligible, ACWR, reasons[]).
`stats.*` derives all rates from raw counters. `benchmarks.percentileFor(band,
key, value)` reads the STATIC table (there is no persisted benchmarks collection).

## 8. `CT.alerts.build()` — derived, never stored (views/alerts.js)

Pain (latest check-in ≤21d), Pitch Smart/ACWR, and program adherence
(schedule-derived due vs sessionLogs; <75% yellow, <50% red, min 3 due). Shared by
the header bell, dashboard, and the `#/alerts` page.

## 9. `CT.ui` / `CT.charts` — building blocks

`ui`: toast, openModal(title, html, onMount(modal, close)), confirmDialog, card,
formField, pill/badge/toneStyle(tone), **diamondMeter(pct, {small, label})** (the
app-wide percentile capsule), statTile, emptyState(lucideName, title, msg,
actionHtml), pageHead. `charts`: THEME (static light palette — CSS vars cannot
reach canvas), line (supports `dash:true` datasets for medians), bar, scatter,
make, savantColor(pct), destroyAll (router calls it), hasChart/offlineNote.

## 10. Drag & drop (SortableJS, program builder only)

Library rail lists = `{ group: { name, pull: 'clone', put: false }, sort: false }`;
day cells accept via `onAdd` (new drill from rail, or move between cells) and
reorder via `onEnd` when `from === to`. Mutate the builder DRAFT, then defer the
re-render with `setTimeout(0)` so Sortable finishes its own cleanup. ALWAYS ship a
tap-to-add fallback (select a day, press "Add") — CDN-offline and keyboard users
still get the full feature.

## 11. `CT.io` — export / import (io.js)

Export = `{ app:'diamond-mind', schemaVersion:4, exportedAt, settings,
...collections }`. Import accepts v3, v4, or legacy v2 files (v2 runs
`CT.migrate`) and shows a per-collection record-count confirm before replacing
everything. `CT.io.exportPlayerJSON(playerId)` downloads one player + all their
cascaded rows tagged `{ scope:'player', schemaVersion:4 }` — an escape hatch
offered in the delete-player modal (import-merge of these files is a documented
future path; full import rejects them).

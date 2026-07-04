/* migrate.js — one-way v2 ('coachTracker.v2') -> v3 ('diamondMind.v3') migration.
   Pure data transforms (no DOM). Runs once from store.load() when no v3 blob
   exists but a real (non-demo) v2 blob does; also used by io.js so old
   'coach-tracker' JSON exports import cleanly. The v2 localStorage blob is left
   untouched as a rollback.

   What it converts (spec §3):
   • players.positions: free text -> enum ['P','C','1B',...]; stored ageBand dropped
     (v3 derives the band from birthdate at read time).
   • games: the '#CTGAMEMETA#' JSON notes-trailer -> real fields
     { ipg, final, boxVersion, decisions } and the trailer is stripped.
   • workloadLogs: '[box:<appearanceId>]' idempotence tags inside notes ->
     sourceRef { kind:'box', id } (tag stripped from notes).
   • dailyCheckIns: 'Arm pain reported: N/10.' notes -> painLevel (armPain derives).
   • drills: v2 categories -> v3 enum; defaultNotes -> description.
   • programs: cloned template instances -> single-day v3 programs whose
     checklists become step items; sessionsPerWeek -> daysPerWeek.
   • lessons -> sessionLogs 1:1 (drillIds -> extraDrillIds). Every lesson
     quickStats entry is BACKFILLED into a real metricReading
     (context 'practice', device 'manual', confidence 'low',
     source 'migrated-quickstat') so historical numbers finally reach
     charts / percentiles / tool grades.
   • completed programSessions -> sessionLogs with programDayRef.
   • assessmentSessions: + modules derived from the metric groups they measured.
   • metricReadings: + source ('assessment' when tied to a session).
   • persisted benchmarks collection: DROPPED (reads always went to the static
     CT.benchmarks module anyway).

   v3 -> v4 (schemaVersion 4) needs NO transform here: v4 is a strict superset
   (SessionLog.focus, MetricReading.sessionLogId, Player.readiness,
   Program.source/goalId/generatorMeta, ProgramDay.intensity, new settings).
   The model factories default every new field, so store.load()/importAll
   upgrade v3 blobs losslessly; a v4 export re-imports into a v3 build cleanly
   (unknown fields dropped by that build's factories).
   Exposed on window.CT.migrate. */
(function () {
  'use strict';

  const CT = window.CT;
  const V2_KEY = 'coachTracker.v2';
  const META_TAG = '#CTGAMEMETA#';
  const BOX_TAG_RE = /\s*\[box:([^\]]+)\]\s*/;
  const PAIN_RE = /Arm pain reported:\s*(\d+)\s*\/\s*10/i;

  function arr(x) { return Array.isArray(x) ? x : []; }

  // Detect a v2-shaped payload (localStorage blob OR io.js export file).
  function isV2(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.players)) return false;
    if (data.app === 'coach-tracker') return true;
    if (Number(data.schemaVersion) === 2 || Number(data.schemaVersion) === 1) return true;
    // Heuristic for un-tagged blobs: v2 collections that no longer exist in v3.
    return Array.isArray(data.lessons) || Array.isArray(data.programSessions) || Array.isArray(data.benchmarks);
  }

  // Read (but do not delete) the raw v2 localStorage blob. Returns object|null.
  function readV2() {
    let raw = null;
    try { raw = localStorage.getItem(V2_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && Array.isArray(parsed.players)) ? parsed : null;
    } catch (e) { return null; }
  }

  // ---- per-collection transforms -------------------------------------------
  function migratePlayer(p) {
    const out = Object.assign({}, p);
    out.positions = CT.model.normalizePositions(arr(p.positions));
    delete out.ageBand; // v3: derived from birthdate at read time
    return out;
  }

  function migrateGame(g) {
    const out = Object.assign({}, g);
    const raw = String(g.notes || '');
    const i = raw.indexOf(META_TAG);
    let meta = {};
    if (i >= 0) {
      out.notes = raw.slice(0, i).replace(/\s+$/, '');
      try { meta = JSON.parse(raw.slice(i + META_TAG.length)) || {}; } catch (e) { meta = {}; }
    }
    out.ipg = [6, 7, 9].indexOf(Number(meta.ipg)) >= 0 ? Number(meta.ipg) : null;
    out.final = !!meta.final;
    out.boxVersion = Math.max(1, Number(meta.v) || 1);
    out.decisions = (meta.dec && typeof meta.dec === 'object') ? meta.dec : {};
    return out;
  }

  function migrateWorkloadLog(w) {
    const out = Object.assign({}, w);
    const m = String(w.notes || '').match(BOX_TAG_RE);
    if (m) {
      out.sourceRef = { kind: 'box', id: m[1] };
      out.notes = String(w.notes || '').replace(BOX_TAG_RE, ' ').trim();
    }
    return out;
  }

  function migrateCheckIn(c) {
    const out = Object.assign({}, c);
    const m = String(c.notes || '').match(PAIN_RE);
    if (m) out.painLevel = Number(m[1]);
    else out.painLevel = c.armPain ? 3 : null; // best available back-computation
    return out;
  }

  function migrateDrill(d) {
    const out = Object.assign({}, d);
    out.category = CT.model.DRILL_CATEGORY_MAP[d.category] || d.category || 'hitting';
    out.description = d.defaultNotes || d.description || '';
    delete out.defaultNotes;
    return out;
  }

  // v2 program category -> v3 type.
  const TYPE_MAP = {
    throwing: 'throwing', 'arm-care': 'throwing', 'return-to-play': 'throwing',
    hitting: 'hitting',
    strength: 'strength', mobility: 'strength', speed: 'strength',
    compliance: 'custom', general: 'custom'
  };

  function migrateProgram(p) {
    const items = arr(p.checklist).map(function (text) { return { kind: 'step', text: String(text) }; });
    return {
      id: p.id,
      templateId: p.templateId || null,
      name: p.name,
      type: TYPE_MAP[p.category] || 'custom',
      description: p.description || '',
      weeks: Math.max(1, Number(p.weeks) || 1),
      daysPerWeek: Math.max(0, Number(p.sessionsPerWeek) || 0),
      days: [{ weekIndex: 0, dayIndex: 0, title: 'Session', items: items }],
      ageBands: arr(p.ageBands),
      ageGateMin: p.ageGateMin == null ? null : p.ageGateMin,
      clinicianRequired: !!p.clinicianRequired,
      archived: false,
      createdAt: p.createdAt
    };
  }

  function migrateAssignment(a) {
    return Object.assign({}, a, { daysOfWeek: null });
  }

  // Lesson -> SessionLog (1:1) + quickStats backfill into metricReadings.
  function migrateLesson(l, backfilledReadings) {
    if (l.quickStats && typeof l.quickStats === 'object') {
      Object.keys(l.quickStats).forEach(function (key) {
        const v = Number(l.quickStats[key]);
        const m = CT.model.metric(key);
        if (!m || !Number.isFinite(v)) return;
        backfilledReadings.push({
          playerId: l.playerId,
          assessmentSessionId: null,
          metricKey: key,
          value: v,
          unit: m.unit,
          aggregation: 'max',
          context: 'practice',
          device: 'manual',
          confidence: 'low',
          source: 'migrated-quickstat',
          date: l.date,
          createdAt: l.createdAt
        });
      });
    }
    return {
      id: l.id,
      playerId: l.playerId,
      date: l.date,
      assignmentId: null,
      programDayRef: null,
      itemChecks: {},
      extraDrillIds: arr(l.drillIds),
      notes: l.notes || '',
      rpe: null,
      throws: null,
      ratingDelta: l.ratingDelta == null ? null : l.ratingDelta,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt
    };
  }

  // Completed ProgramSession -> SessionLog (planned-but-skipped ones vanish —
  // v3 never pre-generates sessions, adherence is computed from the schedule).
  function migrateProgramSession(s) {
    let notes = s.notes || '';
    if (s.soreness != null) notes = (notes ? notes + ' ' : '') + 'Soreness ' + s.soreness + '/10.';
    return {
      id: s.id,
      playerId: s.playerId,
      date: s.date,
      assignmentId: s.assignmentId || null,
      programDayRef: { weekIndex: Number(s.weekIndex) || 0, dayIndex: 0 },
      itemChecks: {},
      extraDrillIds: [],
      notes: notes,
      rpe: s.rpe == null ? null : s.rpe,
      throws: null,
      ratingDelta: null,
      createdAt: s.createdAt
    };
  }

  function migrateReading(r) {
    return Object.assign({}, r, { source: r.assessmentSessionId ? 'assessment' : 'session' });
  }

  function migrateAssessmentSession(s, readings) {
    const modules = [];
    readings.forEach(function (r) {
      if (r.assessmentSessionId !== s.id) return;
      const mod = CT.model.moduleForMetric(r.metricKey);
      if (mod && modules.indexOf(mod) < 0) modules.push(mod);
    });
    return Object.assign({}, s, { modules: modules, moduleNotes: {} });
  }

  // ---- main -----------------------------------------------------------------
  // Takes a raw v2 state/export object, returns a raw v3 state object (records
  // are plain data — the store normalizes everything through the v3 factories).
  function fromV2(data) {
    data = data || {};
    const backfilledReadings = [];
    const sessionLogs = []
      .concat(arr(data.lessons).map(function (l) { return migrateLesson(l, backfilledReadings); }))
      .concat(arr(data.programSessions).filter(function (s) { return s.completed; }).map(migrateProgramSession));

    const metricReadings = arr(data.metricReadings).map(migrateReading).concat(backfilledReadings);

    return {
      schemaVersion: 3,
      settings: {},
      teams: arr(data.teams),
      seasons: arr(data.seasons),
      players: arr(data.players).map(migratePlayer),
      anthroReadings: arr(data.anthroReadings),
      assessmentSessions: arr(data.assessmentSessions).map(function (s) {
        return migrateAssessmentSession(s, arr(data.metricReadings));
      }),
      metricReadings: metricReadings,
      games: arr(data.games).map(migrateGame),
      battingStatLines: arr(data.battingStatLines),
      pitchingAppearances: arr(data.pitchingAppearances),
      fieldingStatLines: arr(data.fieldingStatLines),
      workloadLogs: arr(data.workloadLogs).map(migrateWorkloadLog),
      dailyCheckIns: arr(data.dailyCheckIns).map(migrateCheckIn),
      drills: arr(data.drills).map(migrateDrill),
      programs: arr(data.programs).map(migrateProgram),
      programAssignments: arr(data.programAssignments).map(migrateAssignment)
        // benchmarks: intentionally dropped (static CT.benchmarks is the source of truth)
      ,
      sessionLogs: sessionLogs
    };
  }

  window.CT.migrate = {
    V2_KEY: V2_KEY,
    isV2: isV2,
    readV2: readV2,
    fromV2: fromV2
  };
})();

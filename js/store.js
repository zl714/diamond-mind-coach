/* store.js — versioned, immutable localStorage data layer for ALL entities.
   State shape is a set of flat top-level collections keyed by foreign IDs:
   {
     schemaVersion, isSample, updatedAt,
     teams, seasons, players, anthroReadings, assessmentSessions, metricReadings,
     games, battingStatLines, pitchingAppearances, fieldingStatLines,
     workloadLogs, dailyCheckIns, programs, programAssignments, programSessions,
     benchmarks
   }
   Mutations replace state with NEW objects (never mutate). Append-only collections
   (metricReadings, workloadLogs) only ever grow — corrections add a new row.
   Exposed on window.CT.store. */
(function () {
  'use strict';

  const CT = window.CT;
  const KEY = 'coachTracker.v2';
  const SCHEMA_VERSION = 2;

  // collection name -> model factory used to normalize each record on load/insert.
  const COLLECTIONS = {
    teams: 'Team',
    seasons: 'Season',
    players: 'Player',
    anthroReadings: 'AnthroReading',
    assessmentSessions: 'AssessmentSession',
    metricReadings: 'MetricReading',
    games: 'Game',
    battingStatLines: 'BattingStatLine',
    pitchingAppearances: 'PitchingAppearance',
    fieldingStatLines: 'FieldingStatLine',
    workloadLogs: 'WorkloadLog',
    dailyCheckIns: 'DailyCheckIn',
    programs: 'Program',
    programAssignments: 'ProgramAssignment',
    programSessions: 'ProgramSession',
    drills: 'Drill',
    lessons: 'Lesson',
    benchmarks: 'Benchmark'
  };
  const COLLECTION_NAMES = Object.keys(COLLECTIONS);
  // Append-only collections: never edited in place; corrections add a new row.
  const APPEND_ONLY = { metricReadings: true, workloadLogs: true };

  let state = null;
  const listeners = [];

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function factory(name) { return CT.model[COLLECTIONS[name]]; }

  function emptyState() {
    const s = { schemaVersion: SCHEMA_VERSION, isSample: false, updatedAt: new Date().toISOString() };
    COLLECTION_NAMES.forEach(function (n) { s[n] = []; });
    return s;
  }

  // Normalize every record through its model factory (fail-safe defaults).
  function normalize(data) {
    const s = emptyState();
    s.isSample = !!data.isSample;
    s.updatedAt = data.updatedAt || new Date().toISOString();
    COLLECTION_NAMES.forEach(function (name) {
      const fac = factory(name);
      const arr = Array.isArray(data[name]) ? data[name] : [];
      s[name] = arr.map(function (r) { try { return fac(r); } catch (e) { return null; } })
                   .filter(Boolean);
    });
    return s;
  }

  function isValidState(data) {
    if (!data || typeof data !== 'object') return false;
    // v2 must carry a players array; everything else is optional/normalizable.
    return Array.isArray(data.players);
  }

  function persist() {
    try {
      state = Object.assign({}, state, { updatedAt: new Date().toISOString() });
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Coach Tracker: could not persist —', err && err.message);
    }
  }

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }
  function subscribe(fn) { listeners.push(fn); return function () { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

  // Seed the reference benchmarks into state if absent (so the benchmarks
  // collection is queryable like any other entity).
  function withSeededBenchmarks(s) {
    if (s.benchmarks && s.benchmarks.length) return s;
    const rows = (CT.benchmarks && CT.benchmarks.table) ? CT.benchmarks.table() : [];
    return Object.assign({}, s, { benchmarks: rows.map(function (r) { return CT.model.Benchmark(r); }) });
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed)) {
          state = withSeededBenchmarks(normalize(parsed));
          return state;
        }
      } catch (e) {
        console.warn('Coach Tracker: stored data invalid — reseeding demo.');
      }
    }
    // No valid stored data — boot EMPTY (views render designed empty states +
    // first-run onboarding; there is no demo seed anymore).
    state = withSeededBenchmarks(emptyState());
    persist();
    return state;
  }

  function getState() { if (!state) load(); return state; }

  // Any user write clears the sample flag (demo badge disappears).
  function commit(nextCollections, opts) {
    const keepSample = opts && opts.keepSample;
    state = Object.assign({}, state, nextCollections, { isSample: keepSample ? state.isSample : false });
    persist();
    emit();
    return state;
  }

  // ---- generic queries ----
  function all(name) { return getState()[name] ? getState()[name].slice() : []; }
  function getById(name, id) { return (getState()[name] || []).find(function (r) { return r.id === id; }) || null; }
  function where(name, field, value) { return (getState()[name] || []).filter(function (r) { return r[field] === value; }); }
  function query(name, predicate) { return (getState()[name] || []).filter(predicate); }
  function byPlayer(name, playerId) { return where(name, 'playerId', playerId); }

  // ---- generic mutations (immutable) ----
  // insert: normalize through factory, append a NEW record, return it.
  function insert(name, data, opts) {
    const fac = factory(name);
    if (!fac) throw new Error('Unknown collection: ' + name);
    const rec = fac(data);
    const next = {}; next[name] = (getState()[name] || []).concat([rec]);
    commit(next, opts);
    return rec;
  }
  // append: identical to insert, used to make append-only intent explicit.
  function append(name, data, opts) { return insert(name, data, opts); }

  // update: patch a record by id (BLOCKED for append-only collections).
  function update(name, id, patch, opts) {
    if (APPEND_ONLY[name]) throw new Error(name + ' is append-only; add a correcting row instead.');
    const fac = factory(name);
    let updated = null;
    const arr = (getState()[name] || []).map(function (r) {
      if (r.id !== id) return r;
      updated = fac(Object.assign({}, r, patch, { id: r.id, updatedAt: new Date().toISOString() }));
      return updated;
    });
    const next = {}; next[name] = arr;
    commit(next, opts);
    return updated;
  }

  // remove: delete by id. For append-only collections this physically removes the
  // row (used only for hard deletes / undo); prefer voiding via a correction row.
  function remove(name, id, opts) {
    const next = {}; next[name] = (getState()[name] || []).filter(function (r) { return r.id !== id; });
    commit(next, opts);
  }

  // Cascade-delete a player and everything that references them.
  function deletePlayerCascade(playerId) {
    const childCollections = ['anthroReadings', 'assessmentSessions', 'metricReadings',
      'battingStatLines', 'pitchingAppearances', 'fieldingStatLines', 'workloadLogs',
      'dailyCheckIns', 'programAssignments', 'programSessions', 'lessons'];
    const next = { players: (getState().players || []).filter(function (p) { return p.id !== playerId; }) };
    childCollections.forEach(function (c) {
      next[c] = (getState()[c] || []).filter(function (r) { return r.playerId !== playerId; });
    });
    commit(next);
  }

  // ---- convenience: latest metric reading per (player, metric, context) ----
  // Append-only correctness: newest non-voided row wins by date then createdAt.
  function latestMetric(playerId, metricKey, context) {
    const rows = (getState().metricReadings || []).filter(function (r) {
      return r.playerId === playerId && r.metricKey === metricKey && !r.voided &&
        (context == null || r.context === context);
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
    });
    return rows[rows.length - 1];
  }

  // ---- Drill library + Lessons (coaching-session workflow) ----
  // The DrillLibrary is just the `drills` collection. Both drills and lessons use
  // the generic insert/append/update/remove CRUD; these are convenience reads +
  // append-only-friendly writers for the drag-drop board and the notes editor.
  function drillLibrary() {
    return all('drills').sort(function (a, b) {
      if (a.category !== b.category) return a.category < b.category ? -1 : 1;
      return a.name < b.name ? -1 : 1;
    });
  }
  function getDrill(id) { return getById('drills', id); }
  function drillsByCategory(cat) { return where('drills', 'category', cat); }
  function getLesson(id) { return getById('lessons', id); }
  // Newest-first, the order session timelines expect.
  function lessonsForPlayer(playerId) {
    return byPlayer('lessons', playerId).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  // Persist the (re)ordered drill list for a lesson — call from SortableJS onEnd
  // with col.toArray() (an array of data-id strings).
  function setLessonDrills(lessonId, drillIds) {
    return update('lessons', lessonId, { drillIds: Array.isArray(drillIds) ? drillIds.map(String) : [] });
  }
  // Notes are keyed on the STABLE lesson id (never board position) so they follow
  // the lesson regardless of how its drills are dragged/reordered.
  function setLessonNotes(lessonId, body) {
    return update('lessons', lessonId, { notes: body == null ? '' : String(body) });
  }

  function lastAssessmentDate(playerId) {
    const rows = (getState().assessmentSessions || []).filter(function (a) { return a.playerId === playerId; });
    if (!rows.length) return null;
    return rows.map(function (a) { return a.date; }).sort().slice(-1)[0];
  }

  // ---- bulk: export / import / reset ----
  function exportAll() {
    const s = getState();
    const payload = { app: 'coach-tracker', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString() };
    COLLECTION_NAMES.forEach(function (n) { payload[n] = s[n]; });
    return payload;
  }

  function importAll(data, opts) {
    if (!isValidState(data)) throw new Error('Import is missing a "players" array.');
    state = withSeededBenchmarks(normalize(Object.assign({}, data, { isSample: !!(opts && opts.isSample) })));
    persist();
    emit();
    return state;
  }

  function clearAll() {
    state = withSeededBenchmarks(emptyState());
    persist();
    emit();
    return state;
  }

  window.CT.store = {
    KEY: KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    COLLECTION_NAMES: COLLECTION_NAMES,
    APPEND_ONLY: APPEND_ONLY,
    load: load,
    getState: getState,
    subscribe: subscribe,
    // queries
    all: all,
    getById: getById,
    where: where,
    query: query,
    byPlayer: byPlayer,
    getPlayers: function () { return all('players'); },
    getPlayer: function (id) { return getById('players', id); },
    latestMetric: latestMetric,
    lastAssessmentDate: lastAssessmentDate,
    // drill library + lessons (coaching-session workflow)
    drillLibrary: drillLibrary,
    getDrill: getDrill,
    drillsByCategory: drillsByCategory,
    getLesson: getLesson,
    lessonsForPlayer: lessonsForPlayer,
    setLessonDrills: setLessonDrills,
    setLessonNotes: setLessonNotes,
    // mutations
    insert: insert,
    append: append,
    update: update,
    remove: remove,
    deletePlayerCascade: deletePlayerCascade,
    // bulk
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,
    deepClone: deepClone
  };
})();

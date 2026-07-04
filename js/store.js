/* store.js — versioned, immutable localStorage data layer for ALL entities (v3).
   State shape is a set of flat top-level collections keyed by foreign IDs plus a
   `settings` singleton:
   {
     schemaVersion, updatedAt, settings,
     teams, seasons, players, anthroReadings, assessmentSessions, metricReadings,
     games, battingStatLines, pitchingAppearances, fieldingStatLines,
     workloadLogs, dailyCheckIns, drills, programs, programAssignments, sessionLogs
   }
   Mutations replace state with NEW objects (never mutate). Append-only collections
   (metricReadings, workloadLogs) only ever grow — corrections add a new row.
   v3 boots EMPTY; a legacy 'coachTracker.v2' blob is migrated once via CT.migrate
   (the v2 blob is left in localStorage as a rollback). Exposed on window.CT.store. */
(function () {
  'use strict';

  const CT = window.CT;
  const KEY = 'diamondMind.v3';
  const SCHEMA_VERSION = 3;

  // collection name -> { factory, playerFk } . playerFk drives the cascade
  // delete declaratively (no hard-coded child list to forget updating).
  const COLLECTIONS = {
    teams: { factory: 'Team' },
    seasons: { factory: 'Season' },
    players: { factory: 'Player' },
    anthroReadings: { factory: 'AnthroReading', playerFk: 'playerId' },
    assessmentSessions: { factory: 'AssessmentSession', playerFk: 'playerId' },
    metricReadings: { factory: 'MetricReading', playerFk: 'playerId' },
    games: { factory: 'Game' },
    battingStatLines: { factory: 'BattingStatLine', playerFk: 'playerId' },
    pitchingAppearances: { factory: 'PitchingAppearance', playerFk: 'playerId' },
    fieldingStatLines: { factory: 'FieldingStatLine', playerFk: 'playerId' },
    workloadLogs: { factory: 'WorkloadLog', playerFk: 'playerId' },
    dailyCheckIns: { factory: 'DailyCheckIn', playerFk: 'playerId' },
    drills: { factory: 'Drill' },
    programs: { factory: 'Program' },
    programAssignments: { factory: 'ProgramAssignment', playerFk: 'playerId' },
    sessionLogs: { factory: 'SessionLog', playerFk: 'playerId' }
  };
  const COLLECTION_NAMES = Object.keys(COLLECTIONS);
  // Append-only collections: never edited in place; corrections add a new row.
  const APPEND_ONLY = { metricReadings: true, workloadLogs: true };

  let state = null;
  const listeners = [];

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function factory(name) { return CT.model[COLLECTIONS[name].factory]; }

  // Coach/app preferences singleton (NOT a collection).
  function normalizeSettings(d) {
    d = (d && typeof d === 'object') ? d : {};
    const preset = Array.isArray(d.assessPreset) ? d.assessPreset.map(String) : null;
    return {
      orgName: d.orgName == null ? '' : String(d.orgName),
      coachName: d.coachName == null ? '' : String(d.coachName),
      onboarding: { dismissed: !!(d.onboarding && d.onboarding.dismissed) },
      // Last module selection — pre-checks the next assessment's module picker.
      assessPreset: preset && preset.length ? preset : ['hitting', 'throwing', 'speed'],
      speedDefault: (d.speedDefault === 'thirtyYard' || d.speedDefault === 'sixtyYard') ? d.speedDefault : null
    };
  }

  function emptyState() {
    const s = {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      settings: normalizeSettings(null)
    };
    COLLECTION_NAMES.forEach(function (n) { s[n] = []; });
    return s;
  }

  // Normalize every record through its model factory (fail-safe defaults).
  function normalize(data) {
    const s = emptyState();
    s.updatedAt = data.updatedAt || new Date().toISOString();
    s.settings = normalizeSettings(data.settings);
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
    // must carry a players array; everything else is optional/normalizable.
    return Array.isArray(data.players);
  }

  function persist() {
    try {
      state = Object.assign({}, state, { updatedAt: new Date().toISOString() });
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Diamond Mind: could not persist —', err && err.message);
      // Surface silently-failing writes to the coach (quota, private mode, ...).
      try { if (CT.ui && CT.ui.toast) CT.ui.toast('Warning: data could not be saved (storage full?)'); } catch (e) {}
    }
  }

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }
  function subscribe(fn) { listeners.push(fn); return function () { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

  function load() {
    // 1) v3 blob present -> load it.
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (raw) {
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      if (parsed && isValidState(parsed)) {
        state = normalize(parsed);
        return state;
      }
      // Corrupt/invalid v3 blob (interrupted write, quota, ...): stash the raw
      // bytes BEFORE persist() overwrites them so the data stays recoverable,
      // and boot empty rather than re-migrating the old v2 snapshot OVER the
      // (newer) v3 work the corrupt blob represents.
      try { localStorage.setItem(KEY + '.corrupt', raw); } catch (e) {}
      console.warn('Diamond Mind: stored v3 data invalid — raw blob stashed at ' +
        KEY + '.corrupt; booting empty.');
      state = emptyState();
      persist();
      return state;
    }
    // 2) No v3 — migrate a real (non-demo) coachTracker.v2 blob once.
    if (CT.migrate) {
      const v2 = CT.migrate.readV2();
      if (v2 && !v2.isSample) {
        try {
          state = normalize(CT.migrate.fromV2(v2));
          persist(); // v2 blob is left untouched as a rollback
          console.info('Diamond Mind: migrated coachTracker.v2 -> diamondMind.v3 (' +
            (state.players || []).length + ' players).');
          return state;
        } catch (e) {
          console.warn('Diamond Mind: v2 migration failed — booting empty.', e);
        }
      }
    }
    // 3) Empty boot (designed empty states + first-run onboarding).
    state = emptyState();
    persist();
    return state;
  }

  function getState() { if (!state) load(); return state; }

  function commit(nextCollections) {
    state = Object.assign({}, state, nextCollections);
    persist();
    emit();
    return state;
  }

  // ---- settings singleton ----
  function getSettings() { return Object.assign({}, getState().settings); }
  function updateSettings(patch) {
    const next = normalizeSettings(Object.assign({}, getState().settings, patch || {}));
    commit({ settings: next });
    return next;
  }

  // ---- generic queries ----
  function all(name) { return getState()[name] ? getState()[name].slice() : []; }
  function getById(name, id) { return (getState()[name] || []).find(function (r) { return r.id === id; }) || null; }
  function where(name, field, value) { return (getState()[name] || []).filter(function (r) { return r[field] === value; }); }
  function query(name, predicate) { return (getState()[name] || []).filter(predicate); }
  function byPlayer(name, playerId) { return where(name, 'playerId', playerId); }

  // ---- generic mutations (immutable) ----
  // insert: normalize through factory, append a NEW record, return it.
  function insert(name, data) {
    if (!COLLECTIONS[name]) throw new Error('Unknown collection: ' + name);
    const rec = factory(name)(data);
    const next = {}; next[name] = (getState()[name] || []).concat([rec]);
    commit(next);
    return rec;
  }
  // append: identical to insert, used to make append-only intent explicit.
  function append(name, data) { return insert(name, data); }

  // update: patch a record by id (BLOCKED for append-only collections).
  function update(name, id, patch) {
    if (APPEND_ONLY[name]) throw new Error(name + ' is append-only; add a correcting row instead.');
    const fac = factory(name);
    let updated = null;
    const arr = (getState()[name] || []).map(function (r) {
      if (r.id !== id) return r;
      updated = fac(Object.assign({}, r, patch, { id: r.id, updatedAt: new Date().toISOString() }));
      return updated;
    });
    const next = {}; next[name] = arr;
    commit(next);
    return updated;
  }

  // remove: delete by id. For append-only collections this physically removes the
  // row (used only for hard deletes / undo); prefer voiding via a correction row.
  function remove(name, id) {
    const next = {}; next[name] = (getState()[name] || []).filter(function (r) { return r.id !== id; });
    commit(next);
  }

  // Cascade-delete a player and everything that references them (driven by the
  // declarative playerFk field on the collection registry).
  function deletePlayerCascade(playerId) {
    const next = { players: (getState().players || []).filter(function (p) { return p.id !== playerId; }) };
    COLLECTION_NAMES.forEach(function (name) {
      const fk = COLLECTIONS[name].playerFk;
      if (!fk) return;
      next[name] = (getState()[name] || []).filter(function (r) { return r[fk] !== playerId; });
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

  // ---- Drill library + SessionLogs (coaching-session workflow) ----
  function drillLibrary() {
    return all('drills').sort(function (a, b) {
      if (a.category !== b.category) return a.category < b.category ? -1 : 1;
      return a.name < b.name ? -1 : 1;
    });
  }
  function getDrill(id) { return getById('drills', id); }
  function drillsByCategory(cat) { return where('drills', 'category', cat); }
  function getSessionLog(id) { return getById('sessionLogs', id); }
  // Newest-first, the order session timelines expect.
  function sessionLogsForPlayer(playerId) {
    return byPlayer('sessionLogs', playerId).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  // Persist the (re)ordered drill list for a session — call from SortableJS onEnd
  // with col.toArray() (an array of data-id strings).
  function setSessionDrills(sessionLogId, drillIds) {
    return update('sessionLogs', sessionLogId, { extraDrillIds: Array.isArray(drillIds) ? drillIds.map(String) : [] });
  }
  // Notes are keyed on the STABLE sessionLog id (never board position).
  function setSessionNotes(sessionLogId, body) {
    return update('sessionLogs', sessionLogId, { notes: body == null ? '' : String(body) });
  }

  function lastAssessmentDate(playerId) {
    const rows = (getState().assessmentSessions || []).filter(function (a) { return a.playerId === playerId; });
    if (!rows.length) return null;
    return rows.map(function (a) { return a.date; }).sort().slice(-1)[0];
  }

  // ---- bulk: export / import / reset ----
  function exportAll() {
    const s = getState();
    const payload = {
      app: 'diamond-mind',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings: s.settings
    };
    COLLECTION_NAMES.forEach(function (n) { payload[n] = s[n]; });
    return payload;
  }

  // Accepts v3 payloads directly; v2 payloads must be run through
  // CT.migrate.fromV2 first (io.js does this).
  function importAll(data) {
    if (!isValidState(data)) throw new Error('Import is missing a "players" array.');
    state = normalize(data);
    persist();
    emit();
    return state;
  }

  function clearAll() {
    state = emptyState();
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
    // settings
    getSettings: getSettings,
    updateSettings: updateSettings,
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
    // drill library + session logs (coaching-session workflow)
    drillLibrary: drillLibrary,
    getDrill: getDrill,
    drillsByCategory: drillsByCategory,
    getSessionLog: getSessionLog,
    sessionLogsForPlayer: sessionLogsForPlayer,
    setSessionDrills: setSessionDrills,
    setSessionNotes: setSessionNotes,
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

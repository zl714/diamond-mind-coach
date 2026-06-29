/* storage.js — the data layer (repository pattern over localStorage).
   Data model: { version, isSample, updatedAt, players: [ { ..., sessions: [...] } ] }
   All mutations return NEW objects (immutable style) and re-persist. */
(function () {
  'use strict';

  const CT = window.CT;
  const KEY = CT.STORAGE_KEY;

  // In-memory cache of the current state. Treated as immutable; we replace it.
  let state = null;
  let usingSample = false;

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function emptyState() {
    return { version: CT.SCHEMA_VERSION, isSample: false, updatedAt: new Date().toISOString(), players: [] };
  }

  // ---- validation: never trust stored/imported data ----
  function isValidState(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.players)) return false;
    return data.players.every(function (p) {
      return p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.sessions);
    });
  }

  function normalize(data) {
    const clean = {
      version: CT.SCHEMA_VERSION,
      isSample: !!data.isSample,
      updatedAt: data.updatedAt || new Date().toISOString(),
      players: (data.players || []).map(function (p) {
        return {
          id: String(p.id),
          name: String(p.name || 'Unnamed'),
          level: String(p.level || ''),
          position: String(p.position || ''),
          notes: String(p.notes || ''),
          createdAt: p.createdAt || new Date().toISOString().slice(0, 10),
          sessions: (Array.isArray(p.sessions) ? p.sessions : []).map(function (s) {
            return {
              id: String(s.id || CT.uid('s')),
              date: String(s.date || CT.todayISO()),
              focus: String(s.focus || 'Hitting'),
              drills: String(s.drills || ''),
              notes: String(s.notes || ''),
              metrics: (s.metrics && typeof s.metrics === 'object') ? s.metrics : {}
            };
          })
        };
      })
    };
    return clean;
  }

  function persist() {
    try {
      state = Object.assign({}, state, { updatedAt: new Date().toISOString() });
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      // localStorage may be unavailable (private mode / quota). App keeps working in-memory.
      console.warn('Coach Tracker: could not persist to localStorage —', err && err.message);
    }
  }

  // ---- load: localStorage -> else sample data fallback ----
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed)) {
          state = normalize(parsed);
          usingSample = !!state.isSample;
          return state;
        }
      } catch (e) {
        console.warn('Coach Tracker: stored data was invalid, falling back to sample.');
      }
    }

    // No valid stored data — seed with clearly-labeled sample data so the UI is never blank.
    state = normalize(CT.buildSampleData());
    usingSample = true;
    persist();
    return state;
  }

  function getState() {
    if (!state) load();
    return state;
  }

  function isUsingSample() {
    return !!(state && state.isSample);
  }

  // ---- players CRUD (immutable) ----
  function getPlayers() { return getState().players.slice(); }

  function getPlayer(id) {
    return getState().players.find(function (p) { return p.id === id; }) || null;
  }

  // Any user write clears the "sample" flag so the demo badge disappears.
  function markUserData(next) {
    return Object.assign({}, next, { isSample: false });
  }

  function addPlayer(data) {
    const player = {
      id: CT.uid('p'),
      name: data.name,
      level: data.level || '',
      position: data.position || '',
      notes: data.notes || '',
      createdAt: CT.todayISO(),
      sessions: []
    };
    state = markUserData(Object.assign({}, state, {
      players: getState().players.concat([player])
    }));
    usingSample = false;
    persist();
    return player;
  }

  function updatePlayer(id, data) {
    state = markUserData(Object.assign({}, state, {
      players: getState().players.map(function (p) {
        if (p.id !== id) return p;
        return Object.assign({}, p, {
          name: data.name,
          level: data.level || '',
          position: data.position || '',
          notes: data.notes || ''
        });
      })
    }));
    usingSample = false;
    persist();
    return getPlayer(id);
  }

  function deletePlayer(id) {
    state = markUserData(Object.assign({}, state, {
      players: getState().players.filter(function (p) { return p.id !== id; })
    }));
    usingSample = false;
    persist();
  }

  // ---- sessions CRUD (immutable, nested under player) ----
  function addSession(playerId, data) {
    const session = {
      id: CT.uid('s'),
      date: data.date || CT.todayISO(),
      focus: data.focus || 'Hitting',
      drills: data.drills || '',
      notes: data.notes || '',
      metrics: data.metrics || {}
    };
    state = markUserData(Object.assign({}, state, {
      players: getState().players.map(function (p) {
        if (p.id !== playerId) return p;
        return Object.assign({}, p, { sessions: p.sessions.concat([session]) });
      })
    }));
    usingSample = false;
    persist();
    return session;
  }

  function updateSession(playerId, sessionId, data) {
    state = markUserData(Object.assign({}, state, {
      players: getState().players.map(function (p) {
        if (p.id !== playerId) return p;
        return Object.assign({}, p, {
          sessions: p.sessions.map(function (s) {
            if (s.id !== sessionId) return s;
            return Object.assign({}, s, {
              date: data.date || s.date,
              focus: data.focus || s.focus,
              drills: data.drills != null ? data.drills : s.drills,
              notes: data.notes != null ? data.notes : s.notes,
              metrics: data.metrics || {}
            });
          })
        });
      })
    }));
    usingSample = false;
    persist();
  }

  function deleteSession(playerId, sessionId) {
    state = markUserData(Object.assign({}, state, {
      players: getState().players.map(function (p) {
        if (p.id !== playerId) return p;
        return Object.assign({}, p, {
          sessions: p.sessions.filter(function (s) { return s.id !== sessionId; })
        });
      })
    }));
    usingSample = false;
    persist();
  }

  // ---- bulk ops: import / reset ----
  function replaceAll(data, opts) {
    const isSample = !!(opts && opts.isSample);
    state = normalize(Object.assign({}, data, { isSample: isSample }));
    usingSample = isSample;
    persist();
    return state;
  }

  function resetToSample() {
    state = normalize(CT.buildSampleData());
    usingSample = true;
    persist();
    return state;
  }

  // ---- derived stats ----
  function totalSessions() {
    return getState().players.reduce(function (sum, p) { return sum + p.sessions.length; }, 0);
  }

  function lastSessionDate(player) {
    if (!player.sessions.length) return null;
    return player.sessions
      .map(function (s) { return s.date; })
      .sort()
      .slice(-1)[0];
  }

  function mostRecentActivity() {
    let latest = null;
    getState().players.forEach(function (p) {
      const d = lastSessionDate(p);
      if (d && (!latest || d > latest)) latest = d;
    });
    return latest;
  }

  window.CT.store = {
    load: load,
    getState: getState,
    isUsingSample: isUsingSample,
    getPlayers: getPlayers,
    getPlayer: getPlayer,
    addPlayer: addPlayer,
    updatePlayer: updatePlayer,
    deletePlayer: deletePlayer,
    addSession: addSession,
    updateSession: updateSession,
    deleteSession: deleteSession,
    replaceAll: replaceAll,
    resetToSample: resetToSample,
    totalSessions: totalSessions,
    lastSessionDate: lastSessionDate,
    mostRecentActivity: mostRecentActivity,
    deepClone: deepClone
  };
})();

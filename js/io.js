/* io.js — JSON export & import of ALL data (every collection), so a coach's data
   is portable across devices and never trapped in one browser.
   v4: exports app:'diamond-mind' schemaVersion 4 (a strict superset of v3 — v3
   files import unchanged; factories default the new fields). Import accepts v3,
   v4, and legacy v2 'coach-tracker' exports (run through CT.migrate.fromV2), and
   shows a per-collection record-count confirm before replacing everything.
   exportPlayerJSON(playerId) downloads ONE player + all their cascaded rows
   (scope:'player') — the pre-delete escape hatch. */
(function () {
  'use strict';

  const CT = window.CT;

  function downloadJSON(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const payload = CT.store.exportAll();
    downloadJSON(payload, 'diamond-mind-' + CT.todayISO() + '.json');
    CT.ui.toast('Exported ' + CT.plural(payload.players ? payload.players.length : 0, 'player') + ' + all data');
  }

  // Single-player export: the player row + every row that cascades with them
  // (assessments, readings, session logs, workload, check-ins, anthro, stat
  // lines, assignments). Games are NOT included (team records). Import-merge of
  // these files is a documented future path; today they are an escape hatch.
  function exportPlayerJSON(playerId) {
    const snap = CT.store.playerSnapshot(playerId);
    if (!snap) { CT.ui.toast('Player not found.'); return; }
    const payload = Object.assign({
      app: 'diamond-mind',
      scope: 'player',
      schemaVersion: CT.store.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      player: snap.player
    }, snap.removed);
    const slug = String(snap.player.name || 'player').trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'player';
    downloadJSON(payload, 'diamond-mind-player-' + slug + '-' + CT.todayISO() + '.json');
    CT.ui.toast('Exported ' + snap.player.name + '’s data');
  }

  // Human labels for the count-confirm summary (only non-empty collections shown).
  const COUNT_LABELS = {
    players: 'players', assessmentSessions: 'assessments', metricReadings: 'readings',
    games: 'games', battingStatLines: 'batting lines', pitchingAppearances: 'pitching outings',
    fieldingStatLines: 'fielding lines', workloadLogs: 'workload logs',
    dailyCheckIns: 'check-ins', drills: 'drills', programs: 'programs',
    programAssignments: 'assignments', sessionLogs: 'session logs', anthroReadings: 'growth readings'
  };

  function countSummary(data) {
    const rows = [];
    Object.keys(COUNT_LABELS).forEach(function (k) {
      const n = Array.isArray(data[k]) ? data[k].length : 0;
      if (n > 0) rows.push('<div class="kv-row"><span class="k">' + CT.escapeHtml(COUNT_LABELS[k]) + '</span><span class="v num">' + n + '</span></div>');
    });
    return rows.length ? rows.join('') : '<p class="muted">No records found in this file.</p>';
  }

  // Validate + (if needed) migrate a parsed import payload. Throws on bad files.
  function prepareImport(data) {
    if (!data || typeof data !== 'object') throw new Error('Not a Diamond Mind export.');
    if (CT.migrate && CT.migrate.isV2(data)) {
      return { data: CT.migrate.fromV2(data), from: 'v2' };
    }
    if (data.scope === 'player') {
      throw new Error('That is a single-player export — full imports need an all-data file.');
    }
    if (!Array.isArray(data.players)) throw new Error('Import is missing a "players" array.');
    if (data.app && data.app !== 'diamond-mind') throw new Error('Unrecognized app "' + data.app + '".');
    // v4 is a strict superset of v3 — accept both (v3 files gain the new fields
    // via factory defaults on importAll/normalize).
    if (data.schemaVersion != null && [3, 4].indexOf(Number(data.schemaVersion)) < 0) {
      throw new Error('Unsupported schema version ' + data.schemaVersion + '.');
    }
    return { data: data, from: 'v' + (data.schemaVersion || 3) };
  }

  // Reads a file, validates/migrates, confirms counts, replaces ALL data, runs onDone.
  function importJSON(onDone) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        let prepared;
        try {
          prepared = prepareImport(JSON.parse(String(reader.result)));
        } catch (err) {
          CT.ui.toast('Import failed: ' + (err && err.message ? err.message : 'invalid file'));
          return;
        }
        const note = prepared.from === 'v2'
          ? '<p class="muted" style="font-size:.85rem;">Legacy Coach Tracker (v2) file detected — it will be upgraded on import.</p>' : '';
        CT.ui.openModal('Import data',
          '<p>This <strong>replaces everything</strong> currently in Diamond Mind with the file contents:</p>' +
          note +
          '<div class="io-counts" style="margin:.6rem 0;">' + countSummary(prepared.data) + '</div>' +
          '<p class="muted" style="font-size:.85rem;">Export a backup first if you want one.</p>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
            '<button class="btn btn-primary" data-act="ok">Replace &amp; import</button>' +
          '</div>',
          function (modal, close) {
            modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
            modal.querySelector('[data-act="ok"]').addEventListener('click', function () {
              try {
                CT.store.importAll(prepared.data);
                close();
                CT.ui.toast('Imported ' + CT.plural(prepared.data.players ? prepared.data.players.length : 0, 'player'));
                if (typeof onDone === 'function') onDone();
              } catch (err) {
                CT.ui.toast('Import failed: ' + (err && err.message ? err.message : 'invalid file'));
              }
            });
          });
      };
      reader.onerror = function () { CT.ui.toast('Could not read file'); };
      reader.readAsText(file);
    });
    input.click();
  }

  window.CT.io = { exportJSON: exportJSON, exportPlayerJSON: exportPlayerJSON, importJSON: importJSON };
})();

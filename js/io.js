/* io.js — JSON export & import of ALL data (every collection), so a coach's data
   is portable across devices and never trapped in one browser.
   v3: exports app:'diamond-mind' schemaVersion 3. Import accepts BOTH v3 files and
   legacy v2 'coach-tracker' exports (run through CT.migrate.fromV2), and shows a
   per-collection record-count confirm before replacing everything. */
(function () {
  'use strict';

  const CT = window.CT;

  function exportJSON() {
    const payload = CT.store.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diamond-mind-' + CT.todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    CT.ui.toast('Exported ' + (payload.players ? payload.players.length : 0) + ' player(s) + all data');
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
    if (!Array.isArray(data.players)) throw new Error('Import is missing a "players" array.');
    if (data.app && data.app !== 'diamond-mind') throw new Error('Unrecognized app "' + data.app + '".');
    if (data.schemaVersion != null && Number(data.schemaVersion) !== CT.store.SCHEMA_VERSION) {
      throw new Error('Unsupported schema version ' + data.schemaVersion + '.');
    }
    return { data: data, from: 'v3' };
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
                CT.ui.toast('Imported ' + (prepared.data.players ? prepared.data.players.length : 0) + ' player(s)');
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

  window.CT.io = { exportJSON: exportJSON, importJSON: importJSON };
})();

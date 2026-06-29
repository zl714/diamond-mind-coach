/* io.js — JSON export & import so data isn't trapped in one browser/device. */
(function () {
  'use strict';

  const CT = window.CT;

  function exportJSON() {
    const state = CT.store.getState();
    const payload = {
      app: 'coach-tracker',
      version: CT.SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      players: state.players
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coach-tracker-' + CT.todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    CT.ui.toast('Exported ' + state.players.length + ' player(s)');
  }

  // Triggers a hidden file input, parses + validates, then replaces all data.
  function importJSON(onDone) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(String(reader.result));
          if (!data || !Array.isArray(data.players)) {
            throw new Error('Missing "players" array');
          }
          CT.store.replaceAll({ players: data.players }, { isSample: false });
          CT.ui.toast('Imported ' + data.players.length + ' player(s)');
          if (typeof onDone === 'function') onDone();
        } catch (err) {
          CT.ui.toast('Import failed: ' + (err && err.message ? err.message : 'invalid file'));
        }
      };
      reader.onerror = function () { CT.ui.toast('Could not read file'); };
      reader.readAsText(file);
    });
    input.click();
  }

  window.CT.io = { exportJSON: exportJSON, importJSON: importJSON };
})();

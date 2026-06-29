/* io.js — JSON export & import of ALL data (every collection), so a coach's data
   is portable across devices and never trapped in one browser. */
(function () {
  'use strict';

  const CT = window.CT;

  function exportJSON() {
    const payload = CT.store.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coach-tracker-' + CT.todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    CT.ui.toast('Exported ' + (payload.players ? payload.players.length : 0) + ' player(s) + all data');
  }

  // Reads a file, validates, replaces ALL data, then runs onDone.
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
          CT.store.importAll(data, { isSample: false });
          CT.ui.toast('Imported ' + (data.players ? data.players.length : 0) + ' player(s)');
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

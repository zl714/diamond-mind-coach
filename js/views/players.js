/* views/players.js — PLAYERS (roster). Decluttered flat cards: one calm surface
   per player, NO nested stat tiles. The whole card is a link to that player's
   profile (#/player/<id>). Right-side status cluster carries the only two things a
   coach scans for at a glance: Pitch-Smart clearance + an "Assess due" flag when the
   last assessment is stale. Height/weight are a single whisper-quiet line. Edit /
   Delete live on the player profile, not here.
   Page actions: New assessment + Add player. The add/edit form and cascade-delete
   are exposed on CT.playersUI so the profile can reuse them.
   Registers via CT.registerView('players', { label:'Players', render }). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;

  const ASSESS_STALE_DAYS = 21; // last assessment older than this = "Assess due"

  // ----- helpers -----
  function latestAnthro(playerId) {
    const rows = store.byPlayer('anthroReadings', playerId);
    if (!rows.length) return null;
    return rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-1)[0];
  }
  function isPitcher(p) { return model.isPitcher(p); }

  // v3: positions are already the short enum codes ('P', 'SS', 'CF', ...).
  function positionsShort(p) {
    const list = p.positions || [];
    return list.length ? list.slice(0, 3).join('/') : '—';
  }

  function heightStr(inches) {
    if (inches == null) return null;
    return Math.floor(inches / 12) + "'" + Math.round(inches % 12) + '"';
  }

  // Recent pain flag (same recency rule as the dashboard hero roll-up) so the
  // roster never contradicts the "players need attention" summary at a glance.
  function painPill(player) {
    const rows = store.byPlayer('dailyCheckIns', player.id);
    if (!rows.length) return '';
    const c = rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-1)[0];
    if (!c || !c.armPain || CT.daysAgo(c.date) > ASSESS_STALE_DAYS) return '';
    const label = 'Pain' + (c.painLevel != null ? ' ' + c.painLevel + '/10' : '');
    return '<span class="badge pcard-pill" style="' + ui.toneStyle('red') + '">' +
      '<i data-lucide="alert-octagon"></i>' + esc(label) + '</span>';
  }

  // Pitch-Smart clearance as a color+glyph+text pill (never color alone).
  // Non-pitchers with no workload get nothing (no lone dash) — the status
  // cluster then holds only pills that mean something (pain / assess due).
  function clearancePill(player) {
    const logs = store.byPlayer('workloadLogs', player.id);
    if (!isPitcher(player) && !logs.length) {
      return '';
    }
    const v = CT.pitchsmart.evaluate(player, logs);
    let tone, icon, label;
    if (v.status === 'red') {
      tone = 'red'; icon = 'x-circle';
      label = v.daysUntilEligible > 0 ? 'Resting ' + v.daysUntilEligible + 'd' : 'Not cleared';
    } else if (v.status === 'yellow') {
      tone = 'yellow'; icon = 'alert-triangle'; label = 'Caution';
    } else {
      tone = 'green'; icon = 'check-circle'; label = 'Cleared';
    }
    return '<span class="badge pcard-pill" style="' + ui.toneStyle(tone) + '">' +
      '<i data-lucide="' + icon + '"></i>' + esc(label) + '</span>';
  }

  // Amber "Assess due" badge when the newest assessment is stale (or never logged).
  function assessBadge(player) {
    const last = store.lastAssessmentDate(player.id);
    const days = last ? CT.daysAgo(last) : null;
    if (last && days <= ASSESS_STALE_DAYS) return '';
    const label = last ? 'Assess due' : 'No assessment';
    return '<span class="badge pcard-pill" style="' + ui.toneStyle('warn') + '">' +
      '<i data-lucide="clock"></i>' + esc(label) + '</span>';
  }

  function playerCard(p) {
    const age = model.ageFromBirthdate(p.birthdate);
    const band = model.bandFor(p) || '—';
    const anthro = latestAnthro(p.id);
    const ht = anthro ? heightStr(anthro.heightIn) : null;
    const wt = anthro && anthro.weightLb != null ? anthro.weightLb + ' lb' : null;
    const whisper = [ht, wt].filter(Boolean).join(' · ');

    const meta = esc(band) + (age != null ? ' · ' + age + 'y' : '') +
      ' · ' + esc(positionsShort(p)) +
      ' · ' + esc((p.bats || '?') + '/' + (p.throws || '?')) +
      (p.jersey ? ' · #' + esc(p.jersey) : '');

    return '<a class="pcard card clickable" href="#/player/' + esc(p.id) + '">' +
      '<div class="pcard-lead">' +
        '<div class="avatar">' + esc(CT.initials(p.name)) + '</div>' +
        '<div class="pcard-main">' +
          '<div class="pcard-name">' + esc(p.name) + '</div>' +
          '<div class="pcard-meta">' + meta + '</div>' +
          (whisper ? '<div class="pcard-whisper num">' + esc(whisper) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="pcard-status">' + painPill(p) + clearancePill(p) + assessBadge(p) + '</div>' +
    '</a>';
  }

  // ----- add/edit form (exposed on CT.playersUI for the profile to reuse) -----
  function openForm(existing) {
    const p = existing || {};
    const anthro = existing ? latestAnthro(p.id) : null;
    const html =
      ui.formField({ type: 'text', name: 'name', label: 'Name', value: p.name, required: true, placeholder: 'Full name' }) +
      '<div class="field-row">' +
        ui.formField({ type: 'date', name: 'birthdate', label: 'Birthdate', value: p.birthdate, required: true }) +
        ui.formField({ type: 'select', name: 'level', label: 'Level', value: p.level || 'youth',
          options: model.LEVELS.map(function (l) { return { value: l, label: model.LEVEL_LABELS[l] || l }; }) }) +
      '</div>' +
      '<div class="field-row">' +
        ui.formField({ type: 'select', name: 'bats', label: 'Bats', value: p.bats || 'R',
          options: [{ value: 'R', label: 'Right' }, { value: 'L', label: 'Left' }, { value: 'S', label: 'Switch' }] }) +
        ui.formField({ type: 'select', name: 'throws', label: 'Throws', value: p.throws || 'R',
          options: [{ value: 'R', label: 'Right' }, { value: 'L', label: 'Left' }] }) +
      '</div>' +
      '<div class="field"><label>Positions</label>' +
        '<div class="pos-grid">' +
          model.POSITIONS.map(function (code) {
            const on = (p.positions || []).indexOf(code) >= 0;
            return '<label class="pos-chip' + (on ? ' checked' : '') + '">' +
              '<input type="checkbox" data-pos="' + code + '"' + (on ? ' checked' : '') + ' />' +
              '<span class="pos-code">' + code + '</span>' +
              '<span class="pos-name">' + esc(model.POSITION_LABELS[code] || code) + '</span>' +
            '</label>';
          }).join('') +
        '</div>' +
        '<div class="help">Pitcher (P) drives Pitch Smart tracking; Catcher (C) unlocks pop-time.</div>' +
      '</div>' +
      ui.formField({ type: 'text', name: 'jersey', label: 'Jersey #', value: p.jersey, placeholder: 'Optional' }) +
      '<div class="field-row">' +
        ui.formField({ type: 'number', name: 'heightIn', label: 'Height (in)', value: anthro && anthro.heightIn != null ? anthro.heightIn : '', min: 40, max: 84, step: 0.5, help: 'Adds a dated reading.' }) +
        ui.formField({ type: 'number', name: 'weightLb', label: 'Weight (lb)', value: anthro && anthro.weightLb != null ? anthro.weightLb : '', min: 50, max: 320, step: 1 }) +
      '</div>' +
      ui.formField({ type: 'textarea', name: 'notes', label: 'Notes', value: p.notes }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save">' + (existing ? 'Save changes' : 'Add player') + '</button>' +
      '</div>';

    ui.openModal(existing ? 'Edit player' : 'Add player', html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      // Position chips: reflect the checked state visually.
      modal.querySelectorAll('[data-pos]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          const chip = cb.closest('.pos-chip');
          if (chip) chip.classList.toggle('checked', cb.checked);
        });
      });
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const get = function (n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
        const positions = Array.prototype.slice.call(modal.querySelectorAll('[data-pos]:checked'))
          .map(function (cb) { return cb.getAttribute('data-pos'); });
        const data = {
          name: get('name'),
          birthdate: get('birthdate'),
          level: get('level'),
          bats: get('bats'),
          throws: get('throws'),
          positions: positions,
          jersey: get('jersey'),
          notes: get('notes')
        };
        const v = model.validatePlayer(data);
        if (!v.ok) { ui.toast(v.errors[0]); return; }
        v.warnings.forEach(function (w) { ui.toast(w); });

        let saved;
        if (existing) saved = store.update('players', p.id, data);
        else saved = store.insert('players', data);

        const h = get('heightIn'), w = get('weightLb');
        if (h || w) {
          const prev = existing ? latestAnthro(p.id) : null;
          const changed = !prev || String(prev.heightIn) !== h || String(prev.weightLb) !== w;
          if (changed) {
            store.append('anthroReadings', {
              playerId: saved.id,
              date: CT.todayISO(),
              heightIn: h ? Number(h) : null,
              weightLb: w ? Number(w) : null
            });
          }
        }
        close();
        ui.toast(existing ? 'Player updated' : 'Player added');
        CT.router.route();
      });
    });
  }

  // ----- guarded cascade-delete (v4): inventory + export + typed guard + undo -----
  // Human labels for the cascade inventory, in the order a coach thinks in.
  const DELETE_INV = [
    ['assessmentSessions', 'Assessments'],
    ['metricReadings', 'Metric readings'],
    ['sessionLogs', 'Lessons & sessions'],
    ['workloadLogs', 'Workload logs'],
    ['dailyCheckIns', 'Check-ins'],
    ['anthroReadings', 'Growth readings'],
    ['programAssignments', 'Program assignments'],
    ['programs', 'Generated programs (built for this player)'],
    ['battingStatLines', 'Batting lines'],
    ['pitchingAppearances', 'Pitching outings'],
    ['fieldingStatLines', 'Fielding lines']
  ];

  function deleteInventoryHtml(snapshot) {
    const rows = DELETE_INV.map(function (pair) {
      const n = (snapshot.removed[pair[0]] || []).length;
      if (!n) return '';
      return '<div class="kv-row"><span class="k">' + esc(pair[1]) + '</span><span class="v num">' + n + '</span></div>';
    }).join('');
    return rows || '<p class="muted" style="margin:0;">No logged data yet — just the player record.</p>';
  }

  // Undo toast + navigate back to the restored profile.
  function offerUndo(playerName) {
    ui.toast(playerName + ' deleted — ', {
      label: 'UNDO',
      duration: 8000,
      onClick: function () {
        const restored = store.restoreTrash();
        if (restored) {
          ui.toast('Restored ' + restored.name);
          CT.router.navigate('#/player/' + restored.id);
        } else {
          ui.toast('Undo window expired.');
        }
      }
    });
  }

  // Cascade-delete confirm. onDone lets the profile route back to the list.
  // v4: guarded modal — live cascade counts, export-first escape hatch, a
  // type-the-name guard, and a 10-minute undo window (store trash slot).
  function confirmDelete(player, onDone) {
    if (!player) return;
    const snapshot = store.playerSnapshot(player.id);
    if (!snapshot) return;

    const html =
      '<p style="margin-top:0;">Deleting <strong>' + esc(player.name) + '</strong> removes:</p>' +
      '<div class="del-inv">' + deleteInventoryHtml(snapshot) + '</div>' +
      '<p class="muted" style="font-size:var(--fs-data);">Games stay (team records); only this player’s stat lines are removed. Alerts recompute automatically. You’ll have a 10-minute undo window.</p>' +
      '<div class="row" style="margin-bottom:var(--sp-4);">' +
        '<button class="btn btn-sm" data-act="export"><i data-lucide="download"></i>Download this player’s data (JSON)</button>' +
      '</div>' +
      ui.formField({ type: 'text', name: 'confirm-name', label: 'Type the player’s name to confirm', placeholder: player.name }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-danger" data-act="ok" disabled><i data-lucide="trash-2"></i>Delete player</button>' +
      '</div>';

    ui.openModal('Delete player', html, function (modal, close) {
      const okBtn = modal.querySelector('[data-act="ok"]');
      const nameEl = modal.querySelector('[name="confirm-name"]');
      const want = String(player.name || '').trim().toLowerCase();
      nameEl.addEventListener('input', function () {
        okBtn.disabled = nameEl.value.trim().toLowerCase() !== want;
      });
      modal.querySelector('[data-act="export"]').addEventListener('click', function () {
        CT.io.exportPlayerJSON(player.id);
      });
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      okBtn.addEventListener('click', function () {
        if (okBtn.disabled) return;
        const snap = store.deletePlayerCascade(player.id);
        store.stashTrash(snap);
        close();
        offerUndo(player.name);
        if (typeof onDone === 'function') onDone();
        else CT.router.route();
      });
    });
  }

  // ----- "recently deleted" restore bar (covers a missed undo toast) -----
  let restoreBarDismissedFor = null; // snapshot player id the coach dismissed

  function restoreBarHtml() {
    const slot = store.peekTrash();
    if (!slot) return '';
    const p = slot.snapshot.player;
    if (p.id === restoreBarDismissedFor) return '';
    const mins = Math.max(1, Math.ceil((Number(slot.expiresAt) - Date.now()) / 60000));
    return '<div class="restore-bar" data-pid="' + esc(p.id) + '">' +
      '<i data-lucide="undo-2"></i>' +
      '<span class="restore-bar-txt">Recently deleted: <strong>' + esc(p.name) + '</strong>' +
        ' <span class="muted">(expires in ' + mins + 'm)</span></span>' +
      '<button class="btn btn-sm" data-act="restore">Restore</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="dismiss-restore" aria-label="Dismiss">&times;</button>' +
    '</div>';
  }

  function wireRestoreBar(root) {
    const bar = root.querySelector('.restore-bar');
    if (!bar) return;
    bar.querySelector('[data-act="restore"]').addEventListener('click', function () {
      const restored = store.restoreTrash();
      if (restored) {
        ui.toast('Restored ' + restored.name);
        CT.router.navigate('#/player/' + restored.id);
      } else {
        ui.toast('Undo window expired.');
        CT.router.route();
      }
    });
    bar.querySelector('[data-act="dismiss-restore"]').addEventListener('click', function () {
      restoreBarDismissedFor = bar.getAttribute('data-pid');
      bar.remove();
    });
  }

  // ----- main render -----
  function render(root, ctx) {
    const players = store.getPlayers();
    const pitchers = players.filter(isPitcher).length;

    const actions =
      (players.length ? '<button class="btn" id="new-assess"><i data-lucide="clipboard-plus"></i>New assessment</button>' : '') +
      '<button class="btn btn-primary" id="add-player"><i data-lucide="user-plus"></i>Add player</button>';

    let html = ui.pageHead('Players', players.length + ' player' + (players.length === 1 ? '' : 's') + ' · ' + pitchers + ' pitcher' + (pitchers === 1 ? '' : 's'), actions);
    html += restoreBarHtml();

    if (!players.length) {
      html += ui.emptyState('users', 'No players yet', 'Add your first player to get started.',
        '<button class="btn btn-primary" id="add-empty"><i data-lucide="user-plus"></i>Add player</button>');
      root.innerHTML = html;
      wireRestoreBar(root);
      const ae = root.querySelector('#add-empty');
      if (ae) ae.addEventListener('click', function () { openForm(null); });
      // The page-head "Add player" button must work on the first-run screen too.
      const ah = root.querySelector('#add-player');
      if (ah) ah.addEventListener('click', function () { openForm(null); });
      return;
    }

    html += '<div class="grid-cards player-grid">' +
      players.map(playerCard).join('') +
    '</div>';
    root.innerHTML = html;
    wireRestoreBar(root);

    const add = root.querySelector('#add-player');
    if (add) add.addEventListener('click', function () { openForm(null); });
    const na = root.querySelector('#new-assess');
    if (na) na.addEventListener('click', function () { CT.router.navigate('#/assess/new'); });
  }

  window.CT.playersUI = { openForm: openForm, confirmDelete: confirmDelete };
  CT.registerView('players', { label: 'Players', render: render });
})();

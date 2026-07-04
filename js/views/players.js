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
        ui.formField({ type: 'select', name: 'level', label: 'Level', value: p.level || 'youth', options: model.LEVELS }) +
      '</div>' +
      '<div class="field-row">' +
        ui.formField({ type: 'select', name: 'bats', label: 'Bats', value: p.bats || 'R', options: ['R', 'L', 'S'] }) +
        ui.formField({ type: 'select', name: 'throws', label: 'Throws', value: p.throws || 'R', options: ['R', 'L'] }) +
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

  // Cascade-delete confirm. onDone lets the profile route back to the list.
  function confirmDelete(player, onDone) {
    if (!player) return;
    ui.confirmDialog('Delete player',
      'Delete ' + player.name + ' and all their assessments, stats, workload, and programs? This cannot be undone.',
      'Delete', function () {
        store.deletePlayerCascade(player.id);
        ui.toast('Player deleted');
        if (typeof onDone === 'function') onDone();
        else CT.router.route();
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

    if (!players.length) {
      html += ui.emptyState('users', 'No players yet', 'Add your first player to get started.',
        '<button class="btn btn-primary" id="add-empty"><i data-lucide="user-plus"></i>Add player</button>');
      root.innerHTML = html;
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

    const add = root.querySelector('#add-player');
    if (add) add.addEventListener('click', function () { openForm(null); });
    const na = root.querySelector('#new-assess');
    if (na) na.addEventListener('click', function () { CT.router.navigate('#/assess/new'); });
  }

  window.CT.playersUI = { openForm: openForm, confirmDelete: confirmDelete };
  CT.registerView('players', { label: 'Players', render: render });
})();

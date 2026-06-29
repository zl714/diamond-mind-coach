/* views/roster.js — REFERENCE VIEW (the pattern the other 7 views copy).
   Player list + add/edit/delete with anthropometrics, a Pitch-Smart "cleared to
   pitch?" badge, and last-assessment date. Fully working. Registers itself via
   CT.registerView('roster', { label, render }). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;

  // ----- helpers -----
  function latestAnthro(playerId) {
    const rows = store.byPlayer('anthroReadings', playerId);
    if (!rows.length) return null;
    return rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-1)[0];
  }

  function isPitcher(p) { return (p.positions || []).some(function (x) { return /pitch/i.test(x); }); }

  // Pitch-Smart clearance as a color+glyph+text badge (never color alone).
  function clearanceBadge(player) {
    const logs = store.byPlayer('workloadLogs', player.id);
    if (!isPitcher(player) && !logs.length) {
      return '<span class="muted" style="font-size:var(--fs-data);">Not a pitcher</span>';
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
    return '<span class="badge" style="' + ui.toneStyle(tone) +
      ';border-radius:9999px;padding:2px 8px;font-size:12px;font-weight:600;border:1px solid;">' +
      '<i data-lucide="' + icon + '"></i>' + esc(label) + '</span>';
  }

  function clearedCount(players) {
    return players.filter(function (p) {
      if (!isPitcher(p)) return false;
      return CT.pitchsmart.evaluate(p, store.byPlayer('workloadLogs', p.id)).status === 'green';
    }).length;
  }

  function playerCard(p) {
    const age = model.ageFromBirthdate(p.birthdate);
    const band = p.ageBand || model.ageBandFromBirthdate(p.birthdate) || '—';
    const anthro = latestAnthro(p.id);
    const lastAssess = store.lastAssessmentDate(p.id);
    const pos = (p.positions || []).join(', ') || '—';
    const ht = anthro && anthro.heightIn != null ? Math.floor(anthro.heightIn / 12) + "'" + Math.round(anthro.heightIn % 12) + '"' : '—';
    const wt = anthro && anthro.weightLb != null ? anthro.weightLb + ' lb' : '—';

    const body =
      '<div class="player-card">' +
        '<div class="avatar">' + esc(CT.initials(p.name)) + '</div>' +
        '<div class="meta">' +
          '<div class="name">' + esc(p.name) + '</div>' +
          '<div class="sub">' + esc(band) + (age != null ? ' · ' + age + ' yrs' : '') + ' · ' + esc(p.level || 'youth') + '</div>' +
          '<div class="sub">' + esc(pos) + ' · B/T ' + esc(p.bats || '?') + '/' + esc(p.throws || '?') + (p.jersey ? ' · #' + esc(p.jersey) : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-top:.7rem;grid-template-columns:repeat(2,1fr);">' +
        '<div class="kpi"><div class="k">Height</div><div class="v" style="font-size:1rem;">' + esc(ht) + '</div></div>' +
        '<div class="kpi"><div class="k">Weight</div><div class="v" style="font-size:1rem;">' + esc(wt) + '</div></div>' +
        '<div class="kpi"><div class="k">Pitch Smart</div><div class="v" style="font-size:.95rem;">' + clearanceBadge(p) + '</div></div>' +
        '<div class="kpi"><div class="k">Last assess</div><div class="v" style="font-size:1rem;">' + (lastAssess ? esc(CT.relativeDate(lastAssess)) : '—') + '</div></div>' +
      '</div>' +
      '<div class="row" style="margin-top:.7rem;">' +
        '<button class="btn btn-sm" data-act="edit" data-id="' + esc(p.id) + '"><i data-lucide="pencil"></i>Edit</button>' +
        '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + esc(p.id) + '"><i data-lucide="trash-2"></i>Delete</button>' +
      '</div>';
    return ui.card({ body: body });
  }

  // ----- add/edit form -----
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
      ui.formField({ type: 'text', name: 'positions', label: 'Positions', value: (p.positions || []).join(', '), placeholder: 'e.g. Shortstop, Pitcher', help: 'Comma-separated.' }) +
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
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const get = function (n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
        const data = {
          name: get('name'),
          birthdate: get('birthdate'),
          level: get('level'),
          bats: get('bats'),
          throws: get('throws'),
          positions: get('positions').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
          jersey: get('jersey'),
          notes: get('notes')
        };
        const v = model.validatePlayer(data);
        if (!v.ok) { ui.toast(v.errors[0]); return; }
        v.warnings.forEach(function (w) { ui.toast(w); });

        // Derive ageBand from birthdate so it's always consistent.
        data.ageBand = model.ageBandFromBirthdate(data.birthdate) || '';

        let saved;
        if (existing) saved = store.update('players', p.id, data);
        else saved = store.insert('players', data);

        // Optional anthro reading (append-only time-series).
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

  // ----- main render -----
  function render(root, ctx) {
    const players = store.getPlayers();
    const pitchers = players.filter(isPitcher).length;

    let html = ui.pageHead('Roster', players.length + ' player(s) · ' + pitchers + ' pitcher(s)',
      '<button class="btn btn-primary" id="add-player"><i data-lucide="user-plus"></i>Add player</button>');

    if (!players.length) {
      html += ui.emptyState('users', 'No players yet', 'Add your first player to get started.',
        '<button class="btn btn-primary" id="add-empty"><i data-lucide="user-plus"></i>Add player</button>');
      root.innerHTML = html;
      const ae = root.querySelector('#add-empty');
      if (ae) ae.addEventListener('click', function () { openForm(null); });
    } else {
      // Hero KPI row — answers "is everything OK?" before the grid of equals.
      html += '<div class="stats">' +
        ui.statTile(players.length, 'Players') +
        ui.statTile(pitchers, 'Pitchers') +
        ui.statTile(clearedCount(players), 'Cleared to pitch') +
        '</div>';
      html += '<div class="grid-cards">' +
        players.map(function (p) { return '<div data-card="' + esc(p.id) + '">' + playerCard(p) + '</div>'; }).join('') +
        '</div>';
      root.innerHTML = html;
    }

    const add = root.querySelector('#add-player');
    if (add) add.addEventListener('click', function () { openForm(null); });

    root.querySelectorAll('[data-act="edit"]').forEach(function (b) {
      b.addEventListener('click', function () { openForm(store.getPlayer(b.getAttribute('data-id'))); });
    });
    root.querySelectorAll('[data-act="del"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const player = store.getPlayer(b.getAttribute('data-id'));
        if (!player) return;
        ui.confirmDialog('Delete player',
          'Delete ' + player.name + ' and all their assessments, stats, workload, and programs? This cannot be undone.',
          'Delete', function () {
            store.deletePlayerCascade(player.id);
            ui.toast('Player deleted');
            CT.router.route();
          });
      });
    });
  }

  CT.registerView('roster', { label: 'Roster', render: render });
})();

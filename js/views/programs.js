/* views/programs.js — PROGRAMS (nav destination #/programs).
   The training-program hub, promoted out of the old Sessions wrapper:
     #/programs               — program list + active assignments + adherence chart
     #/programs/drills        — Drill Library tab (CT.views.drillLibrary)
     #/programs/new           — Program Builder, new  (CT.views.programBuilder)
     #/programs/edit/<id>     — Program Builder, edit
     #/programs/<programId>   — program detail (read week×day grid + assign)
   Assigning writes a ProgramAssignment {playerId, programId, startDate,
   daysOfWeek[]} — sessions are NEVER pre-generated; they're logged on demand
   through the shared Log-Session modal (CT.sessionLog), which enforces the
   Pitch Smart throws gate on throwing programs. Adherence compares logged
   days against the schedule-derived due count (CT.programs.adherenceFor).
   Daily check-in now lives in Arm Safety (#/armsafety/checkin). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;
  const programs = CT.programs, charts = CT.charts;

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const TYPE_ICON = { throwing: 'target', hitting: 'zap', strength: 'dumbbell', custom: 'clipboard-list' };

  // ----- shared lookups --------------------------------------------------------
  function activeAssignments() {
    return store.query('programAssignments', function (a) { return a.status !== 'completed'; });
  }
  function assignmentsFor(programId) {
    return store.where('programAssignments', 'programId', programId)
      .filter(function (a) { return a.status !== 'completed'; });
  }
  function logsForAssignment(assignmentId) {
    return store.where('sessionLogs', 'assignmentId', assignmentId)
      .slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  function adherence(assignment) {
    const prog = store.getById('programs', assignment.programId);
    return programs.adherenceFor(prog, assignment, logsForAssignment(assignment.id));
  }
  function typePill(type) {
    return '<span class="pill" style="' + ui.toneStyle('accent') + '"><i data-lucide="' +
      (TYPE_ICON[type] || 'clipboard-list') + '"></i>' + esc(type) + '</span>';
  }
  function dowLabel(daysOfWeek) {
    if (!daysOfWeek || !daysOfWeek.length) return 'flexible days';
    return daysOfWeek.slice().sort().map(function (n) { return DOW[n]; }).join(' · ');
  }
  function referralBlock(text) {
    return '<div class="pgm-referral"><i data-lucide="shield-alert"></i><span>' + esc(text) + '</span></div>';
  }

  // =====================================================================
  // ASSIGN MODAL — players + start date + days-of-week (age-gated)
  // =====================================================================
  function openAssign(program, presetPlayerId) {
    if (!store.getPlayers().length) { ui.toast('Add players first (Players).'); return; }

    function pickListHtml(selectedIds) {
      return store.getPlayers().map(function (p) {
        const elig = programs.eligibility(program, p); // program carries ageGateMin/ageBands/clinicianRequired
        const already = assignmentsFor(program.id).some(function (a) { return a.playerId === p.id; });
        const checked = selectedIds.indexOf(p.id) >= 0;
        const blocked = !elig.eligible || already;
        const age = model.ageFromBirthdate(p.birthdate);
        const tone = blocked ? 'red' : (program.clinicianRequired ? 'yellow' : 'green');
        return '<label class="pgm-pick' + (blocked ? ' pgm-pick-blocked' : '') + '">' +
          '<input type="checkbox" data-pick="' + esc(p.id) + '"' + (checked && !blocked ? ' checked' : '') + (blocked ? ' disabled' : '') + ' /> ' +
          '<span class="pgm-pick-name">' + esc(p.name) + ' <span class="muted">(' + (age != null ? age + 'y · ' : '') + esc(model.bandFor(p) || '—') + ')</span></span>' +
          '<span class="pgm-pick-status">' + ui.pill(already ? 'Assigned' : (elig.eligible ? 'OK' : 'Blocked'), already ? 'neutral' : tone) + '</span>' +
          '<span class="pgm-pick-reason muted">' + esc(already ? 'Already on this program.' : elig.reason) + '</span>' +
        '</label>';
      }).join('');
    }

    const dowChips = DOW.map(function (label, n) {
      return '<button type="button" class="dow-chip" data-dow="' + n + '" aria-pressed="false">' + label + '</button>';
    }).join('');

    const html =
      '<p class="muted" style="margin-top:0;">' + esc(program.name) + ' · ' + esc(program.type) +
        ' · <span class="num">' + program.weeks + '</span>w × <span class="num">' + Math.max(1, program.daysPerWeek) + '</span>d' + '</p>' +
      (program.clinicianRequired ? referralBlock('Clinician supervision REQUIRED for this program.') : '') +
      ui.formField({ type: 'date', name: 'startDate', label: 'Start date', value: CT.todayISO(), required: true }) +
      '<div class="field"><label>Training days</label>' +
        '<div class="help" style="margin-bottom:var(--sp-2);">Pick the weekdays this program runs — they drive the Dashboard\'s "Today" list. Leave empty for flexible scheduling.</div>' +
        '<div class="dow-chips">' + dowChips + '</div>' +
      '</div>' +
      '<div class="field"><label>Assign to players</label>' +
        '<div class="help" style="margin-bottom:var(--sp-2);">Age-gated programs are blocked for ineligible players with a reason.</div>' +
        '<div id="pick-list" class="pgm-picks">' + pickListHtml(presetPlayerId ? [presetPlayerId] : []) + '</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="assign"><i data-lucide="check"></i>Assign program</button>' +
      '</div>';

    ui.openModal('Assign — ' + program.name, html, function (modal, close) {
      const picked = {};
      modal.querySelectorAll('.dow-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          const n = chip.getAttribute('data-dow');
          picked[n] = !picked[n];
          chip.classList.toggle('active', picked[n]);
          chip.setAttribute('aria-pressed', picked[n] ? 'true' : 'false');
        });
      });
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="assign"]').addEventListener('click', function () {
        const ids = Array.prototype.slice.call(modal.querySelectorAll('[data-pick]:checked'))
          .map(function (cb) { return cb.getAttribute('data-pick'); });
        if (!ids.length) { ui.toast('Select at least one eligible player.'); return; }
        const startDate = modal.querySelector('[name="startDate"]').value || CT.todayISO();
        const daysOfWeek = Object.keys(picked).filter(function (k) { return picked[k]; }).map(Number);
        const dpw = Math.max(1, program.daysPerWeek || 1);
        if (daysOfWeek.length && daysOfWeek.length !== dpw) {
          ui.toast('Heads up: ' + daysOfWeek.length + ' training day(s) picked for a ' + dpw + '-day/week program.');
        }
        let assigned = 0;
        ids.forEach(function (pid) {
          const player = store.getPlayer(pid);
          if (!player || !programs.eligibility(program, player).eligible) return;
          store.insert('programAssignments', {
            playerId: pid, programId: program.id, startDate: startDate,
            daysOfWeek: daysOfWeek.length ? daysOfWeek : null, status: 'active'
          });
          assigned++;
        });
        close();
        ui.toast(assigned ? 'Assigned to ' + assigned + ' player(s)' : 'No eligible players assigned');
        CT.router.navigate('#/programs');
      });
    });
  }

  // =====================================================================
  // LIST — programs + active assignments + adherence chart
  // =====================================================================
  function programCard(p) {
    const assigned = assignmentsFor(p.id).length;
    const nItems = (p.days || []).reduce(function (s, d) { return s + (d.items || []).length; }, 0);
    const body =
      '<a class="pgm-card-link" href="#/programs/' + esc(p.id) + '">' +
        '<div class="pgm-card-top">' +
          '<div class="pgm-card-name">' + esc(p.name) + '</div>' +
          typePill(p.type) +
        '</div>' +
        '<div class="pgm-weeks"><span class="num">' + p.weeks + '</span> week' + (p.weeks === 1 ? '' : 's') +
          ' × <span class="num">' + Math.max(1, p.daysPerWeek) + '</span> day' + (p.daysPerWeek === 1 ? '' : 's') + '/wk' +
          ' · <span class="num">' + nItems + '</span> item' + (nItems === 1 ? '' : 's') +
          (p.ageGateMin != null ? ' · age ' + p.ageGateMin + '+' : '') + '</div>' +
        (p.description ? '<p class="pgm-note" style="margin-top:var(--sp-1);">' + esc(p.description.length > 130 ? p.description.slice(0, 130) + '…' : p.description) + '</p>' : '') +
      '</a>' +
      '<div class="row" style="margin-top:var(--sp-3);">' +
        '<button class="btn btn-sm btn-primary" data-act="assign" data-id="' + esc(p.id) + '"><i data-lucide="user-plus"></i>Assign</button>' +
        '<a class="btn btn-sm" href="#/programs/edit/' + esc(p.id) + '"><i data-lucide="pencil"></i>Edit</a>' +
        '<button class="btn btn-sm btn-ghost" data-act="del-program" data-id="' + esc(p.id) + '" aria-label="Delete ' + esc(p.name) + '"><i data-lucide="trash-2"></i></button>' +
        (assigned ? '<span class="pill" style="' + ui.toneStyle('neutral') + ';margin-left:auto;"><span class="num">' + assigned + '</span>&nbsp;assigned</span>' : '') +
      '</div>';
    return ui.card({ body: body });
  }

  function assignmentCard(a) {
    const player = store.getPlayer(a.playerId);
    const program = store.getById('programs', a.programId);
    if (!player || !program) return '';
    const adh = adherence(a);
    const wk = programs.weekIndexFor(a, program);
    const logs = logsForAssignment(a.id);
    const loggedToday = logs.some(function (l) { return l.date === CT.todayISO(); });
    const overlay = (program.daysPerWeek || 0) === 0;

    const body =
      '<div class="pgm-card-top">' +
        '<div><div class="pgm-card-name">' + esc(player.name) + '</div>' +
          '<div class="muted" style="font-size:var(--fs-data);">' + esc(program.name) + ' · ' + esc(dowLabel(a.daysOfWeek)) + '</div></div>' +
        ui.pill(a.status, a.status === 'active' ? 'accent' : 'neutral') +
      '</div>' +
      '<div class="kpi-grid" style="margin-top:var(--sp-3);grid-template-columns:repeat(3,1fr);">' +
        '<div class="kpi"><div class="k">Week</div><div class="v num">' + (wk + 1) + '/' + program.weeks + '</div></div>' +
        '<div class="kpi"><div class="k">Logged</div><div class="v num">' + logs.length + (adh.due ? '/' + adh.due : '') + '</div></div>' +
        '<div class="kpi"><div class="k">Adherence</div><div class="v num">' + (adh.pct == null ? '—' : adh.pct + '%') + '</div></div>' +
      '</div>' +
      (program.clinicianRequired ? referralBlock('Clinician-supervised program — confirm clearance before progressing.') : '') +
      (overlay ? '<div class="pgm-note">Compliance overlay — tracked via Pitch Smart, nothing to log.</div>' : '') +
      '<div class="row" style="margin-top:var(--sp-3);">' +
        (overlay || a.status !== 'active' ? '' :
          '<button class="btn btn-sm ' + (loggedToday ? 'btn-ghost' : 'btn-primary') + '" data-act="log-session" data-aid="' + esc(a.id) + '">' +
            '<i data-lucide="clipboard-check"></i>' + (loggedToday ? 'Log another' : 'Log session') + '</button>') +
        (a.status === 'active'
          ? '<button class="btn btn-sm" data-act="pause" data-id="' + esc(a.id) + '"><i data-lucide="pause"></i>Pause</button>'
          : '<button class="btn btn-sm" data-act="resume" data-id="' + esc(a.id) + '"><i data-lucide="play"></i>Resume</button>') +
        '<button class="btn btn-sm btn-danger" data-act="unassign" data-id="' + esc(a.id) + '"><i data-lucide="trash-2"></i>Remove</button>' +
      '</div>';
    return ui.card({ body: body });
  }

  function renderList(root) {
    const progs = store.all('programs').filter(function (p) { return !p.archived; })
      .sort(function (a, b) { return (a.name || '') < (b.name || '') ? -1 : 1; });
    const assigns = activeAssignments();

    // Team-wide adherence.
    let teamDue = 0, teamDone = 0;
    assigns.forEach(function (a) { const adh = adherence(a); teamDue += adh.due; teamDone += adh.done; });
    const teamAdh = teamDue ? Math.round((teamDone / teamDue) * 100) : null;

    let html = '';
    if (progs.length || assigns.length) {
      html += '<div class="stats">' +
        ui.statTile(String(progs.length), 'Programs') +
        ui.statTile(String(assigns.length), 'Active assignments') +
        ui.statTile(teamAdh == null ? '—' : teamAdh + '%', 'Team adherence') +
        '</div>';
    }

    // Programs.
    html += '<h2 style="margin-bottom:var(--sp-3);">Programs</h2>';
    if (!progs.length) {
      html += ui.emptyState('clipboard-list', 'No programs built yet',
        'Build your first program — start from a template (arm care, long toss, hitting…) or from scratch.',
        '<a class="btn btn-primary" href="#/programs/new"><i data-lucide="plus"></i>New program</a>');
    } else {
      html += '<div class="grid-cards">' + progs.map(programCard).join('') + '</div>';
    }

    // Active assignments.
    html += '<h2 style="margin:var(--sp-6) 0 var(--sp-3);">Assignments</h2>';
    const visible = store.all('programAssignments').filter(function (a) { return a.status !== 'completed'; });
    if (!visible.length) {
      html += ui.emptyState('users', 'No players assigned yet',
        progs.length ? 'Hit "Assign" on a program to put players on it.' : 'Build a program first, then assign players to it.');
    } else {
      html += '<div class="grid-cards">' + visible.map(assignmentCard).join('') + '</div>';
      html += ui.card({
        title: 'Program adherence',
        subtitle: 'Logged vs. due sessions per player (team process, not a leaderboard)',
        body: '<div class="chart-wrap"><canvas id="pgm-adherence"></canvas></div>'
      });
    }

    root.querySelector('#pgm-body').innerHTML = html;
    wireList(root);

    // Adherence chart — bars on the Savant scale (low = cold blue).
    const canvas = root.querySelector('#pgm-adherence');
    if (canvas) {
      const byPlayer = {};
      visible.forEach(function (a) {
        const adh = adherence(a);
        const p = store.getPlayer(a.playerId);
        if (!p) return;
        byPlayer[p.name] = byPlayer[p.name] || { due: 0, done: 0 };
        byPlayer[p.name].due += adh.due; byPlayer[p.name].done += adh.done;
      });
      const labels = Object.keys(byPlayer);
      const data = labels.map(function (n) { const x = byPlayer[n]; return x.due ? Math.round((x.done / x.due) * 100) : 0; });
      if (labels.length) {
        charts.bar(canvas, {
          labels: labels, data: data, label: 'Adherence %',
          colors: data.map(function (v) { return charts.savantColor(v); }),
          options: { scales: { y: { min: 0, max: 100 } } }
        });
      }
    }
  }

  function wireList(root) {
    root.querySelectorAll('[data-act="assign"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = store.getById('programs', b.getAttribute('data-id'));
        if (p) openAssign(p);
      });
    });
    root.querySelectorAll('[data-act="del-program"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = store.getById('programs', b.getAttribute('data-id'));
        if (!p) return;
        const n = assignmentsFor(p.id).length;
        ui.confirmDialog('Delete program',
          'Delete "' + p.name + '"' + (n ? ' and its ' + n + ' active assignment(s)' : '') + '? Logged sessions stay in player history.',
          'Delete', function () {
            store.where('programAssignments', 'programId', p.id).forEach(function (a) { store.remove('programAssignments', a.id); });
            store.remove('programs', p.id);
            ui.toast('Program deleted');
            CT.router.route();
          });
      });
    });
    root.querySelectorAll('[data-act="log-session"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const a = store.getById('programAssignments', b.getAttribute('data-aid'));
        if (a) CT.sessionLog.open({ playerId: a.playerId, assignmentId: a.id });
      });
    });
    root.querySelectorAll('[data-act="pause"]').forEach(function (b) {
      b.addEventListener('click', function () { store.update('programAssignments', b.getAttribute('data-id'), { status: 'paused' }); ui.toast('Paused'); CT.router.route(); });
    });
    root.querySelectorAll('[data-act="resume"]').forEach(function (b) {
      b.addEventListener('click', function () { store.update('programAssignments', b.getAttribute('data-id'), { status: 'active' }); ui.toast('Resumed'); CT.router.route(); });
    });
    root.querySelectorAll('[data-act="unassign"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const a = store.getById('programAssignments', b.getAttribute('data-id'));
        if (!a) return;
        ui.confirmDialog('Remove assignment', 'Remove this program assignment? Already-logged sessions stay in the player\'s history.', 'Remove', function () {
          store.remove('programAssignments', a.id);
          ui.toast('Assignment removed');
          CT.router.route();
        });
      });
    });
  }

  // =====================================================================
  // DETAIL — read view of one program (week×day grid + assigned players)
  // =====================================================================
  function itemLine(it) {
    if (it.kind === 'drill') {
      const d = store.getDrill(it.drillId);
      let label = d ? d.name : 'Removed drill';
      if (it.sets) label += ' — ' + it.sets + '×' + (it.reps || '?');
      return '<li class="pgm-item' + (d ? '' : ' muted') + '"><i data-lucide="dumbbell"></i>' + esc(label) + '</li>';
    }
    return '<li class="pgm-item"><i data-lucide="check-square"></i>' + esc(it.text) + '</li>';
  }

  function detailGrid(p) {
    const weeks = Math.max(1, p.weeks || 1);
    const perWeek = Math.max(1, p.daysPerWeek || 1);
    let rows = '';
    for (let w = 0; w < weeks; w++) {
      let cells = '';
      let weekHasOwn = false;
      for (let d = 0; d < perWeek; d++) {
        const own = (p.days || []).find(function (x) { return x.weekIndex === w && x.dayIndex === d && (x.items || []).length; });
        if (own) weekHasOwn = true;
        const day = programs.dayFor(p, w, d);
        const items = day && day.items ? day.items : [];
        cells += '<div class="pb-day pgm-day-read' + (own ? '' : ' pgm-day-inherit') + '">' +
          '<div class="pb-day-head" style="cursor:default;">Day ' + (d + 1) + (own || w === 0 ? '' : ' <span class="pb-sel-tag">wk 1</span>') + '</div>' +
          (items.length ? '<ul class="pgm-items">' + items.map(itemLine).join('') + '</ul>' : '<div class="pb-empty muted">Rest / free</div>') +
        '</div>';
      }
      // Collapse identical repeat weeks: show week 1, then one "repeats" row.
      if (w > 0 && !weekHasOwn) {
        rows += '<div class="pb-week pgm-week-repeat"><div class="pb-week-label">Week <span class="num">' + (w + 1) + '</span></div>' +
          '<div class="pgm-note" style="margin:0;">Repeats week 1\'s pattern.</div></div>';
        continue;
      }
      rows += '<div class="pb-week">' +
        '<div class="pb-week-label">Week <span class="num">' + (w + 1) + '</span></div>' +
        '<div class="pb-week-days" style="grid-template-columns:repeat(' + perWeek + ',minmax(180px,1fr));">' + cells + '</div>' +
      '</div>';
    }
    return '<div class="pb-grid">' + rows + '</div>';
  }

  function renderDetail(root, program) {
    const assigns = assignmentsFor(program.id);
    let html =
      '<a class="back-link" href="#/programs"><i data-lucide="chevron-left"></i>All programs</a>' +
      ui.card({
        rawTitle: true,
        title: esc(program.name) + ' ' + typePill(program.type),
        subtitle: program.weeks + ' weeks × ' + Math.max(1, program.daysPerWeek) + ' days/week' +
          (program.ageGateMin != null ? ' · hard age gate ' + program.ageGateMin + '+' : ''),
        actions:
          '<button class="btn btn-primary btn-sm" data-act="assign-detail"><i data-lucide="user-plus"></i>Assign</button>' +
          '<a class="btn btn-sm" href="#/programs/edit/' + esc(program.id) + '"><i data-lucide="pencil"></i>Edit</a>',
        body:
          (program.description ? '<p class="muted" style="margin-top:0;">' + esc(program.description) + '</p>' : '') +
          (program.clinicianRequired ? referralBlock('Clinician supervision REQUIRED.') : '') +
          detailGrid(program)
      });

    html += '<h2 style="margin:var(--sp-5) 0 var(--sp-3);">Players on this program</h2>';
    if (!assigns.length) {
      html += ui.emptyState('users', 'Nobody assigned yet', 'Assign this program to start tracking adherence.');
    } else {
      html += '<div class="grid-cards">' + assigns.map(assignmentCard).join('') + '</div>';
    }

    root.querySelector('#pgm-body').innerHTML = html;
    const ab = root.querySelector('[data-act="assign-detail"]');
    if (ab) ab.addEventListener('click', function () { openAssign(program); });
    wireList(root);
  }

  // =====================================================================
  // MAIN RENDER — routes on the param
  // =====================================================================
  function render(root, ctx) {
    const param = ctx && ctx.param ? ctx.param : null;
    const navigate = (ctx && ctx.navigate) || CT.router.navigate;

    // Builder routes render full-bleed (their own page head + back link).
    if (param === 'new') {
      CT.views.programBuilder.render(root, { programId: null, navigate: navigate });
      return;
    }
    if (param && param.indexOf('edit/') === 0) {
      CT.views.programBuilder.render(root, { programId: param.slice(5), navigate: navigate });
      return;
    }

    // Program detail.
    if (param && param !== 'drills') {
      const program = store.getById('programs', param);
      if (program) {
        root.innerHTML = ui.pageHead('Programs', 'Program detail') + '<div id="pgm-body"></div>';
        renderDetail(root, program);
        return;
      }
      // Unknown param (e.g. an alert deep link with a playerId) -> list.
    }

    const tab = param === 'drills' ? 'drills' : 'programs';
    const drills = store.drillLibrary().length;
    const active = activeAssignments().length;
    const subtitle = store.all('programs').length + ' program(s) · ' + active + ' active assignment(s) · ' + drills + ' drill(s)';

    const tabbar = '<div class="tabbar" role="tablist">' +
      '<button class="tabbar-item' + (tab === 'programs' ? ' active' : '') + '" data-tab="programs">Programs</button>' +
      '<button class="tabbar-item' + (tab === 'drills' ? ' active' : '') + '" data-tab="drills">Drill Library</button>' +
    '</div>';

    root.innerHTML =
      ui.pageHead('Programs', subtitle,
        '<a class="btn btn-primary" href="#/programs/new"><i data-lucide="plus"></i>New program</a>') +
      tabbar + '<div id="pgm-body"></div>';

    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        const t = b.getAttribute('data-tab');
        navigate(t === 'drills' ? '#/programs/drills' : '#/programs');
      });
    });

    if (tab === 'drills') {
      CT.views.drillLibrary.render(root.querySelector('#pgm-body'), { embedded: true, navigate: navigate });
    } else {
      renderList(root);
    }
  }

  CT.registerView('programs', { label: 'Programs', render: render });

  // Kept on CT.views for any embedded host (player profile assign shortcut).
  window.CT.views = window.CT.views || {};
  window.CT.views.programs = { label: 'Programs', render: render, openAssign: openAssign };
})();

/* views/programs.js — PROGRAMS + DAILY CHECK-IN (Diamond Mind, cyan reskin).
   Three sub-tabs (design-system underline .tabbar), all on the shared CT foundation:
     1) Today      — per-player program tracker: today's planned-vs-completed
                     sessions, warmup/arm-care checkboxes, RPE/soreness inputs,
                     week-index progress, Pitch-Smart status, adherence chart.
     2) Programs   — builder/assignment: pick a CT.programs template (age-gated —
                     blocks weighted-ball / HS+ programs for youth with a reason),
                     set start date, auto-generate dated weekly sessions, assign to
                     one or many players. Lists + manages active assignments.
     3) Check-In   — 1-2 tap daily sleep/readiness/soreness/pain. A pain flag over
                     threshold sets armPain (the record the Alerts view reads) and
                     surfaces a medical-referral note.
   Uses ONLY the documented CT API. Registers via CT.registerView('programs', ...).
   Design system: cyan accent (data-app="diamond-mind"), seam-red for pain/danger,
   tabular-nums on numbers, Lucide glyphs (no emoji), no green chrome. */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;
  const programs = CT.programs, pitchsmart = CT.pitchsmart, charts = CT.charts;

  // Arm-pain reported at/above this 0-10 level escalates to a pain alert.
  const PAIN_THRESHOLD = 3;

  // Sub-tab state persists across re-renders (the IIFE runs once).
  const state = { tab: 'today' };
  const TABS = [
    { id: 'today', label: 'Today' },
    { id: 'builder', label: 'Programs' },
    { id: 'checkin', label: 'Check-In' }
  ];

  // ----- small helpers ---------------------------------------------------------
  function isPitcher(p) { return (p.positions || []).some(function (x) { return /pitch/i.test(x); }); }

  function cleanName(name) { return (name || '').replace(/^Demo — /, ''); }

  function programById(programId) { return store.getById('programs', programId); }

  function activeAssignments() {
    return store.query('programAssignments', function (a) { return a.status !== 'completed'; });
  }

  function sessionsForAssignment(assignmentId) {
    return store.where('programSessions', 'assignmentId', assignmentId)
      .slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  // Adherence over sessions already due (date <= today): completed / due.
  function adherence(sessions) {
    const today = CT.todayISO();
    const due = sessions.filter(function (s) { return s.planned && s.date <= today; });
    const done = due.filter(function (s) { return s.completed; }).length;
    return { done: done, due: due.length, pct: due.length ? Math.round((done / due.length) * 100) : null };
  }

  function currentWeekIndex(assignment, program) {
    if (!program || !program.weeks) return 0;
    const start = new Date((assignment.startDate || CT.todayISO()) + 'T00:00:00');
    const diffDays = Math.floor((Date.now() - start.getTime()) / 86400000);
    return Math.max(0, Math.min(program.weeks - 1, Math.floor(diffDays / 7)));
  }

  // Pitch-Smart clearance as a color+glyph+text badge (never color alone), mirroring
  // the roster reference. Green here is the semantic safety axis, not chrome.
  function clearanceBadge(player) {
    const logs = store.byPlayer('workloadLogs', player.id);
    if (!isPitcher(player) && !logs.length) return '';
    const v = pitchsmart.evaluate(player, logs);
    let tone, icon, label;
    if (v.status === 'red') {
      tone = 'red'; icon = 'x-circle';
      label = v.daysUntilEligible > 0 ? 'Rest ' + v.daysUntilEligible + 'd' : 'Not cleared';
    } else if (v.status === 'yellow') {
      tone = 'yellow'; icon = 'alert-triangle'; label = 'Caution';
    } else {
      tone = 'green'; icon = 'check-circle'; label = 'Cleared';
    }
    return '<span class="badge pgm-clearance" style="' + ui.toneStyle(tone) +
      ';border-radius:9999px;padding:2px 8px;font-size:var(--fs-label);font-weight:var(--fw-semibold);border:1px solid;">' +
      '<i data-lucide="' + icon + '"></i>Pitch Smart: ' + esc(label) + '</span>';
  }

  function painFlagged(checkIn) {
    return !!(checkIn && (checkIn.armPain || (checkIn.soreness != null && checkIn.soreness >= 8)));
  }

  // Re-usable medical-referral callout (seam-red, paired with a glyph + text).
  function referralBlock(text) {
    return '<div class="pgm-referral"><i data-lucide="shield-alert"></i><span>' + esc(text) + '</span></div>';
  }

  // =====================================================================
  // TODAY — per-player program tracker
  // =====================================================================
  function sessionRow(session, program) {
    const done = session.completed;
    return '<div class="pgm-session" data-sid="' + esc(session.id) + '">' +
      '<div class="pgm-session-top">' +
        '<div><strong>' + esc(program ? program.name : 'Program') + '</strong>' +
          ' <span class="muted" style="font-size:var(--fs-label);">· week <span class="num">' + (session.weekIndex + 1) + '</span></span></div>' +
        ui.pill(done ? 'Completed' : 'Planned', done ? 'green' : 'neutral') +
      '</div>' +
      '<div class="pgm-checks">' +
        '<label class="pgm-check"><input type="checkbox" data-act="warmup" data-sid="' + esc(session.id) + '"' + (session.warmupDone ? ' checked' : '') + ' /> Warm-up</label>' +
        '<label class="pgm-check"><input type="checkbox" data-act="armcare" data-sid="' + esc(session.id) + '"' + (session.armCareDone ? ' checked' : '') + ' /> Arm-care</label>' +
      '</div>' +
      '<div class="pgm-inputs">' +
        '<label>RPE<input class="input num" type="number" inputmode="decimal" min="0" max="10" step="1" data-act="rpe" data-sid="' + esc(session.id) + '" value="' + (session.rpe == null ? '' : esc(session.rpe)) + '" /></label>' +
        '<label>Soreness<input class="input num" type="number" inputmode="decimal" min="0" max="10" step="1" data-act="soreness" data-sid="' + esc(session.id) + '" value="' + (session.soreness == null ? '' : esc(session.soreness)) + '" /></label>' +
      '</div>' +
      '<div class="row" style="margin-top:var(--sp-2);">' +
        '<button class="btn btn-sm ' + (done ? 'btn-ghost' : 'btn-primary') + '" data-act="toggle" data-sid="' + esc(session.id) + '">' +
          '<i data-lucide="' + (done ? 'rotate-ccw' : 'check') + '"></i>' + (done ? 'Mark not done' : 'Mark done') + '</button>' +
      '</div>' +
    '</div>';
  }

  function todayPlayerCard(player) {
    const today = CT.todayISO();
    const assigns = store.byPlayer('programAssignments', player.id)
      .filter(function (a) { return a.status !== 'completed'; });

    let allSessions = [];
    let totalDue = 0, totalDone = 0, weeksLine = [];
    assigns.forEach(function (a) {
      const prog = programById(a.programId);
      const sess = sessionsForAssignment(a.id);
      const adh = adherence(sess);
      totalDue += adh.due; totalDone += adh.done;
      if (prog) weeksLine.push(esc(prog.name) + ' (wk ' + (currentWeekIndex(a, prog) + 1) + '/' + prog.weeks + ')');
      sess.filter(function (s) { return s.date === today; }).forEach(function (s) { allSessions.push({ s: s, prog: prog }); });
    });

    const adhPct = totalDue ? Math.round((totalDone / totalDue) * 100) : null;
    const todayDone = allSessions.filter(function (x) { return x.s.completed; }).length;
    const clearance = clearanceBadge(player);

    let body =
      '<div class="player-card">' +
        '<div class="avatar">' + esc(CT.initials(player.name)) + '</div>' +
        '<div class="meta">' +
          '<div class="name">' + esc(cleanName(player.name)) + '</div>' +
          '<div class="sub">' + esc(player.ageBand || model.ageBandFromBirthdate(player.birthdate) || '—') + ' · ' + esc(player.level || 'youth') + '</div>' +
          (clearance ? '<div class="sub" style="margin-top:var(--sp-1);">' + clearance + '</div>' : '') +
        '</div>' +
        '<div class="pgm-adherence">' +
          '<div class="v num">' + (adhPct == null ? '—' : adhPct + '%') + '</div>' +
          '<div class="k">Adherence</div>' +
        '</div>' +
      '</div>';

    if (!assigns.length) {
      body += '<p class="pgm-note">No active programs. Assign one in the Programs tab.</p>';
    } else {
      body += '<div class="pgm-weeks">' + weeksLine.join(' · ') + '</div>';
      if (!allSessions.length) {
        body += '<p class="pgm-note">No sessions scheduled today (rest or overlay-only).</p>';
      } else {
        body += '<div class="pgm-note" style="margin-bottom:var(--sp-1);">Today: <span class="num">' + todayDone + '</span>/<span class="num">' + allSessions.length + '</span> done</div>';
        body += allSessions.map(function (x) { return sessionRow(x.s, x.prog); }).join('');
      }
    }

    body += '<div class="row" style="margin-top:var(--sp-3);">' +
      '<button class="btn btn-sm" data-act="quick-checkin" data-pid="' + esc(player.id) + '"><i data-lucide="clipboard-check"></i>Daily check-in</button>' +
      '</div>';

    return ui.card({ body: body });
  }

  function renderToday(root) {
    const players = store.getPlayers();
    let html = '';
    const withPrograms = players.filter(function (p) {
      return store.byPlayer('programAssignments', p.id).some(function (a) { return a.status !== 'completed'; });
    });

    if (!withPrograms.length) {
      html += ui.emptyState('calendar-days', 'No active program assignments',
        'Assign a program in the Programs tab to start tracking daily sessions.',
        '<button class="btn btn-primary" data-act="go-builder"><i data-lucide="arrow-right"></i>Go to Programs</button>');
    } else {
      // Adherence chart across players with programs.
      html += ui.card({
        title: 'Program adherence',
        subtitle: 'Completed vs. due sessions per player (team process, not a leaderboard)',
        body: '<div class="chart-wrap"><canvas id="pgm-adherence"></canvas></div>'
      });
      html += '<div class="grid-cards" style="margin-top:var(--sp-4);">' +
        withPrograms.map(function (p) { return todayPlayerCard(p); }).join('') + '</div>';
    }
    root.querySelector('#pgm-body').innerHTML = html;

    wireTodayEvents(root);

    // Draw adherence chart — bars colored on the Savant percentile scale.
    const canvas = root.querySelector('#pgm-adherence');
    if (canvas) {
      const labels = [], data = [];
      withPrograms.forEach(function (p) {
        let due = 0, done = 0;
        store.byPlayer('programAssignments', p.id).forEach(function (a) {
          if (a.status === 'completed') return;
          const adh = adherence(sessionsForAssignment(a.id));
          due += adh.due; done += adh.done;
        });
        labels.push(cleanName(p.name));
        data.push(due ? Math.round((done / due) * 100) : 0);
      });
      charts.bar(canvas, {
        labels: labels, data: data, label: 'Adherence %',
        colors: data.map(function (v) { return charts.savantColor(v); }),
        options: { scales: { y: { min: 0, max: 100 } } }
      });
    }
  }

  function wireTodayEvents(root) {
    const goB = root.querySelector('[data-act="go-builder"]');
    if (goB) goB.addEventListener('click', function () { state.tab = 'builder'; CT.router.route(); });

    root.querySelectorAll('[data-act="toggle"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const s = store.getById('programSessions', b.getAttribute('data-sid'));
        if (!s) return;
        const nowDone = !s.completed;
        store.update('programSessions', s.id, { completed: nowDone, warmupDone: nowDone || s.warmupDone, armCareDone: nowDone || s.armCareDone });
        ui.toast(nowDone ? 'Session completed' : 'Marked not done');
        CT.router.route();
      });
    });
    function bindCheck(act, field) {
      root.querySelectorAll('[data-act="' + act + '"]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          const patch = {}; patch[field] = cb.checked;
          store.update('programSessions', cb.getAttribute('data-sid'), patch);
        });
      });
    }
    bindCheck('warmup', 'warmupDone');
    bindCheck('armcare', 'armCareDone');
    function bindNum(act, field) {
      root.querySelectorAll('[data-act="' + act + '"]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          const v = inp.value.trim();
          const patch = {}; patch[field] = v === '' ? null : Number(v);
          store.update('programSessions', inp.getAttribute('data-sid'), patch);
        });
      });
    }
    bindNum('rpe', 'rpe');
    bindNum('soreness', 'soreness');

    root.querySelectorAll('[data-act="quick-checkin"]').forEach(function (b) {
      b.addEventListener('click', function () { openCheckIn(store.getPlayer(b.getAttribute('data-pid'))); });
    });
  }

  // =====================================================================
  // PROGRAMS — builder / assignment + active assignment management
  // =====================================================================
  function eligibilityPreview(templateId, selectedIds) {
    const tpl = programs.byTemplateId(templateId);
    const players = store.getPlayers();
    return players.map(function (p) {
      const elig = programs.eligibility(tpl, p);
      const checked = selectedIds.indexOf(p.id) >= 0;
      const tone = elig.eligible ? (tpl && tpl.clinicianRequired ? 'yellow' : 'green') : 'red';
      const age = model.ageFromBirthdate(p.birthdate);
      return '<label class="pgm-pick' + (elig.eligible ? '' : ' pgm-pick-blocked') + '">' +
        '<input type="checkbox" data-pick="' + esc(p.id) + '"' + (checked ? ' checked' : '') + (elig.eligible ? '' : ' disabled') + ' /> ' +
        '<span class="pgm-pick-name">' + esc(cleanName(p.name)) + ' <span class="muted">(' + (age != null ? age + 'y · ' : '') + esc(p.ageBand || '—') + ')</span></span>' +
        '<span class="pgm-pick-status">' + ui.pill(elig.eligible ? 'OK' : 'Blocked', tone) + '</span>' +
        '<span class="pgm-pick-reason muted">' + esc(elig.reason) + '</span>' +
      '</label>';
    }).join('');
  }

  function openAssign() {
    const tpls = programs.templates();
    if (!store.getPlayers().length) { ui.toast('Add players first (Roster).'); return; }
    const tplOptions = tpls.map(function (t) { return { value: t.templateId, label: t.name }; });
    const firstTpl = tpls[0];

    const html =
      ui.formField({ type: 'select', name: 'templateId', label: 'Program template', options: tplOptions, value: firstTpl.templateId }) +
      '<div id="tpl-desc" class="help" style="margin-top:calc(-1 * var(--sp-2));margin-bottom:var(--sp-3);"></div>' +
      ui.formField({ type: 'date', name: 'startDate', label: 'Start date', value: CT.todayISO(), required: true }) +
      '<div class="field"><label>Assign to players</label>' +
        '<div class="help" style="margin-bottom:var(--sp-2);">Age-gated programs are blocked for ineligible players with a reason.</div>' +
        '<div id="pick-list" class="pgm-picks">' + eligibilityPreview(firstTpl.templateId, []) + '</div>' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="assign"><i data-lucide="check"></i>Assign program</button>' +
      '</div>';

    ui.openModal('Assign a program', html, function (modal, close) {
      const sel = modal.querySelector('[name="templateId"]');
      const desc = modal.querySelector('#tpl-desc');
      const pickList = modal.querySelector('#pick-list');

      function selectedIds() {
        return Array.prototype.slice.call(modal.querySelectorAll('[data-pick]:checked'))
          .map(function (cb) { return cb.getAttribute('data-pick'); });
      }
      function refreshDesc() {
        const t = programs.byTemplateId(sel.value);
        let txt = t ? t.description : '';
        if (t && t.clinicianRequired) txt += ' Clinician supervision REQUIRED.';
        desc.textContent = txt;
      }
      function refreshPicks() {
        pickList.innerHTML = eligibilityPreview(sel.value, selectedIds());
        if (window.lucide) window.lucide.createIcons();
      }
      refreshDesc();
      sel.addEventListener('change', function () { refreshDesc(); refreshPicks(); });

      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="assign"]').addEventListener('click', function () {
        const ids = selectedIds();
        if (!ids.length) { ui.toast('Select at least one eligible player.'); return; }
        const tpl = programs.byTemplateId(sel.value);
        const startDate = modal.querySelector('[name="startDate"]').value || CT.todayISO();

        // Instantiate ONE concrete program from the template, then assign to each
        // selected (already-eligible) player with auto-generated dated sessions.
        const program = store.insert('programs', Object.assign({}, tpl, { isTemplate: false }));
        let assigned = 0;
        ids.forEach(function (pid) {
          const player = store.getPlayer(pid);
          if (!player) return;
          const elig = programs.eligibility(tpl, player);
          if (!elig.eligible) return; // hard guard (disabled boxes can't be checked, but be safe)
          const assignment = store.insert('programAssignments', { playerId: pid, programId: program.id, startDate: startDate, status: 'active' });
          programs.generateSessions(program, assignment).forEach(function (s) { store.insert('programSessions', s); });
          assigned++;
        });
        close();
        ui.toast(assigned ? 'Assigned to ' + assigned + ' player(s)' : 'No eligible players assigned');
        state.tab = 'today';
        CT.router.route();
      });
    });
  }

  function assignmentCard(assignment) {
    const player = store.getPlayer(assignment.playerId);
    const program = programById(assignment.programId);
    if (!player || !program) return '';
    const sessions = sessionsForAssignment(assignment.id);
    const adh = adherence(sessions);
    const wk = currentWeekIndex(assignment, program);
    const completedTotal = sessions.filter(function (s) { return s.completed; }).length;

    let body =
      '<div style="display:flex;justify-content:space-between;gap:var(--sp-2);align-items:flex-start;">' +
        '<div><div style="color:var(--text-hi);font-weight:var(--fw-semibold);">' + esc(program.name) + '</div>' +
          '<div class="muted" style="font-size:var(--fs-data);">' + esc(cleanName(player.name)) + ' · ' + esc(program.category) + '</div></div>' +
        ui.pill(assignment.status, assignment.status === 'active' ? 'accent' : 'neutral') +
      '</div>' +
      '<div class="kpi-grid" style="margin-top:var(--sp-3);grid-template-columns:repeat(3,1fr);">' +
        '<div class="kpi"><div class="k">Week</div><div class="v num">' + (wk + 1) + '/' + program.weeks + '</div></div>' +
        '<div class="kpi"><div class="k">Sessions done</div><div class="v num">' + completedTotal + '/' + sessions.length + '</div></div>' +
        '<div class="kpi"><div class="k">Adherence</div><div class="v num">' + (adh.pct == null ? '—' : adh.pct + '%') + '</div></div>' +
      '</div>' +
      (program.clinicianRequired ? referralBlock('Clinician-supervised program — confirm clearance before progressing.') : '') +
      (program.sessionsPerWeek === 0 ? '<div class="pgm-note">Compliance overlay — no scheduled sessions; tracked via Pitch Smart.</div>' : '') +
      '<div class="row" style="margin-top:var(--sp-3);">' +
        (assignment.status === 'active'
          ? '<button class="btn btn-sm" data-act="pause" data-id="' + esc(assignment.id) + '"><i data-lucide="pause"></i>Pause</button>'
          : '<button class="btn btn-sm" data-act="resume" data-id="' + esc(assignment.id) + '"><i data-lucide="play"></i>Resume</button>') +
        '<button class="btn btn-sm btn-danger" data-act="unassign" data-id="' + esc(assignment.id) + '"><i data-lucide="trash-2"></i>Remove</button>' +
      '</div>';

    return ui.card({ body: body });
  }

  function renderBuilder(root) {
    const assigns = store.all('programAssignments');
    let html =
      ui.card({
        title: 'Assign a training program',
        subtitle: 'Templates are age-gated — weighted-ball / HS+ work is blocked for youth.',
        body: '<p class="muted" style="font-size:var(--fs-sm);">Pick a template, set a start date, and assign to one or many players. Dated weekly sessions are generated automatically.</p>' +
          '<button class="btn btn-primary" data-act="assign-new"><i data-lucide="plus"></i>Assign program</button>'
      });

    html += '<div style="margin-top:var(--sp-4);"><h2 style="margin-bottom:var(--sp-3);">Active assignments</h2>';
    if (!assigns.length) {
      html += ui.emptyState('clipboard-list', 'No programs assigned yet', 'Assign your first program above.');
    } else {
      html += '<div class="grid-cards">' + assigns.map(function (a) { return assignmentCard(a); }).join('') + '</div>';
    }
    html += '</div>';

    root.querySelector('#pgm-body').innerHTML = html;

    root.querySelector('[data-act="assign-new"]').addEventListener('click', openAssign);
    root.querySelectorAll('[data-act="pause"]').forEach(function (b) {
      b.addEventListener('click', function () { store.update('programAssignments', b.getAttribute('data-id'), { status: 'paused' }); ui.toast('Program paused'); CT.router.route(); });
    });
    root.querySelectorAll('[data-act="resume"]').forEach(function (b) {
      b.addEventListener('click', function () { store.update('programAssignments', b.getAttribute('data-id'), { status: 'active' }); ui.toast('Program resumed'); CT.router.route(); });
    });
    root.querySelectorAll('[data-act="unassign"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const a = store.getById('programAssignments', b.getAttribute('data-id'));
        if (!a) return;
        ui.confirmDialog('Remove assignment', 'Remove this program and its scheduled sessions? This cannot be undone.', 'Remove', function () {
          sessionsForAssignment(a.id).forEach(function (s) { store.remove('programSessions', s.id); });
          store.remove('programAssignments', a.id);
          ui.toast('Assignment removed');
          CT.router.route();
        });
      });
    });
  }

  // =====================================================================
  // CHECK-IN — daily sleep / readiness / soreness / pain (1-2 tap)
  // =====================================================================
  function openCheckIn(presetPlayer) {
    const players = store.getPlayers();
    if (!players.length) { ui.toast('Add players first (Roster).'); return; }
    const playerOptions = players.map(function (p) { return { value: p.id, label: cleanName(p.name) }; });

    const html =
      ui.formField({ type: 'select', name: 'playerId', label: 'Player', options: playerOptions, value: presetPlayer ? presetPlayer.id : players[0].id }) +
      '<div class="field-row">' +
        ui.formField({ type: 'number', name: 'sleepHours', label: 'Sleep (hrs)', value: '', min: 0, max: 14, step: 0.5, placeholder: 'e.g. 8.5' }) +
        ui.formField({ type: 'number', name: 'mood', label: 'Readiness (1-5)', value: '', min: 1, max: 5, step: 1, placeholder: '1 low – 5 great' }) +
      '</div>' +
      '<div class="field-row">' +
        ui.formField({ type: 'number', name: 'soreness', label: 'Soreness (0-10)', value: '', min: 0, max: 10, step: 1 }) +
        ui.formField({ type: 'number', name: 'painLevel', label: 'Arm pain (0-10)', value: '', min: 0, max: 10, step: 1, help: 'Flags an alert at ' + PAIN_THRESHOLD + '+.' }) +
      '</div>' +
      ui.formField({ type: 'text', name: 'painLocation', label: 'Pain location (if any)', value: '', placeholder: 'e.g. medial elbow' }) +
      '<div id="pain-note"></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save"><i data-lucide="clipboard-check"></i>Save check-in</button>' +
      '</div>';

    ui.openModal('Daily check-in', html, function (modal, close) {
      const painInput = modal.querySelector('[name="painLevel"]');
      const note = modal.querySelector('#pain-note');
      function refreshNote() {
        const v = Number(painInput.value);
        if (painInput.value !== '' && v >= PAIN_THRESHOLD) {
          note.innerHTML = referralBlock('Arm pain ' + v + '/10 — shut down throwing and refer to a sports-medicine clinician before returning. This creates a pain alert (see Alerts).');
          if (window.lucide) window.lucide.createIcons();
        } else {
          note.innerHTML = '';
        }
      }
      painInput.addEventListener('input', refreshNote);

      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const get = function (n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
        const pidVal = get('playerId');
        if (!pidVal) { ui.toast('Pick a player.'); return; }
        const painLevel = get('painLevel') === '' ? null : Number(get('painLevel'));
        const flagged = painLevel != null && painLevel >= PAIN_THRESHOLD;
        const sleep = get('sleepHours'), mood = get('mood'), sore = get('soreness');
        store.insert('dailyCheckIns', {
          playerId: pidVal,
          date: CT.todayISO(),
          sleepHours: sleep === '' ? null : Number(sleep),
          mood: mood === '' ? null : Number(mood),
          soreness: sore === '' ? null : Number(sore),
          armPain: flagged,
          painLocation: flagged ? get('painLocation') : '',
          notes: painLevel != null ? ('Arm pain reported: ' + painLevel + '/10.') : ''
        });
        close();
        if (flagged) ui.toast('Pain alert created — refer to clinician');
        else ui.toast('Check-in saved');
        CT.router.route();
      });
    });
  }

  function checkInRow(c) {
    const player = store.getPlayer(c.playerId);
    const flagged = painFlagged(c);
    return '<tr>' +
      '<td>' + esc(player ? cleanName(player.name) : '—') + '</td>' +
      '<td>' + esc(CT.relativeDate(c.date)) + '</td>' +
      '<td class="num">' + (c.sleepHours == null ? '—' : esc(c.sleepHours) + 'h') + '</td>' +
      '<td class="num">' + (c.mood == null ? '—' : esc(c.mood) + '/5') + '</td>' +
      '<td class="num">' + (c.soreness == null ? '—' : esc(c.soreness) + '/10') + '</td>' +
      '<td>' + (flagged ? ui.pill(c.painLocation ? 'Pain · ' + c.painLocation : 'Pain', 'red') : '<span class="muted">—</span>') + '</td>' +
    '</tr>';
  }

  function renderCheckIn(root) {
    const all = store.all('dailyCheckIns').slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    const flagged = all.filter(painFlagged);

    let html = ui.card({
      title: 'Daily check-in',
      subtitle: '1-2 tap sleep · readiness · soreness · pain',
      body: '<p class="muted" style="font-size:var(--fs-sm);">Quick daily wellness log. Arm pain at ' + PAIN_THRESHOLD + '/10 or above auto-escalates to a pain alert with a medical-referral note.</p>' +
        '<button class="btn btn-primary" data-act="new-checkin"><i data-lucide="plus"></i>New check-in</button>'
    });

    if (flagged.length) {
      html += '<div style="margin-top:var(--sp-4);">' +
        referralBlock(flagged.length + ' active pain flag(s). Per youth-safety protocol: stop throwing and refer to a sports-medicine clinician. See the Alerts tab for the full list.') +
        '</div>';
    }

    html += '<div style="margin-top:var(--sp-4);">' + ui.card({
      title: 'Recent check-ins',
      body: all.length
        ? '<div class="table-wrap"><table class="ct-table"><thead><tr><th>Player</th><th>When</th><th class="num">Sleep</th><th class="num">Ready</th><th class="num">Soreness</th><th>Pain</th></tr></thead><tbody>' +
            all.slice(0, 20).map(checkInRow).join('') + '</tbody></table></div>'
        : '<p class="muted">No check-ins yet.</p>'
    }) + '</div>';

    root.querySelector('#pgm-body').innerHTML = html;
    root.querySelector('[data-act="new-checkin"]').addEventListener('click', function () { openCheckIn(null); });
  }

  // =====================================================================
  // MAIN RENDER
  // =====================================================================
  function render(root, ctx) {
    // Deep link #/programs/<tabId> can preselect a sub-tab.
    if (ctx && ctx.param && TABS.some(function (t) { return t.id === ctx.param; })) state.tab = ctx.param;

    const players = store.getPlayers();
    const activeCount = activeAssignments().length;
    const onProgram = players.filter(function (p) {
      return store.byPlayer('programAssignments', p.id).some(function (a) { return a.status !== 'completed'; });
    }).length;
    const painCount = store.all('dailyCheckIns').filter(painFlagged).length;

    // Team-wide adherence across all active assignments (the "is everything OK?" number).
    let teamDue = 0, teamDone = 0;
    activeAssignments().forEach(function (a) {
      const adh = adherence(sessionsForAssignment(a.id));
      teamDue += adh.due; teamDone += adh.done;
    });
    const teamAdh = teamDue ? Math.round((teamDone / teamDue) * 100) : null;

    const subtitle = activeCount + ' active program(s)' + (painCount ? ' · ' + painCount + ' pain flag(s)' : '');

    let nav = '<div class="tabbar">' + TABS.map(function (t) {
      return '<button class="tabbar-item' + (state.tab === t.id ? ' active' : '') + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>';

    let hero = '';
    if (players.length) {
      hero = '<div class="stats">' +
        ui.statTile(teamAdh == null ? '—' : teamAdh + '%', 'Team adherence') +
        ui.statTile(activeCount + ' / ' + onProgram, 'Programs / players') +
        ui.statTile(painCount, 'Pain flags') +
        '</div>';
    }

    root.innerHTML = ui.pageHead('Programs & Check-In', subtitle) + nav + hero + '<div id="pgm-body"></div>';

    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); CT.router.route(); });
    });

    if (!players.length) {
      root.querySelector('#pgm-body').innerHTML = ui.emptyState('users', 'No players yet',
        'Add players in the Roster tab, then assign programs and log check-ins here.');
      return;
    }

    if (state.tab === 'builder') renderBuilder(root);
    else if (state.tab === 'checkin') renderCheckIn(root);
    else renderToday(root);
  }

  CT.registerView('programs', { label: 'Programs', render: render });
})();

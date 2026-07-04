/* views/session-log.js — the SHARED "Log a session / lesson" modal
   (CT.sessionLog.open). One modal for every launch point: Dashboard "Today"
   rows + quick actions, the Programs view's assignment cards, the header "+"
   popover, and the player profile (program day OR lesson).
   What it does:
     • Program mode (assignmentId given): shows that program day's items as a
       pre-checked checklist (drill items resolve names + sets/reps).
     • LESSON mode (no assignment — v4): a lesson is a SessionLog with
       assignmentId null. Adds a player picker (when launched without a
       playerId), a FOCUS chip row (model.SESSION_FOCUS, default remembered in
       settings.lessonFocusDefault), and a collapsed "Quick numbers" block of
       focus-mapped metric inputs that save as real metricReadings
       (source:'session', sessionLogId, device:'manual', confidence:'med') —
       so lesson numbers flow into trends, tool grades, and percentiles with
       zero extra plumbing.
     • Both: drills picker, notes, RPE, coach rating Δ, and — on throwing-type
       programs, for pitchers, or on throwing-focus lessons — a THROWS count
       with a LIVE Pitch Smart readout that HARD-BLOCKS saving when red.
   Saving inserts ONE SessionLog; throws > 0 auto-appends a workloadLog tagged
   sourceRef {kind:'session', id} so Pitch Smart sees the volume (idempotent —
   one workload row per saved session). No view registration: helper module. */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;
  const programs = CT.programs, pitchsmart = CT.pitchsmart;

  // Age bands where the 30-yard dash is the default speed test (matches assess.js).
  const THIRTY_DEFAULT_BANDS = ['9-10U', '11-12U'];
  const BASE_PATHS = [
    { value: '60', label: '60 ft (youth)' }, { value: '70', label: '70 ft' },
    { value: '80', label: '80 ft' }, { value: '90', label: '90 ft (HS+)' }
  ];

  function drillLabel(item) {
    const d = store.getDrill(item.drillId);
    let label = d ? d.name : 'Removed drill';
    if (item.sets) label += ' — ' + item.sets + '×' + (item.reps || '?');
    if (item.notes) label += ' · ' + item.notes;
    return label;
  }

  // The program-day checklist (pre-checked; unchecking records a skipped item).
  function checklistHtml(day) {
    if (!day || !day.items || !day.items.length) return '';
    const rows = day.items.map(function (it) {
      const label = it.kind === 'drill' ? drillLabel(it) : it.text;
      return '<label class="pgm-check"><input type="checkbox" data-item="' + esc(it.id) + '" checked /> ' + esc(label) + '</label>';
    }).join('');
    return '<div class="field"><label>Plan for this day</label>' +
      '<div class="pgm-checks" style="flex-direction:column;align-items:flex-start;">' + rows + '</div></div>';
  }

  // Focus -> drill-library category (mixed has no single home category).
  const FOCUS_TO_DRILL_CAT = {
    hitting: 'hitting', throwing: 'throwing', fielding: 'fielding',
    speed: 'speed', strength: 'strength', mixed: null
  };

  // Drill checkbox list, focus category first (lesson mode auto-leads with it).
  function drillListHtml(focus) {
    const lib = store.drillLibrary();
    let cats = model.DRILL_CATEGORIES.slice();
    const lead = focus && FOCUS_TO_DRILL_CAT[focus];
    if (lead && cats.indexOf(lead) >= 0) {
      cats = [lead].concat(cats.filter(function (c) { return c !== lead; }));
    }
    let body = '';
    cats.forEach(function (cat) {
      const rows = lib.filter(function (d) { return d.category === cat; });
      if (!rows.length) return;
      body += '<div class="sl-drill-cat">' + esc(model.DRILL_CATEGORY_LABELS[cat] || cat) + '</div>' +
        rows.map(function (d) {
          return '<label class="pgm-check"><input type="checkbox" data-extra="' + esc(d.id) + '" /> ' + esc(d.name) + '</label>';
        }).join('');
    });
    return body;
  }

  // Collapsible drills picker (lessons live off this entirely).
  function drillPickerHtml(openByDefault, focus) {
    const lib = store.drillLibrary();
    if (!lib.length) return '';
    return '<details class="sl-drills"' + (openByDefault ? ' open' : '') + '>' +
      '<summary class="btn btn-ghost btn-sm"><i data-lucide="list-plus"></i>' +
      (openByDefault ? 'Drills worked (from library)' : 'Extra drills (beyond the plan)') + '</summary>' +
      '<div class="sl-drill-list" id="sl-drill-list">' + drillListHtml(focus) + '</div></details>';
  }

  // ---------------------------------------------------------------------------
  // Lesson focus chips + quick numbers (v4)
  // ---------------------------------------------------------------------------
  function focusChipsHtml(active) {
    return '<div class="field"><label>Focus</label><div class="focus-chips" id="sl-focus">' +
      model.SESSION_FOCUS.map(function (f) {
        return '<button type="button" class="focus-chip' + (f === active ? ' active' : '') +
          '" data-focus="' + f + '">' + esc(model.SESSION_FOCUS_LABELS[f] || f) + '</button>';
      }).join('') + '</div></div>';
  }

  // Quick-number metric specs per focus. Context conventions match assess.js
  // (ASSESS_CTX) so lesson readings compare cleanly with assessment readings.
  function quickMetricsFor(focus, player) {
    if (focus === 'hitting') {
      return [
        { key: 'exitVeloMax', context: 'tee' },
        { key: 'batSpeed', context: 'tee' }
      ];
    }
    if (focus === 'throwing') {
      return [
        { key: 'fastballVelo', context: 'bullpen' },
        { key: 'maxThrowDist', context: 'practice' }
      ];
    }
    if (focus === 'speed') {
      const band = model.bandFor(player);
      const key = (band && THIRTY_DEFAULT_BANDS.indexOf(band) >= 0) ? 'thirtyYard' : 'sixtyYard';
      return [{ key: key, context: 'test' }];
    }
    if (focus === 'fielding' && model.isCatcher(player)) {
      return [{ key: 'popTime', context: 'practice', basePath: true }];
    }
    return [];
  }

  function quickNumbersHtml(focus, player) {
    const specs = quickMetricsFor(focus, player);
    if (!specs.length) {
      return '<p class="muted" style="font-size:var(--fs-data);margin:var(--sp-2) 0 0;">No quick numbers for this focus' +
        (focus === 'fielding' ? ' (pop time is catchers-only)' : '') + ' — capture the work in notes, or run a full assessment.</p>';
    }
    return '<div class="qn-grid">' + specs.map(function (s) {
      const m = model.metric(s.key);
      return ui.formField({
        type: 'number', name: 'qn-' + s.key,
        label: m.label + ' (' + m.unit + ')',
        min: m.range[0], max: m.range[1], step: 0.1,
        placeholder: 'optional'
      });
    }).join('') +
    (specs.some(function (s) { return s.basePath; })
      ? ui.formField({ type: 'select', name: 'qn-basepath', label: 'Base path', value: '60', options: BASE_PATHS })
      : '') +
    '</div>' +
    '<p class="muted" style="font-size:var(--fs-label);margin:var(--sp-2) 0 0;">Saved as real readings — they show up in trends and tool grades.</p>';
  }

  // Live Pitch Smart readout under the throws field. Returns { html, blocked, v }.
  function throwsReadout(player, dateISO, throwsN) {
    const v = pitchsmart.evaluate(player, store.byPlayer('workloadLogs', player.id), { asOf: dateISO });
    if (!v.cleared) {
      const why = String(v.reasons[0] || 'Pitch Smart limit').replace(/\.\s*$/, '');
      return { blocked: true, v: v, html: '<span class="sl-ps-red"><i data-lucide="shield-alert"></i>NOT cleared to throw ' +
        (dateISO === CT.todayISO() ? 'today' : 'on ' + esc(CT.formatDate(dateISO))) + ' — ' + esc(why) + '. Save is blocked while throws &gt; 0.</span>' };
    }
    const rem = v.remainingToday;
    if (throwsN != null && throwsN > rem) {
      return { blocked: true, v: v, html: '<span class="sl-ps-red"><i data-lucide="shield-alert"></i>' + throwsN +
        ' throws would exceed the ' + v.dailyMax + '-pitch daily max for ' + esc(v.ageBand) + ' (' + rem + ' left). Save is blocked.</span>' };
    }
    return { blocked: false, v: v, html: '<span class="sl-ps-ok"><i data-lucide="shield-check"></i>Pitch Smart: ' + rem +
      ' of ' + v.dailyMax + ' throws left (' + esc(v.ageBand) + ').</span>' };
  }

  /**
   * open({ playerId?, assignmentId?, weekIndex?, dayIndex?, date?, focus?, onSaved? })
   * Program mode when assignmentId resolves; LESSON mode otherwise. In lesson
   * mode playerId is optional — the modal shows a player picker when missing.
   */
  function open(opts) {
    opts = opts || {};
    const players = store.getPlayers();
    if (!players.length) { ui.toast('Add a player first.'); return; }

    // Lesson launched without a player (header +, dashboard, onboarding):
    // show a player picker, defaulting to the roster's first player.
    const pickPlayer = !opts.playerId && !opts.assignmentId;
    let player = pickPlayer ? players[0] : store.getPlayer(opts.playerId);
    if (!player) { ui.toast('Player not found.'); return; }

    const assignment = opts.assignmentId ? store.getById('programAssignments', opts.assignmentId) : null;
    const program = assignment ? store.getById('programs', assignment.programId) : null;
    const wk = program ? (opts.weekIndex != null ? opts.weekIndex : programs.weekIndexFor(assignment, program)) : 0;
    const di = opts.dayIndex != null ? opts.dayIndex : 0;
    const day = program ? programs.dayFor(program, wk, di) : null;
    const lesson = !program;

    // Lesson focus: explicit -> last used (settings) -> hitting.
    const settings = store.getSettings();
    let focus = lesson ? (opts.focus || settings.lessonFocusDefault || 'hitting') : null;
    if (lesson && model.SESSION_FOCUS.indexOf(focus) < 0) focus = 'hitting';

    // Throws field: throwing-type program days, pitchers, or throwing-focus lessons.
    function showThrowsFor(f) {
      return program ? program.type === 'throwing' : (model.isPitcher(player) || f === 'throwing');
    }
    const showThrows = showThrowsFor(focus);

    const heading = program
      ? esc(program.name) + ' · week ' + (wk + 1) + '/' + program.weeks + ' · ' + esc(player.name)
      : 'Lesson · ' + esc(player.name);

    const playerField = (lesson && pickPlayer)
      ? ui.formField({
          type: 'select', name: 'sl-player', label: 'Player', value: player.id,
          options: players.map(function (p) { return { value: p.id, label: p.name }; })
        })
      : '';

    const html =
      '<p class="muted" style="margin-top:0;">' + heading + '</p>' +
      playerField +
      ui.formField({ type: 'date', name: 'date', label: 'Date', value: opts.date || CT.todayISO(), required: true }) +
      (lesson ? focusChipsHtml(focus) : '') +
      checklistHtml(day) +
      drillPickerHtml(lesson, focus) +
      (lesson
        ? '<details class="sl-drills qn-block"><summary class="btn btn-ghost btn-sm"><i data-lucide="gauge"></i>Quick numbers</summary>' +
          '<div class="qn-body" id="sl-qn">' + quickNumbersHtml(focus, player) + '</div></details>'
        : '') +
      '<div class="field-row">' +
        // The live Pitch Smart readout sits INSIDE the throws slot, directly
        // under the input, so a red status is visible while typing — never
        // below the fold with only the save-time toast as a backstop.
        '<div id="sl-throws-slot"' + (showThrows ? '' : ' hidden') + '>' +
          ui.formField({ type: 'number', name: 'throws', label: 'Throws (count)', min: 0, max: 200, step: 1, placeholder: '0' }) +
          '<div id="sl-ps-note" class="sl-ps-note" aria-live="polite"' + (showThrows ? '' : ' hidden') + '></div>' +
        '</div>' +
        ui.formField({ type: 'number', name: 'rpe', label: 'Effort (RPE 1–10)', min: 1, max: 10, step: 1 }) +
        ui.formField({ type: 'number', name: 'ratingDelta', label: 'Coach rating change', min: -2, max: 2, step: 0.1, help: 'Optional: −2 to +2 vs the last session.' }) +
      '</div>' +
      ui.formField({ type: 'textarea', name: 'notes', label: 'Notes', placeholder: 'What you worked on, cues, what to repeat next time…' }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save"><i data-lucide="clipboard-check"></i>' + (lesson ? 'Log lesson' : 'Log session') + '</button>' +
      '</div>';

    ui.openModal(lesson ? 'Log lesson' : 'Log session', html, function (modal, close) {
      const get = function (n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
      const psNote = modal.querySelector('#sl-ps-note');
      const throwsSlot = modal.querySelector('#sl-throws-slot');

      function refreshPs() {
        if (!psNote || psNote.hidden) return;
        const dateISO = get('date') || CT.todayISO();
        const t = get('throws') === '' ? null : Math.max(0, Math.round(Number(get('throws'))));
        psNote.innerHTML = throwsReadout(player, dateISO, t).html;
        if (window.lucide) { try { window.lucide.createIcons(); } catch (e) {} }
      }
      refreshPs();
      const tEl = modal.querySelector('[name="throws"]');
      const dEl = modal.querySelector('[name="date"]');
      if (tEl) tEl.addEventListener('input', refreshPs);
      if (dEl) dEl.addEventListener('change', refreshPs);

      // Player picker: switching players re-opens the modal for that player so
      // band-dependent bits (Pitch Smart, quick-number defaults) stay honest.
      const pSel = modal.querySelector('[name="sl-player"]');
      if (pSel) pSel.addEventListener('change', function () {
        open(Object.assign({}, opts, { playerId: pSel.value, focus: focus, date: get('date') }));
      });

      // Focus chips: swap active chip, quick numbers, drill order, throws field.
      modal.querySelectorAll('#sl-focus .focus-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          focus = chip.getAttribute('data-focus');
          modal.querySelectorAll('#sl-focus .focus-chip').forEach(function (c) {
            c.classList.toggle('active', c === chip);
          });
          const qn = modal.querySelector('#sl-qn');
          if (qn) qn.innerHTML = quickNumbersHtml(focus, player);
          const list = modal.querySelector('#sl-drill-list');
          if (list) {
            // Preserve any checked drills across the category re-order.
            const picked = {};
            list.querySelectorAll('[data-extra]:checked').forEach(function (cb) { picked[cb.getAttribute('data-extra')] = true; });
            list.innerHTML = drillListHtml(focus);
            list.querySelectorAll('[data-extra]').forEach(function (cb) {
              if (picked[cb.getAttribute('data-extra')]) cb.checked = true;
            });
          }
          const show = showThrowsFor(focus);
          if (throwsSlot) throwsSlot.hidden = !show;
          if (psNote) { psNote.hidden = !show; refreshPs(); }
          if (window.lucide) { try { window.lucide.createIcons(); } catch (e) {} }
        });
      });

      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const dateISO = get('date');
        if (!dateISO) { ui.toast('Date is required.'); return; }
        const throwsVisible = throwsSlot && !throwsSlot.hidden;
        const throwsN = (!throwsVisible || get('throws') === '') ? null : Math.max(0, Math.round(Number(get('throws'))));

        // HARD BLOCK: red Pitch Smart status (or over the daily max) stops
        // logged throwing volume — re-evaluated at save time, never cached.
        if (throwsN != null && throwsN > 0) {
          const check = throwsReadout(player, dateISO, throwsN);
          if (check.blocked) {
            ui.toast('Blocked by Pitch Smart: ' + (check.v.cleared
              ? ('only ' + check.v.remainingToday + ' throws left for ' + check.v.ageBand + '.')
              : (check.v.reasons[0] || 'not cleared to throw.')));
            refreshPs();
            return;
          }
        }

        // Quick numbers (lesson mode): validate BEFORE inserting anything.
        const readings = [];
        const warnings = [];
        if (lesson) {
          const specs = quickMetricsFor(focus, player);
          let firstError = null;
          specs.forEach(function (s) {
            if (firstError) return;
            const raw = get('qn-' + s.key);
            if (raw === '') return; // blank = not measured
            const m = model.metric(s.key);
            const reading = {
              playerId: player.id,
              metricKey: s.key,
              value: Number(raw),
              unit: m.unit,
              aggregation: 'max',
              context: s.context,
              device: 'manual',
              confidence: 'med',
              basePath: s.basePath ? (Number(get('qn-basepath')) || null) : null,
              source: 'session',
              date: dateISO
            };
            const v = model.validateMetricReading(reading, player);
            if (!v.ok) { firstError = v.errors[0]; return; }
            v.warnings.forEach(function (w) { warnings.push(w); });
            readings.push(reading);
          });
          if (firstError) { ui.toast(firstError); return; }
        }

        const itemChecks = {};
        modal.querySelectorAll('[data-item]').forEach(function (cb) { itemChecks[cb.getAttribute('data-item')] = cb.checked; });
        const extraDrillIds = Array.prototype.slice.call(modal.querySelectorAll('[data-extra]:checked'))
          .map(function (cb) { return cb.getAttribute('data-extra'); });
        const rpe = get('rpe') === '' ? null : Number(get('rpe'));
        const rd = get('ratingDelta') === '' ? null : Number(get('ratingDelta'));

        const log = store.insert('sessionLogs', {
          playerId: player.id,
          date: dateISO,
          focus: lesson ? focus : null,
          assignmentId: assignment ? assignment.id : null,
          programDayRef: program ? { weekIndex: wk, dayIndex: di } : null,
          itemChecks: itemChecks,
          extraDrillIds: extraDrillIds,
          notes: get('notes'),
          rpe: rpe,
          throws: throwsN,
          ratingDelta: (rd != null && Number.isFinite(rd)) ? rd : null
        });

        // Lesson quick numbers -> real metric readings with provenance.
        readings.forEach(function (r) {
          store.append('metricReadings', Object.assign({ sessionLogId: log.id }, r));
        });

        // Throws feed Pitch Smart via an idempotent sourceRef-tagged workload log.
        if (throwsN != null && throwsN > 0) {
          store.append('workloadLogs', {
            playerId: player.id, date: dateISO,
            type: 'practice',
            pitches: throwsN, outs: 0, rpe: rpe,
            sourceRef: { kind: 'session', id: log.id },
            notes: program ? (program.name + ' session') : 'Lesson'
          });
        }

        // Remember the coach's lesson focus for next time.
        if (lesson) store.updateSettings({ lessonFocusDefault: focus });

        warnings.forEach(function (w) { ui.toast(w); });
        close();
        ui.toast(lesson
          ? ('Lesson logged' + (readings.length ? ' · ' + readings.length + ' reading' + (readings.length === 1 ? '' : 's') : ''))
          : 'Session logged');
        if (typeof opts.onSaved === 'function') opts.onSaved(log); else CT.router.route();
      });
    });
  }

  window.CT.sessionLog = { open: open };
})();

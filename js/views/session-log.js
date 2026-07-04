/* views/session-log.js — the SHARED "Log a session" modal (CT.sessionLog.open).
   One modal for every launch point: Dashboard "Today" rows, the Programs view's
   assignment cards, and the player profile (program day OR ad-hoc session).
   What it does:
     • Program mode (assignmentId given): shows that program day's items as a
       pre-checked checklist (drill items resolve names + sets/reps).
     • Ad-hoc mode: no checklist — pick drills straight from the library.
     • Both: extra drills picker, notes, RPE, coach rating Δ, and — on
       throwing-type programs or for pitchers — a THROWS count with a LIVE
       Pitch Smart readout that HARD-BLOCKS saving when the arm is red.
   Saving inserts ONE SessionLog; throws > 0 auto-appends a workloadLog tagged
   sourceRef {kind:'session', id} so Pitch Smart sees the volume (idempotent —
   one workload row per saved session). No view registration: helper module. */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;
  const programs = CT.programs, pitchsmart = CT.pitchsmart;

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

  // Collapsible extra-drills picker (ad-hoc sessions live off this entirely).
  function drillPickerHtml(openByDefault) {
    const lib = store.drillLibrary();
    if (!lib.length) return '';
    let body = '';
    model.DRILL_CATEGORIES.forEach(function (cat) {
      const rows = lib.filter(function (d) { return d.category === cat; });
      if (!rows.length) return;
      body += '<div class="sl-drill-cat">' + esc(model.DRILL_CATEGORY_LABELS[cat] || cat) + '</div>' +
        rows.map(function (d) {
          return '<label class="pgm-check"><input type="checkbox" data-extra="' + esc(d.id) + '" /> ' + esc(d.name) + '</label>';
        }).join('');
    });
    return '<details class="sl-drills"' + (openByDefault ? ' open' : '') + '>' +
      '<summary class="btn btn-ghost btn-sm"><i data-lucide="list-plus"></i>' +
      (openByDefault ? 'Drills worked (from library)' : 'Extra drills (beyond the plan)') + '</summary>' +
      '<div class="sl-drill-list">' + body + '</div></details>';
  }

  // Live Pitch Smart readout under the throws field. Returns { html, verdict }.
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
   * open({ playerId, assignmentId?, weekIndex?, dayIndex?, date?, onSaved? })
   * Program mode when assignmentId resolves; ad-hoc otherwise.
   */
  function open(opts) {
    opts = opts || {};
    const player = store.getPlayer(opts.playerId);
    if (!player) { ui.toast('Player not found.'); return; }

    const assignment = opts.assignmentId ? store.getById('programAssignments', opts.assignmentId) : null;
    const program = assignment ? store.getById('programs', assignment.programId) : null;
    const wk = program ? (opts.weekIndex != null ? opts.weekIndex : programs.weekIndexFor(assignment, program)) : 0;
    const di = opts.dayIndex != null ? opts.dayIndex : 0;
    const day = program ? programs.dayFor(program, wk, di) : null;
    const adhoc = !program;

    // Throws field: throwing-type program days, or any pitcher ad-hoc.
    const showThrows = program ? program.type === 'throwing' : model.isPitcher(player);

    const heading = program
      ? esc(program.name) + ' · week ' + (wk + 1) + '/' + program.weeks + ' · ' + esc(player.name)
      : 'Ad-hoc coaching session · ' + esc(player.name);

    const html =
      '<p class="muted" style="margin-top:0;">' + heading + '</p>' +
      ui.formField({ type: 'date', name: 'date', label: 'Date', value: opts.date || CT.todayISO(), required: true }) +
      checklistHtml(day) +
      drillPickerHtml(adhoc) +
      '<div class="field-row">' +
        (showThrows
          ? ui.formField({ type: 'number', name: 'throws', label: 'Throws (count)', min: 0, max: 200, step: 1, placeholder: '0' })
          : '') +
        ui.formField({ type: 'number', name: 'rpe', label: 'RPE (1–10)', min: 1, max: 10, step: 1 }) +
        ui.formField({ type: 'number', name: 'ratingDelta', label: 'Rating Δ (−2…+2)', min: -2, max: 2, step: 0.1, help: 'Coach grade change.' }) +
      '</div>' +
      (showThrows ? '<div id="sl-ps-note" class="sl-ps-note" aria-live="polite"></div>' : '') +
      ui.formField({ type: 'textarea', name: 'notes', label: 'Notes', placeholder: 'What you worked on, cues, what to repeat next time…' }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save"><i data-lucide="clipboard-check"></i>Log session</button>' +
      '</div>';

    ui.openModal('Log session', html, function (modal, close) {
      const get = function (n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
      const psNote = modal.querySelector('#sl-ps-note');

      function refreshPs() {
        if (!psNote) return;
        const dateISO = get('date') || CT.todayISO();
        const t = get('throws') === '' ? null : Math.max(0, Math.round(Number(get('throws'))));
        psNote.innerHTML = throwsReadout(player, dateISO, t).html;
        if (window.lucide) { try { window.lucide.createIcons(); } catch (e) {} }
      }
      if (psNote) {
        refreshPs();
        const tEl = modal.querySelector('[name="throws"]');
        const dEl = modal.querySelector('[name="date"]');
        if (tEl) tEl.addEventListener('input', refreshPs);
        if (dEl) dEl.addEventListener('change', refreshPs);
      }

      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const dateISO = get('date');
        if (!dateISO) { ui.toast('Date is required.'); return; }
        const throwsN = get('throws') === '' ? null : Math.max(0, Math.round(Number(get('throws'))));

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

        const itemChecks = {};
        modal.querySelectorAll('[data-item]').forEach(function (cb) { itemChecks[cb.getAttribute('data-item')] = cb.checked; });
        const extraDrillIds = Array.prototype.slice.call(modal.querySelectorAll('[data-extra]:checked'))
          .map(function (cb) { return cb.getAttribute('data-extra'); });
        const rpe = get('rpe') === '' ? null : Number(get('rpe'));
        const rd = get('ratingDelta') === '' ? null : Number(get('ratingDelta'));

        const log = store.insert('sessionLogs', {
          playerId: player.id,
          date: dateISO,
          assignmentId: assignment ? assignment.id : null,
          programDayRef: program ? { weekIndex: wk, dayIndex: di } : null,
          itemChecks: itemChecks,
          extraDrillIds: extraDrillIds,
          notes: get('notes'),
          rpe: rpe,
          throws: throwsN,
          ratingDelta: (rd != null && Number.isFinite(rd)) ? rd : null
        });

        // Throws feed Pitch Smart via an idempotent sourceRef-tagged workload log.
        if (throwsN != null && throwsN > 0) {
          store.append('workloadLogs', {
            playerId: player.id, date: dateISO,
            type: 'practice',
            pitches: throwsN, outs: 0, rpe: rpe,
            sourceRef: { kind: 'session', id: log.id },
            notes: (program ? program.name : 'Coaching') + ' session'
          });
        }
        close();
        ui.toast('Session logged');
        if (typeof opts.onSaved === 'function') opts.onSaved(log); else CT.router.route();
      });
    });
  }

  window.CT.sessionLog = { open: open };
})();

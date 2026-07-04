/* views/program-wizard.js — PROGRAM GENERATOR wizard (hidden view,
   #/generate/<playerId>). Three steps:
     1. Domain + goal cards — locked goals show a lock + reason + one-tap
        substitute; the percentile-recommended goal gets a chip.
     2. Schedule — weeks/days within the variant's bounds, start date with a
        Pitch Smart preflight, in-season + long-layoff toggles, and the
        required confirmation checkboxes (persisted to Player.readiness).
     3. Preview — read-only week × day grid with intensity chips, the "why
        this program" line, safety notes → Create & assign.
   All decisions live in CT.generator / CT.generatorData — this file is UI. */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const INT_LABEL = { high: 'High', medium: 'Med', low: 'Low', recovery: 'Recovery' };

  // Wizard state survives internal re-renders; keyed on the player id.
  const state = {
    key: null, step: 1, domain: 'throwing', goalId: null,
    weeks: null, dpw: null, startDate: null,
    inSeason: false, longLayoff: false, injury: false, confirms: {}
  };

  function resetState(playerId) {
    state.key = playerId;
    state.step = 1;
    state.domain = 'throwing';
    state.goalId = null;
    state.weeks = null; state.dpw = null;
    state.startDate = CT.todayISO();
    state.inSeason = false; state.longLayoff = false; state.injury = false;
    state.confirms = {};
    state.plan = null;
  }

  function opts() {
    return {
      goalId: state.goalId, weeks: state.weeks, daysPerWeek: state.dpw,
      startDate: state.startDate, inSeason: state.inSeason,
      longLayoff: state.longLayoff, injury: state.injury,
      confirmations: state.confirms
    };
  }

  function intChip(intensity) {
    if (!intensity) return '';
    return '<span class="int-chip int-' + esc(intensity) + '">' + esc(INT_LABEL[intensity] || intensity) + '</span>';
  }

  function dots() {
    let h = '<div class="wiz-dots" aria-label="Step ' + state.step + ' of 3">';
    for (let i = 1; i <= 3; i++) {
      h += '<span class="wiz-dot' + (i === state.step ? ' active' : (i < state.step ? ' done' : '')) + '"></span>';
    }
    return h + '</div>';
  }

  // ---------------------------------------------------------------------------
  // STEP 1 — domain + goal cards
  // ---------------------------------------------------------------------------
  function goalCard(player, goal, rec) {
    const elig = CT.generator.eligibility(player, goal.id, { inSeason: state.inSeason });
    const locked = elig.status !== 'ok';
    const selected = state.goalId === goal.id;
    const recommended = rec[goal.domain] === goal.id;
    let inner =
      '<span class="mod-icon"><i data-lucide="' + (locked ? 'lock' : (goal.domain === 'throwing' ? 'target' : (goal.domain === 'hitting' ? 'zap' : 'dumbbell'))) + '"></i></span>' +
      '<span class="mod-body">' +
        '<span class="mod-title">' + esc(goal.label) +
          (recommended && !locked ? ' <span class="pill" style="' + ui.toneStyle('accent') + '">Recommended</span>' : '') +
        '</span>' +
        '<span class="mod-sub">' + esc(locked ? elig.reason : goal.blurb) + '</span>' +
        (recommended && !locked && rec.reasons[goal.domain]
          ? '<span class="mod-sub gen-rec-why">' + esc(rec.reasons[goal.domain]) + '</span>' : '') +
        (locked && elig.substituteGoalId
          ? '<button class="btn btn-sm gen-sub-btn" type="button" data-sub="' + esc(elig.substituteGoalId) + '">' +
            '<i data-lucide="corner-down-right"></i>Use ' + esc(elig.substituteLabel || 'the substitute') + ' instead</button>' : '') +
      '</span>' +
      '<span class="mod-check"><i data-lucide="check-circle-2"></i></span>';
    // A div (not <button>) — locked cards nest a real substitute <button>.
    return '<div class="mod-card gen-goal' + (selected ? ' checked' : '') + (locked ? ' gen-goal-locked' : '') +
      '" data-goal="' + esc(goal.id) + '"' + (locked ? ' data-locked="1"' : ' tabindex="0" role="button"') +
      ' aria-pressed="' + selected + '">' + inner + '</div>';
  }

  function step1Html(player) {
    const rec = CT.generator.recommend(player);
    const domains = CT.generatorData.DOMAINS;
    const tabs = '<div class="tabbar" role="tablist" style="margin-bottom:var(--sp-3);">' +
      domains.map(function (d) {
        return '<button class="tabbar-item' + (d.id === state.domain ? ' active' : '') + '" data-domain="' + esc(d.id) + '">' + esc(d.label) + '</button>';
      }).join('') + '</div>';
    const goals = CT.generatorData.GOALS.filter(function (g) { return g.domain === state.domain; });
    return ui.card({
      title: 'Pick a goal',
      subtitle: 'Every goal is age-gated — locked options say why and offer the safe substitute',
      body: tabs + '<div class="mod-grid">' + goals.map(function (g) { return goalCard(player, g, rec); }).join('') + '</div>' +
        '<div class="modal-actions" style="margin-top:var(--sp-4);">' +
          '<a class="btn btn-ghost" href="#/player/' + esc(player.id) + '">Cancel</a>' +
          '<button class="btn btn-primary" data-act="to-step2"' + (state.goalId ? '' : ' disabled') + '>Continue<i data-lucide="arrow-right"></i></button>' +
        '</div>'
    });
  }

  // ---------------------------------------------------------------------------
  // STEP 2 — schedule + gates
  // ---------------------------------------------------------------------------
  function minStartDate(player, goal) {
    if (!goal || goal.type !== 'throwing' || !model.isPitcher(player)) return null;
    const verdict = CT.pitchsmart.evaluate(player, store.byPlayer('workloadLogs', player.id));
    if (verdict.status === 'red' && verdict.daysUntilEligible > 0) {
      const p = CT.todayISO().split('-');
      const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      d.setDate(d.getDate() + verdict.daysUntilEligible);
      const tz = d.getTimezoneOffset() * 60000;
      return { date: new Date(d - tz).toISOString().slice(0, 10), verdict: verdict };
    }
    return null;
  }

  function step2Html(player) {
    const goal = CT.generatorData.GOALS.find(function (g) { return g.id === state.goalId; });
    const elig = CT.generator.eligibility(player, state.goalId, { inSeason: state.inSeason, injury: state.injury });

    if (elig.status !== 'ok') {
      return ui.card({
        title: 'Schedule',
        body: '<div class="pgm-referral"><i data-lucide="lock"></i><span>' + esc(elig.reason) + '</span></div>' +
          (elig.substituteGoalId
            ? '<button class="btn btn-sm gen-sub-btn" data-sub2="' + esc(elig.substituteGoalId) + '"><i data-lucide="corner-down-right"></i>Switch to the substitute goal</button>' : '') +
          (state.inSeason
            ? '<p class="muted" style="margin-top:var(--sp-3);">This goal is off-season only — turn the in-season toggle off, or pick a maintenance goal.</p>' +
              '<label class="field-check" style="display:flex;align-items:center;gap:.5rem;margin-top:var(--sp-2);">' +
                '<input type="checkbox" id="gen-inseason" ' + (state.inSeason ? 'checked' : '') + ' style="width:20px;height:20px;min-height:0;" /> Player is in-season right now</label>'
            : '') +
          '<div class="modal-actions" style="margin-top:var(--sp-4);">' +
            '<button class="btn btn-ghost" data-act="back1"><i data-lucide="arrow-left"></i>Back</button>' +
          '</div>'
      });
    }

    const variant = elig.variant;
    if (state.weeks == null) state.weeks = variant.weeks.def;
    if (state.dpw == null) state.dpw = variant.dpw.def;
    state.weeks = Math.min(variant.weeks.max, Math.max(variant.weeks.min, state.weeks));
    state.dpw = Math.min(variant.dpw.max, Math.max(variant.dpw.min, state.dpw));
    const pattern = (variant.pattern || CT.generatorData.PATTERNS[state.dpw] || [1, 3, 5]).slice(0, state.dpw);
    const ms = minStartDate(player, goal);
    if (ms && state.startDate < ms.date) state.startDate = ms.date;

    const weeksLocked = variant.weeks.min === variant.weeks.max || !!variant.rfs;
    const dpwLocked = variant.dpw.min === variant.dpw.max || !!variant.lockSchedule;

    let togglesHtml =
      '<label class="field-check gen-toggle"><input type="checkbox" id="gen-inseason"' + (state.inSeason ? ' checked' : '') + ' /> ' +
        '<span><strong>In-season right now</strong><span class="muted"> — switches to the maintenance variant; overload bats and weighted balls stay locked.</span></span></label>';
    if (state.goalId === 'thr-rfs') {
      togglesHtml +=
        '<label class="field-check gen-toggle"><input type="checkbox" id="gen-layoff"' + (state.longLayoff ? ' checked' : '') + ' /> ' +
          '<span><strong>Long layoff (4+ weeks without throwing)</strong><span class="muted"> — every ladder step runs twice.</span></span></label>' +
        '<label class="field-check gen-toggle"><input type="checkbox" id="gen-injury"' + (state.injury ? ' checked' : '') + ' /> ' +
          '<span><strong>Returning from injury / post-op</strong><span class="muted"> — requires physician clearance below.</span></span></label>';
    }

    const confirms = elig.confirms || [];
    let confirmHtml = '';
    if (confirms.length) {
      confirmHtml = '<div class="wiz-section"><div class="wiz-section-head"><i data-lucide="shield-check"></i><h3>Required confirmations</h3></div>' +
        confirms.map(function (c) {
          const on = state.confirms[c.key] || c.preChecked;
          if (c.preChecked && !(c.key in state.confirms)) state.confirms[c.key] = true;
          return '<label class="field-check gen-toggle"><input type="checkbox" data-confirm="' + esc(c.key) + '"' + (on ? ' checked' : '') + ' /> ' +
            '<span>' + esc(c.label) + (c.preChecked ? ' <span class="pill" style="' + ui.toneStyle('green') + '">On file</span>' : '') + '</span></label>';
        }).join('') +
        '<p class="muted" style="font-size:var(--fs-data);margin:var(--sp-2) 0 0;">Confirmed flags are saved to the player\'s readiness record.</p></div>';
    }

    const warningsHtml = (elig.warnings || []).map(function (w) {
      return '<div class="pgm-referral"><i data-lucide="alert-triangle"></i><span>' + esc(w) + '</span></div>';
    }).join('') + (ms
      ? '<div class="pgm-referral"><i data-lucide="shield-alert"></i><span>Pitch Smart: ' +
        esc(ms.verdict.reasons[0] || 'resting') + ' Start dates before ' + esc(CT.formatDate(ms.date)) + ' are blocked.</span></div>'
      : '');

    const allConfirmed = confirms.every(function (c) { return state.confirms[c.key] || c.preChecked; });

    return ui.card({
      title: 'Schedule — ' + variant.name,
      subtitle: (variant.description || '').split('\n')[0],
      body:
        warningsHtml +
        '<div class="field-row">' +
          ui.formField({ type: 'number', name: 'gen-weeks', label: 'Weeks (' + variant.weeks.min + '–' + variant.weeks.max + ')', value: state.weeks, min: variant.weeks.min, max: variant.weeks.max, step: 1 }) +
          ui.formField({ type: 'number', name: 'gen-dpw', label: 'Days / week (' + variant.dpw.min + '–' + variant.dpw.max + ')', value: state.dpw, min: variant.dpw.min, max: variant.dpw.max, step: 1 }) +
          ui.formField({ type: 'date', name: 'gen-start', label: 'Start date', value: state.startDate }) +
        '</div>' +
        '<div class="help" style="margin:calc(-1 * var(--sp-2)) 0 var(--sp-3);">Training days: ' +
          pattern.map(function (n) { return DOW[n]; }).join(' · ') +
          (variant.lockSchedule ? ' — locked (every-other-day soreness-gated ladder)' : '') +
          ((weeksLocked && dpwLocked) ? ' · length fixed by the protocol' : '') + '</div>' +
        togglesHtml +
        confirmHtml +
        '<div class="modal-actions" style="margin-top:var(--sp-4);">' +
          '<button class="btn btn-ghost" data-act="back1"><i data-lucide="arrow-left"></i>Back</button>' +
          '<button class="btn btn-primary" data-act="to-step3"' + (allConfirmed ? '' : ' disabled') + '>Preview program<i data-lucide="arrow-right"></i></button>' +
        '</div>'
    });
  }

  // ---------------------------------------------------------------------------
  // STEP 3 — preview + create
  // ---------------------------------------------------------------------------
  function drillName(drillId) {
    const d = store.getDrill(drillId);
    if (d) return d.name;
    const slug = String(drillId).indexOf(CT.seeds.ID_PREFIX) === 0
      ? String(drillId).slice(CT.seeds.ID_PREFIX.length) : null;
    const seed = slug ? CT.seeds.bySlug(slug) : null;
    return seed ? seed.name : 'Drill';
  }

  function previewItem(it) {
    if (it.kind === 'drill') {
      let label = drillName(it.drillId);
      if (it.sets) label += ' — ' + it.sets + '×' + (it.reps || '?');
      return '<li class="pgm-item"><i data-lucide="dumbbell"></i><span>' + esc(label) +
        (it.notes ? ' <span class="muted gen-item-note">' + esc(it.notes) + '</span>' : '') + '</span></li>';
    }
    return '<li class="pgm-item"><i data-lucide="check-square"></i><span>' + esc(it.text) + '</span></li>';
  }

  function previewGrid(plan) {
    const prog = plan.program;
    const pattern = plan.assignment.daysOfWeek || [];
    // Group consecutive identical weeks so a 16-week block stays readable.
    const weekSig = [];
    for (let w = 0; w < prog.weeks; w++) {
      weekSig.push(JSON.stringify(prog.days.filter(function (d) { return d.weekIndex === w; })
        .map(function (d) { return [d.title, d.intensity, d.items]; })));
    }
    let rows = '', w = 0;
    while (w < prog.weeks) {
      let end = w;
      while (end + 1 < prog.weeks && weekSig[end + 1] === weekSig[w]) end++;
      const days = prog.days.filter(function (d) { return d.weekIndex === w; })
        .sort(function (a, b) { return a.dayIndex - b.dayIndex; });
      const label = end > w ? 'Weeks <span class="num">' + (w + 1) + '–' + (end + 1) + '</span>'
        : 'Week <span class="num">' + (w + 1) + '</span>';
      const cells = days.map(function (d) {
        return '<div class="pb-day pgm-day-read">' +
          '<div class="pb-day-head gen-day-head" style="cursor:default;">' +
            '<span>' + esc(DOW[pattern[d.dayIndex]] || ('Day ' + (d.dayIndex + 1))) + '</span>' + intChip(d.intensity) + '</div>' +
          '<div class="gen-day-title">' + esc(d.title || '') + '</div>' +
          '<ul class="pgm-items">' + (d.items || []).map(previewItem).join('') + '</ul>' +
        '</div>';
      }).join('');
      rows += '<div class="pb-week"><div class="pb-week-label">' + label + '</div>' +
        '<div class="pb-week-days" style="grid-template-columns:repeat(' + Math.max(1, days.length) + ',minmax(200px,1fr));">' + cells + '</div></div>';
      w = end + 1;
    }
    return '<div class="pb-grid">' + rows + '</div>';
  }

  function step3Html(player) {
    const plan = CT.generator.generate(player, opts());
    if (!plan.ok) {
      return ui.card({
        title: 'Preview',
        body: '<div class="pgm-referral"><i data-lucide="lock"></i><span>' + esc(plan.reason) + '</span></div>' +
          '<div class="modal-actions" style="margin-top:var(--sp-4);">' +
            '<button class="btn btn-ghost" data-act="back2"><i data-lucide="arrow-left"></i>Back</button>' +
          '</div>'
      });
    }
    state.plan = plan;
    const prog = plan.program;
    const safety = (plan.variant.safety || []);
    const desc = prog.description.split('\n').filter(function (l) {
      return l && l.indexOf('Why this program:') !== 0 && l.indexOf('SAFETY:') !== 0;
    });
    return ui.card({
      rawTitle: true,
      title: esc(prog.name) + ' <span class="pill" style="' + ui.toneStyle('accent') + '">Generated</span>',
      subtitle: prog.weeks + ' weeks × ' + prog.daysPerWeek + ' days/week · starts ' + CT.formatDate(plan.assignment.startDate) +
        (prog.ageGateMin != null ? ' · hard age gate ' + prog.ageGateMin + '+' : ''),
      body:
        '<div class="gen-why"><i data-lucide="sparkles"></i><span>' + esc(plan.why) + '</span></div>' +
        plan.warnings.map(function (wn) {
          return '<div class="pgm-referral"><i data-lucide="alert-triangle"></i><span>' + esc(wn) + '</span></div>';
        }).join('') +
        (safety.length
          ? '<div class="gen-safety">' + safety.map(function (s) {
              return '<div class="gen-safety-row"><i data-lucide="shield-alert"></i><span>' + esc(s) + '</span></div>';
            }).join('') + '</div>'
          : '') +
        '<p class="muted" style="font-size:var(--fs-data);">' + esc(desc.join(' ')) + '</p>' +
        previewGrid(plan) +
        '<div class="modal-actions" style="margin-top:var(--sp-4);">' +
          '<button class="btn btn-ghost" data-act="back2"><i data-lucide="arrow-left"></i>Back</button>' +
          '<button class="btn btn-primary" data-act="create"><i data-lucide="check"></i>Create &amp; assign</button>' +
        '</div>'
    });
  }

  // ---------------------------------------------------------------------------
  // Render + wiring
  // ---------------------------------------------------------------------------
  function repaint() {
    try { if (window.lucide) window.lucide.createIcons(); } catch (e) {}
  }

  function render(root, ctx) {
    const player = ctx && ctx.param ? store.getPlayer(ctx.param) : null;
    if (!player) {
      root.innerHTML = ui.pageHead('Build a program', 'Generate an age-safe training block') +
        ui.emptyState('user-round', 'Pick a player first',
          'The generator needs a player — every gate is driven by their age and readings.',
          '<a class="btn btn-primary" href="#/players"><i data-lucide="users"></i>Go to Players</a>');
      return;
    }
    if (state.key !== player.id) resetState(player.id);
    const age = model.ageFromBirthdate(player.birthdate);
    const band = model.bandFor(player);

    let stepHtml;
    if (state.step === 1) stepHtml = step1Html(player);
    else if (state.step === 2) stepHtml = step2Html(player);
    else stepHtml = step3Html(player);

    root.innerHTML =
      '<a class="back-link" href="#/player/' + esc(player.id) + '"><i data-lucide="chevron-left"></i>' + esc(player.name) + '</a>' +
      ui.pageHead('Build a program',
        player.name + (age != null ? ' · ' + age + ' yrs (' + (band || '—') + ')' : '') +
        ' — deterministic, research-backed, every hard gate enforced') +
      dots() +
      '<div class="' + (state.step === 3 ? '' : 'wiz-wrap') + '">' + stepHtml + '</div>';

    wire(root, player);
    repaint();
  }

  function rerender(root, player) {
    // Internal step changes re-render in place (hash unchanged).
    render(root, { param: player.id, navigate: CT.router.navigate });
    window.scrollTo(0, 0);
  }

  function wire(root, player) {
    // Step 1: domain tabs + goal cards + substitutes.
    root.querySelectorAll('[data-domain]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.domain = b.getAttribute('data-domain');
        rerender(root, player);
      });
    });
    root.querySelectorAll('.gen-goal').forEach(function (card) {
      card.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && !card.getAttribute('data-locked')) {
          e.preventDefault();
          card.click();
        }
      });
      card.addEventListener('click', function (e) {
        const sub = e.target.closest('[data-sub]');
        if (sub) {
          state.goalId = sub.getAttribute('data-sub');
          state.weeks = null; state.dpw = null; state.confirms = {};
          const g = CT.generatorData.GOALS.find(function (x) { return x.id === state.goalId; });
          if (g) state.domain = g.domain;
          rerender(root, player);
          return;
        }
        if (card.getAttribute('data-locked')) return;
        state.goalId = card.getAttribute('data-goal');
        state.weeks = null; state.dpw = null; state.confirms = {};
        rerender(root, player);
      });
    });
    const sub2 = root.querySelector('[data-sub2]');
    if (sub2) sub2.addEventListener('click', function () {
      state.goalId = sub2.getAttribute('data-sub2');
      state.weeks = null; state.dpw = null; state.confirms = {};
      rerender(root, player);
    });

    // Step navigation.
    const to2 = root.querySelector('[data-act="to-step2"]');
    if (to2) to2.addEventListener('click', function () {
      if (!state.goalId) return;
      state.step = 2;
      rerender(root, player);
    });
    const back1 = root.querySelector('[data-act="back1"]');
    if (back1) back1.addEventListener('click', function () { state.step = 1; rerender(root, player); });
    const to3 = root.querySelector('[data-act="to-step3"]');
    if (to3) to3.addEventListener('click', function () { state.step = 3; rerender(root, player); });
    const back2 = root.querySelector('[data-act="back2"]');
    if (back2) back2.addEventListener('click', function () { state.step = 2; rerender(root, player); });

    // Step 2 inputs.
    function onNum(name, fn) {
      const el = root.querySelector('[name="' + name + '"]');
      if (el) el.addEventListener('change', function () { fn(Number(el.value)); rerender(root, player); });
    }
    onNum('gen-weeks', function (v) { state.weeks = v; });
    onNum('gen-dpw', function (v) { state.dpw = v; });
    const start = root.querySelector('[name="gen-start"]');
    if (start) {
      const goal = CT.generatorData.GOALS.find(function (g) { return g.id === state.goalId; });
      const ms = minStartDate(player, goal);
      if (ms) start.min = ms.date;
      start.addEventListener('change', function () {
        state.startDate = start.value || CT.todayISO();
        if (ms && state.startDate < ms.date) {
          state.startDate = ms.date;
          ui.toast('Pitch Smart: earliest eligible start is ' + CT.formatDate(ms.date));
        }
        rerender(root, player);
      });
    }
    [['gen-inseason', 'inSeason'], ['gen-layoff', 'longLayoff'], ['gen-injury', 'injury']].forEach(function (pair) {
      const el = root.querySelector('#' + pair[0]);
      if (el) el.addEventListener('change', function () {
        state[pair[1]] = el.checked;
        state.weeks = null; state.dpw = null; // re-clamp to the (possibly new) variant
        rerender(root, player);
      });
    });
    root.querySelectorAll('[data-confirm]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        state.confirms[cb.getAttribute('data-confirm')] = cb.checked;
        rerender(root, player);
      });
    });

    // Step 3: create & assign.
    const create = root.querySelector('[data-act="create"]');
    if (create) create.addEventListener('click', function () {
      const plan = state.plan || CT.generator.generate(player, opts());
      if (!plan.ok) { ui.toast(plan.reason || 'Could not generate.'); return; }
      const out = CT.generator.commit(player, plan);
      resetState(null);
      ui.toast('Program created & assigned to ' + player.name);
      CT.router.navigate('#/programs/' + out.program.id);
    });
  }

  CT.registerView('generate', { label: 'Build program', render: render, hidden: true });

  window.CT.views = window.CT.views || {};
  window.CT.views.programWizard = { render: render };
})();

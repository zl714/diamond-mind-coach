/* views/assess.js — ASSESSMENTS (nav view 3). The v3 modular assessment system.
   Routes (all under #/assess):
     #/assess                 — history: stat tiles + every session, newest first
     #/assess/new[/playerId]  — 3-step flow: (1) who/when  (2) MODULE PICKER
                                (3) one entry section per module with live
                                percentile preview (Diamond Capsule) where an
                                age-band benchmark exists, "trend vs self" where not
     #/assess/<sessionId>     — session summary (receipt-style rows: value, delta
                                vs previous reading, percentile capsule)
     #/assess/<playerId>      — one player's assessment history + latest values
   Modules (model.ASSESS_MODULES): Hitting [exitVeloMax tee-locked, batSpeed,
   notes], Throwing [fastballVelo "Throwing Velo", maxThrowDist "Long-Toss
   Distance"], Speed [sixtyYard OR thirtyYard + homeToFirst], Fielding [popTime,
   catchers only, base-path select, notes], Body [height/weight -> anthroReadings].
   The coach's last module selection is remembered (settings.assessPreset) and
   pre-checks the next assessment. Values are validated via
   model.validateMetricReading (out-of-range = reject, band-implausible = warn)
   and written as ONE assessmentSession + N append-only metricReadings
   (source:'assessment'). Registers via CT.registerView('assess', ...). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;

  const SESSION_TYPES = [
    { value: 'assessment', label: 'Assessment' },
    { value: 'showcase', label: 'Showcase' },
    { value: 'practice', label: 'Practice' }
  ];
  const BASE_PATHS = [
    { value: '60', label: '60 ft (youth)' }, { value: '70', label: '70 ft' },
    { value: '80', label: '80 ft' }, { value: '90', label: '90 ft (HS+)' }
  ];
  // Context each metric is captured in during a standard assessment.
  const ASSESS_CTX = {
    exitVeloMax: 'tee', batSpeed: 'tee', fastballVelo: 'bullpen',
    maxThrowDist: 'practice', sixtyYard: 'test', thirtyYard: 'test',
    homeToFirst: 'test', popTime: 'practice'
  };
  // Age bands where the 30-yard dash is the default speed test (younger kids).
  const THIRTY_DEFAULT_BANDS = ['9-10U', '11-12U'];

  // ---------------------------------------------------------------------------
  // Wizard state (module-level so internal step changes survive; reset on open).
  // ---------------------------------------------------------------------------
  let wiz = null;

  function newWiz(playerId) {
    const settings = store.getSettings();
    const players = store.getPlayers();
    const pid = (playerId && store.getPlayer(playerId)) ? playerId : (players[0] && players[0].id);
    const w = {
      step: 1,
      playerId: pid,
      date: CT.todayISO(),
      type: 'assessment',
      device: 'device',
      modules: {},
      speedKey: null,          // resolved per player band in step 3 if unset
      basePath: '60',
      values: {},              // metricKey -> raw string
      moduleNotes: { hitting: '', fielding: '' },
      heightIn: '', weightLb: ''
    };
    (settings.assessPreset || []).forEach(function (id) {
      if (model.ASSESS_MODULE_BY_ID[id]) w.modules[id] = true;
    });
    if (settings.speedDefault) w.speedKey = settings.speedDefault;
    return w;
  }

  function wizPlayer() { return wiz ? store.getPlayer(wiz.playerId) : null; }

  function defaultSpeedKey(player) {
    if (wiz && wiz.speedKey) return wiz.speedKey;
    const band = model.bandFor(player);
    return (band && THIRTY_DEFAULT_BANDS.indexOf(band) >= 0) ? 'thirtyYard' : 'sixtyYard';
  }

  function activeModuleIds() {
    return model.ASSESS_MODULES.filter(function (m) { return wiz.modules[m.id]; })
      .map(function (m) { return m.id; });
  }

  // ---------------------------------------------------------------------------
  // Shared formatting / percentile helpers
  // ---------------------------------------------------------------------------
  function fmtVal(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    return String(Math.round(Number(v) * 100) / 100);
  }

  function pctCapsule(pct, band) {
    return '<span class="asmt-pct">' +
      '<span class="asmt-pct-label num">P' + esc(String(Math.round(pct))) + '</span>' +
      ui.diamondMeter(pct, { small: true, label: Math.round(pct) + 'th percentile vs ' + band }) +
    '</span>';
  }

  // Previous non-voided reading of the same metric strictly before `r`.
  function previousReading(r) {
    const rows = store.byPlayer('metricReadings', r.playerId).filter(function (x) {
      return x.metricKey === r.metricKey && !x.voided && x.id !== r.id &&
        (x.date < r.date || (x.date === r.date && (x.createdAt || '') < (r.createdAt || '')));
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
    });
    return rows[rows.length - 1];
  }

  // Delta chip vs previous reading — improvement is green EVEN when the number
  // went down on a lower-is-better metric (a faster 60 is progress).
  function deltaChip(r, m) {
    const prev = previousReading(r);
    if (!prev) return '<span class="rcpt-delta muted">first</span>';
    const net = Math.round((r.value - prev.value) * 100) / 100;
    if (net === 0) return '<span class="rcpt-delta muted">±0</span>';
    const improved = m.lowerBetter ? net < 0 : net > 0;
    const tone = improved ? 'up' : 'down';
    const sign = net > 0 ? '+' : '−';
    return '<span class="rcpt-delta num" style="' + ui.toneStyle(tone) + '">' +
      '<i data-lucide="' + (improved ? 'trending-up' : 'trending-down') + '"></i>' +
      sign + Math.abs(net) + (m.unit ? ' ' + esc(m.unit) : '') + '</span>';
  }

  function readingsForSession(session) {
    return store.byPlayer('metricReadings', session.playerId)
      .filter(function (r) { return r.assessmentSessionId === session.id && !r.voided; });
  }

  function moduleChips(session) {
    const readings = readingsForSession(session);
    let ids = session.modules && session.modules.length ? session.modules.slice() : [];
    if (!ids.length) { // legacy sessions: derive from what was measured
      readings.forEach(function (r) {
        const mod = model.moduleForMetric(r.metricKey);
        if (mod && ids.indexOf(mod) < 0) ids.push(mod);
      });
    }
    return ids.map(function (id) {
      const m = model.ASSESS_MODULE_BY_ID[id];
      return ui.pill(m ? m.label : id, 'neutral');
    }).join(' ');
  }

  // ---------------------------------------------------------------------------
  // Receipt-style reading rows (shared by session detail + player latest values)
  // ---------------------------------------------------------------------------
  function readingRow(r, band, withDelta) {
    const m = model.metric(r.metricKey);
    if (!m) return '';
    const pct = band ? CT.benchmarks.percentileFor(band, r.metricKey, r.value) : null;
    return '<div class="rcpt-row">' +
      '<div class="rcpt-main">' +
        '<span class="rcpt-label">' + esc(m.label) +
          '<span class="rcpt-ctx muted">' + esc(r.context) + ' · ' + esc(r.device === 'device' ? 'device' : 'manual') +
          (r.basePath ? ' · ' + esc(String(r.basePath)) + ' ft' : '') + '</span></span>' +
        '<span class="rcpt-val num">' + esc(fmtVal(r.value)) +
          ' <span class="rcpt-unit muted">' + esc(r.unit || m.unit) + '</span></span>' +
        (withDelta ? deltaChip(r, m) : '') +
      '</div>' +
      (pct != null
        ? pctCapsule(pct, band)
        : '<div class="rcpt-trend muted">No age-band benchmark — tracked as trend vs. self</div>') +
    '</div>';
  }

  // Catalog order so receipt rows group hitting -> throwing -> speed -> fielding.
  function sortReadings(rows) {
    const order = {};
    model.METRIC_CATALOG.forEach(function (m, i) { order[m.key] = i; });
    return rows.slice().sort(function (a, b) { return (order[a.metricKey] || 0) - (order[b.metricKey] || 0); });
  }

  // ---------------------------------------------------------------------------
  // WIZARD — step 1: who / when / how
  // ---------------------------------------------------------------------------
  function step1Html(players) {
    const player = wizPlayer();
    const band = player ? model.bandFor(player) : null;
    const age = player ? model.ageFromBirthdate(player.birthdate) : null;
    return ui.card({
      title: 'Who & when',
      subtitle: 'Step 1 of 3',
      body:
        '<div class="field-row">' +
          ui.formField({ type: 'select', name: 'wz-player', label: 'Player', value: wiz.playerId, required: true,
            options: players.map(function (p) { return { value: p.id, label: p.name }; }) }) +
          ui.formField({ type: 'date', name: 'wz-date', label: 'Date', value: wiz.date, required: true }) +
        '</div>' +
        '<div class="wiz-band muted">' +
          (player ? esc(player.name) + ' · ' + esc(band || 'no age band') + (age != null ? ' · ' + age + ' yrs' : '') +
            (band ? ' — percentiles use this band' : ' — add a birthdate for percentiles') : '') + '</div>' +
        '<div class="field-row">' +
          ui.formField({ type: 'select', name: 'wz-type', label: 'Session type', value: wiz.type, options: SESSION_TYPES }) +
          ui.formField({ type: 'select', name: 'wz-device', label: 'Measured with', value: wiz.device,
            options: [{ value: 'device', label: 'Device (radar/sensor)' }, { value: 'manual', label: 'Manual (stopwatch/eye)' }],
            help: 'Device readings are stored as high-confidence.' }) +
        '</div>' +
        '<div class="modal-actions">' +
          '<a class="btn btn-ghost" href="#/assess">Cancel</a>' +
          '<button class="btn btn-primary" data-wz="next1">Choose modules<i data-lucide="arrow-right"></i></button>' +
        '</div>'
    });
  }

  // ---------------------------------------------------------------------------
  // WIZARD — step 2: module picker (checkbox cards, pre-checked from preset)
  // ---------------------------------------------------------------------------
  function moduleCard(m, player) {
    const catcherLocked = m.catchersOnly && !model.isCatcher(player);
    const checked = !!wiz.modules[m.id] && !catcherLocked;
    const cls = 'mod-card' + (checked ? ' checked' : '') + (catcherLocked ? ' locked' : '');
    return '<label class="' + cls + '">' +
      '<input type="checkbox" data-mod="' + m.id + '"' + (checked ? ' checked' : '') + (catcherLocked ? ' disabled' : '') + ' />' +
      '<span class="mod-icon"><i data-lucide="' + m.icon + '"></i></span>' +
      '<span class="mod-body">' +
        '<span class="mod-title">' + esc(m.label) + '</span>' +
        '<span class="mod-sub">' + esc(catcherLocked ? 'Catchers only — ' + (player ? player.name.split(' ')[0] : 'player') + ' doesn\'t catch.' : m.blurb) + '</span>' +
      '</span>' +
      '<span class="mod-check"><i data-lucide="check"></i></span>' +
    '</label>';
  }

  function step2Html() {
    const player = wizPlayer();
    return ui.card({
      title: 'What are you measuring?',
      subtitle: 'Step 2 of 3 — your selection is remembered for next time',
      body:
        '<div class="mod-grid">' +
          model.ASSESS_MODULES.map(function (m) { return moduleCard(m, player); }).join('') +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-ghost" data-wz="back1"><i data-lucide="arrow-left"></i>Back</button>' +
          '<button class="btn btn-primary" data-wz="next2">Enter numbers<i data-lucide="arrow-right"></i></button>' +
        '</div>'
    });
  }

  // ---------------------------------------------------------------------------
  // WIZARD — step 3: entry sections with live percentile preview
  // ---------------------------------------------------------------------------
  function metricField(key, band) {
    const m = model.metric(key);
    if (!m) return '';
    const hasBench = band && CT.benchmarks.get(band, key);
    const val = wiz.values[key] != null ? wiz.values[key] : '';
    return '<div class="wiz-metric" data-wm="' + key + '">' +
      '<div class="field-row wiz-metric-row">' +
        ui.formField({ type: 'number', name: 'wv-' + key, label: m.label + ' (' + m.unit + ')', value: val, step: 0.01,
          placeholder: m.lowerBetter ? 'faster = lower' : '' }) +
      '</div>' +
      '<div class="wiz-preview" data-preview="' + key + '">' +
        (hasBench ? '<span class="muted">Enter a value for a live percentile vs ' + esc(band) + '</span>'
                  : '<span class="muted">No age-band benchmark — tracked as trend vs. self</span>') +
      '</div>' +
    '</div>';
  }

  function moduleSection(mod, player, band) {
    let fields = '';
    if (mod.id === 'speed') {
      const speedKey = defaultSpeedKey(player);
      fields += ui.formField({ type: 'select', name: 'wz-speed', label: 'Dash distance', value: speedKey,
        options: [{ value: 'sixtyYard', label: '60-yard dash (13U+)' }, { value: 'thirtyYard', label: '30-yard dash (youth)' }],
        help: 'Younger bands default to the 30-yard dash.' });
      fields += metricField(speedKey, band);
      fields += metricField('homeToFirst', band);
    } else if (mod.id === 'body') {
      fields +=
        '<div class="field-row">' +
          ui.formField({ type: 'number', name: 'wz-height', label: 'Height (in)', value: wiz.heightIn, min: 40, max: 84, step: 0.5 }) +
          ui.formField({ type: 'number', name: 'wz-weight', label: 'Weight (lb)', value: wiz.weightLb, min: 50, max: 320, step: 1 }) +
        '</div>' +
        '<div class="wiz-preview"><span class="muted">Saved as a dated growth reading (height/weight history).</span></div>';
    } else {
      if (mod.id === 'fielding') {
        fields += ui.formField({ type: 'select', name: 'wz-basepath', label: 'Base path', value: wiz.basePath, options: BASE_PATHS,
          help: 'Pop times are only comparable at the same base path.' });
      }
      mod.metrics.forEach(function (key) { fields += metricField(key, band); });
    }
    if (mod.notes) {
      fields += ui.formField({ type: 'textarea', name: 'wz-notes-' + mod.id, label: mod.label + ' notes',
        value: wiz.moduleNotes[mod.id] || '', placeholder: 'What you saw, cues, follow-ups…' });
    }
    return '<div class="wiz-section">' +
      '<div class="wiz-section-head"><i data-lucide="' + mod.icon + '"></i><h3>' + esc(mod.label) + '</h3></div>' +
      fields +
    '</div>';
  }

  function step3Html() {
    const player = wizPlayer();
    const band = model.bandFor(player);
    const mods = model.ASSESS_MODULES.filter(function (m) { return wiz.modules[m.id]; });
    return ui.card({
      title: 'Enter the numbers',
      subtitle: 'Step 3 of 3 — ' + esc(player ? player.name : '') + ' · ' + esc(CT.formatDate(wiz.date)) +
        (band ? ' · percentiles vs ' + esc(band) : ''),
      body:
        mods.map(function (m) { return moduleSection(m, player, band); }).join('') +
        '<div class="modal-actions">' +
          '<button class="btn btn-ghost" data-wz="back2"><i data-lucide="arrow-left"></i>Back</button>' +
          '<button class="btn btn-primary" data-wz="save"><i data-lucide="check"></i>Save assessment</button>' +
        '</div>'
    });
  }

  // Live percentile preview under a metric input.
  function refreshPreview(rootEl, key, band) {
    const out = rootEl.querySelector('[data-preview="' + key + '"]');
    const inp = rootEl.querySelector('[name="wv-' + key + '"]');
    if (!out || !inp) return;
    const m = model.metric(key);
    const hasBench = band && CT.benchmarks.get(band, key);
    if (inp.value === '' || !Number.isFinite(Number(inp.value))) {
      out.innerHTML = hasBench
        ? '<span class="muted">Enter a value for a live percentile vs ' + esc(band) + '</span>'
        : '<span class="muted">No age-band benchmark — tracked as trend vs. self</span>';
      return;
    }
    const v = Number(inp.value);
    if (m.range && (v < m.range[0] || v > m.range[1])) {
      out.innerHTML = '<span style="color:var(--down);">Outside the plausible range (' + m.range[0] + '–' + m.range[1] + ' ' + esc(m.unit) + ')</span>';
      return;
    }
    if (!hasBench) {
      out.innerHTML = '<span class="muted">Logged as trend vs. self (no ' + (band ? esc(band) + ' ' : '') + 'benchmark)</span>';
      return;
    }
    const pct = CT.benchmarks.percentileFor(band, key, v);
    out.innerHTML = pct != null
      ? pctCapsule(pct, band) + '<span class="wiz-preview-note muted">vs ' + esc(band) + '</span>'
      : '<span class="muted">No benchmark for this band</span>';
    if (window.lucide) window.lucide.createIcons();
  }

  // ---------------------------------------------------------------------------
  // WIZARD — capture / save
  // ---------------------------------------------------------------------------
  function captureStepInputs(rootEl) {
    const g = function (n) { const el = rootEl.querySelector('[name="' + n + '"]'); return el ? el.value : null; };
    if (wiz.step === 1) {
      if (g('wz-player') != null) wiz.playerId = g('wz-player');
      if (g('wz-date')) wiz.date = g('wz-date');
      if (g('wz-type')) wiz.type = g('wz-type');
      if (g('wz-device')) wiz.device = g('wz-device');
    } else if (wiz.step === 3) {
      model.METRIC_CATALOG.forEach(function (m) {
        const v = g('wv-' + m.key);
        if (v != null) wiz.values[m.key] = v;
      });
      if (g('wz-basepath')) wiz.basePath = g('wz-basepath');
      if (g('wz-speed')) wiz.speedKey = g('wz-speed');
      if (g('wz-height') != null) wiz.heightIn = g('wz-height');
      if (g('wz-weight') != null) wiz.weightLb = g('wz-weight');
      ['hitting', 'fielding'].forEach(function (id) {
        const v = g('wz-notes-' + id);
        if (v != null) wiz.moduleNotes[id] = v;
      });
    }
  }

  function saveWizard() {
    const player = wizPlayer();
    if (!player) { ui.toast('Pick a player.'); return; }
    const band = model.bandFor(player);
    const mods = activeModuleIds();
    if (!mods.length) { ui.toast('Pick at least one module.'); return; }

    // Which metric keys are actually in play this session?
    const keys = [];
    mods.forEach(function (id) {
      const mod = model.ASSESS_MODULE_BY_ID[id];
      if (id === 'speed') { keys.push(defaultSpeedKey(player)); keys.push('homeToFirst'); }
      else if (id !== 'body') mod.metrics.forEach(function (k) { keys.push(k); });
    });

    const readings = [];
    const warnings = [];
    let firstError = null;
    keys.forEach(function (key) {
      if (firstError) return;
      const raw = wiz.values[key];
      if (raw == null || raw === '') return; // blank = not measured today
      const m = model.metric(key);
      const reading = {
        playerId: player.id,
        metricKey: key,
        value: Number(raw),
        unit: m.unit,
        aggregation: 'max',
        context: ASSESS_CTX[key] || (m.contexts && m.contexts[m.contexts.length - 1]) || 'test',
        device: wiz.device,
        confidence: wiz.device === 'device' ? 'high' : 'med',
        basePath: key === 'popTime' ? Number(wiz.basePath) || null : null,
        source: 'assessment',
        date: wiz.date
      };
      const v = model.validateMetricReading(reading, player);
      if (!v.ok) { firstError = v.errors[0]; return; }
      v.warnings.forEach(function (w) { warnings.push(w); });
      readings.push(reading);
    });
    if (firstError) { ui.toast(firstError); return; }

    const h = mods.indexOf('body') >= 0 ? String(wiz.heightIn || '').trim() : '';
    const w = mods.indexOf('body') >= 0 ? String(wiz.weightLb || '').trim() : '';
    if (!readings.length && !h && !w) { ui.toast('Enter at least one measurement.'); return; }

    const moduleNotes = {};
    ['hitting', 'fielding'].forEach(function (id) {
      if (mods.indexOf(id) >= 0 && (wiz.moduleNotes[id] || '').trim()) moduleNotes[id] = wiz.moduleNotes[id].trim();
    });

    const session = store.insert('assessmentSessions', {
      playerId: player.id, date: wiz.date, type: wiz.type, modules: mods, moduleNotes: moduleNotes
    });
    readings.forEach(function (r) {
      store.append('metricReadings', Object.assign({ assessmentSessionId: session.id }, r));
    });
    if (h || w) {
      store.append('anthroReadings', {
        playerId: player.id, date: wiz.date,
        heightIn: h ? Number(h) : null, weightLb: w ? Number(w) : null
      });
    }

    // Remember the coach's workflow for next time (graft B: assessPreset).
    store.updateSettings({ assessPreset: mods, speedDefault: wiz.speedKey || defaultSpeedKey(player) });

    warnings.forEach(function (msg) { ui.toast(msg); });
    ui.toast('Saved ' + readings.length + ' reading' + (readings.length === 1 ? '' : 's') + ' for ' + player.name);
    wiz = null;
    CT.router.navigate('#/assess/' + session.id);
  }

  // ---------------------------------------------------------------------------
  // WIZARD — mount / wire
  // ---------------------------------------------------------------------------
  function renderWizard(root) {
    const players = store.getPlayers();
    const stepLabel = ['Who & when', 'Modules', 'Numbers'][wiz.step - 1];
    let html = '<a class="back-link" href="#/assess"><i data-lucide="chevron-left"></i>Assessments</a>' +
      ui.pageHead('New assessment', 'Step ' + wiz.step + ' of 3 — ' + stepLabel);
    html += '<div class="wiz-dots" aria-hidden="true">' + [1, 2, 3].map(function (n) {
      return '<span class="wiz-dot' + (n === wiz.step ? ' active' : (n < wiz.step ? ' done' : '')) + '"></span>';
    }).join('') + '</div>';
    html += '<div class="wiz-wrap">';
    if (wiz.step === 1) html += step1Html(players);
    else if (wiz.step === 2) html += step2Html();
    else html += step3Html();
    html += '</div>';
    root.innerHTML = html;
    wireWizard(root);
    if (window.lucide) window.lucide.createIcons();
  }

  function wireWizard(root) {
    function go(step) {
      captureStepInputs(root);
      wiz.step = step;
      renderWizard(root);
      window.scrollTo(0, 0);
    }
    const b1 = root.querySelector('[data-wz="next1"]');
    if (b1) b1.addEventListener('click', function () {
      captureStepInputs(root);
      if (!store.getPlayer(wiz.playerId)) { ui.toast('Pick a player.'); return; }
      if (!wiz.date) { ui.toast('Pick a date.'); return; }
      wiz.step = 2; renderWizard(root); window.scrollTo(0, 0);
    });
    const back1 = root.querySelector('[data-wz="back1"]'); if (back1) back1.addEventListener('click', function () { go(1); });
    const b2 = root.querySelector('[data-wz="next2"]');
    if (b2) b2.addEventListener('click', function () {
      if (!activeModuleIds().length) { ui.toast('Pick at least one module.'); return; }
      wiz.step = 3; renderWizard(root); window.scrollTo(0, 0);
    });
    const back2 = root.querySelector('[data-wz="back2"]'); if (back2) back2.addEventListener('click', function () { go(2); });
    const save = root.querySelector('[data-wz="save"]');
    if (save) save.addEventListener('click', function () { captureStepInputs(root); saveWizard(); });

    // Step 1: switching player re-renders (band note + speed default follow).
    const psel = root.querySelector('[name="wz-player"]');
    if (psel) psel.addEventListener('change', function () { captureStepInputs(root); renderWizard(root); });

    // Step 2: module checkbox cards.
    root.querySelectorAll('[data-mod]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        wiz.modules[cb.getAttribute('data-mod')] = cb.checked;
        const card = cb.closest('.mod-card');
        if (card) card.classList.toggle('checked', cb.checked);
      });
    });

    // Step 3: live percentile previews + speed-key switch.
    const player = wizPlayer();
    const band = player ? model.bandFor(player) : null;
    root.querySelectorAll('.wiz-metric').forEach(function (el) {
      const key = el.getAttribute('data-wm');
      const inp = el.querySelector('[name="wv-' + key + '"]');
      if (inp) {
        inp.addEventListener('input', function () { refreshPreview(root, key, band); });
        refreshPreview(root, key, band);
      }
    });
    const speedSel = root.querySelector('[name="wz-speed"]');
    if (speedSel) speedSel.addEventListener('change', function () {
      captureStepInputs(root);
      wiz.speedKey = speedSel.value;
      renderWizard(root);
    });
  }

  // ---------------------------------------------------------------------------
  // SESSION DETAIL — receipt-style summary (save destination + history rows)
  // ---------------------------------------------------------------------------
  function sessionDetail(root, session) {
    const player = store.getPlayer(session.playerId);
    const band = player ? model.bandFor(player) : null;
    const readings = sortReadings(readingsForSession(session));
    const age = player ? model.ageFromBirthdate(player.birthdate) : null;
    const settings = store.getSettings();
    const anthro = (session.modules || []).indexOf('body') >= 0
      ? store.byPlayer('anthroReadings', session.playerId).filter(function (a) { return a.date === session.date; }).slice(-1)[0]
      : null;

    let rows = readings.map(function (r) { return readingRow(r, band, true); }).join('');
    if (anthro) {
      if (anthro.heightIn != null) rows += '<div class="rcpt-row"><div class="rcpt-main"><span class="rcpt-label">Height</span><span class="rcpt-val num">' + esc(fmtVal(anthro.heightIn)) + ' <span class="rcpt-unit muted">in</span></span></div></div>';
      if (anthro.weightLb != null) rows += '<div class="rcpt-row"><div class="rcpt-main"><span class="rcpt-label">Weight</span><span class="rcpt-val num">' + esc(fmtVal(anthro.weightLb)) + ' <span class="rcpt-unit muted">lb</span></span></div></div>';
    }
    if (!rows) rows = '<p class="muted">No readings were captured in this session.</p>';

    let notesHtml = '';
    if (session.moduleNotes) {
      Object.keys(session.moduleNotes).forEach(function (k) {
        const m = model.ASSESS_MODULE_BY_ID[k];
        notesHtml += '<div class="rcpt-note"><span class="rcpt-note-k">' + esc(m ? m.label : k) + '</span>' + esc(session.moduleNotes[k]) + '</div>';
      });
    }
    if (session.notes) notesHtml += '<div class="rcpt-note"><span class="rcpt-note-k">Session</span>' + esc(session.notes) + '</div>';

    root.innerHTML =
      '<a class="back-link" href="#/assess"><i data-lucide="chevron-left"></i>Assessments</a>' +
      ui.pageHead('Assessment summary', (player ? player.name : 'Player') + ' · ' + CT.formatDate(session.date),
        '<button class="btn" id="rcpt-print"><i data-lucide="printer"></i>Print report</button>' +
        (player ? '<a class="btn btn-primary" href="#/assess/new/' + esc(player.id) + '"><i data-lucide="clipboard-plus"></i>New assessment</a>' : '')) +
      '<div class="rcpt">' +
        '<div class="rcpt-head">' +
          '<div class="rcpt-who">' +
            '<div class="rcpt-name">' + esc(player ? player.name : 'Player') + '</div>' +
            '<div class="rcpt-sub muted">' + esc(band || '—') + (age != null ? ' · ' + age + ' yrs' : '') +
              ' · ' + esc(session.type) + ' · ' + esc(CT.formatDate(session.date)) + '</div>' +
          '</div>' +
          '<div class="rcpt-mods">' + moduleChips(session) + '</div>' +
        '</div>' +
        '<div class="rcpt-rows">' + rows + '</div>' +
        notesHtml +
        '<div class="rcpt-foot muted">' +
          esc((settings.orgName || settings.coachName) ? [settings.orgName, settings.coachName].filter(Boolean).join(' · ') : 'Diamond Mind') +
          ' · Percentiles are trend vs. age band, not pass/fail.' +
        '</div>' +
      '</div>' +
      (player ? '<div class="row" style="margin-top:var(--sp-4);">' +
        '<a class="btn" href="#/player/' + esc(player.id) + '"><i data-lucide="user-round"></i>Open profile &amp; trends</a>' +
        '<a class="btn" href="#/assess/' + esc(player.id) + '"><i data-lucide="history"></i>All ' + esc(player.name.split(' ')[0]) + ' assessments</a>' +
      '</div>' : '');

    const pr = root.querySelector('#rcpt-print');
    if (pr) pr.addEventListener('click', function () { window.print(); });
  }

  // ---------------------------------------------------------------------------
  // PLAYER HISTORY — one player's sessions + latest values per metric
  // ---------------------------------------------------------------------------
  function latestValuesBody(player) {
    const band = model.bandFor(player);
    const rows = [];
    model.METRIC_CATALOG.forEach(function (m) {
      const r = store.latestMetric(player.id, m.key);
      if (r) rows.push(r);
    });
    if (!rows.length) return '<p class="muted">No metric readings yet. Run an assessment to populate latest values.</p>';
    return '<div class="rcpt-rows">' + rows.map(function (r) { return readingRow(r, band, false); }).join('') + '</div>' +
      '<div class="help asmt-note"><i data-lucide="info"></i> Percentiles are TREND vs. age band, not pass/fail. ' +
      esc(CT.benchmarks.SOURCE_NOTE) + '</div>';
  }

  function sessionListRow(s) {
    const p = store.getPlayer(s.playerId);
    const n = readingsForSession(s).length;
    return '<a class="asmt-hist-row" href="#/assess/' + esc(s.id) + '">' +
      '<div class="asmt-hist-main">' +
        '<span class="asmt-hist-name">' + esc(p ? p.name : '(removed player)') + '</span>' +
        '<span class="asmt-hist-sub muted">' + esc(CT.formatDate(s.date)) + ' · ' + esc(s.type) +
          ' · ' + n + ' reading' + (n === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="asmt-hist-mods">' + moduleChips(s) + '</div>' +
      '<i data-lucide="chevron-right"></i>' +
    '</a>';
  }

  function playerHistory(root, player) {
    const sessions = store.byPlayer('assessmentSessions', player.id).sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
    });
    const age = model.ageFromBirthdate(player.birthdate);
    root.innerHTML =
      '<a class="back-link" href="#/assess"><i data-lucide="chevron-left"></i>All assessments</a>' +
      ui.pageHead('Assessments — ' + player.name,
        (model.bandFor(player) || '—') + (age != null ? ' · ' + age + ' yrs' : '') + ' · ' + sessions.length + ' session(s)',
        '<a class="btn btn-primary" href="#/assess/new/' + esc(player.id) + '"><i data-lucide="clipboard-plus"></i>New assessment</a>') +
      ui.card({ title: 'Latest values', subtitle: 'Newest reading per metric', body: latestValuesBody(player) }) +
      '<h3 style="margin:1.25rem 0 .6rem;">Session history</h3>' +
      (sessions.length
        ? '<div class="asmt-hist">' + sessions.map(sessionListRow).join('') + '</div>'
        : ui.emptyState('calendar', 'No sessions yet', 'Run this player\'s first assessment.'));
  }

  // ---------------------------------------------------------------------------
  // OVERVIEW — history of every session + tiles + CTA
  // ---------------------------------------------------------------------------
  function overview(root) {
    const players = store.getPlayers();
    const sessions = store.all('assessmentSessions').sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
    });
    const readingCount = store.all('metricReadings').filter(function (r) { return !r.voided; }).length;
    const assessed = players.filter(function (p) { return store.byPlayer('assessmentSessions', p.id).length > 0; }).length;

    let html = ui.pageHead('Assessments', sessions.length + ' session(s) · ' + readingCount + ' reading(s)',
      '<a class="btn btn-primary" href="#/assess/new"><i data-lucide="clipboard-plus"></i>New assessment</a>');

    html += '<div class="stats">' +
      ui.statTile(sessions.length, 'Sessions') +
      ui.statTile(readingCount, 'Readings') +
      ui.statTile(assessed + '/' + players.length, 'Players assessed') +
      '</div>';

    if (!sessions.length) {
      html += ui.emptyState('clipboard-list', 'No assessments yet',
        'Run your first assessment — pick a player, choose modules (hitting, throwing, speed…), and enter the numbers.',
        '<a class="btn btn-primary" href="#/assess/new"><i data-lucide="clipboard-plus"></i>New assessment</a>');
      root.innerHTML = html;
      return;
    }

    html += '<h3 style="margin:1.25rem 0 .6rem;">History</h3>' +
      '<div class="asmt-hist">' + sessions.map(sessionListRow).join('') + '</div>';
    root.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // main render / routing
  // ---------------------------------------------------------------------------
  function render(root, ctx) {
    const players = store.getPlayers();
    if (!players.length) {
      root.innerHTML = ui.pageHead('Assessments', 'Modular measurement sessions with age-band percentiles') +
        ui.emptyState('users', 'No players yet', 'Add a player first, then run their first assessment.',
          '<a class="btn btn-primary" href="#/players"><i data-lucide="user-plus"></i>Go to Players</a>');
      return;
    }

    const param = ctx && ctx.param;
    if (param && param.split('/')[0] === 'new') {
      const pid = param.split('/')[1] || null;
      // Fresh wizard when arriving (or when a preselected player differs).
      if (!wiz || (pid && wiz.playerId !== pid && wiz.step === 1)) wiz = newWiz(pid);
      if (pid && wiz && wiz.step === 1) wiz.playerId = store.getPlayer(pid) ? pid : wiz.playerId;
      renderWizard(root);
      return;
    }
    wiz = null; // leaving the wizard resets it

    if (param) {
      const session = store.getById('assessmentSessions', param);
      if (session) { sessionDetail(root, session); return; }
      const player = store.getPlayer(param);
      if (player) { playerHistory(root, player); return; }
    }
    overview(root);
  }

  CT.registerView('assess', { label: 'Assessments', render: render });
})();

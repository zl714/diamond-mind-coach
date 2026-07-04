/* views/assessment.js — Assessment Entry view.
   Log an assessment SESSION (player, date, sessionType, context, device, base-path)
   plus one-or-more metric rows (metricKey + value + aggregation). Values are
   validated against absolute range (REJECT) and per-age-band plausibility (WARN)
   via model.validateMetricReading, then written as append-only MetricReadings.
   After save we surface the player's updated LATEST values. Follows the roster.js
   pattern: IIFE, CT.ui builders, CT.store reads/writes, CT.router re-render.
   Registers itself via CT.registerView('assessment', { label, render }). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, charts = CT.charts, esc = CT.escapeHtml;

  // Session-level context choices (sanitized per-metric on save — see resolveContext).
  const ASMT_CONTEXTS = ['tee', 'front-toss', 'machine', 'live-bp', 'bullpen', 'game', 'practice', 'test'];
  const SESSION_TYPES = ['assessment', 'showcase', 'practice'];
  const BASE_PATHS = [{ value: '', label: 'n/a' }, { value: '60', label: '60 ft' }, { value: '70', label: '70 ft' }, { value: '80', label: '80 ft' }, { value: '90', label: '90 ft' }];
  const GROUP_LABELS = { hitting: 'Hitting', pitching: 'Pitching', throwing: 'Throwing/Arm', athleticism: 'Athleticism', anthro: 'Anthro' };

  // ----- helpers -----
  function metricOptions() {
    const opts = [];
    ['hitting', 'pitching', 'throwing', 'athleticism', 'anthro'].forEach(function (g) {
      model.metricsByGroup(g).forEach(function (m) {
        opts.push({ value: m.key, label: GROUP_LABELS[g] + ' · ' + m.label + ' (' + m.unit + ')' });
      });
    });
    return opts;
  }
  const METRIC_OPTS = metricOptions();

  // A metric's valid context list may not include the session default — fall back
  // to the metric's own default context so we never store an invalid pairing.
  function resolveContext(m, sessionCtx) {
    if (m && m.contexts && m.contexts.indexOf(sessionCtx) >= 0) return sessionCtx;
    return (m && m.contexts && m.contexts.length) ? m.contexts[m.contexts.length - 1] : 'game';
  }

  function fmtVal(v) {
    if (v == null || !Number.isFinite(Number(v))) return '—';
    const n = Number(v);
    return (Math.round(n * 100) / 100).toString();
  }

  function bandFor(player) {
    return player.ageBand || model.ageBandFromBirthdate(player.birthdate) || null;
  }

  function readingsForSession(session) {
    return store.byPlayer('metricReadings', session.playerId)
      .filter(function (r) { return r.assessmentSessionId === session.id && !r.voided; });
  }

  function chipHtml(r) {
    const m = model.metric(r.metricKey);
    const label = m ? m.label : r.metricKey;
    const unit = r.unit || (m ? m.unit : '');
    return '<div class="metric-chip">' +
      '<span class="mv">' + esc(fmtVal(r.value)) + (unit ? ' ' + esc(unit) : '') + '</span>' +
      '<span class="ml">' + esc(label) + ' · ' + esc(r.aggregation) + ' · ' + esc(r.context) + '</span>' +
      '</div>';
  }

  // Newest non-voided reading per metric for a player -> {m, r} rows.
  function latestRows(player) {
    const rows = [];
    model.METRIC_CATALOG.forEach(function (m) {
      const r = store.latestMetric(player.id, m.key);
      if (r) rows.push({ m: m, r: r });
    });
    return rows;
  }

  // Percentile rendered as a Baseball-Savant diverging bar (cold -> mid -> hot via
  // charts.savantColor) — the DM analytics treatment, NOT a green pass/fail color.
  // Label is tabular-nums and paired with the bar so it survives grayscale.
  function pctBar(pct) {
    const color = charts.savantColor(pct);
    return '<div class="asmt-pct">' +
      '<span class="asmt-pct-label num">P' + esc(String(pct)) + '</span>' +
      '<span class="pct-bar"><span style="width:' + pct + '%;background:' + color + ';"></span></span>' +
      '</div>';
  }

  function latestValuesBody(player) {
    const band = bandFor(player);
    const rows = latestRows(player);
    if (!rows.length) {
      return '<p class="muted">No metric readings yet. Log an assessment to populate latest values.</p>';
    }
    const list = rows.map(function (x) {
      const pct = band ? CT.benchmarks.percentileFor(band, x.m.key, x.r.value) : null;
      return '<div class="asmt-metric">' +
        '<div class="kv-row">' +
          '<span class="k">' + esc(x.m.label) +
            ' <span class="asmt-ctx muted">' + esc(x.r.aggregation) + ' · ' + esc(x.r.context) + '</span></span>' +
          '<span class="v num">' + esc(fmtVal(x.r.value)) +
            ' <span class="asmt-unit-inline muted">' + esc(x.r.unit || x.m.unit) + '</span></span>' +
        '</div>' +
        (pct != null ? pctBar(pct) : '') +
      '</div>';
    }).join('');
    return '<div class="asmt-metrics">' + list + '</div>' +
      '<div class="help asmt-note"><i data-lucide="info"></i> Percentiles are TREND vs. age band, not pass/fail. ' + esc(CT.benchmarks.SOURCE_NOTE) + '</div>';
  }

  function sessionCard(s) {
    const p = store.getPlayer(s.playerId);
    const rs = readingsForSession(s);
    const chips = rs.length ? rs.map(chipHtml).join('') : '<span class="muted">No readings</span>';
    return '<div class="session-card">' +
      '<div class="session-head">' +
        '<div><span class="session-date">' + esc(CT.formatDate(s.date)) + '</span> ' + ui.pill(s.type, 'neutral') +
          (s.location ? ' <span class="muted" style="font-size:.8rem;">' + esc(s.location) + '</span>' : '') + '</div>' +
        '<a class="btn btn-sm btn-ghost" href="#/assessment/' + esc(s.playerId) + '">' + esc(p ? p.name : 'Player') + '</a>' +
      '</div>' +
      '<div class="session-metrics">' + chips + '</div>' +
      (s.notes ? '<p class="session-notes">' + esc(s.notes) + '</p>' : '') +
      '</div>';
  }

  // ----- entry form -----
  function metricRowHtml(idx) {
    return '<div class="asmt-row" data-row="' + idx + '">' +
      ui.formField({ type: 'select', name: 'metric_' + idx, label: 'Metric', options: METRIC_OPTS }) +
      '<div class="field-row">' +
        ui.formField({ type: 'number', name: 'val_' + idx, label: 'Value', step: 0.1, placeholder: 'e.g. 62' }) +
        ui.formField({ type: 'select', name: 'agg_' + idx, label: 'Aggregation', value: 'max', options: [{ value: 'max', label: 'Max' }, { value: 'avg', label: 'Avg' }] }) +
      '</div>' +
      '<div class="asmt-row-foot">' +
        '<span class="muted asmt-unit" data-unit="' + idx + '"></span>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-remrow="' + idx + '">Remove</button>' +
      '</div>' +
      '</div>';
  }

  function openForm(preselectId) {
    let rowSeq = 0;
    const players = store.getPlayers();
    const playerOpts = players.map(function (p) { return { value: p.id, label: p.name }; });

    const html =
      '<div class="field-row">' +
        ui.formField({ type: 'select', name: 'playerId', label: 'Player', value: preselectId || (players[0] && players[0].id), options: playerOpts, required: true }) +
        ui.formField({ type: 'date', name: 'date', label: 'Date', value: CT.todayISO(), required: true }) +
      '</div>' +
      '<div class="field-row">' +
        ui.formField({ type: 'select', name: 'type', label: 'Session type', value: 'assessment', options: SESSION_TYPES }) +
        ui.formField({ type: 'select', name: 'context', label: 'Context', value: 'game', options: ASMT_CONTEXTS, help: 'Applied to each reading (auto-adjusted per metric).' }) +
      '</div>' +
      '<div class="field-row">' +
        ui.formField({ type: 'select', name: 'device', label: 'Device', value: 'device', options: model.DEVICES }) +
        ui.formField({ type: 'select', name: 'basePath', label: 'Base path', value: '', options: BASE_PATHS, help: 'Catcher pop-time only.' }) +
      '</div>' +
      ui.formField({ type: 'text', name: 'location', label: 'Location', placeholder: 'Optional' }) +
      '<h3 style="margin:1rem 0 .4rem;">Metric readings</h3>' +
      '<div id="asmt-rows">' + metricRowHtml(rowSeq) + '</div>' +
      '<button type="button" class="btn btn-sm btn-block" id="asmt-addrow" style="margin-top:.5rem;">+ Add metric</button>' +
      ui.formField({ type: 'textarea', name: 'notes', label: 'Session notes', placeholder: 'Optional' }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save">Save assessment</button>' +
      '</div>';

    ui.openModal('Log assessment', html, function (modal, close) {
      function val(n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value : ''; }
      function updateUnit(idx) {
        const sel = modal.querySelector('[name="metric_' + idx + '"]');
        const out = modal.querySelector('[data-unit="' + idx + '"]');
        if (!sel || !out) return;
        const m = model.metric(sel.value);
        if (!m) { out.textContent = ''; return; }
        out.textContent = 'Unit: ' + m.unit + ' · ' + (m.tier === 'core' ? 'core' : m.tier) + (m.youthNA ? ' · youth N/A' : '');
      }
      function wireRow(idx) {
        const sel = modal.querySelector('[name="metric_' + idx + '"]');
        if (sel) sel.addEventListener('change', function () { updateUnit(idx); });
        const rem = modal.querySelector('[data-remrow="' + idx + '"]');
        if (rem) rem.addEventListener('click', function () {
          const rows = modal.querySelectorAll('.asmt-row');
          if (rows.length <= 1) { ui.toast('At least one metric is required.'); return; }
          const r = modal.querySelector('[data-row="' + idx + '"]');
          if (r) r.remove();
        });
        updateUnit(idx);
      }
      wireRow(rowSeq);

      modal.querySelector('#asmt-addrow').addEventListener('click', function () {
        rowSeq += 1;
        const wrap = modal.querySelector('#asmt-rows');
        wrap.insertAdjacentHTML('beforeend', metricRowHtml(rowSeq));
        wireRow(rowSeq);
      });

      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const player = store.getPlayer(val('playerId'));
        if (!player) { ui.toast('Select a player.'); return; }
        const date = val('date') || CT.todayISO();
        const sessionCtx = val('context');
        const device = model.DEVICES.indexOf(val('device')) >= 0 ? val('device') : 'manual';
        const basePath = val('basePath');

        const readings = [];
        const warnings = [];
        let firstError = null;
        modal.querySelectorAll('.asmt-row').forEach(function (rowEl) {
          if (firstError) return;
          const idx = rowEl.getAttribute('data-row');
          const key = val('metric_' + idx);
          const raw = val('val_' + idx);
          if (raw === '' || raw == null) return;            // skip blank rows
          const m = model.metric(key);
          if (!m) { firstError = 'Unknown metric selected.'; return; }
          const reading = {
            playerId: player.id,
            metricKey: key,
            value: Number(raw),
            unit: m.unit,
            aggregation: val('agg_' + idx) === 'avg' ? 'avg' : 'max',
            context: resolveContext(m, sessionCtx)
          };
          const v = model.validateMetricReading(reading, player);
          if (!v.ok) { firstError = v.errors[0]; return; }   // REJECT out-of-range
          v.warnings.forEach(function (w) { warnings.push(w); });
          reading.device = device;
          reading.confidence = device === 'device' ? 'high' : 'med';
          reading.basePath = (m.key === 'popTime' && basePath) ? Number(basePath) : null;
          readings.push(reading);
        });

        if (firstError) { ui.toast(firstError); return; }    // reject whole submit
        if (!readings.length) { ui.toast('Add at least one metric reading.'); return; }

        const session = store.insert('assessmentSessions', {
          playerId: player.id, date: date, type: val('type') || 'assessment', location: val('location').trim(), notes: val('notes').trim()
        });
        readings.forEach(function (r) {
          store.append('metricReadings', Object.assign({ assessmentSessionId: session.id, date: date }, r));
        });

        close();
        warnings.forEach(function (w) { ui.toast(w); });      // surface plausibility warnings
        ui.toast('Saved ' + readings.length + ' reading' + (readings.length > 1 ? 's' : '') + ' for ' + player.name);
        // Show the player's updated latest values.
        CT.router.navigate('#/assessment/' + player.id);
      });
    });
  }

  // ----- main render -----
  function render(root, ctx) {
    const players = store.getPlayers();
    if (!players.length) {
      root.innerHTML = ui.pageHead('Assessments', 'Log assessment sessions & metric readings') +
        ui.emptyState('users', 'No players yet', 'Add a player on the Players tab before logging assessments.',
          '<a class="btn btn-primary" href="#/players"><i data-lucide="users"></i>Go to Players</a>');
      return;
    }

    const focus = ctx.param ? store.getPlayer(ctx.param) : null;
    const sessions = store.all('assessmentSessions').sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt < b.createdAt) ? 1 : -1;
    });

    // ----- single-player focus view (post-save / deep link) -----
    if (focus) {
      const mySessions = sessions.filter(function (s) { return s.playerId === focus.id; });
      const age = model.ageFromBirthdate(focus.birthdate);
      let html = '<a class="back-link" href="#/assessment"><i data-lucide="chevron-left"></i>All assessments</a>' +
        ui.pageHead('Assessments — ' + focus.name,
          (bandFor(focus) || '—') + (age != null ? ' · ' + age + ' yrs' : '') + ' · ' + mySessions.length + ' session(s)',
          '<button class="btn btn-primary" id="log-assess"><i data-lucide="clipboard-plus"></i>Log assessment</button>');
      html += ui.card({ title: 'Latest values', subtitle: 'Newest reading per metric', body: latestValuesBody(focus) });
      html += '<h3 style="margin:1.25rem 0 .6rem;">Session history</h3>';
      html += mySessions.length
        ? '<div class="timeline">' + mySessions.map(sessionCard).join('') + '</div>'
        : ui.emptyState('calendar', 'No sessions yet', 'Log this player\'s first assessment.');
      root.innerHTML = html;
      root.querySelector('#log-assess').addEventListener('click', function () { openForm(focus.id); });
      return;
    }

    // ----- overview view -----
    const readingCount = store.all('metricReadings').filter(function (r) { return !r.voided; }).length;
    const assessedPlayers = players.filter(function (p) { return store.byPlayer('assessmentSessions', p.id).length > 0; }).length;

    let html = ui.pageHead('Assessments', sessions.length + ' session(s) · ' + readingCount + ' reading(s)',
      '<button class="btn btn-primary" id="log-assess"><i data-lucide="clipboard-plus"></i>Log assessment</button>');

    html += '<div class="stats">' +
      ui.statTile(sessions.length, 'Sessions') +
      ui.statTile(readingCount, 'Readings') +
      ui.statTile(assessedPlayers + '/' + players.length, 'Players assessed') +
      '</div>';

    html += '<h3 style="margin:0 0 .6rem;">Latest values by player</h3>';
    html += '<div class="grid-cards">' + players.map(function (p) {
      const actions = '<a class="btn btn-sm" href="#/assessment/' + esc(p.id) + '"><i data-lucide="arrow-right"></i>Open</a>';
      return ui.card({ title: p.name, subtitle: (bandFor(p) || '—') + ' · ' + p.level, actions: actions, body: latestValuesBody(p) });
    }).join('') + '</div>';

    html += '<h3 style="margin:1.25rem 0 .6rem;">Recent sessions</h3>';
    html += sessions.length
      ? '<div class="timeline">' + sessions.slice(0, 12).map(sessionCard).join('') + '</div>'
      : ui.emptyState('clipboard-list', 'No assessments yet', 'Log your first assessment session to get started.',
          '<button class="btn btn-primary" id="log-empty"><i data-lucide="clipboard-plus"></i>Log assessment</button>');

    root.innerHTML = html;
    const log = root.querySelector('#log-assess');
    if (log) log.addEventListener('click', function () { openForm(null); });
    const le = root.querySelector('#log-empty');
    if (le) le.addEventListener('click', function () { openForm(null); });
  }

  // Reached from Players ("New assessment") and the player profile ("Log
  // assessment"); routable but not a top-level nav destination.
  CT.registerView('assessment', { label: 'Assessments', render: render, hidden: true });
})();

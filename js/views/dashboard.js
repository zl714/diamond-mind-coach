/* views/dashboard.js — Player Profile / Development Dashboard.
   Pick a player, see an anthro + age-band + level + cleared-to-pitch header, then
   tabbed metric sections (Hitting / Pitching / Throwing & Arm / Fielding /
   Athleticism). Each metric shows latest, personal best, a metric-over-time line
   (with age-band median overlay), a percentile-vs-age-band distribution, plus
   sample-size & capture-confidence indicators. Hitting adds a launch-angle
   histogram and an EVxLA scatter. Youth numbers are framed as TREND, not pass/fail.
   Built ONLY on the documented CT API. Registers via CT.registerView('dashboard'). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, stats = CT.stats;
  const benchmarks = CT.benchmarks, charts = CT.charts, esc = CT.escapeHtml;

  // Metric tabs. `fielding` is derived from fielding stat lines (not the catalog).
  const TABS = [
    { key: 'hitting', label: 'Hitting' },
    { key: 'pitching', label: 'Pitching' },
    { key: 'throwing', label: 'Throwing & Arm' },
    { key: 'fielding', label: 'Fielding' },
    { key: 'athleticism', label: 'Athleticism' }
  ];

  // ---------- small helpers ----------
  function playerBand(p) { return p.ageBand || model.ageBandFromBirthdate(p.birthdate) || null; }

  function latestAnthro(playerId) {
    const rows = store.byPlayer('anthroReadings', playerId);
    if (!rows.length) return null;
    return rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-1)[0];
  }

  function isPitcher(p) { return (p.positions || []).some(function (x) { return /pitch/i.test(x); }); }

  // Non-voided readings for one metric, oldest -> newest.
  function metricReadings(playerId, metricKey) {
    return store.byPlayer('metricReadings', playerId)
      .filter(function (r) { return r.metricKey === metricKey && !r.voided; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  }

  function bestOf(readings, lowerBetter) {
    if (!readings.length) return null;
    return readings.reduce(function (best, r) {
      if (best == null) return r.value;
      return lowerBetter ? Math.min(best, r.value) : Math.max(best, r.value);
    }, null);
  }

  function fmtVal(v, m) {
    if (v == null || !isFinite(v)) return '—';
    const s = String(Math.round(v * 10) / 10);
    return s + (m.unit === '%' ? '%' : (m.unit ? ' ' + m.unit : ''));
  }

  function confTone(c) { return c === 'high' ? 'green' : (c === 'low' ? 'red' : 'yellow'); }

  function heightStr(inches) {
    if (inches == null) return '—';
    return Math.floor(inches / 12) + "'" + Math.round(inches % 12) + '"';
  }

  // ---------- header ----------
  function clearance(p) {
    if (!isPitcher(p)) return { dot: 'neutral', label: 'Not a pitcher', v: null };
    const v = CT.pitchsmart.evaluate(p, store.byPlayer('workloadLogs', p.id));
    let label;
    if (v.status === 'red') label = v.daysUntilEligible > 0 ? 'Resting (' + v.daysUntilEligible + 'd)' : 'Not cleared';
    else if (v.status === 'yellow') label = 'Caution';
    else label = 'Cleared to pitch';
    return { dot: v.status, label: label, v: v };
  }

  function headerHtml(p) {
    const age = model.ageFromBirthdate(p.birthdate);
    const band = playerBand(p) || '—';
    const anthro = latestAnthro(p.id);
    const cl = clearance(p);
    const dotClass = cl.dot === 'neutral' ? '' : (' ' + cl.dot);
    const pos = (p.positions || []).join(', ') || '—';

    let kpis =
      '<div class="kpi"><div class="k">Height</div><div class="v" style="font-size:1.05rem;">' + esc(heightStr(anthro && anthro.heightIn != null ? anthro.heightIn : null)) + '</div></div>' +
      '<div class="kpi"><div class="k">Weight</div><div class="v" style="font-size:1.05rem;">' + esc(anthro && anthro.weightLb != null ? anthro.weightLb + ' lb' : '—') + '</div></div>' +
      '<div class="kpi"><div class="k">Age band</div><div class="v" style="font-size:1.05rem;">' + esc(band) + '</div></div>' +
      '<div class="kpi"><div class="k">Bats / Throws</div><div class="v" style="font-size:1.05rem;">' + esc((p.bats || '?') + ' / ' + (p.throws || '?')) + '</div></div>';

    // Pitch Smart detail for pitchers.
    if (cl.v) {
      const z = cl.v.acwr && cl.v.acwr.zone ? cl.v.acwr.zone : 'unknown';
      kpis +=
        '<div class="kpi"><div class="k">Remaining today</div><div class="v" style="font-size:1.05rem;">' + esc(cl.v.remainingToday + ' pit') + '</div></div>' +
        '<div class="kpi"><div class="k">12-mo innings</div><div class="v" style="font-size:1.05rem;">' + esc(Math.round(cl.v.rolling12moInnings) + ' / ' + cl.v.inningsCap) + '</div></div>' +
        '<div class="kpi"><div class="k">ACWR zone</div><div class="v" style="font-size:1.05rem;">' + esc(z) + '</div></div>' +
        '<div class="kpi"><div class="k">Days to eligible</div><div class="v" style="font-size:1.05rem;">' + esc(cl.v.daysUntilEligible > 0 ? cl.v.daysUntilEligible + 'd' : '0') + '</div></div>';
    }

    const body =
      '<div class="player-card">' +
        '<div class="avatar">' + esc(CT.initials(p.name)) + '</div>' +
        '<div class="meta">' +
          '<div class="name">' + esc(p.name) + '</div>' +
          '<div class="sub">' + esc(band) + (age != null ? ' · ' + age + ' yrs' : '') + ' · ' + esc(p.level || 'youth') + (p.jersey ? ' · #' + esc(p.jersey) : '') + '</div>' +
          '<div class="sub">' + esc(pos) + '</div>' +
          '<div style="margin-top:.45rem;"><span class="status-dot' + dotClass + '"></span>' +
            '<span style="font-weight:700;font-size:.9rem;color:var(--muted);">' + esc(cl.label) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-top:.8rem;">' + kpis + '</div>';

    return ui.card({ body: body });
  }

  // ---------- one metric card ----------
  function metricCardHtml(p, m, jobs) {
    const readings = metricReadings(p.id, m.key);
    if (!readings.length) return '';

    const latest = readings[readings.length - 1];
    const best = bestOf(readings, m.lowerBetter);
    const band = playerBand(p);
    const bench = band ? benchmarks.get(band, m.key) : null;
    const pct = band ? benchmarks.percentileFor(band, m.key, latest.value) : null;
    const small = readings.length < 3;

    const lineId = CT.uid('cv'), benchId = CT.uid('cv');

    // Capture-confidence + sample-size indicators.
    const indicators =
      ui.pill(readings.length + ' sample' + (readings.length === 1 ? '' : 's'), small ? 'yellow' : 'neutral') +
      ' ' + ui.pill('conf: ' + (latest.confidence || 'med'), confTone(latest.confidence)) +
      ' ' + ui.pill(latest.device === 'device' ? 'device' : 'manual', 'neutral') +
      ' ' + ui.pill(latest.context + (latest.aggregation ? ' · ' + latest.aggregation : ''), 'neutral') +
      (pct != null ? ' ' + ui.pill('~' + pct + 'th %ile (' + band + ')', 'neutral') : '');

    // Metric-over-time line (+ age-band median overlay when a benchmark exists).
    jobs.push(function () {
      const cv = document.getElementById(lineId);
      if (!cv) return;
      const ds = [{ label: m.label + ' (' + m.unit + ')', data: readings.map(function (r) { return r.value; }), fill: true }];
      if (bench && bench.p50 != null) {
        ds.push({ label: 'Age-band median', data: readings.map(function () { return bench.p50; }), color: charts.THEME.warn, fill: false });
      }
      charts.line(cv, { labels: readings.map(function (r) { return CT.formatDate(r.date); }), datasets: ds });
    });

    // Percentile-vs-age-band distribution (P10..P90 + the player's latest).
    if (bench) {
      jobs.push(function () {
        const cv = document.getElementById(benchId);
        if (!cv) return;
        const fill = charts.THEME.accentFill, you = charts.THEME.accent;
        charts.bar(cv, {
          labels: ['P10', 'P25', 'P50', 'P75', 'P90', 'You'],
          data: [bench.p10, bench.p25, bench.p50, bench.p75, bench.p90, latest.value],
          colors: [fill, fill, fill, fill, fill, you],
          label: m.label + ' (' + m.unit + ')'
        });
      });
    }

    const youthNote = (m.youthNA && band && model.AGE_BANDS.indexOf(band) <= 2)
      ? '<div class="dash-note" style="color:var(--danger);">Generally N/A for youth — interpret as exploratory only.</div>' : '';

    const body =
      '<div class="pill-row" style="margin-bottom:.6rem;">' + indicators + '</div>' +
      youthNote +
      '<div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:.7rem;">' +
        '<div class="kpi"><div class="k">Latest</div><div class="v">' + esc(fmtVal(latest.value, m)) + '</div></div>' +
        '<div class="kpi"><div class="k">Personal best</div><div class="v">' + esc(fmtVal(best, m)) + '</div></div>' +
      '</div>' +
      '<div class="chart-wrap"><canvas id="' + lineId + '"></canvas></div>' +
      (bench
        ? '<div class="dash-note" style="margin-top:.6rem;">Percentile vs ' + esc(band) + ' (left = lower, right = higher)</div>' +
          '<div class="chart-wrap"><canvas id="' + benchId + '"></canvas></div>'
        : '<div class="dash-note" style="margin-top:.6rem;">No age-band benchmark for this metric — read the trend line above.</div>');

    return ui.card({
      title: m.label,
      subtitle: m.tier === 'core' ? 'Core metric' : (m.tier === 'advanced' ? 'Advanced metric' : 'Derived metric'),
      body: body
    });
  }

  // ---------- hitting extras: launch-angle histogram + EVxLA scatter ----------
  function hittingExtrasHtml(p, jobs) {
    const la = metricReadings(p.id, 'launchAngle');
    const histId = CT.uid('cv'), scatId = CT.uid('cv');

    // Pair EV + LA captured in the same assessment session for the scatter.
    const evReadings = [];
    ['exitVeloMax', 'exitVeloAvg'].forEach(function (k) { evReadings.push.apply(evReadings, metricReadings(p.id, k)); });
    const laBySession = {};
    la.forEach(function (r) { if (r.assessmentSessionId) laBySession[r.assessmentSessionId] = r.value; });
    const points = [];
    evReadings.forEach(function (r) {
      if (r.assessmentSessionId && laBySession[r.assessmentSessionId] != null) {
        points.push({ x: laBySession[r.assessmentSessionId], y: r.value });
      }
    });

    if (la.length) {
      jobs.push(function () {
        const cv = document.getElementById(histId);
        if (!cv) return;
        const edges = [-20, -10, 0, 8, 16, 24, 32, 40, 50];
        const labels = [], counts = [];
        for (let i = 0; i < edges.length - 1; i++) {
          labels.push(edges[i] + '–' + edges[i + 1] + '°');
          counts.push(la.filter(function (r) { return r.value >= edges[i] && r.value < edges[i + 1]; }).length);
        }
        charts.bar(cv, { labels: labels, data: counts, label: 'Launch-angle captures' });
      });
    }
    if (points.length) {
      jobs.push(function () {
        const cv = document.getElementById(scatId);
        if (!cv) return;
        charts.scatter(cv, {
          points: points, label: 'EV (mph) vs LA (deg)',
          options: { scales: { x: { title: { display: true, text: 'Launch Angle (°)', color: charts.THEME.tick } }, y: { title: { display: true, text: 'Exit Velo (mph)', color: charts.THEME.tick } } } }
        });
      });
    }

    const histBody = la.length
      ? '<div class="chart-wrap"><canvas id="' + histId + '"></canvas></div>'
      : '<div class="dash-note">No launch-angle captures yet. Log Launch Angle in an assessment to populate this.</div>';
    const scatBody = points.length
      ? '<div class="dash-note">Sweet-spot zone is ~8–32°. Each point is one capture session.</div><div class="chart-wrap"><canvas id="' + scatId + '"></canvas></div>'
      : '<div class="dash-note">No paired Exit-Velo + Launch-Angle captures yet (log both in the same assessment).</div>';

    return ui.card({ title: 'Launch-Angle Histogram', subtitle: 'Batted-ball profile (trend)', body: histBody }) +
           ui.card({ title: 'Exit Velo × Launch Angle', subtitle: 'Barrel / sweet-spot context', body: scatBody });
  }

  // ---------- fielding tab (derived from raw fielding lines) ----------
  function fieldingHtml(p) {
    const lines = store.byPlayer('fieldingStatLines', p.id);
    if (!lines.length) {
      return ui.emptyState('🧤', 'No fielding data', 'Add fielding stat lines in the Games view to see reliability (PO/A/E) here.');
    }
    const f = stats.fieldingFromLines(lines);
    // Per-position breakdown.
    const byPos = {};
    lines.forEach(function (l) {
      const k = l.position || '—';
      if (!byPos[k]) byPos[k] = [];
      byPos[k].push(l);
    });
    let rows = '';
    Object.keys(byPos).forEach(function (pos) {
      const pf = stats.fieldingFromLines(byPos[pos]);
      rows += '<tr><td>' + esc(pos) + '</td><td>' + pf.po + '</td><td>' + pf.a + '</td><td>' + pf.e + '</td><td>' + stats.fmtRate(pf.fieldingPct) + '</td></tr>';
    });

    const body =
      '<div class="stats" style="margin-bottom:1rem;">' +
        ui.statTile(stats.fmtRate(f.fieldingPct), 'Reliability (FLD%)') +
        ui.statTile(String(f.po + f.a), 'Putouts + Assists') +
        ui.statTile(String(f.e), 'Errors') +
      '</div>' +
      '<div class="dash-note" style="margin-bottom:.6rem;">FLD% measures reliability, not ranking — youth defense is volatile, read it as a trend.</div>' +
      '<div class="table-wrap"><table class="ct-table"><thead><tr><th>Position</th><th>PO</th><th>A</th><th>E</th><th>FLD%</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>';
    return ui.card({ title: 'Fielding', subtitle: 'Reliability by position', body: body });
  }

  // ---------- which tabs have data (for default selection) ----------
  function tabHasData(p, key) {
    if (key === 'fielding') return store.byPlayer('fieldingStatLines', p.id).length > 0;
    return model.metricsByGroup(key).some(function (m) { return metricReadings(p.id, m.key).length > 0; });
  }

  // ---------- render one tab body ----------
  function renderTab(p, key, container) {
    const jobs = [];
    let html = '';

    if (key === 'fielding') {
      html = fieldingHtml(p);
    } else {
      const metrics = model.metricsByGroup(key);
      const cards = metrics.map(function (m) { return metricCardHtml(p, m, jobs); }).filter(Boolean);
      if (key === 'hitting') cards.push(hittingExtrasHtml(p, jobs));

      if (!cards.length) {
        html = ui.emptyState('📊', 'No ' + key + ' data yet',
          'Log ' + key + ' metrics in the Assessment view to populate this player\'s dashboard.');
      } else {
        // Youth-safety framing for benchmarked metric sections.
        html = '<div class="dash-note" style="margin-bottom:.85rem;">' +
          'Numbers are framed as <strong>trend vs. self</strong>, not pass/fail. ' +
          esc(benchmarks.SOURCE_NOTE) + '</div>' +
          '<div class="dash-metric-grid">' + cards.join('') + '</div>';
      }
    }

    container.innerHTML = html;
    // Charts must be drawn AFTER the canvases are in the DOM.
    jobs.forEach(function (job) { try { job(); } catch (e) { /* offline-safe */ } });
  }

  // ---------- main render ----------
  function render(root, ctx) {
    const players = store.getPlayers();

    if (!players.length) {
      root.innerHTML = ui.pageHead('Player Dashboard', 'Per-player development profile') +
        ui.emptyState('⚾', 'No players yet', 'Add a player in the Roster view to see their dashboard.',
          '<a class="btn btn-primary" href="#/roster">Go to Roster</a>');
      return;
    }

    // Selected player from deep-link param, else the first player.
    let player = ctx.param ? store.getPlayer(ctx.param) : null;
    if (!player) player = players[0];

    // Player selector (navigates to a deep link so the URL is shareable).
    const selector =
      '<select class="select" id="dash-player" style="max-width:280px;">' +
        players.map(function (pp) {
          return '<option value="' + esc(pp.id) + '"' + (pp.id === player.id ? ' selected' : '') + '>' + esc(pp.name) + '</option>';
        }).join('') +
      '</select>';

    // Default tab: first tab with data, else Hitting.
    let activeTab = 'hitting';
    for (let i = 0; i < TABS.length; i++) { if (tabHasData(player, TABS[i].key)) { activeTab = TABS[i].key; break; } }

    const tabBar = '<div class="dash-tabs" id="dash-tabs">' +
      TABS.map(function (t) {
        return '<button class="dash-tab' + (t.key === activeTab ? ' active' : '') + '" data-tab="' + t.key + '">' + esc(t.label) + '</button>';
      }).join('') + '</div>';

    root.innerHTML =
      ui.pageHead('Player Dashboard', 'Per-player development profile · trend over time', selector) +
      headerHtml(player) +
      '<div style="height:1rem;"></div>' +
      tabBar +
      '<div id="dash-tab-body"></div>';

    const body = root.querySelector('#dash-tab-body');
    renderTab(player, activeTab, body);

    // Player switch -> deep link (full re-render via router).
    const sel = root.querySelector('#dash-player');
    if (sel) sel.addEventListener('change', function () { ctx.navigate('#/dashboard/' + sel.value); });

    // Tab switch -> redraw only the body (destroy prior charts first to avoid leaks).
    root.querySelectorAll('.dash-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        root.querySelectorAll('.dash-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        charts.destroyAll();
        renderTab(player, btn.getAttribute('data-tab'), body);
      });
    });
  }

  CT.registerView('dashboard', { label: 'Dashboard', render: render });
})();

/* views/player.js — Player Profile (entity-detail screen). Reached by clicking a
   player on the Players view (#/player/<id>); NOT a top-level nav destination.
   Anatomy (airy top -> dense bottom, per DESIGN_SYSTEM "Diamond Mind Application"):
     (1) HERO header: avatar + name + position + ONE hero RATING number (40px
         tabular) + overall grade badge (coral seam for "plus") + dev-trend chip
         + Pitch-Smart status (youth safety stays front-and-centre).
     (2) TOOL/PERCENTILE bars on the Baseball-Savant diverging scale
         (hot red -> gray -> cold blue), each labeled with a tabular value + grade.
     (3) Metric-over-time charts (the existing tabbed sections — kept).
     (4) LIVE STATS / ACTIVITY FEED: reverse-chronological timeline grouped under
         sticky day headers (Today / Yesterday / date). Each item = colored dot +
         bold action line + muted outcome + right-aligned relative time; stat
         deltas get a signed cyan/seam color + glyph + tabular-nums.
   Built ONLY on the documented CT API (stats/pitchsmart/store/ui/charts).
   Reskinned to CYAN + seam/coral (NO green chrome). Designed empty / skeleton /
   error states. Registers via CT.registerView('player', { hidden:true }). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, stats = CT.stats;
  const benchmarks = CT.benchmarks, charts = CT.charts, esc = CT.escapeHtml;

  const MINUS = '−'; // real minus sign U+2212 (decimals align with tabular-nums)

  // Metric-over-time tabs (fielding is derived from raw fielding lines).
  const TABS = [
    { key: 'hitting', label: 'Hitting' },
    { key: 'pitching', label: 'Pitching' },
    { key: 'throwing', label: 'Throwing & Arm' },
    { key: 'fielding', label: 'Fielding' },
    { key: 'athleticism', label: 'Athleticism' }
  ];

  // The five "tools" we grade on the Savant scale (have seeded age-band benchmarks).
  const TOOL_KEYS = ['exitVeloMax', 'batSpeed', 'fastballVelo', 'infieldVelo',
    'outfieldVelo', 'sixtyYard', 'proAgility', 'popTime'];

  // ---------- small helpers ----------
  function playerBand(p) { return model.bandFor(p); }

  function latestAnthro(playerId) {
    const rows = store.byPlayer('anthroReadings', playerId);
    if (!rows.length) return null;
    return rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-1)[0];
  }

  function isPitcher(p) { return model.isPitcher(p); }

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

  function round1(v) { return Math.round(Number(v) * 10) / 10; }

  function fmtVal(v, m) {
    if (v == null || !isFinite(v)) return '—';
    const s = String(round1(v));
    return s + (m.unit === '%' ? '%' : (m.unit ? ' ' + m.unit : ''));
  }

  // Confidence chip tone — cyan (high) / amber (med) / seam-red (low). No green.
  function confTone(c) { return c === 'high' ? 'cyan' : (c === 'low' ? 'red' : 'yellow'); }

  function heightStr(inches) {
    if (inches == null) return '—';
    return Math.floor(inches / 12) + "'" + Math.round(inches % 12) + '"';
  }

  // Relative time, compact + right-aligned ("today", "3d", "2w", "4mo").
  function relShort(iso) {
    const n = CT.daysAgo(iso);
    if (n == null) return '';
    if (n <= 0) return 'today';
    if (n < 7) return n + 'd';
    if (n < 30) return Math.round(n / 7) + 'w';
    if (n < 365) return Math.round(n / 30) + 'mo';
    return Math.round(n / 365) + 'y';
  }

  // Sticky day-header label.
  function dayLabel(iso) {
    const n = CT.daysAgo(iso);
    if (n == null) return iso;
    if (n <= 0) return 'Today';
    if (n === 1) return 'Yesterday';
    return CT.formatDate(iso);
  }

  // ---------- rating model (20-80 scouting scale, derived from tool percentiles) ----------
  function buildTools(player, band) {
    if (!band) return [];
    const tools = [];
    TOOL_KEYS.forEach(function (key) {
      const rs = metricReadings(player.id, key);
      if (!rs.length) return;
      const latest = rs[rs.length - 1];
      const pct = benchmarks.percentileFor(band, key, latest.value);
      if (pct == null) return;
      const m = model.metric(key);
      tools.push({ key: key, label: m.label, unit: m.unit, value: latest.value, pct: pct });
    });
    return tools;
  }

  function gradeFromTools(tools) {
    if (!tools.length) return null;
    const avg = tools.reduce(function (s, t) { return s + t.pct; }, 0) / tools.length;
    const grade = Math.round(20 + (avg / 100) * 60); // 20-80 scouting scale
    const band = grade >= 55 ? 'plus' : (grade >= 45 ? 'average' : 'developing');
    return { grade: grade, avgPct: Math.round(avg), band: band, n: tools.length };
  }

  // Signed-delta tone — OK-green for improvement, danger red for decline.
  // For "lower is better" metrics a numeric DROP is an improvement.
  function deltaParts(net, lowerBetter, raw) {
    const improved = lowerBetter ? net < 0 : net > 0;
    let color, bg, glyph;
    if (net === 0) { color = 'var(--text-muted)'; bg = 'rgba(15,23,42,0.05)'; glyph = 'minus'; }
    else if (improved) { color = 'var(--up)'; bg = 'var(--up-soft)'; glyph = 'arrow-up-right'; }
    else { color = 'var(--seam,#DC2626)'; bg = 'var(--seam-soft,#FEF3F2)'; glyph = 'arrow-down-right'; }
    const sign = net > 0 ? '+' : (net < 0 ? MINUS : '');
    const mag = raw ? Math.abs(net) : round1(Math.abs(net));
    return { color: color, bg: bg, glyph: glyph, sign: sign, mag: mag };
  }

  function gradeBadge(g) {
    if (!g) return ui.badge('Unrated', 'neutral');
    const base = ';border-radius:9999px;padding:2px 8px;font-size:12px;font-weight:600;border:1px solid;';
    if (g.band === 'plus') {
      return '<span class="badge" style="' + ui.toneStyle('accent') + base + '"><i data-lucide="star"></i>Plus tools</span>';
    }
    const label = g.band === 'average' ? 'Average' : 'Developing';
    const icon = g.band === 'average' ? 'minus' : 'trending-up';
    return '<span class="badge" style="' + ui.toneStyle('neutral') + base + '"><i data-lucide="' + icon + '"></i>' + label + '</span>';
  }

  function devChip(player) {
    const sum = round1(store.sessionLogsForPlayer(player.id).reduce(function (s, l) {
      return s + (l.ratingDelta || 0);
    }, 0));
    // A zero delta reads like a broken placeholder at hero size — hide it.
    if (sum === 0) return '';
    const dp = deltaParts(sum, false, false);
    return '<span class="dm-prof-delta num" style="color:' + dp.color + ';background:' + dp.bg + ';">' +
      '<i data-lucide="' + dp.glyph + '"></i>' + dp.sign + dp.mag + ' dev</span>';
  }

  // ---------- header (hero) ----------
  function clearance(p) {
    if (!isPitcher(p)) return { dot: 'neutral', label: 'Position player', v: null };
    const v = CT.pitchsmart.evaluate(p, store.byPlayer('workloadLogs', p.id));
    let label;
    if (v.status === 'red') label = v.daysUntilEligible > 0 ? 'Resting (' + v.daysUntilEligible + 'd)' : 'Not cleared';
    else if (v.status === 'yellow') label = 'Caution';
    else label = 'Cleared to pitch';
    return { dot: v.status, label: label, v: v };
  }

  function heroHtml(p, tools, grade) {
    const age = model.ageFromBirthdate(p.birthdate);
    const band = playerBand(p) || '—';
    const anthro = latestAnthro(p.id);
    const cl = clearance(p);
    const dotClass = cl.dot === 'neutral' ? '' : (' ' + cl.dot);
    const pos = (p.positions || []).join(', ') || '—';
    const ht = heightStr(anthro && anthro.heightIn != null ? anthro.heightIn : null);
    const wt = anthro && anthro.weightLb != null ? anthro.weightLb + ' lb' : '—';

    const idCol =
      '<div class="dm-prof-id">' +
        '<div class="avatar">' + esc(CT.initials(p.name)) + '</div>' +
        '<div class="meta">' +
          '<div class="name">' + esc(p.name) + '</div>' +
          '<div class="sub">' + esc(pos) + '</div>' +
          '<div class="sub">' + esc(band) + (age != null ? ' · ' + age + ' yrs' : '') + ' · ' + esc(p.level || 'youth') +
            ' · B/T ' + esc((p.bats || '?') + '/' + (p.throws || '?')) + (p.jersey ? ' · #' + esc(p.jersey) : '') + '</div>' +
          '<div style="margin-top:var(--sp-2);">' +
            '<span class="status-dot' + dotClass + '"></span>' +
            '<span style="font-weight:var(--fw-semibold);font-size:var(--fs-data);color:var(--text-secondary);">' + esc(cl.label) + '</span>' +
            '<span class="muted" style="font-size:var(--fs-data);"> · ' + esc(ht) + ' · ' + esc(wt) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    const ratingCol =
      '<div class="dm-prof-rating">' +
        '<span class="eyebrow">Overall grade</span>' +
        '<span class="num">' + (grade ? grade.grade : '—') + '</span>' +
        '<div class="dm-prof-badges">' + gradeBadge(grade) + devChip(p) + '</div>' +
        '<span class="muted" style="font-size:var(--fs-eyebrow);">' +
          (grade ? '20–80 scale · avg of ' + grade.n + ' tool' + (grade.n === 1 ? '' : 's') : 'No graded tools yet') +
        '</span>' +
      '</div>';

    return ui.card({ body: '<div class="dm-prof-hero">' + idCol + ratingCol + '</div>' });
  }

  // ---------- tool / percentile bars (Savant diverging scale) ----------
  function toolBarsHtml(tools) {
    if (!tools.length) {
      return '<div class="dash-note">No age-band tool benchmarks yet — log Exit Velo, Fastball, 60-yard, etc. ' +
        'in an Assessment to populate tool grades.</div>';
    }
    const rows = tools.map(function (t) {
      const pctR = Math.round(t.pct);
      const valStr = round1(t.value) + (t.unit === '%' ? '%' : (t.unit ? ' ' + t.unit : ''));
      return '<div class="dm-tool">' +
        '<span class="tname">' + esc(t.label) + '</span>' +
        ui.diamondMeter(pctR, { label: t.label + ': ' + pctR + 'th percentile' }) +
        '<span class="tval num">' + esc(valStr) + '</span>' +
        '<span class="tpct num">' + pctR + '</span>' +
      '</div>';
    }).join('');
    return '<div class="dm-tools">' + rows + '</div>';
  }

  // ---------- training program (active assignment + progress + log) ----------
  function programSectionHtml(player) {
    const assigns = store.byPlayer('programAssignments', player.id)
      .filter(function (a) { return a.status !== 'completed'; });
    const adhocBtn = '<button class="btn btn-sm" data-act="prof-adhoc"><i data-lucide="clipboard-plus"></i>Log lesson</button>';

    if (!assigns.length) {
      return ui.card({
        title: 'Training program',
        subtitle: 'No active program',
        actions: adhocBtn,
        body: '<p class="muted" style="margin:0;">Assign an arm-care, throwing, hitting, or strength block in ' +
          '<a href="#/programs">Programs</a> to track weekly adherence here.</p>'
      });
    }

    const rows = assigns.map(function (a) {
      const prog = store.getById('programs', a.programId);
      if (!prog) return '';
      const logs = store.where('sessionLogs', 'assignmentId', a.id);
      const adh = CT.programs.adherenceFor(prog, a, logs);
      const wk = CT.programs.weekIndexFor(a, prog);
      const overlay = (prog.daysPerWeek || 0) === 0;
      const loggedToday = logs.some(function (l) { return l.date === CT.todayISO(); });
      const dow = (a.daysOfWeek && a.daysOfWeek.length)
        ? a.daysOfWeek.slice().sort().map(function (n) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][n]; }).join(' · ')
        : 'flexible days';
      const meter = adh.pct != null
        ? '<div class="prof-pgm-meter">' + ui.diamondMeter(adh.pct, { small: true, label: 'Adherence ' + adh.pct + '%' }) +
          '<span class="num" style="font-size:var(--fs-data);color:var(--text-strong);">' + adh.pct + '%</span></div>'
        : '';
      return '<div class="pgm-session">' +
        '<div class="pgm-session-top">' +
          '<div><strong>' + esc(prog.name) + '</strong>' +
            ' <span class="muted" style="font-size:var(--fs-label);">· ' + esc(prog.type) +
            ' · week <span class="num">' + (wk + 1) + '</span>/<span class="num">' + prog.weeks + '</span>' +
            (adh.due ? ' · <span class="num">' + adh.done + '</span>/<span class="num">' + adh.due + '</span> due' : '') +
            ' · ' + esc(dow) + '</span></div>' +
          (a.status !== 'active' ? ui.pill('Paused', 'yellow')
            : (overlay ? ui.pill('Overlay', 'neutral')
              : (loggedToday ? ui.pill('Logged today', 'green') : ui.pill('Not logged', 'neutral')))) +
        '</div>' +
        meter +
        (overlay || a.status !== 'active' ? '' :
          '<div class="row" style="margin-top:var(--sp-2);">' +
            '<button class="btn btn-sm ' + (loggedToday ? 'btn-ghost' : 'btn-primary') + '" data-act="prof-log" data-aid="' + esc(a.id) + '">' +
              '<i data-lucide="clipboard-check"></i>' + (loggedToday ? 'Log another' : 'Log session') + '</button>' +
          '</div>') +
      '</div>';
    }).join('');

    return ui.card({
      title: 'Training program',
      subtitle: assigns.length + ' active assignment' + (assigns.length === 1 ? '' : 's'),
      actions: adhocBtn + ' <a class="btn btn-sm" href="#/programs"><i data-lucide="arrow-right"></i>Programs</a>',
      body: rows
    });
  }

  // ---------- metric-over-time card (kept from prior dashboard) ----------
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

    const indicators =
      ui.pill(readings.length + ' sample' + (readings.length === 1 ? '' : 's'), small ? 'yellow' : 'neutral') +
      ' ' + ui.pill('conf: ' + (latest.confidence || 'med'), confTone(latest.confidence)) +
      ' ' + ui.pill(latest.device === 'device' ? 'device' : 'manual', 'neutral') +
      ' ' + ui.pill(latest.context + (latest.aggregation ? ' · ' + latest.aggregation : ''), 'neutral') +
      (pct != null ? ' ' + ui.pill('~' + Math.round(pct) + 'th %ile (' + band + ')', 'accent') : '');

    jobs.push(function () {
      const cv = document.getElementById(lineId);
      if (!cv) return;
      const ds = [{ label: m.label + ' (' + m.unit + ')', data: readings.map(function (r) { return r.value; }), fill: true }];
      if (bench && bench.p50 != null) {
        ds.push({ label: 'Age-band median', data: readings.map(function () { return bench.p50; }), color: charts.THEME.median, dash: true, fill: false });
      }
      charts.line(cv, {
        labels: readings.map(function (r) { return CT.formatDate(r.date); }),
        datasets: ds,
        // y-grace keeps the dashed median visible inside the plot instead of
        // pinned/clipped on the axis floor when it sits at the range edge.
        options: (bench && bench.p50 != null) ? { scales: { y: { grace: '15%' } } } : {}
      });
    });

    if (bench) {
      jobs.push(function () {
        const cv = document.getElementById(benchId);
        if (!cv) return;
        // Color each percentile column on the Savant scale; the player ("You") is cyan.
        const pcols = [10, 25, 50, 75, 90].map(function (q) { return charts.savantColor(q); });
        charts.bar(cv, {
          labels: ['P10', 'P25', 'P50', 'P75', 'P90', 'You'],
          data: [bench.p10, bench.p25, bench.p50, bench.p75, bench.p90, latest.value],
          colors: pcols.concat([charts.THEME.accent]),
          label: m.label + ' (' + m.unit + ')'
        });
      });
    }

    const youthNote = (m.youthNA && band && model.AGE_BANDS.indexOf(band) <= 2)
      ? '<div class="dash-note" style="color:var(--warn);">Generally N/A for youth — interpret as exploratory only.</div>' : '';

    const body =
      '<div class="pill-row" style="margin-bottom:var(--sp-3);">' + indicators + '</div>' +
      youthNote +
      '<div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:var(--sp-3);">' +
        '<div class="kpi"><div class="k">Latest</div><div class="v num">' + esc(fmtVal(latest.value, m)) + '</div></div>' +
        '<div class="kpi"><div class="k">Personal best</div><div class="v num">' + esc(fmtVal(best, m)) + '</div></div>' +
      '</div>' +
      '<div class="chart-wrap"><canvas id="' + lineId + '"></canvas></div>' +
      (bench
        ? '<div class="dash-note" style="margin-top:var(--sp-3);">Percentile vs ' + esc(band) + ' (left = lower, right = higher)</div>' +
          '<div class="chart-wrap"><canvas id="' + benchId + '"></canvas></div>'
        : '<div class="dash-note" style="margin-top:var(--sp-3);">No age-band benchmark — read the trend line above.</div>');

    return ui.card({
      title: m.label,
      subtitle: m.tier === 'core' ? 'Core metric' : (m.tier === 'advanced' ? 'Advanced metric' : 'Derived metric'),
      body: body
    });
  }

  function hittingExtrasHtml(p, jobs) {
    const la = metricReadings(p.id, 'launchAngle');
    const histId = CT.uid('cv'), scatId = CT.uid('cv');
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

  function fieldingHtml(p) {
    const lines = store.byPlayer('fieldingStatLines', p.id);
    if (!lines.length) {
      return ui.emptyState('shield', 'No fielding data', 'Add fielding stat lines in the Games view to see reliability (PO/A/E) here.');
    }
    const f = stats.fieldingFromLines(lines);
    const byPos = {};
    lines.forEach(function (l) { const k = l.position || '—'; (byPos[k] = byPos[k] || []).push(l); });
    let rows = '';
    Object.keys(byPos).forEach(function (pos) {
      const pf = stats.fieldingFromLines(byPos[pos]);
      rows += '<tr><td>' + esc(pos) + '</td><td class="num">' + pf.po + '</td><td class="num">' + pf.a + '</td><td class="num">' + pf.e + '</td><td class="num">' + stats.fmtRate(pf.fieldingPct) + '</td></tr>';
    });

    const body =
      '<div class="stats" style="margin-bottom:var(--sp-4);">' +
        ui.statTile(stats.fmtRate(f.fieldingPct), 'Reliability (FLD%)') +
        ui.statTile(String(f.po + f.a), 'Putouts + Assists') +
        ui.statTile(String(f.e), 'Errors') +
      '</div>' +
      '<div class="dash-note" style="margin-bottom:var(--sp-3);">FLD% measures reliability, not ranking — youth defense is volatile, read it as a trend.</div>' +
      '<div class="table-wrap"><table class="ct-table"><thead><tr><th>Position</th><th class="num">PO</th><th class="num">A</th><th class="num">E</th><th class="num">FLD%</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>';
    return ui.card({ title: 'Fielding', subtitle: 'Reliability by position', body: body });
  }

  function tabHasData(p, key) {
    if (key === 'fielding') return store.byPlayer('fieldingStatLines', p.id).length > 0;
    return model.metricsByGroup(key).some(function (m) { return metricReadings(p.id, m.key).length > 0; });
  }

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
        html = ui.emptyState('bar-chart-3', 'No ' + key + ' data yet',
          'Log ' + key + ' metrics in the Assessment view to populate this player\'s dashboard.');
      } else {
        // Provenance (SOURCE_NOTE) lives once on the Tool-grades card above —
        // repeating the same sentence here read as a copy/paste bug.
        html = '<div class="dash-note" style="margin-bottom:var(--sp-3);">' +
          'Numbers are framed as <strong>trend vs. self</strong>, not pass/fail.</div>' +
          '<div class="dash-metric-grid">' + cards.join('') + '</div>';
      }
    }
    container.innerHTML = html;
    jobs.forEach(function (job) { try { job(); } catch (e) { /* offline-safe */ } });
    repaintIcons();
  }

  // ---------- live stats / activity feed ----------
  function battingSummary(l) {
    const seg = (l.h || 0) + '-' + (l.ab || 0);
    const ex = [];
    if (l.hr) ex.push(l.hr + ' HR');
    if (l.b3) ex.push(l.b3 + ' 3B');
    if (l.b2) ex.push(l.b2 + ' 2B');
    if (l.bb) ex.push(l.bb + ' BB');
    if (l.rbi) ex.push(l.rbi + ' RBI');
    if (l.sb) ex.push(l.sb + ' SB');
    return seg + (ex.length ? ', ' + ex.join(', ') : '');
  }

  function buildEvents(player) {
    const events = [];

    // All non-voided readings (for assessment stat-deltas vs the prior reading).
    const allReadings = store.byPlayer('metricReadings', player.id)
      .filter(function (r) { return !r.voided; })
      .sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
    const byKey = {};
    allReadings.forEach(function (r) { (byKey[r.metricKey] = byKey[r.metricKey] || []).push(r); });

    // Assessments (stat-change events).
    store.byPlayer('assessmentSessions', player.id).forEach(function (a) {
      const rs = allReadings.filter(function (r) { return r.assessmentSessionId === a.id; });
      const deltas = [];
      rs.forEach(function (r) {
        const m = model.metric(r.metricKey);
        if (!m) return;
        const series = byKey[r.metricKey] || [];
        const idx = series.indexOf(r);
        const prev = idx > 0 ? series[idx - 1] : null;
        if (prev && r.value - prev.value !== 0) {
          deltas.push({ label: m.label, net: r.value - prev.value, unit: m.unit, lowerBetter: !!m.lowerBetter });
        }
      });
      const typeLabel = a.type === 'showcase' ? 'Showcase' : (a.type === 'practice' ? 'Practice assessment' : 'Assessment');
      events.push({
        date: a.date, sort: a.date + '_2', dot: 'var(--accent-400)',
        title: typeLabel + ' logged',
        outcome: (a.location ? a.location + ' · ' : '') + rs.length + ' metric' + (rs.length === 1 ? '' : 's') + ' captured',
        deltas: deltas.slice(0, 4)
      });
    });

    // Lessons / program sessions (drills + notes + rating delta + v4: any
    // metric readings captured inline in a lesson, shown as delta chips).
    store.sessionLogsForPlayer(player.id).forEach(function (l) {
      const names = (l.extraDrillIds || []).map(function (id) { const d = store.getDrill(id); return d ? d.name : null; }).filter(Boolean);
      const deltas = [];
      // Inline lesson readings -> the same delta-chip styling assessments use.
      allReadings.filter(function (r) { return r.sessionLogId === l.id; }).forEach(function (r) {
        const m = model.metric(r.metricKey);
        if (!m) return;
        const series = byKey[r.metricKey] || [];
        const idx = series.indexOf(r);
        const prev = idx > 0 ? series[idx - 1] : null;
        const net = prev ? Math.round((r.value - prev.value) * 100) / 100 : 0;
        deltas.push({
          label: m.label, net: net, unit: m.unit, lowerBetter: !!m.lowerBetter,
          valueText: r.value + (m.unit ? ' ' + m.unit : ''), first: !prev
        });
      });
      if (l.ratingDelta != null && l.ratingDelta !== 0) {
        deltas.push({ label: 'Rating', net: l.ratingDelta, unit: '', lowerBetter: false, raw: false });
      }
      let progName = null;
      if (l.assignmentId) {
        const a = store.getById('programAssignments', l.assignmentId);
        const prog = a ? store.getById('programs', a.programId) : null;
        progName = prog ? prog.name : 'Program';
      }
      const focusLabel = l.focus ? (model.SESSION_FOCUS_LABELS[l.focus] || l.focus) : null;
      const title = progName
        ? 'Program session — ' + progName + (l.programDayRef ? ' (wk ' + (l.programDayRef.weekIndex + 1) + ')' : '')
        : 'Lesson' + (focusLabel ? ' — ' + focusLabel : '') +
          (names.length ? ' · ' + names.length + ' drill' + (names.length === 1 ? '' : 's') : '');
      const fallback = progName
        ? (l.throws ? l.throws + ' throws logged' : 'Completed')
        : (names.length ? names.join(', ') : 'Coaching lesson');
      events.push({
        date: l.date, sort: l.date + '_1', dot: 'var(--accent-500)',
        title: title,
        outcome: l.notes || fallback,
        meta: names.length ? names.join(' · ') : '',
        deltas: deltas.slice(0, 4)
      });
    });

    // Games the player appeared in (batting / pitching / fielding lines).
    const bat = store.byPlayer('battingStatLines', player.id);
    const pit = store.byPlayer('pitchingAppearances', player.id);
    const fld = store.byPlayer('fieldingStatLines', player.id);
    const gameIds = {};
    bat.concat(pit).concat(fld).forEach(function (l) { gameIds[l.gameId] = true; });
    Object.keys(gameIds).forEach(function (gid) {
      const g = store.getById('games', gid);
      if (!g) return;
      const parts = [];
      bat.filter(function (l) { return l.gameId === gid; }).forEach(function (l) { parts.push(battingSummary(l)); });
      pit.filter(function (l) { return l.gameId === gid; }).forEach(function (l) {
        parts.push(stats.formatIP(l.outs) + ' IP, ' + (l.so || 0) + ' K, ' + (l.er || 0) + ' ER');
      });
      const result = g.scoreFor > g.scoreAgainst ? 'W' : (g.scoreFor < g.scoreAgainst ? 'L' : 'T');
      events.push({
        date: g.date, sort: g.date + '_0', dot: 'var(--text-secondary)',
        title: 'Game vs ' + (g.opponent || 'TBD'),
        outcome: result + ' ' + g.scoreFor + '–' + g.scoreAgainst + (parts.length ? ' · ' + parts.join(' · ') : ''),
        deltas: []
      });
    });

    events.sort(function (a, b) { return a.sort < b.sort ? 1 : (a.sort > b.sort ? -1 : 0); });
    return events;
  }

  function deltaChipHtml(d) {
    // v4: inline lesson readings carry the measured value; a FIRST reading has
    // no previous to diff against, so the chip shows just "Metric value".
    const val = d.valueText ? ' ' + d.valueText : '';
    if (d.first) {
      return '<span class="dm-feed-delta num" style="color:var(--text-secondary);background:rgba(15,23,42,0.05);">' +
        esc(d.label) + esc(val) + '</span>';
    }
    const dp = deltaParts(d.net, d.lowerBetter, d.raw);
    const unit = d.unit ? ' ' + d.unit : '';
    const diff = d.valueText ? ' · ' + dp.sign + dp.mag + esc(unit) + ' vs last' : ' ' + dp.sign + dp.mag + esc(unit);
    return '<span class="dm-feed-delta num" style="color:' + dp.color + ';background:' + dp.bg + ';">' +
      '<i data-lucide="' + dp.glyph + '"></i>' + esc(d.label) + esc(val) + diff + '</span>';
  }

  function feedItemHtml(ev) {
    const deltas = (ev.deltas && ev.deltas.length)
      ? '<div class="dm-feed-deltas">' + ev.deltas.map(deltaChipHtml).join('') + '</div>' : '';
    const meta = ev.meta ? '<div class="dm-feed-meta muted">' + esc(ev.meta) + '</div>' : '';
    return '<div class="dm-feed-item">' +
      '<span class="dm-feed-dot" style="background:' + ev.dot + ';"></span>' +
      '<div class="dm-feed-body">' +
        '<div class="dm-feed-action">' + esc(ev.title) + '</div>' +
        '<div class="dm-feed-outcome">' + esc(ev.outcome) + '</div>' +
        meta + deltas +
      '</div>' +
      '<span class="dm-feed-time num">' + esc(relShort(ev.date)) + '</span>' +
    '</div>';
  }

  function feedHtml(events) {
    let html = '<div class="dm-feed">';
    let curDay = null;
    events.forEach(function (ev) {
      if (ev.date !== curDay) {
        curDay = ev.date;
        html += '<div class="dm-feed-day">' + esc(dayLabel(ev.date)) + '</div>';
      }
      html += feedItemHtml(ev);
    });
    return html + '</div>';
  }

  function feedEmptyHtml() {
    return ui.emptyState('activity', 'No activity yet',
      'Log a session, assessment, or game for this player to build the timeline.',
      '<a class="btn btn-primary" href="#/assess/new"><i data-lucide="plus"></i>New assessment</a>');
  }

  function feedErrorHtml() {
    return '<div class="empty"><div class="big"><i data-lucide="alert-triangle"></i></div>' +
      '<h3>Couldn\'t build the activity feed</h3>' +
      '<p>Something went wrong reading this player\'s history.</p>' +
      '<button class="btn btn-primary" id="dm-feed-retry"><i data-lucide="rotate-ccw"></i>Retry</button></div>';
  }

  // Skeleton rows (matching the final layout) shown during the brief data-load.
  function skelRows(n, base) {
    let s = '';
    for (let i = 0; i < n; i++) {
      s += '<div class="dm-skel dm-skel-row" style="width:' + (base + (i * 11) % 30) + '%;"></div>';
    }
    return s;
  }

  // Deferred content is injected after the router's icon repaint, so repaint here.
  function repaintIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (e) { /* offline-safe */ }
    }
  }

  // ---------- main render ----------
  function render(root, ctx) {
    const players = store.getPlayers();

    if (!players.length) {
      root.innerHTML = ui.pageHead('Player Profile', 'Per-player development profile') +
        ui.emptyState('user-round', 'No players yet', 'Add a player in the Players view to see their profile.',
          '<a class="btn btn-primary" href="#/players"><i data-lucide="user-plus"></i>Go to Players</a>');
      return;
    }

    let player = ctx.param ? store.getPlayer(ctx.param) : null;
    if (!player) player = players[0];

    const band = playerBand(player);
    const tools = buildTools(player, band);
    const grade = gradeFromTools(tools);

    // Player selector (deep-links so the URL is shareable) + Edit + quick "Log
    // assessment" (pre-selects this player). Delete lives in the danger zone below.
    const actions =
      '<select class="select" id="dash-player" style="max-width:220px;">' +
        players.map(function (pp) {
          return '<option value="' + esc(pp.id) + '"' + (pp.id === player.id ? ' selected' : '') + '>' + esc(pp.name) + '</option>';
        }).join('') +
      '</select>' +
      '<button class="btn btn-ghost" id="prof-edit"><i data-lucide="pencil"></i>Edit</button>' +
      '<a class="btn" href="#/assess/' + esc(player.id) + '"><i data-lucide="history"></i>Assessments</a>' +
      '<button class="btn" id="prof-lesson"><i data-lucide="notebook-pen"></i>Log lesson</button>' +
      '<a class="btn btn-primary" href="#/assess/new/' + esc(player.id) + '"><i data-lucide="clipboard-plus"></i>New assessment</a>';

    // Default metric tab: first with data, else Hitting.
    let activeTab = 'hitting';
    for (let i = 0; i < TABS.length; i++) { if (tabHasData(player, TABS[i].key)) { activeTab = TABS[i].key; break; } }

    const tabBar = '<div class="dash-tabs" id="dash-tabs" role="tablist">' +
      TABS.map(function (t) {
        return '<button class="dash-tab' + (t.key === activeTab ? ' active' : '') + '" data-tab="' + t.key + '">' + esc(t.label) + '</button>';
      }).join('') + '</div>';

    root.innerHTML =
      '<a class="back-link" href="#/players"><i data-lucide="chevron-left"></i>All players</a>' +
      ui.pageHead('Player Profile', 'Development profile · tools, trends & activity', actions) +
      heroHtml(player, tools, grade) +
      ui.card({
        title: 'Tool grades',
        subtitle: band ? ('Percentile vs ' + band + ' · Baseball-Savant scale') : 'Percentile vs age band',
        body: '<div id="dm-tools-slot">' + skelRows(5, 55) + '</div>' +
          '<div class="dash-note" style="margin-top:var(--sp-3);">' + esc(benchmarks.SOURCE_NOTE) + '</div>'
      }) +
      programSectionHtml(player) +
      tabBar +
      '<div id="dash-tab-body"></div>' +
      '<h2 class="dm-feed-title">Activity</h2>' +
      '<div id="dm-feed-slot" aria-busy="true">' + skelRows(6, 60) + '</div>' +
      '<div class="prof-danger">' +
        '<div class="prof-danger-txt"><strong>Remove ' + esc(player.name) + '</strong>' +
          '<span class="muted">Deletes this player and all their assessments, readings, lessons, workload, and program assignments. Games stay — only their stat lines are removed. 10-minute undo.</span></div>' +
        '<button class="btn btn-danger" id="prof-delete"><i data-lucide="trash-2"></i>Delete player</button>' +
      '</div>';

    // Metric-over-time charts (synchronous; charts need canvases in the DOM).
    const tabBody = root.querySelector('#dash-tab-body');
    renderTab(player, activeTab, tabBody);

    // Two-phase: swap skeletons for real tool bars + activity feed (designed
    // skeleton -> content -> error states). Deferred so the skeleton paints first.
    requestAnimationFrame(function () {
      const toolsEl = root.querySelector('#dm-tools-slot');
      if (toolsEl) {
        try { toolsEl.innerHTML = toolBarsHtml(tools); }
        catch (e) { toolsEl.innerHTML = '<div class="dash-note">Tool grades unavailable.</div>'; }
      }
      const feedEl = root.querySelector('#dm-feed-slot');
      if (feedEl) {
        try {
          const events = buildEvents(player);
          feedEl.innerHTML = events.length ? feedHtml(events) : feedEmptyHtml();
        } catch (e) {
          feedEl.innerHTML = feedErrorHtml();
          const rb = root.querySelector('#dm-feed-retry');
          if (rb) rb.addEventListener('click', function () { CT.router.route(); });
        }
        feedEl.setAttribute('aria-busy', 'false');
      }
      repaintIcons();
    });

    // Training-program actions (shared Log-Session modal).
    root.querySelectorAll('[data-act="prof-log"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const a = store.getById('programAssignments', b.getAttribute('data-aid'));
        if (a && CT.sessionLog) CT.sessionLog.open({ playerId: player.id, assignmentId: a.id });
      });
    });
    const adhocBtn = root.querySelector('[data-act="prof-adhoc"]');
    if (adhocBtn) adhocBtn.addEventListener('click', function () {
      if (CT.sessionLog) CT.sessionLog.open({ playerId: player.id });
    });
    const lessonBtn = root.querySelector('#prof-lesson');
    if (lessonBtn) lessonBtn.addEventListener('click', function () {
      if (CT.sessionLog) CT.sessionLog.open({ playerId: player.id });
    });

    // Player switch -> deep link (full re-render via router).
    const sel = root.querySelector('#dash-player');
    if (sel) sel.addEventListener('change', function () { ctx.navigate('#/player/' + sel.value); });

    // Edit / Delete reuse the Players view's form + cascade-delete.
    const editBtn = root.querySelector('#prof-edit');
    if (editBtn) editBtn.addEventListener('click', function () {
      if (CT.playersUI) CT.playersUI.openForm(player);
    });
    const delBtn = root.querySelector('#prof-delete');
    if (delBtn) delBtn.addEventListener('click', function () {
      if (CT.playersUI) CT.playersUI.confirmDelete(player, function () { ctx.navigate('#/players'); });
    });

    // Metric tab switch -> redraw only the body (destroy prior charts first).
    root.querySelectorAll('.dash-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        root.querySelectorAll('.dash-tab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        charts.destroyAll();
        renderTab(player, btn.getAttribute('data-tab'), tabBody);
      });
    });
  }

  CT.registerView('player', { label: 'Player', render: render, hidden: true });
})();

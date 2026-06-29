/* views/armsafety.js — Pitch-Count / Arm-Safety Console (the signature safety view).
   Per-player workload from CT.pitchsmart: a big red/green "Cleared to Pitch?" flag,
   remaining pitches today, days-until-eligible, rolling 12-month innings, consecutive-
   day warnings, ACWR, and a stacked pitch/throw workload chart with an ACWR overlay
   and Pitch Smart required-rest shading. Pure foundation API; registers itself via
   CT.registerView('armsafety', { label, render }). Youth-safety framing throughout. */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, ps = CT.pitchsmart;
  const charts = CT.charts, esc = CT.escapeHtml;

  // Workload-type buckets -> chart series + colors.
  const COLORS = {
    game: '#7FFF00',
    bullpen: 'rgba(127,255,0,0.45)',
    other: 'rgba(144,200,144,0.55)',
    rest: 'rgba(255,107,107,0.13)',
    acwr: '#ffcd50'
  };

  // ----- helpers -----
  function isPitcher(p) { return (p.positions || []).some(function (x) { return /pitch/i.test(x); }); }

  // A player belongs on the console if they pitch OR have any logged workload.
  function consolePlayers() {
    return store.getPlayers().filter(function (p) {
      return isPitcher(p) || store.byPlayer('workloadLogs', p.id).length > 0;
    });
  }

  function latestCheckIn(playerId) {
    const rows = store.byPlayer('dailyCheckIns', playerId);
    if (!rows.length) return null;
    return rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-1)[0];
  }

  function dayDiff(aISO, bISO) {
    return Math.round((new Date(aISO + 'T00:00:00') - new Date(bISO + 'T00:00:00')) / 86400000);
  }
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function bucketFor(type) {
    if (type === 'game') return 'game';
    if (type === 'bullpen') return 'bullpen';
    return 'other';
  }

  function acwrTone(zone) {
    if (zone === 'optimal') return 'green';
    if (zone === 'danger') return 'red';
    if (zone === 'caution' || zone === 'low') return 'yellow';
    return 'neutral';
  }

  // ----- the big "Cleared to Pitch?" flag -----
  function flagBanner(v) {
    let head, sub;
    if (v.status === 'red') {
      head = 'NOT CLEARED TO PITCH';
      sub = v.daysUntilEligible > 0
        ? 'Resting — eligible in ' + v.daysUntilEligible + ' day(s).'
        : (v.remainingToday <= 0 ? 'Daily pitch limit reached.' : 'Workload rule triggered.');
    } else if (v.status === 'yellow') {
      head = 'CLEARED — WITH CAUTION';
      sub = 'Within limits, but workload signals warrant a close eye.';
    } else {
      head = 'CLEARED TO PITCH';
      sub = 'Within all Pitch Smart rest and workload limits.';
    }
    return '<div class="as-flag ' + v.status + '">' +
      '<span class="as-dot"></span>' +
      '<div><p class="as-q">' + esc(head) + '</p>' +
      '<p class="as-sub">' + esc(sub) + '</p></div>' +
    '</div>';
  }

  function painBanner(player) {
    const c = latestCheckIn(player.id);
    if (!c || !c.armPain) return '';
    const where = c.painLocation ? ' (' + esc(c.painLocation) + ')' : '';
    return '<div class="as-pain"><strong>Arm pain reported ' +
      esc(CT.relativeDate(c.date)) + where + '.</strong> ' +
      'Per youth-safety protocol, hold throwing and recommend a medical/clinician evaluation before return.</div>';
  }

  function kpiGrid(v) {
    const capPct = Math.min(100, (v.rolling12moInnings / v.inningsCap) * 100);
    const capColor = v.overInningsCap ? 'var(--danger)' : 'var(--accent)';
    const remTone = v.remainingToday <= 0 ? 'var(--danger)' : 'var(--accent)';
    const acwrRatio = v.acwr.ratio != null ? v.acwr.ratio.toFixed(2) : '—';
    const last = v.lastOuting
      ? CT.relativeDate(v.lastOuting.date) + ' · ' + v.lastOuting.pitches + ' pitch'
      : 'No outings logged';

    return '<div class="kpi-grid" style="margin-top:.2rem;">' +
      '<div class="kpi"><div class="k">Remaining today</div>' +
        '<div class="v" style="color:' + remTone + ';">' + v.remainingToday + ' <span style="font-size:.8rem;color:var(--body-2);">/ ' + v.dailyMax + '</span></div></div>' +
      '<div class="kpi"><div class="k">Days until eligible</div>' +
        '<div class="v">' + (v.daysUntilEligible > 0 ? v.daysUntilEligible + 'd' : 'Now') + '</div></div>' +
      '<div class="kpi"><div class="k">ACWR (7d:28d)</div>' +
        '<div class="v" style="font-size:1rem;">' + acwrRatio + ' ' + ui.pill(v.acwr.zone, acwrTone(v.acwr.zone)) + '</div></div>' +
      '<div class="kpi"><div class="k">Consecutive days</div>' +
        '<div class="v" style="color:' + (v.consecutiveStreak >= 3 ? 'var(--danger)' : 'var(--accent)') + ';">' + v.consecutiveStreak + '</div></div>' +
      '<div class="kpi" style="grid-column:span 2;"><div class="k">Rolling 12-mo innings (cap ' + v.inningsCap + ')</div>' +
        '<div class="v" style="color:' + capColor + ';font-size:1rem;">' + v.rolling12moInnings.toFixed(1) + ' IP</div>' +
        '<div class="as-cap-bar"><span style="width:' + capPct.toFixed(0) + '%;background:' + capColor + ';"></span></div></div>' +
      '<div class="kpi" style="grid-column:span 2;"><div class="k">Last outing</div>' +
        '<div class="v" style="font-size:.95rem;">' + esc(last) + '</div></div>' +
    '</div>';
  }

  function reasonsList(v) {
    if (!v.reasons || !v.reasons.length) return '';
    return '<ul class="as-reasons">' +
      v.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') +
    '</ul>';
  }

  // ----- workload chart data (stacked pitch/throw + ACWR + rest shading) -----
  function buildChartSpec(player, v) {
    const logs = store.byPlayer('workloadLogs', player.id);
    const byDay = ps.pitchesByDay(logs); // {date: pitches} (pitching days only)

    // Per-day type buckets.
    const buckets = {}; // date -> {game,bullpen,other}
    logs.forEach(function (l) {
      const d = l.date;
      buckets[d] = buckets[d] || { game: 0, bullpen: 0, other: 0 };
      buckets[d][bucketFor(l.type)] += Number(l.pitches) || 0;
    });

    // Collect relevant dates: every log date + each outing's required-rest days.
    const dateSet = {};
    Object.keys(buckets).forEach(function (d) { dateSet[d] = true; });
    Object.keys(byDay).forEach(function (d) {
      const rest = ps.restRequired(v.ageBand, byDay[d]);
      for (let i = 1; i <= rest; i++) dateSet[addDays(d, i)] = true;
    });

    // Sort ascending and cap to the most recent 45 columns (mobile-friendly).
    let dates = Object.keys(dateSet).sort();
    if (dates.length > 45) dates = dates.slice(dates.length - 45);

    // y-axis ceiling so rest shading spans the full plot height.
    let yMax = v.dailyMax;
    dates.forEach(function (d) {
      const b = buckets[d];
      if (b) yMax = Math.max(yMax, b.game + b.bullpen + b.other);
    });

    const gameData = [], bullpenData = [], otherData = [], restData = [], acwrData = [];
    dates.forEach(function (d) {
      const b = buckets[d] || { game: 0, bullpen: 0, other: 0 };
      gameData.push(b.game);
      bullpenData.push(b.bullpen);
      otherData.push(b.other);
      const pitchedToday = (byDay[d] || 0) > 0;
      restData.push(!pitchedToday && dateSet[d] && needsRestOn(byDay, v.ageBand, d) ? yMax : 0);
      const a = ps.computeACWR(byDay, d);
      acwrData.push(a.ratio != null ? Number(a.ratio.toFixed(2)) : null);
    });

    return {
      labels: dates.map(function (d) { return CT.formatDate(d); }),
      datasets: [
        { type: 'bar', label: 'Required rest', data: restData, backgroundColor: COLORS.rest, stack: 'load', yAxisID: 'y', order: 9, borderWidth: 0 },
        { type: 'bar', label: 'Game pitches', data: gameData, backgroundColor: COLORS.game, stack: 'load', yAxisID: 'y', order: 2 },
        { type: 'bar', label: 'Bullpen pitches', data: bullpenData, backgroundColor: COLORS.bullpen, stack: 'load', yAxisID: 'y', order: 2 },
        { type: 'bar', label: 'Other throws', data: otherData, backgroundColor: COLORS.other, stack: 'load', yAxisID: 'y', order: 2 },
        { type: 'line', label: 'ACWR', data: acwrData, borderColor: COLORS.acwr, backgroundColor: COLORS.acwr, pointBackgroundColor: COLORS.acwr, yAxisID: 'y1', tension: 0.25, pointRadius: 3, borderWidth: 2, spanGaps: true, order: 0 }
      ],
      yMax: yMax
    };
  }

  // True if `date` falls inside a required-rest window of an earlier outing.
  function needsRestOn(byDay, band, date) {
    const days = Object.keys(byDay).sort();
    for (let i = 0; i < days.length; i++) {
      const o = days[i];
      const rest = ps.restRequired(band, byDay[o]);
      const gap = dayDiff(date, o);
      if (gap >= 1 && gap <= rest) return true;
    }
    return false;
  }

  function drawChart(canvas, spec) {
    if (!canvas) return;
    charts.make(canvas, {
      type: 'bar',
      data: { labels: spec.labels, datasets: spec.datasets },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, suggestedMax: spec.yMax, title: { display: true, text: 'Pitches / throws', color: charts.THEME.tick } },
          y1: { position: 'right', stacked: false, beginAtZero: true, suggestedMax: 2, grid: { drawOnChartArea: false }, ticks: { color: COLORS.acwr }, title: { display: true, text: 'ACWR', color: COLORS.acwr } }
        }
      }
    });
  }

  // ----- quick "log outing" form (WorkloadLog is append-only) -----
  function openLog(player) {
    const html =
      '<div class="field-row">' +
        ui.formField({ type: 'date', name: 'date', label: 'Date', value: CT.todayISO(), required: true }) +
        ui.formField({ type: 'select', name: 'type', label: 'Type', value: 'game', options: ['game', 'bullpen', 'practice', 'long-toss'] }) +
      '</div>' +
      '<div class="field-row">' +
        ui.formField({ type: 'number', name: 'pitches', label: 'Pitches', value: '', min: 0, max: 200, step: 1, help: 'Throw-only days can be 0.' }) +
        ui.formField({ type: 'number', name: 'outs', label: 'Outs (IP×3)', value: 0, min: 0, max: 81, step: 1 }) +
      '</div>' +
      ui.formField({ type: 'number', name: 'rpe', label: 'RPE (1–10)', value: '', min: 1, max: 10, step: 1 }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save">Log outing</button>' +
      '</div>';

    ui.openModal('Log outing — ' + player.name, html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const get = function (n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
        const date = get('date');
        if (!date) { ui.toast('Date is required.'); return; }
        store.append('workloadLogs', {
          playerId: player.id,
          date: date,
          type: get('type'),
          pitches: get('pitches') ? Number(get('pitches')) : 0,
          outs: get('outs') ? Number(get('outs')) : 0,
          rpe: get('rpe') ? Number(get('rpe')) : null
        });
        close();
        ui.toast('Outing logged');
        CT.router.route();
      });
    });
  }

  // ----- one player's console card -----
  function consoleCard(player) {
    const logs = store.byPlayer('workloadLogs', player.id);
    const v = ps.evaluate(player, logs);
    const age = model.ageFromBirthdate(player.birthdate);
    const sub = (player.ageBand || v.ageBand) + (age != null ? ' · ' + age + ' yrs' : '') +
      ' · daily max ' + v.dailyMax + ' · throws ' + (player.throws || '?');

    let body = flagBanner(v) + painBanner(player) + kpiGrid(v) + reasonsList(v);

    if (logs.length) {
      body += '<div class="chart-wrap" style="margin-top:.9rem;"><canvas id="as-chart-' + esc(player.id) + '"></canvas></div>' +
        '<p class="as-note">Stacked bars = pitches by session type; gold line = ACWR (7-day acute vs 28-day chronic); red columns = Pitch Smart required-rest days.</p>';
    } else {
      body += '<div style="margin-top:.8rem;">' +
        ui.emptyState('🗒️', 'No workload logged', 'Log an outing to start tracking arm safety for ' + esc(player.name) + '.') + '</div>';
    }

    const title = '<span class="status-dot ' + v.status + '"></span>' + esc(player.name);
    const actions = '<button class="btn btn-sm btn-primary" data-act="log" data-id="' + esc(player.id) + '">+ Log outing</button>';
    return ui.card({ rawTitle: true, title: title, subtitle: sub, actions: actions, body: body });
  }

  // ----- team safety summary strip -----
  function summaryStrip(players) {
    let green = 0, yellow = 0, red = 0;
    players.forEach(function (p) {
      const s = ps.evaluate(p, store.byPlayer('workloadLogs', p.id)).status;
      if (s === 'red') red++; else if (s === 'yellow') yellow++; else green++;
    });
    return '<div class="as-summary">' +
      ui.statTile(players.length, 'Arms tracked') +
      ui.statTile(green, 'Cleared') +
      ui.statTile(yellow, 'Caution') +
      ui.statTile(red, 'Not cleared') +
    '</div>';
  }

  // ----- main render -----
  function render(root, ctx) {
    let players = consolePlayers();

    // Deep link #/armsafety/<playerId> focuses a single arm.
    let focused = null;
    if (ctx && ctx.param) {
      focused = store.getPlayer(ctx.param);
      if (focused) players = [focused];
    }

    if (!players.length) {
      root.innerHTML = ui.pageHead('Arm Safety', 'Pitch Smart workload & ACWR') +
        ui.emptyState('🛡️', 'No arms to monitor yet',
          'Add a pitcher (or log any throwing workload) to see the Pitch Smart clearance console.',
          '<a class="btn btn-primary" href="#/roster">Go to Roster</a>');
      return;
    }

    const subtitle = focused
      ? 'Pitch Smart console — ' + focused.name
      : players.length + ' arm(s) monitored · MLB/USA Baseball Pitch Smart';

    let html = ui.pageHead('Arm Safety — Cleared to Pitch?', subtitle);
    if (focused) html += '<a class="back-link" href="#/armsafety">← All arms</a>';
    else html += summaryStrip(players);

    html += '<div class="grid-cards">' +
      players.map(function (p) { return '<div data-card="' + esc(p.id) + '">' + consoleCard(p) + '</div>'; }).join('') +
    '</div>';

    root.innerHTML = html;

    // Draw each player's workload chart after the DOM exists.
    players.forEach(function (p) {
      const logs = store.byPlayer('workloadLogs', p.id);
      if (!logs.length) return;
      const v = ps.evaluate(p, logs);
      const canvas = root.querySelector('#as-chart-' + cssEscape(p.id));
      drawChart(canvas, buildChartSpec(p, v));
    });

    // Wire quick-log buttons.
    root.querySelectorAll('[data-act="log"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const pl = store.getPlayer(b.getAttribute('data-id'));
        if (pl) openLog(pl);
      });
    });
  }

  // Minimal CSS.escape fallback for querySelector ids (sample ids are safe anyway).
  function cssEscape(s) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  CT.registerView('armsafety', { label: 'Arm Safety', render: render });
})();

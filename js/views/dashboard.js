/* views/dashboard.js — DASHBOARD (the "is everything OK?" home screen).
   Default view on load. Three bands, airy -> dense:
     (1) HERO status line — one glance answer: "2 need attention — 1 resting arm,
         2 assessments overdue" or a calm "All clear".
     (2) KPI tiles — Players · Arms cleared · Active alerts · Assessments due.
     (3) Recent activity timeline — team-wide, newest first, grouped by day.
   Deep-dive detail lives one click in (player profiles, alerts panel, sessions).
   Built only on the documented CT API. Registers CT.registerView('dashboard'). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;
  const ps = CT.pitchsmart, stats = CT.stats;

  const ASSESS_STALE_DAYS = 21;

  function isPitcher(p) { return (p.positions || []).some(function (x) { return /pitch/i.test(x); }); }

  function latestCheckIn(playerId) {
    const rows = store.byPlayer('dailyCheckIns', playerId);
    if (!rows.length) return null;
    return rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-1)[0];
  }

  // Compact relative time for the feed ("today", "3d", "2w", "4mo").
  function relShort(iso) {
    const n = CT.daysAgo(iso);
    if (n == null) return '';
    if (n <= 0) return 'today';
    if (n < 7) return n + 'd';
    if (n < 30) return Math.round(n / 7) + 'w';
    if (n < 365) return Math.round(n / 30) + 'mo';
    return Math.round(n / 365) + 'y';
  }
  function dayLabel(iso) {
    const n = CT.daysAgo(iso);
    if (n == null) return iso;
    if (n <= 0) return 'Today';
    if (n === 1) return 'Yesterday';
    return CT.formatDate(iso);
  }

  // ---------- roll-up: what needs attention ----------
  function rollup(players) {
    const pitchers = players.filter(isPitcher);
    let cleared = 0, resting = 0;
    const attention = {};   // playerId -> true (distinct affected players)
    pitchers.forEach(function (p) {
      const v = ps.evaluate(p, store.byPlayer('workloadLogs', p.id));
      if (v.status === 'green') cleared++;
      if (v.status === 'red') { resting++; attention[p.id] = true; }
    });
    let pain = 0, overdue = 0;
    players.forEach(function (p) {
      const c = latestCheckIn(p.id);
      if (c && c.armPain && CT.daysAgo(c.date) <= ASSESS_STALE_DAYS) { pain++; attention[p.id] = true; }
      const last = store.lastAssessmentDate(p.id);
      const days = last ? CT.daysAgo(last) : null;
      if (!last || days > ASSESS_STALE_DAYS) { overdue++; attention[p.id] = true; }
    });
    return {
      pitchers: pitchers.length, cleared: cleared, resting: resting,
      pain: pain, overdue: overdue,
      attentionCount: Object.keys(attention).length
    };
  }

  // ---------- hero status ----------
  function heroHtml(r, alerts) {
    const red = alerts.filter(function (a) { return a.severity === 'red'; }).length;
    let tone, icon, status, sub;

    const parts = [];
    if (r.resting) parts.push(r.resting + ' resting arm' + (r.resting === 1 ? '' : 's'));
    if (r.pain) parts.push(r.pain + ' pain flag' + (r.pain === 1 ? '' : 's'));
    if (r.overdue) parts.push(r.overdue + ' assessment' + (r.overdue === 1 ? '' : 's') + ' overdue');

    if (r.attentionCount === 0 && !alerts.length) {
      tone = 'accent'; icon = 'shield-check'; status = 'All clear';
      sub = 'Every arm is within Pitch Smart limits and assessments are current. Keep logging sessions to keep it honest.';
    } else {
      const critical = r.resting > 0 || r.pain > 0 || red > 0;
      tone = critical ? 'seam' : 'warn';
      icon = critical ? 'alert-octagon' : 'alert-triangle';
      const n = Math.max(r.attentionCount, 1);
      status = n + ' player' + (n === 1 ? '' : 's') + ' need attention';
      sub = parts.length ? parts.join(' · ') : (alerts.length + ' active flag' + (alerts.length === 1 ? '' : 's'));
    }

    const action = (r.attentionCount || alerts.length)
      ? '<a class="btn btn-sm dash-hero-cta" href="#/players"><i data-lucide="arrow-right"></i>Review players</a>'
      : '';

    return '<div class="dash-hero" style="' + ui.toneStyle(tone) + '">' +
      '<span class="dash-hero-icon"><i data-lucide="' + icon + '"></i></span>' +
      '<div class="dash-hero-text">' +
        '<div class="dash-hero-status">' + esc(status) + '</div>' +
        '<div class="dash-hero-sub">' + esc(sub) + '</div>' +
      '</div>' + action +
    '</div>';
  }

  // ---------- KPI tiles ----------
  function tile(eyebrow, value, sub, tone) {
    const vStyle = tone ? ' style="color:' + tone + ';"' : '';
    return '<div class="dash-tile">' +
      '<div class="dash-tile-eyebrow">' + esc(eyebrow) + '</div>' +
      '<div class="dash-tile-value num"' + vStyle + '>' + esc(value) + '</div>' +
      '<div class="dash-tile-sub">' + esc(sub) + '</div>' +
    '</div>';
  }

  function tilesHtml(players, r, alerts) {
    const red = alerts.filter(function (a) { return a.severity === 'red'; }).length;
    const alertTone = red > 0 ? 'var(--seam)' : (alerts.length ? 'var(--warn)' : 'var(--text-hi)');
    const armTone = r.resting > 0 ? 'var(--seam)' : 'var(--text-hi)';
    const overdueTone = r.overdue > 0 ? 'var(--warn)' : 'var(--text-hi)';
    return '<div class="dash-tiles">' +
      tile('Players', String(players.length), r.pitchers + ' pitcher' + (r.pitchers === 1 ? '' : 's'), null) +
      tile('Arms cleared', r.cleared + '/' + r.pitchers, r.resting ? (r.resting + ' resting') : 'all healthy', armTone) +
      tile('Active alerts', String(alerts.length), red + ' critical', alertTone) +
      tile('Assessments due', String(r.overdue), r.overdue ? 'over ' + ASSESS_STALE_DAYS + ' days' : 'all current', overdueTone) +
    '</div>';
  }

  // ---------- team-wide recent activity ----------
  function battingSummary(l) {
    const seg = (l.h || 0) + '-' + (l.ab || 0);
    const ex = [];
    if (l.hr) ex.push(l.hr + ' HR'); if (l.bb) ex.push(l.bb + ' BB'); if (l.rbi) ex.push(l.rbi + ' RBI');
    return seg + (ex.length ? ', ' + ex.join(', ') : '');
  }

  function buildEvents(players) {
    const events = [];
    const nameOf = {};
    players.forEach(function (p) { nameOf[p.id] = p.name; });

    players.forEach(function (p) {
      store.lessonsForPlayer(p.id).forEach(function (l) {
        const n = (l.drillIds || []).length;
        events.push({ date: l.date, sort: l.date + '_2', dot: 'var(--accent-500)', pid: p.id,
          title: p.name + ' — lesson', outcome: l.notes || (n + ' drill' + (n === 1 ? '' : 's') + ' completed') });
      });
      store.byPlayer('assessmentSessions', p.id).forEach(function (a) {
        const rs = store.byPlayer('metricReadings', p.id).filter(function (r) { return r.assessmentSessionId === a.id && !r.voided; });
        const typeLabel = a.type === 'showcase' ? 'showcase' : 'assessment';
        events.push({ date: a.date, sort: a.date + '_3', dot: 'var(--accent-400)', pid: p.id,
          title: p.name + ' — ' + typeLabel + ' logged', outcome: (a.location ? a.location + ' · ' : '') + rs.length + ' metric' + (rs.length === 1 ? '' : 's') + ' captured' });
      });
      const c = latestCheckIn(p.id);
      if (c && c.armPain) {
        events.push({ date: c.date, sort: c.date + '_5', dot: 'var(--seam)', pid: p.id,
          title: p.name + ' — arm pain reported' + (c.painLocation ? ' (' + c.painLocation + ')' : ''),
          outcome: 'Auto-escalated — hold throwing and refer to a clinician.' });
      }
    });

    // Games are team-level (one event each), with any batting/pitching lines summarised.
    store.all('games').forEach(function (g) {
      const bat = store.where('battingStatLines', 'gameId', g.id);
      const pit = store.where('pitchingAppearances', 'gameId', g.id);
      const parts = [];
      bat.slice(0, 2).forEach(function (l) { parts.push((nameOf[l.playerId] || 'Player').split(' ').slice(-1)[0] + ' ' + battingSummary(l)); });
      pit.slice(0, 2).forEach(function (l) { parts.push((nameOf[l.playerId] || 'Player').split(' ').slice(-1)[0] + ' ' + stats.formatIP(l.outs) + ' IP, ' + (l.so || 0) + ' K'); });
      const result = g.scoreFor == null ? 'Scheduled' :
        (g.scoreFor > g.scoreAgainst ? 'W' : (g.scoreFor < g.scoreAgainst ? 'L' : 'T')) + ' ' + g.scoreFor + '–' + g.scoreAgainst;
      events.push({ date: g.date, sort: g.date + '_1', dot: 'var(--text-secondary)', gid: g.id,
        title: 'Game ' + (g.homeAway === 'away' ? '@ ' : 'vs ') + (g.opponent || 'TBD'),
        outcome: result + (parts.length ? ' · ' + parts.join(' · ') : '') });
    });

    events.sort(function (a, b) { return a.sort < b.sort ? 1 : (a.sort > b.sort ? -1 : 0); });
    return events;
  }

  function feedItemHtml(ev) {
    const href = ev.pid ? '#/player/' + esc(ev.pid) : (ev.gid ? '#/games/' + esc(ev.gid) : '#/dashboard');
    return '<a class="dm-feed-item dash-feed-item" href="' + href + '">' +
      '<span class="dm-feed-dot" style="background:' + ev.dot + ';"></span>' +
      '<div class="dm-feed-body">' +
        '<div class="dm-feed-action">' + esc(ev.title) + '</div>' +
        '<div class="dm-feed-outcome">' + esc(ev.outcome) + '</div>' +
      '</div>' +
      '<span class="dm-feed-time num">' + esc(relShort(ev.date)) + '</span>' +
    '</a>';
  }

  function feedHtml(events) {
    let html = '<div class="dm-feed">';
    let curDay = null;
    events.forEach(function (ev) {
      if (ev.date !== curDay) { curDay = ev.date; html += '<div class="dm-feed-day">' + esc(dayLabel(ev.date)) + '</div>'; }
      html += feedItemHtml(ev);
    });
    return html + '</div>';
  }

  // ---------- first-run onboarding (hero + 3-step checklist) ----------
  // Driven LIVE by store counts (no stored wizard state): steps check off as
  // real data appears, and the whole block retires once the program is rolling.
  function onboardStep(n, done, locked, href, title, sub, icon) {
    const cls = 'onboard-step' + (done ? ' done' : '') + (locked ? ' locked' : '');
    const num = done ? '<i data-lucide="check"></i>' : String(n);
    const tag = locked ? 'div' : 'a';
    return '<' + tag + ' class="' + cls + '"' + (locked ? '' : ' href="' + href + '"') + '>' +
      '<span class="onboard-num">' + num + '</span>' +
      '<span class="onboard-body">' +
        '<span class="onboard-title">' + esc(title) + '</span>' +
        '<span class="onboard-sub">' + esc(sub) + '</span>' +
      '</span>' +
      (done ? '' : '<span class="onboard-go"><i data-lucide="' + (locked ? 'lock' : 'arrow-right') + '"></i></span>') +
    '</' + tag + '>';
  }

  function onboardingHtml(players) {
    const hasPlayers = players.length > 0;
    const hasAssessment = store.all('assessmentSessions').length > 0;
    const hasProgram = store.all('programAssignments').length > 0;
    return ui.pageHead('Dashboard', 'Your program at a glance') +
      '<div class="dash-hero" style="' + ui.toneStyle('accent') + '">' +
        '<span class="dash-hero-icon"><i data-lucide="sparkles"></i></span>' +
        '<div class="dash-hero-text"><div class="dash-hero-status">' +
          (hasPlayers ? 'Almost rolling — finish setup' : 'Welcome to Diamond Mind') + '</div>' +
        '<div class="dash-hero-sub">' +
          (hasPlayers
            ? 'Your roster is started. Run a first assessment and assign a program to unlock the full dashboard.'
            : 'Add your first player to start tracking development, sessions, games, and arm safety.') +
        '</div></div>' +
        (hasPlayers ? '' : '<a class="btn btn-sm dash-hero-cta" href="#/players"><i data-lucide="user-plus"></i>Add a player</a>') +
      '</div>' +
      '<div class="onboard-steps">' +
        onboardStep(1, hasPlayers, false, '#/players', 'Add a player',
          'Name, birthdate, and positions — age bands drive benchmarks and Pitch Smart limits.') +
        onboardStep(2, hasAssessment, !hasPlayers, '#/assessment', 'Run a first assessment',
          'Capture exit velo, throwing velo, and speed to baseline every player.') +
        onboardStep(3, hasProgram, !hasPlayers, '#/sessions/programs', 'Assign a program',
          'Arm care, long toss, or strength — adherence shows up here automatically.') +
      '</div>';
  }

  // ---------- main render ----------
  function render(root, ctx) {
    const players = store.getPlayers();

    // First-run: no players yet, or a fresh roster with no logged activity.
    const fresh = !players.length ||
      (!store.all('assessmentSessions').length && !store.all('programAssignments').length &&
       !store.all('games').length && !store.all('lessons').length);
    if (fresh) {
      root.innerHTML = onboardingHtml(players);
      return;
    }

    let alerts = [];
    try { alerts = (CT.alerts && CT.alerts.build) ? CT.alerts.build() : []; } catch (e) { alerts = []; }
    const r = rollup(players);

    let html = ui.pageHead('Dashboard', 'Your program at a glance');
    html += heroHtml(r, alerts);
    html += tilesHtml(players, r, alerts);
    html += '<h2 class="dm-feed-title">Recent activity</h2>';

    const events = buildEvents(players).slice(0, 14);
    html += events.length ? feedHtml(events)
      : ui.emptyState('activity', 'No activity yet', 'Log a lesson, assessment, or game to build the timeline.',
          '<a class="btn btn-primary" href="#/sessions"><i data-lucide="plus"></i>Build a session</a>');

    root.innerHTML = html;
  }

  CT.registerView('dashboard', { label: 'Dashboard', render: render });
})();

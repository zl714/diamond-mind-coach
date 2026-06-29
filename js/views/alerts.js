/* views/alerts.js — Alerts / Flags feed. Aggregates the things a coach must NOT
   miss, computed live from the shared foundation:
     • Pain escalations (daily check-in armPain / high soreness)
     • Pitch Smart violations (over daily max, insufficient rest, 3 consecutive days,
       annual innings cap) via CT.pitchsmart.evaluate
     • ACWR workload spikes (caution / danger zones)
     • Low program adherence (completed vs planned past sessions)
   Each flag is a severity-colored card with player, date, and a deep link to the
   relevant view. Youth framing: guidance, not pass/fail. Registers itself via
   CT.registerView('alerts', { label, render }). Reads only the documented CT API. */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, pitchsmart = CT.pitchsmart, esc = CT.escapeHtml;

  // Tunables (no hardcoded magic scattered in logic).
  const SORENESS_FLAG = 6;          // 0-10 daily check-in soreness that warrants caution
  const CHECKIN_WINDOW_DAYS = 21;   // ignore stale check-ins beyond this
  const ADHERENCE_RED = 0.5;        // < 50% completed past sessions = critical
  const ADHERENCE_YELLOW = 0.75;    // < 75% = caution
  const ADHERENCE_MIN_SESSIONS = 3; // need this many past sessions to judge

  const CAT_LABEL = {
    pain: 'Pain',
    pitchsmart: 'Pitch Smart',
    acwr: 'ACWR',
    adherence: 'Adherence'
  };

  // ----- small pure helpers -----
  function byDateDesc(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }

  function linkFor(category) {
    if (category === 'adherence') return { link: 'programs', linkLabel: 'View programs' };
    return { link: 'armsafety', linkLabel: 'View arm safety' };
  }

  function makeAlert(o) {
    const l = linkFor(o.category);
    return {
      category: o.category,
      severity: o.severity,            // 'red' | 'yellow'
      playerId: o.playerId,
      playerName: o.playerName,
      title: o.title,
      detail: o.detail || '',
      date: o.date || CT.todayISO(),
      link: l.link,
      linkLabel: l.linkLabel
    };
  }

  // ----- alert sources -----
  function painAlerts(players) {
    const out = [];
    const checkins = store.all('dailyCheckIns');
    players.forEach(function (p) {
      const rows = checkins.filter(function (c) { return c.playerId === p.id; }).slice().sort(byDateDesc);
      if (!rows.length) return;
      const c = rows[0]; // most recent counts
      if (CT.daysAgo(c.date) > CHECKIN_WINDOW_DAYS) return;
      if (c.armPain) {
        out.push(makeAlert({
          category: 'pain', severity: 'red', playerId: p.id, playerName: p.name, date: c.date,
          title: 'Arm pain reported' + (c.painLocation ? ' (' + c.painLocation + ')' : ''),
          detail: 'Auto-escalated from daily check-in — shut down throwing and recommend a medical referral before return-to-throw.'
        }));
      } else if (Number(c.soreness) >= SORENESS_FLAG) {
        out.push(makeAlert({
          category: 'pain', severity: 'yellow', playerId: p.id, playerName: p.name, date: c.date,
          title: 'Elevated soreness (' + c.soreness + '/10)',
          detail: 'Reported fatigue ' + (c.fatigue != null ? c.fatigue + '/10' : 'n/a') +
            (c.sleepHours != null ? ', sleep ' + c.sleepHours + 'h' : '') + '. Monitor before loading up.'
        }));
      }
    });
    return out;
  }

  function workloadAlerts(players) {
    const out = [];
    players.forEach(function (p) {
      const logs = store.byPlayer('workloadLogs', p.id);
      if (!logs.length) return;
      const v = pitchsmart.evaluate(p, logs);
      const lastDate = v.lastOuting ? v.lastOuting.date : CT.todayISO();
      const today = CT.todayISO();

      // Pitched on insufficient rest -> currently resting / not cleared.
      if (v.daysUntilEligible > 0 && v.lastOuting) {
        out.push(makeAlert({
          category: 'pitchsmart', severity: 'red', playerId: p.id, playerName: p.name, date: lastDate,
          title: 'Insufficient rest — not cleared to pitch',
          detail: 'Threw ' + v.lastOuting.pitches + ' pitches on ' + CT.formatDate(v.lastOuting.date) +
            ' (' + v.ageBand + '): requires ' + v.lastOuting.restNeeded + ' day(s) rest. Eligible in ' +
            v.daysUntilEligible + ' day(s).'
        }));
      }

      // Over the daily pitch maximum today.
      if (v.thrownToday >= v.dailyMax) {
        out.push(makeAlert({
          category: 'pitchsmart', severity: 'red', playerId: p.id, playerName: p.name, date: today,
          title: 'Over daily pitch max',
          detail: 'Threw ' + v.thrownToday + ' pitches today — at/over the ' + v.dailyMax + '-pitch max for ' + v.ageBand + '.'
        }));
      }

      // Consecutive-day rule (never 3 straight days, youth).
      if (v.consecutiveStreak >= 3) {
        out.push(makeAlert({
          category: 'pitchsmart', severity: 'red', playerId: p.id, playerName: p.name, date: today,
          title: '3+ consecutive pitching days',
          detail: 'Pitched ' + v.consecutiveStreak + ' straight days — violates the no-3-consecutive-days rule. Mandatory rest.'
        }));
      } else if (v.consecutiveDayWarning) {
        out.push(makeAlert({
          category: 'pitchsmart', severity: 'yellow', playerId: p.id, playerName: p.name, date: today,
          title: 'Back-to-back pitching days',
          detail: 'On a ' + v.consecutiveStreak + '-day streak — a 3rd straight pitching day is not allowed.'
        }));
      }

      // Rolling 12-month innings cap.
      if (v.overInningsCap) {
        out.push(makeAlert({
          category: 'pitchsmart', severity: 'red', playerId: p.id, playerName: p.name, date: today,
          title: 'Over annual innings cap',
          detail: 'Rolling 12-month innings (' + v.rolling12moInnings.toFixed(1) + ') exceeds the ' +
            v.inningsCap + '-inning cap. Needs extended time off competitive throwing.'
        }));
      }

      // ACWR workload spike.
      if (v.acwr && v.acwr.ratio != null) {
        if (v.acwr.zone === 'danger') {
          out.push(makeAlert({
            category: 'acwr', severity: 'red', playerId: p.id, playerName: p.name, date: today,
            title: 'ACWR spike (danger)',
            detail: 'Acute:chronic workload ratio ' + v.acwr.ratio.toFixed(2) +
              ' is in the danger zone (>1.5) — a rapid workload jump that raises injury risk.'
          }));
        } else if (v.acwr.zone === 'caution') {
          out.push(makeAlert({
            category: 'acwr', severity: 'yellow', playerId: p.id, playerName: p.name, date: today,
            title: 'ACWR elevated (caution)',
            detail: 'Acute:chronic workload ratio ' + v.acwr.ratio.toFixed(2) + ' (1.3–1.5) — ramping a touch fast. Ease the build.'
          }));
        }
      }
    });
    return out;
  }

  function adherenceAlerts() {
    const out = [];
    const todayStr = CT.todayISO();
    const assignments = store.all('programAssignments');
    assignments.forEach(function (a) {
      if (a.status === 'paused' || a.status === 'completed') return;
      const sessions = store.where('programSessions', 'assignmentId', a.id);
      const past = sessions.filter(function (s) { return s.date < todayStr && s.planned !== false; });
      if (past.length < ADHERENCE_MIN_SESSIONS) return;
      const done = past.filter(function (s) { return s.completed; }).length;
      const pct = done / past.length;
      if (pct >= ADHERENCE_YELLOW) return;

      const player = store.getPlayer(a.playerId);
      if (!player) return;
      const prog = store.getById('programs', a.programId);
      const progName = prog && prog.name ? prog.name : 'Program';
      const lastPast = past.slice().sort(byDateDesc)[0];
      const sev = pct < ADHERENCE_RED ? 'red' : 'yellow';
      out.push(makeAlert({
        category: 'adherence', severity: sev, playerId: player.id, playerName: player.name,
        date: lastPast ? lastPast.date : todayStr,
        title: 'Low program adherence',
        detail: progName + ': ' + done + '/' + past.length + ' planned sessions completed (' +
          Math.round(pct * 100) + '%). Check in on warm-up / arm-care follow-through.'
      }));
    });
    return out;
  }

  function buildAlerts() {
    const players = store.getPlayers();
    const all = painAlerts(players).concat(workloadAlerts(players)).concat(adherenceAlerts());
    const order = { red: 0, yellow: 1 };
    all.sort(function (a, b) {
      const s = (order[a.severity] || 9) - (order[b.severity] || 9);
      return s !== 0 ? s : byDateDesc(a, b);
    });
    return all;
  }

  // ----- rendering -----
  function alertCard(a) {
    const body =
      '<div class="alert-row">' +
        ui.badge(CAT_LABEL[a.category] || a.category, a.severity) +
        '<span class="alert-date">' + esc(CT.formatDate(a.date)) + '</span>' +
      '</div>' +
      '<div class="alert-title">' + esc(a.playerName) + '</div>' +
      '<div class="alert-issue">' + esc(a.title) + '</div>' +
      (a.detail ? '<div class="alert-detail muted">' + esc(a.detail) + '</div>' : '') +
      '<div class="row" style="margin-top:.65rem;">' +
        '<a class="btn btn-sm" href="#/' + esc(a.link) + '/' + esc(a.playerId) + '">' + esc(a.linkLabel) + ' →</a>' +
      '</div>';
    return ui.card({ body: body, className: 'alert-card sev-' + a.severity });
  }

  function render(root, ctx) {
    const alerts = buildAlerts();
    const red = alerts.filter(function (a) { return a.severity === 'red'; }).length;
    const yellow = alerts.length - red;
    const affected = {};
    alerts.forEach(function (a) { affected[a.playerId] = true; });
    const affectedCount = Object.keys(affected).length;

    let html = ui.pageHead('Alerts',
      alerts.length + ' active flag(s) · ' + red + ' critical · ' + yellow + ' caution');

    html += '<div class="stats" style="grid-template-columns:repeat(4,1fr);">' +
      ui.statTile(alerts.length, 'Active flags') +
      ui.statTile(red, 'Critical') +
      ui.statTile(yellow, 'Caution') +
      ui.statTile(affectedCount, 'Players') +
      '</div>';

    if (!alerts.length) {
      html += ui.emptyState('✅', 'All clear',
        'No pain flags, Pitch Smart violations, ACWR spikes, or program-adherence issues right now. Keep logging check-ins and workload to keep this feed honest.');
      root.innerHTML = html;
      return;
    }

    html += '<div class="grid-cards ct-alerts">' + alerts.map(alertCard).join('') + '</div>';
    html += '<p class="muted" style="margin-top:1.1rem;font-size:.8rem;line-height:1.4;">' +
      esc('Youth flags are guidance, not pass/fail. Pain reports auto-escalate to a medical referral; Pitch Smart rest, ' +
        'consecutive-day, and innings limits are hard rules. Tap a card to open the relevant view.') +
      '</p>';

    root.innerHTML = html;
  }

  CT.registerView('alerts', { label: 'Alerts', render: render });
})();

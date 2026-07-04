/* pitchsmart.js — MLB / USA Baseball Pitch Smart as a HARD RULE ENGINE (not advice).
   Given a player + their workload logs, returns a clearance verdict, days-until-
   eligible, today's remaining pitch allowance, rolling-12-month innings,
   consecutive-day warnings, and ACWR. Youth-safety language is honest, not punitive.
   Exposed on window.CT.pitchsmart. Pure — no DOM, no storage. */
(function () {
  'use strict';

  const CT = window.CT;

  // Daily pitch maximums by age band (USA Baseball Pitch Smart).
  const DAILY_MAX = { '9-10U': 75, '11-12U': 85, '13-14U': 95, '15-16U': 95, '17-18U': 105 };

  // Required days of rest given pitches thrown in a single day, by age band.
  // Each entry: { upTo, rest } — first entry whose upTo >= pitches applies.
  const REST_TABLE = {
    '9-10U':  [{ upTo: 20, rest: 0 }, { upTo: 35, rest: 1 }, { upTo: 50, rest: 2 }, { upTo: 65, rest: 3 }, { upTo: Infinity, rest: 4 }],
    '11-12U': [{ upTo: 20, rest: 0 }, { upTo: 35, rest: 1 }, { upTo: 50, rest: 2 }, { upTo: 65, rest: 3 }, { upTo: Infinity, rest: 4 }],
    '13-14U': [{ upTo: 20, rest: 0 }, { upTo: 35, rest: 1 }, { upTo: 50, rest: 2 }, { upTo: 65, rest: 3 }, { upTo: Infinity, rest: 4 }],
    '15-16U': [{ upTo: 30, rest: 0 }, { upTo: 45, rest: 1 }, { upTo: 60, rest: 2 }, { upTo: 75, rest: 3 }, { upTo: Infinity, rest: 4 }],
    '17-18U': [{ upTo: 30, rest: 0 }, { upTo: 45, rest: 1 }, { upTo: 60, rest: 2 }, { upTo: 75, rest: 3 }, { upTo: Infinity, rest: 4 }]
  };

  const ANNUAL_INNINGS_CAP = 80; // <= 80 innings pitched per 12 months (youth)

  function dailyMax(band) { return DAILY_MAX[band] != null ? DAILY_MAX[band] : 85; }

  function restRequired(band, pitches) {
    const table = REST_TABLE[band] || REST_TABLE['11-12U'];
    const p = Number(pitches) || 0;
    for (let i = 0; i < table.length; i++) {
      if (p <= table[i].upTo) return table[i].rest;
    }
    return 4;
  }

  function dayDiff(aISO, bISO) {
    const a = new Date(aISO + 'T00:00:00');
    const b = new Date(bISO + 'T00:00:00');
    return Math.round((a - b) / 86400000);
  }

  function todayISO() { return CT.todayISO(); }

  // Group workload logs into per-day pitch totals (only days that involved pitching).
  function pitchesByDay(logs) {
    const byDay = {};
    (logs || []).forEach(function (l) {
      const p = Number(l.pitches) || 0;
      if (p <= 0) return;
      byDay[l.date] = (byDay[l.date] || 0) + p;
    });
    return byDay; // { 'yyyy-mm-dd': totalPitches }
  }

  // Sum innings (outs/3) over the trailing `days` window.
  function inningsInWindow(logs, days, asOf) {
    const ref = asOf || todayISO();
    let outs = 0;
    (logs || []).forEach(function (l) {
      const d = dayDiff(ref, l.date);
      if (d >= 0 && d < days) outs += Number(l.outs) || 0;
    });
    return outs / 3;
  }

  function pitchesInWindow(byDay, days, asOf) {
    const ref = asOf || todayISO();
    let total = 0;
    Object.keys(byDay).forEach(function (date) {
      const d = dayDiff(ref, date);
      if (d >= 0 && d < days) total += byDay[date];
    });
    return total;
  }

  // Acute:Chronic Workload Ratio. Acute = last 7d pitch load; chronic = avg weekly
  // load over the last 28d. Sweet spot ~0.8–1.3; > 1.5 is a spike risk.
  function computeACWR(byDay, asOf) {
    const acute = pitchesInWindow(byDay, 7, asOf);
    const chronic28 = pitchesInWindow(byDay, 28, asOf);
    const chronicWeekly = chronic28 / 4;
    const ratio = chronicWeekly ? acute / chronicWeekly : null;
    let zone = 'unknown';
    if (ratio != null) {
      if (ratio < 0.8) zone = 'low';
      else if (ratio <= 1.3) zone = 'optimal';
      else if (ratio <= 1.5) zone = 'caution';
      else zone = 'danger';
    }
    return { acute: acute, chronicWeekly: chronicWeekly, ratio: ratio, zone: zone };
  }

  // Detect 3+ consecutive calendar days that involved pitching, ending most recently.
  function consecutivePitchingDays(byDay, asOf) {
    const dates = Object.keys(byDay).sort(); // ascending
    if (!dates.length) return { streak: 0, warning: false };
    let best = 1, cur = 1;
    for (let i = 1; i < dates.length; i++) {
      if (dayDiff(dates[i], dates[i - 1]) === 1) { cur++; best = Math.max(best, cur); }
      else cur = 1;
    }
    // Current active streak ending at the latest pitching day.
    const ref = asOf || todayISO();
    let streakNow = 0;
    for (let back = 0; back < 7; back++) {
      const d = new Date(ref + 'T00:00:00');
      d.setDate(d.getDate() - back);
      const key = d.toISOString().slice(0, 10);
      if (byDay[key]) streakNow++;
      else if (back === 0) continue; // today off is fine; keep looking back
      else break;
    }
    const streak = Math.max(streakNow, 0);
    return { streak: streak, maxStreak: best, warning: streakNow >= 2 }; // warn at 2 (next day would be a 3rd)
  }

  /**
   * evaluate(player, logs, opts) -> verdict
   * @param player CT.model.Player (uses .ageBand or .birthdate)
   * @param logs   array of WorkloadLog for THIS player (any order)
   * @returns {
   *   ageBand, dailyMax, cleared (bool), status ('green'|'yellow'|'red'),
   *   daysUntilEligible, remainingToday, lastOuting {date,pitches,restNeeded},
   *   rolling12moInnings, inningsCap, overInningsCap (bool),
   *   consecutiveDayWarning (bool), consecutiveStreak,
   *   acwr {acute,chronicWeekly,ratio,zone}, reasons:[]
   * }
   */
  function evaluate(player, logs, opts) {
    opts = opts || {};
    const asOf = opts.asOf || todayISO();
    const band = (player && (player.ageBand || CT.model.ageBandFromBirthdate(player.birthdate))) || '11-12U';
    const max = dailyMax(band);
    const byDay = pitchesByDay(logs);
    const reasons = [];

    // Most recent pitching day.
    const pitchDates = Object.keys(byDay).sort();
    const lastDate = pitchDates.length ? pitchDates[pitchDates.length - 1] : null;
    const lastPitches = lastDate ? byDay[lastDate] : 0;
    const restNeeded = lastDate ? restRequired(band, lastPitches) : 0;
    const daysSinceLast = lastDate ? dayDiff(asOf, lastDate) : Infinity;

    // Rest clearance. Required rest days start the DAY AFTER the outing —
    // same-day throwing is governed only by the daily-max remaining below, so
    // a coach can log a legitimate second same-day session under the max.
    let daysUntilEligible = 0;
    if (lastDate && daysSinceLast >= 1 && daysSinceLast < restNeeded) {
      daysUntilEligible = restNeeded - daysSinceLast;
      reasons.push('Needs ' + restNeeded + ' day' + (restNeeded === 1 ? '' : 's') + ' rest after ' +
        lastPitches + ' pitches on ' + CT.formatDate(lastDate) + '.');
    }

    // Today's remaining allowance.
    const thrownToday = byDay[asOf] || 0;
    const remainingToday = daysUntilEligible > 0 ? 0 : Math.max(0, max - thrownToday);
    if (thrownToday >= max) reasons.push('Daily max (' + max + ') reached today.');

    // Consecutive-day rule (never 3 straight days, youth).
    const consec = consecutivePitchingDays(byDay, asOf);
    if (consec.streak >= 3) reasons.push('Has pitched ' + consec.streak + ' consecutive days — exceeds the 3-day rule.');
    else if (consec.warning) reasons.push('On a ' + consec.streak + '-day streak — a 3rd straight day is not allowed.');

    // Rolling 12-month innings cap.
    const rolling12mo = inningsInWindow(logs, 365, asOf);
    const overCap = rolling12mo > ANNUAL_INNINGS_CAP;
    if (overCap) reasons.push('Rolling 12-month innings (' + rolling12mo.toFixed(1) + ') exceeds the ' + ANNUAL_INNINGS_CAP + '-inning cap.');

    // ACWR spike.
    const acwr = computeACWR(byDay, asOf);
    if (acwr.zone === 'danger') reasons.push('ACWR ' + acwr.ratio.toFixed(2) + ' is in the danger zone (>1.5) — workload spiked.');

    // Verdict.
    const hardBlock = daysUntilEligible > 0 || consec.streak >= 3 || overCap || remainingToday <= 0;
    let status;
    if (hardBlock) status = 'red';
    else if (acwr.zone === 'danger' || acwr.zone === 'caution' || consec.warning) status = 'yellow';
    else status = 'green';

    if (status === 'green' && !reasons.length) reasons.push('Cleared — within all rest and workload limits.');

    return {
      ageBand: band,
      dailyMax: max,
      cleared: status !== 'red',
      status: status,
      daysUntilEligible: daysUntilEligible,
      remainingToday: remainingToday,
      thrownToday: thrownToday,
      lastOuting: lastDate ? { date: lastDate, pitches: lastPitches, restNeeded: restNeeded, daysSince: daysSinceLast } : null,
      rolling12moInnings: rolling12mo,
      inningsCap: ANNUAL_INNINGS_CAP,
      overInningsCap: overCap,
      consecutiveDayWarning: consec.warning || consec.streak >= 3,
      consecutiveStreak: consec.streak,
      acwr: acwr,
      reasons: reasons
    };
  }

  window.CT.pitchsmart = {
    DAILY_MAX: DAILY_MAX,
    REST_TABLE: REST_TABLE,
    ANNUAL_INNINGS_CAP: ANNUAL_INNINGS_CAP,
    dailyMax: dailyMax,
    restRequired: restRequired,
    computeACWR: computeACWR,
    inningsInWindow: inningsInWindow,
    pitchesByDay: pitchesByDay,
    evaluate: evaluate
  };
})();

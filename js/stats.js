/* stats.js — PURE baseball stats library.
   GOLDEN RULE: raw per-game counters are the source of truth. ALL rate stats are
   DERIVED on read by SUMMING raw counters first, then computing the rate ONCE.
   NEVER average per-game rates. IP is stored as OUTS (3 outs = 1 inning).
   Exposed on window.CT.stats. No DOM, no storage — just math. */
(function () {
  'use strict';

  const CT = window.CT;

  // Safe divide: returns null (not NaN/Infinity) when denominator is 0.
  function div(n, d) { return d ? n / d : null; }

  // ---------------------------------------------------------------------------
  // Batting
  // ---------------------------------------------------------------------------
  const BAT_COUNTERS = ['ab', 'h', 'b2', 'b3', 'hr', 'bb', 'hbp', 'sf', 'so', 'sb', 'cs', 'r', 'rbi', 'qab'];

  function sumBatting(lines) {
    const t = {};
    BAT_COUNTERS.forEach(function (k) { t[k] = 0; });
    t.pa = 0;
    (lines || []).forEach(function (l) {
      BAT_COUNTERS.forEach(function (k) { t[k] += Number(l[k]) || 0; });
      // PA: use stored when present, else derive from this line's counters.
      t.pa += (l.pa != null ? Number(l.pa) : ((Number(l.ab) || 0) + (Number(l.bb) || 0) + (Number(l.hbp) || 0) + (Number(l.sf) || 0)));
    });
    return t;
  }

  // Compute batting rates from a SUMMED totals object.
  function deriveBatting(t) {
    const singles = t.h - t.b2 - t.b3 - t.hr;
    const tb = singles + 2 * t.b2 + 3 * t.b3 + 4 * t.hr;
    const obDen = t.ab + t.bb + t.hbp + t.sf;
    const avg = div(t.h, t.ab);
    const obp = div(t.h + t.bb + t.hbp, obDen);
    const slg = div(tb, t.ab);
    return {
      pa: t.pa, ab: t.ab, h: t.h, singles: singles, b2: t.b2, b3: t.b3, hr: t.hr,
      bb: t.bb, so: t.so, hbp: t.hbp, sf: t.sf, sb: t.sb, cs: t.cs, r: t.r, rbi: t.rbi,
      tb: tb,
      avg: avg,
      obp: obp,
      slg: slg,
      ops: (obp == null || slg == null) ? null : obp + slg,
      iso: (slg == null || avg == null) ? null : slg - avg,
      kPct: div(t.so, t.pa),
      bbPct: div(t.bb, t.pa),
      bbK: div(t.bb, t.so),
      sbPct: div(t.sb, t.sb + t.cs),
      qabPct: t.qab ? div(t.qab, t.pa) : null
    };
  }

  function battingFromLines(lines) { return deriveBatting(sumBatting(lines)); }

  // ---------------------------------------------------------------------------
  // Pitching — ERA/K9/BB9 scaled by innings-per-game for the player's level.
  // ---------------------------------------------------------------------------
  const PIT_COUNTERS = ['outs', 'h', 'r', 'er', 'bb', 'so', 'hbp', 'hr', 'pitches', 'strikes', 'firstPitchStrikes', 'firstPitchPA'];

  function sumPitching(apps) {
    const t = {};
    PIT_COUNTERS.forEach(function (k) { t[k] = 0; });
    t.bf = 0;
    (apps || []).forEach(function (a) {
      PIT_COUNTERS.forEach(function (k) { t[k] += Number(a[k]) || 0; });
      t.bf += (a.bf != null ? Number(a.bf) : 0);
    });
    return t;
  }

  // ipg = innings per game (6 youth / 7 HS / 9 college+). Defaults to 9 (classic) if omitted.
  function derivePitching(t, ipg) {
    const ip = t.outs / 3; // true innings as a decimal
    const perGame = ipg || 9;
    return {
      outs: t.outs,
      ip: ip,
      ipDisplay: formatIP(t.outs),
      h: t.h, r: t.r, er: t.er, bb: t.bb, so: t.so, hbp: t.hbp, hr: t.hr,
      pitches: t.pitches, strikes: t.strikes,
      era: div(t.er, ip) == null ? null : (t.er / ip) * perGame,
      whip: div(t.bb + t.h, ip),
      k9: div(t.so, ip) == null ? null : (t.so / ip) * perGame,
      bb9: div(t.bb, ip) == null ? null : (t.bb / ip) * perGame,
      kbb: div(t.so, t.bb),
      strikePct: div(t.strikes, t.pitches),
      fpsPct: div(t.firstPitchStrikes, t.firstPitchPA),
      kPctBf: t.bf ? div(t.so, t.bf) : null,
      bbPctBf: t.bf ? div(t.bb, t.bf) : null,
      pitchesPerInning: div(t.pitches, ip)
    };
  }

  function pitchingFromApps(apps, ipg) { return derivePitching(sumPitching(apps), ipg); }

  // ---------------------------------------------------------------------------
  // Fielding — reliability (NOT a ranking). Label accordingly in UI.
  // ---------------------------------------------------------------------------
  function sumFielding(lines) {
    const t = { po: 0, a: 0, e: 0 };
    (lines || []).forEach(function (l) {
      t.po += Number(l.po) || 0; t.a += Number(l.a) || 0; t.e += Number(l.e) || 0;
    });
    return t;
  }

  function deriveFielding(t) {
    const chances = t.po + t.a + t.e;
    return {
      po: t.po, a: t.a, e: t.e, chances: chances,
      fieldingPct: div(t.po + t.a, chances) // reliability, not ranking
    };
  }

  function fieldingFromLines(lines) { return deriveFielding(sumFielding(lines)); }

  // ---------------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------------
  // Outs -> baseball IP display (e.g. 7 outs -> "2.1").
  function formatIP(outs) {
    const o = Math.max(0, Math.round(Number(outs) || 0));
    return Math.floor(o / 3) + '.' + (o % 3);
  }

  // Rate to 3-decimal, no leading zero (".321"). null -> "—".
  function fmtRate(v) {
    if (v == null || Number.isNaN(v)) return '—';
    const s = v.toFixed(3);
    return v < 1 && v >= 0 ? s.replace(/^0/, '') : s;
  }

  function fmtPct(v, digits) {
    if (v == null || Number.isNaN(v)) return '—';
    return (v * 100).toFixed(digits == null ? 1 : digits) + '%';
  }

  function fmt2(v) { return (v == null || Number.isNaN(v)) ? '—' : v.toFixed(2); }
  function fmt1(v) { return (v == null || Number.isNaN(v)) ? '—' : v.toFixed(1); }

  window.CT.stats = {
    div: div,
    sumBatting: sumBatting,
    deriveBatting: deriveBatting,
    battingFromLines: battingFromLines,
    sumPitching: sumPitching,
    derivePitching: derivePitching,
    pitchingFromApps: pitchingFromApps,
    sumFielding: sumFielding,
    deriveFielding: deriveFielding,
    fieldingFromLines: fieldingFromLines,
    formatIP: formatIP,
    fmtRate: fmtRate,
    fmtPct: fmtPct,
    fmt2: fmt2,
    fmt1: fmt1
  };
})();

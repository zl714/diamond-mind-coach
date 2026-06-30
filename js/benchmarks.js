/* benchmarks.js — age-band percentile reference table (REAL sourced data).
   These percentiles are compiled from PUBLISHED youth-baseball datasets:
   Perfect Game showcase data (infield/outfield velocity, 60-yard, pop time),
   TopVelocity per-age pitching medians, the Blast Motion bat-speed database,
   HitTrax / Bat Digest exit-velocity tables, and NSCA pro-agility percentiles,
   with Driveline aging-curve context. Showcase-sourced bands skew ABOVE the
   general-population youth average, so treat youth numbers as TREND vs. self,
   not pass/fail. Confidence is HIGH for pitching velocity and 11-14U
   hitting/agility; 9-10U infield/outfield velo and some 15-18U showcase bands
   are interpolated. Exposed on window.CT.benchmarks.

   Each row: { ageBand, metricKey, unit, p10, p25, p50, p75, p90, source }.
   For lower-better metrics (60-yd, pop time, agility) a LOWER value = better, so
   p10 is the SLOWEST and p90 the FASTEST (percentile of athletic quality). */
(function () {
  'use strict';

  const CT = window.CT;
  const SRC = 'Compiled from Perfect Game showcase data (IF/OF velo, 60-yard, pop time), TopVelocity per-age pitching medians, Blast Motion bat speed, HitTrax/Bat Digest exit velo, and NSCA pro-agility percentiles, with Driveline aging-curve context; showcase bands skew above general-population youth.';

  // Helper to build a row tersely.
  function row(ageBand, metricKey, unit, p10, p25, p50, p75, p90) {
    return { ageBand: ageBand, metricKey: metricKey, unit: unit, p10: p10, p25: p25, p50: p50, p75: p75, p90: p90, source: SRC };
  }

  // Real age-band benchmarks (p50 = median). higher-better metrics first.
  const TABLE = [
    // Exit velocity, max off tee (mph)
    row('9-10U', 'exitVeloMax', 'mph', 40, 44, 48, 53, 59),
    row('11-12U', 'exitVeloMax', 'mph', 48, 52, 56, 62, 69),
    row('13-14U', 'exitVeloMax', 'mph', 56, 60, 64, 71, 79),
    row('15-16U', 'exitVeloMax', 'mph', 64, 69, 73, 81, 89),
    row('17-18U', 'exitVeloMax', 'mph', 70, 75, 79, 87, 95),
    // Bat / swing speed (mph, Blast Motion)
    row('9-10U', 'batSpeed', 'mph', 33, 37, 41, 46, 51),
    row('11-12U', 'batSpeed', 'mph', 40, 44, 48, 53, 57),
    row('13-14U', 'batSpeed', 'mph', 46, 50, 54, 59, 63),
    row('15-16U', 'batSpeed', 'mph', 53, 56, 60, 64, 67),
    row('17-18U', 'batSpeed', 'mph', 57, 61, 65, 69, 72),
    // Fastball / mound velocity (mph)
    row('9-10U', 'fastballVelo', 'mph', 38, 41, 45, 49, 53),
    row('11-12U', 'fastballVelo', 'mph', 45, 49, 54, 60, 64),
    row('13-14U', 'fastballVelo', 'mph', 54, 58, 63, 70, 75),
    row('15-16U', 'fastballVelo', 'mph', 64, 68, 72, 78, 83),
    row('17-18U', 'fastballVelo', 'mph', 72, 76, 80, 85, 89),
    // Infield throwing velocity (mph)
    row('9-10U', 'infieldVelo', 'mph', 42, 46, 50, 55, 60),
    row('11-12U', 'infieldVelo', 'mph', 50, 55, 60, 66, 70),
    row('13-14U', 'infieldVelo', 'mph', 60, 65, 70, 76, 81),
    row('15-16U', 'infieldVelo', 'mph', 68, 72, 76, 82, 85),
    row('17-18U', 'infieldVelo', 'mph', 72, 76, 79, 85, 88),
    // Outfield throwing velocity (mph)
    row('9-10U', 'outfieldVelo', 'mph', 44, 48, 52, 58, 63),
    row('11-12U', 'outfieldVelo', 'mph', 52, 57, 62, 68, 73),
    row('13-14U', 'outfieldVelo', 'mph', 62, 67, 72, 79, 84),
    row('15-16U', 'outfieldVelo', 'mph', 70, 74, 78, 84, 88),
    row('17-18U', 'outfieldVelo', 'mph', 75, 79, 83, 88, 91),
    // lower-better: 60-yard dash (sec) — p10 slowest, p90 fastest
    row('9-10U', 'sixtyYard', 'sec', 10.4, 9.6, 9.0, 8.5, 8.0),
    row('11-12U', 'sixtyYard', 'sec', 9.4, 8.8, 8.3, 7.8, 7.4),
    row('13-14U', 'sixtyYard', 'sec', 8.7, 8.1, 7.6, 7.3, 6.9),
    row('15-16U', 'sixtyYard', 'sec', 8.1, 7.6, 7.2, 6.8, 6.5),
    row('17-18U', 'sixtyYard', 'sec', 7.9, 7.4, 7.0, 6.6, 6.3),
    // lower-better: pro-agility 5-10-5 (sec)
    row('9-10U', 'proAgility', 'sec', 6.6, 6.25, 5.85, 5.45, 5.2),
    row('11-12U', 'proAgility', 'sec', 6.0, 5.88, 5.45, 5.02, 4.9),
    row('13-14U', 'proAgility', 'sec', 5.78, 5.65, 5.25, 4.85, 4.73),
    row('15-16U', 'proAgility', 'sec', 5.55, 5.42, 5.05, 4.68, 4.55),
    row('17-18U', 'proAgility', 'sec', 5.4, 5.25, 4.9, 4.58, 4.45),
    // lower-better: catcher pop time to 2B (sec) — only meaningful 13U+
    row('13-14U', 'popTime', 'sec', 2.80, 2.60, 2.45, 2.30, 2.15),
    row('15-16U', 'popTime', 'sec', 2.55, 2.38, 2.25, 2.12, 2.00),
    row('17-18U', 'popTime', 'sec', 2.45, 2.28, 2.15, 2.05, 1.95)
  ];

  // Index by `ageBand|metricKey` for fast lookup.
  const INDEX = {};
  TABLE.forEach(function (r) { INDEX[r.ageBand + '|' + r.metricKey] = r; });

  function get(ageBand, metricKey) { return INDEX[ageBand + '|' + metricKey] || null; }

  // Estimate percentile (0–100) of `value` within an age band for a metric.
  // Handles lower-better metrics by inverting. Returns null if no row.
  function percentileFor(ageBand, metricKey, value) {
    const r = get(ageBand, metricKey);
    if (!r || value == null || !Number.isFinite(Number(value))) return null;
    const m = CT.model && CT.model.metric ? CT.model.metric(metricKey) : null;
    const lowerBetter = m && m.lowerBetter;
    const pts = [
      { p: 10, v: r.p10 }, { p: 25, v: r.p25 }, { p: 50, v: r.p50 },
      { p: 75, v: r.p75 }, { p: 90, v: r.p90 }
    ];
    const v = Number(value);
    // For higher-better, ascending v maps to ascending p. For lower-better the
    // table is already authored so p10..p90 goes slow..fast, so logic is uniform:
    // find where v sits relative to the (already quality-ordered) breakpoints.
    function qualityValue(x) { return lowerBetter ? -x : x; }
    const qv = qualityValue(v);
    const qpts = pts.map(function (pt) { return { p: pt.p, v: qualityValue(pt.v) }; });
    if (qv <= qpts[0].v) return 10;
    if (qv >= qpts[qpts.length - 1].v) return 90;
    for (let i = 0; i < qpts.length - 1; i++) {
      const a = qpts[i], b = qpts[i + 1];
      if (qv >= a.v && qv <= b.v) {
        const frac = (b.v - a.v) ? (qv - a.v) / (b.v - a.v) : 0;
        return Math.round(a.p + frac * (b.p - a.p));
      }
    }
    return 50;
  }

  function allRows() { return TABLE.slice(); }
  function bandsFor(metricKey) {
    return TABLE.filter(function (r) { return r.metricKey === metricKey; });
  }

  window.CT.benchmarks = {
    SOURCE_NOTE: SRC,
    table: allRows,
    get: get,
    percentileFor: percentileFor,
    bandsFor: bandsFor
  };
})();

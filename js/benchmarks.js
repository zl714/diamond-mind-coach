/* benchmarks.js — SEEDED age-band percentile reference table.
   HONEST DISCLAIMER: these percentiles are ILLUSTRATIVE composites assembled from
   publicly-discussed youth showcase/assessment ranges (PBR, Perfect Game age-curve
   commentary, USA Baseball LTAD norms). They are starting reference points for
   coaching context, NOT validated population statistics. Treat youth numbers as
   TREND vs. self, not pass/fail. Exposed on window.CT.benchmarks.

   Each row: { ageBand, metricKey, unit, p10, p25, p50, p75, p90, source }.
   For lower-better metrics (60-yd, pop time, agility) a LOWER value = better, so
   p10 is the SLOWEST and p90 the FASTEST (percentile of athletic quality). */
(function () {
  'use strict';

  const CT = window.CT;
  const SRC = 'Illustrative composite (public youth showcase ranges) — not validated norms';

  // Helper to build a row tersely.
  function row(ageBand, metricKey, unit, p10, p25, p50, p75, p90) {
    return { ageBand: ageBand, metricKey: metricKey, unit: unit, p10: p10, p25: p25, p50: p50, p75: p75, p90: p90, source: SRC };
  }

  // higher-better metrics
  const TABLE = [
    // Exit Velo max (mph)
    row('9-10U', 'exitVeloMax', 'mph', 38, 44, 50, 56, 62),
    row('11-12U', 'exitVeloMax', 'mph', 48, 54, 61, 68, 74),
    row('13-14U', 'exitVeloMax', 'mph', 58, 65, 72, 80, 87),
    row('15-16U', 'exitVeloMax', 'mph', 70, 78, 85, 92, 98),
    row('17-18U', 'exitVeloMax', 'mph', 78, 85, 92, 98, 104),
    // Bat speed (mph)
    row('9-10U', 'batSpeed', 'mph', 32, 36, 41, 45, 49),
    row('11-12U', 'batSpeed', 'mph', 38, 43, 48, 53, 57),
    row('13-14U', 'batSpeed', 'mph', 46, 51, 57, 62, 66),
    row('15-16U', 'batSpeed', 'mph', 56, 61, 66, 70, 74),
    row('17-18U', 'batSpeed', 'mph', 62, 66, 70, 74, 78),
    // Fastball / mound velo (mph)
    row('9-10U', 'fastballVelo', 'mph', 38, 42, 47, 52, 56),
    row('11-12U', 'fastballVelo', 'mph', 46, 50, 55, 60, 64),
    row('13-14U', 'fastballVelo', 'mph', 54, 59, 65, 71, 76),
    row('15-16U', 'fastballVelo', 'mph', 66, 71, 76, 81, 85),
    row('17-18U', 'fastballVelo', 'mph', 72, 77, 82, 86, 90),
    // Infield velo (mph)
    row('9-10U', 'infieldVelo', 'mph', 40, 44, 49, 54, 58),
    row('11-12U', 'infieldVelo', 'mph', 48, 52, 58, 63, 67),
    row('13-14U', 'infieldVelo', 'mph', 56, 61, 68, 74, 79),
    row('15-16U', 'infieldVelo', 'mph', 68, 73, 79, 84, 88),
    row('17-18U', 'infieldVelo', 'mph', 74, 79, 84, 88, 92),
    // Outfield velo (mph)
    row('9-10U', 'outfieldVelo', 'mph', 42, 46, 51, 56, 61),
    row('11-12U', 'outfieldVelo', 'mph', 50, 55, 61, 67, 72),
    row('13-14U', 'outfieldVelo', 'mph', 60, 66, 73, 80, 85),
    row('15-16U', 'outfieldVelo', 'mph', 72, 78, 84, 89, 93),
    row('17-18U', 'outfieldVelo', 'mph', 78, 83, 88, 92, 96),
    // lower-better: 60-yard dash (sec) — p10 slow, p90 fast
    row('9-10U', 'sixtyYard', 'sec', 9.8, 9.3, 8.8, 8.3, 7.9),
    row('11-12U', 'sixtyYard', 'sec', 9.2, 8.7, 8.2, 7.8, 7.4),
    row('13-14U', 'sixtyYard', 'sec', 8.6, 8.1, 7.7, 7.3, 7.0),
    row('15-16U', 'sixtyYard', 'sec', 8.0, 7.6, 7.2, 6.9, 6.7),
    row('17-18U', 'sixtyYard', 'sec', 7.7, 7.3, 7.0, 6.8, 6.6),
    // lower-better: pro-agility 5-10-5 (sec)
    row('9-10U', 'proAgility', 'sec', 6.2, 5.9, 5.6, 5.3, 5.1),
    row('11-12U', 'proAgility', 'sec', 5.8, 5.5, 5.2, 5.0, 4.8),
    row('13-14U', 'proAgility', 'sec', 5.4, 5.1, 4.9, 4.7, 4.5),
    row('15-16U', 'proAgility', 'sec', 5.0, 4.8, 4.6, 4.4, 4.3),
    row('17-18U', 'proAgility', 'sec', 4.8, 4.6, 4.4, 4.3, 4.2),
    // lower-better: catcher pop time (sec) — only meaningful 13U+
    row('13-14U', 'popTime', 'sec', 2.45, 2.35, 2.25, 2.15, 2.05),
    row('15-16U', 'popTime', 'sec', 2.30, 2.20, 2.10, 2.02, 1.95),
    row('17-18U', 'popTime', 'sec', 2.20, 2.12, 2.05, 1.98, 1.92)
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

/* charts.js — themed Chart.js 4 helpers so every view draws consistent charts.
   Tracks created charts so they can be destroyed on view change (avoids leaks /
   ghost canvases). Degrades gracefully if the CDN is unavailable (offline).
   Exposed on window.CT.charts. */
(function () {
  'use strict';

  const CT = window.CT;

  // Themed from the LeCroy Design System tokens (Diamond Mind cyan accent +
  // seam-red secondary, separate semantic up/down axis, Savant diverging scale).
  const THEME = {
    accent: '#00AEEF',                  // brand cyan (primary series)
    accentFill: 'rgba(0,174,239,0.16)',
    seam: '#EF4444',                    // secondary data accent (coral/red seam)
    seam2: '#FB7185',
    text: '#E2E8F0',
    tick: '#94A3B8',
    grid: 'rgba(255,255,255,0.06)',
    panel: '#0F172A',
    border: 'rgba(255,255,255,0.08)',
    up: '#16C784',                      // positive axis
    down: '#F23645',                    // negative axis
    danger: '#F23645',
    warn: '#FBBF24',
    // Baseball-Savant diverging percentile scale (cold -> mid -> hot)
    pctCold: '#5181B8',
    pctMid: '#C9CDD4',
    pctHot: '#D22D49'
  };

  // Interpolate the Savant scale for a 0..100 percentile (cold -> mid -> hot).
  function savantColor(pct) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
    function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
    function mix(a, b, t) { return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }).join(',') + ')'; }
    const cold = hex(THEME.pctCold), mid = hex(THEME.pctMid), hot = hex(THEME.pctHot);
    return p < 0.5 ? mix(cold, mid, p / 0.5) : mix(mid, hot, (p - 0.5) / 0.5);
  }

  // Robinhood-style: color a trend by its net direction over the window.
  function directionColor(net) { return Number(net) < 0 ? THEME.down : THEME.up; }

  // Registry of live charts so we can destroy them all on navigation.
  const live = [];
  function track(chart) { if (chart) live.push(chart); return chart; }
  function destroyAll() { while (live.length) { try { live.pop().destroy(); } catch (e) {} } }

  function hasChart() { return typeof window.Chart !== 'undefined'; }

  // Render a graceful note when Chart.js failed to load.
  function offlineNote(canvas, msg) {
    if (!canvas) return;
    const note = document.createElement('p');
    note.className = 'help';
    note.textContent = msg || 'Chart library unavailable (offline).';
    if (canvas.parentNode) canvas.parentNode.appendChild(note);
  }

  // Base options merged into every chart for the dark-green theme.
  function baseOptions(extra) {
    const o = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: THEME.text } },
        tooltip: { backgroundColor: THEME.panel, borderColor: THEME.border, borderWidth: 1 }
      },
      scales: {
        x: { ticks: { color: THEME.tick }, grid: { color: THEME.grid } },
        y: { ticks: { color: THEME.tick }, grid: { color: THEME.grid } }
      }
    };
    return deepMerge(o, extra || {});
  }

  function deepMerge(a, b) {
    const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    Object.keys(b || {}).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') {
        out[k] = deepMerge(a[k], b[k]);
      } else { out[k] = b[k]; }
    });
    return out;
  }

  // Generic factory: make(canvas, config) merges theme defaults into options.
  function make(canvas, config) {
    if (!hasChart()) { offlineNote(canvas); return null; }
    const cfg = Object.assign({}, config);
    cfg.options = baseOptions(config.options || {});
    return track(new window.Chart(canvas.getContext('2d'), cfg));
  }

  // line(canvas, { labels, datasets:[{label,data,color}], yTitle })
  function line(canvas, spec) {
    spec = spec || {};
    const datasets = (spec.datasets || []).map(function (d, i) {
      const color = d.color || THEME.accent;
      return {
        label: d.label || ('Series ' + (i + 1)),
        data: d.data || [],
        borderColor: color,
        backgroundColor: d.fill ? THEME.accentFill : color,
        pointBackgroundColor: color,
        pointRadius: 4, pointHoverRadius: 6, borderWidth: 2, tension: 0.25,
        fill: !!d.fill, spanGaps: true
      };
    });
    return make(canvas, {
      type: 'line',
      data: { labels: spec.labels || [], datasets: datasets },
      options: spec.options || {}
    });
  }

  // bar(canvas, { labels, data, label, colors })
  function bar(canvas, spec) {
    spec = spec || {};
    return make(canvas, {
      type: 'bar',
      data: { labels: spec.labels || [], datasets: [{
        label: spec.label || '', data: spec.data || [],
        backgroundColor: spec.colors || THEME.accentFill, borderColor: THEME.accent, borderWidth: 1
      }] },
      options: spec.options || {}
    });
  }

  // scatter(canvas, { points:[{x,y}], label, pointColors })
  function scatter(canvas, spec) {
    spec = spec || {};
    return make(canvas, {
      type: 'scatter',
      data: { datasets: [{
        label: spec.label || '', data: spec.points || [],
        backgroundColor: spec.pointColors || THEME.accent, pointRadius: 5
      }] },
      options: spec.options || {}
    });
  }

  window.CT.charts = {
    THEME: THEME,
    hasChart: hasChart,
    make: make,
    line: line,
    bar: bar,
    scatter: scatter,
    track: track,
    destroyAll: destroyAll,
    savantColor: savantColor,
    directionColor: directionColor,
    // legacy alias used by old router code paths
    destroyChart: destroyAll
  };
})();

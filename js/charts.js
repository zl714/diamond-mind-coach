/* charts.js — themed Chart.js 4 helpers so every view draws consistent charts.
   Tracks created charts so they can be destroyed on view change (avoids leaks /
   ghost canvases). Degrades gracefully if the CDN is unavailable (offline).
   Exposed on window.CT.charts. */
(function () {
  'use strict';

  const CT = window.CT;

  const THEME = {
    accent: '#7FFF00',
    accentFill: 'rgba(127,255,0,0.15)',
    text: '#e8f5e9',
    tick: '#90c890',
    grid: 'rgba(127,255,0,0.08)',
    panel: '#162d1a',
    border: 'rgba(127,255,0,0.4)',
    danger: '#ff6b6b',
    warn: '#ffcd50'
  };

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
    // legacy alias used by old router code paths
    destroyChart: destroyAll
  };
})();

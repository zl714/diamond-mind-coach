/* charts.js — progress chart for a chosen metric over time (Chart.js). */
(function () {
  'use strict';

  const CT = window.CT;
  let activeChart = null;

  // Which metrics does this player actually have data for?
  function availableMetrics(player) {
    return CT.METRICS.filter(function (m) {
      return player.sessions.some(function (s) {
        return s.metrics && (s.metrics[m.key] === 0 || s.metrics[m.key]);
      });
    });
  }

  // Build {labels, values} for a metric, sorted by date, only sessions that recorded it.
  function seriesFor(player, metricKey) {
    const points = player.sessions
      .filter(function (s) { return s.metrics && (s.metrics[metricKey] === 0 || s.metrics[metricKey]); })
      .slice()
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .map(function (s) { return { date: s.date, value: s.metrics[metricKey] }; });
    return points;
  }

  function destroyChart() {
    if (activeChart) { activeChart.destroy(); activeChart = null; }
  }

  function renderChart(canvas, player, metricKey) {
    destroyChart();
    if (typeof window.Chart === 'undefined') {
      // CDN failed (offline). Show a graceful message instead of a broken canvas.
      const note = document.createElement('p');
      note.className = 'help';
      note.textContent = 'Chart library unavailable (offline). Session data is still listed below.';
      canvas.parentNode.appendChild(note);
      return;
    }

    const meta = CT.METRIC_BY_KEY[metricKey];
    const points = seriesFor(player, metricKey);
    const labels = points.map(function (p) { return CT.formatDate(p.date); });
    const values = points.map(function (p) { return p.value; });

    activeChart = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: meta.label + ' (' + meta.unit + ')',
          data: values,
          borderColor: '#7FFF00',
          backgroundColor: 'rgba(127,255,0,0.15)',
          pointBackgroundColor: '#7FFF00',
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2,
          tension: 0.25,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#e8f5e9' } },
          tooltip: { backgroundColor: '#162d1a', borderColor: 'rgba(127,255,0,0.4)', borderWidth: 1 }
        },
        scales: {
          x: { ticks: { color: '#90c890' }, grid: { color: 'rgba(127,255,0,0.08)' } },
          y: { ticks: { color: '#90c890' }, grid: { color: 'rgba(127,255,0,0.08)' } }
        }
      }
    });
  }

  window.CT.charts = {
    availableMetrics: availableMetrics,
    renderChart: renderChart,
    destroyChart: destroyChart
  };
})();

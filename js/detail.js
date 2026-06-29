/* detail.js — player detail view: header, progress chart, session timeline. */
(function () {
  'use strict';

  const CT = window.CT;

  function metricChip(metricKey, value) {
    const meta = CT.METRIC_BY_KEY[metricKey];
    if (!meta) return '';
    return '<div class="metric-chip"><span class="mv">' + CT.escapeHtml(value) +
      '</span> ' + CT.escapeHtml(meta.unit) +
      '<span class="ml">' + CT.escapeHtml(meta.label) + '</span></div>';
  }

  function sessionCardHtml(session) {
    const metricsHtml = Object.keys(session.metrics || {})
      .map(function (k) { return metricChip(k, session.metrics[k]); })
      .join('');
    return '' +
      '<div class="session-card" data-session="' + session.id + '">' +
        '<div class="session-head">' +
          '<div>' +
            '<span class="session-date">' + CT.escapeHtml(CT.formatDate(session.date)) + '</span> ' +
            '<span class="pill">' + CT.escapeHtml(session.focus) + '</span>' +
          '</div>' +
          '<div class="session-actions">' +
            '<button class="btn btn-sm btn-ghost" data-edit="' + session.id + '">Edit</button>' +
            '<button class="btn btn-sm btn-danger" data-del="' + session.id + '">Delete</button>' +
          '</div>' +
        '</div>' +
        (session.drills ? '<p class="session-notes"><strong>Drills:</strong> ' + CT.escapeHtml(session.drills) + '</p>' : '') +
        (metricsHtml ? '<div class="session-metrics">' + metricsHtml + '</div>' : '') +
        (session.notes ? '<p class="session-notes">' + CT.escapeHtml(session.notes) + '</p>' : '') +
      '</div>';
  }

  function render(viewEl, navigate, playerId) {
    const player = CT.store.getPlayer(playerId);
    if (!player) {
      viewEl.innerHTML = '<a class="back-link" href="#/">&larr; Back</a>' +
        '<div class="empty"><p>Player not found.</p></div>';
      return;
    }

    const metricsAvail = CT.charts.availableMetrics(player);
    const sessions = player.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    const sub = [player.position, player.level].filter(Boolean).join(' · ');

    const metricSelectHtml = metricsAvail.length
      ? '<select class="select" id="metric-select" style="max-width:220px">' +
          metricsAvail.map(function (m) {
            return '<option value="' + m.key + '">' + CT.escapeHtml(m.label) + '</option>';
          }).join('') +
        '</select>'
      : '';

    const chartSection = metricsAvail.length
      ? '<div class="card" style="margin-bottom:1.25rem">' +
          '<div class="chart-controls">' +
            '<h3 style="margin:0">Progress</h3>' +
            '<div class="spacer"></div>' + metricSelectHtml +
          '</div>' +
          '<div class="chart-wrap"><canvas id="progress-chart"></canvas></div>' +
        '</div>'
      : '<div class="card" style="margin-bottom:1.25rem"><p class="help" style="margin:0">' +
          'Log a session with a numeric metric (skill rating, exit velo, etc.) to see a progress chart here.</p></div>';

    const timelineHtml = sessions.length
      ? '<div class="timeline">' + sessions.map(sessionCardHtml).join('') + '</div>'
      : '<div class="empty"><p>No sessions logged yet.</p>' +
        '<button class="btn btn-primary" data-act="log">Log first session</button></div>';

    viewEl.innerHTML = '' +
      '<a class="back-link" href="#/">&larr; All clients</a>' +
      '<div class="page-head">' +
        '<div>' +
          '<h1>' + CT.escapeHtml(player.name) + '</h1>' +
          (sub ? '<p class="subtitle">' + CT.escapeHtml(sub) + '</p>' : '') +
          (player.notes ? '<p class="subtitle">' + CT.escapeHtml(player.notes) + '</p>' : '') +
        '</div>' +
        '<div class="row">' +
          '<button class="btn btn-sm" data-act="edit-player">Edit</button>' +
          '<button class="btn btn-sm btn-danger" data-act="del-player">Delete</button>' +
        '</div>' +
      '</div>' +
      '<button class="btn btn-primary btn-block" data-act="log" style="margin-bottom:1.25rem">+ Log session</button>' +
      chartSection +
      '<h2>Session history <span class="muted" style="font-weight:400">(' + sessions.length + ')</span></h2>' +
      timelineHtml;

    // ---- chart ----
    if (metricsAvail.length) {
      const canvas = viewEl.querySelector('#progress-chart');
      const select = viewEl.querySelector('#metric-select');
      CT.charts.renderChart(canvas, player, metricsAvail[0].key);
      select.addEventListener('change', function () {
        CT.charts.renderChart(canvas, player, select.value);
      });
    }

    function rerender() { render(viewEl, navigate, playerId); }

    // ---- events ----
    viewEl.querySelectorAll('[data-act="log"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        CT.sessions.openSessionForm(playerId, null, rerender);
      });
    });
    viewEl.querySelector('[data-act="edit-player"]') &&
      viewEl.querySelector('[data-act="edit-player"]').addEventListener('click', function () {
        CT.players.openPlayerForm(player, rerender);
      });
    viewEl.querySelector('[data-act="del-player"]') &&
      viewEl.querySelector('[data-act="del-player"]').addEventListener('click', function () {
        CT.players.confirmDeletePlayer(player, function () { navigate('#/'); });
      });

    viewEl.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const sid = btn.getAttribute('data-edit');
        const session = player.sessions.find(function (s) { return s.id === sid; });
        CT.sessions.openSessionForm(playerId, session, rerender);
      });
    });
    viewEl.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const sid = btn.getAttribute('data-del');
        const session = player.sessions.find(function (s) { return s.id === sid; });
        CT.sessions.confirmDeleteSession(playerId, session, rerender);
      });
    });
  }

  window.CT.detail = { render: render };
})();

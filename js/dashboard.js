/* dashboard.js — home view: stats + player list + data controls. */
(function () {
  'use strict';

  const CT = window.CT;

  function playerCardHtml(player) {
    const last = CT.store.lastSessionDate(player);
    const sub = [player.position, player.level].filter(Boolean).join(' · ') || 'No details yet';
    const activity = last ? 'Last: ' + CT.relativeDate(last) : 'No sessions yet';
    return '' +
      '<div class="card clickable player-card" data-player="' + player.id + '" role="button" tabindex="0">' +
        '<div class="avatar">' + CT.escapeHtml(CT.initials(player.name)) + '</div>' +
        '<div class="meta">' +
          '<div class="name">' + CT.escapeHtml(player.name) + '</div>' +
          '<div class="sub">' + CT.escapeHtml(sub) + '</div>' +
          '<div class="sub">' + CT.escapeHtml(activity) + '</div>' +
        '</div>' +
        '<div class="count">' + player.sessions.length + '<br><span class="muted" style="font-weight:400;font-size:0.7rem">sessions</span></div>' +
      '</div>';
  }

  function render(viewEl, navigate) {
    const players = CT.store.getPlayers()
      .slice()
      .sort(function (a, b) {
        const la = CT.store.lastSessionDate(a) || '';
        const lb = CT.store.lastSessionDate(b) || '';
        return la < lb ? 1 : la > lb ? -1 : 0; // most recent activity first
      });
    const totalSessions = CT.store.totalSessions();
    const recent = CT.store.mostRecentActivity();

    const statsHtml = '' +
      '<div class="stats">' +
        '<div class="stat"><div class="num">' + players.length + '</div><div class="label">Clients</div></div>' +
        '<div class="stat"><div class="num">' + totalSessions + '</div><div class="label">Sessions</div></div>' +
        '<div class="stat"><div class="num">' + (recent ? CT.relativeDate(recent) : '—') + '</div><div class="label">Last activity</div></div>' +
      '</div>';

    const listHtml = players.length
      ? '<div class="grid grid-players">' + players.map(playerCardHtml).join('') + '</div>'
      : '<div class="empty"><div class="big">&#9918;</div><p>No players yet.</p>' +
        '<button class="btn btn-primary" data-act="add">Add your first player</button></div>';

    viewEl.innerHTML = '' +
      '<div class="page-head">' +
        '<div>' +
          '<h1>My coaching clients</h1>' +
          '<p class="subtitle">Track sessions and progress for every player.</p>' +
        '</div>' +
        '<button class="btn btn-primary" data-act="add">+ Add player</button>' +
      '</div>' +
      statsHtml +
      listHtml +
      '<div class="row" style="margin-top:1.5rem">' +
        '<button class="btn btn-sm" data-act="export">Export JSON</button>' +
        '<button class="btn btn-sm" data-act="import">Import JSON</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="reset">Reset demo data</button>' +
      '</div>';

    // ---- wire events ----
    viewEl.querySelectorAll('[data-act="add"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        CT.players.openPlayerForm(null, function () { render(viewEl, navigate); });
      });
    });

    viewEl.querySelectorAll('[data-player]').forEach(function (card) {
      const id = card.getAttribute('data-player');
      card.addEventListener('click', function () { navigate('#/player/' + id); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('#/player/' + id); }
      });
    });

    const exportBtn = viewEl.querySelector('[data-act="export"]');
    if (exportBtn) exportBtn.addEventListener('click', CT.io.exportJSON);

    const importBtn = viewEl.querySelector('[data-act="import"]');
    if (importBtn) importBtn.addEventListener('click', function () {
      CT.io.importJSON(function () { render(viewEl, navigate); CT.app.refreshBadge(); });
    });

    const resetBtn = viewEl.querySelector('[data-act="reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      CT.ui.confirmDialog('Reset demo data?',
        'This replaces ALL current data with the original 3 sample players. Export first if you want to keep your data.',
        'Reset',
        function () {
          CT.store.resetToSample();
          CT.ui.toast('Demo data restored');
          render(viewEl, navigate);
          CT.app.refreshBadge();
        });
    });
  }

  window.CT.dashboard = { render: render };
})();

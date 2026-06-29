/* app.js — bootstrap + tiny hash router. Keep last so all modules are loaded. */
(function () {
  'use strict';

  const CT = window.CT;
  const viewEl = document.getElementById('view');

  function navigate(hash) {
    if (location.hash === hash) { route(); }
    else { location.hash = hash; }
    window.scrollTo(0, 0);
  }

  function refreshBadge() {
    const badge = document.getElementById('demo-badge');
    if (!badge) return;
    badge.hidden = !CT.store.isUsingSample();
  }

  function route() {
    CT.charts.destroyChart();
    const hash = location.hash || '#/';
    const playerMatch = hash.match(/^#\/player\/(.+)$/);

    if (playerMatch) {
      CT.detail.render(viewEl, navigate, playerMatch[1]);
    } else {
      CT.dashboard.render(viewEl, navigate);
    }
    refreshBadge();
  }

  function init() {
    CT.store.load();          // hydrate from localStorage or seed sample data
    refreshBadge();
    window.addEventListener('hashchange', route);
    route();
  }

  window.CT.app = { navigate: navigate, refreshBadge: refreshBadge };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* app.js — application shell: view registry, nav/tab bar, and a tiny defensive
   hash router. Loads BEFORE the view files so they can call CT.registerView() at
   their own script-load time. Boots on DOMContentLoaded once every view has
   registered. Each view render is wrapped in try/catch so one broken view can
   never blank the whole app. Exposes CT.registerView and CT.router. */
(function () {
  'use strict';

  const CT = window.CT;

  // Ordered list of registered views: { id, label, render }.
  const views = [];
  const byId = {};
  let booted = false;

  // Lucide icon name per view id (sidebar nav + mobile tab bar). Unknown ids
  // fall back to a generic glyph so a newly-added view still renders an icon.
  const NAV_ICONS = {
    roster: 'users',
    drills: 'layers',
    lessons: 'clipboard-list',
    dashboard: 'layout-dashboard',
    assessment: 'gauge',
    games: 'list',
    season: 'trending-up',
    armsafety: 'shield',
    programs: 'dumbbell',
    alerts: 'bell'
  };
  function navIcon(id) { return NAV_ICONS[id] || 'circle'; }

  // Re-render any <i data-lucide> placeholders (nav, view content, empty states).
  function paintIcons() { try { if (window.lucide) window.lucide.createIcons(); } catch (e) {} }

  /**
   * registerView(id, { label, render(rootEl, ctx) })
   * Adds a nav tab and makes the view routable at #/<id> (and #/<id>/<param>).
   * `render` receives the #view-root element and a ctx { param, navigate }.
   */
  function registerView(id, def) {
    if (!id || !def || typeof def.render !== 'function') {
      console.warn('registerView: invalid registration for', id);
      return;
    }
    if (byId[id]) { // allow re-registration (hot reload); replace in place
      byId[id] = Object.assign({}, byId[id], def, { id: id });
      const i = views.findIndex(function (v) { return v.id === id; });
      if (i >= 0) views[i] = byId[id];
    } else {
      const v = { id: id, label: def.label || id, render: def.render };
      byId[id] = v;
      views.push(v);
    }
    if (booted) { buildNav(); }
  }

  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
    window.scrollTo(0, 0);
  }

  // Parse "#/id/param" -> { id, param }. Defaults to the first registered view.
  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    const id = parts[0] || (views[0] ? views[0].id : '');
    const param = parts.slice(1).join('/') || null;
    return { id: id, param: param };
  }

  function buildNav() {
    const nav = document.getElementById('view-tabs');
    if (!nav) return;
    const current = parseHash().id;
    nav.innerHTML = views.map(function (v) {
      const active = v.id === current ? ' active' : '';
      return '<a class="tab' + active + '" href="#/' + v.id + '" data-view="' + v.id + '">' +
        '<i data-lucide="' + navIcon(v.id) + '"></i>' +
        '<span>' + CT.escapeHtml(v.label) + '</span></a>';
    }).join('');
    paintIcons();
  }

  function refreshBadge() {
    const badge = document.getElementById('demo-badge');
    if (badge) badge.hidden = !CT.store.isUsingSample();
  }

  function route() {
    // Tear down any charts from the previous view to avoid canvas leaks.
    try { CT.charts.destroyAll(); } catch (e) {}
    const root = document.getElementById('view-root');
    if (!root) return;
    const parsed = parseHash();
    const view = byId[parsed.id] || views[0];

    buildNav();
    refreshBadge();

    if (!view) {
      root.innerHTML = CT.ui.emptyState('hammer', 'No views registered yet',
        'Foundation is up, but no feature views have loaded.');
      paintIcons();
      return;
    }

    // Defensive render: a thrown error in one view shows an inline error card
    // instead of a blank screen, and never breaks navigation to other views.
    try {
      root.innerHTML = '';
      view.render(root, { param: parsed.param, navigate: navigate });
    } catch (err) {
      console.error('View "' + view.id + '" failed to render:', err);
      root.innerHTML = CT.ui.card({
        rawTitle: true,
        title: '<i data-lucide="alert-triangle" style="vertical-align:-3px;"></i> &ldquo;' + CT.escapeHtml(view.label) + '&rdquo; could not load',
        body: '<p class="muted">This view hit an error but the rest of the app still works.</p>' +
              '<pre style="white-space:pre-wrap;color:var(--down);font-size:.8rem;">' +
              CT.escapeHtml(String(err && err.message ? err.message : err)) + '</pre>'
      });
    }
    // Paint any Lucide icons the view (or error card) emitted.
    paintIcons();
  }

  // Toolbar actions (export / import / reset demo) wired once at boot.
  function wireToolbar() {
    const ex = document.getElementById('btn-export');
    const im = document.getElementById('btn-import');
    const rs = document.getElementById('btn-reset');
    if (ex) ex.addEventListener('click', function () { CT.io.exportJSON(); });
    if (im) im.addEventListener('click', function () { CT.io.importJSON(function () { route(); }); });
    if (rs) rs.addEventListener('click', function () {
      CT.ui.confirmDialog('Reset demo data',
        'Replace ALL current data with the fictional demo dataset? This cannot be undone.',
        'Reset to demo', function () { CT.store.resetToSample(); CT.ui.toast('Demo data restored'); route(); });
    });
    // Mobile quick-log '+': jump to the session-logging view once it ships
    // (id 'lessons'), otherwise fall back to the roster.
    const ql = document.getElementById('quick-log');
    if (ql) ql.addEventListener('click', function () {
      navigate(byId.lessons ? '#/lessons' : '#/roster');
    });
  }

  function init() {
    CT.store.load();      // hydrate from localStorage or seed labeled demo data
    wireToolbar();
    buildNav();
    refreshBadge();
    booted = true;
    window.addEventListener('hashchange', route);
    if (!location.hash && views[0]) location.replace('#/' + views[0].id);
    route();
  }

  CT.registerView = registerView;
  CT.router = { navigate: navigate, route: route, parseHash: parseHash, views: function () { return views.slice(); } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

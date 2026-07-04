/* app.js — application shell: view registry, sidebar nav, header alerts bell, and
   a tiny defensive hash router. Loads BEFORE the view files so they can call
   CT.registerView() at their own script-load time. Boots on DOMContentLoaded once
   every view has registered. Each view render is wrapped in try/catch so one broken
   view can never blank the whole app.

   NAV MODEL (2026 declutter): five primary destinations in the sidebar —
   Dashboard, Players, Sessions, Games, Arm Safety. Secondary screens (the player
   profile, assessment entry, the full alerts page) register with { hidden:true } so
   they are routable but do NOT appear as nav items. "Alerts" is a bell + count badge
   in the header that opens a dropdown panel. Legacy hashes redirect to the new ones.
   Exposes CT.registerView, CT.router, CT.getViewRender. */
(function () {
  'use strict';

  const CT = window.CT;

  // Ordered list of registered views: { id, label, render, hidden }.
  const views = [];
  const byId = {};
  let booted = false;

  // Lucide icon name per view id (sidebar nav + mobile tab bar).
  const NAV_ICONS = {
    dashboard: 'layout-dashboard',
    players: 'users',
    sessions: 'clipboard-list',
    games: 'diamond',
    armsafety: 'shield',
    // secondary / hidden (kept for any stray icon paint)
    player: 'user-round',
    assessment: 'gauge',
    alerts: 'bell'
  };
  function navIcon(id) { return NAV_ICONS[id] || 'circle'; }

  // Re-render any <i data-lucide> placeholders (nav, view content, empty states).
  function paintIcons() { try { if (window.lucide) window.lucide.createIcons(); } catch (e) {} }

  /**
   * registerView(id, { label, render(rootEl, ctx), hidden })
   * Adds a routable view at #/<id> (and #/<id>/<param>). Views WITHOUT hidden:true
   * also get a sidebar nav tab. Nav order follows registration order.
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
      const v = { id: id, label: def.label || id, render: def.render, hidden: !!def.hidden };
      byId[id] = v;
      views.push(v);
    }
    if (booted) { buildNav(); }
  }

  // Views that actually appear in the sidebar/bottom-bar (registration order).
  function navViews() { return views.filter(function (v) { return !v.hidden; }); }

  function navigate(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
    window.scrollTo(0, 0);
  }

  // Parse "#/id/param" -> { id, param }. Defaults to the first NAV view.
  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    const first = navViews()[0] || views[0];
    const id = parts[0] || (first ? first.id : '');
    const param = parts.slice(1).join('/') || null;
    return { id: id, param: param };
  }

  // Map old hashes onto the consolidated nav. Returns a replacement hash or null.
  function legacyRedirect(parsed) {
    const id = parsed.id, param = parsed.param;
    switch (id) {
      case 'roster': return '#/players' + (param ? '/' + param : '');
      case 'drills': return '#/sessions/drills';
      case 'programs': return '#/sessions/programs';
      case 'season': return '#/games/season';
      case 'dashboard':
        // Old profile deep link (#/dashboard/<playerId>) -> new #/player/<id>.
        if (param && CT.store.getPlayer(param)) return '#/player/' + param;
        return null;
      default: return null;
    }
  }

  function buildNav() {
    const nav = document.getElementById('view-tabs');
    if (!nav) return;
    const current = parseHash().id;
    nav.innerHTML = navViews().map(function (v) {
      const active = v.id === current ? ' active' : '';
      return '<a class="tab' + active + '" href="#/' + v.id + '" data-view="' + v.id + '">' +
        '<i data-lucide="' + navIcon(v.id) + '"></i>' +
        '<span>' + CT.escapeHtml(v.label) + '</span></a>';
    }).join('');
    paintIcons();
  }

  function route() {
    const parsed = parseHash();
    const redirect = legacyRedirect(parsed);
    if (redirect) { location.replace(redirect); return; } // hashchange re-fires route()

    // Tear down any charts from the previous view to avoid canvas leaks.
    try { CT.charts.destroyAll(); } catch (e) {}
    const root = document.getElementById('view-root');
    if (!root) return;
    const view = byId[parsed.id] || navViews()[0] || views[0];

    buildNav();
    refreshAlertsBell();
    closeAlertsPanel();

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

  // Render a registered view's content into an arbitrary container (used by the
  // Sessions/Games wrappers to host their tabbed sub-views).
  function getViewRender(id) { return byId[id] ? byId[id].render : null; }

  // ---------------------------------------------------------------------------
  // Header alerts bell + dropdown panel
  // ---------------------------------------------------------------------------
  function currentAlerts() {
    try { return (CT.alerts && CT.alerts.build) ? CT.alerts.build() : []; }
    catch (e) { return []; }
  }

  function refreshAlertsBell() {
    const bell = document.getElementById('alerts-bell');
    const badge = document.getElementById('alerts-badge');
    if (!bell || !badge) return;
    const alerts = currentAlerts();
    const red = alerts.filter(function (a) { return a.severity === 'red'; }).length;
    const n = alerts.length;
    bell.classList.toggle('has-critical', red > 0);
    bell.classList.toggle('has-alerts', n > 0);
    if (n > 0) { badge.hidden = false; badge.textContent = n > 99 ? '99+' : String(n); }
    else { badge.hidden = true; }
  }

  function alertPanelRow(a) {
    const dot = a.severity === 'red' ? 'red' : 'yellow';
    return '<a class="al-panel-row" href="#/' + CT.escapeHtml(a.link) + '/' + CT.escapeHtml(a.playerId) + '">' +
      '<span class="al-panel-dot ' + dot + '"></span>' +
      '<span class="al-panel-txt">' +
        '<span class="al-panel-name">' + CT.escapeHtml(a.playerName) + '</span>' +
        '<span class="al-panel-issue">' + CT.escapeHtml(a.title) + '</span>' +
      '</span>' +
      '<i data-lucide="chevron-right"></i></a>';
  }

  function renderAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    if (!panel) return;
    const alerts = currentAlerts();
    const red = alerts.filter(function (a) { return a.severity === 'red'; }).length;
    let head = alerts.length
      ? '<span class="al-panel-count">' + alerts.length + ' active · ' + red + ' critical</span>'
      : '<span class="al-panel-count">All clear</span>';
    let body;
    if (!alerts.length) {
      body = '<div class="al-panel-empty"><i data-lucide="shield-check"></i>' +
        '<p>No pain, Pitch Smart, workload, or adherence flags right now.</p></div>';
    } else {
      body = '<div class="al-panel-list">' + alerts.slice(0, 6).map(alertPanelRow).join('') + '</div>';
    }
    panel.innerHTML =
      '<div class="al-panel-head"><span class="al-panel-title">Alerts</span>' + head + '</div>' +
      body +
      '<a class="al-panel-all" href="#/alerts"><i data-lucide="list"></i>View all alerts</a>';
    paintIcons();
  }

  function openAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    const bell = document.getElementById('alerts-bell');
    if (!panel || !bell) return;
    renderAlertsPanel();
    panel.hidden = false;
    bell.setAttribute('aria-expanded', 'true');
  }
  function closeAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    const bell = document.getElementById('alerts-bell');
    if (panel) panel.hidden = true;
    if (bell) bell.setAttribute('aria-expanded', 'false');
  }
  function toggleAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    if (panel && panel.hidden) openAlertsPanel(); else closeAlertsPanel();
  }

  function wireAlertsBell() {
    const bell = document.getElementById('alerts-bell');
    const panel = document.getElementById('alerts-panel');
    if (!bell || !panel) return;
    bell.addEventListener('click', function (e) { e.stopPropagation(); toggleAlertsPanel(); });
    // Follow a deep link inside the panel, then close it.
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeAlertsPanel();
    });
    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (!panel.contains(e.target) && !bell.contains(e.target)) closeAlertsPanel();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAlertsPanel(); });
    refreshAlertsBell();
  }

  // Toolbar actions (export / import / start fresh) wired once at boot.
  function wireToolbar() {
    const ex = document.getElementById('btn-export');
    const im = document.getElementById('btn-import');
    if (ex) ex.addEventListener('click', function () { CT.io.exportJSON(); });
    if (im) im.addEventListener('click', function () { CT.io.importJSON(function () { route(); }); });
    const cl = document.getElementById('btn-clear');
    if (cl) cl.addEventListener('click', function () {
      CT.ui.confirmDialog('Start fresh',
        'Erase ALL players, sessions, games, drills, and programs? This cannot be undone — export a backup first if you want one.',
        'Erase everything', function () { CT.store.clearAll(); CT.ui.toast('Cleared — add your players in Players'); route(); });
    });
    // Quick-log '+': jump to Sessions (drill/session builder).
    const ql = document.getElementById('quick-log');
    if (ql) ql.addEventListener('click', function () { navigate('#/sessions'); });
  }

  function init() {
    CT.store.load();      // hydrate from localStorage (or boot empty)
    wireToolbar();
    wireAlertsBell();
    buildNav();
    booted = true;
    window.addEventListener('hashchange', route);
    const first = navViews()[0] || views[0];
    if (!location.hash && first) location.replace('#/' + first.id);
    route();
  }

  CT.registerView = registerView;
  CT.getViewRender = getViewRender;
  CT.router = { navigate: navigate, route: route, parseHash: parseHash, views: function () { return views.slice(); } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

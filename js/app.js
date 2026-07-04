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
    assess: 'gauge',
    programs: 'clipboard-list',
    games: 'diamond',
    armsafety: 'shield',
    // secondary / hidden (kept for any stray icon paint)
    player: 'user-round',
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
      case 'drills': return '#/programs/drills';
      // Old Sessions wrapper (#/sessions[/drills|/programs]) -> Programs.
      case 'sessions': return param === 'drills' ? '#/programs/drills' : '#/programs';
      case 'season': return '#/games/season';
      // Old assessment entry (#/assessment[/playerId]) -> new Assessments view.
      case 'assessment': return '#/assess' + (param ? '/' + param : '');
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
    closeQuickAdd();
    // An open modal must not survive navigation (it would overlay the new
    // view and leak its document-level Escape listener).
    try { CT.ui.closeModal(); } catch (e) {}

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

  // ---------------------------------------------------------------------------
  // Header "+" quick-log popover: Log a lesson / New assessment / Log program
  // session. Same dropdown pattern as the alerts bell.
  // ---------------------------------------------------------------------------
  function renderQuickAddPanel() {
    const panel = document.getElementById('quick-add-panel');
    if (!panel) return;
    panel.innerHTML =
      '<div class="al-panel-head"><span class="al-panel-title">Quick log</span></div>' +
      '<div class="al-panel-list">' +
        '<button class="qa-item" type="button" data-qa="lesson">' +
          '<i data-lucide="notebook-pen"></i>' +
          '<span class="qa-txt"><span class="qa-name">Log a lesson</span>' +
          '<span class="qa-sub">Ad-hoc coaching — drills, quick numbers, notes</span></span></button>' +
        '<a class="qa-item" href="#/assess/new">' +
          '<i data-lucide="gauge"></i>' +
          '<span class="qa-txt"><span class="qa-name">New assessment</span>' +
          '<span class="qa-sub">Baseline metrics with percentile previews</span></span></a>' +
        '<a class="qa-item" href="#/programs">' +
          '<i data-lucide="clipboard-check"></i>' +
          '<span class="qa-txt"><span class="qa-name">Log program session</span>' +
          '<span class="qa-sub">Check off an assigned program day</span></span></a>' +
      '</div>' +
      // Mobile-only data tools (the sidebar tools are hidden < 768px — this is
      // the phone's backup path for localStorage-only data).
      '<div class="al-panel-list qa-mobile-tools">' +
        '<button class="qa-item" type="button" data-qa="export">' +
          '<i data-lucide="download"></i>' +
          '<span class="qa-txt"><span class="qa-name">Export data</span>' +
          '<span class="qa-sub">Download everything as JSON (backup)</span></span></button>' +
        '<button class="qa-item" type="button" data-qa="import">' +
          '<i data-lucide="upload"></i>' +
          '<span class="qa-txt"><span class="qa-name">Import data</span>' +
          '<span class="qa-sub">Restore from a JSON backup</span></span></button>' +
      '</div>';
    paintIcons();
  }

  function closeQuickAdd() {
    const panel = document.getElementById('quick-add-panel');
    const btn = document.getElementById('quick-add');
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function wireQuickAdd() {
    const btn = document.getElementById('quick-add');
    const panel = document.getElementById('quick-add-panel');
    if (!btn || !panel) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeAlertsPanel();
      if (panel.hidden) {
        renderQuickAddPanel();
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      } else {
        closeQuickAdd();
      }
    });
    panel.addEventListener('click', function (e) {
      const lesson = e.target.closest('[data-qa="lesson"]');
      if (lesson) {
        closeQuickAdd();
        if (CT.sessionLog) CT.sessionLog.open({}); // player picker inside
        return;
      }
      if (e.target.closest('[data-qa="export"]')) { closeQuickAdd(); CT.io.exportJSON(); return; }
      if (e.target.closest('[data-qa="import"]')) { closeQuickAdd(); CT.io.importJSON(function () { route(); }); return; }
      if (e.target.closest('a')) closeQuickAdd();
    });
    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (!panel.contains(e.target) && !btn.contains(e.target)) closeQuickAdd();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeQuickAdd(); });
  }

  // Assignments never outlive their program block: anything past
  // startDate + weeks is auto-completed at boot, so migrated/old assignments
  // can't leave a permanent "due today" nag or a false adherence alert.
  function autoCompleteEndedAssignments() {
    try {
      CT.store.all('programAssignments').forEach(function (a) {
        if (a.status === 'completed') return;
        const prog = CT.store.getById('programs', a.programId);
        if (prog && CT.programs.isEnded(prog, a)) {
          CT.store.update('programAssignments', a.id, { status: 'completed' });
        }
      });
    } catch (e) { console.warn('Assignment auto-complete sweep failed:', e); }
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
    // Legacy mobile FAB (display:none since the bottom tab bar shipped): open
    // the lesson modal directly if it ever comes back.
    const ql = document.getElementById('quick-log');
    if (ql) ql.addEventListener('click', function () {
      if (CT.sessionLog) CT.sessionLog.open({});
    });
  }

  function init() {
    CT.store.load();      // hydrate from localStorage (or boot empty)
    // Seed the canonical drill library (insert-if-missing; coach edits and
    // deletions are respected — see drills-seed.js).
    try { if (CT.seeds) CT.seeds.ensure(); } catch (e) { console.warn('Drill seeding failed:', e); }
    autoCompleteEndedAssignments();
    wireToolbar();
    wireAlertsBell();
    wireQuickAdd();
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

/* views/sessions.js — SESSIONS wrapper. Consolidates the former "Drills & Sessions"
   and "Programs" destinations into one nav item with underline tabs:
     [ Drills & Sessions | Programs ]
   Each tab hosts the existing child view (CT.views.drills / CT.views.programs),
   rendered into a body container with { embedded:true } so it drops its own H1.
   Tab is reflected in the hash (#/sessions/drills, #/sessions/programs) so links
   and back/forward work. Registers CT.registerView('sessions'). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, esc = CT.escapeHtml;

  const TABS = [
    { id: 'drills', label: 'Drills & Sessions' },
    { id: 'programs', label: 'Programs' }
  ];
  const state = { tab: 'drills' };

  function subtitle() {
    const drills = store.drillLibrary().length;
    const active = store.query('programAssignments', function (a) { return a.status !== 'completed'; }).length;
    return drills + ' drill' + (drills === 1 ? '' : 's') + ' in library · ' +
      active + ' active program' + (active === 1 ? '' : 's');
  }

  function render(root, ctx) {
    if (ctx && ctx.param && TABS.some(function (t) { return t.id === ctx.param; })) state.tab = ctx.param;

    const tabbar = '<div class="tabbar" role="tablist">' + TABS.map(function (t) {
      return '<button class="tabbar-item' + (t.id === state.tab ? ' active' : '') + '" data-tab="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('') + '</div>';

    root.innerHTML = ui.pageHead('Sessions', subtitle()) + tabbar + '<div id="sessions-body"></div>';

    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        const t = b.getAttribute('data-tab');
        if (t === state.tab) return;
        CT.router.navigate('#/sessions/' + t);
      });
    });

    const body = root.querySelector('#sessions-body');
    const child = (state.tab === 'programs') ? CT.views.programs : CT.views.drills;
    if (child && typeof child.render === 'function') {
      // Pass no param through (the child would misread the section tab id).
      child.render(body, { param: null, embedded: true, navigate: ctx.navigate });
    } else {
      body.innerHTML = ui.emptyState('alert-triangle', 'Section unavailable', 'This section failed to load.');
    }
  }

  CT.registerView('sessions', { label: 'Sessions', render: render });
})();

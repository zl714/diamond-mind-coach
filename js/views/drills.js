/* views/drills.js — "Drills & Sessions" centerpiece.
   TWO parts on one board:
   (1) DRILL LIBRARY — coach-managed drills (add/edit/delete), grouped by category.
   (2) SESSION BUILDER — pick a player + date, then DRAG drills from the library
       into the session (SortableJS clone-from-library), reorder, add per-session
       notes (debounced autosave keyed on the STABLE lesson id) + quick stats/rating.
   Accessibility: every library drill has an "Assign to session" menu; every session
   row has Move up / Move down / Remove; an aria-live region announces pick-up/drop.
   Registers via CT.registerView('drills', { label, render }). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;

  // Curated quick-stat metrics (keys must be model.METRIC_BY_KEY keys).
  const QUICK_KEYS = ['exitVeloMax', 'batSpeed', 'fastballVelo', 'strikePct', 'sixtyYard'];

  // Persisted selection + last screen-reader announcement (survive re-render).
  const sel = { playerId: null, lessonId: null };
  let announceMsg = '';

  // ---- helpers ---------------------------------------------------------------
  function announce(msg) {
    announceMsg = msg || '';
    const el = document.getElementById('drills-announce');
    if (el) el.textContent = announceMsg;
  }

  function drillName(id) {
    const d = store.getDrill(id);
    return d ? d.name : 'Removed drill';
  }

  function ensureSelection(players, ctxParam) {
    if (ctxParam && store.getPlayer(ctxParam)) sel.playerId = ctxParam;
    if (!sel.playerId || !store.getPlayer(sel.playerId)) sel.playerId = players[0].id;
    const lessons = store.lessonsForPlayer(sel.playerId);
    if (!sel.lessonId || !lessons.some(function (l) { return l.id === sel.lessonId; })) {
      sel.lessonId = lessons.length ? lessons[0].id : null;
    }
  }

  // ---- drill add/edit form ---------------------------------------------------
  function openDrillForm(existing) {
    const d = existing || {};
    const html =
      ui.formField({ type: 'text', name: 'name', label: 'Drill name', value: d.name, required: true, placeholder: 'e.g. Tee Work' }) +
      ui.formField({ type: 'select', name: 'category', label: 'Category', value: d.category || 'Hitting', options: model.DRILL_CATEGORIES }) +
      ui.formField({ type: 'textarea', name: 'defaultNotes', label: 'Default notes', value: d.defaultNotes, placeholder: 'Cues, set/rep scheme, focus…' }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save">' + (existing ? 'Save changes' : 'Add drill') + '</button>' +
      '</div>';

    ui.openModal(existing ? 'Edit drill' : 'New drill', html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const get = function (n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
        const data = { name: get('name'), category: get('category'), defaultNotes: get('defaultNotes') };
        if (!data.name) { ui.toast('Drill name is required.'); return; }
        if (existing) store.update('drills', d.id, data); else store.insert('drills', data);
        close();
        ui.toast(existing ? 'Drill updated' : 'Drill added');
        CT.router.route();
      });
    });
  }

  // ---- new-session form ------------------------------------------------------
  function openSessionForm(playerId) {
    const player = store.getPlayer(playerId);
    const html =
      '<p class="muted" style="margin-top:0;">New session for <strong>' + esc(player ? player.name : '') + '</strong>.</p>' +
      ui.formField({ type: 'date', name: 'date', label: 'Session date', value: CT.todayISO(), required: true }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save">Create session</button>' +
      '</div>';
    ui.openModal('New session', html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const date = modal.querySelector('[name="date"]').value || CT.todayISO();
        const lesson = store.insert('lessons', { playerId: playerId, date: date });
        sel.lessonId = lesson.id;
        close();
        ui.toast('Session created');
        CT.router.route();
      });
    });
  }

  // ---- library markup --------------------------------------------------------
  function assignMenu(drill, lessons, player) {
    let items = lessons.map(function (l) {
      return '<button class="btn btn-ghost btn-sm btn-block" data-act="assign" data-id="' + esc(drill.id) +
        '" data-lesson="' + esc(l.id) + '">' + esc(CT.formatDate(l.date)) +
        ' · ' + (l.drillIds.length) + ' drill(s)</button>';
    }).join('');
    items += '<button class="btn btn-ghost btn-sm btn-block" data-act="assign-new" data-id="' + esc(drill.id) +
      '"><i data-lucide="plus"></i>New session for ' + esc(player.name.split(' ').slice(-1)[0]) + '</button>';
    return '<details class="assign-menu">' +
      '<summary class="btn btn-sm" aria-label="Assign ' + esc(drill.name) + ' to a session">' +
        '<i data-lucide="list-plus"></i>Assign</summary>' +
      '<div class="assign-pop" role="menu">' + items + '</div>' +
    '</details>';
  }

  function libraryDrillRow(drill, lessons, player) {
    return '<div class="drill-row" data-id="' + esc(drill.id) + '" role="listitem">' +
      '<button class="drag-handle" tabindex="-1" aria-hidden="true" title="Drag into a session"><i data-lucide="grip-vertical"></i></button>' +
      '<div class="drill-main">' +
        '<div class="drill-name">' + esc(drill.name) + '</div>' +
        (drill.defaultNotes ? '<div class="drill-sub muted">' + esc(drill.defaultNotes) + '</div>' : '') +
      '</div>' +
      '<div class="drill-acts">' +
        assignMenu(drill, lessons, player) +
        '<button class="btn btn-ghost btn-sm" data-act="edit-drill" data-id="' + esc(drill.id) + '" aria-label="Edit ' + esc(drill.name) + '"><i data-lucide="pencil"></i></button>' +
        '<button class="btn btn-ghost btn-sm" data-act="del-drill" data-id="' + esc(drill.id) + '" aria-label="Delete ' + esc(drill.name) + '"><i data-lucide="trash-2"></i></button>' +
      '</div>' +
    '</div>';
  }

  function libraryHtml(lessons, player) {
    const all = store.drillLibrary();
    let body = '';
    model.DRILL_CATEGORIES.forEach(function (cat) {
      const rows = all.filter(function (d) { return d.category === cat; });
      if (!rows.length) return;
      body +=
        '<div class="lib-group">' +
          '<div class="lib-cat">' + esc(cat) + ' <span class="num">' + rows.length + '</span></div>' +
          '<div class="drill-lib-list" data-cat="' + esc(cat) + '" role="list">' +
            rows.map(function (d) { return libraryDrillRow(d, lessons, player); }).join('') +
          '</div>' +
        '</div>';
    });
    return '<div class="card drills-lib">' +
      '<div class="card-head" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">' +
        '<div><h3 style="margin:0;">Drill library</h3>' +
          '<div class="muted" style="font-size:.85rem;">' + all.length + ' drill(s) · drag into a session</div></div>' +
        '<button class="btn btn-primary btn-sm" id="add-drill"><i data-lucide="plus"></i>New drill</button>' +
      '</div>' +
      '<div class="card-body" style="margin-top:.6rem;">' + body + '</div>' +
    '</div>';
  }

  // ---- session markup --------------------------------------------------------
  function ratingChip(delta) {
    if (delta == null || delta === 0) return ui.pill('Rating ±0.0', 'neutral');
    const tone = delta > 0 ? 'up' : 'down';
    const glyph = delta > 0 ? 'trending-up' : 'trending-down';
    const sign = delta > 0 ? '+' : '−';
    return '<span class="pill" style="' + ui.toneStyle(tone) + '"><i data-lucide="' + glyph + '"></i>' +
      'Rating ' + sign + Math.abs(delta).toFixed(1) + '</span>';
  }

  function sessionRow(drillId, index, total) {
    const d = store.getDrill(drillId);
    const name = d ? d.name : 'Removed drill';
    const cat = d ? d.category : '—';
    return '<div class="session-row' + (d ? '' : ' is-missing') + '" data-id="' + esc(drillId) + '" data-index="' + index + '" role="listitem">' +
      '<button class="drag-handle" tabindex="-1" aria-hidden="true"><i data-lucide="grip-vertical"></i></button>' +
      '<span class="seq num">' + (index + 1) + '</span>' +
      '<div class="drill-main">' +
        '<div class="drill-name">' + esc(name) + '</div>' +
        '<div class="drill-sub muted">' + esc(cat) + '</div>' +
      '</div>' +
      '<div class="drill-acts">' +
        '<button class="btn btn-ghost btn-sm" data-act="up" data-index="' + index + '" aria-label="Move ' + esc(name) + ' up"' + (index === 0 ? ' disabled' : '') + '><i data-lucide="chevron-up"></i></button>' +
        '<button class="btn btn-ghost btn-sm" data-act="down" data-index="' + index + '" aria-label="Move ' + esc(name) + ' down"' + (index === total - 1 ? ' disabled' : '') + '><i data-lucide="chevron-down"></i></button>' +
        '<button class="btn btn-ghost btn-sm" data-act="remove" data-index="' + index + '" aria-label="Remove ' + esc(name) + ' from session"><i data-lucide="x"></i></button>' +
      '</div>' +
    '</div>';
  }

  function quickStatsHtml(lesson) {
    const fields = QUICK_KEYS.map(function (k) {
      const m = model.METRIC_BY_KEY[k];
      const v = lesson.quickStats && lesson.quickStats[k] != null ? lesson.quickStats[k] : '';
      return ui.formField({ type: 'number', name: 'qs_' + k, label: m.label + ' (' + m.unit + ')', value: v, step: 0.1 });
    }).join('');
    const rating = lesson.ratingDelta == null ? '' : lesson.ratingDelta;
    return '<div class="qs-grid">' + fields +
      ui.formField({ type: 'number', name: 'ratingDelta', label: 'Rating Δ', value: rating, step: 0.1, min: -2, max: 2, help: 'Coach grade change (−2…+2).' }) +
    '</div>' +
    '<button class="btn btn-primary btn-sm" id="save-stats"><i data-lucide="save"></i>Save stats &amp; rating</button>';
  }

  function sessionPanelHtml(player, lesson, lessons) {
    let tabs = lessons.map(function (l) {
      const active = l.id === (lesson && lesson.id) ? ' active' : '';
      return '<button class="tabbar-item' + active + '" data-act="pick-lesson" data-lesson="' + esc(l.id) + '">' +
        esc(CT.relativeDate(l.date)) + ' <span class="num">(' + l.drillIds.length + ')</span></button>';
    }).join('');

    let board;
    if (!lesson) {
      board = ui.emptyState('clipboard-list', 'No session selected',
        'Create a session for ' + esc(player.name) + ', then drag drills in from the library.',
        '<button class="btn btn-primary btn-sm" id="new-session"><i data-lucide="plus"></i>New session</button>');
    } else {
      const rows = lesson.drillIds.length
        ? lesson.drillIds.map(function (id, i) { return sessionRow(id, i, lesson.drillIds.length); }).join('')
        : '<div class="session-drop-hint muted"><i data-lucide="move"></i> Drag drills here, or use a drill\'s “Assign” menu.</div>';
      const savedDefaults = lesson.drillIds
        .map(function (id) { const d = store.getDrill(id); return d && d.defaultNotes ? '• ' + d.defaultNotes : ''; })
        .filter(Boolean);
      board =
        '<div class="session-meta">' +
          '<div class="kv-row"><span class="k">Date</span><span class="v num">' + esc(CT.formatDate(lesson.date)) + '</span></div>' +
          '<div class="kv-row"><span class="k">Drills</span><span class="v num">' + lesson.drillIds.length + '</span></div>' +
          '<div class="kv-row"><span class="k">Rating</span><span class="v">' + ratingChip(lesson.ratingDelta) + '</span></div>' +
        '</div>' +
        '<div class="session-col" data-lesson="' + esc(lesson.id) + '" role="list" aria-label="Drills in this session">' + rows + '</div>' +
        '<div class="notes-block">' +
          '<label for="session-notes">Session notes <span class="saved-tag muted" id="notes-saved" aria-live="polite"></span></label>' +
          '<textarea id="session-notes" class="notes-editor" placeholder="What you worked on, cues, what to repeat next time… (⌘/Ctrl+Enter to log)">' + esc(lesson.notes) + '</textarea>' +
          (savedDefaults.length ? '<div class="muted notes-hint">From drill defaults: ' + esc(savedDefaults.join('  ')) + '</div>' : '') +
        '</div>' +
        '<details class="qs-wrap"><summary class="btn btn-ghost btn-sm"><i data-lucide="activity"></i>Quick stats &amp; rating</summary>' +
          quickStatsHtml(lesson) +
        '</details>';
    }

    return '<div class="card drills-session">' +
      '<div class="card-head" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">' +
        '<div><h3 style="margin:0;">Session builder</h3>' +
          '<div class="muted" style="font-size:.85rem;">' + esc(player.name) + '</div></div>' +
        '<button class="btn btn-primary btn-sm" id="new-session"><i data-lucide="plus"></i>New session</button>' +
      '</div>' +
      '<div class="card-body" style="margin-top:.6rem;">' +
        '<div class="field"><label for="player-pick">Player</label>' +
          '<select class="select" id="player-pick">' +
            store.getPlayers().map(function (p) {
              return '<option value="' + esc(p.id) + '"' + (p.id === player.id ? ' selected' : '') + '>' + esc(p.name) + '</option>';
            }).join('') +
          '</select></div>' +
        (tabs ? '<div class="tabbar session-tabs">' + tabs + '</div>' : '') +
        board +
      '</div>' +
    '</div>';
  }

  // ---- wiring ----------------------------------------------------------------
  function wireDrag(root, lesson) {
    if (typeof window.Sortable === 'undefined') return; // CDN offline → menu/buttons still work
    // Library lists are clone sources (pull a COPY, library stays intact).
    root.querySelectorAll('.drill-lib-list').forEach(function (listEl) {
      window.Sortable.create(listEl, {
        group: { name: 'board', pull: 'clone', put: false },
        sort: false, animation: 150, handle: '.drag-handle',
        delay: 120, delayOnTouchOnly: true,
        onChoose: function (evt) { announce('Picked up ' + drillName(evt.item.getAttribute('data-id'))); }
      });
    });
    // The active session column accepts clones + reorders.
    if (!lesson) return;
    const col = root.querySelector('.session-col');
    if (!col) return;
    // Read order from the live DOM, then DEFER the destructive re-render so
    // SortableJS can finish its own cleanup first (avoids mid-callback DOM churn).
    function persist(msg) {
      const ids = col.toArray(); // array of data-id, current visual order
      announce(msg + ' — now ' + ids.length + ' drill(s).');
      setTimeout(function () { store.setLessonDrills(lesson.id, ids); CT.router.route(); }, 0);
    }
    window.Sortable.create(col, {
      group: 'board', animation: 150, handle: '.drag-handle',
      delay: 120, delayOnTouchOnly: true,
      onChoose: function (evt) { announce('Picked up ' + drillName(evt.item.getAttribute('data-id'))); },
      // Clone dropped in from the library (fires on the destination list).
      onAdd: function (evt) { persist('Dropped ' + drillName(evt.item.getAttribute('data-id')) + ' into the session'); },
      // Reorder within the session (contract pattern: onEnd + col.toArray()).
      onEnd: function (evt) { if (evt.from === evt.to) persist('Reordered ' + drillName(evt.item.getAttribute('data-id'))); }
    });
  }

  function wireNotes(root, lesson) {
    if (!lesson) return;
    const ta = root.querySelector('#session-notes');
    const savedTag = root.querySelector('#notes-saved');
    if (!ta) return;
    let timer = null;
    function grow() { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
    function save(loud) {
      store.setLessonNotes(lesson.id, ta.value);
      if (savedTag) savedTag.textContent = 'Saved';
      if (loud) ui.toast('Note logged');
    }
    grow();
    ta.addEventListener('input', function () {
      grow();
      if (savedTag) savedTag.textContent = 'Saving…';
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { save(false); }, 500);
    });
    ta.addEventListener('blur', function () { if (timer) clearTimeout(timer); save(false); });
    ta.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (timer) clearTimeout(timer); save(true); }
    });
  }

  function wireQuickStats(root, lesson) {
    if (!lesson) return;
    const btn = root.querySelector('#save-stats');
    if (!btn) return;
    btn.addEventListener('click', function () {
      const quickStats = {};
      QUICK_KEYS.forEach(function (k) {
        const el = root.querySelector('[name="qs_' + k + '"]');
        const v = el ? Number(el.value) : NaN;
        if (el && el.value !== '' && Number.isFinite(v)) quickStats[k] = v;
      });
      const rEl = root.querySelector('[name="ratingDelta"]');
      const rv = rEl && rEl.value !== '' ? Number(rEl.value) : null;
      store.update('lessons', lesson.id, { quickStats: quickStats, ratingDelta: (rv != null && Number.isFinite(rv)) ? rv : null });
      ui.toast('Stats & rating saved');
      CT.router.route();
    });
  }

  function reorder(lesson, index, dir) {
    const ids = lesson.drillIds.slice();
    const to = index + dir;
    if (to < 0 || to >= ids.length) return;
    const moved = ids[index];
    ids.splice(index, 1);
    ids.splice(to, 0, moved);
    store.setLessonDrills(lesson.id, ids);
    announce('Moved ' + drillName(moved) + ' to position ' + (to + 1) + ' of ' + ids.length + '.');
    CT.router.route();
  }

  function removeAt(lesson, index) {
    const ids = lesson.drillIds.slice();
    const removed = ids[index];
    ids.splice(index, 1);
    store.setLessonDrills(lesson.id, ids);
    announce('Removed ' + drillName(removed) + ' from the session.');
    CT.router.route();
  }

  function assignDrill(lesson, drillId) {
    const ids = lesson.drillIds.concat([drillId]);
    store.setLessonDrills(lesson.id, ids);
    announce('Assigned ' + drillName(drillId) + ' to ' + CT.formatDate(lesson.date) + '.');
    CT.router.route();
  }

  // ---- render ----------------------------------------------------------------
  function render(root, ctx) {
    const players = store.getPlayers();
    // When hosted inside the Sessions wrapper the H1 + "New drill" live upstream.
    const embedded = !!(ctx && ctx.embedded);

    let html = embedded ? '' : ui.pageHead('Drills & Sessions',
      'Build a coaching session by dragging drills from the library',
      '<button class="btn btn-primary" id="add-drill-top"><i data-lucide="plus"></i>New drill</button>');

    if (!players.length) {
      html += ui.emptyState('users', 'No players yet',
        'Add a player on the Players tab first, then build their drill sessions here.');
      root.innerHTML = html;
      return;
    }

    ensureSelection(players, ctx && ctx.param);
    const player = store.getPlayer(sel.playerId);
    const lessons = store.lessonsForPlayer(sel.playerId);
    const lesson = sel.lessonId ? store.getLesson(sel.lessonId) : null;

    html += '<div class="drills-view drills-board">' +
      libraryHtml(lessons, player) +
      sessionPanelHtml(player, lesson, lessons) +
    '</div>';

    // aria-live region (sr-only) — announces pick-up / drop / move / assign.
    html += '<div id="drills-announce" class="sr-only" role="status" aria-live="polite"></div>';

    root.innerHTML = html;
    if (announceMsg) { const a = root.querySelector('#drills-announce'); if (a) a.textContent = announceMsg; }

    // ---- events ----
    [root.querySelector('#add-drill'), root.querySelector('#add-drill-top')].forEach(function (b) {
      if (b) b.addEventListener('click', function () { openDrillForm(null); });
    });
    root.querySelectorAll('[data-act="edit-drill"]').forEach(function (b) {
      b.addEventListener('click', function () { openDrillForm(store.getDrill(b.getAttribute('data-id'))); });
    });
    root.querySelectorAll('[data-act="del-drill"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const d = store.getDrill(b.getAttribute('data-id'));
        if (!d) return;
        ui.confirmDialog('Delete drill', 'Delete "' + d.name + '" from the library? Existing sessions keep their copy.',
          'Delete', function () { store.remove('drills', d.id); ui.toast('Drill deleted'); CT.router.route(); });
      });
    });

    const picker = root.querySelector('#player-pick');
    if (picker) picker.addEventListener('change', function () {
      sel.playerId = picker.value; sel.lessonId = null; CT.router.route();
    });
    root.querySelectorAll('[data-act="pick-lesson"]').forEach(function (b) {
      b.addEventListener('click', function () { sel.lessonId = b.getAttribute('data-lesson'); CT.router.route(); });
    });
    root.querySelectorAll('#new-session').forEach(function (b) {
      b.addEventListener('click', function () { openSessionForm(sel.playerId); });
    });

    // Assign menus (keyboard/no-drag fallback).
    root.querySelectorAll('[data-act="assign"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const l = store.getLesson(b.getAttribute('data-lesson'));
        if (l) assignDrill(l, b.getAttribute('data-id'));
      });
    });
    root.querySelectorAll('[data-act="assign-new"]').forEach(function (b) {
      b.addEventListener('click', function () { openSessionForm(sel.playerId); });
    });

    // Session row controls (move up/down/remove — WCAG drag fallback).
    if (lesson) {
      root.querySelectorAll('[data-act="up"]').forEach(function (b) {
        b.addEventListener('click', function () { reorder(lesson, Number(b.getAttribute('data-index')), -1); });
      });
      root.querySelectorAll('[data-act="down"]').forEach(function (b) {
        b.addEventListener('click', function () { reorder(lesson, Number(b.getAttribute('data-index')), 1); });
      });
      root.querySelectorAll('[data-act="remove"]').forEach(function (b) {
        b.addEventListener('click', function () { removeAt(lesson, Number(b.getAttribute('data-index'))); });
      });
    }

    wireDrag(root, lesson);
    wireNotes(root, lesson);
    wireQuickStats(root, lesson);
  }

  // Hosted inside the Sessions wrapper (not a standalone nav destination).
  window.CT.views = window.CT.views || {};
  window.CT.views.drills = { label: 'Drills & Sessions', render: render };
})();

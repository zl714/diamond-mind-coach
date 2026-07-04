/* views/program-builder.js — PROGRAM BUILDER (child of the Programs view).
   Build or edit a typed training program as a WEEK × DAY grid of drill/step
   items (#/programs/new, #/programs/edit/<id>):
     • Meta panel: name, type (throwing|hitting|strength|custom), weeks,
       days/week, optional hard age gate, description.
     • Library rail: drag drills into any day (SortableJS clone-pull, the same
       pattern the old session builder used) — or tap "Add" to drop the drill
       on the SELECTED day (keyboard/no-drag fallback). Steps are free text
       with optional sets × reps on drill items.
     • Weeks left empty repeat week 1's pattern when sessions are logged
       (CT.programs.dayFor fallback), and "Copy week 1 →" makes that explicit.
   Edits live in a module-level DRAFT (never written to the store until Save),
   so a mis-drag can't corrupt a stored program. "Start from template" seeds
   the draft from programs-data.js starters — templates are never auto-stored.
   Exposed on CT.views.programBuilder (hosted by programs.js). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;
  const programs = CT.programs;

  // Draft survives re-renders (the IIFE runs once); keyed so switching between
  // "new" and different edits re-seeds it.
  const state = { key: null, draft: null, selW: 0, selD: 0 };

  function newDraft() {
    return model.Program({ name: '', type: 'custom', weeks: 4, daysPerWeek: 3, days: [] });
  }

  function seedFrom(programId) {
    if (programId) {
      const p = store.getById('programs', programId);
      if (p) return JSON.parse(JSON.stringify(p)); // deep copy — draft never aliases the store
      return null;
    }
    return newDraft();
  }

  function ensureDraft(programId) {
    const key = programId || 'new';
    if (state.key !== key || !state.draft) {
      state.key = key;
      state.draft = seedFrom(programId);
      state.selW = 0; state.selD = 0;
    }
    return state.draft;
  }
  function resetDraft() { state.key = null; state.draft = null; }

  // ----- draft day helpers (immutably-shaped enough: draft is a private copy) --
  function getDay(draft, w, d) {
    return (draft.days || []).find(function (x) { return x.weekIndex === w && x.dayIndex === d; }) || null;
  }
  function ensureDay(draft, w, d) {
    let day = getDay(draft, w, d);
    if (!day) {
      day = { weekIndex: w, dayIndex: d, title: '', items: [] };
      draft.days = (draft.days || []).concat([day]);
    }
    if (!Array.isArray(day.items)) day.items = [];
    return day;
  }
  function newDrillItem(drillId) {
    return { id: CT.uid('pi'), kind: 'drill', drillId: drillId, sets: null, reps: null, notes: '' };
  }
  function newStepItem(text) {
    return { id: CT.uid('pi'), kind: 'step', text: String(text || '') };
  }
  function findItem(draft, itemId) {
    for (let i = 0; i < (draft.days || []).length; i++) {
      const day = draft.days[i];
      const idx = (day.items || []).findIndex(function (it) { return it.id === itemId; });
      if (idx >= 0) return { day: day, index: idx, item: day.items[idx] };
    }
    return null;
  }
  function totalItems(draft) {
    return (draft.days || []).reduce(function (s, day) { return s + (day.items || []).length; }, 0);
  }

  // ----- library rail --------------------------------------------------------
  function railHtml() {
    const lib = store.drillLibrary();
    let body = '';
    model.DRILL_CATEGORIES.forEach(function (cat) {
      const rows = lib.filter(function (d) { return d.category === cat; });
      if (!rows.length) return;
      body += '<div class="lib-group">' +
        '<div class="lib-cat">' + esc(model.DRILL_CATEGORY_LABELS[cat] || cat) + ' <span class="num">' + rows.length + '</span></div>' +
        '<div class="drill-lib-list pb-rail-list" role="list">' +
          rows.map(function (d) {
            return '<div class="drill-row" data-drill="' + esc(d.id) + '" role="listitem">' +
              '<button class="drag-handle" tabindex="-1" aria-hidden="true" title="Drag into a day"><i data-lucide="grip-vertical"></i></button>' +
              '<div class="drill-main"><div class="drill-name">' + esc(d.name) + '</div>' +
                (d.description ? '<div class="drill-sub muted">' + esc(d.description) + '</div>' : '') + '</div>' +
              '<button class="btn btn-ghost btn-sm" data-act="rail-add" data-drill="' + esc(d.id) +
                '" aria-label="Add ' + esc(d.name) + ' to the selected day"><i data-lucide="plus"></i>Add</button>' +
            '</div>';
          }).join('') +
        '</div></div>';
    });
    if (!body) {
      body = '<p class="pgm-note">No drills in the library yet — add some in the Drill Library tab, ' +
        'or build the program from free-text steps.</p>';
    }
    return ui.card({
      title: 'Drill library',
      subtitle: 'Drag into a day — or tap Add for the selected day',
      body: body
    });
  }

  // ----- day cells ------------------------------------------------------------
  function itemRow(it) {
    if (it.kind === 'drill') {
      const d = store.getDrill(it.drillId);
      const name = d ? d.name : 'Removed drill';
      return '<div class="pb-item" data-item="' + esc(it.id) + '" role="listitem">' +
        '<button class="drag-handle" tabindex="-1" aria-hidden="true"><i data-lucide="grip-vertical"></i></button>' +
        '<span class="pb-item-name' + (d ? '' : ' muted') + '">' + esc(name) + '</span>' +
        '<span class="pb-sr num">' +
          '<input class="input pb-mini" type="number" inputmode="numeric" min="1" max="20" step="1" data-sets="' + esc(it.id) + '" value="' + (it.sets == null ? '' : esc(it.sets)) + '" placeholder="s" aria-label="Sets" />' +
          '<span class="pb-x">×</span>' +
          '<input class="input pb-mini" type="number" inputmode="numeric" min="1" max="100" step="1" data-reps="' + esc(it.id) + '" value="' + (it.reps == null ? '' : esc(it.reps)) + '" placeholder="r" aria-label="Reps" />' +
        '</span>' +
        '<button class="btn btn-ghost btn-sm" data-act="rm-item" data-item="' + esc(it.id) + '" aria-label="Remove ' + esc(name) + '"><i data-lucide="x"></i></button>' +
      '</div>';
    }
    return '<div class="pb-item" data-item="' + esc(it.id) + '" role="listitem">' +
      '<button class="drag-handle" tabindex="-1" aria-hidden="true"><i data-lucide="grip-vertical"></i></button>' +
      '<span class="pb-item-name pb-step">' + esc(it.text) + '</span>' +
      '<button class="btn btn-ghost btn-sm" data-act="rm-item" data-item="' + esc(it.id) + '" aria-label="Remove step"><i data-lucide="x"></i></button>' +
    '</div>';
  }

  function dayCell(draft, w, d) {
    const day = getDay(draft, w, d);
    const items = day ? (day.items || []) : [];
    const selected = state.selW === w && state.selD === d;
    const wk1 = w > 0 && !items.length && (getDay(draft, 0, d) || {}).items && getDay(draft, 0, d).items.length;
    return '<div class="pb-day' + (selected ? ' selected' : '') + '" data-w="' + w + '" data-d="' + d + '">' +
      '<button class="pb-day-head" data-act="sel-day" data-w="' + w + '" data-d="' + d + '" aria-pressed="' + selected + '">' +
        'Day ' + (d + 1) + (selected ? ' <span class="pb-sel-tag">selected</span>' : '') +
      '</button>' +
      '<div class="pb-items" data-w="' + w + '" data-d="' + d + '" role="list" aria-label="Week ' + (w + 1) + ' day ' + (d + 1) + ' items">' +
        (items.length ? items.map(itemRow).join('')
          : '<div class="pb-empty muted">' + (wk1 ? 'Repeats week 1' : 'Drop drills here') + '</div>') +
      '</div>' +
      '<input class="input pb-step-add" type="text" data-w="' + w + '" data-d="' + d + '" placeholder="+ step, Enter to add" aria-label="Add a free-text step to week ' + (w + 1) + ' day ' + (d + 1) + '" />' +
    '</div>';
  }

  function gridHtml(draft) {
    const weeks = Math.max(1, Number(draft.weeks) || 1);
    const perWeek = Math.max(1, Number(draft.daysPerWeek) || 1);
    let rows = '';
    for (let w = 0; w < weeks; w++) {
      let cells = '';
      for (let d = 0; d < perWeek; d++) cells += dayCell(draft, w, d);
      rows += '<div class="pb-week">' +
        '<div class="pb-week-label">Week <span class="num">' + (w + 1) + '</span>' +
          (w === 0 && weeks > 1 ? '<button class="btn btn-ghost btn-sm" data-act="copy-week"><i data-lucide="copy"></i>Copy to all</button>' : '') +
        '</div>' +
        '<div class="pb-week-days" style="grid-template-columns:repeat(' + perWeek + ',minmax(180px,1fr));">' + cells + '</div>' +
      '</div>';
    }
    return '<div class="pb-grid">' + rows + '</div>';
  }

  // ----- meta panel -----------------------------------------------------------
  function metaHtml(draft, isNew) {
    const typeOptions = model.PROGRAM_TYPES.map(function (t) {
      return { value: t, label: t.charAt(0).toUpperCase() + t.slice(1) };
    });
    let tplPicker = '';
    if (isNew) {
      const opts = [{ value: '', label: 'Start from scratch…' }].concat(
        programs.templates().map(function (t) { return { value: t.templateId, label: t.name }; }));
      tplPicker = '<div class="field-row pb-tpl-row">' +
        ui.formField({ type: 'select', name: 'pb-template', label: 'Start from template', options: opts, value: '' }) +
        '<button class="btn btn-sm" id="pb-apply-tpl" style="align-self:flex-end;"><i data-lucide="sparkles"></i>Apply</button>' +
      '</div>';
    }
    return ui.card({
      title: isNew ? 'Program details' : 'Edit program',
      body:
        tplPicker +
        ui.formField({ type: 'text', name: 'pb-name', label: 'Program name', value: draft.name, required: true, placeholder: 'e.g. Spring Arm-Care Block' }) +
        '<div class="field-row">' +
          ui.formField({ type: 'select', name: 'pb-type', label: 'Type', value: draft.type, options: typeOptions, help: 'Throwing programs get the Pitch Smart throws gate at log time.' }) +
          ui.formField({ type: 'number', name: 'pb-weeks', label: 'Weeks', value: draft.weeks, min: 1, max: 16, step: 1 }) +
          ui.formField({ type: 'number', name: 'pb-dpw', label: 'Days / week', value: Math.max(1, draft.daysPerWeek || 1), min: 1, max: 7, step: 1 }) +
        '</div>' +
        '<div class="field-row">' +
          ui.formField({ type: 'number', name: 'pb-agegate', label: 'Min age (hard gate, optional)', value: draft.ageGateMin == null ? '' : draft.ageGateMin, min: 8, max: 18, step: 1, help: 'Blocks assignment below this age (e.g. 15 for weighted-ball work).' }) +
        '</div>' +
        ui.formField({ type: 'textarea', name: 'pb-desc', label: 'Description', value: draft.description, placeholder: 'What this block is for, intensity notes…' })
    });
  }

  // ----- Sortable wiring ------------------------------------------------------
  function wireDrag(root, draft) {
    if (typeof window.Sortable === 'undefined') return; // CDN offline → Add buttons still work
    root.querySelectorAll('.pb-rail-list').forEach(function (listEl) {
      window.Sortable.create(listEl, {
        group: { name: 'pb', pull: 'clone', put: false },
        sort: false, animation: 150, handle: '.drag-handle',
        delay: 120, delayOnTouchOnly: true
      });
    });
    root.querySelectorAll('.pb-items').forEach(function (col) {
      window.Sortable.create(col, {
        group: { name: 'pb', pull: true, put: true },
        animation: 150, handle: '.drag-handle',
        delay: 120, delayOnTouchOnly: true,
        onAdd: function (evt) {
          const w = Number(evt.to.getAttribute('data-w')), d = Number(evt.to.getAttribute('data-d'));
          const day = ensureDay(draft, w, d);
          // Index among real items only (the "Drop drills here" hint isn't data).
          const idx = Math.min(evt.newIndex, day.items.length);
          const drillId = evt.item.getAttribute('data-drill');
          const itemId = evt.item.getAttribute('data-item');
          if (drillId) {
            day.items.splice(idx, 0, newDrillItem(drillId));
          } else if (itemId) {
            const src = findItem(draft, itemId); // still in its ORIGINAL day in the draft
            if (src) { src.day.items.splice(src.index, 1); day.items.splice(Math.min(idx, day.items.length), 0, src.item); }
          }
          setTimeout(function () { CT.router.route(); }, 0);
        },
        onEnd: function (evt) {
          if (evt.from !== evt.to) return; // cross-cell handled by onAdd
          const w = Number(evt.to.getAttribute('data-w')), d = Number(evt.to.getAttribute('data-d'));
          const day = getDay(draft, w, d);
          if (!day || evt.oldIndex === evt.newIndex) return;
          const moved = day.items.splice(evt.oldIndex, 1)[0];
          if (moved) day.items.splice(evt.newIndex, 0, moved);
          setTimeout(function () { CT.router.route(); }, 0);
        }
      });
    });
  }

  // ----- save -----------------------------------------------------------------
  function save(draft, isNew, navigate) {
    if (!String(draft.name || '').trim()) { ui.toast('Program name is required.'); return; }
    if (!totalItems(draft)) { ui.toast('Add at least one drill or step to a day.'); return; }
    // Trim empty days + days outside the current weeks/daysPerWeek window.
    const weeks = Math.max(1, Number(draft.weeks) || 1);
    const perWeek = Math.max(1, Number(draft.daysPerWeek) || 1);
    const days = (draft.days || []).filter(function (day) {
      return (day.items || []).length && day.weekIndex < weeks && day.dayIndex < perWeek;
    });
    const payload = {
      name: draft.name, type: draft.type, description: draft.description,
      weeks: weeks, daysPerWeek: perWeek, days: days,
      ageGateMin: draft.ageGateMin == null || draft.ageGateMin === '' ? null : Number(draft.ageGateMin),
      ageBands: draft.ageBands, clinicianRequired: !!draft.clinicianRequired,
      templateId: draft.templateId || null, archived: !!draft.archived
    };
    let saved;
    if (isNew) {
      saved = store.insert('programs', payload);
    } else {
      saved = store.update('programs', state.key, payload);
      if (!saved) {
        // Deleted concurrently (e.g. second tab): don't toast success then throw.
        ui.toast('Could not save — this program no longer exists.');
        resetDraft();
        navigate('#/programs');
        return;
      }
    }
    resetDraft();
    ui.toast('Program saved');
    navigate('#/programs/' + saved.id);
  }

  // ----- main render ----------------------------------------------------------
  function render(root, ctx) {
    const programId = ctx && ctx.programId ? ctx.programId : null;
    const isNew = !programId;
    const draft = ensureDraft(programId);
    const navigate = (ctx && ctx.navigate) || CT.router.navigate;

    if (!draft) {
      root.innerHTML = ui.emptyState('search-x', 'Program not found',
        'This program may have been deleted.', '<a class="btn btn-primary" href="#/programs"><i data-lucide="arrow-left"></i>Back to Programs</a>');
      return;
    }

    root.innerHTML =
      '<a class="back-link" href="#/programs"><i data-lucide="chevron-left"></i>All programs</a>' +
      ui.pageHead(isNew ? 'New program' : 'Edit program',
        'Week × day plan — drag drills in, add free-text steps, set sets × reps',
        '<button class="btn btn-ghost" id="pb-discard"><i data-lucide="x"></i>Discard</button>' +
        '<button class="btn btn-primary" id="pb-save"><i data-lucide="check"></i>Save program</button>') +
      '<div class="pb-layout">' +
        '<div class="pb-main">' + metaHtml(draft, isNew) +
          ui.card({ title: 'Plan', subtitle: 'Tap a day to select it, then use the library\'s Add buttons — or drag. Empty weeks repeat week 1.', body: gridHtml(draft) }) +
        '</div>' +
        '<div class="pb-rail">' + railHtml() + '</div>' +
      '</div>';

    // ---- meta wiring (writes straight into the draft; no re-render needed) ----
    function bind(name, fn) {
      const el = root.querySelector('[name="' + name + '"]');
      if (el) el.addEventListener('input', function () { fn(el.value); });
      return el;
    }
    bind('pb-name', function (v) { draft.name = v; });
    bind('pb-type', function (v) { draft.type = v; });
    bind('pb-desc', function (v) { draft.description = v; });
    bind('pb-agegate', function (v) { draft.ageGateMin = v === '' ? null : Number(v); });
    // weeks / daysPerWeek reshape the grid -> re-render on change (not per keypress).
    ['pb-weeks', 'pb-dpw'].forEach(function (n) {
      const el = root.querySelector('[name="' + n + '"]');
      if (el) el.addEventListener('change', function () {
        const v = Math.max(1, Math.min(n === 'pb-weeks' ? 16 : 7, Math.round(Number(el.value) || 1)));
        if (n === 'pb-weeks') draft.weeks = v; else draft.daysPerWeek = v;
        state.selW = Math.min(state.selW, draft.weeks - 1);
        state.selD = Math.min(state.selD, draft.daysPerWeek - 1);
        CT.router.route();
      });
    });

    // Template starter (new mode) — seeds the draft, never auto-stores.
    const applyTpl = root.querySelector('#pb-apply-tpl');
    if (applyTpl) applyTpl.addEventListener('click', function () {
      const sel = root.querySelector('[name="pb-template"]');
      const tpl = sel && sel.value ? programs.byTemplateId(sel.value) : null;
      if (!tpl) { ui.toast('Pick a template first.'); return; }
      state.draft = model.Program(programs.toProgram(tpl));
      state.draft.daysPerWeek = Math.max(1, state.draft.daysPerWeek || 1); // builder plans need ≥1 day
      state.selW = 0; state.selD = 0;
      ui.toast('Template loaded — tweak and save');
      CT.router.route();
    });

    // ---- day selection + steps + items ----
    root.querySelectorAll('[data-act="sel-day"]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.selW = Number(b.getAttribute('data-w'));
        state.selD = Number(b.getAttribute('data-d'));
        CT.router.route();
      });
    });
    root.querySelectorAll('[data-act="rail-add"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const day = ensureDay(draft, state.selW, state.selD);
        day.items.push(newDrillItem(b.getAttribute('data-drill')));
        ui.toast('Added to week ' + (state.selW + 1) + ', day ' + (state.selD + 1));
        CT.router.route();
      });
    });
    root.querySelectorAll('.pb-step-add').forEach(function (inp) {
      function add() {
        const text = inp.value.trim();
        if (!text) return;
        const w = Number(inp.getAttribute('data-w')), d = Number(inp.getAttribute('data-d'));
        ensureDay(draft, w, d).items.push(newStepItem(text));
        inp.value = '';
        CT.router.route();
      }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      inp.addEventListener('blur', add);
    });
    root.querySelectorAll('[data-act="rm-item"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const hit = findItem(draft, b.getAttribute('data-item'));
        if (hit) { hit.day.items.splice(hit.index, 1); CT.router.route(); }
      });
    });
    root.querySelectorAll('[data-sets],[data-reps]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const id = inp.getAttribute('data-sets') || inp.getAttribute('data-reps');
        const hit = findItem(draft, id);
        if (!hit) return;
        const v = inp.value === '' ? null : Math.max(1, Math.round(Number(inp.value)));
        if (inp.hasAttribute('data-sets')) hit.item.sets = v; else hit.item.reps = v;
      });
    });
    const copyBtn = root.querySelector('[data-act="copy-week"]');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      const perWeek = Math.max(1, draft.daysPerWeek || 1);
      for (let w = 1; w < draft.weeks; w++) {
        for (let d = 0; d < perWeek; d++) {
          const src = getDay(draft, 0, d);
          const dst = ensureDay(draft, w, d);
          dst.items = (src && src.items ? src.items : []).map(function (it) {
            return Object.assign({}, it, { id: CT.uid('pi') });
          });
        }
      }
      ui.toast('Week 1 copied to all weeks');
      CT.router.route();
    });

    // ---- save / discard ----
    root.querySelector('#pb-save').addEventListener('click', function () { save(draft, isNew, navigate); });
    root.querySelector('#pb-discard').addEventListener('click', function () {
      ui.confirmDialog('Discard changes', 'Throw away this draft? The stored program is untouched.', 'Discard',
        function () { resetDraft(); navigate('#/programs'); });
    });

    wireDrag(root, draft);
  }

  window.CT.views = window.CT.views || {};
  window.CT.views.programBuilder = { label: 'Program Builder', render: render, resetDraft: resetDraft };
})();

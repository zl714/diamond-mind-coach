/* views/drill-library.js — DRILL LIBRARY CRUD (child of the Programs view).
   The library is the raw material the Program Builder drags from: each drill is
   {name, category hitting|throwing|fielding|speed|strength, description,
   videoUrl, equipment[]}. Grouped by category with add/edit/delete; deleting
   warns when programs still reference the drill (their items keep the id and
   render "Removed drill"). Ad-hoc sessions pick from this same library via the
   shared Log-Session modal. Exposed on CT.views.drillLibrary (hosted by
   programs.js at #/programs/drills — not a nav destination itself). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, esc = CT.escapeHtml;

  // How many stored programs reference this drill (for delete warnings).
  function usageCount(drillId) {
    let n = 0;
    store.all('programs').forEach(function (p) {
      (p.days || []).forEach(function (day) {
        (day.items || []).forEach(function (it) { if (it.kind === 'drill' && it.drillId === drillId) n++; });
      });
    });
    return n;
  }

  function parseEquipment(text) {
    return String(text || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function openDrillForm(existing, onDone) {
    const d = existing || {};
    const catOptions = model.DRILL_CATEGORIES.map(function (c) {
      return { value: c, label: model.DRILL_CATEGORY_LABELS[c] || c };
    });
    const html =
      ui.formField({ type: 'text', name: 'name', label: 'Drill name', value: d.name, required: true, placeholder: 'e.g. Tee Work — top hand' }) +
      ui.formField({ type: 'select', name: 'category', label: 'Category', value: d.category || 'hitting', options: catOptions }) +
      ui.formField({ type: 'textarea', name: 'description', label: 'Description', value: d.description, placeholder: 'Cues, set/rep scheme, focus…' }) +
      '<div class="field-row">' +
        ui.formField({ type: 'text', name: 'videoUrl', label: 'Video URL', value: d.videoUrl || '', placeholder: 'https://…' }) +
        ui.formField({ type: 'text', name: 'equipment', label: 'Equipment (comma-separated)', value: (d.equipment || []).join(', '), placeholder: 'tee, L-screen' }) +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save">' + (existing ? 'Save changes' : 'Add drill') + '</button>' +
      '</div>';

    ui.openModal(existing ? 'Edit drill' : 'New drill', html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const get = function (n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
        const url = get('videoUrl');
        if (url && !/^https?:\/\//i.test(url)) { ui.toast('Video URL must start with http(s)://'); return; }
        const data = {
          name: get('name'), category: get('category'), description: get('description'),
          videoUrl: url || null, equipment: parseEquipment(get('equipment'))
        };
        if (!data.name) { ui.toast('Drill name is required.'); return; }
        if (existing) store.update('drills', d.id, data); else store.insert('drills', data);
        close();
        ui.toast(existing ? 'Drill updated' : 'Drill added');
        if (typeof onDone === 'function') onDone(); else CT.router.route();
      });
    });
  }

  function drillRow(d) {
    const equip = (d.equipment || []).map(function (e) {
      return '<span class="pill" style="' + ui.toneStyle('neutral') + '">' + esc(e) + '</span>';
    }).join(' ');
    const video = d.videoUrl
      ? '<a class="btn btn-ghost btn-sm" href="' + esc(d.videoUrl) + '" target="_blank" rel="noopener" aria-label="Watch video for ' + esc(d.name) + '"><i data-lucide="play-circle"></i></a>'
      : '';
    return '<div class="drill-row" data-id="' + esc(d.id) + '" role="listitem">' +
      '<div class="drill-main">' +
        '<div class="drill-name">' + esc(d.name) + '</div>' +
        (d.description ? '<div class="drill-sub muted">' + esc(d.description) + '</div>' : '') +
        (equip ? '<div class="pill-row" style="margin-top:var(--sp-1);">' + equip + '</div>' : '') +
      '</div>' +
      '<div class="drill-acts">' +
        video +
        '<button class="btn btn-ghost btn-sm" data-act="edit-drill" data-id="' + esc(d.id) + '" aria-label="Edit ' + esc(d.name) + '"><i data-lucide="pencil"></i></button>' +
        '<button class="btn btn-ghost btn-sm" data-act="del-drill" data-id="' + esc(d.id) + '" aria-label="Delete ' + esc(d.name) + '"><i data-lucide="trash-2"></i></button>' +
      '</div>' +
    '</div>';
  }

  function render(root, ctx) {
    const all = store.drillLibrary();

    let html = ui.card({
      title: 'Drill library',
      subtitle: all.length + ' drill' + (all.length === 1 ? '' : 's') + ' · the building blocks programs and sessions are made of',
      actions: '<button class="btn btn-primary btn-sm" id="add-drill"><i data-lucide="plus"></i>New drill</button>',
      body: all.length
        ? model.DRILL_CATEGORIES.map(function (cat) {
            const rows = all.filter(function (d) { return d.category === cat; });
            if (!rows.length) return '';
            return '<div class="lib-group">' +
              '<div class="lib-cat">' + esc(model.DRILL_CATEGORY_LABELS[cat] || cat) + ' <span class="num">' + rows.length + '</span></div>' +
              '<div class="drill-lib-list" role="list">' + rows.map(drillRow).join('') + '</div>' +
            '</div>';
          }).join('')
        : ui.emptyState('dumbbell', 'No drills yet',
            'Add your go-to drills once — then drag them into programs and check them off in sessions.',
            '<button class="btn btn-primary" id="add-drill-empty"><i data-lucide="plus"></i>Add your first drill</button>')
    });

    root.innerHTML = html;

    ['#add-drill', '#add-drill-empty'].forEach(function (sel) {
      const b = root.querySelector(sel);
      if (b) b.addEventListener('click', function () { openDrillForm(null); });
    });
    root.querySelectorAll('[data-act="edit-drill"]').forEach(function (b) {
      b.addEventListener('click', function () { openDrillForm(store.getDrill(b.getAttribute('data-id'))); });
    });
    root.querySelectorAll('[data-act="del-drill"]').forEach(function (b) {
      b.addEventListener('click', function () {
        const d = store.getDrill(b.getAttribute('data-id'));
        if (!d) return;
        const used = usageCount(d.id);
        const warn = used
          ? ' It appears in ' + used + ' program step' + (used === 1 ? '' : 's') + ', which will show "Removed drill".'
          : ' Logged sessions keep their history.';
        ui.confirmDialog('Delete drill', 'Delete "' + d.name + '" from the library?' + warn,
          'Delete', function () { store.remove('drills', d.id); ui.toast('Drill deleted'); CT.router.route(); });
      });
    });
  }

  window.CT.views = window.CT.views || {};
  window.CT.views.drillLibrary = { label: 'Drill Library', render: render, openDrillForm: openDrillForm };
})();

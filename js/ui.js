/* ui.js — shared UI helpers so every view looks consistent: modal, toast,
   confirm, and small HTML builders (card, formField, pill, badge, statTile,
   emptyState, section). Builders return HTML STRINGS (views inject + then wire
   up events). All user text is escaped. Exposed on window.CT.ui. */
(function () {
  'use strict';

  const CT = window.CT;
  const esc = CT.escapeHtml;

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  function toast(message) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    root.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    }, 2400);
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function openModal(title, contentHtml, onMount) {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="modal-head">' +
        '<h2>' + esc(title) + '</h2>' +
        '<button class="modal-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="modal-body">' + contentHtml + '</div>';
    overlay.appendChild(modal);
    root.appendChild(overlay);

    function close() { root.innerHTML = ''; document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    modal.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    if (typeof onMount === 'function') onMount(modal, close);
    return { close: close, modal: modal };
  }

  function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

  function confirmDialog(title, message, confirmLabel, onConfirm) {
    openModal(title,
      '<p>' + esc(message) + '</p>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-danger" data-act="ok">' + esc(confirmLabel) + '</button>' +
      '</div>',
      function (modal, close) {
        modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
        modal.querySelector('[data-act="ok"]').addEventListener('click', function () { close(); onConfirm(); });
      });
  }

  // ---------------------------------------------------------------------------
  // HTML builders (return strings)
  // ---------------------------------------------------------------------------
  // card({ title, subtitle, body, actions, clickable }) -> string
  function card(opts) {
    opts = opts || {};
    const cls = 'card' + (opts.clickable ? ' clickable' : '') + (opts.className ? ' ' + opts.className : '');
    const attrs = opts.attrs || '';
    let html = '<div class="' + cls + '"' + (attrs ? ' ' + attrs : '') + '>';
    if (opts.title || opts.subtitle || opts.actions) {
      html += '<div class="card-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">';
      html += '<div>';
      if (opts.title) html += '<h3 style="margin:0;">' + (opts.rawTitle ? opts.title : esc(opts.title)) + '</h3>';
      if (opts.subtitle) html += '<div class="muted" style="font-size:.85rem;">' + (opts.rawSubtitle ? opts.subtitle : esc(opts.subtitle)) + '</div>';
      html += '</div>';
      if (opts.actions) html += '<div class="card-actions" style="display:flex;gap:.4rem;flex-shrink:0;">' + opts.actions + '</div>';
      html += '</div>';
    }
    if (opts.body) html += '<div class="card-body"' + (opts.title ? ' style="margin-top:.6rem;"' : '') + '>' + opts.body + '</div>';
    html += '</div>';
    return html;
  }

  // formField({ type, name, label, value, options, placeholder, help, min, max, step, required })
  function formField(o) {
    o = o || {};
    const id = 'f_' + (o.name || CT.uid('x'));
    const label = o.label ? '<label for="' + id + '">' + esc(o.label) + (o.required ? ' *' : '') + '</label>' : '';
    const help = o.help ? '<div class="help">' + esc(o.help) + '</div>' : '';
    let control = '';
    const common = 'id="' + id + '" name="' + esc(o.name || '') + '"' + (o.required ? ' required' : '');
    if (o.type === 'select') {
      const opts = (o.options || []).map(function (opt) {
        const val = (typeof opt === 'object') ? opt.value : opt;
        const lab = (typeof opt === 'object') ? opt.label : opt;
        const sel = String(val) === String(o.value) ? ' selected' : '';
        return '<option value="' + esc(val) + '"' + sel + '>' + esc(lab) + '</option>';
      }).join('');
      control = '<select class="select" ' + common + '>' + opts + '</select>';
    } else if (o.type === 'textarea') {
      control = '<textarea class="textarea" ' + common + ' placeholder="' + esc(o.placeholder || '') + '">' + esc(o.value == null ? '' : o.value) + '</textarea>';
    } else if (o.type === 'checkbox') {
      const ck = o.value ? ' checked' : '';
      return '<div class="field field-check" style="display:flex;align-items:center;gap:.5rem;">' +
        '<input type="checkbox" ' + common + ck + ' style="width:20px;height:20px;min-height:0;" />' +
        '<label for="' + id + '" style="margin:0;">' + esc(o.label || '') + '</label>' + help + '</div>';
    } else {
      const num = (o.type === 'number') ?
        (' inputmode="decimal"' + (o.min != null ? ' min="' + o.min + '"' : '') + (o.max != null ? ' max="' + o.max + '"' : '') + (o.step != null ? ' step="' + o.step + '"' : '')) : '';
      control = '<input class="input" type="' + esc(o.type || 'text') + '" ' + common + num +
        ' value="' + esc(o.value == null ? '' : o.value) + '" placeholder="' + esc(o.placeholder || '') + '" />';
    }
    return '<div class="field">' + label + control + help + '</div>';
  }

  function pill(text, tone) {
    const style = tone ? ' style="' + toneStyle(tone) + '"' : '';
    return '<span class="pill"' + style + '>' + esc(text) + '</span>';
  }

  function badge(text, tone) {
    return '<span class="badge" style="' + toneStyle(tone) + ';border-radius:9999px;padding:2px 8px;font-size:12px;font-weight:600;border:1px solid;">' + esc(text) + '</span>';
  }

  // tone -> bg/color/border CSS, built on the light design-system semantic
  // quads (text / soft fill / border per tone). 'green'/'up' = positive axis,
  // 'red'/'down' = negative axis, 'yellow'/'warn', 'accent'/'cyan' = brand,
  // 'seam' = danger highlight, else neutral ink-alpha.
  function toneStyle(tone) {
    switch (tone) {
      case 'green':
      case 'up':
        return 'background:var(--up-soft);color:var(--up);border-color:var(--up-border);';
      case 'red':
      case 'down':
        return 'background:var(--down-soft);color:var(--down);border-color:var(--down-border);';
      case 'yellow':
      case 'warn':
        return 'background:var(--warn-soft);color:var(--warn);border-color:var(--warn-border);';
      case 'accent':
      case 'cyan':
        return 'background:var(--accent-soft);color:var(--accent-700,#0072A8);border-color:#B3E7FB;';
      case 'seam':
        return 'background:var(--seam-soft,#FEF3F2);color:var(--seam,#DC2626);border-color:#FECDCA;';
      default:
        return 'background:rgba(15,23,42,0.05);color:var(--text-secondary);border-color:var(--border);';
    }
  }

  // diamondMeter(pct, opts?) — the app-wide percentile capsule: a --track
  // capsule filled with the Savant gradient up to `pct`, capped by a 45deg
  // square "diamond" thumb in the percentile's Savant color (2px white ring).
  // The gradient is background-sized to the FULL track so the visible fill's
  // colors always match the percentile position. opts: { small, label }.
  function diamondMeter(pct, opts) {
    opts = opts || {};
    const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    const color = (CT.charts && CT.charts.savantColor) ? CT.charts.savantColor(p) : 'var(--pct-mid)';
    const cls = 'dm-meter' + (opts.small ? ' dm-meter-sm' : '');
    const gradSize = p > 0 ? (10000 / p) : 100; // fill spans p%; gradient spans track
    const aria = opts.label ? esc(opts.label) : (p + 'th percentile');
    return '<span class="' + cls + '" role="img" aria-label="' + aria + '">' +
      '<span class="dm-meter-fill" style="width:' + p + '%;background-size:' + gradSize + '% 100%;"></span>' +
      '<span class="dm-meter-thumb" style="left:' + p + '%;background:' + color + ';"></span>' +
    '</span>';
  }

  function statTile(num, label) {
    return '<div class="stat"><div class="num">' + esc(num) + '</div><div class="label">' + esc(label) + '</div></div>';
  }

  // emptyState(icon, title, message?, actionHtml?). `icon` is a Lucide icon NAME
  // (e.g. 'users', 'inbox'); the router repaints icons after render. Non-name
  // values fall back to 'inbox' (no emoji as functional icons, per design system).
  function emptyState(icon, title, message, actionHtml) {
    const name = (icon && /^[a-z][a-z0-9-]*$/.test(icon)) ? icon : 'inbox';
    return '<div class="empty">' +
      '<div class="big"><i data-lucide="' + name + '"></i></div>' +
      '<h3>' + esc(title || 'Nothing here yet') + '</h3>' +
      (message ? '<p>' + esc(message) + '</p>' : '') +
      (actionHtml || '') + '</div>';
  }

  // section({ title, subtitle, actions }) -> page header block
  function pageHead(title, subtitle, actionsHtml) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' +
      (subtitle ? '<p class="subtitle">' + esc(subtitle) + '</p>' : '') + '</div>' +
      (actionsHtml ? '<div class="row">' + actionsHtml + '</div>' : '') + '</div>';
  }

  window.CT.ui = {
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    card: card,
    formField: formField,
    pill: pill,
    badge: badge,
    toneStyle: toneStyle,
    diamondMeter: diamondMeter,
    statTile: statTile,
    emptyState: emptyState,
    pageHead: pageHead,
    esc: esc
  };
})();

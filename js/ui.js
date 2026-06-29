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
    return '<span class="badge" style="' + toneStyle(tone) + ';border-radius:14px;padding:.15rem .55rem;font-size:.72rem;font-weight:700;border:1px solid;">' + esc(text) + '</span>';
  }

  // tone: 'green'|'yellow'|'red'|'neutral' -> bg/color/border CSS
  function toneStyle(tone) {
    switch (tone) {
      case 'green': return 'background:rgba(127,255,0,0.15);color:#7FFF00;border-color:rgba(127,255,0,0.4);';
      case 'red': return 'background:rgba(255,107,107,0.15);color:#ff6b6b;border-color:rgba(255,107,107,0.45);';
      case 'yellow': return 'background:rgba(255,205,80,0.16);color:#ffcd50;border-color:rgba(255,205,80,0.45);';
      default: return 'background:rgba(127,255,0,0.10);color:#b8e6b8;border-color:rgba(127,255,0,0.25);';
    }
  }

  function statTile(num, label) {
    return '<div class="stat"><div class="num">' + esc(num) + '</div><div class="label">' + esc(label) + '</div></div>';
  }

  function emptyState(icon, title, message, actionHtml) {
    return '<div class="empty">' +
      '<div class="big">' + (icon || '⚾') + '</div>' +
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
    statTile: statTile,
    emptyState: emptyState,
    pageHead: pageHead,
    esc: esc
  };
})();

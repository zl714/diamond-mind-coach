/* ui.js — shared UI helpers: modal, toast, small DOM builders. */
(function () {
  'use strict';

  const CT = window.CT;

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
    }, 2200);
  }

  // Open a modal. `contentHtml` is innerHTML for the body; `onMount` gets the modal element.
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
        '<h2>' + CT.escapeHtml(title) + '</h2>' +
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

  function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
  }

  // Lightweight confirm dialog (returns nothing; uses callbacks).
  function confirmDialog(title, message, confirmLabel, onConfirm) {
    openModal(title,
      '<p>' + CT.escapeHtml(message) + '</p>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-danger" data-act="ok">' + CT.escapeHtml(confirmLabel) + '</button>' +
      '</div>',
      function (modal, close) {
        modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
        modal.querySelector('[data-act="ok"]').addEventListener('click', function () {
          close();
          onConfirm();
        });
      });
  }

  window.CT.ui = {
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog
  };
})();

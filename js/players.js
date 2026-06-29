/* players.js — add/edit/delete player forms (modal-based). */
(function () {
  'use strict';

  const CT = window.CT;

  function positionOptions(selected) {
    return CT.POSITIONS.map(function (pos) {
      const sel = pos === selected ? ' selected' : '';
      return '<option value="' + CT.escapeHtml(pos) + '"' + sel + '>' + CT.escapeHtml(pos) + '</option>';
    }).join('');
  }

  function playerFormHtml(player) {
    const p = player || { name: '', level: '', position: '', notes: '' };
    return '' +
      '<form id="player-form">' +
        '<div class="field">' +
          '<label for="pf-name">Name *</label>' +
          '<input class="input" id="pf-name" name="name" required maxlength="80" ' +
            'value="' + CT.escapeHtml(p.name) + '" placeholder="Player name" />' +
        '</div>' +
        '<div class="field-row">' +
          '<div class="field">' +
            '<label for="pf-level">Age / level</label>' +
            '<input class="input" id="pf-level" name="level" maxlength="40" ' +
              'value="' + CT.escapeHtml(p.level) + '" placeholder="e.g. 14U Travel" />' +
          '</div>' +
          '<div class="field">' +
            '<label for="pf-position">Primary position</label>' +
            '<select class="select" id="pf-position" name="position">' +
              '<option value="">Select…</option>' +
              positionOptions(p.position) +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label for="pf-notes">Notes</label>' +
          '<textarea class="textarea" id="pf-notes" name="notes" maxlength="600" ' +
            'placeholder="Goals, what to work on, parent contact, etc.">' + CT.escapeHtml(p.notes) + '</textarea>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-act="cancel">Cancel</button>' +
          '<button type="submit" class="btn btn-primary">' + (player ? 'Save changes' : 'Add player') + '</button>' +
        '</div>' +
      '</form>';
  }

  function openPlayerForm(player, onSaved) {
    const title = player ? 'Edit player' : 'Add player';
    CT.ui.openModal(title, playerFormHtml(player), function (modal, close) {
      const form = modal.querySelector('#player-form');
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const name = form.name.value.trim();
        if (!name) { CT.ui.toast('Name is required'); form.name.focus(); return; }
        const data = {
          name: name,
          level: form.level.value.trim(),
          position: form.position.value,
          notes: form.notes.value.trim()
        };
        let saved;
        if (player) {
          saved = CT.store.updatePlayer(player.id, data);
          CT.ui.toast('Player updated');
        } else {
          saved = CT.store.addPlayer(data);
          CT.ui.toast('Player added');
        }
        close();
        if (typeof onSaved === 'function') onSaved(saved);
      });
    });
  }

  function confirmDeletePlayer(player, onDeleted) {
    CT.ui.confirmDialog(
      'Delete player?',
      'This permanently removes ' + player.name + ' and all ' + player.sessions.length + ' session(s). This cannot be undone.',
      'Delete',
      function () {
        CT.store.deletePlayer(player.id);
        CT.ui.toast('Player deleted');
        if (typeof onDeleted === 'function') onDeleted();
      });
  }

  window.CT.players = {
    openPlayerForm: openPlayerForm,
    confirmDeletePlayer: confirmDeletePlayer
  };
})();

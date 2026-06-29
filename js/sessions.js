/* sessions.js — log / edit / delete a coaching session (modal form). */
(function () {
  'use strict';

  const CT = window.CT;

  function focusOptions(selected) {
    return CT.FOCUS_AREAS.map(function (f) {
      const sel = f === selected ? ' selected' : '';
      return '<option value="' + CT.escapeHtml(f) + '"' + sel + '>' + CT.escapeHtml(f) + '</option>';
    }).join('');
  }

  // Renders a numeric metric field. Value is optional (blank = not recorded).
  function metricField(metric, value) {
    const v = (value === 0 || value) ? value : '';
    return '' +
      '<div class="field">' +
        '<label for="mf-' + metric.key + '">' + CT.escapeHtml(metric.label) +
          ' <span class="muted">(' + CT.escapeHtml(metric.unit) + ')</span></label>' +
        '<input class="input" id="mf-' + metric.key + '" type="number" inputmode="decimal" ' +
          'data-metric="' + metric.key + '" ' +
          'min="' + metric.min + '" max="' + metric.max + '" step="' + metric.step + '" ' +
          'value="' + CT.escapeHtml(v) + '" placeholder="optional" />' +
      '</div>';
  }

  function sessionFormHtml(session) {
    const s = session || { date: CT.todayISO(), focus: 'Hitting', drills: '', notes: '', metrics: {} };
    const metricsHtml = CT.METRICS.map(function (m) {
      return metricField(m, s.metrics ? s.metrics[m.key] : undefined);
    }).join('');

    return '' +
      '<form id="session-form">' +
        '<div class="field-row">' +
          '<div class="field">' +
            '<label for="sf-date">Date</label>' +
            '<input class="input" id="sf-date" name="date" type="date" value="' + CT.escapeHtml(s.date) + '" required />' +
          '</div>' +
          '<div class="field">' +
            '<label for="sf-focus">Focus area</label>' +
            '<select class="select" id="sf-focus" name="focus">' + focusOptions(s.focus) + '</select>' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label for="sf-drills">Drills done</label>' +
          '<input class="input" id="sf-drills" name="drills" maxlength="200" ' +
            'value="' + CT.escapeHtml(s.drills) + '" placeholder="e.g. Tee work, soft toss" />' +
        '</div>' +
        '<h3 style="margin-top:0.5rem">Metrics <span class="muted" style="font-weight:400;font-size:0.85rem">(all optional)</span></h3>' +
        '<div class="field-row">' + metricsHtml + '</div>' +
        '<div class="field">' +
          '<label for="sf-notes">Session notes</label>' +
          '<textarea class="textarea" id="sf-notes" name="notes" maxlength="600" ' +
            'placeholder="What happened, what to work on next">' + CT.escapeHtml(s.notes) + '</textarea>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button type="button" class="btn btn-ghost" data-act="cancel">Cancel</button>' +
          '<button type="submit" class="btn btn-primary">' + (session ? 'Save session' : 'Log session') + '</button>' +
        '</div>' +
      '</form>';
  }

  function collectMetrics(form) {
    const metrics = {};
    const inputs = form.querySelectorAll('[data-metric]');
    inputs.forEach(function (input) {
      const key = input.getAttribute('data-metric');
      const raw = input.value.trim();
      if (raw === '') return; // blank = not recorded
      const meta = CT.METRIC_BY_KEY[key];
      const val = CT.clampNumber(raw, meta.min, meta.max);
      if (val !== null) metrics[key] = val;
    });
    return metrics;
  }

  function openSessionForm(playerId, session, onSaved) {
    const title = session ? 'Edit session' : 'Log session';
    CT.ui.openModal(title, sessionFormHtml(session), function (modal, close) {
      const form = modal.querySelector('#session-form');
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const data = {
          date: form.date.value || CT.todayISO(),
          focus: form.focus.value,
          drills: form.drills.value.trim(),
          notes: form.notes.value.trim(),
          metrics: collectMetrics(form)
        };
        if (session) {
          CT.store.updateSession(playerId, session.id, data);
          CT.ui.toast('Session updated');
        } else {
          CT.store.addSession(playerId, data);
          CT.ui.toast('Session logged');
        }
        close();
        if (typeof onSaved === 'function') onSaved();
      });
    });
  }

  function confirmDeleteSession(playerId, session, onDeleted) {
    CT.ui.confirmDialog(
      'Delete session?',
      'Remove the ' + CT.formatDate(session.date) + ' (' + session.focus + ') session? This cannot be undone.',
      'Delete',
      function () {
        CT.store.deleteSession(playerId, session.id);
        CT.ui.toast('Session deleted');
        if (typeof onDeleted === 'function') onDeleted();
      });
  }

  window.CT.sessions = {
    openSessionForm: openSessionForm,
    confirmDeleteSession: confirmDeleteSession
  };
})();

/* constants.js — shared app constants and small helpers.
   Exposed on window.CT (Coach Tracker namespace) so other files can use them. */
(function () {
  'use strict';

  // NOTE (v3): the legacy v1 exports that used to live here (STORAGE_KEY
  // 'coachTracker.v1', SCHEMA_VERSION 1, METRICS, METRIC_BY_KEY, POSITIONS,
  // FOCUS_AREAS) were deleted — they shadowed the real CT.model catalog and
  // nothing referenced them. Storage keys/versions live in store.js; the metric
  // catalog and positions enum live in model.js.

  // ---- tiny utilities ----
  function uid(prefix) {
    return (prefix || 'id') + '_' +
      Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function formatDate(iso) {
    if (!iso) return '';
    // Parse as local date to avoid off-by-one from UTC.
    const parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function daysAgo(iso) {
    if (!iso) return null;
    const parts = String(iso).split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const now = new Date();
    const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate()) - d;
    return Math.round(ms / 86400000);
  }

  function relativeDate(iso) {
    const n = daysAgo(iso);
    if (n === null) return '';
    if (n <= 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 7) return n + ' days ago';
    if (n < 14) return 'last week';
    if (n < 60) return Math.round(n / 7) + ' weeks ago';
    return Math.round(n / 30) + ' months ago';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (w) { return w.charAt(0).toUpperCase(); })
      .join('');
  }

  // plural(3, 'session') -> '3 sessions'; plural(1, 'day') -> '1 day'.
  // Optional third arg supplies an irregular plural form.
  function plural(n, singular, pluralWord) {
    const num = Number(n) || 0;
    return num + ' ' + (num === 1 ? singular : (pluralWord || singular + 's'));
  }

  function clampNumber(val, min, max) {
    const n = Number(val);
    if (Number.isNaN(n)) return null;
    return Math.min(max, Math.max(min, n));
  }

  window.CT = Object.assign(window.CT || {}, {
    uid: uid,
    todayISO: todayISO,
    formatDate: formatDate,
    daysAgo: daysAgo,
    relativeDate: relativeDate,
    escapeHtml: escapeHtml,
    initials: initials,
    plural: plural,
    clampNumber: clampNumber
  });
})();

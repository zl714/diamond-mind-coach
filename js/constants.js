/* constants.js — shared app constants and small helpers.
   Exposed on window.CT (Coach Tracker namespace) so other files can use them. */
(function () {
  'use strict';

  const STORAGE_KEY = 'coachTracker.v1';
  const SCHEMA_VERSION = 1;

  // Session focus areas (per spec).
  const FOCUS_AREAS = ['Hitting', 'Pitching', 'Fielding', 'Baserunning'];

  // Baseball positions for the player form.
  const POSITIONS = [
    'Pitcher', 'Catcher', 'First Base', 'Second Base', 'Third Base',
    'Shortstop', 'Left Field', 'Center Field', 'Right Field',
    'Utility', 'Designated Hitter'
  ];

  // Metric catalog. Each metric has a key, label, unit, and sensible numeric range.
  // Coaches pick which metrics apply to a given session.
  const METRICS = [
    { key: 'skill', label: 'Skill rating', unit: '/10', min: 1, max: 10, step: 1 },
    { key: 'exitVelo', label: 'Exit velocity', unit: 'mph', min: 20, max: 120, step: 0.5 },
    { key: 'pitchVelo', label: 'Pitch velocity', unit: 'mph', min: 20, max: 110, step: 0.5 },
    { key: 'sprint', label: '60-yard dash', unit: 'sec', min: 5, max: 12, step: 0.01 }
  ];

  const METRIC_BY_KEY = METRICS.reduce(function (acc, m) { acc[m.key] = m; return acc; }, {});

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

  function clampNumber(val, min, max) {
    const n = Number(val);
    if (Number.isNaN(n)) return null;
    return Math.min(max, Math.max(min, n));
  }

  window.CT = Object.assign(window.CT || {}, {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    FOCUS_AREAS: FOCUS_AREAS,
    POSITIONS: POSITIONS,
    METRICS: METRICS,
    METRIC_BY_KEY: METRIC_BY_KEY,
    uid: uid,
    todayISO: todayISO,
    formatDate: formatDate,
    daysAgo: daysAgo,
    relativeDate: relativeDate,
    escapeHtml: escapeHtml,
    initials: initials,
    clampNumber: clampNumber
  });
})();

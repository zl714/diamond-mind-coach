/* programs-data.js — assignable PROGRAM TEMPLATES (the spec's training catalog).
   Each template is age-gated. Hard age gates (ageGateMin) block assignment below a
   minimum age — e.g. weighted-ball / pull-down work is blocked under 15.
   Templates auto-generate dated weekly sessions on assignment (see programs view).
   Exposed on window.CT.programs. Youth-safety framing is intentional and honest. */
(function () {
  'use strict';

  const CT = window.CT;
  const ALL = ['9-10U', '11-12U', '13-14U', '15-16U', '17-18U'];

  // category groups for filtering in the UI
  const CATEGORIES = ['arm-care', 'throwing', 'strength', 'hitting', 'mobility', 'speed', 'compliance', 'return-to-play'];

  const TEMPLATES = [
    {
      templateId: 'pitch-smart-overlay', name: 'Pitch Smart Compliance Overlay',
      category: 'compliance', ageBands: ALL.slice(), ageGateMin: null,
      weeks: 12, sessionsPerWeek: 0,
      description: 'Always-on guardrail layer: tracks pitch counts, required rest, the 3-consecutive-day rule, and the rolling 12-month innings cap. Not a workout — a safety overlay every pitcher carries.',
      checklist: ['Log every outing pitch count', 'Confirm rest before next outing', 'Watch 3-day rule', 'Track 12-mo innings'],
      clinicianRequired: false
    },
    {
      templateId: 'jbands-arm-care', name: 'Jaeger J-Bands Arm-Care',
      category: 'arm-care', ageBands: ALL.slice(), ageGateMin: null,
      weeks: 8, sessionsPerWeek: 5,
      description: 'Daily band-based arm-care routine. Use the J-Bands Jr. protocol and lighter resistance for youth. Pre-throwing activation + post-throwing recovery.',
      checklist: ['10 reverse throws', 'Internal/external rotation', 'Forearm series', 'Post-throw recovery band work'],
      clinicianRequired: false
    },
    {
      templateId: 'dynamic-warmup-ramp', name: 'Dynamic Warm-Up / RAMP',
      category: 'mobility', ageBands: ALL.slice(), ageGateMin: null,
      weeks: 8, sessionsPerWeek: 5,
      description: 'RAMP protocol (Raise, Activate, Mobilize, Potentiate). Replaces static stretching before activity. Same structure all ages, scaled intensity.',
      checklist: ['Raise: 3-5 min light cardio', 'Activate: glutes/core', 'Mobilize: hips/T-spine/shoulders', 'Potentiate: skips/strides'],
      clinicianRequired: false
    },
    {
      templateId: 'youth-long-toss', name: 'Youth Long-Toss Base (capped)',
      category: 'throwing', ageBands: ['11-12U', '13-14U'], ageGateMin: 11,
      weeks: 6, sessionsPerWeek: 3,
      description: 'Low-arc, distance-capped long toss to build arm health and strength. NO weighted balls and NO pull-downs at this age. Stop on any discomfort.',
      checklist: ['Stay within capped distance', 'Low-arc throws only', 'No weighted balls', 'No max-effort pull-downs', 'Stop on discomfort'],
      clinicianRequired: false
    },
    {
      templateId: 'hs-periodized-throwing', name: 'HS+ Periodized Throwing (Driveline-style)',
      category: 'throwing', ageBands: ['15-16U', '17-18U'], ageGateMin: 15,
      weeks: 10, sessionsPerWeek: 4,
      description: 'Periodized throwing with plyo-balls / weighted implements and structured intent days. AGE-GATED: hard-blocked under 15. Requires a qualified coach and an established arm-care base.',
      checklist: ['Plyo warm-up series', 'Intent/velo day', 'Recovery day', 'Arm-care attached', 'Workload logged to Pitch Smart'],
      clinicianRequired: false
    },
    {
      templateId: 'return-to-throw', name: 'Return-to-Throw (clinician-guided)',
      category: 'return-to-play', ageBands: ALL.slice(), ageGateMin: null,
      weeks: 8, sessionsPerWeek: 3,
      description: 'Progressive interval throwing program after injury or arm pain. CLINICIAN-REQUIRED: only run under medical/PT clearance and supervision.',
      checklist: ['Medical clearance obtained', 'Start at cleared distance/volume', 'Pain-free progression only', 'Report any setback immediately'],
      clinicianRequired: true
    },
    {
      templateId: 'hitting-development', name: 'Hitting Development (bat-sensor KPIs)',
      category: 'hitting', ageBands: ALL.slice(), ageGateMin: null,
      weeks: 8, sessionsPerWeek: 3,
      description: 'Constraint-led hitting blocks tracked against bat-sensor / EV KPIs. For youth, frame numbers as trend vs. self and emphasize barrel control over peak EV.',
      checklist: ['Tee progression', 'Front-toss / machine', 'Live BP', 'Log EV / bat speed (context-tagged)'],
      clinicianRequired: false
    },
    {
      templateId: 'youth-snc', name: 'Youth Strength & Conditioning (NSCA)',
      category: 'strength', ageBands: ['9-10U', '11-12U', '13-14U'], ageGateMin: null,
      weeks: 8, sessionsPerWeek: 2,
      description: 'NSCA youth guidelines: bodyweight, bands, med-ball. Technique-first, no maximal loading. Builds movement competency and coordination.',
      checklist: ['Movement prep', 'Bodyweight strength', 'Med-ball throws (light)', 'Coordination / balance'],
      clinicianRequired: false
    },
    {
      templateId: 'hs-periodized-snc', name: 'HS+ Periodized Strength & Conditioning',
      category: 'strength', ageBands: ['15-16U', '17-18U'], ageGateMin: 15,
      weeks: 12, sessionsPerWeek: 3,
      description: 'Periodized barbell/loaded strength once technique and maturity allow. Age-gated to 15+. Coordinate heavy days away from high-intent throwing.',
      checklist: ['Compound lifts', 'Posterior-chain emphasis', 'Power/med-ball', 'Recovery & sleep tracking'],
      clinicianRequired: false
    },
    {
      templateId: 'mobility-recovery', name: 'Mobility / Recovery',
      category: 'mobility', ageBands: ALL.slice(), ageGateMin: null,
      weeks: 8, sessionsPerWeek: 3,
      description: 'Hip, shoulder, and T-spine mobility plus recovery routines (breathing, soft-tissue). Supports throwing volume and reduces stiffness.',
      checklist: ['Shoulder/T-spine mobility', 'Hip mobility', 'Soft-tissue / foam roll', 'Breathing / downregulation'],
      clinicianRequired: false
    },
    {
      templateId: 'speed-ltad', name: 'Speed / LTAD',
      category: 'speed', ageBands: ALL.slice(), ageGateMin: null,
      weeks: 8, sessionsPerWeek: 2,
      description: 'Long-Term Athletic Development sprint mechanics, acceleration, and agility. Age-appropriate volumes; emphasizes movement quality before output.',
      checklist: ['Sprint mechanics drills', 'Acceleration (short)', 'Change-of-direction', 'Home-to-first / 60-yd timing'],
      clinicianRequired: false
    }
  ];

  function templates() { return TEMPLATES.map(function (t) { return Object.assign({}, t); }); }
  function byTemplateId(id) {
    const t = TEMPLATES.find(function (x) { return x.templateId === id; });
    return t ? Object.assign({}, t) : null;
  }

  // Eligibility check honoring hard age gates and allowed bands.
  // Returns { eligible, reason }.
  function eligibility(template, player) {
    if (!template) return { eligible: false, reason: 'Unknown program.' };
    const age = player ? CT.model.ageFromBirthdate(player.birthdate) : null;
    const band = player ? CT.model.bandFor(player) : null;
    if (template.ageGateMin != null && age != null && age < template.ageGateMin) {
      return { eligible: false, reason: 'Hard age gate: requires age ' + template.ageGateMin + '+ (player is ' + age + ').' };
    }
    if (band && template.ageBands && template.ageBands.indexOf(band) < 0) {
      return { eligible: false, reason: 'Not designed for ' + band + ' (bands: ' + template.ageBands.join(', ') + ').' };
    }
    if (template.clinicianRequired) {
      return { eligible: true, reason: 'Eligible — but clinician supervision is REQUIRED.' };
    }
    return { eligible: true, reason: 'Eligible.' };
  }

  // v2 template category -> v3 Program.type.
  const TYPE_MAP = {
    throwing: 'throwing', 'arm-care': 'throwing', 'return-to-play': 'throwing',
    hitting: 'hitting',
    strength: 'strength', mobility: 'strength', speed: 'strength',
    compliance: 'custom', general: 'custom'
  };

  // Convert a static template into a v3 Program shape (checklist -> step items,
  // sessionsPerWeek -> daysPerWeek). Programs are only stored at assignment time.
  function toProgram(template) {
    if (!template) return null;
    return {
      templateId: template.templateId,
      name: template.name,
      type: TYPE_MAP[template.category] || 'custom',
      description: template.description || '',
      weeks: Math.max(1, Number(template.weeks) || 1),
      daysPerWeek: Math.max(0, Number(template.sessionsPerWeek) || 0),
      days: [{
        weekIndex: 0, dayIndex: 0, title: 'Session',
        items: (template.checklist || []).map(function (text) { return { kind: 'step', text: String(text) }; })
      }],
      ageBands: (template.ageBands || []).slice(),
      ageGateMin: template.ageGateMin == null ? null : template.ageGateMin,
      clinicianRequired: !!template.clinicianRequired,
      archived: false
    };
  }

  // Schedule math (v3: sessions are NEVER pre-generated — adherence compares the
  // expected count from the program schedule to actual sessionLogs).
  function daysBetween(startISO, endISO) {
    const s = new Date(startISO + 'T00:00:00');
    const e = new Date(endISO + 'T00:00:00');
    return Math.floor((e - s) / 86400000);
  }

  // Last calendar day of an assignment (startDate + weeks*7 − 1). Null when
  // the schedule can't be derived.
  function endDateFor(program, assignment) {
    if (!program || !assignment || !assignment.startDate) return null;
    const weeks = Math.max(1, Number(program.weeks) || 1);
    const d = new Date(assignment.startDate + 'T00:00:00');
    d.setDate(d.getDate() + weeks * 7 - 1);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  // An assignment whose program block is fully over — Today rows and adherence
  // alerts must ignore these (and the app auto-completes them at boot).
  function isEnded(program, assignment, asOf) {
    const end = endDateFor(program, assignment);
    return !!end && (asOf || CT.todayISO()) > end;
  }

  // Sessions DUE for an assignment as of `asOf` (inclusive of the start day).
  // Honors assignment.daysOfWeek when set (a Mon/Wed/Fri program created on a
  // Saturday owes nothing until Monday); otherwise pro-rates by calendar days.
  // Either way the count is clamped to the program's own length.
  function expectedSessions(program, assignment, asOf) {
    if (!program || !assignment) return 0;
    const perWeek = Math.max(0, Number(program.daysPerWeek) || 0);
    const weeks = Math.max(1, Number(program.weeks) || 1);
    if (perWeek === 0) return 0; // overlay-style: no scheduled sessions
    const startISO = assignment.startDate || CT.todayISO();
    const elapsed = daysBetween(startISO, asOf || CT.todayISO());
    if (elapsed < 0) return 0;
    const lastDay = Math.min(elapsed, weeks * 7 - 1); // never accrue past the block
    const dows = (assignment.daysOfWeek && assignment.daysOfWeek.length) ? assignment.daysOfWeek : null;
    if (dows) {
      const startDow = new Date(startISO + 'T00:00:00').getDay();
      let due = 0;
      for (let i = 0; i <= lastDay; i++) {
        if (dows.indexOf((startDow + i) % 7) >= 0) due++;
      }
      return Math.min(weeks * perWeek, due);
    }
    const due = Math.ceil(((lastDay + 1) * perWeek) / 7);
    return Math.min(weeks * perWeek, due);
  }

  // Adherence for one assignment: { done, due, pct|null }. `logs` = that
  // assignment's sessionLogs (deduped per day so double-logging can't inflate).
  function adherenceFor(program, assignment, logs, asOf) {
    const due = expectedSessions(program, assignment, asOf);
    const seen = {};
    (logs || []).forEach(function (l) { seen[l.date] = true; });
    const done = Math.min(Object.keys(seen).length, due || Object.keys(seen).length);
    return { done: done, due: due, pct: due ? Math.round((done / due) * 100) : null };
  }

  // Which week of the program an assignment is in as of `asOf` (0-based, clamped).
  function weekIndexFor(assignment, program, asOf) {
    if (!program || !program.weeks) return 0;
    const start = new Date((assignment && assignment.startDate ? assignment.startDate : CT.todayISO()) + 'T00:00:00');
    const now = new Date((asOf || CT.todayISO()) + 'T00:00:00');
    const diffDays = Math.floor((now - start) / 86400000);
    return Math.max(0, Math.min(program.weeks - 1, Math.floor(diffDays / 7)));
  }

  // Resolve the day plan for (weekIndex, dayIndex). Weeks left empty in the
  // builder fall back to week 1's pattern, then to the program's first day —
  // so a coach who fills only week 1 still gets a plan every week.
  function dayFor(program, weekIndex, dayIndex) {
    if (!program || !Array.isArray(program.days) || !program.days.length) return null;
    const days = program.days;
    let hit = days.find(function (d) { return d.weekIndex === weekIndex && d.dayIndex === dayIndex; });
    if (hit && hit.items && hit.items.length) return hit;
    hit = days.find(function (d) { return d.weekIndex === 0 && d.dayIndex === dayIndex; });
    if (hit && hit.items && hit.items.length) return hit;
    return days[0] || null;
  }

  window.CT.programs = {
    CATEGORIES: CATEGORIES,
    templates: templates,
    byTemplateId: byTemplateId,
    eligibility: eligibility,
    toProgram: toProgram,
    endDateFor: endDateFor,
    isEnded: isEnded,
    expectedSessions: expectedSessions,
    adherenceFor: adherenceFor,
    weekIndexFor: weekIndexFor,
    dayFor: dayFor
  };
})();

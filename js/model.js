/* model.js — data model: entity factories, normalizers, age-band logic, validation.
   Pure functions only: every factory RETURNS a NEW object, never mutates input.
   Exposed on window.CT.model. The store (store.js) persists these shapes. */
(function () {
  'use strict';

  const CT = window.CT;

  // ---------------------------------------------------------------------------
  // Age bands & levels
  // ---------------------------------------------------------------------------
  const AGE_BANDS = ['9-10U', '11-12U', '13-14U', '15-16U', '17-18U'];
  const LEVELS = ['youth', 'HS', 'college', 'pro'];

  // Innings-per-game by competitive level (used to scale ERA, K/9, BB/9).
  const INNINGS_PER_GAME = { youth: 6, HS: 7, college: 9, pro: 9 };

  // Compute integer age (years) from an ISO birthdate as of `asOf` (default today).
  function ageFromBirthdate(birthdateISO, asOf) {
    if (!birthdateISO) return null;
    const parts = String(birthdateISO).split('-');
    if (parts.length !== 3) return null;
    const b = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const now = asOf ? new Date(asOf) : new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  }

  // Map an age (years) to one of the five youth bands. Clamps out-of-range ages.
  function ageBandFromAge(age) {
    if (age == null || Number.isNaN(age)) return null;
    if (age <= 10) return '9-10U';
    if (age <= 12) return '11-12U';
    if (age <= 14) return '13-14U';
    if (age <= 16) return '15-16U';
    return '17-18U';
  }

  function ageBandFromBirthdate(birthdateISO, asOf) {
    return ageBandFromAge(ageFromBirthdate(birthdateISO, asOf));
  }

  // Reasonable default competitive level from age (coach can override).
  function defaultLevelFromAge(age) {
    if (age == null) return 'youth';
    if (age <= 14) return 'youth';
    if (age <= 18) return 'HS';
    if (age <= 22) return 'college';
    return 'pro';
  }

  function inningsPerGame(level) {
    return INNINGS_PER_GAME[level] || INNINGS_PER_GAME.youth;
  }

  // ---------------------------------------------------------------------------
  // Metric catalog — core vs advanced vs derived, with units + plausible ranges.
  // ---------------------------------------------------------------------------
  const HITTING_CONTEXTS = ['tee', 'front-toss', 'machine', 'live-bp', 'game'];
  const PITCHING_CONTEXTS = ['bullpen', 'live-bp', 'game'];
  const GENERIC_CONTEXTS = ['practice', 'game', 'test'];
  const AGGREGATIONS = ['max', 'avg'];
  const DEVICES = ['device', 'manual'];
  const CONFIDENCE = ['high', 'med', 'low'];

  // group: hitting|pitching|throwing|athleticism|anthro
  // tier:  core|advanced|derived
  // range: absolute sanity bounds; bandMax: per-age-band soft ceiling for plausibility.
  const METRIC_CATALOG = [
    // Hitting
    { key: 'exitVeloMax', label: 'Exit Velo (max)', unit: 'mph', group: 'hitting', tier: 'core', contexts: HITTING_CONTEXTS, range: [20, 120], bandMax: { '9-10U': 70, '11-12U': 82, '13-14U': 92, '15-16U': 100, '17-18U': 110 } },
    { key: 'exitVeloAvg', label: 'Exit Velo (avg)', unit: 'mph', group: 'hitting', tier: 'core', contexts: HITTING_CONTEXTS, range: [20, 115], bandMax: { '9-10U': 65, '11-12U': 76, '13-14U': 86, '15-16U': 94, '17-18U': 102 } },
    { key: 'launchAngle', label: 'Launch Angle', unit: 'deg', group: 'hitting', tier: 'core', contexts: HITTING_CONTEXTS, range: [-30, 60] },
    { key: 'batSpeed', label: 'Bat Speed', unit: 'mph', group: 'hitting', tier: 'core', contexts: HITTING_CONTEXTS, range: [25, 90], bandMax: { '9-10U': 50, '11-12U': 58, '13-14U': 66, '15-16U': 74, '17-18U': 82 } },
    { key: 'sweetSpotPct', label: 'Sweet-Spot %', unit: '%', group: 'hitting', tier: 'derived', contexts: HITTING_CONTEXTS, range: [0, 100] },
    { key: 'lineDrivePct', label: 'Line-Drive %', unit: '%', group: 'hitting', tier: 'derived', contexts: HITTING_CONTEXTS, range: [0, 100] },
    { key: 'hardHitPct', label: 'Hard-Hit %', unit: '%', group: 'hitting', tier: 'derived', contexts: HITTING_CONTEXTS, range: [0, 100] },
    { key: 'barrelPct', label: 'Barrel %', unit: '%', group: 'hitting', tier: 'advanced', contexts: ['game', 'live-bp'], range: [0, 100], youthNA: true },
    // Pitching
    { key: 'fastballVelo', label: 'Fastball Velo', unit: 'mph', group: 'pitching', tier: 'core', contexts: PITCHING_CONTEXTS, range: [30, 105], bandMax: { '9-10U': 60, '11-12U': 70, '13-14U': 80, '15-16U': 88, '17-18U': 95 } },
    { key: 'secondaryVelo', label: 'Secondary Velo', unit: 'mph', group: 'pitching', tier: 'core', contexts: PITCHING_CONTEXTS, range: [25, 95] },
    { key: 'veloSeparation', label: 'Velo Separation', unit: 'mph', group: 'pitching', tier: 'core', contexts: PITCHING_CONTEXTS, range: [0, 25] },
    { key: 'strikePct', label: 'Strike %', unit: '%', group: 'pitching', tier: 'core', contexts: PITCHING_CONTEXTS, range: [0, 100] },
    { key: 'fpsPct', label: 'First-Pitch Strike %', unit: '%', group: 'pitching', tier: 'core', contexts: PITCHING_CONTEXTS, range: [0, 100] },
    { key: 'spinRate', label: 'Spin Rate', unit: 'rpm', group: 'pitching', tier: 'advanced', contexts: ['bullpen', 'game'], range: [800, 3200], minLevel: 'HS' },
    { key: 'ivb', label: 'Induced Vert Break', unit: 'in', group: 'pitching', tier: 'advanced', contexts: ['bullpen', 'game'], range: [-25, 25], minLevel: 'HS' },
    // Throwing / arm
    { key: 'infieldVelo', label: 'Infield Velo', unit: 'mph', group: 'throwing', tier: 'core', contexts: GENERIC_CONTEXTS, range: [30, 100] },
    { key: 'outfieldVelo', label: 'Outfield Velo', unit: 'mph', group: 'throwing', tier: 'core', contexts: GENERIC_CONTEXTS, range: [30, 105] },
    { key: 'moundVelo', label: 'Mound Velo', unit: 'mph', group: 'throwing', tier: 'core', contexts: GENERIC_CONTEXTS, range: [30, 105] },
    { key: 'maxThrowDist', label: 'Max Throw Distance', unit: 'ft', group: 'throwing', tier: 'core', contexts: GENERIC_CONTEXTS, range: [50, 400] },
    { key: 'popTime', label: 'Catcher Pop Time', unit: 'sec', group: 'throwing', tier: 'core', contexts: GENERIC_CONTEXTS, range: [1.6, 3.2], lowerBetter: true, basePath: true },
    // Athleticism
    { key: 'sixtyYard', label: '60-Yard Dash', unit: 'sec', group: 'athleticism', tier: 'core', contexts: ['test'], range: [6.0, 12.0], lowerBetter: true },
    { key: 'homeToFirst', label: 'Home-to-First', unit: 'sec', group: 'athleticism', tier: 'core', contexts: ['test'], range: [3.5, 6.5], lowerBetter: true, handedness: true },
    { key: 'proAgility', label: 'Pro-Agility 5-10-5', unit: 'sec', group: 'athleticism', tier: 'core', contexts: ['test'], range: [3.8, 7.0], lowerBetter: true },
    // Anthro (also tracked as time-series AnthroReading)
    { key: 'height', label: 'Height', unit: 'in', group: 'anthro', tier: 'core', contexts: ['test'], range: [40, 84] },
    { key: 'weight', label: 'Weight', unit: 'lb', group: 'anthro', tier: 'core', contexts: ['test'], range: [50, 320] }
  ];
  const METRIC_BY_KEY = METRIC_CATALOG.reduce(function (a, m) { a[m.key] = m; return a; }, {});

  function metric(key) { return METRIC_BY_KEY[key] || null; }
  function metricsByGroup(group) { return METRIC_CATALOG.filter(function (m) { return m.group === group; }); }

  // ---------------------------------------------------------------------------
  // Generic helpers
  // ---------------------------------------------------------------------------
  function num(v, dflt) { const n = Number(v); return Number.isFinite(n) ? n : (dflt == null ? 0 : dflt); }
  function str(v, dflt) { return v == null ? (dflt || '') : String(v); }
  function bool(v) { return !!v; }
  function nowISO() { return new Date().toISOString(); }
  function id(prefix) { return CT.uid(prefix); }

  // ---------------------------------------------------------------------------
  // Entity factories. Each returns a normalized, fully-defaulted object.
  // ---------------------------------------------------------------------------
  function Player(d) {
    d = d || {};
    const age = ageFromBirthdate(d.birthdate);
    return {
      id: str(d.id, id('plr')),
      name: str(d.name, 'Unnamed Player'),
      birthdate: str(d.birthdate, ''),               // ISO yyyy-mm-dd, REQUIRED to age-normalize
      ageBand: d.ageBand || ageBandFromAge(age) || '',
      level: str(d.level, d.birthdate ? defaultLevelFromAge(age) : 'youth'),
      bats: str(d.bats, 'R'),                          // R|L|S
      throws: str(d.throws, 'R'),                      // R|L
      positions: Array.isArray(d.positions) ? d.positions.map(String) : (d.position ? [String(d.position)] : []),
      teamId: d.teamId || null,
      jersey: str(d.jersey, ''),
      notes: str(d.notes, ''),
      photoInitials: str(d.photoInitials, ''),
      createdAt: str(d.createdAt, nowISO()),
      updatedAt: str(d.updatedAt, nowISO())
    };
  }

  function AnthroReading(d) {
    d = d || {};
    return {
      id: str(d.id, id('anth')),
      playerId: str(d.playerId, ''),
      date: str(d.date, CT.todayISO()),
      heightIn: d.heightIn == null ? null : num(d.heightIn, null),
      weightLb: d.weightLb == null ? null : num(d.weightLb, null),
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function AssessmentSession(d) {
    d = d || {};
    return {
      id: str(d.id, id('asmt')),
      playerId: str(d.playerId, ''),
      date: str(d.date, CT.todayISO()),
      type: str(d.type, 'assessment'),                 // assessment|showcase|practice
      location: str(d.location, ''),
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  // Append-only. Corrections add a NEW reading (optionally referencing correctsId).
  function MetricReading(d) {
    d = d || {};
    const m = METRIC_BY_KEY[d.metricKey];
    return {
      id: str(d.id, id('mr')),
      playerId: str(d.playerId, ''),
      assessmentSessionId: d.assessmentSessionId || null,
      metricKey: str(d.metricKey, ''),
      value: num(d.value, null),
      unit: str(d.unit, m ? m.unit : ''),
      aggregation: AGGREGATIONS.indexOf(d.aggregation) >= 0 ? d.aggregation : 'max', // max|avg
      context: str(d.context, m && m.contexts ? m.contexts[m.contexts.length - 1] : 'game'),
      device: DEVICES.indexOf(d.device) >= 0 ? d.device : 'manual',
      confidence: CONFIDENCE.indexOf(d.confidence) >= 0 ? d.confidence : 'med',
      basePath: d.basePath == null ? null : num(d.basePath, null), // for pop-time (60/70/80/90)
      date: str(d.date, CT.todayISO()),
      correctsId: d.correctsId || null,
      voided: bool(d.voided),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function Game(d) {
    d = d || {};
    return {
      id: str(d.id, id('game')),
      seasonId: d.seasonId || null,
      teamId: d.teamId || null,
      date: str(d.date, CT.todayISO()),
      opponent: str(d.opponent, ''),
      homeAway: str(d.homeAway, 'home'),
      scoreFor: d.scoreFor == null ? null : num(d.scoreFor, null),
      scoreAgainst: d.scoreAgainst == null ? null : num(d.scoreAgainst, null),
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function BattingStatLine(d) {
    d = d || {};
    return {
      id: str(d.id, id('bat')),
      gameId: d.gameId || null,
      playerId: str(d.playerId, ''),
      pa: d.pa == null ? null : num(d.pa, null),
      ab: num(d.ab, 0),
      h: num(d.h, 0),
      b2: num(d.b2, 0),   // doubles
      b3: num(d.b3, 0),   // triples
      hr: num(d.hr, 0),
      bb: num(d.bb, 0),
      hbp: num(d.hbp, 0),
      sf: num(d.sf, 0),
      so: num(d.so, 0),
      sb: num(d.sb, 0),
      cs: num(d.cs, 0),
      r: num(d.r, 0),
      rbi: num(d.rbi, 0),
      qab: d.qab == null ? null : num(d.qab, null), // quality at-bats (high-signal youth metric)
      createdAt: str(d.createdAt, nowISO())
    };
  }

  // IP is stored as OUTS (3 outs = 1 inning). Display via stats.formatIP.
  function PitchingAppearance(d) {
    d = d || {};
    return {
      id: str(d.id, id('pit')),
      gameId: d.gameId || null,
      playerId: str(d.playerId, ''),
      outs: num(d.outs, 0),
      bf: d.bf == null ? null : num(d.bf, null),
      h: num(d.h, 0),
      r: num(d.r, 0),
      er: num(d.er, 0),
      bb: num(d.bb, 0),
      so: num(d.so, 0),
      hbp: num(d.hbp, 0),
      hr: num(d.hr, 0),
      pitches: num(d.pitches, 0),
      strikes: num(d.strikes, 0),
      firstPitchStrikes: num(d.firstPitchStrikes, 0),
      firstPitchPA: num(d.firstPitchPA, 0),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function FieldingStatLine(d) {
    d = d || {};
    return {
      id: str(d.id, id('fld')),
      gameId: d.gameId || null,
      playerId: str(d.playerId, ''),
      position: str(d.position, ''),
      po: num(d.po, 0),
      a: num(d.a, 0),
      e: num(d.e, 0),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  // Append-only arm workload. `outs` lets workload feed rolling-12mo innings.
  function WorkloadLog(d) {
    d = d || {};
    return {
      id: str(d.id, id('wl')),
      playerId: str(d.playerId, ''),
      date: str(d.date, CT.todayISO()),
      type: str(d.type, 'game'),       // game|bullpen|practice|long-toss
      pitches: num(d.pitches, 0),
      outs: num(d.outs, 0),
      rpe: d.rpe == null ? null : num(d.rpe, null), // 1-10 perceived exertion
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function DailyCheckIn(d) {
    d = d || {};
    return {
      id: str(d.id, id('chk')),
      playerId: str(d.playerId, ''),
      date: str(d.date, CT.todayISO()),
      soreness: d.soreness == null ? null : num(d.soreness, null), // 0-10
      fatigue: d.fatigue == null ? null : num(d.fatigue, null),    // 0-10
      sleepHours: d.sleepHours == null ? null : num(d.sleepHours, null),
      mood: d.mood == null ? null : num(d.mood, null),             // 1-5
      armPain: bool(d.armPain),
      painLocation: str(d.painLocation, ''),
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function Program(d) {
    d = d || {};
    return {
      id: str(d.id, id('prog')),
      templateId: d.templateId || null,
      name: str(d.name, 'Program'),
      category: str(d.category, 'general'),
      description: str(d.description, ''),
      ageBands: Array.isArray(d.ageBands) ? d.ageBands.map(String) : AGE_BANDS.slice(),
      ageGateMin: d.ageGateMin == null ? null : num(d.ageGateMin, null), // hard min age (e.g. 15 for weighted balls)
      weeks: num(d.weeks, 4),
      sessionsPerWeek: num(d.sessionsPerWeek, 3),
      checklist: Array.isArray(d.checklist) ? d.checklist.map(String) : [],
      clinicianRequired: bool(d.clinicianRequired),
      isTemplate: bool(d.isTemplate),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function ProgramAssignment(d) {
    d = d || {};
    return {
      id: str(d.id, id('pa')),
      playerId: str(d.playerId, ''),
      programId: str(d.programId, ''),
      startDate: str(d.startDate, CT.todayISO()),
      status: str(d.status, 'active'),   // active|completed|paused
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function ProgramSession(d) {
    d = d || {};
    return {
      id: str(d.id, id('ps')),
      assignmentId: str(d.assignmentId, ''),
      playerId: str(d.playerId, ''),
      programId: str(d.programId, ''),
      date: str(d.date, CT.todayISO()),
      weekIndex: num(d.weekIndex, 0),
      planned: d.planned == null ? true : bool(d.planned),
      completed: bool(d.completed),
      warmupDone: bool(d.warmupDone),
      armCareDone: bool(d.armCareDone),
      rpe: d.rpe == null ? null : num(d.rpe, null),
      soreness: d.soreness == null ? null : num(d.soreness, null),
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function Benchmark(d) {
    d = d || {};
    return {
      id: str(d.id, id('bm')),
      ageBand: str(d.ageBand, ''),
      metricKey: str(d.metricKey, ''),
      unit: str(d.unit, ''),
      p10: d.p10 == null ? null : num(d.p10, null),
      p25: d.p25 == null ? null : num(d.p25, null),
      p50: d.p50 == null ? null : num(d.p50, null),
      p75: d.p75 == null ? null : num(d.p75, null),
      p90: d.p90 == null ? null : num(d.p90, null),
      source: str(d.source, '')
    };
  }

  function Team(d) {
    d = d || {};
    return {
      id: str(d.id, id('team')),
      name: str(d.name, 'Team'),
      ageBand: str(d.ageBand, ''),
      level: str(d.level, 'youth'),
      season: str(d.season, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function Season(d) {
    d = d || {};
    return {
      id: str(d.id, id('seas')),
      name: str(d.name, 'Season'),
      year: num(d.year, new Date().getFullYear()),
      startDate: str(d.startDate, ''),
      endDate: str(d.endDate, ''),
      level: str(d.level, 'youth'),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  // ---------------------------------------------------------------------------
  // Validation — fail fast at the boundary; reject implausible entries.
  // Returns { ok, errors:[], warnings:[] }.
  // ---------------------------------------------------------------------------
  function validatePlayer(d) {
    const errors = [], warnings = [];
    if (!d || !str(d.name).trim()) errors.push('Name is required.');
    if (!d.birthdate) warnings.push('Birthdate missing — age band & percentiles unavailable.');
    else if (ageFromBirthdate(d.birthdate) == null) errors.push('Birthdate is invalid.');
    if (d.bats && ['R', 'L', 'S'].indexOf(d.bats) < 0) warnings.push('Bats should be R, L, or S.');
    if (d.throws && ['R', 'L'].indexOf(d.throws) < 0) warnings.push('Throws should be R or L.');
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // Validate a metric value against absolute range + per-age-band plausibility.
  function validateMetricReading(reading, player) {
    const errors = [], warnings = [];
    const m = METRIC_BY_KEY[reading.metricKey];
    if (!m) { errors.push('Unknown metric "' + reading.metricKey + '".'); return { ok: false, errors: errors, warnings: warnings }; }
    const v = Number(reading.value);
    if (!Number.isFinite(v)) { errors.push('Value must be a number.'); return { ok: false, errors: errors, warnings: warnings }; }
    if (m.range && (v < m.range[0] || v > m.range[1])) {
      errors.push(m.label + ' of ' + v + ' ' + m.unit + ' is outside the plausible range (' + m.range[0] + '–' + m.range[1] + ').');
    }
    const band = player && (player.ageBand || ageBandFromBirthdate(player.birthdate));
    if (m.youthNA && band && AGE_BANDS.indexOf(band) <= 2) {
      warnings.push(m.label + ' is generally N/A for youth — interpret with caution.');
    }
    if (m.bandMax && band && m.bandMax[band] != null && v > m.bandMax[band] && reading.context === 'game') {
      warnings.push('A game ' + m.label + ' of ' + v + ' ' + m.unit + ' is unusually high for ' + band + ' — likely a data-entry error.');
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  window.CT.model = {
    AGE_BANDS: AGE_BANDS,
    LEVELS: LEVELS,
    INNINGS_PER_GAME: INNINGS_PER_GAME,
    HITTING_CONTEXTS: HITTING_CONTEXTS,
    PITCHING_CONTEXTS: PITCHING_CONTEXTS,
    GENERIC_CONTEXTS: GENERIC_CONTEXTS,
    AGGREGATIONS: AGGREGATIONS,
    DEVICES: DEVICES,
    CONFIDENCE: CONFIDENCE,
    METRIC_CATALOG: METRIC_CATALOG,
    METRIC_BY_KEY: METRIC_BY_KEY,
    metric: metric,
    metricsByGroup: metricsByGroup,
    ageFromBirthdate: ageFromBirthdate,
    ageBandFromAge: ageBandFromAge,
    ageBandFromBirthdate: ageBandFromBirthdate,
    defaultLevelFromAge: defaultLevelFromAge,
    inningsPerGame: inningsPerGame,
    // factories
    Player: Player,
    AnthroReading: AnthroReading,
    AssessmentSession: AssessmentSession,
    MetricReading: MetricReading,
    Game: Game,
    BattingStatLine: BattingStatLine,
    PitchingAppearance: PitchingAppearance,
    FieldingStatLine: FieldingStatLine,
    WorkloadLog: WorkloadLog,
    DailyCheckIn: DailyCheckIn,
    Program: Program,
    ProgramAssignment: ProgramAssignment,
    ProgramSession: ProgramSession,
    Benchmark: Benchmark,
    Team: Team,
    Season: Season,
    // validation
    validatePlayer: validatePlayer,
    validateMetricReading: validateMetricReading
  };
})();

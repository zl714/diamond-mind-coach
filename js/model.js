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

  // Positions are a fixed enum (v3). Free text is normalized on save/migration.
  const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'IF', 'UTIL'];
  const POSITION_LABELS = {
    P: 'Pitcher', C: 'Catcher', '1B': 'First Base', '2B': 'Second Base',
    '3B': 'Third Base', SS: 'Shortstop', LF: 'Left Field', CF: 'Center Field',
    RF: 'Right Field', OF: 'Outfield', IF: 'Infield', UTIL: 'Utility'
  };
  // Free-text -> enum mapping (order matters: most specific first).
  const POSITION_PATTERNS = [
    [/^p$|pitch/i, 'P'],
    [/^c$|catch/i, 'C'],
    [/^1b$|first/i, '1B'],
    [/^2b$|second/i, '2B'],
    [/^3b$|third/i, '3B'],
    [/^ss$|short/i, 'SS'],
    [/^lf$|left/i, 'LF'],
    [/^cf$|center|centre/i, 'CF'],
    [/^rf$|right/i, 'RF'],
    [/^of$|outfield/i, 'OF'],
    [/^if$|infield/i, 'IF'],
    [/^util|^dh$|designated|utility/i, 'UTIL']
  ];
  function normalizePosition(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (POSITIONS.indexOf(t.toUpperCase()) >= 0) return t.toUpperCase();
    for (let i = 0; i < POSITION_PATTERNS.length; i++) {
      if (POSITION_PATTERNS[i][0].test(t)) return POSITION_PATTERNS[i][1];
    }
    return null;
  }
  function normalizePositions(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(function (x) {
      const p = normalizePosition(x);
      if (p && out.indexOf(p) < 0) out.push(p);
    });
    return out;
  }
  // Single source of truth for pitcher detection (replaces the /pitch/i regex
  // that used to be duplicated across five view files).
  function isPitcher(player) {
    return !!(player && Array.isArray(player.positions) && player.positions.indexOf('P') >= 0);
  }
  function isCatcher(player) {
    return !!(player && Array.isArray(player.positions) && player.positions.indexOf('C') >= 0);
  }

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

  // v3: age band is ALWAYS derived from birthdate at read time (never stored),
  // so players age across band boundaries without stale-band drift.
  function bandFor(player, asOf) {
    if (!player) return null;
    return ageBandFromBirthdate(player.birthdate, asOf) || player.ageBand || null;
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
    { key: 'exitVeloMax', label: 'Max Exit Velo', unit: 'mph', group: 'hitting', tier: 'core', contexts: HITTING_CONTEXTS, range: [20, 120], bandMax: { '9-10U': 70, '11-12U': 82, '13-14U': 92, '15-16U': 100, '17-18U': 110 } },
    { key: 'exitVeloAvg', label: 'Avg Exit Velo', unit: 'mph', group: 'hitting', tier: 'core', contexts: HITTING_CONTEXTS, range: [20, 115], bandMax: { '9-10U': 65, '11-12U': 76, '13-14U': 86, '15-16U': 94, '17-18U': 102 } },
    { key: 'launchAngle', label: 'Launch Angle', unit: 'deg', group: 'hitting', tier: 'core', contexts: HITTING_CONTEXTS, range: [-30, 60] },
    { key: 'batSpeed', label: 'Bat Speed', unit: 'mph', group: 'hitting', tier: 'core', contexts: HITTING_CONTEXTS, range: [25, 90], bandMax: { '9-10U': 50, '11-12U': 58, '13-14U': 66, '15-16U': 74, '17-18U': 82 } },
    { key: 'sweetSpotPct', label: 'Sweet-Spot %', unit: '%', group: 'hitting', tier: 'derived', contexts: HITTING_CONTEXTS, range: [0, 100] },
    { key: 'lineDrivePct', label: 'Line-Drive %', unit: '%', group: 'hitting', tier: 'derived', contexts: HITTING_CONTEXTS, range: [0, 100] },
    { key: 'hardHitPct', label: 'Hard-Hit %', unit: '%', group: 'hitting', tier: 'derived', contexts: HITTING_CONTEXTS, range: [0, 100] },
    { key: 'barrelPct', label: 'Barrel %', unit: '%', group: 'hitting', tier: 'advanced', contexts: ['game', 'live-bp'], range: [0, 100], youthNA: true },
    // Pitching
    // v3 relabel: "Throwing Velo" (key unchanged so benchmarks + old readings keep working).
    { key: 'fastballVelo', label: 'Throwing Velo', unit: 'mph', group: 'pitching', tier: 'core', contexts: PITCHING_CONTEXTS, range: [30, 105], bandMax: { '9-10U': 60, '11-12U': 70, '13-14U': 80, '15-16U': 88, '17-18U': 95 } },
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
    // v3 relabel: "Long-Toss Distance" (key unchanged — do NOT add a longTossDist key).
    { key: 'maxThrowDist', label: 'Long-Toss Distance', unit: 'ft', group: 'throwing', tier: 'core', contexts: GENERIC_CONTEXTS, range: [50, 400] },
    { key: 'popTime', label: 'Catcher Pop Time', unit: 'sec', group: 'throwing', tier: 'core', contexts: GENERIC_CONTEXTS, range: [1.6, 3.2], lowerBetter: true, basePath: true },
    // Athleticism
    { key: 'sixtyYard', label: '60-Yard Dash', unit: 'sec', group: 'athleticism', tier: 'core', contexts: ['test'], range: [6.0, 12.0], lowerBetter: true },
    // v3 addition: 30-yard dash — the youth-appropriate speed test (no benchmark
    // rows yet, so it reads as trend-vs-self).
    { key: 'thirtyYard', label: '30-Yard Dash', unit: 'sec', group: 'athleticism', tier: 'core', contexts: ['test'], range: [3.0, 8.5], lowerBetter: true },
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
  // Assessment MODULES (v3) — the brief, coach-friendly assessment surface.
  // Each module maps to a small set of catalog metrics; the rest of the 25-key
  // catalog stays readable (legacy readings render) but is not in the entry UI.
  // ---------------------------------------------------------------------------
  const ASSESS_MODULES = [
    { id: 'hitting', label: 'Hitting', icon: 'zap', metrics: ['exitVeloMax', 'batSpeed'], notes: true,
      blurb: 'Exit velo off the tee + bat speed.' },
    { id: 'throwing', label: 'Throwing', icon: 'target', metrics: ['fastballVelo', 'maxThrowDist'], notes: false,
      blurb: 'Throwing velo + long-toss distance.' },
    { id: 'speed', label: 'Speed', icon: 'timer', metrics: ['sixtyYard', 'thirtyYard', 'homeToFirst'], notes: false,
      blurb: '60/30-yard dash + home-to-first.', speedChoice: ['sixtyYard', 'thirtyYard'] },
    { id: 'fielding', label: 'Fielding', icon: 'shield', metrics: ['popTime'], notes: true, catchersOnly: true,
      blurb: 'Catcher pop time (+ fielding notes).' },
    { id: 'body', label: 'Body', icon: 'ruler', metrics: [], anthro: true, notes: false,
      blurb: 'Height & weight (growth tracking).' }
  ];
  const ASSESS_MODULE_BY_ID = ASSESS_MODULES.reduce(function (a, m) { a[m.id] = m; return a; }, {});
  const MODULE_IDS = ASSESS_MODULES.map(function (m) { return m.id; });

  // Best-fit module for ANY catalog metric (used to tag migrated sessions).
  function moduleForMetric(key) {
    const m = METRIC_BY_KEY[key];
    if (!m) return null;
    if (key === 'popTime') return 'fielding';
    switch (m.group) {
      case 'hitting': return 'hitting';
      case 'pitching':
      case 'throwing': return 'throwing';
      case 'athleticism': return 'speed';
      case 'anthro': return 'body';
      default: return null;
    }
  }

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
  // v4: readiness flags the program generator gates on. Stored only once the
  // coach confirms something (null = never touched, treated as all-false).
  function normalizeReadiness(r) {
    if (!r || typeof r !== 'object') return null;
    return {
      minus3Bat: bool(r.minus3Bat),            // swings/moving to -3 BBCOR (OU bat eligibility 13-14)
      maturityConfirmed: bool(r.maturityConfirmed), // physician-confirmed skeletal maturity (weighted-ball 15-16)
      physicianCleared: bool(r.physicianCleared),   // active clearance for return-to-throw
      updatedAt: str(r.updatedAt, nowISO())
    };
  }

  function Player(d) {
    d = d || {};
    const age = ageFromBirthdate(d.birthdate);
    return {
      id: str(d.id, id('plr')),
      name: str(d.name, 'Unnamed Player'),
      birthdate: str(d.birthdate, ''),               // ISO yyyy-mm-dd, REQUIRED to age-normalize
      // v3: NO stored ageBand — use model.bandFor(player) (derived from birthdate).
      level: str(d.level, d.birthdate ? defaultLevelFromAge(age) : 'youth'),
      bats: str(d.bats, 'R'),                          // R|L|S
      throws: str(d.throws, 'R'),                      // R|L
      positions: normalizePositions(Array.isArray(d.positions) ? d.positions : (d.position ? [d.position] : [])),
      teamId: d.teamId || null,
      jersey: str(d.jersey, ''),
      notes: str(d.notes, ''),
      photoInitials: str(d.photoInitials, ''),
      readiness: normalizeReadiness(d.readiness),      // v4: generator gate flags (null = unset)
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
    const modules = (Array.isArray(d.modules) ? d.modules : [])
      .map(String).filter(function (m) { return MODULE_IDS.indexOf(m) >= 0; });
    const moduleNotes = {};
    if (d.moduleNotes && typeof d.moduleNotes === 'object') {
      Object.keys(d.moduleNotes).forEach(function (k) {
        if (MODULE_IDS.indexOf(k) >= 0 && d.moduleNotes[k] != null && String(d.moduleNotes[k]).trim() !== '') {
          moduleNotes[k] = String(d.moduleNotes[k]);
        }
      });
    }
    return {
      id: str(d.id, id('asmt')),
      playerId: str(d.playerId, ''),
      date: str(d.date, CT.todayISO()),
      type: str(d.type, 'assessment'),                 // assessment|showcase|practice
      modules: modules,                                // v3: which modules were run
      moduleNotes: moduleNotes,                        // v3: { hitting?, fielding?, ... }
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
      // v3: provenance — where the number came from.
      source: ['assessment', 'session', 'migrated-quickstat'].indexOf(d.source) >= 0
        ? d.source : (d.assessmentSessionId ? 'assessment' : 'session'),
      // v4: provenance link — the lesson/session the number was captured in
      // (source 'session' only; assessment readings keep assessmentSessionId).
      sessionLogId: d.sessionLogId || null,
      date: str(d.date, CT.todayISO()),
      correctsId: d.correctsId || null,
      voided: bool(d.voided),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function Game(d) {
    d = d || {};
    // v3: game metadata is REAL fields (the old '#CTGAMEMETA#' notes trailer is
    // parsed away by the v2->v3 migration).
    const decisions = {};
    if (d.decisions && typeof d.decisions === 'object') {
      Object.keys(d.decisions).forEach(function (k) {
        const v = String(d.decisions[k] || '');
        if (['W', 'L', 'S', 'H', 'BS'].indexOf(v) >= 0) decisions[k] = v;
      });
    }
    return {
      id: str(d.id, id('game')),
      seasonId: d.seasonId || null,
      teamId: d.teamId || null,
      date: str(d.date, CT.todayISO()),
      opponent: str(d.opponent, ''),
      homeAway: str(d.homeAway, 'home'),
      scoreFor: d.scoreFor == null ? null : num(d.scoreFor, null),
      scoreAgainst: d.scoreAgainst == null ? null : num(d.scoreAgainst, null),
      ipg: [6, 7, 9].indexOf(Number(d.ipg)) >= 0 ? Number(d.ipg) : null, // null = derive from level
      final: bool(d.final),
      boxVersion: Math.max(1, num(d.boxVersion, 1)),
      decisions: decisions,                            // { pitchingAppearanceId: 'W'|'L'|'S'|'H'|'BS' }
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
      // v3: what produced this log ({kind:'box'|'session', id}) — replaces the
      // '[box:<id>]' idempotence substring that used to live inside notes.
      sourceRef: (d.sourceRef && typeof d.sourceRef === 'object' && d.sourceRef.id)
        ? { kind: str(d.sourceRef.kind, 'box'), id: str(d.sourceRef.id, '') } : null,
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  function DailyCheckIn(d) {
    d = d || {};
    const painLevel = d.painLevel == null ? null : num(d.painLevel, null); // 0-10
    return {
      id: str(d.id, id('chk')),
      playerId: str(d.playerId, ''),
      date: str(d.date, CT.todayISO()),
      soreness: d.soreness == null ? null : num(d.soreness, null), // 0-10
      fatigue: d.fatigue == null ? null : num(d.fatigue, null),    // 0-10
      sleepHours: d.sleepHours == null ? null : num(d.sleepHours, null),
      mood: d.mood == null ? null : num(d.mood, null),             // 1-5
      painLevel: painLevel,                                        // v3: raw 0-10 pain (schema field)
      armPain: painLevel != null ? painLevel >= 3 : bool(d.armPain),
      painLocation: str(d.painLocation, ''),
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  // ---------------------------------------------------------------------------
  // Program (v3): week x day structure with drill/step items. Old cloned
  // template instances are migrated to single-day programs (checklist -> steps).
  // ---------------------------------------------------------------------------
  const PROGRAM_TYPES = ['throwing', 'hitting', 'strength', 'custom'];

  function ProgramItem(x) {
    x = x || {};
    if (x.kind === 'drill' || x.drillId) {
      return {
        id: str(x.id, id('pi')),
        kind: 'drill',
        drillId: str(x.drillId, ''),
        sets: x.sets == null ? null : num(x.sets, null),
        reps: x.reps == null ? null : num(x.reps, null),
        notes: str(x.notes, '')
      };
    }
    return { id: str(x.id, id('pi')), kind: 'step', text: str(x.text, '') };
  }

  // v4: per-day intensity chip (generator constraint checks + display).
  const DAY_INTENSITIES = ['high', 'medium', 'low', 'recovery'];

  function ProgramDay(x) {
    x = x || {};
    return {
      weekIndex: num(x.weekIndex, 0),
      dayIndex: num(x.dayIndex, 0),
      title: str(x.title, ''),
      intensity: DAY_INTENSITIES.indexOf(x.intensity) >= 0 ? x.intensity : null,
      items: (Array.isArray(x.items) ? x.items : []).map(ProgramItem)
    };
  }

  // v4: where a program came from (the generator stamps 'generated').
  const PROGRAM_SOURCES = ['manual', 'template', 'generated'];

  function Program(d) {
    d = d || {};
    return {
      id: str(d.id, id('prog')),
      templateId: d.templateId || null,
      name: str(d.name, 'Program'),
      type: PROGRAM_TYPES.indexOf(d.type) >= 0 ? d.type : 'custom',
      source: PROGRAM_SOURCES.indexOf(d.source) >= 0 ? d.source : 'manual', // v4
      goalId: d.goalId || null,                                             // v4: generator goal
      generatorMeta: (d.generatorMeta && typeof d.generatorMeta === 'object')
        ? JSON.parse(JSON.stringify(d.generatorMeta)) : null,               // v4: audit snapshot
      description: str(d.description, ''),
      weeks: Math.max(1, num(d.weeks, 4)),
      daysPerWeek: Math.max(0, num(d.daysPerWeek, 3)), // 0 = overlay (no scheduled days)
      days: (Array.isArray(d.days) ? d.days : []).map(ProgramDay),
      ageBands: Array.isArray(d.ageBands) ? d.ageBands.map(String) : AGE_BANDS.slice(),
      ageGateMin: d.ageGateMin == null ? null : num(d.ageGateMin, null),
      clinicianRequired: bool(d.clinicianRequired),
      archived: bool(d.archived),
      createdAt: str(d.createdAt, nowISO()),
      updatedAt: str(d.updatedAt, nowISO())
    };
  }

  function ProgramAssignment(d) {
    d = d || {};
    const dow = Array.isArray(d.daysOfWeek)
      ? d.daysOfWeek.map(Number).filter(function (n) { return Number.isInteger(n) && n >= 0 && n <= 6; })
      : null;
    return {
      id: str(d.id, id('pa')),
      playerId: str(d.playerId, ''),
      programId: str(d.programId, ''),
      startDate: str(d.startDate, CT.todayISO()),
      daysOfWeek: dow && dow.length ? dow : null,  // 0=Sun..6=Sat; null = any day
      status: str(d.status, 'active'),   // active|completed|paused
      notes: str(d.notes, ''),
      createdAt: str(d.createdAt, nowISO())
    };
  }

  // ---------------------------------------------------------------------------
  // SessionLog (v3) — replaces BOTH Lesson and ProgramSession. One record per
  // logged coaching/program session. Program sessions are logged ON DEMAND
  // (never pre-generated), so nothing goes stale.
  // v4: a "LESSON" is definitionally a SessionLog with assignmentId === null;
  // its `focus` drives the quick-numbers metric block and feed copy.
  // ---------------------------------------------------------------------------
  const SESSION_FOCUS = ['hitting', 'throwing', 'fielding', 'speed', 'strength', 'mixed'];
  const SESSION_FOCUS_LABELS = {
    hitting: 'Hitting', throwing: 'Throwing', fielding: 'Fielding',
    speed: 'Speed', strength: 'Strength', mixed: 'Mixed'
  };

  function SessionLog(d) {
    d = d || {};
    const itemChecks = {};
    if (d.itemChecks && typeof d.itemChecks === 'object') {
      Object.keys(d.itemChecks).forEach(function (k) { itemChecks[k] = !!d.itemChecks[k]; });
    }
    return {
      id: str(d.id, id('sl')),
      playerId: str(d.playerId, ''),
      date: str(d.date, CT.todayISO()),
      focus: SESSION_FOCUS.indexOf(d.focus) >= 0 ? d.focus : null, // v4: lesson focus
      assignmentId: d.assignmentId || null,
      programDayRef: (d.programDayRef && typeof d.programDayRef === 'object')
        ? { weekIndex: num(d.programDayRef.weekIndex, 0), dayIndex: num(d.programDayRef.dayIndex, 0) } : null,
      itemChecks: itemChecks,                       // { programItemId: bool }
      extraDrillIds: Array.isArray(d.extraDrillIds) ? d.extraDrillIds.map(String)
        : (Array.isArray(d.drillIds) ? d.drillIds.map(String) : []),
      notes: str(d.notes, ''),
      rpe: d.rpe == null ? null : num(d.rpe, null),
      throws: d.throws == null ? null : num(d.throws, null), // throw count -> workloadLog via sourceRef
      ratingDelta: d.ratingDelta == null ? null : num(d.ratingDelta, null),
      createdAt: str(d.createdAt, nowISO()),
      updatedAt: str(d.updatedAt, nowISO())
    };
  }

  // ---------------------------------------------------------------------------
  // Drill (v3): lowercase category enum + richer metadata.
  // ---------------------------------------------------------------------------
  const DRILL_CATEGORIES = ['hitting', 'throwing', 'fielding', 'speed', 'strength'];
  const DRILL_CATEGORY_LABELS = {
    hitting: 'Hitting', throwing: 'Throwing', fielding: 'Fielding',
    speed: 'Speed', strength: 'Strength'
  };
  // Old v2 categories -> v3 enum.
  const DRILL_CATEGORY_MAP = {
    Hitting: 'hitting', Pitching: 'throwing', Fielding: 'fielding',
    Baserunning: 'speed', Strength: 'strength', Mobility: 'strength'
  };

  function Drill(d) {
    d = d || {};
    let cat = String(d.category || '');
    if (DRILL_CATEGORIES.indexOf(cat) < 0) cat = DRILL_CATEGORY_MAP[cat] || 'hitting';
    return {
      id: str(d.id, id('drl')),
      name: str(d.name, 'New Drill'),
      category: cat,
      description: str(d.description != null ? d.description : d.defaultNotes, ''),
      // Only http(s) URLs survive the model boundary — imports can't smuggle
      // javascript:/data: schemes into the drill-library href sink.
      videoUrl: (d.videoUrl && /^https?:\/\//i.test(String(d.videoUrl))) ? String(d.videoUrl) : null,
      equipment: Array.isArray(d.equipment) ? d.equipment.map(String).filter(Boolean) : [],
      createdAt: str(d.createdAt, nowISO()),
      updatedAt: str(d.updatedAt, nowISO())
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
    const band = bandFor(player);
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
    POSITIONS: POSITIONS,
    POSITION_LABELS: POSITION_LABELS,
    INNINGS_PER_GAME: INNINGS_PER_GAME,
    HITTING_CONTEXTS: HITTING_CONTEXTS,
    PITCHING_CONTEXTS: PITCHING_CONTEXTS,
    GENERIC_CONTEXTS: GENERIC_CONTEXTS,
    AGGREGATIONS: AGGREGATIONS,
    DEVICES: DEVICES,
    CONFIDENCE: CONFIDENCE,
    DRILL_CATEGORIES: DRILL_CATEGORIES,
    DRILL_CATEGORY_LABELS: DRILL_CATEGORY_LABELS,
    DRILL_CATEGORY_MAP: DRILL_CATEGORY_MAP,
    PROGRAM_TYPES: PROGRAM_TYPES,
    PROGRAM_SOURCES: PROGRAM_SOURCES,
    DAY_INTENSITIES: DAY_INTENSITIES,
    SESSION_FOCUS: SESSION_FOCUS,
    SESSION_FOCUS_LABELS: SESSION_FOCUS_LABELS,
    METRIC_CATALOG: METRIC_CATALOG,
    METRIC_BY_KEY: METRIC_BY_KEY,
    ASSESS_MODULES: ASSESS_MODULES,
    ASSESS_MODULE_BY_ID: ASSESS_MODULE_BY_ID,
    metric: metric,
    metricsByGroup: metricsByGroup,
    moduleForMetric: moduleForMetric,
    ageFromBirthdate: ageFromBirthdate,
    ageBandFromAge: ageBandFromAge,
    ageBandFromBirthdate: ageBandFromBirthdate,
    bandFor: bandFor,
    defaultLevelFromAge: defaultLevelFromAge,
    inningsPerGame: inningsPerGame,
    normalizePosition: normalizePosition,
    normalizePositions: normalizePositions,
    isPitcher: isPitcher,
    isCatcher: isCatcher,
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
    SessionLog: SessionLog,
    Drill: Drill,
    Team: Team,
    Season: Season,
    // validation
    validatePlayer: validatePlayer,
    validateMetricReading: validateMetricReading
  };
})();

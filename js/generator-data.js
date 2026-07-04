/* generator-data.js — the program generator's DECISION TABLE as declarative
   data (goals, per-age variants, phase/day templates). NO engine logic here —
   generator.js interprets this. Every drill slug references drills-seed.js.
   Sources: Driveline youth throwing, Jaeger long toss, Texas Children's ITP,
   Wilk/Andrews Thrower's Ten, Reinold 2018 weighted-ball findings, Driveline/
   Axe/Blast OU-bat protocol, NSCA/AAP youth strength, USA Baseball Pitch Smart.
   Exposed on window.CT.generatorData. */
(function () {
  'use strict';

  // ---- tiny data builders (shorthand only — no decisions made here) ----
  function d(slug, sets, reps, note) {
    return { kind: 'drill', slug: slug, sets: sets == null ? null : sets, reps: reps == null ? null : reps, notes: note || '' };
  }
  function s(text) { return { kind: 'step', text: text }; }
  // day(title, intensity, items, opts) — opts.arm wraps with warm-up/J-band/recovery.
  function day(title, intensity, items, opts) {
    return Object.assign({ title: title, intensity: intensity, items: items }, opts || {});
  }

  // Fixed weekday patterns per days/week (0=Sun..6=Sat). Chosen so 'high'
  // intensity days are never on adjacent weekdays under the templates below.
  const PATTERNS = {
    1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6]
  };

  // Long-toss distance ceiling (ft) per age band.
  const DIST_CAP = { '9-10U': 120, '11-12U': 150, '13-14U': 250, '15-16U': 300, '17-18U': 330 };

  const CALENDAR_NOTE = 'Annual calendar rule: at least 4 months off competitive pitching per year, ' +
    'including 2–3 continuous no-throw months (Pitch Smart).';
  const SORENESS_RULES = 'Soreness rules (Texas Children’s — advancement is criteria-based, never by date): ' +
    'soreness gone within 15 warm-up throws = continue; soreness persists = stop, 2 days off, drop back one step; ' +
    'sore >1 hour after throwing or the next day = 1 day off, repeat the step; acute PAIN = stop, medical referral.';

  const DOMAINS = [
    { id: 'throwing', label: 'Throwing', icon: 'target' },
    { id: 'hitting', label: 'Hitting', icon: 'zap' },
    { id: 'strength', label: 'Strength', icon: 'dumbbell' }
  ];

  const GOALS = [
    { id: 'thr-armcare', domain: 'throwing', type: 'throwing', label: 'Arm care & durability',
      blurb: 'Band + light-DB arm-care base with easy catch. The default for any thrower with no assessed numbers.' },
    { id: 'thr-base', domain: 'throwing', type: 'throwing', label: 'Long-toss base builder',
      blurb: '6-week capped long-toss block that builds arm strength before any velocity work.' },
    { id: 'thr-velo', domain: 'throwing', type: 'throwing', label: 'Velocity development',
      blurb: 'Age-gated velocity training — plyo foundations at 13–14, weighted-ball on-ramp at 15–16, full off-season block at 17+.' },
    { id: 'thr-rfs', domain: 'throwing', type: 'throwing', label: 'Return from shutdown (ITP)',
      blurb: 'Texas Children’s interval-throwing ladder after a layoff or arm trouble. Every-other-day, soreness-gated.' },
    { id: 'hit-contact', domain: 'hitting', type: 'hitting', label: 'Contact & barrel control',
      blurb: 'Tee → toss → machine → live ladder, advancing tiers at ≥70% quality contact.' },
    { id: 'hit-power', domain: 'hitting', type: 'hitting', label: 'Power development',
      blurb: 'Max-intent swings + med-ball rotational power, paired with age-right strength work.' },
    { id: 'hit-batspeed', domain: 'hitting', type: 'hitting', label: 'Bat speed (overload/underload)',
      blurb: 'Overload/underload bat block — gated to −3 BBCOR swingers, off-season only.' },
    { id: 'str-athletic', domain: 'strength', type: 'strength', label: 'Athletic strength base',
      blurb: 'NSCA youth-guideline strength: bodyweight → load, jumps/throws first, technique before resistance.' },
    { id: 'str-inseason', domain: 'strength', type: 'strength', label: 'In-season strength maintenance',
      blurb: 'Minimum effective dose to hold strength through the season (1–2 short full-body days).' }
  ];

  // ---------------------------------------------------------------------------
  // Shared day fragments
  // ---------------------------------------------------------------------------
  function liftDayYouth(title) {
    return day(title, 'medium', [
      d('dynamic-warmup', 1, 1),
      d('bw-squat', 2, 10), d('hinge-glute-bridge', 2, 10), d('pushup-prog', 2, 10),
      d('band-row', 2, 10), d('medball-chest', 2, 6), d('jump-play', 1, 1)
    ]);
  }
  function liftDayMiddleA() {
    return day('Strength A', 'medium', [
      d('dynamic-warmup', 1, 1),
      d('goblet-squat', 3, 10), d('kb-rdl', 3, 10), d('pushup-prog', 3, 10),
      d('band-row', 3, 10), d('band-er-ytw', 2, 10), d('hip-tspine-mobility', 1, 1)
    ]);
  }
  function liftDayMiddleB() {
    return day('Strength B', 'medium', [
      d('dynamic-warmup', 1, 1),
      d('split-squat', 2, 8, 'each side'), d('pallof-press', 2, 10, 'each side'),
      d('medball-shotput', 3, 5, 'each side'), d('broad-jump', 3, 3),
      d('band-er-ytw', 2, 10), d('hip-tspine-mobility', 1, 1)
    ]);
  }
  function liftDayHS(variant) {
    return day(variant === 'B' ? 'Lift B (lower/pull)' : 'Lift A (full body)', 'medium', [
      d('dynamic-warmup', 1, 1),
      d('box-jump', 3, 3), d('medball-shotput', 3, 5, 'each side — throws FIRST, fresh'),
      variant === 'B' ? d('goblet-squat', 4, 8, 'or barbell squat 4×5–8') : d('trap-bar-dl', 4, 5, 'NO 1RM — estimate from 3–5RM'),
      d('split-squat', 3, 8, 'each side'),
      variant === 'B' ? d('chinup-prog', 3, null, 'AMRAP, controlled') : d('landmine-press', 3, 6, 'each side'),
      d('band-er-ytw', 2, 10, 'every lift day'), d('hip-tspine-mobility', 1, 1)
    ]);
  }

  // ---------------------------------------------------------------------------
  // VARIANTS — per goal, matched on EXACT age (first match wins). season:'in'
  // rows are used only when the in-season toggle is on.
  // ---------------------------------------------------------------------------
  const VARIANTS = {

    // ================= THROWING =================
    'thr-armcare': [
      { minAge: 0, maxAge: 10, name: 'Arm Care Base (9–10U)',
        weeks: { def: 8, min: 6, max: 8 }, dpw: { def: 3, min: 2, max: 3 },
        armNote: 'Lightest band or NO band at 9–10U',
        description: 'Band + very light DB arm care with short easy catch. No wrist weights at this age.',
        phases: [{ from: 1, to: null, days: [
          day('Arm care', 'low', [d('throwers-ten', 1, 12, '0–1 lb (bodyweight OK), pick 4–6 moves'), d('light-catch', 1, 1, '45–60 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('throwers-ten', 1, 12, '0–1 lb, pick 4–6 moves'), d('light-catch', 1, 1, '45–60 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('throwers-ten', 1, 15, '0–1 lb, pick 4–6 moves'), d('light-catch', 1, 1, '45–60 ft easy')], { arm: true })
        ] }] },
      { minAge: 11, maxAge: 12, name: 'Arm Care Base (11–12U)',
        weeks: { def: 8, min: 6, max: 8 }, dpw: { def: 3, min: 2, max: 3 },
        description: 'Band + light-DB arm care with easy catch to 90 ft. No wrist weights yet.',
        phases: [{ from: 1, to: null, days: [
          day('Arm care', 'low', [d('throwers-ten', 2, 12, '1–2 lb'), d('light-catch', 1, 1, '60–90 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('throwers-ten', 2, 12, '1–2 lb'), d('light-catch', 1, 1, '60–90 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('throwers-ten', 2, 15, '1–2 lb'), d('light-catch', 1, 1, '60–90 ft easy')], { arm: true })
        ] }] },
      { minAge: 13, maxAge: 14, name: 'Arm Care Base (13–14U)',
        weeks: { def: 8, min: 6, max: 8 }, dpw: { def: 3, min: 2, max: 3 },
        description: 'Adds the wrist-weight series on top of bands + light DBs.',
        phases: [{ from: 1, to: null, days: [
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 2, 10, '2–3 lb'), d('light-catch', 1, 1, '90 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 3, 10, '2–3 lb'), d('light-catch', 1, 1, '90 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 2, 10, '2–3 lb'), d('light-catch', 1, 1, '90 ft easy')], { arm: true })
        ] }] },
      { minAge: 15, maxAge: 16, name: 'Arm Care Base (15–16U)',
        weeks: { def: 8, min: 6, max: 8 }, dpw: { def: 3, min: 2, max: 3 },
        description: 'Wrist weights + 3×10 DB block at 3–5 lb.',
        phases: [{ from: 1, to: null, days: [
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 3, 10, '3–5 lb'), d('light-catch', 1, 1, '90–120 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 3, 10, '3–5 lb'), d('light-catch', 1, 1, '90–120 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 3, 10, '3–5 lb'), d('light-catch', 1, 1, '90–120 ft easy')], { arm: true })
        ] }] },
      { minAge: 17, maxAge: 99, name: 'Arm Care Base (17–18U)',
        weeks: { def: 8, min: 6, max: 8 }, dpw: { def: 3, min: 2, max: 3 },
        description: 'Full arm-care stack: wrist weights + 3×10 DB block at 5 lb.',
        phases: [{ from: 1, to: null, days: [
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 3, 10, '5 lb'), d('light-catch', 1, 1, '120 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 3, 10, '5 lb'), d('light-catch', 1, 1, '120 ft easy')], { arm: true }),
          day('Arm care', 'low', [d('wrist-weight-drills', 1, 10), d('throwers-ten', 3, 10, '5 lb'), d('light-catch', 1, 1, '120 ft easy')], { arm: true })
        ] }] }
    ],

    'thr-base': [
      { minAge: 0, maxAge: 12, name: 'Long-Toss Base (capped)',
        weeks: { def: 6, min: 6, max: 6 }, dpw: { def: 3, min: 3, max: 3 },
        description: 'Capped low-arc long toss. NO pull-downs at this age — firm on-a-line throws substitute from week 3.',
        capNote: true,
        phases: [
          { from: 1, to: 2, days: [
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'extend to the CAP ft ceiling, low arc')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'extend to the CAP ft ceiling, low arc')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'extend to the CAP ft ceiling, low arc')], { arm: true })
          ] },
          { from: 3, to: null, days: [
            day('Stretch-out + firm throws', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft ceiling'), d('online-firm-throws', 1, 10, '60–90 ft, firm NOT max')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft ceiling')], { arm: true }),
            day('Stretch-out + firm throws', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft ceiling'), d('online-firm-throws', 1, 10, '60–90 ft, firm NOT max')], { arm: true })
          ] }
        ] },
      { minAge: 13, maxAge: 14, name: 'Long-Toss Base (13–14U)',
        weeks: { def: 6, min: 6, max: 6 }, dpw: { def: 4, min: 4, max: 4 },
        // Weekly max-intent pull-downs (weeks 3–6) — same in-season lock as the
        // weighted-ball and OU-bat blocks: game pitching + scheduled max-intent
        // throwing don't stack.
        offSeasonOnly: true,
        description: 'Week 1 ramps at 3 throwing days; weeks 2–6 run 4. Pull-downs 10–15 from week 3 (hold 10–15 weeks 5–6); flat-ground change-ups from week 3.',
        capNote: true,
        phases: [
          { from: 1, to: 1, days: [
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Week-1 ramp — easy only', 'recovery', [d('light-catch', 1, 1, 'easy catch only this week')])
          ] },
          { from: 2, to: 2, days: [
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true })
          ] },
          { from: 3, to: null, highPhase: true, days: [
            day('Stretch-out + pull-downs', 'high', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('longtoss-pulldowns', 1, 12, '10–15 pull-downs, on a line')], { arm: true }),
            day('Stretch-out + change-ups', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('flatground-changeup', 1, 12, '10–15 change-ups')], { arm: true }),
            day('Stretch-out + pull-downs', 'high', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('longtoss-pulldowns', 1, 12, 'hold 10–15 — do not add volume')], { arm: true }),
            day('Easy day', 'low', [d('light-catch', 1, 1, 'easy catch'), d('flatground-changeup', 1, 10)], { arm: true })
          ] }
        ] },
      { minAge: 15, maxAge: 99, name: 'Long-Toss Base (HS)',
        weeks: { def: 6, min: 6, max: 6 }, dpw: { def: 4, min: 4, max: 4 },
        offSeasonOnly: true, // pull-downs weeks 3–6 = max-intent work
        description: 'Pull-downs from week 3, building to 20–25 in weeks 5–6.',
        capNote: true,
        phases: [
          { from: 1, to: 2, days: [
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Stretch-out', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')], { arm: true }),
            day('Easy day', 'recovery', [d('light-catch', 1, 1, 'easy catch')])
          ] },
          { from: 3, to: 4, highPhase: true, days: [
            day('Stretch-out + pull-downs', 'high', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('longtoss-pulldowns', 1, 12, '10–15 pull-downs')], { arm: true }),
            day('Stretch-out + change-ups', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('flatground-changeup', 1, 12)], { arm: true }),
            day('Stretch-out + pull-downs', 'high', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('longtoss-pulldowns', 1, 12, '10–15 pull-downs')], { arm: true }),
            day('Easy day', 'low', [d('light-catch', 1, 1, 'easy catch')], { arm: true })
          ] },
          { from: 5, to: null, days: [
            day('Stretch-out + pull-downs', 'high', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('longtoss-pulldowns', 1, 22, 'build to 20–25 pull-downs')], { arm: true }),
            day('Stretch-out + change-ups', 'medium', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('flatground-changeup', 1, 12)], { arm: true }),
            day('Stretch-out + pull-downs', 'high', [d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('longtoss-pulldowns', 1, 22, '20–25 pull-downs')], { arm: true }),
            day('Easy day', 'low', [d('light-catch', 1, 1, 'easy catch')], { arm: true })
          ] }
        ] }
    ],

    'thr-velo': [
      // A < 13 handled by eligibility (LOCKED, substitute thr-base) — no variant.
      { minAge: 13, maxAge: 14, name: 'Velocity Foundations (13–14U)',
        weeks: { def: 8, min: 8, max: 8 }, dpw: { def: 4, min: 4, max: 4 }, pattern: [1, 3, 5, 6],
        // Weekly max-intent pull-down day (weeks 5–8): in-season lock matches
        // the 15–16 and 17+ velocity blocks — no age gets max-intent velocity
        // work stacked on top of game pitching.
        ageGateMin: 13, offSeasonOnly: true, distExtend: true,
        description: 'NOT a weighted-ball program: plyo drill patterns only (nothing over 1000 g, drill intent), long toss to the age cap, and 10–15 pull-downs on ONE day per week starting week 5. Lower body twice a week.',
        safety: ['No ball heavier than 5 oz is ever thrown at max intent at this age.',
          'Pull-downs are the only max-intent work, weeks 5–8, one day per week.'],
        phases: [
          { from: 1, to: 4, days: [
            day('Plyo patterns + long toss + lower', 'medium', [
              d('plyo-reverse-throws', 1, 10, '1×5 @1000 g + 1×5 @450 g'), d('plyo-pivot-pickoffs', 1, 10, '@450 g'),
              d('plyo-rollins', 1, 10, '1×5 @450 g + 1×5 @225 g'),
              d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'),
              d('medball-scoop', 3, 5, '6 lb, each side'), d('goblet-squat', 3, 8), d('hinge-glute-bridge', 3, 10)
            ], { arm: true }),
            day('Plyo patterns + long toss', 'medium', [
              d('plyo-reverse-throws', 1, 10, '1×5 @1000 g + 1×5 @450 g'), d('plyo-rollins', 1, 10, '1×5 @450 g + 1×5 @225 g'),
              d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'), d('medball-scoop', 3, 5, '6 lb, each side')
            ], { arm: true }),
            day('Plyo patterns + long toss + lower', 'medium', [
              d('plyo-pivot-pickoffs', 1, 10, '@450 g'), d('plyo-rollins', 1, 10, '1×5 @450 g + 1×5 @225 g'),
              d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'),
              d('medball-scoop', 3, 5, '6 lb, each side'), d('goblet-squat', 3, 8), d('hinge-glute-bridge', 3, 10)
            ], { arm: true }),
            day('Light catch', 'recovery', [d('light-catch', 1, 1, 'easy — recovery day')])
          ] },
          { from: 5, to: null, highPhase: true, days: [
            day('Pull-down day (the ONE high day)', 'high', [
              d('plyo-reverse-throws', 1, 10, '1×5 @1000 g + 1×5 @450 g'), d('plyo-rollins', 1, 10),
              d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'),
              d('longtoss-pulldowns', 1, 12, '10–15 pull-downs — the only max-intent work this week'),
              d('medball-scoop', 3, 5, '6 lb, each side'), d('goblet-squat', 3, 8)
            ], { arm: true }),
            day('Plyo patterns + long toss', 'low', [
              d('plyo-pivot-pickoffs', 1, 10, '@450 g'), d('plyo-rollins', 1, 10),
              d('longtoss-stretchout', 1, 1, 'easy day after the high day'), d('medball-scoop', 3, 5, '6 lb, each side')
            ], { arm: true }),
            day('Plyo patterns + long toss + lower', 'medium', [
              d('plyo-reverse-throws', 1, 10), d('plyo-rollins', 1, 10),
              d('longtoss-stretchout', 1, 1, 'to the CAP ft cap'),
              d('goblet-squat', 3, 8), d('hinge-glute-bridge', 3, 10)
            ], { arm: true }),
            day('Light catch', 'recovery', [d('light-catch', 1, 1, 'easy — recovery day')])
          ] }
        ] },
      { minAge: 15, maxAge: 16, name: 'Weighted-Ball On-Ramp (15–16U)',
        weeks: { def: 8, min: 8, max: 8 }, dpw: { def: 5, min: 5, max: 5 },
        ageGateMin: 15, offSeasonOnly: true, confirms: ['maturityConfirmed', 'painFree'], distExtend: true,
        description: 'Weeks 1–4: ZERO max intent (plyo patterns + long toss + 2 lift days). Weeks 5–8: ONE high day per week — the weighted-ball ladder OR 15–20 long-toss pull-downs, never both — always followed by 2 low days.',
        safety: ['Requires physician-confirmed skeletal maturity and a pain-free arm (Reinold 2018: 24% injury rate in unmanaged weighted-ball programs).',
          'Off-season only. Any elbow/shoulder pain terminates the block.'],
        phases: [
          { from: 1, to: 4, days: [
            day('Throw — patterns only', 'medium', [
              d('plyo-reverse-throws', 1, 10), d('plyo-pivot-pickoffs', 1, 10), d('plyo-rollins', 1, 10),
              d('plyo-stepbacks', 1, 6, '1×2 each @225/150/100 g'), d('plyo-walking-windups', 1, 6, '1×2 each @225/150/100 g'),
              d('longtoss-stretchout', 1, 1, 'to the CAP ft cap — ZERO max intent weeks 1–4')
            ], { arm: true }),
            liftDayMiddleA(),
            day('Throw — patterns only', 'medium', [
              d('plyo-reverse-throws', 1, 10), d('plyo-rollins', 1, 10), d('plyo-walking-windups', 1, 6),
              d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')
            ], { arm: true }),
            liftDayMiddleB(),
            day('Throw — patterns + long toss', 'medium', [
              d('plyo-pivot-pickoffs', 1, 10), d('plyo-stepbacks', 1, 6), d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')
            ], { arm: true })
          ] },
          { from: 5, to: null, highPhase: true, days: [
            day('HIGH day — ladder OR pull-downs', 'high', [
              d('plyo-reverse-throws', 1, 10), d('plyo-rollins', 1, 10),
              d('longtoss-stretchout', 1, 1, 'full stretch-out first'),
              d('weighted-ball-ladder', 1, 1, '5–8 throws each 6/5/4 oz — OR 15–20 long-toss pull-downs, NEVER both')
            ], { arm: true }),
            liftDayMiddleA(),
            day('Low day (post-high recovery)', 'low', [
              d('plyo-rollins', 1, 10), d('light-catch', 1, 1, 'easy catch — low day 1 of 2 after the high day')
            ], { arm: true }),
            liftDayMiddleB(),
            day('Medium throw day', 'medium', [
              d('plyo-pivot-pickoffs', 1, 10), d('plyo-walking-windups', 1, 6), d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')
            ], { arm: true })
          ] }
        ] },
      { minAge: 17, maxAge: 99, name: 'Full Off-Season Velocity Block (17–18U)',
        weeks: { def: 16, min: 12, max: 16 }, dpw: { def: 5, min: 5, max: 5 },
        ageGateMin: 16, offSeasonOnly: true, confirms: ['painFree'],
        description: 'Weeks 1–4 on-ramp; middle weeks waved High/Medium/Low with ONE high day per week (a second from week 9, ≥72 h apart) and ≤25 high-intent throws per week; final 4 weeks taper with 2 bullpens/week (20–35 pitches, FB/CH first, then breaking).',
        safety: ['High days never sit on adjacent weekdays; second weekly high day (weeks 9+) is ≥72 h after the first.',
          '≤25 max-intent throws per week in the velocity phase.', 'Off-season only.'],
        phases: [
          { from: 1, to: 4, days: [
            day('On-ramp throw (medium)', 'medium', [
              d('plyo-reverse-throws', 1, 10), d('plyo-pivot-pickoffs', 1, 10), d('plyo-rollins', 1, 10),
              d('plyo-stepbacks', 1, 6), d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')
            ], { arm: true }),
            liftDayHS('A'),
            day('Low throw day', 'low', [d('plyo-rollins', 1, 10), d('light-catch', 1, 1, 'easy')], { arm: true }),
            liftDayHS('B'),
            day('On-ramp throw (medium)', 'medium', [
              d('plyo-walking-windups', 1, 6), d('plyo-rollins', 1, 10), d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')
            ], { arm: true })
          ] },
          { from: 5, to: 8, highPhase: true, days: [
            day('HIGH day', 'high', [
              d('plyo-reverse-throws', 1, 10), d('plyo-rollins', 1, 10), d('longtoss-stretchout', 1, 1, 'full stretch-out first'),
              d('weighted-ball-ladder', 1, 1, '5–8 each 6/5/4 oz — or run-and-gun 3–5 each 7/6/5/4 oz; ≤25 high-intent throws/wk')
            ], { arm: true }),
            liftDayHS('A'),
            day('Recovery throw day', 'recovery', [d('plyo-rollins', 1, 10), d('light-catch', 1, 1, 'easy')], { arm: true }),
            liftDayHS('B'),
            day('Medium throw day', 'medium', [
              d('plyo-walking-windups', 1, 6), d('longtoss-stretchout', 1, 1, 'to the CAP ft cap')
            ], { arm: true })
          ] },
          { from: 9, to: -5, days: [
            day('HIGH day 1', 'high', [
              d('plyo-reverse-throws', 1, 10), d('plyo-rollins', 1, 10), d('longtoss-stretchout', 1, 1, 'full stretch-out first'),
              d('weighted-ball-ladder', 1, 1, '5–8 each 6/5/4 oz — ≤25 high-intent throws across BOTH high days')
            ], { arm: true }),
            liftDayHS('A'),
            day('Low throw day', 'low', [d('plyo-rollins', 1, 10), d('light-catch', 1, 1, 'easy')], { arm: true }),
            day('HIGH day 2 (≥72 h after day 1)', 'high', [
              d('plyo-rollins', 1, 10), d('longtoss-stretchout', 1, 1, 'stretch-out first'),
              d('run-and-gun', 1, 1, '3–5 throws each 7/6/5/4 oz — only if fully recovered from Monday')
            ], { arm: true }),
            liftDayHS('B')
          ] },
          { from: -4, to: -1, days: [
            day('Bullpen (taper)', 'high', [
              d('longtoss-stretchout', 1, 1, 'stretch-out first'),
              d('bullpen-blend', 1, 1, '20–35 pitches — FB/CH first, then breaking; counts against Pitch Smart')
            ], { arm: true }),
            liftDayHS('A'),
            day('Low throw day', 'low', [d('plyo-rollins', 1, 10), d('light-catch', 1, 1, 'easy')], { arm: true }),
            day('Bullpen (taper)', 'high', [
              d('longtoss-stretchout', 1, 1, 'stretch-out first'),
              d('bullpen-blend', 1, 1, '20–35 pitches — FB/CH first, then breaking')
            ], { arm: true }),
            liftDayHS('B')
          ] }
        ] }
    ],

    'thr-rfs': [
      { minAge: 0, maxAge: 12, name: 'Return-to-Throw ITP (9–12U)',
        weeks: { def: 4, min: 4, max: 4 }, dpw: { def: 3, min: 3, max: 3 }, lockSchedule: true,
        description: 'Interval-throwing ladder from 30 ft, CAPPED at the 90-ft phase. Every-other-day only. Advance only when the soreness rules pass — never by date.',
        rfs: { steps: [
          { ft: 30, plan: 'Warm-up toss → 2×15 throws @ 30 ft (2-min rest between sets) → cool-down' },
          { ft: 30, plan: 'Warm-up toss → 3×15 throws @ 30 ft → cool-down' },
          { ft: 45, plan: 'Warm-up toss → 2×15 throws @ 45 ft → cool-down' },
          { ft: 45, plan: 'Warm-up toss → 3×15 throws @ 45 ft → cool-down' },
          { ft: 60, plan: 'Warm-up toss → 2×15 throws @ 60 ft → cool-down' },
          { ft: 60, plan: 'Warm-up toss → 3×15 throws @ 60 ft → cool-down' },
          { ft: 75, plan: 'Warm-up toss → 2×15 throws @ 75 ft → cool-down' },
          { ft: 75, plan: 'Warm-up toss → 3×15 throws @ 75 ft → cool-down' },
          { ft: 90, plan: 'Warm-up toss → 2×15 throws @ 90 ft → cool-down' },
          { ft: 90, plan: 'Warm-up toss → 3×15 throws @ 90 ft → cool-down — ladder complete (90-ft cap at this age)' }
        ], graduation: 'Ladder complete — return to normal age-capped catch play. Do NOT extend beyond 90 ft at this age.' } },
      { minAge: 13, maxAge: 15, name: 'Return-to-Throw ITP (13–15)',
        weeks: { def: 4, min: 4, max: 4 }, dpw: { def: 3, min: 3, max: 3 }, lockSchedule: true,
        description: 'Texas Children’s 13–15 ladder: 12 steps to 120 ft, every-other-day, soreness-gated.',
        rfs: { steps: [
          { ft: 45, plan: 'Warm-up toss → 2×15 throws @ 45 ft (2-min rest) → cool-down' },
          { ft: 45, plan: 'Warm-up toss → 3×15 throws @ 45 ft → cool-down' },
          { ft: 60, plan: 'Warm-up toss → 2×15 throws @ 60 ft → cool-down' },
          { ft: 60, plan: 'Warm-up toss → 3×15 throws @ 60 ft → cool-down' },
          { ft: 90, plan: 'Warm-up toss → 2×15 throws @ 90 ft → cool-down' },
          { ft: 90, plan: 'Warm-up toss → 3×15 throws @ 90 ft → cool-down' },
          { ft: 105, plan: 'Warm-up toss → 2×15 throws @ 105 ft → cool-down' },
          { ft: 105, plan: 'Warm-up toss → 3×15 throws @ 105 ft → cool-down' },
          { ft: 120, plan: 'Warm-up toss → 2×15 throws @ 120 ft → cool-down' },
          { ft: 120, plan: 'Warm-up toss → 3×15 throws @ 120 ft → cool-down' },
          { ft: 120, plan: 'Warm-up toss → 2×15 @ 120 ft + 15 firm on-a-line throws @ 60 ft → cool-down' },
          { ft: 120, plan: 'Warm-up toss → 3×15 @ 120 ft + position throwing intro → cool-down' }
        ], graduation: 'Ladder complete — resume normal throwing; pitchers begin a gradual mound progression only with clinician sign-off.' } },
      { minAge: 16, maxAge: 16, name: 'Return-to-Throw ITP (16)',
        weeks: { def: 5, min: 5, max: 5 }, dpw: { def: 3, min: 3, max: 3 }, lockSchedule: true,
        description: '16+ ladder: 14 steps to 150 ft, every-other-day, soreness-gated.',
        rfs: { steps: [
          { ft: 45, plan: 'Warm-up toss → 2×15 throws @ 45 ft → cool-down' },
          { ft: 45, plan: 'Warm-up toss → 3×15 throws @ 45 ft → cool-down' },
          { ft: 60, plan: 'Warm-up toss → 2×15 throws @ 60 ft → cool-down' },
          { ft: 60, plan: 'Warm-up toss → 3×15 throws @ 60 ft → cool-down' },
          { ft: 90, plan: 'Warm-up toss → 2×15 throws @ 90 ft → cool-down' },
          { ft: 90, plan: 'Warm-up toss → 3×15 throws @ 90 ft → cool-down' },
          { ft: 105, plan: 'Warm-up toss → 2×15 throws @ 105 ft → cool-down' },
          { ft: 105, plan: 'Warm-up toss → 3×15 throws @ 105 ft → cool-down' },
          { ft: 120, plan: 'Warm-up toss → 2×15 throws @ 120 ft → cool-down' },
          { ft: 120, plan: 'Warm-up toss → 3×15 throws @ 120 ft → cool-down' },
          { ft: 135, plan: 'Warm-up toss → 2×15 throws @ 135 ft → cool-down' },
          { ft: 135, plan: 'Warm-up toss → 3×15 throws @ 135 ft → cool-down' },
          { ft: 150, plan: 'Warm-up toss → 2×15 throws @ 150 ft → cool-down' },
          { ft: 150, plan: 'Warm-up toss → 3×15 throws @ 150 ft → cool-down' }
        ], graduation: 'Ladder complete — resume normal throwing; pitchers start the mound progression (FB 50% → 75%, 20–30 pitches) before ANY breaking pitches.' } },
      { minAge: 17, maxAge: 99, name: 'Return-to-Throw ITP (17–18U)',
        weeks: { def: 6, min: 6, max: 6 }, dpw: { def: 3, min: 3, max: 3 }, lockSchedule: true,
        description: '16 steps to 150 ft (180 for pitchers/strong OF), then the pitcher mound progression (FB 50% → 75%, 20–30 pitches) before breaking pitches.',
        rfs: { steps: [
          { ft: 45, plan: 'Warm-up toss → 2×15 throws @ 45 ft → cool-down' },
          { ft: 45, plan: 'Warm-up toss → 3×15 throws @ 45 ft → cool-down' },
          { ft: 60, plan: 'Warm-up toss → 2×15 throws @ 60 ft → cool-down' },
          { ft: 60, plan: 'Warm-up toss → 3×15 throws @ 60 ft → cool-down' },
          { ft: 90, plan: 'Warm-up toss → 2×15 throws @ 90 ft → cool-down' },
          { ft: 90, plan: 'Warm-up toss → 3×15 throws @ 90 ft → cool-down' },
          { ft: 105, plan: 'Warm-up toss → 2×15 throws @ 105 ft → cool-down' },
          { ft: 105, plan: 'Warm-up toss → 3×15 throws @ 105 ft → cool-down' },
          { ft: 120, plan: 'Warm-up toss → 2×15 throws @ 120 ft → cool-down' },
          { ft: 120, plan: 'Warm-up toss → 3×15 throws @ 120 ft → cool-down' },
          { ft: 135, plan: 'Warm-up toss → 2×15 throws @ 135 ft → cool-down' },
          { ft: 135, plan: 'Warm-up toss → 3×15 throws @ 135 ft → cool-down' },
          { ft: 150, plan: 'Warm-up toss → 2×15 throws @ 150 ft → cool-down' },
          { ft: 150, plan: 'Warm-up toss → 3×15 throws @ 150 ft → cool-down' },
          { ft: 180, plan: 'Pitchers/strong OF only: warm-up → 2×15 throws @ 165–180 ft → cool-down' },
          { ft: 180, plan: 'Pitchers/strong OF only: warm-up → 3×15 throws @ 180 ft → cool-down' }
        ],
        pitcherSteps: [
          { ft: 60, plan: 'MOUND: warm-up + long toss → 20 fastballs @ 50% off the mound → cool-down' },
          { ft: 60, plan: 'MOUND: warm-up + long toss → 25–30 fastballs @ 75% → cool-down. Breaking pitches only AFTER pain-free 75% fastballs.' }
        ],
        graduation: 'Ladder + mound progression complete — breaking pitches may return only after pain-free 75% fastballs.' } }
    ],

    // ================= HITTING =================
    'hit-contact': [
      { minAge: 0, maxAge: 12, name: 'Contact Builder (youth)',
        weeks: { def: 4, min: 4, max: 4 }, dpw: { def: 3, min: 3, max: 3 },
        emphasis: { ev: 'tee-max-intent', bs: 'light-bat-speed' },
        description: 'Tee → toss → machine → live tier ladder. Advance a tier only at ≥70% quality contact.',
        phases: [{ from: 1, to: null, days: [
          day('Day A — tee focus', 'medium', [d('dynamic-warmup', 1, 1), d('tee-contact-ladder', 3, 6), d('soft-toss-tracking', 2, 6), d('wiffle-barrel', 1, 6)]),
          day('Day B — front-toss focus', 'medium', [d('dynamic-warmup', 1, 1), d('front-toss-location', 3, 6), d('oppo-round', 2, 6)]),
          day('Day C — game transfer', 'medium', [d('dynamic-warmup', 1, 1), d('machine-velocity-ladder', 2, 6, 'game −5 / game speed — helmet + L-screen'), d('live-bp-plan', 2, 6, 'one approach constraint')])
        ] }],
        totalNote: '50–75 swings per session' },
      { minAge: 0, maxAge: 12, season: 'in', name: 'Contact Maintenance (youth, in-season)',
        weeks: { def: 4, min: 4, max: 6 }, dpw: { def: 2, min: 2, max: 2 },
        description: 'Two short sessions a week around games. ONE full rest day per week is mandatory.',
        phases: [{ from: 1, to: null, days: [
          day('Short session', 'low', [d('tee-contact-ladder', 2, 6), d('front-toss-location', 3, 6)]),
          day('Short session', 'low', [d('soft-toss-tracking', 2, 6), d('front-toss-location', 3, 6)])
        ] }] },
      { minAge: 13, maxAge: 15, name: 'Contact & Approach (13–15)',
        weeks: { def: 5, min: 4, max: 6 }, dpw: { def: 4, min: 4, max: 4 },
        emphasis: { ev: 'tee-max-intent', bs: 'light-bat-speed' },
        description: '60–90 swings/day. Machine climbs +2–3 mph after ≥70% quality contact for 2 straight sessions. Random-interleaved rounds from week 3.',
        phases: [
          { from: 1, to: 2, days: [
            day('A — tee ladder + thirds + oppo', 'medium', [d('dynamic-warmup', 1, 1), d('tee-contact-ladder', 3, 6, 'ladder + thirds of the zone'), d('oppo-round', 2, 6)]),
            day('B — locations + machine', 'medium', [d('dynamic-warmup', 1, 1), d('front-toss-location', 3, 6, 'called locations'), d('machine-velocity-ladder', 2, 6, 'game −10% to start')]),
            day('C — mixed speed + two-strike', 'medium', [d('dynamic-warmup', 1, 1), d('machine-velocity-ladder', 2, 6, 'mixed speeds'), d('two-strike-round', 2, 6)]),
            day('D — live with a plan', 'medium', [d('dynamic-warmup', 1, 1), d('live-bp-plan', 4, 6, 'one approach constraint per round')])
          ] },
          { from: 3, to: null, days: [
            day('A — random-interleaved tee/oppo', 'medium', [d('dynamic-warmup', 1, 1), d('tee-contact-ladder', 3, 6, 'RANDOM order this week — mix contact points'), d('oppo-round', 2, 6)]),
            day('B — locations + machine (+2–3 mph at ≥70%)', 'medium', [d('dynamic-warmup', 1, 1), d('front-toss-location', 3, 6), d('machine-velocity-ladder', 2, 6, '+2–3 mph after 2 sessions ≥70% quality contact')]),
            day('C — mixed speed + two-strike', 'medium', [d('dynamic-warmup', 1, 1), d('machine-velocity-ladder', 2, 6, 'mixed speeds, random'), d('two-strike-round', 2, 6)]),
            day('D — live with a plan', 'medium', [d('dynamic-warmup', 1, 1), d('live-bp-plan', 4, 6, 'one approach constraint per round')])
          ] }
        ] },
      { minAge: 13, maxAge: 15, season: 'in', name: 'Contact Maintenance (13–15, in-season)',
        weeks: { def: 4, min: 4, max: 6 }, dpw: { def: 3, min: 3, max: 3 },
        description: '3 structured days around games. No overload/underload bats in-season; the high-intent day runs only in light game weeks.',
        phases: [{ from: 1, to: null, days: [
          day('Quality tee/toss', 'low', [d('tee-contact-ladder', 2, 6), d('front-toss-location', 3, 6)]),
          day('Machine at game speed', 'medium', [d('machine-velocity-ladder', 2, 6, 'game speed')]),
          day('Short high-intent (light game weeks only)', 'medium', [d('front-toss-max', 2, 5, 'skip in heavy game weeks'), d('two-strike-round', 1, 6)])
        ] }] },
      { minAge: 16, maxAge: 99, name: 'Contact & Recognition (16+)',
        weeks: { def: 6, min: 4, max: 6 }, dpw: { def: 5, min: 5, max: 6 },
        emphasis: { ev: 'tee-max-intent', bs: 'light-bat-speed' },
        description: '80–120 swings/day across precision, velocity, live constraints, recognition, and scored competition days.',
        phases: [{ from: 1, to: null, days: [
          day('D1 — tee precision + toss', 'medium', [d('dynamic-warmup', 1, 1), d('tee-contact-ladder', 3, 6), d('front-toss-location', 3, 6)]),
          day('D2 — machine velocity ladder', 'medium', [d('dynamic-warmup', 1, 1), d('machine-velocity-ladder', 3, 6, 'game −5 / game / +5 mph — helmet + L-screen')]),
          day('D3 — live with constraints', 'high', [d('dynamic-warmup', 1, 1), d('live-bp-plan', 5, 6, 'one constraint per round')]),
          day('D4 — mixed-pitch recognition', 'medium', [d('dynamic-warmup', 1, 1), d('mixed-pitch-recognition', 4, 6, 'decisions graded, not contact')]),
          day('D5 — competition round', 'high', [d('dynamic-warmup', 1, 1), d('competition-round', 3, 6, 'scored live rounds')]),
          day('D6 — light / recovery', 'recovery', [d('soft-toss-tracking', 2, 6, 'light day'), d('hip-tspine-mobility', 1, 1)])
        ] }] },
      { minAge: 16, maxAge: 99, season: 'in', name: 'Contact Maintenance (16+, in-season)',
        weeks: { def: 4, min: 4, max: 6 }, dpw: { def: 4, min: 3, max: 4 },
        description: '3–4 structured days: quality tee/toss, machine/velocity, one short high-intent day in the lightest week, one optional light day.',
        phases: [{ from: 1, to: null, days: [
          day('Quality tee/toss', 'low', [d('tee-contact-ladder', 2, 6), d('front-toss-location', 3, 6)]),
          day('Machine / velocity', 'medium', [d('machine-velocity-ladder', 3, 6, 'game speed ± 5')]),
          day('Short high-intent (lightest week only)', 'medium', [d('front-toss-max', 2, 5), d('competition-round', 1, 6)]),
          day('Optional light', 'recovery', [d('soft-toss-tracking', 2, 6), d('hip-tspine-mobility', 1, 1)])
        ] }] }
    ],

    'hit-power': [
      { minAge: 0, maxAge: 12, name: 'Power Foundations (youth)',
        weeks: { def: 4, min: 4, max: 4 }, dpw: { def: 5, min: 5, max: 5 },
        emphasis: { ev: 'tee-max-intent', bs: 'light-bat-speed' },
        description: '3 hitting days (max-intent swings + 4-lb med-ball scoops + contact maintenance) auto-paired with 2 youth athletic-strength days. NO weighted bats at this age. Requires a contact base — run Contact Builder first if quality contact is under 70%.',
        safety: ['No overload/underload bats before −3 BBCOR / post-PHV.'],
        phases: [{ from: 1, to: null, days: [
          day('Hit 1 — intent + contact', 'medium', [d('dynamic-warmup', 1, 1), d('medball-scoop', 2, 5, '4 lb, each side'), d('tee-max-intent', 2, 5, 'track best tee EV weekly'), d('tee-contact-ladder', 2, 6, 'contact maintenance')]),
          liftDayYouth('Strength (youth) A'),
          day('Hit 2 — intent + fun', 'medium', [d('dynamic-warmup', 1, 1), d('medball-scoop', 2, 5, '4 lb, each side'), d('front-toss-max', 2, 5), s('"Over the fence" round — 6 swings, full intent, make it fun')]),
          day('Strength (youth) B', 'medium', [d('dynamic-warmup', 1, 1), d('band-row', 2, 10), d('split-squat', 2, 8, 'each side'), d('farmer-carry', 2, 1, '20 yd per trip'), d('broad-jump', 2, 3), d('jump-play', 1, 1)]),
          day('Hit 3 — intent + barrel', 'medium', [d('dynamic-warmup', 1, 1), d('tee-max-intent', 2, 5), d('front-toss-location', 2, 6), d('wiffle-barrel', 1, 6)])
        ] }] },
      { minAge: 13, maxAge: 15, name: 'Power Block (13–15)',
        weeks: { def: 6, min: 6, max: 6 }, dpw: { def: 6, min: 6, max: 6 },
        emphasis: { ev: 'tee-max-intent', bs: 'light-bat-speed' },
        description: '4 hitting days (6-lb med-ball 3×5/side before swinging) + 2 light-load strength days (NSCA 1–3×6–15).',
        phases: [{ from: 1, to: null, days: [
          day('Hit 1 — max intent', 'medium', [d('dynamic-warmup', 1, 1), d('medball-scoop', 3, 5, '6 lb, each side — pre-swing'), d('tee-max-intent', 2, 5), d('tee-contact-ladder', 2, 6)]),
          liftDayMiddleA(),
          day('Hit 2 — toss intent', 'medium', [d('dynamic-warmup', 1, 1), d('medball-scoop', 3, 5, '6 lb, each side'), d('front-toss-max', 3, 5), d('oppo-round', 2, 6)]),
          liftDayMiddleB(),
          day('Hit 3 — machine transfer', 'medium', [d('dynamic-warmup', 1, 1), d('medball-scoop', 3, 5, '6 lb, each side'), d('machine-velocity-ladder', 2, 6, 'game speed'), d('two-strike-round', 1, 6)]),
          day('Hit 4 — live intent', 'high', [d('dynamic-warmup', 1, 1), d('medball-scoop', 3, 5, '6 lb, each side'), d('live-bp-plan', 3, 6, 'drive the gaps')])
        ] }] },
      { minAge: 16, maxAge: 99, name: 'Power Block (16+)',
        weeks: { def: 8, min: 6, max: 12 }, dpw: { def: 6, min: 6, max: 6 }, deloadEvery: 4,
        emphasis: { ev: 'tee-max-intent', bs: 'light-bat-speed' },
        description: 'Hitting days with 8–10-lb med-ball work + progressive lifting. Every 4th week is a deload (volume cut ~30–40%).',
        phases: [{ from: 1, to: null, days: [
          day('Hit 1 — max intent', 'medium', [d('dynamic-warmup', 1, 1), d('medball-scoop', 3, 5, '8–10 lb, each side'), d('tee-max-intent', 3, 5), d('front-toss-max', 2, 5)]),
          liftDayHS('A'),
          day('Hit 2 — machine + oppo', 'medium', [d('dynamic-warmup', 1, 1), d('medball-scoop', 3, 5, '8–10 lb, each side'), d('machine-velocity-ladder', 3, 6), d('oppo-round', 2, 6)]),
          liftDayHS('B'),
          day('Hit 3 — live intent', 'high', [d('dynamic-warmup', 1, 1), d('medball-scoop', 3, 5, '8–10 lb, each side'), d('live-bp-plan', 4, 6, 'A-swings only')]),
          day('Hit 4 — light + speed', 'low', [d('soft-toss-tracking', 2, 6, 'light day'), d('sprints-accel', 1, 5, '4–6 × 10–30 yd, full recovery'), d('hip-tspine-mobility', 1, 1)])
        ] }] },
      { minAge: 0, maxAge: 99, season: 'in', name: 'Power Maintenance (in-season)',
        weeks: { def: 4, min: 4, max: 6 }, dpw: { def: 2, min: 2, max: 3 },
        description: 'In-season: hold intent with short med-ball + tee doses around games. No overload bats; one full rest day per week is mandatory.',
        phases: [{ from: 1, to: null, days: [
          day('Short intent session', 'low', [d('medball-scoop', 2, 5, 'age-right ball'), d('tee-max-intent', 2, 5), d('tee-contact-ladder', 2, 6)]),
          day('Short intent session', 'low', [d('medball-scoop', 2, 5), d('front-toss-max', 2, 5)]),
          day('Optional light', 'recovery', [d('soft-toss-tracking', 2, 6), d('hip-tspine-mobility', 1, 1)])
        ] }] }
    ],

    'hit-batspeed': [
      // A<13: engine substitutes the youth-safe variant below (no OU bats, label kept).
      { minAge: 0, maxAge: 12, name: 'Bat Speed (youth — overload bats locked)', youthSub: true,
        weeks: { def: 4, min: 4, max: 4 }, dpw: { def: 3, min: 3, max: 3 },
        emphasis: { ev: 'tee-max-intent', bs: 'light-bat-speed' },
        description: 'Overload/underload bats are LOCKED before −3 BBCOR / post-PHV — this block builds bat speed the age-right way: light-bat speed rounds (speed without load) + max-intent swings + 4-lb med-ball power.',
        safety: ['NO overload/underload bats before −3 BBCOR / post-PHV.'],
        phases: [{ from: 1, to: null, days: [
          day('Speed day A', 'medium', [d('dynamic-warmup', 1, 1), d('light-bat-speed', 2, 8, 'broomstick — max speed, zero load'), d('medball-scoop', 2, 5, '4 lb, each side'), d('tee-max-intent', 2, 5), d('tee-contact-ladder', 2, 6, 'contact maintenance')]),
          day('Speed day B', 'medium', [d('dynamic-warmup', 1, 1), d('light-bat-speed', 2, 8), d('medball-scoop', 2, 5, '4 lb'), d('front-toss-max', 2, 5)]),
          day('Speed day C', 'medium', [d('dynamic-warmup', 1, 1), d('light-bat-speed', 2, 8), d('tee-max-intent', 2, 5), d('wiffle-barrel', 1, 6)])
        ] }] },
      { minAge: 13, maxAge: 15, name: 'Overload/Underload Bat Block (13–15)',
        weeks: { def: 6, min: 6, max: 6 }, dpw: { def: 3, min: 3, max: 3 },
        offSeasonOnly: true, confirms13: ['minus3Bat'],
        description: 'OU bat block on Mon/Wed/Fri (48 h between sessions). Weeks 1–2 tee only; weeks 3–4 add front toss; weeks 5–6 majority front toss. 100% intent or terminate the round.',
        safety: ['13–14 requires a confirmed −3 BBCOR (or post-PHV) swinger.', 'Off-season only — no OU bats in-season.', '48 h between OU sessions (M/W/F enforced).'],
        phases: [
          { from: 1, to: 2, days: [
            day('OU block — tee only', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'TEE ONLY: game 2×5 → +20% 2–3×5 → −20% 2–3×5 → game max'), d('tee-max-intent', 1, 5, 'sensor bat-speed check')]),
            day('OU block — tee only', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'TEE ONLY'), d('tee-contact-ladder', 2, 6, 'contact maintenance')]),
            day('OU block — tee only', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'TEE ONLY'), d('tee-max-intent', 1, 5, 'weekly bat-speed measure')])
          ] },
          { from: 3, to: 4, days: [
            day('OU block — tee + front toss', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'tee + FRONT TOSS added'), d('front-toss-max', 2, 5)]),
            day('OU block — tee + front toss', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'tee + front toss'), d('tee-contact-ladder', 2, 6)]),
            day('OU block — tee + front toss', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'tee + front toss'), d('tee-max-intent', 1, 5, 'weekly bat-speed measure')])
          ] },
          { from: 5, to: null, days: [
            day('OU block — majority toss', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'MAJORITY front toss'), d('front-toss-max', 2, 5)]),
            day('OU block — majority toss', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'majority front toss'), d('oppo-round', 1, 6)]),
            day('OU block — majority toss', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'majority front toss'), d('tee-max-intent', 1, 5, 'final bat-speed measure')])
          ] }
        ] },
      { minAge: 16, maxAge: 99, name: 'Overload/Underload Bat Block (16+)',
        weeks: { def: 6, min: 6, max: 6 }, dpw: { def: 6, min: 6, max: 6 },
        offSeasonOnly: true,
        description: 'Full OU block M/W/F alternating with lift days. Sensor bat speed measured weekly. Reassess after the block: a gain under 2 mph means the next block should be Power (strength is the limiter).',
        safety: ['Off-season only.', '48 h between OU sessions (M/W/F).'],
        phases: [{ from: 1, to: null, days: [
          day('OU block', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1, 'full protocol — 100% intent or terminate'), d('tee-max-intent', 1, 5, 'weekly sensor bat-speed measure')]),
          liftDayHS('A'),
          day('OU block', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1), d('front-toss-max', 2, 5)]),
          liftDayHS('B'),
          day('OU block', 'high', [d('dynamic-warmup', 1, 1), d('ou-bat-block', 1, 1), d('competition-round', 1, 6)]),
          day('Light / mobility', 'recovery', [d('soft-toss-tracking', 2, 6), d('hip-tspine-mobility', 1, 1)])
        ] }] }
    ],

    // ================= STRENGTH =================
    'str-athletic': [
      { minAge: 0, maxAge: 12, name: 'Athletic Base (9–12U)',
        weeks: { def: 8, min: 6, max: 8 }, dpw: { def: 2, min: 2, max: 3 },
        description: '20–30 min sessions on NON-CONSECUTIVE days: bodyweight patterns, light med-ball, carries, and athletic play. Progression: reps 8 → 15 BEFORE any resistance; a harder variation only after 2 clean weeks.',
        safety: ['No maximal loading, no 1RM testing (AAP/NSCA youth guidelines).'],
        phases: [{ from: 1, to: null, days: [
          day('Athletic circuit A', 'medium', [d('dynamic-warmup', 1, 1), d('bw-squat', 2, 10), d('hinge-glute-bridge', 2, 10), d('pushup-prog', 2, 10), d('band-row', 2, 10), d('farmer-carry', 2, 1, '20 yd per trip'), d('medball-chest', 2, 6), d('medball-scoop', 2, 5, '4 lb, each side'), d('jump-play', 1, 1, '+ single-leg balance')]),
          day('Athletic circuit B', 'medium', [d('dynamic-warmup', 1, 1), d('bw-squat', 2, 12), d('hinge-glute-bridge', 2, 12), d('pushup-prog', 2, 8), d('band-row', 2, 12), d('medball-scoop', 2, 5, '4 lb, each side'), d('jump-play', 1, 1)]),
          day('Athletic circuit C', 'medium', [d('dynamic-warmup', 1, 1), d('bw-squat', 2, 10), d('pushup-prog', 2, 10), d('band-row', 2, 10), d('farmer-carry', 2, 1, '20 yd'), d('medball-chest', 2, 6), d('jump-play', 1, 1)])
        ] }] },
      { minAge: 13, maxAge: 15, name: 'Strength Foundations (13–15)',
        weeks: { def: 10, min: 8, max: 12 }, dpw: { def: 3, min: 2, max: 3 },
        description: 'Goblet/KB patterns + sprints and bounds. Load +5–10% ONLY at the top of the rep range with perfect form (NSCA).',
        safety: ['No 1RM testing before skeletal maturity.'],
        phases: [{ from: 1, to: null, days: [
          liftDayMiddleA(),
          day('Speed + power', 'medium', [d('dynamic-warmup', 1, 1), d('sprints-accel', 1, 5, '4–6 × 10–20 yd, full recovery'), d('lateral-bounds', 3, 3, 'each side'), d('broad-jump', 3, 3), d('medball-shotput', 3, 5, 'each side'), d('chinup-prog', 3, null, 'AMRAP')]),
          liftDayMiddleB()
        ] }] },
      { minAge: 16, maxAge: 99, name: 'Strength Block (16+)',
        weeks: { def: 12, min: 12, max: 12 }, dpw: { def: 5, min: 5, max: 5 }, deloadEvery: 4,
        description: '3 lift days + 2 sprint/agility days. Jumps and throws FIRST in every session; shoulder care + mobility every session; deload every 4th week. NO 1RM — estimate from 3–5RM.',
        safety: ['No 1RM testing; add 2.5–5% only at the top of the range with clean form.'],
        phases: [{ from: 1, to: null, days: [
          liftDayHS('A'),
          day('Sprint / agility', 'medium', [d('dynamic-warmup', 1, 1), d('sprint-mechanics', 1, 1, 'A-skips + wall drills'), d('sprints-accel', 1, 6, '10–30 yd, full recovery'), d('cod-agility', 1, 4, '5-10-5 pattern')]),
          liftDayHS('B'),
          day('Sprint / agility', 'medium', [d('dynamic-warmup', 1, 1), d('sprint-mechanics', 1, 1), d('sprints-accel', 1, 6), d('lateral-bounds', 3, 3, 'each side')]),
          liftDayHS('A')
        ] }] }
    ],

    'str-inseason': [
      { minAge: 0, maxAge: 12, name: 'In-Season Strength (youth)',
        weeks: { def: 8, min: 4, max: 12 }, dpw: { def: 1, min: 1, max: 1 },
        description: 'One day per week, ONE set of each athleticism move — a single weekly dose retains strength in-season (JSCR 1996).',
        phases: [{ from: 1, to: null, days: [
          day('Weekly circuit', 'low', [d('dynamic-warmup', 1, 1), d('bw-squat', 1, 10), d('hinge-glute-bridge', 1, 10), d('pushup-prog', 1, 10), d('band-row', 1, 10), d('medball-chest', 1, 6), d('jump-play', 1, 1)])
        ] }] },
      { minAge: 13, maxAge: 15, name: 'In-Season Strength (13–15)',
        weeks: { def: 8, min: 4, max: 12 }, dpw: { def: 2, min: 1, max: 2 },
        description: '1–2 short full-body days: KEEP the load, cut the volume (1–2 sets).',
        phases: [{ from: 1, to: null, days: [
          day('Full body (short)', 'low', [d('dynamic-warmup', 1, 1), d('goblet-squat', 2, 8, 'keep load, cut volume'), d('kb-rdl', 2, 8), d('pushup-prog', 2, 8), d('band-row', 2, 8), d('band-er-ytw', 2, 10), d('hip-tspine-mobility', 1, 1)]),
          day('Full body (short)', 'low', [d('dynamic-warmup', 1, 1), d('split-squat', 2, 8, 'each side'), d('pallof-press', 2, 10), d('band-row', 2, 8), d('band-er-ytw', 2, 10), d('hip-tspine-mobility', 1, 1)])
        ] }] },
      { minAge: 16, maxAge: 99, name: 'In-Season Strength (16+)',
        weeks: { def: 8, min: 4, max: 16 }, dpw: { def: 2, min: 2, max: 2 },
        description: '2 full-body days at 2–3×5–8, ~80% of off-season loads, NO grinding reps. Lift at least a day before pitching-heavy days (Cressey).',
        phases: [{ from: 1, to: null, days: [
          day('Full body A', 'medium', [d('dynamic-warmup', 1, 1), d('trap-bar-dl', 3, 5, '~80% of off-season load, no grinders'), d('split-squat', 2, 8), d('landmine-press', 2, 6), d('band-er-ytw', 2, 10), d('hip-tspine-mobility', 1, 1)]),
          day('Full body B', 'medium', [d('dynamic-warmup', 1, 1), d('goblet-squat', 3, 8, '~80% loads'), d('chinup-prog', 2, null, 'controlled, stop 2 short of failure'), d('kb-rdl', 2, 8), d('band-er-ytw', 2, 10), d('hip-tspine-mobility', 1, 1)])
        ] }] }
    ]
  };

  window.CT.generatorData = {
    // v2: throwing variants with max-intent pull-downs (thr-base 13+, thr-velo
    // 13–14) became offSeasonOnly — in-season gating is now consistent at all ages.
    RULES_VERSION: 2,
    PATTERNS: PATTERNS,
    DIST_CAP: DIST_CAP,
    CALENDAR_NOTE: CALENDAR_NOTE,
    SORENESS_RULES: SORENESS_RULES,
    DOMAINS: DOMAINS,
    GOALS: GOALS,
    VARIANTS: VARIANTS
  };
})();

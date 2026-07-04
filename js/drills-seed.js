/* drills-seed.js — the CANONICAL seeded drill library (app content, not fake
   user data). Every drill here is referenced by the program generator's
   templates (generator-data.js) and traceable to the research corpus
   (Driveline youth, Jaeger, Wilk/Andrews Thrower's Ten, Texas Children's ITP,
   NSCA/AAP youth strength, Pitch Smart). Seed drills use FIXED deterministic
   ids ('drl_seed_<slug>') so generator references survive rename/edit; drills
   the coach creates keep CT.uid('drl') ids.
   Seeding rules:
     • ensure()      — one-time insert-if-missing (id match), then stamps
                       settings.drillSeedVersion. A coach who deletes a seed
                       keeps it deleted; edits are never overwritten.
     • ensureSlugs() — the generator's self-heal: re-inserts any missing seed
                       drill a generated program references, regardless of the
                       version stamp.
   Exposed on window.CT.seeds. */
(function () {
  'use strict';

  const CT = window.CT;
  const DRILL_SEED_VERSION = 1;
  const ID_PREFIX = 'drl_seed_';

  // slug | category | name | description (dosing baked in; sets×reps are also
  // set per program item at generation time) | equipment
  const SEEDS = [
    // ---------------- THROWING (20) ----------------
    ['dynamic-warmup', 'throwing', 'Dynamic Warm-Up (RAMP)',
      '5–8 min Raise / Activate / Mobilize / Potentiate: light jog, skips, leg swings, arm circles, band pull-aparts. No static stretching before throwing (Driveline youth).', []],
    ['jband-series', 'throwing', 'J-Band Series',
      '1×10 each: forward fly, reverse fly, internal rotation, external rotation, bicep curl, tricep extension. 9–10U: lightest band or no band (Driveline).', ['J-Bands']],
    ['throwers-ten', 'throwing', "Thrower's Ten Light-DB Block",
      'Pick 4–6 of: D2 flexion/extension, ER/IR at 0° + 90° abduction, scaption, prone row, prone horizontal abduction. Standard 3×10, fatiguing by rep 10, ZERO pain (Wilk/Andrews). Youth: 1–2×10–15 at 0–2 lb.', ['Light dumbbells']],
    ['wrist-weight-drills', 'throwing', 'Wrist-Weight Series (13+)',
      'Two-arm swings, two-arm throws, Cuban press, pivot pickoffs — 1×10 each (Driveline youth). 13+ only.', ['Wrist weights']],
    ['light-catch', 'throwing', 'Light Catch Play',
      '5–10 min of easy catch at 45–90 ft, age-scaled. Conversation pace — recovery volume, not work.', ['Baseball', 'Glove']],
    ['recovery-plyocare', 'throwing', 'Recovery Tosses + Pull-Aparts',
      'Plyo/tennis-ball upward toss 2×10 + band pull-aparts 2×10 after throwing. Optional but recommended (Driveline recovery).', ['Plyo or tennis ball', 'Band']],
    ['longtoss-stretchout', 'throwing', 'Long-Toss Stretch-Out',
      'Arc throws, extending distance as the arm allows — "listen to your arm" (Jaeger). Distance ceiling = the age cap on your program; never push through tightness.', ['Baseball']],
    ['longtoss-pulldowns', 'throwing', 'Long-Toss Pull-Downs',
      'Compression phase: come in ~10 ft per throw, ball on a line, shuffle step. MAX INTENT — 15 and older only (Jaeger phase 2).', ['Baseball']],
    ['online-firm-throws', 'throwing', 'Firm On-a-Line Throws (youth)',
      '10 firm throws at 60–90 ft, on a line but NOT max intent. The 9–12U substitute for pull-downs.', ['Baseball']],
    ['flatground-changeup', 'throwing', 'Flat-Ground Change-Ups',
      '10–15 change-ups on flat ground, 13+ only. Fastball + change-up before ANY breaking ball (Pitch Smart).', ['Baseball']],
    ['plyo-reverse-throws', 'throwing', 'Plyo Reverse Throws',
      '1×5 @ 1000 g + 1×5 @ 450 g into a wall/net (Driveline youth volumes). Drill-pattern intent, not max effort.', ['Plyo balls']],
    ['plyo-pivot-pickoffs', 'throwing', 'Plyo Pivot Pickoffs',
      '1×10 @ 450 g. Feel the hips lead the arm.', ['Plyo balls']],
    ['plyo-rollins', 'throwing', 'Plyo Roll-Ins',
      '1×5 @ 450 g + 1×5 @ 225 g. Smooth arm path — regress lighter if the pattern breaks.', ['Plyo balls']],
    ['plyo-stepbacks', 'throwing', 'Plyo Step-Backs',
      '1×2 each @ 225 / 150 / 100 g. Regress lighter if form breaks.', ['Plyo balls']],
    ['plyo-walking-windups', 'throwing', 'Plyo Walking Wind-Ups',
      '1×2 each @ 225 / 150 / 100 g. Momentum + timing, not effort.', ['Plyo balls']],
    ['weighted-ball-ladder', 'throwing', 'Weighted-Ball Pull-Down Ladder (GATED 15+)',
      '5–8 throws each at 6 / 5 / 4 oz descending, max intent. HARD RULES: 15+ with confirmed skeletal maturity; 1 high day/week; OFF-SEASON only; ANY elbow/shoulder pain terminates the block (Reinold 2018 — 24% injury rate in unmanaged programs).', ['Weighted balls']],
    ['run-and-gun', 'throwing', 'Run-and-Gun Pull-Downs (GATED 17+)',
      '3–5 throws each at 7 / 6 / 5 / 4 oz, max intent with a running start. 17+ only; ≥72 h between high days (Driveline velocity phase).', ['Weighted balls']],
    ['bullpen-blend', 'throwing', 'Bullpen (taper)',
      '20–35 pitches: fastball + change-up first, then breaking stuff (17+ only for breaking). Every pitch counts against the Pitch Smart daily budget.', ['Mound', 'Catcher']],
    ['interval-throwing-step', 'throwing', 'Interval Throwing Step (ITP)',
      "One Texas Children's interval-throwing ladder session: warm-up toss, distance blocks with 2-min rests, cool-down. The day's notes carry the exact throws @ feet.", ['Baseball']],
    ['soreness-check', 'throwing', 'Soreness Check (gate)',
      "Texas Children's soreness rules — run BEFORE every ITP step: soreness gone within 15 warm-up throws = continue; soreness persists = stop, take 2 days off, drop back one step; sore more than 1 hour after throwing or the next day = 1 day off, repeat the same step; acute PAIN = stop and get a medical referral.", []],

    // ---------------- HITTING (14) ----------------
    ['tee-contact-ladder', 'hitting', 'Tee Contact-Point Ladder',
      '3×6 through the contact-point ladder (inside / middle / outside, thirds of the zone). Advance a tier only at ≥70% quality contact.', ['Tee', 'Balls']],
    ['tee-max-intent', 'hitting', 'Tee Max-Intent Swings',
      '2×5 at full intent off the tee. Track best tee exit velo weekly — intent is the stimulus.', ['Tee', 'Balls']],
    ['front-toss-location', 'hitting', 'Front-Toss Called Locations',
      '2–3×6 with the feeder calling location before each toss. Contact quality over result.', ['L-screen', 'Balls']],
    ['front-toss-max', 'hitting', 'Front-Toss Max Intent',
      '2–3×5 full-intent swings off front toss. A-swings only — stop the round when intent drops.', ['L-screen', 'Balls']],
    ['soft-toss-tracking', 'hitting', 'Soft-Toss Tracking',
      '2×6 soft toss with eyes tracking ball-to-barrel. Rhythm and barrel accuracy day.', ['Balls']],
    ['wiffle-barrel', 'hitting', 'Wiffle Barrel Accuracy',
      '1×6 with wiffles/mini-balls — pure barrel accuracy, small target, no radar.', ['Wiffle balls']],
    ['two-strike-round', 'hitting', 'Two-Strike Round',
      '1–2×6 with a two-strike approach: choke, spread, battle mode. Compete on every pitch.', ['Balls']],
    ['machine-velocity-ladder', 'hitting', 'Machine Velocity Ladder',
      '2×6 each at game −5 / game / game +5 mph. HELMET + L-SCREEN required (Little League machine-safety guidance).', ['Pitching machine', 'Helmet', 'L-screen']],
    ['live-bp-plan', 'hitting', 'Live BP With a Plan',
      '4–5×6 behind an L-screen with ONE approach constraint per round (e.g. oppo only, gap-to-gap, hunt a zone).', ['L-screen', 'Balls']],
    ['oppo-round', 'hitting', 'Oppo Round',
      '2×6 driving the ball to the opposite field. Let it travel; stay through the big part of the field.', ['Balls']],
    ['mixed-pitch-recognition', 'hitting', 'Mixed-Pitch Recognition (16+)',
      '4×6 with mixed speeds/shapes — swing/take decisions graded, not contact. 16+ only.', ['Machine or live arm']],
    ['ou-bat-block', 'hitting', 'Overload/Underload Bat Block (GATED)',
      'Game bat 2×5 → overload +20% 2–3×5 → underload −20% 2–3×5 → game bat max. 100% intent or terminate the round; 48 h between sessions; OFF-SEASON only; −3 BBCOR / post-PHV (Driveline/Axe/Blast protocol).', ['Overload/underload bats']],
    ['light-bat-speed', 'hitting', 'Light-Bat Speed Rounds',
      '2×8 max-speed swings with a broomstick or ultra-light bat. The pre-puberty bat-speed substitute — speed without load.', ['Broomstick or light bat']],
    ['competition-round', 'hitting', 'Competition Round (16+)',
      'Scored live rounds — points for barrels, quality takes, and situational execution. Compete under pressure. 16+.', ['L-screen', 'Balls']],

    // ---------------- STRENGTH (21) ----------------
    ['medball-scoop', 'strength', 'Med-Ball Rotational Scoop',
      'Rotational scoop toss EACH side, done fresh before lifting (NHSSCA/EBP). Ball: 4 lb youth / 6 lb ages 13–15 / 8–10 lb 16+.', ['Med ball']],
    ['medball-shotput', 'strength', 'Med-Ball Shot-Put Throw',
      'Rotational shot-put throw into a wall, each side. Hips fire first.', ['Med ball']],
    ['medball-chest', 'strength', 'Med-Ball Chest Pass',
      'Explosive two-hand chest pass into a wall or to a partner.', ['Med ball']],
    ['medball-slam', 'strength', 'Med-Ball Slam (13+)',
      'Overhead slam, full-body extension to floor. 13+ only.', ['Med ball']],
    ['bw-squat', 'strength', 'Bodyweight Squat',
      'Full-depth bodyweight squat, tempo control. Own the pattern before any load.', []],
    ['goblet-squat', 'strength', 'Goblet Squat (13+)',
      'Squat holding a dumbbell/kettlebell at the chest. Load only at the top of the rep range with clean form.', ['Dumbbell or kettlebell']],
    ['hinge-glute-bridge', 'strength', 'Hip Hinge + Glute Bridge',
      'Hinge pattern drill + glute bridge. Posterior chain foundation for throwing and sprinting.', []],
    ['kb-rdl', 'strength', 'Kettlebell RDL (13+)',
      'Romanian deadlift with a kettlebell. Flat back, soft knees, hamstrings load the hinge.', ['Kettlebell']],
    ['pushup-prog', 'strength', 'Push-Up Progression',
      'Incline → floor → feet-elevated push-ups. Earn the harder variation with 2 clean weeks.', []],
    ['band-row', 'strength', 'Band Row',
      'Standing or half-kneeling band row. Squeeze the shoulder blade — posture muscle for throwers.', ['Band']],
    ['chinup-prog', 'strength', 'Chin-Up Progression (13+)',
      'Band-assisted → bodyweight chin-ups, AMRAP sets with perfect control.', ['Bar', 'Band']],
    ['split-squat', 'strength', 'Split Squat',
      'Static split squat each side. Single-leg strength + balance under control.', []],
    ['farmer-carry', 'strength', 'Farmer Carry',
      'Heavy-ish carry 20 yd per trip, tall posture, no lean. Grip + trunk.', ['Dumbbells or kettlebells']],
    ['pallof-press', 'strength', 'Pallof Press',
      'Anti-rotation band press each side. The trunk resists — nothing moves.', ['Band']],
    ['broad-jump', 'strength', 'Broad Jump',
      'Standing broad jump, stick the landing. Full recovery between reps.', []],
    ['box-jump', 'strength', 'Box Jump (16+)',
      'Jump to a modest box, step down. Height is not the goal — crisp takeoff is. 16+.', ['Plyo box']],
    ['lateral-bounds', 'strength', 'Lateral Bounds',
      'Skater bounds side-to-side, stick each landing. Lateral power for fielding + base running.', []],
    ['band-er-ytw', 'strength', 'Band ER + Y-T-W',
      'Band external rotation + prone/incline Y-T-W raises — EVERY lift day (Cressey shoulder care).', ['Band']],
    ['hip-tspine-mobility', 'strength', 'Hip + T-Spine Mobility',
      '5 min every session: 90/90 hips, T-spine rotations, thoracic extension over a roller.', ['Foam roller']],
    ['trap-bar-dl', 'strength', 'Trap-Bar Deadlift (16+)',
      'Trap-bar deadlift. Add 2.5–5% ONLY at the top of the rep range with clean form. NO 1RM testing before skeletal maturity (AAP/NSCA) — estimate from 3–5RM.', ['Trap bar']],
    ['landmine-press', 'strength', 'Landmine Press (16+)',
      'Half-kneeling or standing landmine press each side — shoulder-friendly overhead pattern. 16+.', ['Landmine', 'Barbell']],

    // ---------------- SPEED (4) ----------------
    ['sprints-accel', 'speed', 'Acceleration Sprints',
      '4–6 × 10–30 yd sprints at full effort with FULL recovery (walk back + rest). Quality over volume.', ['Cones']],
    ['sprint-mechanics', 'speed', 'Sprint Mechanics (A-Skips / Wall Drills)',
      'A-skips, wall drills, arm-action work. Positions first, speed second.', []],
    ['cod-agility', 'speed', 'Change-of-Direction 5-10-5',
      'Pro-agility 5-10-5 pattern work — low hips through the cut, plant outside foot.', ['Cones']],
    ['jump-play', 'speed', 'Athletic Play (9–12U)',
      'Races, hops, single-leg balance games, tag. Athleticism through PLAY at 9–12U — fun is the program.', []]
  ];

  function idFor(slug) { return ID_PREFIX + slug; }

  function toDrill(row) {
    return {
      id: idFor(row[0]),
      name: row[2],
      category: row[1],
      description: row[3],
      equipment: row[4] || []
    };
  }

  function bySlug(slug) {
    const row = SEEDS.find(function (r) { return r[0] === slug; });
    return row ? toDrill(row) : null;
  }

  function existingIds() {
    const have = {};
    CT.store.all('drills').forEach(function (d) { have[d.id] = true; });
    return have;
  }

  // One-time seed: insert-if-missing by id, then stamp drillSeedVersion.
  // Never overwrites coach edits; never resurrects coach-deleted seeds once
  // the version stamp is current.
  function ensure() {
    const settings = CT.store.getSettings();
    if ((settings.drillSeedVersion || 0) >= DRILL_SEED_VERSION) return 0;
    const have = existingIds();
    let added = 0;
    SEEDS.forEach(function (row) {
      if (have[idFor(row[0])]) return;
      CT.store.insert('drills', toDrill(row));
      added++;
    });
    CT.store.updateSettings({ drillSeedVersion: DRILL_SEED_VERSION });
    if (added) console.info('Diamond Mind: seeded ' + added + ' library drills (v' + DRILL_SEED_VERSION + ').');
    return added;
  }

  // Generator self-heal: re-insert any missing seed drills referenced by a
  // program being generated (ignores the version stamp — a generated program
  // must never point at a deleted drill).
  function ensureSlugs(slugs) {
    const have = existingIds();
    let added = 0;
    (slugs || []).forEach(function (slug) {
      const drill = bySlug(slug);
      if (!drill || have[drill.id]) return;
      CT.store.insert('drills', drill);
      have[drill.id] = true;
      added++;
    });
    return added;
  }

  window.CT.seeds = {
    DRILL_SEED_VERSION: DRILL_SEED_VERSION,
    ID_PREFIX: ID_PREFIX,
    slugs: SEEDS.map(function (r) { return r[0]; }),
    idFor: idFor,
    bySlug: bySlug,
    ensure: ensure,
    ensureSlugs: ensureSlugs
  };
})();

/* demo.js — sample roster for the public demo (?demo=1).

   The live app boots EMPTY and keeps a coach's real players in localStorage, so
   a first-time visitor would only ever see the setup checklist. In demo mode
   store.js points at a separate key ('diamondMind.demo') and this module fills
   it with a FICTIONAL roster: six invented players with assessments, lessons,
   games, arm workload, check-ins, and generated programs.

   Every date is written relative to today, and the roster is rebuilt when the
   seed is more than RESEED_DAYS old, so the demo never looks stale ("last
   lesson 4 months ago"). Nothing here touches 'diamondMind.v3'.

   Exposed on window.CT.demo. Loaded after generator.js, before app.js. */
(function () {
  'use strict';

  const CT = window.CT;
  const store = CT.store;
  const ACTIVE = !!(store && store.isDemo);
  const STAMP_KEY = 'diamondMind.demo.seededAt';
  const RESEED_DAYS = 3;

  // ---- date helpers (local time, ISO yyyy-mm-dd) ----
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function ago(days) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return iso(d);
  }
  // Birthdate that makes the player `years` old today (plus a few months).
  function born(years, monthsPast) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setFullYear(d.getFullYear() - years);
    d.setMonth(d.getMonth() - monthsPast);
    return iso(d);
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ---- the fictional roster ----
  // base: first-assessment numbers; each later assessment improves on them.
  const ROSTER = [
    { key: 'mason', name: 'Mason Reyes', age: 12, mo: 4, bats: 'R', throws: 'R', positions: ['P', 'SS'], jersey: '7',
      notes: 'Sample player. Strong arm for his age — keeping pitch counts honest this fall.',
      base: { exitVeloMax: 62, batSpeed: 50, fastballVelo: 56, maxThrowDist: 150, speedKey: 'thirtyYard', speed: 4.92, homeToFirst: 4.9, heightIn: 59, weightLb: 92 } },
    { key: 'eli', name: 'Eli Thompson', age: 14, mo: 7, bats: 'R', throws: 'R', positions: ['C', '3B'], jersey: '22',
      notes: 'Sample player. Working on transfer speed and pop time.',
      base: { exitVeloMax: 74, batSpeed: 58, fastballVelo: 67, maxThrowDist: 200, speedKey: 'sixtyYard', speed: 7.92, homeToFirst: 4.62, popTime: 2.46, heightIn: 66, weightLb: 138 } },
    { key: 'jax', name: 'Jackson Carter', age: 16, mo: 2, bats: 'L', throws: 'L', positions: ['P', 'OF'], jersey: '11',
      notes: 'Sample player. Lefty starter — off-season strength block in progress.',
      base: { exitVeloMax: 85, batSpeed: 66, fastballVelo: 79, maxThrowDist: 265, speedKey: 'sixtyYard', speed: 7.31, homeToFirst: 4.38, heightIn: 71, weightLb: 165 } },
    { key: 'noah', name: 'Noah Bennett', age: 10, mo: 5, bats: 'R', throws: 'R', positions: ['2B', 'OF'], jersey: '4',
      notes: 'Sample player. First year of lessons — contact and footwork.',
      base: { exitVeloMax: 51, batSpeed: 42, fastballVelo: 46, maxThrowDist: 110, speedKey: 'thirtyYard', speed: 5.41, homeToFirst: 5.3, heightIn: 54, weightLb: 71 } },
    { key: 'caleb', name: 'Caleb Ortiz', age: 13, mo: 9, bats: 'R', throws: 'R', positions: ['P', '1B'], jersey: '18',
      notes: 'Sample player. Growth spurt this year — watching arm workload closely.',
      base: { exitVeloMax: 68, batSpeed: 54, fastballVelo: 62, maxThrowDist: 176, speedKey: 'sixtyYard', speed: 8.38, homeToFirst: 4.76, heightIn: 64, weightLb: 121 } },
    { key: 'owen', name: 'Owen Fischer', age: 17, mo: 1, bats: 'S', throws: 'R', positions: ['SS', '2B'], jersey: '2',
      notes: 'Sample player. Switch hitter building power from the left side.',
      base: { exitVeloMax: 90, batSpeed: 70, fastballVelo: 83, maxThrowDist: 288, speedKey: 'sixtyYard', speed: 7.04, homeToFirst: 4.29, heightIn: 70, weightLb: 172 } }
  ];

  // Three assessments per player: [days ago, improvement step 0..2].
  const ASSESS_DAYS = [70, 35, 6];

  function seedAssessments(p, base) {
    const isCatcher = CT.model.isCatcher(p);
    ASSESS_DAYS.forEach(function (daysAgo, step) {
      const date = ago(daysAgo);
      const modules = ['hitting', 'throwing', 'speed'];
      if (isCatcher) modules.push('fielding');
      if (step !== 1) modules.push('body');
      const session = store.insert('assessmentSessions', {
        playerId: p.id, date: date, type: 'assessment', modules: modules,
        moduleNotes: step === 2 ? { hitting: 'Staying through the ball better — less roll-over.' } : {},
        location: 'Cage 2', notes: step === 0 ? 'Fall baseline.' : ''
      });
      function reading(metricKey, value, context) {
        store.append('metricReadings', {
          playerId: p.id, assessmentSessionId: session.id, metricKey: metricKey, value: value,
          context: context, device: 'device', confidence: 'high', source: 'assessment', date: date,
          basePath: metricKey === 'popTime' ? 90 : null
        });
      }
      reading('exitVeloMax', round1(base.exitVeloMax + step * 1.6), 'tee');
      reading('batSpeed', round1(base.batSpeed + step * 1.1), 'tee');
      reading('fastballVelo', round1(base.fastballVelo + step * 1.3), 'bullpen');
      reading('maxThrowDist', Math.round(base.maxThrowDist + step * 8), 'practice');
      reading(base.speedKey, round2(base.speed - step * 0.06), 'test');
      reading('homeToFirst', round2(base.homeToFirst - step * 0.04), 'test');
      if (isCatcher) reading('popTime', round2(base.popTime - step * 0.07), 'practice');
      if (step !== 1) {
        store.insert('anthroReadings', {
          playerId: p.id, date: date,
          heightIn: round1(base.heightIn + (step === 2 ? 0.5 : 0)),
          weightLb: Math.round(base.weightLb + (step === 2 ? 3 : 0))
        });
      }
    });
  }

  // Lessons (SessionLog with no assignment). [days ago, focus, notes, throws].
  const LESSONS = {
    mason: [[24, 'throwing', 'Glove-side command. Kept front shoulder closed longer.', 30],
            [17, 'hitting', 'Tee + front toss. Working middle-away.', null],
            [10, 'throwing', 'Change-up grip intro, flat ground only.', 25],
            [3, 'fielding', 'Backhand footwork at short.', null]],
    eli: [[22, 'fielding', 'Receiving + blocking. Quieter glove on low pitches.', null],
          [15, 'hitting', 'Hip-shoulder separation drills.', null],
          [8, 'fielding', 'Transfer and footwork to second — pop time trending down.', null],
          [1, 'hitting', 'Live BP. Two hard line drives oppo.', null]],
    jax: [[20, 'throwing', 'Bullpen: FB/CH. Tempo much better from the stretch.', 35],
          [13, 'strength', 'Lower-half and med-ball work.', null],
          [5, 'throwing', 'Flat ground + pickoff moves.', 20]],
    noah: [[19, 'hitting', 'Stance and load. Keeping his head still.', null],
           [12, 'fielding', 'Ready position, two-hand fielding.', null],
           [5, 'hitting', 'Front toss — squared up most of the bucket.', null]],
    caleb: [[21, 'throwing', 'Mechanics check after growth spurt. Stride length reset.', 25],
            [14, 'hitting', 'Bat path work off the high tee.', null],
            [4, 'mixed', 'Light throwing day plus first-base footwork.', 15]],
    owen: [[23, 'hitting', 'Left-side swing: staying behind the ball.', null],
           [16, 'speed', 'First-step quickness and lead-offs.', null],
           [9, 'hitting', 'Machine work, 80 mph. Barrel accuracy improving.', null],
           [2, 'fielding', 'Double-play feeds and turns.', null]]
  };

  function drillIds(category, n) {
    return store.drillsByCategory(category).slice(0, n).map(function (d) { return d.id; });
  }

  function seedLessons(p, key) {
    (LESSONS[key] || []).forEach(function (row) {
      const focus = row[1];
      const cat = focus === 'mixed' ? 'throwing' : focus;
      const log = store.insert('sessionLogs', {
        playerId: p.id, date: ago(row[0]), focus: focus, assignmentId: null,
        extraDrillIds: drillIds(cat, 2), notes: row[2], rpe: focus === 'strength' ? 7 : 5, throws: row[3]
      });
      if (row[3]) {
        store.append('workloadLogs', {
          playerId: p.id, date: log.date, type: 'bullpen', pitches: row[3], outs: 0, rpe: 5,
          sourceRef: { kind: 'session', id: log.id }, notes: 'Lesson throws'
        });
      }
    });
  }

  // Older weekly outings so Pitch Smart has a real chronic workload to compare
  // against (otherwise one recent game reads as a workload spike).
  const HISTORY = {
    mason: [[44, 40], [37, 45], [30, 38], [16, 48], [9, 50]],
    caleb: [[41, 50], [34, 55], [27, 48], [20, 60], [13, 58]],
    jax: [[44, 65], [37, 70], [30, 72], [23, 68], [16, 78]]
  };

  function seedHistory(p, key) {
    (HISTORY[key] || []).forEach(function (row) {
      store.append('workloadLogs', {
        playerId: p.id, date: ago(row[0]), type: 'game', pitches: row[1],
        outs: Math.round(row[1] / 5.5), rpe: 6, notes: 'Game outing'
      });
    });
  }

  // Recent games with box-score lines. Pitching appearances also write the
  // matching workload log, the same way the Games view does.
  function seedGames(byKey) {
    function game(daysAgo, opponent, homeAway, scoreFor, scoreAgainst, ipg) {
      return store.insert('games', {
        date: ago(daysAgo), opponent: opponent, homeAway: homeAway,
        scoreFor: scoreFor, scoreAgainst: scoreAgainst, ipg: ipg, final: true
      });
    }
    function bat(g, key, l) {
      store.insert('battingStatLines', Object.assign({ gameId: g.id, playerId: byKey[key].id }, l));
    }
    function pitch(g, key, l, decision) {
      const a = store.insert('pitchingAppearances', Object.assign({ gameId: g.id, playerId: byKey[key].id }, l));
      store.append('workloadLogs', {
        playerId: byKey[key].id, date: g.date, type: 'game', pitches: l.pitches, outs: l.outs,
        sourceRef: { kind: 'box', id: a.id }, notes: 'vs ' + g.opponent
      });
      if (decision) {
        const d = {}; d[a.id] = decision;
        store.update('games', g.id, { decisions: d });
      }
    }

    const g1 = game(9, 'Riverside Hawks', 'home', 6, 3, 7);
    pitch(g1, 'jax', { outs: 17, bf: 24, h: 4, r: 3, er: 2, bb: 2, so: 8, pitches: 84, strikes: 55, firstPitchStrikes: 15, firstPitchPA: 24 }, 'W');
    bat(g1, 'jax', { pa: 3, ab: 3, h: 1, rbi: 1, so: 1, qab: 2 });
    bat(g1, 'owen', { pa: 4, ab: 3, h: 2, b2: 1, bb: 1, r: 2, rbi: 2, sb: 1, qab: 3 });

    const g2 = game(6, 'North Valley Storm', 'away', 4, 5, 7);
    pitch(g2, 'caleb', { outs: 13, bf: 20, h: 5, r: 4, er: 3, bb: 3, so: 5, pitches: 68, strikes: 41, firstPitchStrikes: 11, firstPitchPA: 20 }, 'L');
    bat(g2, 'caleb', { pa: 3, ab: 3, h: 1, so: 1, qab: 1 });
    bat(g2, 'eli', { pa: 3, ab: 2, h: 1, bb: 1, r: 1, rbi: 1, qab: 2 });

    const g3 = game(2, 'Lakeshore Legends', 'home', 8, 2, 6);
    pitch(g3, 'mason', { outs: 12, bf: 16, h: 2, r: 1, er: 1, bb: 1, so: 7, pitches: 52, strikes: 36, firstPitchStrikes: 11, firstPitchPA: 16 }, 'W');
    bat(g3, 'mason', { pa: 3, ab: 3, h: 2, b2: 1, r: 1, rbi: 2, qab: 2 });
    bat(g3, 'noah', { pa: 3, ab: 2, h: 1, bb: 1, r: 2, sb: 1, qab: 2 });
  }

  // Daily arm check-ins for the pitchers (last few days).
  function seedCheckIns(byKey) {
    [['mason', [[2, 3, 3, 0], [1, 4, 3, 1], [0, 2, 2, 0]]],
     ['caleb', [[5, 4, 4, 1], [3, 3, 3, 0], [0, 2, 2, 0]]],
     ['jax', [[8, 5, 4, 1], [4, 3, 3, 0], [0, 2, 3, 0]]]
    ].forEach(function (entry) {
      entry[1].forEach(function (r) {
        store.insert('dailyCheckIns', {
          playerId: byKey[entry[0]].id, date: ago(r[0]), soreness: r[1], fatigue: r[2],
          painLevel: r[3], sleepHours: 8, mood: 4
        });
      });
    });
  }

  // Generated programs + assignment + logged program sessions (most, not all,
  // of the scheduled days — so adherence reads like a real kid's).
  function seedProgram(p, goalId, startedDaysAgo, skipEvery) {
    if (!CT.generator) return;
    let plan = null;
    try {
      plan = CT.generator.generate(p, { goalId: goalId, startDate: ago(startedDaysAgo) });
    } catch (e) { plan = null; }
    if (!plan || !plan.ok) return;
    // generate() may push the start date forward (rest windows); the demo wants
    // a block that is already under way.
    plan.assignment = Object.assign({}, plan.assignment, { startDate: ago(startedDaysAgo) });
    const out = CT.generator.commit(p, plan);
    const program = out.program, assignment = out.assignment;
    const dows = assignment.daysOfWeek || [];
    const perWeekSeen = {};
    let n = 0;
    for (let d = startedDaysAgo; d >= 1; d--) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - d);
      if (dows.length && dows.indexOf(date.getDay()) < 0) continue;
      const weekIndex = Math.min(program.weeks - 1, Math.floor((startedDaysAgo - d) / 7));
      const dayIndex = perWeekSeen[weekIndex] || 0;
      perWeekSeen[weekIndex] = dayIndex + 1;
      if (!dows.length && dayIndex >= program.daysPerWeek) continue;
      n++;
      if (skipEvery && n % skipEvery === 0) continue; // a missed day
      const day = CT.programs.dayFor(program, weekIndex, dayIndex);
      const checks = {};
      ((day && day.items) || []).forEach(function (it) { checks[it.id] = true; });
      store.insert('sessionLogs', {
        playerId: p.id, date: iso(date), assignmentId: assignment.id,
        programDayRef: { weekIndex: weekIndex, dayIndex: dayIndex },
        itemChecks: checks, rpe: 6, notes: ''
      });
    }
  }

  function seed() {
    store.clearAll();
    if (CT.seeds) CT.seeds.ensure();
    store.updateSettings({ orgName: 'Diamond Mind Demo', coachName: 'Demo Coach', onboarding: { dismissed: true } });

    const byKey = {};
    ROSTER.forEach(function (r) {
      const p = store.insert('players', {
        name: r.name, birthdate: born(r.age, r.mo), bats: r.bats, throws: r.throws,
        positions: r.positions, jersey: r.jersey, notes: r.notes
      });
      byKey[r.key] = p;
      seedAssessments(p, r.base);
      seedLessons(p, r.key);
      seedHistory(p, r.key);
    });
    seedGames(byKey);
    seedCheckIns(byKey);
    seedProgram(byKey.mason, 'thr-armcare', 24, 5);
    seedProgram(byKey.owen, 'hit-power', 17, 4);
    seedProgram(byKey.jax, 'str-athletic', 20, 6);

    try { localStorage.setItem(STAMP_KEY, String(Date.now())); } catch (e) {}
  }

  // Seed when the demo store is empty or the last seed has gone stale.
  function ensure() {
    if (!ACTIVE) return false;
    let stamp = 0;
    try { stamp = Number(localStorage.getItem(STAMP_KEY)) || 0; } catch (e) { stamp = 0; }
    const stale = !stamp || (Date.now() - stamp) > RESEED_DAYS * 86400000;
    if (store.getPlayers().length && !stale) return false;
    try { seed(); return true; } catch (e) { console.warn('Diamond Mind: demo seeding failed —', e); return false; }
  }

  // URL of the same app with / without the demo flag (hash route preserved).
  function demoUrl() { return window.location.pathname + '?demo=1#/dashboard'; }
  function liveUrl() { return window.location.pathname + '#/dashboard'; }

  // Slim banner above the header so nobody mistakes the sample roster for real
  // players, with a one-click way back to the empty (real-data) app.
  function mountBanner() {
    if (!ACTIVE || document.getElementById('demo-banner')) return;
    const main = document.querySelector('.app-main');
    if (!main) return;
    const bar = document.createElement('div');
    bar.id = 'demo-banner';
    bar.className = 'demo-banner';
    bar.innerHTML =
      '<span class="demo-banner-tag">Demo</span>' +
      '<span class="demo-banner-text">Sample roster with fictional players. Click around — nothing here is real player data.</span>' +
      '<a class="demo-banner-link" href="' + liveUrl() + '">Start with your own roster</a>';
    main.insertBefore(bar, main.firstChild);
  }

  CT.demo = { active: ACTIVE, ensure: ensure, seed: seed, mountBanner: mountBanner, demoUrl: demoUrl, liveUrl: liveUrl };
})();

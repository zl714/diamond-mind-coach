/* sample-data.js — fictional DEMO seed so every view is populated on first load
   (never a blank screen). Player names read naturally; the "DEMO DATA" badge in the
   sidebar is the sole demo indicator. Built from the real model factories so the
   shapes always match. HONEST placeholder data — not real client outcomes.
   Exposed as CT.buildSampleData(). */
(function () {
  'use strict';

  const CT = window.CT;

  function daysBack(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function birthdateForAge(age) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - age);
    d.setMonth(d.getMonth() - 4); // mid-band cushion
    return d.toISOString().slice(0, 10);
  }

  function buildSampleData() {
    const M = CT.model;
    const out = {};
    CT.store && CT.store.COLLECTION_NAMES; // (benchmarks seeded by store)
    const teams = [], seasons = [], players = [], anthroReadings = [], assessmentSessions = [],
      metricReadings = [], games = [], battingStatLines = [], pitchingAppearances = [],
      fieldingStatLines = [], workloadLogs = [], dailyCheckIns = [], programs = [],
      programAssignments = [], programSessions = [], drills = [], lessons = [];

    // ---- team / season ----
    const team = M.Team({ id: 'demo_team', name: 'Mavericks (Travel)', ageBand: '13-14U', level: 'youth', season: '2026 Spring' });
    teams.push(team);
    const season = M.Season({ id: 'demo_season', name: '2026 Spring', year: 2026, startDate: daysBack(70), endDate: daysBack(-30), level: 'youth' });
    seasons.push(season);

    // ---- players across age bands ----
    const mateo = M.Player({ id: 'demo_p_mateo', name: 'Mateo Reyes', birthdate: birthdateForAge(11), bats: 'R', throws: 'R', positions: ['Shortstop', 'Second Base'], teamId: team.id, jersey: '7', notes: 'Barrel control + staying inside the ball.' });
    const jaylen = M.Player({ id: 'demo_p_jaylen', name: 'Jaylen Brooks', birthdate: birthdateForAge(13), bats: 'L', throws: 'L', positions: ['Pitcher', 'Center Field'], teamId: team.id, jersey: '21', notes: 'Building arm health, changeup feel.' });
    const owen = M.Player({ id: 'demo_p_owen', name: 'Owen Caldwell', birthdate: birthdateForAge(16), bats: 'R', throws: 'R', positions: ['Pitcher', 'First Base'], teamId: team.id, jersey: '34', notes: 'HS arm — periodized throwing + strict Pitch Smart.' });
    const sofia = M.Player({ id: 'demo_p_sofia', name: 'Sofia Nguyen', birthdate: birthdateForAge(10), bats: 'R', throws: 'R', positions: ['Center Field', 'Second Base'], teamId: team.id, jersey: '3', notes: 'First-step quickness + reads off the bat.' });
    players.push(mateo, jaylen, owen, sofia);

    // ---- anthro time-series ----
    [mateo, jaylen, owen, sofia].forEach(function (p, idx) {
      const base = [54, 62, 70, 52][idx];
      const wt = [88, 120, 165, 78][idx];
      anthroReadings.push(M.AnthroReading({ playerId: p.id, date: daysBack(120), heightIn: base - 1, weightLb: wt - 6 }));
      anthroReadings.push(M.AnthroReading({ playerId: p.id, date: daysBack(45), heightIn: base, weightLb: wt }));
    });

    // ---- assessments + append-only metric readings ----
    function assess(player, date, type, readings) {
      const a = M.AssessmentSession({ playerId: player.id, date: date, type: type, location: 'Prospect Field' });
      assessmentSessions.push(a);
      readings.forEach(function (r) {
        metricReadings.push(M.MetricReading(Object.assign({ playerId: player.id, assessmentSessionId: a.id, date: date }, r)));
      });
      return a;
    }
    assess(mateo, daysBack(50), 'assessment', [
      { metricKey: 'exitVeloMax', value: 56, aggregation: 'max', context: 'tee', device: 'device', confidence: 'high' },
      { metricKey: 'exitVeloMax', value: 52, aggregation: 'max', context: 'game', device: 'device', confidence: 'med' },
      { metricKey: 'batSpeed', value: 45, context: 'tee', device: 'device', confidence: 'high' },
      { metricKey: 'sixtyYard', value: 8.3, context: 'test', device: 'manual', confidence: 'med' },
      { metricKey: 'infieldVelo', value: 56, context: 'practice', device: 'device', confidence: 'med' }
    ]);
    assess(mateo, daysBack(12), 'assessment', [
      { metricKey: 'exitVeloMax', value: 61, aggregation: 'max', context: 'tee', device: 'device', confidence: 'high' },
      { metricKey: 'exitVeloMax', value: 57, aggregation: 'max', context: 'game', device: 'device', confidence: 'med' },
      { metricKey: 'batSpeed', value: 48, context: 'tee', device: 'device', confidence: 'high' }
    ]);
    assess(jaylen, daysBack(40), 'assessment', [
      { metricKey: 'fastballVelo', value: 65, context: 'bullpen', device: 'device', confidence: 'high' },
      { metricKey: 'secondaryVelo', value: 54, context: 'bullpen', device: 'device', confidence: 'med' },
      { metricKey: 'veloSeparation', value: 11, context: 'bullpen', device: 'manual', confidence: 'med' },
      { metricKey: 'exitVeloMax', value: 74, context: 'game', device: 'device', confidence: 'med' },
      { metricKey: 'outfieldVelo', value: 72, context: 'practice', device: 'device', confidence: 'med' }
    ]);
    assess(jaylen, daysBack(8), 'assessment', [
      { metricKey: 'fastballVelo', value: 68, context: 'bullpen', device: 'device', confidence: 'high' },
      { metricKey: 'strikePct', value: 62, context: 'game', device: 'manual', confidence: 'med' }
    ]);
    assess(owen, daysBack(35), 'showcase', [
      { metricKey: 'fastballVelo', value: 82, context: 'game', device: 'device', confidence: 'high' },
      { metricKey: 'secondaryVelo', value: 70, context: 'game', device: 'device', confidence: 'high' },
      { metricKey: 'veloSeparation', value: 12, context: 'game', device: 'manual', confidence: 'med' },
      { metricKey: 'spinRate', value: 2150, context: 'bullpen', device: 'device', confidence: 'med' },
      { metricKey: 'exitVeloMax', value: 91, context: 'game', device: 'device', confidence: 'high' }
    ]);
    assess(sofia, daysBack(28), 'assessment', [
      { metricKey: 'exitVeloMax', value: 48, context: 'tee', device: 'device', confidence: 'med' },
      { metricKey: 'sixtyYard', value: 8.6, context: 'test', device: 'manual', confidence: 'med' },
      { metricKey: 'proAgility', value: 5.4, context: 'test', device: 'manual', confidence: 'low' }
    ]);

    // ---- games + raw stat lines ----
    function game(id, date, opp, fr, ag) {
      const g = M.Game({ id: id, seasonId: season.id, teamId: team.id, date: date, opponent: opp, homeAway: 'home', scoreFor: fr, scoreAgainst: ag });
      games.push(g); return g;
    }
    const g1 = game('demo_g1', daysBack(20), 'River Hawks', 7, 4);
    const g2 = game('demo_g2', daysBack(6), 'Coastal Storm', 3, 5);

    battingStatLines.push(M.BattingStatLine({ gameId: g1.id, playerId: mateo.id, ab: 4, h: 2, b2: 1, bb: 1, so: 1, sb: 1, r: 2, rbi: 1, qab: 3 }));
    battingStatLines.push(M.BattingStatLine({ gameId: g2.id, playerId: mateo.id, ab: 3, h: 1, bb: 1, hbp: 1, so: 0, r: 1, rbi: 0, qab: 3 }));
    battingStatLines.push(M.BattingStatLine({ gameId: g1.id, playerId: jaylen.id, ab: 3, h: 1, hr: 1, bb: 1, so: 1, r: 1, rbi: 2, qab: 2 }));
    battingStatLines.push(M.BattingStatLine({ gameId: g2.id, playerId: jaylen.id, ab: 4, h: 2, b2: 1, so: 1, r: 1, rbi: 1, qab: 2 }));
    battingStatLines.push(M.BattingStatLine({ gameId: g1.id, playerId: sofia.id, ab: 3, h: 1, bb: 1, so: 1, sb: 2, r: 2, qab: 2 }));

    pitchingAppearances.push(M.PitchingAppearance({ gameId: g1.id, playerId: jaylen.id, outs: 12, h: 3, r: 2, er: 1, bb: 2, so: 6, hbp: 0, pitches: 58, strikes: 38, firstPitchStrikes: 11, firstPitchPA: 16, bf: 17 }));
    pitchingAppearances.push(M.PitchingAppearance({ gameId: g2.id, playerId: owen.id, outs: 18, h: 4, r: 2, er: 2, bb: 1, so: 8, hbp: 1, pitches: 78, strikes: 54, firstPitchStrikes: 17, firstPitchPA: 24, bf: 25 }));

    fieldingStatLines.push(M.FieldingStatLine({ gameId: g1.id, playerId: mateo.id, position: 'Shortstop', po: 2, a: 4, e: 1 }));
    fieldingStatLines.push(M.FieldingStatLine({ gameId: g2.id, playerId: mateo.id, position: 'Shortstop', po: 1, a: 3, e: 0 }));
    fieldingStatLines.push(M.FieldingStatLine({ gameId: g1.id, playerId: sofia.id, position: 'Center Field', po: 3, a: 0, e: 0 }));

    // ---- workload logs (append-only) — drive Pitch Smart + ACWR ----
    // Jaylen (13-14U): cleared, healthy ramp.
    workloadLogs.push(M.WorkloadLog({ playerId: jaylen.id, date: daysBack(40), type: 'game', pitches: 45, outs: 9, rpe: 6 }));
    workloadLogs.push(M.WorkloadLog({ playerId: jaylen.id, date: daysBack(26), type: 'bullpen', pitches: 25, outs: 0, rpe: 4 }));
    workloadLogs.push(M.WorkloadLog({ playerId: jaylen.id, date: daysBack(20), type: 'game', pitches: 58, outs: 12, rpe: 7 }));
    workloadLogs.push(M.WorkloadLog({ playerId: jaylen.id, date: daysBack(8), type: 'bullpen', pitches: 30, outs: 0, rpe: 5 }));
    // Owen (15-16U): pitched 78 two days ago -> needs 4 days rest -> RED, eligible in 2.
    workloadLogs.push(M.WorkloadLog({ playerId: owen.id, date: daysBack(35), type: 'game', pitches: 70, outs: 15, rpe: 7 }));
    workloadLogs.push(M.WorkloadLog({ playerId: owen.id, date: daysBack(21), type: 'game', pitches: 74, outs: 16, rpe: 8 }));
    workloadLogs.push(M.WorkloadLog({ playerId: owen.id, date: daysBack(14), type: 'bullpen', pitches: 35, outs: 0, rpe: 5 }));
    workloadLogs.push(M.WorkloadLog({ playerId: owen.id, date: daysBack(2), type: 'game', pitches: 78, outs: 18, rpe: 9 }));

    // ---- daily check-ins (one with arm pain -> alerts escalation) ----
    dailyCheckIns.push(M.DailyCheckIn({ playerId: jaylen.id, date: daysBack(1), soreness: 2, fatigue: 3, sleepHours: 8.5, mood: 4, armPain: false }));
    dailyCheckIns.push(M.DailyCheckIn({ playerId: mateo.id, date: daysBack(1), soreness: 1, fatigue: 2, sleepHours: 9, mood: 5, armPain: false }));
    dailyCheckIns.push(M.DailyCheckIn({ playerId: owen.id, date: daysBack(1), soreness: 6, fatigue: 6, sleepHours: 6.5, mood: 3, armPain: true, painLocation: 'medial elbow', notes: 'Tightness after last outing.' }));
    dailyCheckIns.push(M.DailyCheckIn({ playerId: sofia.id, date: daysBack(2), soreness: 1, fatigue: 2, sleepHours: 9.5, mood: 5, armPain: false }));

    // ---- programs + assignments + auto-generated sessions ----
    function instProgram(templateId) {
      const t = CT.programs.byTemplateId(templateId);
      const p = M.Program(Object.assign({}, t, { isTemplate: false }));
      programs.push(p); return p;
    }
    const progJBands = instProgram('jbands-arm-care');
    const progLongToss = instProgram('youth-long-toss');
    const progPitchSmart = instProgram('pitch-smart-overlay');

    function assignAndSchedule(player, program, startDaysBack) {
      const a = M.ProgramAssignment({ playerId: player.id, programId: program.id, startDate: daysBack(startDaysBack), status: 'active' });
      programAssignments.push(a);
      const sessions = CT.programs.generateSessions(program, a);
      // mark already-passed sessions completed for an adherence chart
      const todayStr = CT.todayISO();
      sessions.forEach(function (s) {
        if (s.date < todayStr) {
          const done = Math.random() > 0.25;
          programSessions.push(M.ProgramSession(Object.assign({}, s, { completed: done, warmupDone: done, armCareDone: done, rpe: done ? 5 : null })));
        } else {
          programSessions.push(s);
        }
      });
      return a;
    }
    assignAndSchedule(jaylen, progJBands, 21);
    assignAndSchedule(mateo, progLongToss, 14);
    assignAndSchedule(owen, progPitchSmart, 30);

    // ---- drill library (coach-managed) ----
    function drill(id, name, category, defaultNotes) {
      const d = M.Drill({ id: id, name: name, category: category, defaultNotes: defaultNotes || '' });
      drills.push(d); return d;
    }
    const dSingleLeg = drill('demo_drill_singleleg', 'Single-Leg Hitting', 'Hitting', 'Balance + front-side connection. 2x10 each side.');
    const dTee = drill('demo_drill_tee', 'Tee Work', 'Hitting', 'Barrel path + contact point. 3 rounds of 10.');
    const dFrontToss = drill('demo_drill_fronttoss', 'Front Toss', 'Hitting', 'Timing + tracking. Mix speeds.');
    const dSoftToss = drill('demo_drill_softtoss', 'Soft Toss', 'Hitting', 'Contact consistency, inside/outside.');
    const dBullpen = drill('demo_drill_bullpen', 'Bullpen', 'Pitching', 'Command focus. Log pitch count for Pitch Smart.');
    const dLongToss = drill('demo_drill_longtoss', 'Long Toss', 'Pitching', 'Arm health + arm strength. Ramp distance gradually.');
    const dMedBall = drill('demo_drill_medball', 'Med-Ball Rotational', 'Strength', 'Hip-shoulder separation + sequencing. 3x8.');
    const dLadder = drill('demo_drill_ladder', 'Ladder Agility', 'Mobility', 'First-step quickness + footwork.');
    const dGroundBalls = drill('demo_drill_gb', 'Ground Ball Reps', 'Fielding', 'Field through the ball; clean transfers.');
    const dLeadOffs = drill('demo_drill_leadoffs', 'Lead-Off Reads', 'Baserunning', 'Primary/secondary leads + first-step reads.');
    const dBandCare = drill('demo_drill_bandcare', 'Band Arm Care', 'Mobility', 'Post-throw rotator-cuff + scap maintenance.');
    const dBoxJumps = drill('demo_drill_boxjumps', 'Box Jumps', 'Strength', 'Lower-half power. 4x5, full recovery.');

    // ---- lessons / coaching sessions (2-3 per player) ----
    function lesson(player, date, drillList, notes, quickStats, ratingDelta) {
      const l = M.Lesson({
        playerId: player.id, date: date,
        drillIds: drillList.map(function (d) { return d.id; }),
        notes: notes, quickStats: quickStats || {},
        ratingDelta: ratingDelta == null ? null : ratingDelta
      });
      lessons.push(l); return l;
    }
    lesson(mateo, daysBack(50), [dSingleLeg, dTee, dGroundBalls],
      'Worked front-side connection off the tee; barrels jumped once we slowed the load. Ground-ball footwork: field through the ball.',
      { exitVeloMax: 56, batSpeed: 45 }, 0.5);
    lesson(mateo, daysBack(20), [dFrontToss, dGroundBalls, dLadder],
      'Front toss timing much better against mixed speeds. Lateral range work at short — clean transfers.',
      { exitVeloMax: 58 }, 0.3);
    lesson(mateo, daysBack(8), [dTee, dMedBall, dLeadOffs],
      'Added med-ball rotational for sequencing — staying inside the ball. Lead-off reads sharp.',
      { exitVeloMax: 61, batSpeed: 48 }, 0.4);

    lesson(jaylen, daysBack(40), [dBullpen, dLongToss, dBandCare],
      'Bullpen: changeup feel improving, kept it down in the zone. Band arm care after to protect the arm.',
      { fastballVelo: 65, secondaryVelo: 54 }, 0.4);
    lesson(jaylen, daysBack(20), [dLongToss, dFrontToss],
      'Long toss out to ~150 ft, clean and easy. Some front toss for timing on the CF days.',
      { outfieldVelo: 72 }, 0.2);
    lesson(jaylen, daysBack(8), [dBullpen, dBandCare],
      'Bullpen strike rate up to ~62%. Arm felt great, no pain reported.',
      { fastballVelo: 68, strikePct: 62 }, 0.5);

    lesson(owen, daysBack(35), [dBullpen, dMedBall, dBandCare],
      'Showcase prep. Velo holding 82. Med-ball for hip-shoulder separation; finished with band care.',
      { fastballVelo: 82, secondaryVelo: 70 }, 0.3);
    lesson(owen, daysBack(14), [dLongToss, dBandCare],
      'Recovery day — long toss + band care only. Monitoring medial-elbow tightness, kept volume low.',
      {}, 0);
    lesson(owen, daysBack(2), [dBullpen, dBoxJumps],
      'Light bullpen, then lower-half power. Flagged soreness afterward — see Arm Safety before next outing.',
      { fastballVelo: 81 }, -0.1);

    lesson(sofia, daysBack(28), [dTee, dLadder, dLeadOffs],
      'First-step quickness drills. Reads off the bat in the outfield are improving week over week.',
      { exitVeloMax: 48, sixtyYard: 8.6 }, 0.4);
    lesson(sofia, daysBack(10), [dSoftToss, dLadder],
      'Soft toss for contact consistency, inside and outside. Ladder agility — sharp and fun.',
      { exitVeloMax: 50 }, 0.3);

    out.isSample = true;
    out.updatedAt = new Date().toISOString();
    out.teams = teams; out.seasons = seasons; out.players = players;
    out.anthroReadings = anthroReadings; out.assessmentSessions = assessmentSessions;
    out.metricReadings = metricReadings; out.games = games;
    out.battingStatLines = battingStatLines; out.pitchingAppearances = pitchingAppearances;
    out.fieldingStatLines = fieldingStatLines; out.workloadLogs = workloadLogs;
    out.dailyCheckIns = dailyCheckIns; out.programs = programs;
    out.programAssignments = programAssignments; out.programSessions = programSessions;
    out.drills = drills; out.lessons = lessons;
    return out;
  }

  window.CT = Object.assign(window.CT || {}, { buildSampleData: buildSampleData });
})();

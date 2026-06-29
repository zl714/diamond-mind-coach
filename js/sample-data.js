/* sample-data.js — clearly-labeled demo seed data.
   Names are obviously fictional ("Sample / Demo") so a recruiter sees a populated
   UI immediately and never confuses it with real coaching clients.
   This data is HONEST placeholder data — not real client outcomes. */
(function () {
  'use strict';

  // Build session dates relative to today so the timeline always looks recent.
  function isoDaysBack(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function buildSampleData() {
    return {
      version: 1,
      isSample: true,
      updatedAt: new Date().toISOString(),
      players: [
        {
          id: 'sample_player_1',
          name: 'Sample Player — Jordan R.',
          level: '14U Travel',
          position: 'Shortstop',
          notes: 'Demo client. Works on barrel control and staying inside the ball.',
          createdAt: isoDaysBack(60),
          sessions: [
            {
              id: 'sample_s1a', date: isoDaysBack(42), focus: 'Hitting',
              drills: 'Tee work, soft toss, high-velo machine',
              notes: 'Pulling off the ball on outside pitch.',
              metrics: { skill: 6, exitVelo: 72 }
            },
            {
              id: 'sample_s1b', date: isoDaysBack(28), focus: 'Hitting',
              drills: 'Opposite-field tee, two-strike approach',
              notes: 'Better balance, staying through the zone longer.',
              metrics: { skill: 7, exitVelo: 76 }
            },
            {
              id: 'sample_s1c', date: isoDaysBack(14), focus: 'Fielding',
              drills: 'Backhand reps, double-play footwork',
              notes: 'Quick exchange improving.',
              metrics: { skill: 7 }
            },
            {
              id: 'sample_s1d', date: isoDaysBack(5), focus: 'Hitting',
              drills: 'Live BP, situational hitting',
              notes: 'Driving the ball gap-to-gap with authority.',
              metrics: { skill: 8, exitVelo: 81 }
            }
          ]
        },
        {
          id: 'sample_player_2',
          name: 'Sample Player — Alex M.',
          level: '16U',
          position: 'Pitcher',
          notes: 'Demo client. Building arm strength and command of the changeup.',
          createdAt: isoDaysBack(45),
          sessions: [
            {
              id: 'sample_s2a', date: isoDaysBack(38), focus: 'Pitching',
              drills: 'Long toss, mechanics video review',
              notes: 'Front side flying open early.',
              metrics: { skill: 6, pitchVelo: 78 }
            },
            {
              id: 'sample_s2b', date: isoDaysBack(21), focus: 'Pitching',
              drills: 'Bullpen — fastball/changeup, towel drill',
              notes: 'Repeating delivery better, changeup feel returning.',
              metrics: { skill: 7, pitchVelo: 80 }
            },
            {
              id: 'sample_s2c', date: isoDaysBack(7), focus: 'Pitching',
              drills: 'Live ABs vs hitters, command grid',
              notes: 'Held velo deeper into outing.',
              metrics: { skill: 8, pitchVelo: 83 }
            }
          ]
        },
        {
          id: 'sample_player_3',
          name: 'Sample Player — Sam T.',
          level: '12U Little League',
          position: 'Center Field',
          notes: 'Demo client. Focus on first-step quickness and reads off the bat.',
          createdAt: isoDaysBack(30),
          sessions: [
            {
              id: 'sample_s3a', date: isoDaysBack(24), focus: 'Baserunning',
              drills: 'Lead-offs, secondary lead reads, 60-yd timing',
              notes: 'Hesitating on secondary lead.',
              metrics: { skill: 5, sprint: 8.4 }
            },
            {
              id: 'sample_s3b', date: isoDaysBack(10), focus: 'Fielding',
              drills: 'Fly-ball reads, drop-step routes',
              notes: 'Routes getting cleaner, more confident.',
              metrics: { skill: 6, sprint: 8.1 }
            }
          ]
        }
      ]
    };
  }

  window.CT = Object.assign(window.CT || {}, {
    buildSampleData: buildSampleData
  });
})();

/* generator.js — the PROGRAM GENERATOR engine (deterministic, no LLM).
   Interprets the declarative decision table in generator-data.js and produces
   an ordinary editable Program (source 'generated') + an active
   ProgramAssignment for one player. Pure planning: generate() only READS the
   store; commit() performs the writes (seed self-heal + insert + readiness).
   Console-testable without DOM:
     CT.generator.eligibility(player, goalId, { inSeason })
     CT.generator.recommend(player)
     CT.generator.generate(player, opts)  -> plan | { blocked }
     CT.generator.commit(player, plan)    -> { program, assignment }
     CT.generator.audit(plan)             -> violations[] (safety invariants)
   Exposed on window.CT.generator. */
(function () {
  'use strict';

  const CT = window.CT;

  // Exact-age range each display band covers (for Program.ageBands).
  const BAND_RANGE = {
    '9-10U': [0, 10], '11-12U': [11, 12], '13-14U': [13, 14],
    '15-16U': [15, 16], '17-18U': [17, 99]
  };

  // Confirmation checkboxes the wizard can require. `store` keys persist onto
  // Player.readiness at commit; attestations (painFree) live only in the
  // program's generatorMeta audit snapshot.
  const CONFIRM_DEFS = {
    maturityConfirmed: {
      label: 'Physician-confirmed skeletal maturity (growth plates closed)',
      store: true
    },
    minus3Bat: {
      label: 'Swings (or is moving to) a −3 BBCOR bat / post-PHV',
      store: true
    },
    physicianCleared: {
      label: 'Physician has cleared this player to begin a return-to-throw progression',
      store: true
    },
    painFree: {
      label: 'Player is currently pain-free (no elbow or shoulder pain)',
      store: false
    }
  };

  // Minimum EXACT age a drill may appear in a generated program (audit gate —
  // the templates already respect these; this catches template regressions).
  const DRILL_AGE_GATES = {
    'weighted-ball-ladder': 15, 'run-and-gun': 17, 'longtoss-pulldowns': 13,
    'ou-bat-block': 13, 'wrist-weight-drills': 13, 'flatground-changeup': 13,
    'mixed-pitch-recognition': 16, 'competition-round': 16,
    'medball-slam': 13, 'goblet-squat': 13, 'kb-rdl': 13, 'chinup-prog': 13,
    'box-jump': 16, 'trap-bar-dl': 16, 'landmine-press': 16
  };

  function gd() { return CT.generatorData; }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

  // 1 -> "1st", 2 -> "2nd", 81 -> "81st", 12 -> "12th".
  function ord(n) {
    const v = Math.abs(Math.round(Number(n))) % 100;
    const suffix = (v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
    return n + suffix;
  }

  // Disclose reading age when a cited number is stale (the why-line must never
  // present a years-old reading as current).
  const STALE_READING_DAYS = 90;
  function measuredNote(snap) {
    if (!snap || !snap.date) return '';
    const n = CT.daysAgo(snap.date);
    return (n != null && n > STALE_READING_DAYS) ? ', measured ' + CT.formatDate(snap.date) : '';
  }

  function addDaysISO(iso, days) {
    const p = String(iso).split('-');
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + days);
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function bandsBetween(minAge, maxAge) {
    return CT.model.AGE_BANDS.filter(function (b) {
      const r = BAND_RANGE[b];
      return r[0] <= maxAge && r[1] >= minAge;
    });
  }

  function goalById(goalId) {
    return gd().GOALS.find(function (g) { return g.id === goalId; }) || null;
  }

  // Latest non-voided reading + its age-band percentile (null-safe).
  function metricSnapshot(player, key) {
    const r = CT.store.latestMetric(player.id, key);
    if (!r) return { value: null, pct: null, date: null };
    const band = CT.model.bandFor(player);
    return {
      value: r.value,
      pct: band ? CT.benchmarks.percentileFor(band, key, r.value) : null,
      date: r.date
    };
  }

  function percentiles(player) {
    return {
      exitVeloMax: metricSnapshot(player, 'exitVeloMax'),
      batSpeed: metricSnapshot(player, 'batSpeed'),
      fastballVelo: metricSnapshot(player, 'fastballVelo'),
      maxThrowDist: metricSnapshot(player, 'maxThrowDist')
    };
  }

  // Active pain flag = the player's MOST RECENT daily check-in reports arm pain.
  function painFlagged(player) {
    const rows = CT.store.byPlayer('dailyCheckIns', player.id);
    if (!rows.length) return false;
    const latest = rows.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })[rows.length - 1];
    return !!latest.armPain;
  }

  function readiness(player) {
    return (player && player.readiness) || {
      minus3Bat: false, maturityConfirmed: false, physicianCleared: false
    };
  }

  // First matching variant for (goal, exact age, season). In-season prefers a
  // season:'in' row; otherwise the base row is used (offSeasonOnly rows are
  // then blocked by eligibility).
  function pickVariant(goalId, age, inSeason) {
    const list = gd().VARIANTS[goalId] || [];
    function matches(v) { return age >= v.minAge && age <= v.maxAge; }
    if (inSeason) {
      const inV = list.find(function (v) { return v.season === 'in' && matches(v); });
      if (inV) return inV;
    }
    return list.find(function (v) { return !v.season && matches(v); }) || null;
  }

  // Confirmations a variant requires for THIS player (already-stored readiness
  // flags come back preChecked so the coach sees, not re-answers, them).
  function requiredConfirms(variant, player, goalId, opts) {
    const age = CT.model.ageFromBirthdate(player.birthdate);
    const ready = readiness(player);
    const keys = [];
    (variant.confirms || []).forEach(function (k) { keys.push(k); });
    if (variant.confirms13 && age != null && age >= 13 && age <= 14) {
      variant.confirms13.forEach(function (k) { keys.push(k); });
    }
    // Return-from-shutdown: an active pain flag (or coach-declared injury)
    // requires physician clearance — otherwise refuse with referral copy.
    if (goalId === 'thr-rfs' && (painFlagged(player) || (opts && opts.injury))) {
      keys.push('physicianCleared');
    }
    return keys.filter(function (k, i) { return keys.indexOf(k) === i; })
      .map(function (k) {
        return {
          key: k,
          label: (CONFIRM_DEFS[k] || {}).label || k,
          store: !!(CONFIRM_DEFS[k] || {}).store,
          preChecked: !!ready[k]
        };
      });
  }

  // ---------------------------------------------------------------------------
  // ELIGIBILITY — drives the wizard's goal cards (locks, substitutes, confirms).
  // ---------------------------------------------------------------------------
  function eligibility(player, goalId, opts) {
    opts = opts || {};
    const age = CT.model.ageFromBirthdate(player.birthdate);
    const goal = goalById(goalId);
    if (!goal) return { status: 'locked', reason: 'Unknown goal.', substituteGoalId: null };
    if (age == null) {
      return { status: 'locked', reason: 'Add a birthdate first — every gate in this generator is age-driven.', substituteGoalId: null };
    }

    // Hard lock: velocity programs unlock at 13 (Driveline: the youth program
    // is "NOT a velocity development program").
    if (goalId === 'thr-velo' && age < 13) {
      return {
        status: 'locked', reason: 'Velocity programs unlock at 13. Under 13, arm strength comes from capped long toss.',
        substituteGoalId: 'thr-base', substituteLabel: 'Long-toss base builder'
      };
    }

    const variant = pickVariant(goalId, age, !!opts.inSeason);
    if (!variant) {
      return { status: 'locked', reason: 'No age-appropriate variant for age ' + age + '.', substituteGoalId: null };
    }

    // Off-season-only work (pull-downs, weighted balls, OU bats) is hidden
    // in-season — the substitute is always a maintenance-safe goal.
    if (opts.inSeason && variant.offSeasonOnly) {
      return {
        status: 'locked',
        reason: 'Off-season only — no ' + (goal.domain === 'hitting'
          ? 'overload/underload bats'
          : 'max-intent throwing (pull-downs or weighted balls)') + ' in-season.',
        substituteGoalId: goal.domain === 'hitting' ? 'hit-contact' : 'thr-armcare',
        substituteLabel: goal.domain === 'hitting' ? 'Contact & barrel control' : 'Arm care & durability',
        variant: variant
      };
    }

    const confirms = requiredConfirms(variant, player, goalId, opts);
    const warnings = [];
    if (goal.domain === 'throwing' && goalId === 'thr-velo' &&
        CT.model.isPitcher(player) && CT.model.isCatcher(player)) {
      warnings.push('Pitcher + catcher combo: ~3× elbow/shoulder injury risk (Pitch Smart risk factor). Watch total throwing volume across BOTH roles.');
    }
    if (goalId === 'hit-batspeed' && variant.youthSub) {
      warnings.push('Overload/underload bats stay LOCKED before −3 BBCOR / post-PHV — this builds bat speed the age-right way (light-bat speed, zero load).');
    }
    return { status: 'ok', variant: variant, confirms: confirms, warnings: warnings, reason: 'Eligible.' };
  }

  // ---------------------------------------------------------------------------
  // RECOMMEND — percentile-driven goal chips (coach can always override).
  // ---------------------------------------------------------------------------
  function recommend(player) {
    const age = CT.model.ageFromBirthdate(player.birthdate);
    const band = CT.model.bandFor(player);
    const p = percentiles(player);
    const out = { hitting: 'hit-contact', throwing: 'thr-armcare', strength: 'str-athletic', reasons: {} };
    if (age == null) return out;

    // Hitting.
    const ready = readiness(player);
    const ouEligible = age >= 15 || (age >= 13 && ready.minus3Bat);
    if (p.exitVeloMax.pct != null && p.exitVeloMax.pct < 40) {
      out.hitting = 'hit-power';
      out.reasons.hitting = 'Max exit velo is at the ' + ord(p.exitVeloMax.pct) + ' percentile for ' + band + ' — power is the gap.';
    } else if (p.exitVeloMax.pct != null && p.batSpeed.pct != null &&
               p.batSpeed.pct <= p.exitVeloMax.pct - 20 && ouEligible) {
      out.hitting = 'hit-batspeed';
      out.reasons.hitting = 'Bat speed (' + ord(p.batSpeed.pct) + ') lags exit velo (' + ord(p.exitVeloMax.pct) + ') by 20+ points — bat speed is the limiter.';
    } else {
      out.reasons.hitting = p.exitVeloMax.pct != null
        ? 'Exit velo at the ' + ord(p.exitVeloMax.pct) + ' percentile — sharpen contact and approach.'
        : 'No hitting numbers yet — start with contact and barrel control.';
    }

    // Throwing.
    const cap = gd().DIST_CAP[band] || 250;
    const hasAnyThrow = p.fastballVelo.value != null || p.maxThrowDist.value != null;
    if (!hasAnyThrow) {
      out.throwing = 'thr-armcare';
      out.reasons.throwing = 'No throwing numbers yet — build the arm-care base first.';
    } else if (p.maxThrowDist.value == null || p.maxThrowDist.value < 0.6 * cap) {
      out.throwing = 'thr-base';
      out.reasons.throwing = p.maxThrowDist.value == null
        ? 'No long-toss distance on record — build the base before intent work.'
        : 'Long toss at ' + p.maxThrowDist.value + ' ft is under 60% of the ' + cap + ' ft age cap — base first.';
    } else if (p.fastballVelo.pct != null && p.fastballVelo.pct < 40 && age >= 13) {
      out.throwing = 'thr-velo';
      out.reasons.throwing = 'Throwing velo at the ' + ord(p.fastballVelo.pct) + ' percentile with a solid long-toss base — age-gated velocity work applies.';
    } else {
      out.throwing = 'thr-armcare';
      out.reasons.throwing = 'Numbers look healthy — hold the arm-care base.';
    }

    out.reasons.strength = age < 13
      ? 'Under 13: athleticism through movement quality and play (NSCA youth guidelines).'
      : 'Build the strength base — jumps and throws first, technique before load.';
    return out;
  }

  // ---------------------------------------------------------------------------
  // Phase/day resolution
  // ---------------------------------------------------------------------------
  // Resolve a phase bound: null = last week; negative = counted from the end
  // (-1 = final week). 1-based weeks.
  function resolveBound(x, weeks) {
    if (x == null) return weeks;
    return x < 0 ? weeks + 1 + x : x;
  }

  // Ranges per phase, optionally delaying the first high-intent phase by
  // `shift` weeks (weak long-toss distance extends the stretch-out phase).
  function phaseRanges(variant, weeks, shift) {
    const ranges = (variant.phases || []).map(function (ph) {
      return { from: resolveBound(ph.from, weeks), to: resolveBound(ph.to, weeks), phase: ph };
    });
    if (shift > 0) {
      const hi = ranges.findIndex(function (r) { return r.phase.highPhase; });
      if (hi > 0 && ranges[hi].from + shift <= ranges[hi].to) {
        ranges[hi] = Object.assign({}, ranges[hi], { from: ranges[hi].from + shift });
        ranges[hi - 1] = Object.assign({}, ranges[hi - 1], { to: ranges[hi - 1].to + shift });
      }
    }
    return ranges;
  }

  function phaseForWeek(ranges, week1) {
    for (let i = ranges.length - 1; i >= 0; i--) {
      if (week1 >= ranges[i].from && week1 <= ranges[i].to) return ranges[i].phase;
    }
    // Weeks before the first phase (shifted starts) fall back to phase 1.
    return ranges.length ? ranges[0].phase : null;
  }

  function drillItem(slug, sets, reps, notes) {
    return { kind: 'drill', drillId: CT.seeds.idFor(slug), slug: slug,
      sets: sets == null ? null : sets, reps: reps == null ? null : reps, notes: notes || '' };
  }

  // Materialize one template day: CAP substitution, arm-care wrap, deload.
  function buildDay(tpl, ctx) {
    let items = (tpl.items || []).map(function (it) {
      if (it.kind !== 'drill') return { kind: 'step', text: it.text };
      const notes = String(it.notes || '').replace(/\bCAP\b/g, String(ctx.cap));
      let sets = it.sets;
      if (ctx.deload && sets != null && sets > 1) sets = Math.max(1, Math.round(sets * 0.65));
      return drillItem(it.slug, sets, it.reps, notes);
    });
    // Invariant 4: every arm-flagged throwing day starts dynamic-warmup +
    // J-Band and ends with recovery work.
    if (tpl.arm) {
      items = [drillItem('dynamic-warmup', 1, 1, ''), drillItem('jband-series', 1, 10, ctx.armNote || '')]
        .concat(items)
        .concat([drillItem('recovery-plyocare', 2, 10, '')]);
    }
    return {
      title: tpl.title + (ctx.deload ? ' · deload week (−30–40% volume)' : ''),
      intensity: tpl.intensity || null,
      items: items
    };
  }

  // Weak-metric emphasis (+1 round of the mapped drill on hitting days).
  function applyEmphasis(days, slug) {
    let touched = 0;
    days.forEach(function (d) {
      if (d.day.intensity === 'recovery') return;
      const hasHit = d.day.items.some(function (it) {
        if (it.kind !== 'drill') return false;
        const seed = CT.seeds.bySlug(it.slug);
        return seed && seed.category === 'hitting';
      });
      if (!hasHit) return;
      const hit = d.day.items.find(function (it) { return it.kind === 'drill' && it.slug === slug; });
      if (hit) {
        hit.sets = (hit.sets || 1) + 1;
        hit.notes = (hit.notes ? hit.notes + ' · ' : '') + '+1 round — weak-metric emphasis';
      } else {
        d.day.items.push(drillItem(slug, 1, 5, '+1 round — weak-metric emphasis'));
      }
      touched++;
    });
    return touched;
  }

  // ---------------------------------------------------------------------------
  // RFS (interval-throwing) builder — every-other-day soreness-gated ladder.
  // ---------------------------------------------------------------------------
  function buildRfsDays(variant, player, longLayoff, dpw) {
    let steps = (variant.rfs.steps || []).slice();
    if (variant.rfs.pitcherSteps && CT.model.isPitcher(player)) {
      steps = steps.concat(variant.rfs.pitcherSteps);
    }
    if (longLayoff) {
      const doubled = [];
      steps.forEach(function (s) { doubled.push(s); doubled.push(Object.assign({}, s, { repeat: true })); });
      steps = doubled;
    }
    const weeks = Math.max(1, Math.ceil(steps.length / dpw));
    const days = [];
    for (let i = 0; i < weeks * dpw; i++) {
      const w = Math.floor(i / dpw), d = i % dpw;
      if (i < steps.length) {
        const st = steps[i];
        days.push({ weekIndex: w, dayIndex: d, day: {
          title: 'Step ' + (i + 1) + ' — ' + st.ft + ' ft' + (st.repeat ? ' (repeat — long layoff)' : ''),
          intensity: st.ft <= 60 ? 'low' : 'medium',
          items: [
            drillItem('dynamic-warmup', 1, 1, ''),
            drillItem('jband-series', 1, 10, ''),
            drillItem('soreness-check', 1, 1, 'Run the gate BEFORE throwing. Advance only if no soreness — never by date.'),
            drillItem('interval-throwing-step', 1, 1, st.plan),
            drillItem('recovery-plyocare', 2, 10, '')
          ]
        } });
      } else {
        days.push({ weekIndex: w, dayIndex: d, day: {
          title: 'Ladder complete', intensity: 'recovery',
          items: [{ kind: 'step', text: variant.rfs.graduation }]
        } });
      }
    }
    return { days: days, weeks: weeks };
  }

  // ---------------------------------------------------------------------------
  // GENERATE — plan only (no writes). opts:
  //   { goalId, weeks, daysPerWeek, startDate, inSeason, longLayoff, injury,
  //     confirmations: { maturityConfirmed?, painFree?, minus3Bat?, physicianCleared? } }
  // ---------------------------------------------------------------------------
  function generate(player, opts) {
    opts = opts || {};
    const goalId = opts.goalId;
    const goal = goalById(goalId);
    const age = CT.model.ageFromBirthdate(player.birthdate);
    const band = CT.model.bandFor(player);
    const elig = eligibility(player, goalId, opts);
    if (elig.status !== 'ok') {
      return { ok: false, blocked: true, reason: elig.reason, substituteGoalId: elig.substituteGoalId || null };
    }
    const variant = elig.variant;
    const warnings = (elig.warnings || []).slice();
    const confirmations = opts.confirmations || {};

    // Required confirmations must all be affirmed. A stored ("On file")
    // readiness flag counts — but an EXPLICIT uncheck retracts it and blocks,
    // so a mistaken or outdated attestation can always be withdrawn.
    function confirmed(c) {
      if (c.key in confirmations) return !!confirmations[c.key];
      return !!c.preChecked;
    }
    const missing = (elig.confirms || []).filter(function (c) { return !confirmed(c); });
    if (missing.length) {
      return {
        ok: false, blocked: true,
        reason: 'Required confirmation missing: ' + missing.map(function (c) { return c.label; }).join('; '),
        needsConfirms: missing
      };
    }

    // Schedule inputs clamped to the variant's bounds.
    let weeks = Math.min(variant.weeks.max, Math.max(variant.weeks.min, num(opts.weeks) || variant.weeks.def));
    const dpw = Math.min(variant.dpw.max, Math.max(variant.dpw.min, num(opts.daysPerWeek) || variant.dpw.def));
    const pattern = (variant.pattern || gd().PATTERNS[dpw] || [1, 3, 5]).slice(0, dpw);

    // Pitch Smart preflight: any unexpired rest requirement blocks throwing-
    // goal start dates until it clears. Uses restEligibleInDays (NOT
    // daysUntilEligible) so an outing logged TODAY — the most common case:
    // coach logs the game, then immediately builds the recovery program —
    // pushes the start date past the mandatory rest window too. The daily
    // throws gate still applies at log time.
    let startDate = opts.startDate || CT.todayISO();
    if (goal.type === 'throwing' && CT.model.isPitcher(player)) {
      const verdict = CT.pitchsmart.evaluate(player, CT.store.byPlayer('workloadLogs', player.id));
      const restDays = verdict.restEligibleInDays || 0;
      if (restDays > 0) {
        const minStart = addDaysISO(CT.todayISO(), restDays);
        if (startDate < minStart) {
          startDate = minStart;
          warnings.push('Pitch Smart: not cleared to throw until ' + CT.formatDate(minStart) +
            ' — start date moved to the first eligible day.');
        }
      }
    }

    const pcts = percentiles(player);
    const cap = gd().DIST_CAP[band] || 250;
    const whyBits = [];

    // Build the week × day grid.
    let flatDays, deloadWeeks = [];
    if (variant.rfs) {
      const built = buildRfsDays(variant, player, !!opts.longLayoff, dpw);
      flatDays = built.days;
      weeks = built.weeks;
      if (opts.longLayoff) whyBits.push('4+ week layoff → every ladder step runs twice');
    } else {
      // Weak long-toss distance extends the stretch-out phase by one week
      // before the first high-intent phase.
      let shift = 0;
      const weakDist = pcts.maxThrowDist.value != null && pcts.maxThrowDist.value < 0.6 * cap;
      if (weakDist && (variant.distExtend || variant.capNote) &&
          (variant.phases || []).some(function (p) { return p.highPhase; })) {
        shift = 1;
        whyBits.push('long toss ' + pcts.maxThrowDist.value + ' ft is under 60% of the ' + cap +
          ' ft cap → stretch-out phase extended 1 week before any max-intent work');
      }
      const ranges = phaseRanges(variant, weeks, shift);
      flatDays = [];
      for (let w = 1; w <= weeks; w++) {
        const phase = phaseForWeek(ranges, w);
        if (!phase) continue;
        const tplDays = (phase.days || []).slice(0, dpw);
        const deload = variant.deloadEvery && (w % variant.deloadEvery === 0) && w < weeks;
        if (deload) deloadWeeks.push(w);
        for (let d = 0; d < tplDays.length; d++) {
          flatDays.push({ weekIndex: w - 1, dayIndex: d,
            day: buildDay(tplDays[d], { cap: cap, deload: deload, armNote: variant.armNote }) });
        }
      }
    }

    // Weak-metric emphasis for hitting goals (+1 round of the mapped drill).
    if (variant.emphasis) {
      const ev = pcts.exitVeloMax.pct, bs = pcts.batSpeed.pct;
      let weakKey = null;
      if (ev != null && bs != null) weakKey = bs < ev ? 'bs' : 'ev';
      else if (ev != null && ev < 40) weakKey = 'ev';
      else if (bs != null && bs < 40) weakKey = 'bs';
      if (weakKey) {
        const slug = variant.emphasis[weakKey];
        const seed = CT.seeds.bySlug(slug);
        const n = applyEmphasis(flatDays, slug);
        if (n) {
          const label = weakKey === 'ev' ? 'exit velo' : 'bat speed';
          const pct = weakKey === 'ev' ? ev : bs;
          whyBits.push(label + ' at the ' + ord(pct) + ' percentile is the weaker tool → +1 round of ' +
            (seed ? seed.name : slug) + ' on hitting days');
        }
      }
    }

    // "Why this program" — the audit-friendly one-liner the wizard + builder show.
    // Cite the assessed number that motivates the goal (age band + weak metric).
    if (goalId === 'thr-velo' && pcts.fastballVelo.pct != null) {
      whyBits.push('throwing velo ' + pcts.fastballVelo.value + ' mph (' + ord(pcts.fastballVelo.pct) + ' %ile for ' + band + ')' + measuredNote(pcts.fastballVelo) + ' is the target tool');
    }
    if (goalId === 'hit-power' && pcts.exitVeloMax.pct != null) {
      whyBits.push('max exit velo ' + pcts.exitVeloMax.value + ' mph (' + ord(pcts.exitVeloMax.pct) + ' %ile for ' + band + ')' + measuredNote(pcts.exitVeloMax) + ' is the gap');
    }
    if (goalId === 'thr-base' && pcts.maxThrowDist.value != null) {
      whyBits.push('long toss ' + pcts.maxThrowDist.value + ' ft' + measuredNote(pcts.maxThrowDist) +
        ' vs the ' + cap + ' ft ' + band + ' cap');
    }
    const goalLabel = goal.label;
    whyBits.unshift('age ' + age + ' (' + band + ') → ' + variant.name);
    // Honest in-season line: "maintenance dosing" is claimed ONLY when a real
    // season:'in' variant was selected — other in-season-safe goals just note
    // that max-intent work stays locked.
    if (opts.inSeason && variant.season === 'in') {
      whyBits.push('in-season → maintenance dosing, one full rest day guaranteed');
    } else if (opts.inSeason) {
      whyBits.push('in-season → max-intent throwing, weighted balls, and overload bats stay locked');
    }
    if (deloadWeeks.length) whyBits.push('deload every ' + variant.deloadEvery + 'th week (wk ' + deloadWeeks.join(', ') + ')');
    const why = 'Why this program: ' + goalLabel + ' — ' + whyBits.join('; ') + '.';

    // Description: why-line + template copy + safety rails.
    const descParts = [why, '', variant.description || ''];
    if (variant.totalNote) descParts.push('Volume: ' + variant.totalNote + '.');
    if (variant.capNote || variant.distExtend) descParts.push('Long-toss distance ceiling: ' + cap + ' ft (' + band + ').');
    (variant.safety || []).forEach(function (s) { descParts.push('SAFETY: ' + s); });
    if (goal.type === 'throwing') {
      descParts.push(gd().CALENDAR_NOTE);
      if (variant.rfs) descParts.push(gd().SORENESS_RULES);
    }
    const description = descParts.filter(function (x, i) { return x !== '' || i === 1; }).join('\n');

    if (opts.inSeason && goalId === 'str-athletic') {
      warnings.push('In-season: consider "In-season strength maintenance" instead — it keeps load and cuts volume.');
    }

    const programData = {
      name: variant.name + ' — ' + player.name,
      type: goal.type,
      source: 'generated',
      goalId: goalId,
      description: description,
      weeks: weeks,
      daysPerWeek: dpw,
      days: flatDays.map(function (fd) {
        return { weekIndex: fd.weekIndex, dayIndex: fd.dayIndex, title: fd.day.title,
          intensity: fd.day.intensity,
          items: fd.day.items.map(function (it) {
            return it.kind === 'drill'
              ? { kind: 'drill', drillId: it.drillId, sets: it.sets, reps: it.reps, notes: it.notes }
              : it;
          }) };
      }),
      ageBands: bandsBetween(variant.minAge, variant.maxAge),
      ageGateMin: variant.ageGateMin == null ? null : variant.ageGateMin,
      clinicianRequired: (elig.confirms || []).some(function (c) { return c.key === 'physicianCleared'; }),
      generatorMeta: {
        rulesVersion: gd().RULES_VERSION,
        generatedAt: new Date().toISOString(),
        playerId: player.id, age: age, ageBand: band,
        inputs: {
          goalId: goalId, weeks: weeks, daysPerWeek: dpw,
          inSeason: !!opts.inSeason, longLayoff: !!opts.longLayoff,
          confirmations: confirmations
        },
        percentiles: {
          exitVeloMax: pcts.exitVeloMax.pct, batSpeed: pcts.batSpeed.pct,
          fastballVelo: pcts.fastballVelo.pct, maxThrowDist: pcts.maxThrowDist.pct
        },
        variantName: variant.name,
        why: why
      }
    };

    const assignmentData = {
      playerId: player.id,
      programId: null, // filled at commit
      startDate: startDate,
      daysOfWeek: pattern,
      status: 'active',
      notes: variant.lockSchedule ? 'Every-other-day ladder — schedule locked to Mon/Wed/Fri.' : ''
    };

    const slugs = [];
    flatDays.forEach(function (fd) {
      fd.day.items.forEach(function (it) {
        if (it.kind === 'drill' && it.slug && slugs.indexOf(it.slug) < 0) slugs.push(it.slug);
      });
    });

    const plan = {
      ok: true,
      player: player, goal: goal, variant: variant,
      program: programData, assignment: assignmentData,
      slugs: slugs, warnings: warnings, why: why,
      lockSchedule: !!variant.lockSchedule,
      confirmsToStore: (elig.confirms || []).filter(function (c) {
        return c.store && confirmed(c);
      }).map(function (c) { return c.key; })
    };

    // Safety audit — templates should always pass; surface regressions loudly.
    const violations = audit(plan);
    if (violations.length) {
      violations.forEach(function (v) { console.warn('Generator invariant violation:', v); });
      return { ok: false, blocked: true, reason: 'Safety audit failed: ' + violations[0], violations: violations };
    }
    return plan;
  }

  // ---------------------------------------------------------------------------
  // AUDIT — machine-checkable safety invariants over a built plan.
  // ---------------------------------------------------------------------------
  function audit(plan) {
    const v = [];
    if (!plan || !plan.ok && !plan.program) return ['no plan'];
    const prog = plan.program;
    const age = plan.program.generatorMeta.age;
    const pattern = plan.assignment.daysOfWeek || [];

    // (2) Drill age gates — no weighted-ball/OU/etc. below its exact-age floor.
    prog.days.forEach(function (day) {
      (day.items || []).forEach(function (it) {
        if (it.kind !== 'drill') return;
        const slug = String(it.drillId || '').indexOf(CT.seeds.ID_PREFIX) === 0
          ? String(it.drillId).slice(CT.seeds.ID_PREFIX.length) : null;
        if (slug && DRILL_AGE_GATES[slug] != null && age < DRILL_AGE_GATES[slug]) {
          v.push('"' + slug + '" requires age ' + DRILL_AGE_GATES[slug] + '+ (player is ' + age + ') — wk' + (day.weekIndex + 1));
        }
      });
    });

    // (3) High-intensity days never on adjacent weekdays within a week.
    const byWeek = {};
    prog.days.forEach(function (day) {
      if (day.intensity !== 'high') return;
      const dow = pattern[day.dayIndex];
      if (dow == null) return;
      (byWeek[day.weekIndex] = byWeek[day.weekIndex] || []).push(dow);
    });
    Object.keys(byWeek).forEach(function (w) {
      const dows = byWeek[w].slice().sort(function (a, b) { return a - b; });
      for (let i = 1; i < dows.length; i++) {
        if (dows[i] - dows[i - 1] === 1) v.push('adjacent high days (wk ' + (Number(w) + 1) + ': ' + dows.join(',') + ')');
      }
    });

    // (4) Throwing days (non-recovery) start warm-up + J-Band, end recovery.
    if (prog.type === 'throwing') {
      prog.days.forEach(function (day) {
        if (day.intensity === 'recovery') return;
        const drills = (day.items || []).filter(function (it) { return it.kind === 'drill'; });
        const throwsBall = drills.some(function (it) {
          const slug = String(it.drillId).slice(CT.seeds.ID_PREFIX.length);
          const seed = CT.seeds.bySlug(slug);
          return seed && seed.category === 'throwing' &&
            ['dynamic-warmup', 'jband-series', 'recovery-plyocare', 'soreness-check'].indexOf(slug) < 0;
        });
        if (!throwsBall || !drills.length) return;
        const first = String(drills[0].drillId).slice(CT.seeds.ID_PREFIX.length);
        const last = String(drills[drills.length - 1].drillId).slice(CT.seeds.ID_PREFIX.length);
        if (first !== 'dynamic-warmup') v.push('throwing day wk' + (day.weekIndex + 1) + ' d' + (day.dayIndex + 1) + ' does not start with the dynamic warm-up');
        if (last !== 'recovery-plyocare') v.push('throwing day wk' + (day.weekIndex + 1) + ' d' + (day.dayIndex + 1) + ' does not end with recovery work');
      });

      // (9) Annual-calendar rule embedded in every throwing program.
      if (String(prog.description).indexOf('4 months off competitive pitching') < 0) {
        v.push('throwing program missing the annual-calendar rule');
      }
    }

    // (5) RFS is every-other-day (Mon/Wed/Fri) only.
    if (plan.goal && plan.goal.id === 'thr-rfs') {
      if (pattern.join(',') !== '1,3,5') v.push('RFS schedule must be locked to Mon/Wed/Fri');
    }

    // (11) Rules-version stamp.
    if (!prog.generatorMeta || prog.generatorMeta.rulesVersion !== gd().RULES_VERSION) {
      v.push('missing/stale generatorMeta.rulesVersion');
    }
    return v;
  }

  // ---------------------------------------------------------------------------
  // COMMIT — the only writer: seed self-heal, insert program + assignment,
  // persist confirmed readiness flags onto the player.
  // ---------------------------------------------------------------------------
  function commit(player, plan) {
    if (!plan || !plan.ok) throw new Error('commit() needs a successful generate() plan.');
    // Self-heal: a generated program must never reference a deleted seed drill.
    CT.seeds.ensureSlugs(plan.slugs);
    const program = CT.store.insert('programs', plan.program);
    const assignment = CT.store.insert('programAssignments',
      Object.assign({}, plan.assignment, { programId: program.id }));
    if (plan.confirmsToStore.length) {
      const ready = Object.assign(
        { minus3Bat: false, maturityConfirmed: false, physicianCleared: false },
        readiness(player));
      plan.confirmsToStore.forEach(function (k) { ready[k] = true; });
      ready.updatedAt = new Date().toISOString();
      CT.store.update('players', player.id, { readiness: ready });
    }
    return { program: program, assignment: assignment };
  }

  window.CT.generator = {
    CONFIRM_DEFS: CONFIRM_DEFS,
    DRILL_AGE_GATES: DRILL_AGE_GATES,
    eligibility: eligibility,
    recommend: recommend,
    generate: generate,
    audit: audit,
    commit: commit,
    percentiles: percentiles,
    painFlagged: painFlagged,
    pickVariant: pickVariant
  };
})();

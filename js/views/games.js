/* views/games.js — Game box-score entry (phase 2). Built on the shared foundation
   (CT.store / CT.model / CT.stats / CT.pitchsmart / CT.ui). Mirrors the structure
   and conventions of views/roster.js.

   WHAT IT DOES
   - List games (sorted newest first) with result + line counts; create / edit / delete a game.
   - Game detail = a box score: enter RAW per-player COUNTERS only for batting,
     pitching and fielding (rates are DERIVED on read via CT.stats — never stored).
   - Finalize-then-version: a game is a DRAFT until "Finalize", which commits one
     append-only WorkloadLog per pitching appearance (feeds Pitch Smart). After
     finalize the lines lock; "Reopen (new version)" bumps the version so you can
     correct. Re-finalizing is idempotent (each outing's workload is logged once,
     tracked by appearance id) so Pitch Smart is never double-counted.

   FOUNDATION-SAFE METADATA
   The Game model has no ipg / finalized / version / pitching-decision fields, and
   store.insert() normalizes through the factory (extra keys are dropped). So this
   view stores its own per-game metadata as a JSON trailer on game.notes behind a
   tag, and strips it for display. Nothing in the foundation is modified. */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, stats = CT.stats, esc = CT.escapeHtml;

  // ---------------------------------------------------------------------------
  // Per-game metadata (ipg / finalize / version / decisions) packed into notes.
  // ---------------------------------------------------------------------------
  const META_TAG = '\n#CTGAMEMETA#';

  function defaultIpg() {
    const season = (store.all('seasons')[0]) || null;
    const team = (store.all('teams')[0]) || null;
    const level = (season && season.level) || (team && team.level) || 'youth';
    return model.inningsPerGame(level);
  }

  function defaultMeta() { return { ipg: defaultIpg(), final: false, v: 1, dec: {} }; }

  function splitNotes(raw) {
    raw = raw || '';
    const i = raw.indexOf(META_TAG);
    if (i < 0) return { notes: raw, meta: defaultMeta() };
    const notes = raw.slice(0, i).replace(/\s+$/, '');
    let meta = defaultMeta();
    try { meta = Object.assign(defaultMeta(), JSON.parse(raw.slice(i + META_TAG.length)) || {}); } catch (e) { /* ignore */ }
    if (!meta.dec || typeof meta.dec !== 'object') meta.dec = {};
    return { notes: notes, meta: meta };
  }
  function joinNotes(notes, meta) { return (notes || '') + META_TAG + JSON.stringify(meta); }

  function metaOf(game) { return splitNotes(game.notes).meta; }
  function cleanNotes(game) { return splitNotes(game.notes).notes; }
  function gameIpg(game) { return metaOf(game).ipg || defaultIpg(); }
  function isFinal(game) { return !!metaOf(game).final; }

  // Persist a partial metadata patch back onto the game (keeps clean notes intact).
  function patchMeta(game, patch) {
    const split = splitNotes(game.notes);
    const meta = Object.assign({}, split.meta, patch);
    return store.update('games', game.id, { notes: joinNotes(split.notes, meta) });
  }

  // ---------------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------------
  function playerName(id) { const p = store.getPlayer(id); return p ? p.name : '— unknown —'; }
  function playerLevel(id) { const p = store.getPlayer(id); return (p && p.level) || 'youth'; }
  function players() { return store.getPlayers(); }
  function playerOptions(selected) {
    return players().map(function (p) { return { value: p.id, label: p.name }; })
      .concat(selected && !store.getPlayer(selected) ? [{ value: selected, label: '(removed player)' }] : []);
  }

  function gameLines(game) {
    return {
      bat: store.where('battingStatLines', 'gameId', game.id),
      pit: store.where('pitchingAppearances', 'gameId', game.id),
      fld: store.where('fieldingStatLines', 'gameId', game.id)
    };
  }

  function resultBadge(game) {
    if (game.scoreFor == null || game.scoreAgainst == null) return ui.badge('Scheduled', 'neutral');
    if (game.scoreFor > game.scoreAgainst) return ui.badge('W ' + game.scoreFor + '–' + game.scoreAgainst, 'green');
    if (game.scoreFor < game.scoreAgainst) return ui.badge('L ' + game.scoreFor + '–' + game.scoreAgainst, 'red');
    return ui.badge('T ' + game.scoreFor + '–' + game.scoreAgainst, 'yellow');
  }

  function vsLabel(game) { return (game.homeAway === 'away' ? '@ ' : 'vs ') + (game.opponent || 'TBD'); }

  // Read a trimmed string / numeric value from a mounted modal.
  function reader(modal) {
    function val(n) { const el = modal.querySelector('[name="' + n + '"]'); return el ? String(el.value).trim() : ''; }
    function num(n) { const v = val(n); return v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null); }
    function int0(n) { const v = num(n); return v == null ? 0 : Math.round(v); }
    return { val: val, num: num, int0: int0 };
  }

  // Build a labelled grid of integer-counter fields. specs: [{name,label,help?}]
  function counterGrid(specs, source) {
    source = source || {};
    return '<div class="games-num-grid">' + specs.map(function (s) {
      return ui.formField({
        type: 'number', name: s.name, label: s.label, min: 0, step: 1,
        value: source[s.name] == null ? '' : source[s.name], help: s.help
      });
    }).join('') + '</div>';
  }

  // ===========================================================================
  // GAME create / edit / delete
  // ===========================================================================
  function openGameForm(existing) {
    const g = existing || {};
    const meta = existing ? metaOf(existing) : defaultMeta();
    const html =
      '<div class="field-row">' +
        ui.formField({ type: 'date', name: 'date', label: 'Date', value: existing ? g.date : CT.todayISO(), required: true }) +
        ui.formField({ type: 'select', name: 'homeAway', label: 'Home / Away', value: g.homeAway || 'home', options: [{ value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }] }) +
      '</div>' +
      ui.formField({ type: 'text', name: 'opponent', label: 'Opponent', value: g.opponent, required: true, placeholder: 'e.g. River Hawks' }) +
      '<div class="field-row">' +
        ui.formField({ type: 'number', name: 'scoreFor', label: 'Runs for', value: g.scoreFor == null ? '' : g.scoreFor, min: 0, step: 1, help: 'Leave blank if not played.' }) +
        ui.formField({ type: 'number', name: 'scoreAgainst', label: 'Runs against', value: g.scoreAgainst == null ? '' : g.scoreAgainst, min: 0, step: 1 }) +
      '</div>' +
      ui.formField({ type: 'select', name: 'ipg', label: 'Innings per game', value: String(meta.ipg), options: [{ value: '6', label: '6 (Youth)' }, { value: '7', label: '7 (High School)' }, { value: '9', label: '9 (College / Pro)' }], help: 'Scales team ERA / K9 / BB9 for this box score.' }) +
      ui.formField({ type: 'textarea', name: 'notes', label: 'Notes', value: existing ? cleanNotes(existing) : '' }) +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn btn-primary" data-act="save">' + (existing ? 'Save game' : 'Create game') + '</button>' +
      '</div>';

    ui.openModal(existing ? 'Edit game' : 'New game', html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const r = reader(modal);
        const opponent = r.val('opponent');
        if (!opponent) { ui.toast('Opponent is required.'); return; }
        if (!r.val('date')) { ui.toast('Date is required.'); return; }
        const newMeta = Object.assign({}, meta, { ipg: Number(r.val('ipg')) || defaultIpg() });
        const season = store.all('seasons')[0], team = store.all('teams')[0];
        const data = {
          date: r.val('date'),
          opponent: opponent,
          homeAway: r.val('homeAway'),
          scoreFor: r.num('scoreFor'),
          scoreAgainst: r.num('scoreAgainst'),
          seasonId: g.seasonId || (season && season.id) || null,
          teamId: g.teamId || (team && team.id) || null,
          notes: joinNotes(r.val('notes'), newMeta)
        };
        let saved;
        if (existing) saved = store.update('games', g.id, data);
        else saved = store.insert('games', data);
        close();
        ui.toast(existing ? 'Game saved' : 'Game created');
        if (existing) CT.router.route();
        else CT.router.navigate('#/games/' + saved.id);
      });
    });
  }

  function deleteGame(game) {
    ui.confirmDialog('Delete game',
      'Delete ' + vsLabel(game) + ' and all of its batting, pitching and fielding lines? Workload already logged for Pitch Smart is kept. This cannot be undone.',
      'Delete', function () {
        gameLines(game).bat.forEach(function (l) { store.remove('battingStatLines', l.id); });
        gameLines(game).pit.forEach(function (l) { store.remove('pitchingAppearances', l.id); });
        gameLines(game).fld.forEach(function (l) { store.remove('fieldingStatLines', l.id); });
        store.remove('games', game.id);
        ui.toast('Game deleted');
        CT.router.navigate('#/games');
      });
  }

  // ===========================================================================
  // BATTING line entry (RAW counters only — 1B / rates are derived on read)
  // ===========================================================================
  const BAT_SPECS = [
    { name: 'ab', label: 'AB' }, { name: 'h', label: 'H' }, { name: 'b2', label: '2B' },
    { name: 'b3', label: '3B' }, { name: 'hr', label: 'HR' }, { name: 'bb', label: 'BB' },
    { name: 'hbp', label: 'HBP' }, { name: 'so', label: 'SO' }, { name: 'sf', label: 'SF' },
    { name: 'sb', label: 'SB' }, { name: 'cs', label: 'CS' }, { name: 'r', label: 'R' },
    { name: 'rbi', label: 'RBI' }
  ];

  function openBattingForm(game, existing) {
    const lines = gameLines(game).bat;
    const taken = lines.map(function (l) { return l.playerId; });
    const opts = playerOptions(existing && existing.playerId).filter(function (o) {
      return existing ? true : taken.indexOf(o.value) < 0;
    });
    if (!opts.length) { ui.toast('Every player already has a batting line.'); return; }
    const src = existing || {};
    const html =
      ui.formField({ type: 'select', name: 'playerId', label: 'Batter', value: src.playerId || opts[0].value, options: opts, required: true }) +
      '<div class="field-row">' +
        ui.formField({ type: 'number', name: 'pa', label: 'PA (optional)', value: src.pa == null ? '' : src.pa, min: 0, step: 1, help: 'Blank = derived (AB+BB+HBP+SF).' }) +
        ui.formField({ type: 'number', name: 'qab', label: 'Quality AB (optional)', value: src.qab == null ? '' : src.qab, min: 0, step: 1, help: 'High-signal youth metric.' }) +
      '</div>' +
      counterGrid(BAT_SPECS, src) +
      '<p class="muted" style="font-size:.8rem;">Singles, AVG, OBP, SLG, OPS and K%/BB% are derived from these counters — not entered.</p>' +
      '<div class="modal-actions">' +
        (existing ? '<button class="btn btn-danger btn-sm" data-act="del">Delete line</button>' : '<span></span>') +
        '<div class="row">' +
          '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="save">' + (existing ? 'Save line' : 'Add line') + '</button>' +
        '</div>' +
      '</div>';

    ui.openModal(existing ? 'Edit batting line' : 'Add batting line', html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      const del = modal.querySelector('[data-act="del"]');
      if (del) del.addEventListener('click', function () { store.remove('battingStatLines', existing.id); close(); ui.toast('Line deleted'); CT.router.route(); });
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const r = reader(modal);
        const data = { gameId: game.id, playerId: r.val('playerId'), pa: r.num('pa'), qab: r.num('qab') };
        if (!data.playerId) { ui.toast('Pick a batter.'); return; }
        BAT_SPECS.forEach(function (s) { data[s.name] = r.int0(s.name); });
        if (existing) store.update('battingStatLines', existing.id, data);
        else store.insert('battingStatLines', data);
        close();
        ui.toast('Batting line saved');
        CT.router.route();
      });
    });
  }

  // ===========================================================================
  // PITCHING appearance entry (RAW counters; outs = IP*3). Decision -> game meta.
  // ===========================================================================
  const PIT_SPECS = [
    { name: 'bf', label: 'BF' }, { name: 'pitches', label: 'Pitches' }, { name: 'strikes', label: 'Strikes' },
    { name: 'h', label: 'H' }, { name: 'r', label: 'R' }, { name: 'er', label: 'ER' },
    { name: 'bb', label: 'BB' }, { name: 'so', label: 'SO' }, { name: 'hbp', label: 'HBP' },
    { name: 'hr', label: 'HR' }, { name: 'firstPitchStrikes', label: 'FPS' }, { name: 'firstPitchPA', label: 'FPS PA' }
  ];
  const DECISIONS = [
    { value: '', label: 'No decision' }, { value: 'W', label: 'Win' }, { value: 'L', label: 'Loss' },
    { value: 'S', label: 'Save' }, { value: 'H', label: 'Hold' }, { value: 'BS', label: 'Blown save' }
  ];

  function openPitchingForm(game, existing) {
    const meta = metaOf(game);
    const opts = playerOptions(existing && existing.playerId);
    if (!opts.length) { ui.toast('Add a player to the roster first.'); return; }
    const src = existing || {};
    const dec = (existing && meta.dec[existing.id]) || '';
    const html =
      ui.formField({ type: 'select', name: 'playerId', label: 'Pitcher', value: src.playerId || opts[0].value, options: opts, required: true }) +
      '<div class="field-row">' +
        ui.formField({ type: 'number', name: 'outs', label: 'Outs recorded', value: src.outs == null ? '' : src.outs, min: 0, step: 1, required: true, help: '3 outs = 1 inning (e.g. 6 = 2.0 IP).' }) +
        ui.formField({ type: 'select', name: 'decision', label: 'Decision', value: dec, options: DECISIONS }) +
      '</div>' +
      counterGrid(PIT_SPECS, src) +
      '<p class="muted" style="font-size:.8rem;">IP, ERA, WHIP, K/9, Strike% and FPS% are derived from these counters. Finalize the game to log this outing to Pitch Smart.</p>' +
      '<div class="modal-actions">' +
        (existing ? '<button class="btn btn-danger btn-sm" data-act="del">Delete</button>' : '<span></span>') +
        '<div class="row">' +
          '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="save">' + (existing ? 'Save outing' : 'Add outing') + '</button>' +
        '</div>' +
      '</div>';

    ui.openModal(existing ? 'Edit pitching outing' : 'Add pitching outing', html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      const del = modal.querySelector('[data-act="del"]');
      if (del) del.addEventListener('click', function () {
        store.remove('pitchingAppearances', existing.id);
        const m = metaOf(game); delete m.dec[existing.id]; patchMeta(game, { dec: m.dec });
        close(); ui.toast('Outing deleted'); CT.router.route();
      });
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const r = reader(modal);
        const playerId = r.val('playerId');
        if (!playerId) { ui.toast('Pick a pitcher.'); return; }
        const data = { gameId: game.id, playerId: playerId, outs: r.int0('outs') };
        PIT_SPECS.forEach(function (s) { data[s.name] = r.int0(s.name); });
        let saved;
        if (existing) saved = store.update('pitchingAppearances', existing.id, data);
        else saved = store.insert('pitchingAppearances', data);
        // Decision is not a model field — persist it on the game's metadata map.
        const m = metaOf(game); m.dec[saved.id] = r.val('decision'); patchMeta(game, { dec: m.dec });
        close();
        ui.toast('Pitching outing saved');
        CT.router.route();
      });
    });
  }

  // ===========================================================================
  // FIELDING line entry (RAW counters; fielding% = reliability, derived)
  // ===========================================================================
  function openFieldingForm(game, existing) {
    const opts = playerOptions(existing && existing.playerId);
    if (!opts.length) { ui.toast('Add a player to the roster first.'); return; }
    const src = existing || {};
    const html =
      ui.formField({ type: 'select', name: 'playerId', label: 'Fielder', value: src.playerId || opts[0].value, options: opts, required: true }) +
      ui.formField({ type: 'text', name: 'position', label: 'Position', value: src.position, placeholder: 'e.g. Shortstop' }) +
      counterGrid([{ name: 'po', label: 'PO' }, { name: 'a', label: 'A' }, { name: 'e', label: 'E' }], src) +
      '<p class="muted" style="font-size:.8rem;">Fielding% (reliability, not a ranking) is derived from PO/A/E.</p>' +
      '<div class="modal-actions">' +
        (existing ? '<button class="btn btn-danger btn-sm" data-act="del">Delete</button>' : '<span></span>') +
        '<div class="row">' +
          '<button class="btn btn-ghost" data-act="cancel">Cancel</button>' +
          '<button class="btn btn-primary" data-act="save">' + (existing ? 'Save line' : 'Add line') + '</button>' +
        '</div>' +
      '</div>';

    ui.openModal(existing ? 'Edit fielding line' : 'Add fielding line', html, function (modal, close) {
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      const del = modal.querySelector('[data-act="del"]');
      if (del) del.addEventListener('click', function () { store.remove('fieldingStatLines', existing.id); close(); ui.toast('Line deleted'); CT.router.route(); });
      modal.querySelector('[data-act="save"]').addEventListener('click', function () {
        const r = reader(modal);
        const playerId = r.val('playerId');
        if (!playerId) { ui.toast('Pick a fielder.'); return; }
        const data = { gameId: game.id, playerId: playerId, position: r.val('position'), po: r.int0('po'), a: r.int0('a'), e: r.int0('e') };
        if (existing) store.update('fieldingStatLines', existing.id, data);
        else store.insert('fieldingStatLines', data);
        close();
        ui.toast('Fielding line saved');
        CT.router.route();
      });
    });
  }

  // ===========================================================================
  // Finalize-then-version: commit append-only WorkloadLogs (idempotent per outing).
  // ===========================================================================
  function workloadTag(apptId) { return '[box:' + apptId + ']'; }

  function finalizeGame(game) {
    const apps = gameLines(game).pit;
    let logged = 0;
    apps.forEach(function (a) {
      if (a.outs <= 0 && a.pitches <= 0) return; // nothing to log
      const existing = store.byPlayer('workloadLogs', a.playerId).some(function (w) {
        return (w.notes || '').indexOf(workloadTag(a.id)) >= 0;
      });
      if (existing) return; // already committed this outing — never double-count
      store.append('workloadLogs', {
        playerId: a.playerId, date: game.date, type: 'game',
        pitches: a.pitches, outs: a.outs,
        notes: 'Game ' + vsLabel(game) + ' ' + workloadTag(a.id)
      });
      logged++;
    });
    patchMeta(game, { final: true });
    ui.toast(logged ? ('Finalized — logged ' + logged + ' outing(s) to Pitch Smart') : 'Game finalized');
    CT.router.route();
  }

  function reopenGame(game) {
    const meta = metaOf(game);
    patchMeta(game, { final: false, v: (meta.v || 1) + 1 });
    ui.toast('Reopened as v' + ((meta.v || 1) + 1) + ' — already-logged workload is locked');
    CT.router.route();
  }

  // ===========================================================================
  // Detail rendering (box score)
  // ===========================================================================
  function statChips(pairs) {
    return '<div class="games-chips">' + pairs.map(function (p) {
      return '<span class="games-chip"><b>' + esc(p[1]) + '</b> ' + esc(p[0]) + '</span>';
    }).join('') + '</div>';
  }

  function batTable(game, final) {
    const lines = gameLines(game).bat;
    if (!lines.length) return ui.emptyState('🪵', 'No batting lines yet', 'Add a batter to start the box score.');
    let rows = lines.map(function (l) {
      const d = stats.battingFromLines([l]);
      const editBtn = final ? '' : '<button class="btn btn-sm btn-ghost" data-bat="' + esc(l.id) + '">Edit</button>';
      return '<tr><td>' + esc(playerName(l.playerId)) + '</td><td>' + d.pa + '</td><td>' + l.ab + '</td><td>' + l.h +
        '</td><td>' + d.singles + '</td><td>' + l.b2 + '</td><td>' + l.b3 + '</td><td>' + l.hr + '</td><td>' + l.bb +
        '</td><td>' + l.so + '</td><td>' + l.r + '</td><td>' + l.rbi + '</td><td>' + stats.fmtRate(d.avg) +
        '</td><td>' + stats.fmtRate(d.ops) + '</td><td>' + editBtn + '</td></tr>';
    }).join('');
    const tot = stats.battingFromLines(lines);
    rows += '<tr class="games-total"><td>Team</td><td>' + tot.pa + '</td><td>' + tot.ab + '</td><td>' + tot.h +
      '</td><td>' + tot.singles + '</td><td>' + tot.b2 + '</td><td>' + tot.b3 + '</td><td>' + tot.hr + '</td><td>' + tot.bb +
      '</td><td>' + tot.so + '</td><td>' + tot.r + '</td><td>' + tot.rbi + '</td><td>' + stats.fmtRate(tot.avg) +
      '</td><td>' + stats.fmtRate(tot.ops) + '</td><td></td></tr>';
    return '<div class="table-wrap"><table class="ct-table"><thead><tr>' +
      ['Batter', 'PA', 'AB', 'H', '1B', '2B', '3B', 'HR', 'BB', 'SO', 'R', 'RBI', 'AVG', 'OPS', ''].map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function pitTable(game, final) {
    const lines = gameLines(game).pit;
    if (!lines.length) return ui.emptyState('🎯', 'No pitching outings yet', 'Add an outing — finalize logs it to Pitch Smart.');
    const meta = metaOf(game);
    let rows = lines.map(function (l) {
      const ipg = model.inningsPerGame(playerLevel(l.playerId)); // ALWAYS the pitcher's level
      const d = stats.pitchingFromApps([l], ipg);
      const dec = meta.dec[l.id];
      const decTag = dec ? ' ' + ui.badge(dec, dec === 'W' ? 'green' : (dec === 'L' || dec === 'BS' ? 'red' : 'neutral')) : '';
      const editBtn = final ? '' : '<button class="btn btn-sm btn-ghost" data-pit="' + esc(l.id) + '">Edit</button>';
      return '<tr><td>' + esc(playerName(l.playerId)) + decTag + '</td><td>' + d.ipDisplay + '</td><td>' + l.h +
        '</td><td>' + l.r + '</td><td>' + l.er + '</td><td>' + l.bb + '</td><td>' + l.so + '</td><td>' + l.hr +
        '</td><td>' + l.pitches + '</td><td>' + stats.fmt2(d.era) + '</td><td>' + stats.fmt2(d.whip) +
        '</td><td>' + stats.fmtPct(d.strikePct, 0) + '</td><td>' + stats.fmtPct(d.fpsPct, 0) + '</td><td>' + editBtn + '</td></tr>';
    }).join('');
    const tot = stats.pitchingFromApps(lines, gameIpg(game));
    rows += '<tr class="games-total"><td>Team</td><td>' + tot.ipDisplay + '</td><td>' + tot.h + '</td><td>' + tot.r +
      '</td><td>' + tot.er + '</td><td>' + tot.bb + '</td><td>' + tot.so + '</td><td>' + tot.hr + '</td><td>' + tot.pitches +
      '</td><td>' + stats.fmt2(tot.era) + '</td><td>' + stats.fmt2(tot.whip) + '</td><td>' + stats.fmtPct(tot.strikePct, 0) +
      '</td><td>' + stats.fmtPct(tot.fpsPct, 0) + '</td><td></td></tr>';
    const table = '<div class="table-wrap"><table class="ct-table"><thead><tr>' +
      ['Pitcher', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'HR', 'P', 'ERA', 'WHIP', 'K%', 'FPS%', ''].map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    return table + pitchSmartStrip(lines);
  }

  // Per-pitcher Pitch Smart status (reflects workload committed on finalize).
  function pitchSmartStrip(lines) {
    const seen = {};
    const out = lines.map(function (l) {
      if (seen[l.playerId]) return '';
      seen[l.playerId] = true;
      const p = store.getPlayer(l.playerId);
      if (!p) return '';
      const v = CT.pitchsmart.evaluate(p, store.byPlayer('workloadLogs', p.id));
      let label;
      if (v.status === 'red') label = v.daysUntilEligible > 0 ? 'Resting (' + v.daysUntilEligible + 'd)' : 'Not cleared';
      else if (v.status === 'yellow') label = 'Caution · ' + v.remainingToday + ' left today';
      else label = 'Cleared · ' + v.remainingToday + ' left today';
      return '<div class="games-ps"><span class="status-dot ' + v.status + '"></span>' +
        '<b>' + esc(p.name) + '</b><span class="muted">' + esc(label) + '</span></div>';
    }).join('');
    return out ? '<div class="games-ps-wrap">' + out + '</div>' : '';
  }

  function fldTable(game, final) {
    const lines = gameLines(game).fld;
    if (!lines.length) return ui.emptyState('🧤', 'No fielding lines yet', 'Add PO / A / E for a fielder.');
    let rows = lines.map(function (l) {
      const d = stats.fieldingFromLines([l]);
      const editBtn = final ? '' : '<button class="btn btn-sm btn-ghost" data-fld="' + esc(l.id) + '">Edit</button>';
      return '<tr><td>' + esc(playerName(l.playerId)) + '</td><td>' + esc(l.position || '—') + '</td><td>' + l.po +
        '</td><td>' + l.a + '</td><td>' + l.e + '</td><td>' + stats.fmtRate(d.fieldingPct) + '</td><td>' + editBtn + '</td></tr>';
    }).join('');
    const tot = stats.fieldingFromLines(lines);
    rows += '<tr class="games-total"><td>Team</td><td>—</td><td>' + tot.po + '</td><td>' + tot.a + '</td><td>' + tot.e +
      '</td><td>' + stats.fmtRate(tot.fieldingPct) + '</td><td></td></tr>';
    return '<div class="table-wrap"><table class="ct-table"><thead><tr>' +
      ['Fielder', 'Pos', 'PO', 'A', 'E', 'Field% (reliab.)', ''].map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function sectionCard(title, addLabel, addAct, tableHtml, final) {
    const actions = final ? ui.badge('Locked', 'neutral') :
      '<button class="btn btn-sm btn-primary" data-add="' + addAct + '">' + esc(addLabel) + '</button>';
    return ui.card({ title: title, actions: actions, body: tableHtml });
  }

  function renderDetail(root, game) {
    const meta = metaOf(game);
    const final = !!meta.final;
    const ls = gameLines(game);
    const head = ui.pageHead(vsLabel(game), CT.formatDate(game.date) + ' · ' + (game.homeAway === 'away' ? 'Away' : 'Home') + ' · ' + gameIpg(game) + ' inn/game',
      '<button class="btn btn-ghost" data-act="back">← Games</button>');

    const summary = ui.card({
      rawTitle: true,
      title: resultBadge(game) + ' ' + (final ? ui.badge('Final · v' + (meta.v || 1), 'green') : ui.badge('Draft · v' + (meta.v || 1), 'yellow')),
      body:
        statChips([
          ['batters', ls.bat.length], ['pitchers', ls.pit.length], ['fielders', ls.fld.length]
        ]) +
        (cleanNotes(game) ? '<p class="muted" style="margin-top:.6rem;">' + esc(cleanNotes(game)) + '</p>' : '') +
        '<div class="row" style="margin-top:.8rem;">' +
          (final
            ? '<button class="btn btn-sm" data-act="reopen">Reopen (new version)</button>'
            : '<button class="btn btn-sm btn-primary" data-act="finalize">Finalize game</button>') +
          '<button class="btn btn-sm" data-act="editgame">Edit game</button>' +
          '<button class="btn btn-sm btn-danger" data-act="delgame">Delete</button>' +
        '</div>' +
        (final ? '<p class="muted" style="margin-top:.6rem;font-size:.8rem;">Locked. Reopen to correct — workload already logged for Pitch Smart stays put (never re-counted).</p>'
               : '<p class="muted" style="margin-top:.6rem;font-size:.8rem;">Enter raw counters, then Finalize to commit pitching workload to Pitch Smart.</p>')
    });

    root.innerHTML = head + summary +
      '<div class="games-section">' + sectionCard('Batting', '+ Batter', 'bat', batTable(game, final), final) + '</div>' +
      '<div class="games-section">' + sectionCard('Pitching', '+ Outing', 'pit', pitTable(game, final), final) + '</div>' +
      '<div class="games-section">' + sectionCard('Fielding', '+ Fielder', 'fld', fldTable(game, final), final) + '</div>';

    // wire toolbar
    root.querySelector('[data-act="back"]').addEventListener('click', function () { CT.router.navigate('#/games'); });
    root.querySelector('[data-act="editgame"]').addEventListener('click', function () { openGameForm(game); });
    root.querySelector('[data-act="delgame"]').addEventListener('click', function () { deleteGame(game); });
    const fin = root.querySelector('[data-act="finalize"]'); if (fin) fin.addEventListener('click', function () { finalizeGame(game); });
    const reo = root.querySelector('[data-act="reopen"]'); if (reo) reo.addEventListener('click', function () { reopenGame(game); });

    // wire "+ add" buttons
    root.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        const k = b.getAttribute('data-add');
        if (k === 'bat') openBattingForm(game, null);
        else if (k === 'pit') openPitchingForm(game, null);
        else openFieldingForm(game, null);
      });
    });
    // wire row edit buttons
    root.querySelectorAll('[data-bat]').forEach(function (b) { b.addEventListener('click', function () { openBattingForm(game, store.getById('battingStatLines', b.getAttribute('data-bat'))); }); });
    root.querySelectorAll('[data-pit]').forEach(function (b) { b.addEventListener('click', function () { openPitchingForm(game, store.getById('pitchingAppearances', b.getAttribute('data-pit'))); }); });
    root.querySelectorAll('[data-fld]').forEach(function (b) { b.addEventListener('click', function () { openFieldingForm(game, store.getById('fieldingStatLines', b.getAttribute('data-fld'))); }); });
  }

  // ===========================================================================
  // List rendering
  // ===========================================================================
  function gameCard(game) {
    const ls = gameLines(game);
    const final = isFinal(game);
    const body =
      '<div class="games-card-head">' + resultBadge(game) +
        (final ? ui.badge('Final', 'green') : ui.badge('Draft', 'yellow')) + '</div>' +
      statChips([['batters', ls.bat.length], ['pitchers', ls.pit.length], ['fielders', ls.fld.length]]) +
      '<div class="row" style="margin-top:.7rem;">' +
        '<button class="btn btn-sm btn-primary" data-open="' + esc(game.id) + '">Box score</button>' +
        '<button class="btn btn-sm" data-edit="' + esc(game.id) + '">Edit</button>' +
        '<button class="btn btn-sm btn-danger" data-del="' + esc(game.id) + '">Delete</button>' +
      '</div>';
    return ui.card({ title: vsLabel(game), subtitle: CT.formatDate(game.date) + ' · ' + (game.homeAway === 'away' ? 'Away' : 'Home'), body: body });
  }

  function renderList(root) {
    const games = store.all('games').slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
    });
    let html = ui.pageHead('Games', games.length + ' game(s) · box scores & raw stat lines',
      '<button class="btn btn-primary" id="new-game">+ New game</button>');

    if (!games.length) {
      html += ui.emptyState('⚾', 'No games yet', 'Create a game, then enter batting, pitching and fielding lines.',
        '<button class="btn btn-primary" id="new-game-empty">+ New game</button>');
      root.innerHTML = html;
      const e = root.querySelector('#new-game-empty'); if (e) e.addEventListener('click', function () { openGameForm(null); });
    } else {
      html += '<div class="grid-cards">' + games.map(gameCard).join('') + '</div>';
      root.innerHTML = html;
    }

    const ng = root.querySelector('#new-game'); if (ng) ng.addEventListener('click', function () { openGameForm(null); });
    root.querySelectorAll('[data-open]').forEach(function (b) { b.addEventListener('click', function () { CT.router.navigate('#/games/' + b.getAttribute('data-open')); }); });
    root.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { openGameForm(store.getById('games', b.getAttribute('data-edit'))); }); });
    root.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () { deleteGame(store.getById('games', b.getAttribute('data-del'))); }); });
  }

  // ===========================================================================
  // Entry point
  // ===========================================================================
  function render(root, ctx) {
    const game = ctx && ctx.param ? store.getById('games', ctx.param) : null;
    if (ctx && ctx.param && !game) {
      root.innerHTML = ui.pageHead('Games', 'Box scores & raw stat lines') +
        ui.emptyState('🔍', 'Game not found', 'That game no longer exists.',
          '<button class="btn btn-primary" data-act="back">← All games</button>');
      const b = root.querySelector('[data-act="back"]'); if (b) b.addEventListener('click', function () { CT.router.navigate('#/games'); });
      return;
    }
    if (game) renderDetail(root, game);
    else renderList(root);
  }

  CT.registerView('games', { label: 'Games', render: render });
})();

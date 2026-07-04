/* views/season.js — Team / Season Stats.
   Sortable batting / pitching / fielding leaderboards with qualifier filters
   (min PA / min IP), team record + run differential, and a Season vs Career
   scope toggle. EVERY rate is recomputed via CT.stats from RAW counters (never
   averaged per game). Youth framing: lead with OBP/BB%/K%/QAB%/Strike% (process
   rates), de-emphasize AVG/RBI, and avoid shame-style ranking. Registers itself
   via CT.registerView('season', { label, render }). */
(function () {
  'use strict';

  const CT = window.CT;
  const ui = CT.ui, store = CT.store, model = CT.model, S = CT.stats, esc = CT.escapeHtml;

  // Persistent (module-scoped) UI state — survives re-renders.
  const state = {
    scope: null,        // 'season' | 'career'
    seasonId: null,     // selected season for 'season' scope
    minPA: 1,
    minIP: 1,           // innings (decimal ok)
    showBelow: false,
    sorts: null,        // { bat:{key,dir}, pit:{key,dir}, fld:{key,dir} }
    embedded: false     // true when hosted inside the Games wrapper (skips H1)
  };
  let mountRoot = null;

  // ----- scope / season helpers -----
  function seasonsSorted() {
    return store.all('seasons').slice().sort(function (a, b) {
      return (a.startDate || '') < (b.startDate || '') ? 1 : -1; // newest first
    });
  }

  function ensureDefaults(players) {
    const seasons = seasonsSorted();
    if (state.scope == null) state.scope = seasons.length ? 'season' : 'career';
    if (state.seasonId == null && seasons.length) state.seasonId = seasons[0].id;
    if (!state.sorts) {
      const youth = isYouth(players);
      state.sorts = {
        bat: { key: youth ? 'obp' : 'avg', dir: 'desc' },
        pit: { key: 'era', dir: 'asc' },
        fld: { key: 'fieldingPct', dir: 'desc' }
      };
    }
  }

  function isYouth(players) {
    const season = store.getById('seasons', state.seasonId);
    if (state.scope === 'season' && season && season.level) return season.level === 'youth';
    if (!players.length) return true;
    return players.filter(function (p) { return p.level === 'youth'; }).length >= players.length / 2;
  }

  function scopeGames() {
    const all = store.all('games');
    if (state.scope === 'career') return all;
    return all.filter(function (g) { return g.seasonId === state.seasonId; });
  }

  // ----- per-player derived rows (rates recomputed from RAW counters) -----
  function buildRows(players, gameIds) {
    const inScope = function (l) { return gameIds[l.gameId]; };
    return players.map(function (p) {
      const bl = store.byPlayer('battingStatLines', p.id).filter(inScope);
      const pl = store.byPlayer('pitchingAppearances', p.id).filter(inScope);
      const fl = store.byPlayer('fieldingStatLines', p.id).filter(inScope);
      return {
        player: p,
        bat: S.battingFromLines(bl), hasBat: bl.length > 0,
        pit: pl.length ? S.pitchingFromApps(pl, model.inningsPerGame(p.level)) : null,
        fld: fl.length ? S.fieldingFromLines(fl) : null
      };
    });
  }

  function teamRecord(games) {
    const r = { w: 0, l: 0, t: 0, rf: 0, ra: 0 };
    games.forEach(function (g) {
      const f = Number(g.scoreFor) || 0, a = Number(g.scoreAgainst) || 0;
      r.rf += f; r.ra += a;
      if (f > a) r.w++; else if (f < a) r.l++; else r.t++;
    });
    return r;
  }

  // ----- sortable table -----
  function sortRows(rows, columns, sort) {
    const col = columns.filter(function (c) { return c.key === sort.key; })[0];
    if (!col) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      const va = col.sortVal(a), vb = col.sortVal(b);
      const an = va == null, bn = vb == null;
      if (an && bn) return 0;
      if (an) return 1;            // nulls always last
      if (bn) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  // Combine the design-system classes for a cell: `num` (right-align + tabular),
  // plus the youth col-high (accent) / col-low (de-emphasis) signal.
  function cellClasses(c) {
    const parts = [];
    if (c.num) parts.push('num');
    if (c.signal === 'high') parts.push('col-high');
    else if (c.signal === 'low') parts.push('col-low');
    return parts;
  }

  function thHtml(tbl, c, sort) {
    const active = sort.key === c.key;
    // Lucide sort glyph (no emoji / unicode triangles) — router repaints icons.
    const ind = active
      ? '<i class="sort-ind" data-lucide="' + (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') + '"></i>'
      : '';
    const cls = ['sortable'].concat(cellClasses(c)).join(' ');
    return '<th class="' + cls + '" data-tbl="' + tbl + '" data-key="' + esc(c.key) + '"' +
      (active ? ' aria-sort="' + (sort.dir === 'asc' ? 'ascending' : 'descending') + '"' : '') +
      '>' + esc(c.label) + ind + '</th>';
  }

  function renderTable(tbl, columns, rows, sort) {
    const head = '<tr>' + columns.map(function (c) { return thHtml(tbl, c, sort); }).join('') + '</tr>';
    const body = sortRows(rows, columns, sort).map(function (r) {
      return '<tr' + (r._below ? ' class="below-q"' : '') + '>' + columns.map(function (c) {
        const parts = cellClasses(c);
        const cls = parts.length ? ' class="' + parts.join(' ') + '"' : '';
        return '<td' + cls + '>' + c.cell(r) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="ct-table">' + head + body + '</table></div>';
  }

  // ----- column definitions -----
  function nameCol() {
    return {
      key: 'name', label: 'Player', signal: null, num: false,
      sortVal: function (r) { return (r.player.name || '').toLowerCase(); },
      cell: function (r) {
        const j = r.player.jersey ? ' <span class="muted">#' + esc(r.player.jersey) + '</span>' : '';
        return esc(r.player.name) + j;
      }
    };
  }
  function rateCol(key, label, get, signal) {
    return { key: key, label: label, signal: signal || null, num: true, sortVal: get, cell: function (r) { return S.fmtRate(get(r)); } };
  }
  function pctCol(key, label, get, signal) {
    return { key: key, label: label, signal: signal || null, num: true, sortVal: get, cell: function (r) { return S.fmtPct(get(r), 1); } };
  }
  function numCol(key, label, get, fmt, signal) {
    return { key: key, label: label, signal: signal || null, num: true, sortVal: get, cell: function (r) { const v = get(r); return v == null ? '—' : (fmt ? fmt(v) : v); } };
  }

  function battingColumns(youth) {
    const b = function (f) { return function (r) { return r.bat ? r.bat[f] : null; }; };
    const high = [
      numCol('pa', 'PA', b('pa')),
      rateCol('obp', 'OBP', b('obp'), 'high'),
      pctCol('bbPct', 'BB%', b('bbPct'), 'high'),
      pctCol('kPct', 'K%', b('kPct'), 'high'),
      pctCol('qabPct', 'QAB%', b('qabPct'), 'high'),
      pctCol('sbPct', 'SB%', b('sbPct')),
      rateCol('ops', 'OPS', b('ops')),
      rateCol('slg', 'SLG', b('slg'))
    ];
    const deemph = [
      rateCol('avg', 'AVG', b('avg'), 'low'),
      numCol('rbi', 'RBI', b('rbi'), null, 'low')
    ];
    // Youth: lead with process rates, AVG/RBI trail and are de-emphasized.
    // Non-youth: AVG first, then the rest.
    if (youth) return [nameCol()].concat(high, deemph);
    return [nameCol(), rateCol('avg', 'AVG', b('avg')), numCol('pa', 'PA', b('pa')),
      rateCol('obp', 'OBP', b('obp'), 'high'), rateCol('slg', 'SLG', b('slg')), rateCol('ops', 'OPS', b('ops')),
      pctCol('bbPct', 'BB%', b('bbPct'), 'high'), pctCol('kPct', 'K%', b('kPct'), 'high'),
      pctCol('qabPct', 'QAB%', b('qabPct'), 'high'), pctCol('sbPct', 'SB%', b('sbPct')),
      numCol('rbi', 'RBI', b('rbi'))];
  }

  function pitchingColumns() {
    const p = function (f) { return function (r) { return r.pit ? r.pit[f] : null; }; };
    return [
      nameCol(),
      { key: 'ip', label: 'IP', signal: null, num: true, sortVal: function (r) { return r.pit ? r.pit.outs : null; }, cell: function (r) { return r.pit ? r.pit.ipDisplay : '—'; } },
      numCol('era', 'ERA', p('era'), S.fmt2),
      numCol('whip', 'WHIP', p('whip'), S.fmt2),
      pctCol('strikePct', 'Strike%', p('strikePct'), 'high'),
      pctCol('fpsPct', 'FPS%', p('fpsPct'), 'high'),
      numCol('k9', 'K/9', p('k9'), S.fmt1),
      numCol('bb9', 'BB/9', p('bb9'), S.fmt1),
      numCol('so', 'SO', p('so')),
      numCol('bb', 'BB', p('bb'))
    ];
  }

  function fieldingColumns() {
    const f = function (k) { return function (r) { return r.fld ? r.fld[k] : null; }; };
    return [
      nameCol(),
      rateCol('fieldingPct', 'Field%', f('fieldingPct'), 'high'),
      numCol('chances', 'TC', f('chances')),
      numCol('po', 'PO', f('po')),
      numCol('a', 'A', f('a')),
      numCol('e', 'E', f('e'))
    ];
  }

  // ----- qualifier filtering -----
  function applyQualifier(rows, valueOf, minVal) {
    const qualified = [], below = [];
    rows.forEach(function (r) {
      if (valueOf(r) >= minVal) qualified.push(r);
      else { r._below = true; below.push(r); }
    });
    return { qualified: qualified, below: below };
  }

  // ----- build + render -----
  function build(root) {
    // In-view rebuilds (sort/scope/qualifier changes) replace the DOM without a
    // route() — destroy the previous chart first or instances pile up in the
    // live registry with ResizeObservers on detached canvases.
    try { CT.charts.destroyAll(); } catch (e) {}
    const players = store.getPlayers();
    ensureDefaults(players);
    const youth = isYouth(players);
    const games = scopeGames();
    const gameIds = {};
    games.forEach(function (g) { gameIds[g.id] = true; });
    const rows = buildRows(players, gameIds);

    let html = '<div class="season-view">';
    if (!state.embedded) {
      html += ui.pageHead('Team & Season Stats',
        (state.scope === 'career' ? 'Career totals' : 'Season') + ' · all rates recomputed from raw game counters');
    }

    // ---- scope + season controls ----
    const seasons = seasonsSorted();
    html += '<div class="filters">';
    html += '<div class="seg" role="tablist">' +
      '<button data-scope="season" class="' + (state.scope === 'season' ? 'active' : '') + '"' + (seasons.length ? '' : ' disabled') + '>Season</button>' +
      '<button data-scope="career" class="' + (state.scope === 'career' ? 'active' : '') + '">Career</button>' +
      '</div>';
    if (state.scope === 'season' && seasons.length) {
      html += '<div class="field" style="margin:0;">' +
        '<label for="season-select">Season</label>' +
        '<select class="select" id="season-select">' +
        seasons.map(function (s) {
          return '<option value="' + esc(s.id) + '"' + (s.id === state.seasonId ? ' selected' : '') + '>' + esc(s.name || s.year || s.id) + '</option>';
        }).join('') + '</select></div>';
    }
    html += ui.formField({ type: 'number', name: 'minPA', label: 'Min PA', value: state.minPA, min: 0, step: 1 });
    html += ui.formField({ type: 'number', name: 'minIP', label: 'Min IP', value: state.minIP, min: 0, step: 0.1 });
    html += ui.formField({ type: 'checkbox', name: 'showBelow', label: 'Show below qualifier', value: state.showBelow });
    html += '</div>';

    if (!games.length) {
      html += ui.emptyState('bar-chart-3', 'No games in scope',
        state.scope === 'season' ? 'No games logged for this season yet. Try Career, or log games in the Games view.' : 'No games logged yet. Add games to see team and season stats.');
      html += '</div>';
      root.innerHTML = html;
      wire(root);
      return;
    }

    // ---- team record + process rates ----
    const rec = teamRecord(games);
    const diff = rec.rf - rec.ra;
    // Signed run differential with a real minus sign (U+2212), per design system.
    const diffLabel = (diff > 0 ? '+' : (diff < 0 ? '−' : '')) + Math.abs(diff);
    const recLabel = rec.w + '-' + rec.l + (rec.t ? '-' + rec.t : '');
    const allBat = [];
    const allPit = [];
    players.forEach(function (p) {
      store.byPlayer('battingStatLines', p.id).forEach(function (l) { if (gameIds[l.gameId]) allBat.push(l); });
      store.byPlayer('pitchingAppearances', p.id).forEach(function (a) { if (gameIds[a.gameId]) allPit.push(a); });
    });
    const teamBat = S.battingFromLines(allBat);
    const teamPit = allPit.length ? S.derivePitching(S.sumPitching(allPit), 6) : null; // ipg irrelevant for Strike%/FPS%

    html += '<div class="stats">' +
      ui.statTile(recLabel, 'Record (' + games.length + ' G)') +
      ui.statTile(diffLabel, 'Run differential') +
      ui.statTile(rec.rf + '/' + rec.ra, 'Runs for / against') +
      ui.statTile(S.fmtRate(teamBat.obp), 'Team OBP') +
      ui.statTile(S.fmtPct(teamBat.bbPct, 0), 'Team BB%') +
      ui.statTile(S.fmtPct(teamBat.kPct, 0), 'Team K%') +
      ui.statTile(S.fmtPct(teamBat.qabPct, 0), 'Team QAB%') +
      ui.statTile(teamPit ? S.fmtPct(teamPit.strikePct, 0) : '—', 'Team Strike%') +
      ui.statTile(teamPit ? S.fmtPct(teamPit.fpsPct, 0) : '—', 'Team FPS%') +
      '</div>';

    if (youth) {
      html += ui.card({ className: 'season-note', body:
        '<p class="note" style="margin:0;"><strong style="color:var(--accent-700);">Youth development view.</strong> ' +
        'On-base, walk, strikeout, quality-at-bat and strike rates (highlighted) are the high-signal process numbers — read them as trends, not pass/fail. ' +
        'AVG and RBI are noisy at this level and de-emphasized. These tables are private coaching tools, not public rankings.</p>' });
    }

    // ---- batting leaderboard ----
    const batRows = rows.filter(function (r) { return r.hasBat && r.bat.pa > 0; });
    const batQ = applyQualifier(batRows, function (r) { return r.bat.pa; }, Number(state.minPA) || 0);
    const batShown = state.showBelow ? batRows : batQ.qualified;
    html += ui.card({
      title: 'Batting', rawSubtitle: true,
      subtitle: batQ.qualified.length + ' qualified (≥ ' + (Number(state.minPA) || 0) + ' PA)' + (batQ.below.length ? ' · ' + batQ.below.length + ' below' : ''),
      body: batShown.length
        ? renderTable('bat', battingColumns(youth), batShown, state.sorts.bat) +
          '<p class="qnote">Tap a column header to sort.' + (youth ? ' Highlighted = high-signal process rates; AVG/RBI de-emphasized.' : '') + '</p>'
        : '<p class="muted">No batters meet the qualifier. Lower Min PA or enable “Show below qualifier”.</p>'
    });

    // ---- pitching leaderboard ----
    const pitRows = rows.filter(function (r) { return r.pit && r.pit.outs > 0; });
    const minOuts = (Number(state.minIP) || 0) * 3;
    const pitQ = applyQualifier(pitRows, function (r) { return r.pit.outs; }, minOuts);
    const pitShown = state.showBelow ? pitRows : pitQ.qualified;
    if (pitRows.length) {
      html += ui.card({
        title: 'Pitching', rawSubtitle: true,
        subtitle: pitQ.qualified.length + ' qualified (≥ ' + (Number(state.minIP) || 0) + ' IP)' + (pitQ.below.length ? ' · ' + pitQ.below.length + ' below' : '') + ' · ERA scaled to level innings/game',
        body: pitShown.length
          ? renderTable('pit', pitchingColumns(), pitShown, state.sorts.pit) +
            '<p class="qnote">Strike% and FPS% (highlighted) are the controllable youth pitching signals. Pair with Pitch Smart workload limits in Arm Safety.</p>'
          : '<p class="muted">No pitchers meet the qualifier. Lower Min IP or enable “Show below qualifier”.</p>'
      });
    }

    // ---- fielding ----
    const fldRows = rows.filter(function (r) { return r.fld && r.fld.chances > 0; });
    if (fldRows.length) {
      html += ui.card({
        title: 'Fielding',
        subtitle: 'Field% is a reliability measure, not a ranking',
        body: renderTable('fld', fieldingColumns(), fldRows, state.sorts.fld)
      });
    }

    // ---- team on-base profile chart (process snapshot, roster order) ----
    if (batRows.length) {
      html += ui.card({
        title: 'On-base profile', rawSubtitle: true,
        subtitle: 'OBP by player — process snapshot, roster order (not a ranking)',
        body: '<div class="chart-wrap"><canvas id="season-obp-chart"></canvas></div>'
      });
    }

    html += '</div>'; // .season-view
    root.innerHTML = html;
    wire(root);

    // draw chart after DOM is in place (degrades gracefully if Chart.js offline)
    if (batRows.length) {
      const canvas = root.querySelector('#season-obp-chart');
      if (canvas && CT.charts) {
        try {
          CT.charts.bar(canvas, {
            label: 'OBP',
            labels: batRows.map(function (r) { return CT.initials(r.player.name); }),
            data: batRows.map(function (r) { return r.bat.obp == null ? 0 : Number(r.bat.obp.toFixed(3)); })
          });
        } catch (e) { /* offline-safe */ }
      }
    }
  }

  function wire(root) {
    root.querySelectorAll('[data-scope]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        state.scope = btn.getAttribute('data-scope');
        build(mountRoot);
      });
    });
    const sel = root.querySelector('#season-select');
    if (sel) sel.addEventListener('change', function () { state.seasonId = sel.value; build(mountRoot); });

    const minPA = root.querySelector('[name="minPA"]');
    if (minPA) minPA.addEventListener('change', function () { state.minPA = minPA.value === '' ? 0 : Number(minPA.value); build(mountRoot); });
    const minIP = root.querySelector('[name="minIP"]');
    if (minIP) minIP.addEventListener('change', function () { state.minIP = minIP.value === '' ? 0 : Number(minIP.value); build(mountRoot); });
    const showBelow = root.querySelector('[name="showBelow"]');
    if (showBelow) showBelow.addEventListener('change', function () { state.showBelow = showBelow.checked; build(mountRoot); });

    root.querySelectorAll('th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        const tbl = th.getAttribute('data-tbl'), key = th.getAttribute('data-key');
        const cur = state.sorts[tbl];
        if (cur.key === key) cur.dir = cur.dir === 'asc' ? 'desc' : 'asc';
        else { cur.key = key; cur.dir = key === 'name' ? 'asc' : 'desc'; }
        build(mountRoot);
      });
    });
  }

  function render(root, ctx) {
    mountRoot = root;
    state.embedded = !!(ctx && ctx.embedded);
    const players = store.getPlayers();
    if (!players.length) {
      root.innerHTML = (state.embedded ? '' : ui.pageHead('Team & Season Stats', 'Derived team & season rate stats')) +
        ui.emptyState('bar-chart-3', 'No players yet', 'Add players and log games to see team and season stats.');
      return;
    }
    build(root);
  }

  // Hosted inside the Games wrapper (not a standalone nav destination).
  window.CT.views = window.CT.views || {};
  window.CT.views.season = { label: 'Season Stats', render: render };
})();

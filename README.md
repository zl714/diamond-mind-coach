# Coach Tracker

A baseball coaching client & progress tracker — log sessions and visualize each player's improvement over time, right from your phone at the field.

## The honest story

I run a private baseball-coaching business with real clients, and I built Coach Tracker to manage them. It's the tool I actually wanted: add each player, log every session (focus area, drills, notes, and a few numbers like a skill rating or exit velocity), and watch a progress chart fill in over the weeks.

It's also a portfolio piece, so it ships with **3 clearly-labeled sample players** ("Sample Player — Jordan R.", etc.) and a **Demo data** badge, so anyone opening the live link sees a populated, working app instantly. The sample data is honest placeholder data — not real client results. Hit **Reset demo data** any time to restore it, or **Export** your own data first.

## Features

- **Clients** — add / edit / delete players (name, age or level, primary position, notes).
- **Sessions** — log a session per player: date, focus area (Hitting / Pitching / Fielding / Baserunning), drills, notes, and optional numeric metrics (skill rating 1–10, exit velocity, pitch velocity, 60-yard dash).
- **Player detail** — full session-history timeline plus a **progress chart** (Chart.js) for any metric you've recorded, with a metric switcher.
- **Dashboard** — total clients, total sessions, last-activity, and a tappable list of players sorted by most recent activity.
- **Your data, portable** — everything persists in `localStorage`; **Export JSON** and **Import JSON** so it's never trapped in one browser or device.
- **Mobile-first** — large tap targets, bottom-sheet modals, one-handed usable at the field.

## Tech stack

- Vanilla **HTML + CSS + JavaScript** — no framework, no build step, no npm.
- **Chart.js 4** via CDN (`cdn.jsdelivr.net`).
- **localStorage** for persistence (repository pattern in `js/storage.js`).
- Code split into small, focused files under `js/` (constants, storage, io, ui, players, sessions, charts, dashboard, detail, app).

## Run locally

It's fully static — just open it:

```bash
open index.html
```

Or serve it (recommended, so the hash router and modules behave like production):

```bash
# Python 3
python3 -m http.server 8000
# then visit http://localhost:8000
```

No dependencies to install. No API keys required.

## Deploy to Vercel

This deploys with **zero config** because it's a static site.

1. Push this folder to a GitHub repo.
2. In Vercel: **New Project → Import** the repo.
3. Framework preset: **Other** (no build command, output is the repo root).
4. Click **Deploy**. Done.

### Environment variables

The current app needs **none** — there are no secrets and no API keys. A `.env.example`
is included only as a documented placeholder in case you later add an optional cloud-sync
integration. If you do:

1. `cp .env.example .env` and fill in real values locally (`.env` is git-ignored).
2. In Vercel → **Project Settings → Environment Variables**, add the same keys.
3. Never commit `.env`.

## Project structure

```
coach-tracker/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── constants.js      # shared constants + helpers
│   ├── sample-data.js    # clearly-labeled demo seed data
│   ├── storage.js        # localStorage data layer (CRUD, immutable)
│   ├── io.js             # JSON export / import
│   ├── ui.js             # modal / toast / confirm helpers
│   ├── players.js        # player add/edit/delete forms
│   ├── sessions.js       # session log/edit/delete form
│   ├── charts.js         # Chart.js progress chart
│   ├── dashboard.js      # home view
│   ├── detail.js         # player detail view
│   └── app.js            # bootstrap + hash router
├── .env.example
├── .gitignore
└── vercel.json
```

## Privacy

All data stays in your browser's `localStorage`. Nothing is uploaded anywhere. Use **Export JSON** to back up or move your data between devices.

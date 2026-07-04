# LeCroy Design System

Shared design system for MarketLens (blue accent) and Diamond Mind (cyan accent). Navy near-black, Geist, slate grays, tabular numbers. Clean professional dashboards — NOT green, NOT vibe-coded.

## Design Tokens (:root)
```css
/* ============================================================
   LECROY DESIGN SYSTEM — shared :root core for BOTH apps
   Navy near-black, Geist, slate-tinted grays, tabular nums.
   Paste this whole block, then override --accent per app.
   ============================================================ */
:root {
  /* ---- SURFACE RAMP (navy near-black; one stop lighter = one elevation up) ---- */
  --bg-base:       #030712; /* page bg (gray-950, his real token) */
  --bg-sunken:     #020617; /* wells, inputs, chart troughs (slate-950) */
  --surface-1:     #0B1120; /* nav rail / secondary panels */
  --surface-2:     #0F172A; /* CARDS / primary panels (slate-900) */
  --surface-3:     #1E293B; /* raised: hover, popover, dropdown (slate-800) */
  --surface-4:     #334155; /* active / pressed / track fills (slate-700) */

  /* ---- TEXT RAMP (cool slate; never pure white) ---- */
  --text-hi:        #F3F4F6; /* headings / hero values (his real token) */
  --text-strong:    #E2E8F0; /* primary body */
  --text-body:      #CBD5E1; /* default body */
  --text-secondary: #94A3B8; /* labels / secondary (slate-400) */
  --text-muted:     #64748B; /* captions / meta / disabled (slate-500) */

  /* ---- BORDERS / DIVIDERS (alpha so they sit on any surface) ---- */
  --border-strong: #334155;
  --border:        rgba(255,255,255,0.08);
  --border-subtle: rgba(255,255,255,0.06);
  --divider:       rgba(255,255,255,0.05);
  --rim-light:     rgba(255,255,255,0.04); /* 1px top inset = premium tell */

  /* ---- ACCENT (interactive: links / primary btn / focus / active).
          DEFAULT below = MarketLens electric blue. DM overrides it. ---- */
  --accent-300: #93C5FD;
  --accent-400: #60A5FA;  /* hover (lightened for dark) */
  --accent-500: #3B82F6;  /* PRIMARY (his real token) */
  --accent-600: #2563EB;  /* pressed */
  --accent-soft: rgba(59,130,246,0.12); /* tinted chip bg */
  --focus-ring: 0 0 0 3px rgba(59,130,246,0.35);

  /* ---- SEMANTIC DATA AXIS (separate from accent; green=up red=down) ---- */
  --up:        #16C784;   /* gain / positive (calm institutional green) */
  --up-soft:   rgba(22,199,132,0.12);
  --down:      #F23645;   /* loss / negative (TradingView bear red) */
  --down-soft: rgba(242,54,69,0.12);
  --warn:      #FBBF24;   /* amber-400 */
  --flat:      #94A3B8;   /* unchanged */

  /* Baseball-Savant diverging percentile scale (elite red <-> gray <-> cold blue) */
  --pct-hot:  #D22D49;
  --pct-mid:  #C9CDD4;
  --pct-cold: #5181B8;

  /* ---- TYPE SCALE (px) ---- */
  --fs-eyebrow: 11px; --fs-label: 12px; --fs-data: 13px; --fs-sm: 14px;
  --fs-body: 15px;    --fs-h4: 16px;    --fs-h3: 20px;   --fs-h2: 24px;
  --fs-h1: 32px;      --fs-display: 44px; --fs-stat: 40px; /* hero metric */
  --lh-tight: 1.1; --lh-heading: 1.25; --lh-body: 1.5;
  --ls-display: -0.025em; --ls-heading: -0.015em; --ls-eyebrow: 0.07em;
  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700;

  /* ---- SPACING (4px grid; NEVER off-scale) ---- */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px;
  --sp-12: 48px; --sp-16: 64px;

  /* ---- RADII (one language; data UI reads credible at 6-12px) ---- */
  --r-chip: 4px; --r-control: 6px; --r-card: 8px; --r-panel: 12px;
  --r-modal: 16px; --r-pill: 9999px;

  /* ---- ELEVATION (borders + surface do the lifting; shadow is subtle) ---- */
  --shadow-card:  0 1px 2px rgba(0,0,0,0.30);
  --shadow-pop:   0 8px 24px rgba(0,0,0,0.45);
  --shadow-modal: 0 16px 48px rgba(0,0,0,0.60);
  --scrim:        rgba(2,6,23,0.70);

  /* ---- MOTION (crisp; one system) ---- */
  --ease: cubic-bezier(.4,0,.2,1);
  --dur-fast: 120ms; --dur: 150ms; --dur-slow: 200ms;

  /* ---- FONT STACKS ---- */
  --font-ui: "Geist", "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
}

/* === Diamond Mind brand override: swap accent to its electric cyan, add
   silver + red-seam baseball flavor. Apply on <html data-app="diamond-mind"> === */
[data-app="diamond-mind"] {
  --accent-300: #5FD0F7;
  --accent-400: #2BC0F0;  /* hover */
  --accent-500: #00AEEF;  /* DM brand cyan (logo + existing app) */
  --accent-600: #0088CC;  /* pressed */
  --accent-soft: rgba(0,174,239,0.12);
  --focus-ring: 0 0 0 3px rgba(0,174,239,0.35);
  --silver:  #D4DCE6;     /* chrome headings / logo-adjacent text */
  --seam:    #EF4444;     /* baseball red seam accent (logo) */
  --seam-2:  #FB7185;     /* coral data accent (PitcherList card) */
  --seam-soft: rgba(239,68,68,0.12);
}

/* Global numeric treatment — REQUIRED on every stat/price/table cell */
.num, .stat, td.num, .price, .pct {
  font-variant-numeric: tabular-nums slashed-zero;
  font-feature-settings: "tnum" 1, "zero" 1;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

## Fonts & Icons
FONT: Geist (his stated brand font) as the UI family + Geist Mono for IDs/tickers/code, with Inter as the system fallback (both ship tabular figures + slashed zero). No-build CDN load in <head>: <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">. (Geist is on Google Fonts; if you prefer self-host, grab the woff2 from vercel.com/font and @font-face it — same family name.) Then font-family: var(--font-ui). Weights: 400 body / 500 UI labels / 600 headings & emphasis / 700 reserved for hero stats only — never 300 on dark. Enable numerics globally on data cells: font-variant-numeric: tabular-nums slashed-zero.

ICONS: Lucide (lucide.dev) — clean, consistent, free, one stroke family that matches the Geist/Linear aesthetic. No-build via CDN: <script src="https://unpkg.com/lucide@latest"></script> then call lucide.createIcons(); use <i data-lucide="trending-up"></i>. Render at a fixed set 16 / 20 / 24px, stroke-width 1.75. (Phosphor is an equally good alternative at the same stroke weight.) NEVER use emoji as functional icons in either app. Baseball-specific glyphs Lucide lacks (baseball, bat) — use a single inline-SVG set drawn at the same 1.75px stroke so they sit in the same family.

## Layout System
DECISION: Left sidebar nav (240px fixed) on desktop for BOTH apps — they are data/app tools, not marketing sites, and a rail keeps the primary destinations always visible while the wide content area holds tables and charts. Sidebar bg --surface-1 with a 1px right border; content area bg --bg-base. On tablet/mobile (<768px) the rail collapses to a 56px bottom tab bar (+ safe-area inset) with 3-5 icon+label destinations and the primary action ('Log session' for Diamond Mind, 'Add to watchlist' for MarketLens) emphasized in the center slot. GRID: 12-column, 24px gutters inside the content area; content max-width 1280px centered with generous side padding (--sp-8 desktop, --sp-4 mobile gutters). Everything snaps to the 4px spacing grid and an 8px vertical rhythm. SPACING RHYTHM: card padding 20px; gap between KPI tiles 24px; section gaps 32-48px; label-to-value 4-8px (tighter than pair-to-pair gaps so proximity does the grouping). RESPONSIVE BREAKPOINTS: 1280 (content cap), 1024 (sidebar may narrow to icon-only 64px), 768 (switch to bottom tab bar + single-column stacking), 480 (mobile gutters, KPI tiles go 1-up). Page anatomy top-to-bottom: (1) one hero number / status that answers 'is everything OK?', (2) a row of 3-4 KPI tiles, (3) the main chart or board, (4) denser tables/feeds below — airy at the top, denser toward the bottom, applied identically across both apps.

## Component Specs
- APP SHELL / NAV — Left sidebar rail 240px (desktop app-tools posture), bg var(--surface-1), 1px right border var(--border). Logo/wordmark top in --sp-6 padding. Nav items: 40px tall, 8px radius, icon (20px Lucide, 1.75px stroke) + 14px/500 label, --sp-3 gap. Inactive: text-secondary, transparent bg. Hover: bg rgba(255,255,255,0.05), text-strong. Active: bg --accent-soft, text --accent-400, 2px left inset bar in --accent-500, filled icon. Section group labels: 11px uppercase --text-muted +0.07em, --sp-2 above. MOBILE: collapse to bottom tab bar 56px + safe-area, 3-5 icon+label items, center slot is the Log/primary '+' as a 48px elevated --accent-500 circle. Active tab = filled icon + accent + label; inactive = outline + --text-muted. Never a hamburger for primary nav.
- CARD / PANEL — bg var(--surface-2), border 1px var(--border-subtle), radius var(--r-panel) 12px, padding var(--sp-5) 20px, box-shadow var(--shadow-card) PLUS inset 0 1px 0 var(--rim-light) for the rim-light. Header row: 16px/600 --text-hi title left, optional action/menu right (ghost button). In-card rules use 1px var(--divider), never a heavy border. Hover (if interactive): border-color --border, translateY(-2px), --dur ease. Do NOT nest cards-in-cards — separate sub-regions with --sp-4 spacing + a single divider.
- STAT / KPI TILE (PitcherList-style) — Container = card spec above. Fixed vertical order: (1) Eyebrow label 11px uppercase --text-muted +0.07em letter-spacing, with small mono ID/logo on the right; (2) Hero value 40px/700 tabular-nums --text-hi, line-height 1.0, unit/suffix one step down (24px) in --text-secondary; (3) Delta chip: 12px/500 on a --up-soft / --down-soft pill, radius --r-chip, text --up or --down, prefixed with a glyph (triangle) AND signed number so it survives grayscale; (4) supporting viz — sparkline (64x24) or percentile bar; (5) Footer meta 12px --text-muted. Tiles sit in a grid, gap --sp-5 24px. Lead the screen with ONE hero tile/number that answers 'is everything OK?' before the grid of equals.
- DATA TABLE — Header row: 12px/600 uppercase --text-secondary, sticky, bg --surface-2, 1px bottom border --border. Body rows 44px (regular) / 40px (condensed toggle, persisted), 1px bottom divider var(--divider), hover bg rgba(255,255,255,0.03). Cell padding 12px vertical / 16px horizontal (~32px between columns). LEFT-align text/labels/symbols; RIGHT-align ALL numbers with .num (tabular-nums) so decimals stack. Headers align to their column's content. Numeric deltas: signed + colored (--up/--down) + arrow glyph. No zebra striping (hairline + spacing only). Selection toolbar as a sticky footer. Use real minus sign U+2212 and trailing zeros ($54.00).
- BUTTONS — Height 36-40px, radius var(--r-control) 6px, 14px/600, padding 8px 16px, transition --dur ease. PRIMARY: bg --accent-500, text #F8FAFC; hover --accent-400; active --accent-600; focus add box-shadow var(--focus-ring) + 2px offset; disabled opacity .5, no transform. SECONDARY: bg --surface-3, 1px border --border, text --text-strong; hover border --border-strong. GHOST: transparent, text --text-secondary; hover bg rgba(255,255,255,0.05), text --text-strong. DESTRUCTIVE: bg --down, text #fff. All six states (default/hover/focus/active/disabled/loading) explicitly styled; loading = inline 14px spinner + dimmed label, keep width fixed. NEVER use --up green as a generic primary in MarketLens (collides with gain semantic).
- INPUTS / SELECTS — Height 40px, bg --bg-sunken, 1px border --border, radius --r-control 6px, padding 0 12px, text 15px --text-strong, placeholder --text-muted. Focus: border-color --accent-500, box-shadow var(--focus-ring), no default outline. Label above: 12px/500 --text-secondary, --sp-2 gap. Error: border --down + 12px helper text in --down. Select chevron = 16px Lucide, --text-muted. Search field: leading 16px search icon, --sp-2 inset. Segmented control (timeframe/density): row of chips, 13px, padding 8px/12px, inactive --text-muted transparent, active = bg --accent-soft + text --accent-400 OR 2px underline in active direction color.
- TABS — Underline style (not boxed pills). Row of items 14px/500 --text-secondary, padding 0 0 --sp-3, --sp-6 gap, 1px bottom border --border on the container. Active: text --text-hi + 2px bottom border --accent-500 (or DM cyan). Hover inactive: text --text-strong. Animate the underline position with transform --dur ease. Keep to 3-6 tabs; overflow scrolls horizontally on mobile.
- CHART STYLING — Sparse, no chart-junk. Price/trend line: 2px stroke colored DYNAMICALLY by the period's net direction (--up when up, --down when down over selected timeframe — the Robinhood signature). Area fill: same hue vertical gradient 14% -> 0% opacity. Previous-close baseline: 1px dashed --text-muted (4-4 dash). Grid: none or 1-2 ultra-faint horizontal lines at --divider. Hover: thin vertical crosshair + dot on line + floating price/time tag (bg --surface-3, 1px --border, 12px tabular). Axis labels 12px --text-muted. No legend box, no 3D, no shadow on plot. Diamond Mind percentile/rating bars use the Savant diverging scale (--pct-hot -> --pct-mid -> --pct-cold), 8px track height, value label in tabular-nums.
- BADGES / PILLS — Radius --r-pill, padding 2px 8px, 12px/500. Delta/status pills pair COLOR + GLYPH + TEXT always (never color alone): up = --up on --up-soft with up-triangle; down = --down on --down-soft with down-triangle; warn = --warn on amber-soft; neutral = --text-secondary on rgba(255,255,255,0.06). Category tag (use sparingly, max 1 per row): --surface-3 bg, 1px --border, --text-secondary. Diamond Mind rating badge (e.g. player grade): coral --seam-2 fill for 'plus' tools, neutral for average — paired with the numeric grade.
- MODAL / BOTTOM SHEET — Desktop modal: centered, bg --surface-3, 1px border --border, radius --r-modal 16px, shadow var(--shadow-modal), max-width 480-560px, padding --sp-6, over a --scrim backdrop. Header 20px/600 --text-hi + ghost close (X, 20px). Footer: right-aligned secondary + primary buttons, --sp-3 gap. MOBILE / quick-log = BOTTOM SHEET not modal: rounded top 16-24px, 32x4px drag handle centered, content padded --sp-5, full-width primary CTA 48-52px pinned to bottom (thumb zone). Open/close: translateY + fade, --dur-slow ease. Focus trap + Esc to close + return focus to trigger.

## MarketLens Application
- BRAND CHROME: keep the shared --accent-500 #3B82F6 electric blue as the ONLY interactive accent (active nav, links, primary buttons, focus ring, segmented-control active). Reserve green/red strictly for the up/down financial axis — never make a button green.
- QUOTE HEADER anatomy: Row 1 = SYMBOL 24px/700 --text-hi + company name 14px --text-secondary + exchange chip (11px uppercase, --surface-3 bg). Row 2 = hero price 40-56px/700 tabular-nums, render the $ and cents 2px smaller/lighter than the dollar integer, always show trailing zeros. Row 3 = change cluster in ONE direction color: triangle + signed $ change + (signed %), e.g. up-triangle +2.34 (+1.82%). Optional Row 4 = 'After hours $X.XX' 12px --text-muted.
- TIMEFRAME selector: segmented chips [1D 1W 1M 3M 6M 1Y 5Y MAX] flush ABOVE the chart, 13px, active = --accent-soft fill + --accent-400 text (or a 2px underline in the chart's current direction color). One line, scannable.
- PRICE CHART = the dynamic-color Robinhood pattern: 2px line recolors --up/--down by the selected period's net move, matching gradient area fill 14%->0%, dashed previous-close baseline, hover crosshair + floating tabular tag. No gridlines/legend/3D.
- WATCHLIST table: SYMBOL (14px/600) over company (12px --text-muted) | 64x24 sparkline (stroke colored by net direction, dot on last value) | last price (14px tabular, right-aligned) | change% as a colored pill (right-aligned). Rows 48px, 1px --divider, hover bg rgba(255,255,255,0.03).
- STAT GRID (Mkt cap, P/E, Vol, 52-wk range, Div yield): 2-4 columns of label(12px uppercase --text-muted)/value(15px tabular --text-strong) pairs, grouped by whitespace + hairlines, NOT boxes. 52-wk range as a thin track with a current-position marker.
- NEWS list: 'Reuters · 2h' (12px --text-muted) above headline (15px --text-strong, 2-line clamp), optional 64px square thumbnail (6px radius) right-aligned, 1px --divider between items, no per-item card border.
- STATES: skeleton rows (matching final layout) for table/chart load; designed empty watchlist ('Add your first symbol' + primary CTA + a couple suggested tickers); error row with retry. Never a lone spinner or bare 'No data'.

## Diamond Mind Application
- BRAND: switch <html data-app="diamond-mind"> so the accent becomes the logo's electric CYAN #00AEEF (matches the existing React app + logo circuitry). Headings/wordmark use --silver #D4DCE6 chrome treatment. The baseball-red SEAM #EF4444 / coral #FB7185 is the SECONDARY data accent (it mirrors the logo seams and the PitcherList card he saved) — used for 'plus' tool grades, negative deltas, and key highlights, never as general chrome. Keep the existing logo PNG in the sidebar header on --surface-1 (drop the old text-gradient + glow on body headings — too much for a dashboard; reserve the glow for the logo itself).
- DRILL LIBRARY + DRAG-DROP assignment: build with SortableJS via CDN (no native HTML5 DnD — it does nothing on touch). Library list is group:{name:'board',pull:'clone',put:false} so dragging a drill ASSIGNS A COPY into a session column while keeping the library intact; session columns share group:'board', animation:150, handle:'.drag-handle', delay:120 + delayOnTouchOnly:true so swipes still scroll. Style hooks: .sortable-ghost{opacity:.4;background:var(--accent-soft)} .sortable-chosen{box-shadow:0 0 0 2px var(--accent-500)}. WCAG 2.5.7: every drill row ALSO has 'Move up/down' + an 'Assign to session…' menu, and an aria-live='polite' .sr-only region announces 'Picked up X / Moved to position 2 of 5 / Dropped into Tuesday Session'. Persist on onEnd via col.toArray() of data-id.
- PER-SESSION NOTES carried across sessions: key notes on a STABLE drill/player id (not board position) in a localStorage map { itemId: { body, updatedAt, entries:[{id,body,ts}] } }, try/catch on load. Inline low-chrome editor: click-to-edit auto-growing textarea (no border until focus), debounced autosave ~500ms + on blur with a quiet 'Saved' affordance, Cmd/Ctrl+Enter to commit a discrete note. Because notes bind to the id, they follow the drill/player wherever it's dragged.
- PLAYER PROFILE = entity-detail screen: header with player avatar + name + position + a single hero RATING number (40px tabular) and an overall grade badge (coral --seam-2 for plus, neutral for average). Below: percentile/tool bars using the Baseball-Savant diverging scale (--pct-hot elite red -> --pct-mid gray -> --pct-cold) so it reads as real analytics, each bar labeled with a tabular-nums value. Then a stat table (tabular-nums, right-aligned, signed/colored deltas vs last eval).
- SESSION HISTORY + LIVE STATS FEED: reverse-chronological timeline grouped under sticky day headers ('Today', 'Yesterday', 'Mar 18'), each item = colored dot marker (by event type) + bold actor/action line + muted outcome + right-aligned relative time ('2h', '3d'). Stat updates in the feed get the signed +/- color (--up/--down or --seam) AND a directional glyph + tabular-nums. Design empty ('Log your first session' + CTA), skeleton-loading, and error states from day one.
- QUICK-LOG: persistent thumb-reachable '+' (center bottom-tab on mobile / primary button in header on desktop) opens a BOTTOM SHEET (not a full page) pre-filled with last values and recent drills pinned to top, full-width cyan CTA pinned at the bottom. Target under 3 taps / 5 seconds.
- STREAKS / consistency: a current-streak counter (small badge + bold tabular count) and a GitHub-style consistency heatmap of logged sessions using a 5-level ramp from --surface-3 up to --accent-500 (cyan), ~11px cells — ties the coaching cadence to the same progress-viz language MarketLens uses for trends.

## Anti-Pattern Checklist (AVOID)
- Stock shadcn/v0 look: untouched zinc grays + default Tailwind blue-600 on every button + uniform 8px radius. We tint grays toward navy/slate, recolor the accent, and use the full 6/8/12/16 radius scale intentionally.
- Purple/indigo->cyan or indigo->pink gradients, and gradient-filled text on headings or metrics — the #1 'AI slop' tell. Metrics and headings are SOLID color; gradients only on the logo and faint chart fills.
- Pure #000 background or pure #FFF text — harsh, halation, reads cheap. We use navy #030712 base and off-white #F3F4F6 text.
- Pure-neutral gray (#737373) on a navy app so colors look unrelated. All grays are slate/cool-tinted to match the surface.
- Proportional (non-tabular) numbers so price/stat columns jitter on update and decimals don't align — fatal for a finance/sports app. tabular-nums is mandatory on every numeric cell.
- Off-scale spacing (13px, 17px, 23px) and mixed radii (4px next to 24px) — the strongest 'vibe-coded' signal. Everything snaps to the 4px grid and one radius language.
- Heavy uniform drop shadows / glassmorphism on every card (and they barely render on near-black anyway). Elevation comes from lighter surfaces + 1px alpha borders + a rim-light, not big blurry shadows.
- Rainbow palette / 4+ competing accents and multi-hue category chips. Exactly ONE interactive accent per app + a separate semantic up/down axis.
- Flooding whole rows/cards with saturated green/red backgrounds, or status by color ALONE. Color only the change value, and always pair with a +/- sign and a directional glyph (colorblind-safe).
- Over-rounded 'pill everything' corners and emoji used as functional icons. One Lucide/Phosphor stroke set at 16/20/24px; pills reserved for tags/avatars/toggles.
- Default-tracking big headings (40px Geist at letter-spacing 0 looks loose/templatey). Tighten display/heading text to -0.015 to -0.025em; tiny all-caps labels get +0.07em.
- Native HTML5 drag-and-drop for the drill board (silently dead on touch, no keyboard path). Use SortableJS + a keyboard/menu alternative + aria-live announcements.
- Notes stored against board position instead of item id, so a note detaches when a drill is dragged to another session — a correctness bug that screams unfinished.
- Lorem ipsum / 'Item 1/2/3' / demo '$4.99' data and only the happy path. Ship realistic data ('2.81 ERA', real prices, real player names) and designed empty + skeleton-loading + error states.
- Centered numeric columns or left-aligned prices; verbose absolute timestamps ('2026-06-29 14:32:07') given equal weight to content. Right-align numbers, use muted relative time ('3h') with absolute on hover.
- Generic centered hero + identical 3-column 'icon-in-rounded-square + title + two gray lines' feature grid. Lead with one real hero number and a hierarchy of unequal tiles instead.
- Bounce/elastic easing and spinner-only loading. Crisp 120-150ms ease-out micro-interactions + skeletons that match the final layout, with a prefers-reduced-motion guard.


---

# Diamond Mind v3 — LIGHT "Clinic" theme (2026-07)

Diamond Mind moved to a light theme; the dark spec above remains the MarketLens reference. Key rules of the light system (source of truth: `css/styles.css` `:root` + `[data-app="diamond-mind"]`):

## Surfaces — elevation is SHADOW, never lightness; wells go DARKER
```css
--bg-base: #F8F9FB;      /* canvas */
--bg-sunken: #F1F3F7;    /* input / chart wells */
--surface-1: #FFFFFF;    /* sidebar rail (+1px border-right) */
--surface-2: #FFFFFF;    /* cards */
--surface-3: #F4F6F9;    /* hover fills, chips */
--surface-4: #EDF0F5;    /* pressed / tracks */
--surface-raised: #FFFFFF; /* modals/popovers/dropdowns — pair with --shadow-pop/--shadow-modal */
--track: #E9EDF2;        /* all meter / pct-bar tracks */
```

## Ink
`--text-hi #0F172A` headings/hero numbers · `--text-strong #1E293B` · `--text-body #334155` · `--text-secondary #64748B` (labels, 4.76:1 floor) · `--text-muted #94A3B8` (captions/placeholders/disabled ONLY — never data or body copy).

## Borders (ink-alpha)
`--border-strong #CBD5E1` (inputs) · `--border rgba(15,23,42,0.10)` · `--border-subtle .06` · `--divider .05` · `--rim-light` is now a BOTTOM rim: `inset 0 -1px 0 rgba(15,23,42,0.04)`.

## Accent — cyan kept, roles split (#00AEEF fails 4.5:1 on white)
- `--accent-500 #00AEEF` = BRAND only (logo tile, chart primary series, selected-tab underline, active-nav border) — non-text.
- `--accent-700 #0072A8` = TEXT (links, active nav label, `.btn-primary` fill with #FFF at 5.3:1); `--accent-800 #005E8C` pressed.
- `--accent-400 #22B8F0` hover borders/icons (3:1 non-text); `--accent-soft #E6F7FE` selected/chips; `--accent-wash rgba(0,174,239,0.08)`.

## Semantic quads (text / fill / soft / border) — red means DANGER ONLY
- OK: `#15803D / #16A34A / #ECFDF3 / #ABEFC6`
- WARN: `#B45309 / #F59E0B / #FFFAEB / #FEDF89` (never #FBBF24 as text on white)
- DANGER: `#DC2626 / #EF4444 / #FEF3F2 / #FECDCA`
- `[data-app="diamond-mind"]` keeps redefining `--seam #DC2626 / --seam-2 #EF4444 / --seam-soft #FEF3F2` (the `var(--seam,…)` fallbacks depend on it). Chart median overlays are dashed `#94A3B8`, not red.

## Savant ramp
`--pct-cold #3D6FB4 · --pct-mid #98A2AE · --pct-hot #D22D49`; bars/meters always sit on `--track`.

## Shadows / radii / motion
Slate-keyed shadows (`--shadow-xs/card/pop/modal`, scrim `rgba(15,23,42,0.40)`). Radii bumped: chip 6 / control 8 / card 12 / panel 14 / modal 16. Card padding 24; whitespace IS the aesthetic. Motion stays 120–200ms `--ease` only; no count-ups or sweeps.

## Chart.js
`js/charts.js` THEME is a static mirror of these tokens (Chart.js can't read CSS vars): ink text/ticks, `rgba(15,23,42,0.06)` grid, and a deliberately DARK tooltip (`#0F172A` bg, `#F8FAFC` text) — the one dark survivor.

## Signature component
`ui.diamondMeter(pct)` — the Diamond Capsule: `--track` capsule, Savant-gradient fill sized to the full track, 45°-rotated square thumb ("baseball diamond") in the percentile's Savant color with a 2px white ring. 10px default, 6px compact. Replaces `.pct-bar` everywhere.

# Design System — School Management SaaS

The staff console is a tool people sit in for a full working day: an accountant
reconciling fees, a clerk marking a roster, an exam controller checking marks
before publishing. It is closer to accounting software than to a marketing site.
Everything below follows from that.

## Principles

1. **Calm over striking.** The interface should recede so the data reads. One
   restrained accent, generous whitespace, no decorative gradients or motion.
   "Premium" here means *finished*: consistent depth, precise type, and motion
   that answers every action quickly — never ornament.
   A screen that is pleasant for six hours beats one that impresses for six
   seconds.
2. **Trustworthy by legibility.** This app handles money, attendance and marks —
   records that get printed, audited and disputed. Numbers align, statuses use
   the same colour everywhere, destructive actions are always confirmed, and
   nothing important is conveyed by colour alone.
3. **Fast by predictability.** The same action lives in the same place on every
   screen, tables keep their shape while loading, and state lives in the URL so
   a view can be sent to a colleague.

## Colour

Light is the default for the staff console — long sessions under office
lighting, and reports that get printed. Dark is available from the user menu.
Tokens are OKLCH so lightness steps stay perceptually even.

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--background` | App canvas | `oklch(0.982 0.004 255)` | `oklch(0.17 0.012 255)` |
| `--card` | Surface (cards, tables, sheets) | `oklch(1 0 0)` | `oklch(0.215 0.014 255)` |
| `--foreground` | Primary text | `oklch(0.24 0.02 258)` | `oklch(0.97 0.004 250)` |
| `--muted-foreground` | Secondary text, labels | `oklch(0.53 0.02 258)` | `oklch(0.72 0.016 252)` |
| `--primary` | Primary action, active nav | `oklch(0.52 0.15 256)` | `oklch(0.68 0.14 256)` |
| `--destructive` | Delete, overdue, absent | `oklch(0.55 0.20 25)` | `oklch(0.70 0.18 25)` |
| `--success` | Paid, present, approved | `oklch(0.55 0.13 155)` | `oklch(0.72 0.14 157)` |
| `--warning` | Due soon, pending, late | `oklch(0.70 0.14 75)` | `oklch(0.80 0.14 80)` |
| `--info` | Informational, draft | `oklch(0.58 0.11 235)` | `oklch(0.74 0.11 235)` |

The accent is a muted blue rather than a saturated one: it has to sit next to
red/amber/green status badges all day without competing with them. Status
colours are deliberately *not* the accent, so "primary action" and "this row is
fine" never look alike.

Each status colour ships with a `-foreground` (text on the solid colour) and a
`-soft` (tinted background for badges) so a badge never relies on opacity
juggling to stay readable in both themes.

**School palettes (changed 2026-09-30, owner's decision).** A school admin can
pick the accent from a fixed set of presets in School settings (`School.theme`,
`shared/src/theme.ts`; tokens in `globals.css` under `[data-palette]`). Only the
accent family moves — `--primary`, `--accent`, `--ring`, `--chart-1` and their
sidebar twins; neutrals and status colours never do. Every preset keeps the
default's lightness steps (button text and accent links ≥ 5.4:1 in both
themes) and sits at least as far from the status hues as the default blue, so
a school's colour still can't read as "overdue" or "paid". There is no free
colour picker for that reason. `School.primaryColor` (avatar badge, print
headers) follows the chosen preset's swatch. Public pages and the platform
console always use the default blue.

## Typography

**Inter** for everything in the UI, with its tailed `l` (`cv05`) and serifed
`I` (`cv08`) switched on. Headings tighten slightly as they grow (-0.011em,
page titles -0.021em) and balance their line breaks. It was drawn for screen UI at small sizes,
disambiguates `1/l/I` and `0/O`, and — the reason it wins here — has real
tabular figures, which every money column, mark and roster count depends on.

**Noto Sans Arabic** sits in the same stack for Arabic/Urdu locales, so an RTL
school gets a matched face instead of a browser fallback. **JetBrains Mono** is
for identifiers that get read aloud or compared character by character:
admission numbers, receipt numbers, audit payloads.

Figures are proportional in prose and **tabular in every table, total, and
input** (`tabular-nums`). Digits must line up in a column of fees.

| Step | Size / line-height | Weight | Use |
| --- | --- | --- | --- |
| `page-title` | 1.5rem / 2rem | 600 | One per page, in `PageHeader` |
| `section-title` | 1.125rem / 1.75rem | 600 | Card and form-section headings |
| `body` | 0.875rem / 1.25rem | 400 | Default UI text |
| `table` | 0.875rem / 1.25rem | 400 | Table cells; numerals tabular |
| `label` | 0.8125rem / 1.25rem | 500 | Field labels, column headers |
| `caption` | 0.75rem / 1rem | 400 | Helper text, timestamps, meta |

## Layout

- **Spacing scale**: 4px base — 1/2/3/4/6/8/12/16 (Tailwind default). Card
  padding 24px; form field gap 16px; section gap 32px.
- **Content max width**: 1440px for tables and dashboards; **640px for forms**
  — a form field wider than that is harder to scan, not easier.
- **Table density**: 40px rows default, 32px compact — the toolbar toggle
  persists in the browser (`useTableDensity`). Wide tables show edge shadows
  where more columns scroll (`scroll-shadow-x`); sortable headers carry
  `aria-sort`.
- **Sidebar**: 256px expanded, 64px collapsed, drawer below 1024px. It stays
  in view (sticky, full height) however long the page. The head carries the
  school's mark and name over the console name; the foot carries the signed-in
  person (name, role) and the account menu. The collapse toggle lives in the
  top bar.
- **Top bar**: names where you are — `Fees / Invoices`, from the nav — so a
  top-level page doesn't also need a `Dashboard › Invoices` breadcrumb.
  `PageHeader` drops a trail that only leads back to `/app` or `/admin`;
  deeper trails (`Students › Noah Garcia`) stay.
- **Decorative tints**: headline tiles (`KpiTile` `hue`) and people's initials
  avatars (`avatarTint(id)`, stable per person) take a soft tint from the chart
  ramp — never the status colours, so decoration never reads as a state.
  `StatCard`'s icon chip is the exception: it carries the card's `tone`, since
  that card *is* reporting a state.
- **Identifiers** in tables (`font-mono`) never wrap; a narrow table scrolls
  sideways instead.
- **Radius**: `--radius: 0.625rem` (was 0.5rem). Still tighter than the
  shadcn default — dense data screens read better with modest rounding — but
  enough softness that surfaces feel finished rather than boxy.
- **Elevation**: borders first. One shadow scale, tinted with the ink colour
  (never black) and layered as a tight contact shadow plus a soft ambient one:

  | Token | Use |
  | --- | --- |
  | `shadow-xs` | Resting surfaces: cards, tables, inputs, outline buttons. A 1px contact shadow at 5% — depth you feel rather than see. Applied automatically to `bg-card border` surfaces. |
  | `shadow-sm` / `shadow-md` | Raised on interaction (active tab, hovered card). |
  | `shadow-lg` | Menus, selects, popovers. |
  | `shadow-overlay` | Dialogs and sheets, with a hairline edge so they read against a dark page. |

  No other shadow values. Dark theme swaps in deeper tints; the scale is the same.

## Motion

Motion explains a change; it never decorates. Everything animates transform
and opacity only, and `prefers-reduced-motion` gets the final state at once.

- **Default transition**: every `transition-*` utility runs 160ms on
  `--ease-emphasized` (decelerating — it settles rather than stops). Hovers,
  focus rings and colour changes all share it.
- **Enter vs exit**: arriving layers decelerate (`ease-emphasized`); leaving
  layers accelerate away (`ease-exit`) and run ~65% as long — dialogs 200ms
  in / 150ms out, menus 150ms / 100ms. A closing layer should never hold up
  the next action.
- **Press**: buttons scale to 0.98 while pressed — acknowledgement, not bounce.
- **Navigation**: a section settles in (`animate-page-in`: 260ms, 6px rise)
  via the `app/app/template.tsx` template. Filters, tabs and pagination change
  search params and do not replay it.
- **Loading**: skeletons sweep (`animate-shimmer`) instead of pulsing — a slow
  sweep reads as "working"; a blink reads as "broken".
- **Tables**: rows settle in as they're inserted (`rows-stagger` on a `<tbody>`
  or list: 240ms, 4px rise, 30ms apart, capped at the tenth row), so a new
  page, sort or filter is acknowledged while selecting or typing into a row
  never replays it. The sort arrow turns over rather than swapping icons; the
  bulk-selection bar slides in; the "1–20 of 312" count fades on change.
  Clickable rows show a chevron on hover/focus and open with Enter.
- **Overlays**: dialogs and sheets dim the page with an ink-tinted scrim and a
  light blur, so the layer above is unambiguous without blacking out the data.

## Accessibility floor

Body text meets WCAG AA (4.5:1) in both themes; `--muted-foreground` is tuned
to clear it rather than sitting at the usual too-light grey. Every status badge
pairs colour with a text label. Focus rings are visible and never removed —
`--ring` at 2px offset. All motion respects `prefers-reduced-motion`.

## Public pages (landing, registration, sign-in panel)

Everything above describes the staff console. The public pages have a
different job — earning a school's attention for a minute — so they get a
small, separate vocabulary. None of it is used inside the console.

- **Display accent**: **Newsreader italic** (`font-display`), for one or two
  words inside an Inter headline — `<HeadlineAccent>` in the hero (with a
  hand-drawn underline that draws itself once), `<DisplayItalic>` in section
  headings and the auth panel. Never a whole heading, never body text.
- **Highlight**: `--highlight`, a warm orange, as the counterpoint to the blue.
  Decoration only — the headline underline, the eyebrow rule, glows. Never text
  and never a status, since amber already means "due soon" in the product.
- **Aurora**: `bg-aurora` — soft radial light in the accent, highlight and
  teal, on an oversized layer drifting slowly (`animate-drift`, 18s). Used
  behind the hero, the auth panel and the closing CTA; nowhere else.
- **Glow**: `shadow-glow` on the page's primary call to action only (hero
  button, the trial plan). It is the one shadow outside the elevation scale.
- **Ambient motion**: floating notification cards in the hero preview
  (`animate-float`), the module strip (`animate-marquee`, with a real pause
  button for WCAG 2.2.2 and pause on hover), and feature illustrations whose
  bars fill as their card is revealed. Reduced motion stops all of it; the
  strip becomes a static wrapped list.
- **Copy stays true.** The landing page only names modules that ship —
  check `backend/src/modules` before adding a feature card.

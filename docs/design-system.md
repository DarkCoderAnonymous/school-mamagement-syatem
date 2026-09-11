# Design System — School Management SaaS

The staff console is a tool people sit in for a full working day: an accountant
reconciling fees, a clerk marking a roster, an exam controller checking marks
before publishing. It is closer to accounting software than to a marketing site.
Everything below follows from that.

## Principles

1. **Calm over striking.** The interface should recede so the data reads. One
   restrained accent, generous whitespace, no decorative gradients or motion.
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
| `--background` | App canvas | `oklch(0.985 0.003 250)` | `oklch(0.17 0.012 255)` |
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

School branding (`School.primaryColor`) is applied to the school's own avatar
and print headers only — never to the accent — so one school's brand colour
can't collide with the status palette.

## Typography

**Inter** for everything in the UI. It was drawn for screen UI at small sizes,
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
- **Table density**: 40px rows default, 32px compact (toggle persists per user).
  Sticky header, sticky first column on wide tables.
- **Sidebar**: 256px expanded, 64px collapsed, drawer below 1024px.
- **Radius**: `--radius: 0.5rem`. Slightly tighter than the shadcn default;
  dense data screens read better with less rounding.
- **Elevation**: borders first, shadow only for genuinely floating layers
  (dropdown, dialog, popover). Flat cards on a tinted canvas.

## Accessibility floor

Body text meets WCAG AA (4.5:1) in both themes; `--muted-foreground` is tuned
to clear it rather than sitting at the usual too-light grey. Every status badge
pairs colour with a text label. Focus rings are visible and never removed —
`--ring` at 2px offset. All motion respects `prefers-reduced-motion`.

# UI/UX Build Prompt — School Management SaaS (Web + Mobile)

> Use this together with `school-saas-build-prompt.md`. That file defines the backend phases and rules; this file defines how every feature must look and behave on the web console (Next.js) and the mobile app (Expo). Work one phase at a time and stop for review after each.

---

## Context

A school admin can log in, but the dashboard at `/app` only shows the school name and an empty card saying "Set up your academic session to get started." There is no navigation, no action button, and the text renders in a default serif font, which means the global styles or font setup are not being applied correctly.

Your job is to turn this into a complete, professional product: a real app shell, a design system, a guided setup flow, and full screens for every module on both web and mobile.

## Stack

- Web: Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, TanStack Query, TanStack Table, react-hook-form + Zod (schemas from `@sms/shared`).
- Mobile: Expo, Expo Router, NativeWind, TanStack Query, react-hook-form + Zod, expo-notifications, expo-secure-store, expo-sqlite (offline queue).
- Backend: Express + Mongoose REST API (see master prompt).

## Hard rules

1. **No fake data in the UI.** Every screen calls a real endpoint. If the endpoint does not exist, build it first following the master prompt's rules (tenant isolation, permissions, Zod validation, pagination, tests), then build the screen.
2. **Permission-aware UI.** Navigation items, buttons, and pages are shown based on the user's permission strings, never role names. Hide what the user can never do; disable with a tooltip what they can't do *yet* (e.g. "Publish" before marks are verified). The backend still enforces every check.
3. **Every screen has four states:** loading (skeletons shaped like the content), empty (explains what goes here and offers the action to create it), error (says what failed and how to retry), and populated.
4. **No dead buttons, no "coming soon" pages.** If a feature isn't built, it doesn't appear in navigation.
5. **URL holds state** on web: filters, search, sort, pagination, and active tabs live in query params so views can be bookmarked and shared.
6. **Money and dates**: format with the school's currency, locale, and timezone settings. Use tabular numerals in tables and totals.
7. **Accessibility floor**: keyboard navigation, visible focus rings, labelled inputs, sufficient contrast, screen-reader labels on mobile, respects reduced motion.
8. **Responsive**: web console works down to tablet width; sidebar collapses to a drawer on small screens.

---

## Phase UI-0 — Fix the foundation

- Find why the serif font is showing (missing `globals.css` import in the root layout, Tailwind content paths, or `next/font` not applied) and fix it.
- Confirm shadcn/ui is initialised with CSS variables and that the theme applies on every route, including auth pages.
- Set up TanStack Query provider, an API client that attaches the access token, refreshes on 401 using the existing rotation flow, and unwraps the standard response envelope into typed data or typed errors.
- Add a global error boundary, a 404 page, and a toast system.

## Phase UI-1 — Design system

Before writing components, write `docs/design-system.md` with a short design plan and stop for my approval:

- **Colour**: 5–6 named tokens (background, surface, text, muted text, primary, danger) plus success/warning for statuses like paid/overdue and present/absent. Provide light mode as the default for the staff console (long working sessions, printed reports) and dark mode as an option. Avoid generic defaults such as near-black with a single neon accent.
- **Typography**: one deliberately chosen, highly legible sans family with tabular numerals, plus a fallback that supports RTL scripts if the school locale needs it. Define a type scale for page titles, section titles, body, table text, and captions.
- **Layout**: spacing scale, content max widths, form widths, table density.
- **Principles**: two or three sentences on what should make this product feel calm, trustworthy, and fast for office staff.

After approval, build shared components in `frontend/components/` and matching ones in `mobile/components/`, using the same token names:

- `PageHeader` (title, description, primary action, breadcrumbs)
- `DataTable` (server-side pagination, sorting, column visibility, row selection, bulk actions, CSV/Excel export, sticky header)
- `FilterBar` (search, select filters, date range, class/section pickers, synced to URL)
- `EmptyState` (icon, one-line explanation, primary action button)
- `FormLayout`, `FormSection`, and field components: text, number, **money input** (stores minor units), date and time pickers (school timezone), select, multi-select, async searchable select (students, staff), phone, file/image upload with preview
- `ConfirmDialog` for destructive actions, typed confirmation for irreversible ones
- `StatusBadge` with a fixed mapping for every status enum in `shared/`
- `StatCard`, `ChartCard` (Recharts), `Timeline`, `Stepper`, `Tabs`
- `PermissionGate` component and `usePermission` hook
- `PrintLayout` for receipts, report cards, and lists

## Phase UI-2 — App shell and navigation

**Web console layout**

- Left sidebar with the school logo, grouped navigation, and collapse toggle.
- Top bar with: global search / command palette (Ctrl/Cmd+K) to jump to any student, staff member, or page; academic session switcher; school switcher (for users with multiple memberships); notifications bell with unread count; user menu (profile, change password, theme, sign out).
- Breadcrumbs on every inner page.

**Navigation groups** (each item shown only if the user has at least one matching permission):

- Overview: Dashboard
- Academics: Sessions, Classes & sections, Subjects, Timetable, Academic calendar
- People: Students, Admissions, Guardians, Teachers, Staff
- Daily work: Attendance, Leave requests, Homework, Notices
- Exams: Exam schedule, Marks entry, Results, Report cards
- Finance: Fee structures, Invoices, Collect payment, Defaulters, Expenses
- HR: Staff attendance, Leave, Payroll, Payslips
- Communication: Messages, Parent-teacher meetings, SMS log
- Reports
- Settings: School profile, Roles & permissions, Users, Grading scales, Fee settings, Notification templates, Billing & plan, Audit log

**Super Admin console** has its own sidebar: Platform dashboard, School applications, Schools, Plans, Subscriptions & billing, Usage, Jobs, Audit log, Impersonation log.

## Phase UI-3 — Setup wizard (fixes the empty dashboard)

When a school has incomplete setup, the dashboard shows a setup checklist instead of the current empty card. Each step links to a guided page, shows done/pending, and the checklist disappears when all required steps are complete:

1. School profile and branding (logo, address, timezone, currency, locale)
2. Create academic session and terms
3. Add classes and sections
4. Add subjects and map them to classes
5. Add teachers (manual or import) and assign class teachers
6. Import students and guardians (CSV/Excel with preview and row-level errors)
7. Set up fee structure (optional, can skip)
8. Invite parents to the mobile app (optional, can skip)

Also add a "Load sample data" button for demo schools only, which calls the seed endpoint for that tenant.

## Phase UI-4 — Dashboards per role

- **School Admin**: students enrolled, today's attendance %, fee collected this month vs due, pending admissions, pending leave requests, upcoming exams and events, recent notices, quick actions (add student, collect fee, post notice).
- **Accountant**: today's collection, month collection vs target, overdue invoices, defaulters list preview, recent payments, quick "Collect payment".
- **Exam Controller**: upcoming exams, marks entry progress per section, pending verification, results ready to publish.
- **Teacher**: today's timetable, attendance to mark, homework due, marks pending entry, upcoming PTMs.
- **Super Admin**: active schools, pending applications, trials expiring in 7 days, MRR, schools over plan limits, failed jobs.

## Phase UI-5 — Module screens (web)

For every module, build the standard set: list page (DataTable + FilterBar + bulk actions + export), create/edit form, detail page with tabs, and delete/archive with confirmation. Module-specific requirements:

- **Students**: profile with tabs (Overview, Guardians, Attendance, Exams, Fees, Documents, History); photo; admission number; promote/transfer/withdraw actions; print ID card and certificates.
- **Admissions**: kanban board by stage (inquiry, applied, test/interview, admitted, enrolled) plus list view; convert to student in one action.
- **Teachers & staff**: profile with tabs (Overview, Subjects & classes, Timetable, Attendance, Leave, Payroll, Documents).
- **Classes & sections**: section page shows students, class teacher, subjects with teachers, timetable, attendance summary.
- **Timetable**: weekly grid per section with drag-and-drop, clash warnings inline, teacher view and room view, print.
- **Attendance**: pick class/section/date, whole roster on one screen with "mark all present" then exceptions, keyboard shortcuts (P/A/L), save with summary; monthly register view; staff attendance screen.
- **Leave**: request list with approve/reject, balance display, calendar view.
- **Homework**: post per section/subject with attachments and due date; submissions view.
- **Notices**: compose with audience targeting (school, class, section, role, individuals), schedule, attachments, read-receipt stats.
- **Exams**: schedule builder (date sheet), marks entry grid per section/subject with autosave and validation against max marks, verification queue, publish with confirmation, results analysis charts, bulk report card PDF generation with progress.
- **Fees**: fee structure builder; invoice generation wizard with preview; **collect payment** screen (search student, see all dues, apply discount, partial payment, print receipt immediately); refunds; defaulters with bulk SMS reminder; daily collection report.
- **Payroll**: salary structure per employee, monthly run wizard (review computed lines, adjust, lock, publish), payslip PDFs, bank export.
- **Parent-teacher meetings**: slot creation calendar, bookings list, meeting notes.
- **Reports**: filterable reports for attendance, fees, exams, staff with export to CSV/Excel/PDF.
- **Settings**: roles & permissions editor (permissions grouped by module with plain-language labels), users and invitations, grading scales, receipt/invoice prefixes, notification templates, billing & plan usage bars with upgrade button.

## Phase UI-6 — Mobile app

Use role-based tab layouts in Expo Router. After login, if the user has multiple memberships, show a school picker; parents with multiple children get a child switcher at the top of every screen.

**Parent tabs**: Home, Attendance, Homework, Results, Fees, More
- Home: child card, today's attendance, homework due, fee status, latest notices
- Attendance: monthly calendar with colour-coded days, submit leave request
- Homework: list by date with attachments
- Results: exam list, subject marks, report card PDF download
- Fees: invoices, paid/due, receipts, pay online (when gateway is enabled)
- More: notices, PTM booking, messages, timetable, school calendar, profile, notification settings

**Student tabs**: Home, Timetable, Homework, Results, More

**Teacher tabs**: Today, Attendance, Marks, Homework, More
- Today: timetable for the day with "Take attendance" on each period
- Attendance: fast roster marking that works **offline**, queued with client-generated IDs and synced automatically, with a visible sync status
- Marks: enter marks per exam/section/subject with validation
- Homework: post with camera/photo attachments
- More: notices, leave requests from parents, PTM slots, own leave and payslips

**Mobile requirements**: push notifications (attendance alerts, notices, fee reminders, results published) with deep links to the right screen; pull-to-refresh; skeleton loading; tokens in secure storage; biometric unlock option; works on small phones; RTL layout support.

## Phase UI-7 — Polish and review

- Run through every role with seed data and fix anything that looks broken, empty, or inconsistent.
- Check consistent wording: the same action uses the same verb everywhere ("Collect payment" button → "Payment collected" toast).
- Take screenshots of each main screen on web (desktop and tablet) and mobile, and list any issues found and fixed.

---

## Order of work

Do UI-0 → UI-1 (stop for design approval) → UI-2 → UI-3. Then build UI-4, UI-5, and UI-6 **module by module, in the same order as the backend phases** in the master prompt, so each module ships backend, web, and mobile together. Finish with UI-7.

## Phase report (after every phase)

1. Screens and components built
2. Endpoints added or changed
3. Screenshots or a description of each new screen
4. Tests run and results
5. Known gaps
6. Suggested commit message

Then wait for my approval before continuing.

## Start now

Begin with **UI-0**. First, explain exactly why the dashboard is rendering in a serif font with no navigation, fix it, and report.

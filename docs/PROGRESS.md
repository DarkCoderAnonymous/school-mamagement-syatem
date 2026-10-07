# Build Progress

Update this file at the end of every module, before asking for approval to
continue. It is the first thing any new session reads.

## How to work

One module at a time, in the phase order set by
`school-saas-build-prompt.md`. For each module:
backend (schema → service → routes → permissions → tests) → web screens →
mobile screens → seed data → cross-tenant tests → update this file → stop.

## Reference docs

- `docs/school-saas-build-prompt.md` — backend phases, rules, definition of done
- `docs/school-saas-ui-prompt.md` — UI phases, screen specs, design rules
- `docs/design-system.md` — tokens, typography, layout, accessibility floor
- `docs/adr/` — architecture decisions
- `CLAUDE.md` — project conventions

---

## Done

### Platform (pre-existing)
- [x] Public school registration → Super Admin review → atomic approval and provisioning
- [x] JWT auth with refresh rotation, reuse detection, forced password change
- [x] Plan catalogue, suspend/reactivate, audit logging
- [x] RBAC engine (dotted permissions), tenant-scoping Mongoose plugin
- [x] Super Admin web console for the above

### Phase 0 — Housekeeping
- [x] `.gitignore` covers node_modules, `.env*`, build output, uploads, Expo artifacts
- [x] `.env.example` for backend, frontend, mobile
- [x] `docker-compose.yml` runs MongoDB as a single-node replica set + Redis
- [x] CI workflow (`.github/workflows/ci.yml`)
- [x] CLAUDE.md aggregation-scoping wording matches the plugin

### Phase 1 — ADRs
- [x] ADR-001 Multi-school identity (User + SchoolMembership) — **ACCEPTED and IMPLEMENTED**
- [x] ADR-002 Campus scoping (explicit in services, not in the plugin) — accepted, not implemented
- [x] ADR-003 Job queue (BullMQ; tenant context into workers) — accepted, not implemented
- [x] ADR-004 Provider interfaces (SMS/email/push/storage/payment) — accepted, not implemented
- [x] ADR-005 Permission freshness (epoch + hard revocation) — **ACCEPTED and IMPLEMENTED**

### Phase 3 (partial) — identity and permission freshness
- [x] `User` is global (platform collection); `SchoolMembership` carries tenancy
- [x] Login resolves a person: one membership → tokens, several → `select-school`
- [x] `POST /auth/select-school` and `POST /auth/switch-school`
- [x] JWT carries `membershipId` + `permissionsEpoch`; tenant context carries `membershipId`
- [x] `permissionsEpoch` per membership → `TOKEN_STALE` (silent refresh)
- [x] `sessionsValidFrom` per user → `SESSION_REVOKED` (hard, refresh cannot revive)
- [x] `changePassword` now revokes other sessions (it previously did not)
- [x] Migration script with `--dry-run`, including duplicate-email merge
- [x] Web: school picker + sidebar school switcher
- [x] Mobile: school picker screen
- [ ] 2FA, email verification, account lockout (rest of Phase 3)

### Phase 2 — Tenant isolation hardening
- [x] Plugin extended to `distinct`, `replaceOne`, `findOneAndReplace`, `insertMany`, upserts
- [x] **Fails closed** — no tenant context throws; `TenantContext.runAsSystem()` is the explicit opt-out
- [x] `$lookup` into tenant collections scoped (pipeline form) or rejected (localField form)
- [x] `estimatedDocumentCount` and `bulkWrite` blocked on tenant collections
- [x] Raw driver access (`Model.collection`, `db.collection()`) blocked by ESLint rule
- [x] Per-school atomic sequence service (`services/sequence.service.ts` + `Counter` model)
- [x] **Cross-tenant harness** (`test/cross-tenant/`) — registry-driven, 220 tests
      total in the suite, its own named CI check plus a registry-coverage gate
- [x] Five isolation findings from its first run, all fixed — see
      `docs/security/tenant-isolation-findings.md`
- [ ] `StorageService` with `schools/{schoolId}/` prefixing, signed URLs, tenant check

### UI foundation
- [x] UI-0 — font fix (self-referential `--font-sans` broke to serif), query client, API client, error boundary, 404, toasts
- [x] UI-1 — design system (`docs/design-system.md`) + shared components
- [x] UI-2 — app shell, permission-filtered sidebar, command palette, top bar
- [~] UI-3 — setup checklist on the dashboard. Real, but has **one** step (academic
      session) because that is the only module built. Grows as modules land.

### Modules

| Module | Backend | Web | Mobile | Seed | Cross-tenant tests |
| --- | --- | --- | --- | --- | --- |
| Academic sessions | ✅ | ✅ | — | ✅ | ✅ |
| Identity & memberships | ✅ | ✅ | ✅ | ✅ | ✅ |
| Classes & sections | ✅ | ✅ | — | ✅ | ✅ |
| Subjects | ✅ | ✅ | — | ✅ | ✅ |
| Teachers (Employee + Teacher + sign-in) | ✅ | ✅ | — | ✅ | ✅ |
| Students & guardians | ✅ | ✅ | — | ✅ | ✅ |
| Staff & roles (incl. PRINCIPAL) | ✅ | ✅ | — | ✅ | ✅ |
| Inventory (items, categories, ledger) | ✅ | ✅ | — | ✅ | ✅ |
| Fees (heads, structures, concessions, invoices, payments, reports) | ✅ | ✅ | — | ✅ | ✅ |
| Payroll (components, salaries, advances, runs, payslips) | ✅ | ✅ | — | ✅ | ✅ |
| Finance ledger (expenses, other income, summary) | ✅ | ✅ | — | ✅ | ✅ |
| Exams, marks & results (date sheet, marks workflow, grading, report cards) | ✅ | ✅ | — | ✅ | ✅ |
| Dashboard summary | ✅ | ✅ | — | — | n/a (read-only, permission-gated per block) |

**2026-09-24 — exams, marks and results (Phase 9, web).**

- **Models:** `Exam`, `ExamPaper` (one class × subject: the date sheet, with max/pass marks and
  the workflow status), `Mark`, `ExamResult` (the snapshot written at publish). Grading scale and
  "show positions" live on `School.examSettings` (default A+ 90 … E 33, F 0).
- **Workflow:** OPEN (teachers enter marks) → SUBMITTED (complete, teacher done) → VERIFIED (exam
  office) → PUBLISHED. Publishing a class is ONE transaction: grades per subject and overall,
  totals, PASS/FAIL (every subject passed), class and section positions (ties share), papers
  locked; families emailed after commit. Return (SUBMITTED/VERIFIED → OPEN, with a note) and
  withdraw (PUBLISHED → VERIFIED, results soft-deleted, audited) cover corrections.
- **Rules:** teachers enter marks only for subjects on their teacher record; marks ≤ max, in halves;
  submit refused until every active student has a mark or is absent; a student with no mark at
  publish counts as absent; max marks can't drop below a mark already entered.
- **Web:** Exams (list, grading scale editor), exam detail (date sheet per class with progress,
  verify/return/publish/withdraw), Marks entry queue (my papers / all / awaiting verification),
  marks grid (autosave, Enter/↓ navigation, "a" for absent, live grade preview, validation),
  Results (ranked sheet with a column per subject, analysis: pass rate, subject averages, grade
  distribution, toppers, class comparison), report card, bulk report-card print per class/section,
  and a Results section on the student profile.
- **Harness:** 4 models + 3 endpoint entries; `test/exams-modules.test.ts` covers the workflow
  and the grading arithmetic.
- **Seed:** `scripts/seed-exam-data.ts`: last month's Mid-term published for every class (5
  subjects), this month's Unit test mid-workflow (some papers awaiting verification, some half
  entered, Maths for Grades 3–6 left for the teacher).

**2026-09-24 — fees, payroll and finance (Phases 10–11, web).**

- **Security fix first:** PARENT held `student.read` + `fee.invoice.read` and STUDENT held
  `student.read`, which since the students module landed let a parent list every student and
  guardian phone number in the school. Both templates are now `notice.read` only; the backfill
  applies `REVOKED_FROM_TEMPLATES` (and bumps epochs). Applied to the dev DB; regression test in
  `test/finance-modules.test.ts`.
- **Fees:** fee heads, one structure per class per session, per-student concessions
  (percent/fixed, per head or whole invoice), generation wizard with a preview that runs the
  same planner as the real run (one transaction, one invoice per student per period, enforced by
  a unique index), one-off invoices, discounts/fines, cancel (only if unpaid), rule-based late
  fines in the school's timezone (flat or per day, grace, cap; re-running never stacks),
  collect screen (partial payments, several invoices per receipt, idempotency key), refunds and
  reversals, defaulters with email reminders, collection report by method and day.
- **Payroll:** salary components (fixed / % of basic / % of gross for deductions), salary per
  employee with bank details, office staff added to payroll from memberships, advances with
  instalment recovery, monthly run DRAFT → LOCKED → PUBLISHED (lock books advance recoveries,
  publish posts the salary expense to the ledger and emails staff), bank transfer CSV,
  printable payslips, and "My payslips" for staff.
- **Finance ledger:** expense/income categories, entries (void, never edit), 6-month summary
  combining fee collections (from receipts, never copied) with ledger income and expenses.
- **Harness:** 12 models + 14 endpoint entries; 582 backend tests green.
- **Seed:** `scripts/seed-finance-data.ts` (called by `seed:dummy-school`): fee setup,
  last month's and this month's invoices with paid/part-paid/overdue mix, a published payroll
  for last month, a draft for this month, and four months of expenses and other income.

**2026-09-24 — school modules batch.** Built in one pass at the owner's request (not one
module at a time). What landed:

- **Backend modules:** `classes` (+ `/sections`), `subjects`, `teachers`, `students`
  (+ `/guardians`), `members` (+ `/roles`), `inventory` (`/inventory/{summary,categories,items,movements}`),
  `dashboard`. All validated, permission-guarded, audit-logged, soft-deleting, paginated.
- **PRINCIPAL** default role; SCHOOL_ADMIN gained `attendance.mark` + `exam.marks.enter`
  so it covers every staff role (needed by the escalation guard). `backfill:permissions`
  now also creates missing default roles per school.
- **Accounts:** `services/school-accounts.service.ts` creates or links a sign-in (ADR-001) for
  teachers, parents and invited staff; mail is sent only after commit.
- **Tenant plugin:** the cross-tenant FK check now reads inside the document's transaction
  (otherwise a Teacher referencing an Employee created in the same transaction was refused);
  inventory and counters collections added to `TENANT_COLLECTIONS` for `$lookup` scoping.
- **Harness:** 3 inventory models + 10 endpoint entries registered; new
  `test/school-modules.test.ts` for business rules. 295 tests green in the module + cross-tenant run.
- **Web:** Classes & sections, Subjects, Teachers (+ detail), Students (list, admit, detail, edit,
  sibling linking), Staff & roles, Inventory (items, item ledger, movements, categories), and a
  permission-aware dashboard with a 5-step setup checklist.
- **Seed:** `npm run seed:dummy-school` now fills the demo school (resumable stage by stage):
  6 classes / 12 sections, 8 subjects, 8 teachers, 36 students with families, principal,
  accountant, 14 stock items with movements. Prints demo logins for each role.

**2026-09-30 — staff profiles: classes, attendance and salary (web + mobile).** Opening a
teacher or staff member now shows their full record in tabs, each gated by the permission that
guards its endpoint:

- **Backend (read-only, 3 endpoints):** `GET /teaching-assignments/teachers/:id?academicSessionId=`
  (a teacher's sections × subjects in any session, with each section's active roll; `teacher.read`),
  `GET /staff-attendance/employees/:id?month=` (one employee's month day by day + month and
  year-to-date totals; `staff.attendance.read`), `GET /payroll/staff/:id?year=` (salary structure
  and a full month's figures, open advances, a year of payslips and its issued totals;
  `payroll.read`). `GET /members/:id` now includes the member's `employee` record. New index
  `Payslip { schoolId, deletedAt, employeeId, month }`. All three registered in the cross-tenant
  harness; behaviour tests in `attendance-modules` and `finance-modules`.
- **Web:** teacher page → Profile / Classes / Attendance / Salary tabs, filters in the URL
  (session, class, subject; month, mark; year, payslip status). New `/app/staff/[id]` page for any
  staff member (rows on Staff & roles now open it). Assigning/removing classes moved into the
  Classes tab (current session only). Shared pieces in `frontend/src/components/staff/`.
- **Mobile:** the staff screen has the same tabs (read-only), and the payslip screen opens any
  staff payslip for the payroll office with `staff=1`.

---

## In progress

_Module:_ Phase 3 — ADR-001 + ADR-005 landed. Remaining Phase 3 items untouched
(2FA, email verification, account lockout, job queue workers, notifications,
plan limits, school settings, custom roles UI).
_Where it stopped:_ 62 tests green. The migration has been dry-run against the
dev cluster but NOT applied.

---

## Not started

Follow the phase order in `school-saas-build-prompt.md`:

- Phase 3 — platform foundations (ADR-001 implementation, auth flows, security, job queue, notifications, plan limits, school settings, custom roles UI)
- Phase 4 — rest of academic structure (Campus, Class, Section, Subject, calendar, grading scales)
- Phase 5 — guardians, teachers, staff, admissions, bulk import/export
- Phase 6 — timetable
- Phase 7 — attendance and leave (incl. mobile offline)
- Phase 8 — notices, homework, parent-teacher meetings
- Phase 9 — exams, marks, report cards
- Phase 10/11 leftovers — `PaymentProvider` + webhooks (online payments), fee challan/receipt/payslip
  PDFs (browser print today), SMS/push reminders (email today), background-job invoice generation
  (synchronous in one transaction today), payroll pulling attendance/leave (entered by hand today),
  parent/staff mobile screens
- Phase 12 — promotion and year-end
- Phase 13 — dashboards and reports
- Phase 14 — SaaS billing, impersonation, offboarding
- Phase 15 — full seed script, accessibility, i18n

---

## Decisions made

| # | Decision | Where |
| --- | --- | --- |
| 1 | Identity splits into global `User` + tenant `SchoolMembership` | `docs/adr/ADR-001` |
| 2 | Campus is scoped explicitly in services, never in the tenant plugin | `docs/adr/ADR-002` |
| 3 | Tenant plugin fails closed; `runAsSystem()` is the only opt-out | `backend/src/tenant/` |
| 4 | Academic sessions got their own `session.*` permissions rather than reusing `class.*` | `shared/src/roles.ts` |
| 5 | Sorting/pagination are server-side only; the web `DataTable` renders, it never sorts | `frontend/src/components/data/data-table.tsx` |
| 6 | Web status colours are independent of the primary accent | `docs/design-system.md` |
| 7 | Identity global (`User`), tenancy per-membership (`SchoolMembership`) | `docs/adr/ADR-001` |
| 8 | Login never guesses a school; multi-membership returns a picker | `backend/src/modules/auth/` |
| 9 | Permission epoch (silent refresh) vs `sessionsValidFrom` (hard revoke) | `docs/adr/ADR-005` |
| 10 | Auth Zod schemas live in `@sms/shared`, re-exported by the backend module | `shared/src/auth.ts` |

| 11 | Inventory brought into scope; ledger is append-only (corrections are ADJUST movements) | `backend/src/modules/inventory` |
| 12 | PRINCIPAL is a default role template, not a SCHOOL_ADMIN alias | `backend/src/rbac/roleTemplates.ts` |
| 13 | Role assignment can only grant permissions the assigner holds; nobody edits their own roles | `backend/src/modules/members/members.service.ts` |
| 14 | Employee denormalises name/contact from User for school-scoped search; User stays the credential | `backend/src/models/Employee.ts` |
| 15 | Stock can't go negative: the quantity guard is in the `$inc` update's filter, in the same transaction as the ledger row | `inventory.service.ts applyMovement` |
| 16 | Family roles hold no school-wide reads; revocations go through `REVOKED_FROM_TEMPLATES` | `backend/src/rbac/roleTemplates.ts` |
| 17 | Invoice lines and payslips are snapshots; editing a structure only affects future bills/runs | `models/FeeInvoice.ts`, `models/Payslip.ts` |
| 18 | "Overdue" is derived at read time from due date + balance, never stored | `fees/invoices.service.ts withDerived` |
| 19 | Fee settings live on `School` (like currency/timezone), not a singleton tenant collection | `models/School.ts` |
| 20 | Fee collections stay in `FeePayment`; the ledger holds only expenses and non-fee income, so the summary never double-counts | `finance/finance.service.ts` |
| 21 | Exam results are snapshots incl. the grading scale used; corrections = withdraw + republish | `models/ExamResult.ts` |
| 22 | Grading scale lives on `School.examSettings` (one scale per school), like fee settings | `models/School.ts` |
| 23 | Paper workflow status is per class × subject; exam status is derived from its papers, never stored | `exams/exams.service.ts examStatus` |
---

## Known gaps and risks

- [ ] **Mobile has no screens for the new modules yet** (teacher attendance/marks, parent views).
      The parent sign-ins the student form creates are ready for them.
- [ ] **Custom roles have no editor.** The Roles tab is read-only; schools can assign the default
      roles (incl. PRINCIPAL) but can't author their own yet.
- [ ] **Attendance is still not built.** The CLAUDE.md seed requirement is now met (a published
      exam with marks and a fee cycle are seeded).
- [ ] **Exam leftovers (Phase 9):** report-card PDFs in a background job (browser print today),
      weightage across terms / cumulative results, mobile marks entry and parent result views
      (family roles still hold no school-wide reads), exam types as a configurable list.
- [ ] **Marks-entry scope is by subject, not by section.** A teacher with Maths on their profile
      can enter Maths for every class; per-section teaching assignments need the timetable (Phase 6).
- [ ] **Parents can't see their children's fees yet.** Family roles have no school-wide reads
      (see CLAUDE.md); a self-scoped `/me/children/...` fees endpoint is needed for mobile.
- [ ] **Unpaid leave in payroll is entered by hand** until staff attendance/leave exists.

- [ ] **The membership migration has not been applied to any live database.** It has
      been dry-run only. Run `npm run migrate:memberships -- --dry-run`, read the merge
      report, then run it for real. Duplicate emails are force-reset by design.
- [ ] **Redis is now on the auth path.** It degrades to a database read, so correctness
      holds, but a Redis outage means one indexed read per request per 5s cache window.
- [ ] **`StorageService` not built.** No file upload path exists yet, so no documents,
      photos, or report-card PDFs.
- [ ] **Seed script is behind CLAUDE.md.** It creates a super admin, plans and two
      registrations — not the classes/students/exam/fee cycle the spec requires. The
      demo school comes from `npm run seed:dummy-school` instead.
- [ ] **New permissions still don't reach existing schools automatically.** School roles
      are provisioned at approval with `$setOnInsert`, so adding a permission to
      `ROLE_TEMPLATES` reaches new schools only. Run `npm run backfill:permissions` —
      it now bumps membership epochs too, so affected sessions pick the change up on
      their next request rather than needing a sign-out.
- [ ] **Mobile has login + school picker only.** No school switcher inside the app yet
      (the web sidebar has one); a parent must sign out to change school.
- [ ] **`GET /auth/me` shape changed** (`membershipId`, `memberships[]`). Any client not
      in this repo would need updating.

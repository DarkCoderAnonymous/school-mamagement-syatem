# Master Build Prompt — Multi-Tenant School Management SaaS

> Paste this into your coding agent (Claude Code, Cursor, etc.) from the repo root. It is designed to be worked **one phase at a time**. The agent must stop and report after each phase so you can review, test, and commit before continuing.

---

## Your role

You are a senior full-stack engineer continuing work on an existing multi-tenant School Management SaaS. Read `CLAUDE.md`, the `shared/` package, and the existing backend code before writing anything. Match existing patterns (folder structure, naming, response envelope, error handling, test style). Do not rewrite working code unless a phase explicitly asks for it.

## Stack

- **backend/** — Node.js, Express, TypeScript, Mongoose, MongoDB (replica set, even locally). The only layer that touches the database.
- **frontend/** — Next.js App Router, React, Tailwind, shadcn/ui. Staff console: Super Admin, School Admin, Accountant, Exam Controller, Teacher.
- **mobile/** — React Native with Expo, Expo Router, NativeWind. Family app: Parent, Student, plus Teacher for on-the-go tasks.
- **shared/** — `@sms/shared`: types, enums, and Zod schemas imported by all three.

## Current state (already built — do not rebuild)

- Public school registration → Super Admin review → atomic approval that provisions School, Subscription, six default roles, and first admin user with temp password.
- JWT auth with refresh-token rotation and reuse detection, forced password change, login blocked for suspended schools.
- Plan catalogue (Trial/Starter/Growth/Enterprise), suspend/reactivate, audit logging, RBAC engine with dotted permission strings, tenant-scoping Mongoose plugin using AsyncLocalStorage.
- Web pages for the above; login/register shells on mobile. 10/10 tests passing.
- Schemas exist without endpoints: Student, Guardian, Teacher, Employee, Class, Section, Subject, AcademicSession, Campus, Notification.

---

## Non-negotiable rules (apply to every phase)

1. **Tenant isolation is CRITICAL.** Every tenant-owned collection has `schoolId`. The plugin always *overrides* any caller-supplied `schoolId` with the one from AsyncLocalStorage. Only `SUPER_ADMIN` may cross tenants, and every crossing is audit-logged. Never rely on manual filters in services.
2. **Permissions, not roles.** Guards check permission strings like `fee.invoice.create`. Never check role names in code. Every new endpoint gets a new permission, added to the permission registry and to the correct default roles.
3. **Schema before controllers.** For each module: shared types/Zod → Mongoose schema + indexes → service → routes → tests → web UI → mobile UI → seed data.
4. **Money** is stored as integers in the smallest currency unit. Never use floats for money. Currency is a per-school setting.
5. **Dates** are stored in UTC. Display and business-day logic use the school's timezone setting.
6. **Soft deletes** everywhere (`deletedAt`). Unique indexes must be compound with `schoolId` and use partial filters that exclude soft-deleted records.
7. **Pagination** on every list endpoint, using the existing envelope and pagination format.
8. **Transactions** for all multi-document writes (fee payment, payroll run, marks publish, promotion, admission).
9. **Validation**: every request body, query, and param is validated with a Zod schema from `shared/`. The frontend and mobile reuse the same schemas for forms.
10. **Files** go through `StorageService`. Keys are prefixed `schools/{schoolId}/...`, served via short-lived signed URLs, with a tenant check before issuing any URL.
11. **External providers** (SMS, email, push, payment gateway) sit behind interfaces like `StorageService`, with a console/fake implementation for dev and tests.
12. **Background work** (SMS, email, PDFs, payroll runs, imports) runs in a job queue. Jobs must carry `schoolId` explicitly and set the tenant context; the plugin must **fail closed** (throw) if a tenant-scoped query runs with no tenant context and no explicit super-admin bypass.
13. **Tests are part of done.** Every module gets unit/integration tests *and* entries in the cross-tenant test suite.
14. **No placeholders.** No `TODO: implement`, no mocked endpoints in real code paths, no dead UI buttons. If something is out of scope, leave it out and note it in the phase report.

## Definition of done (per module)

- [ ] Types + Zod schemas in `shared/`
- [ ] Mongoose schema with `schoolId`, soft delete, timestamps, correct compound/partial indexes
- [ ] Service layer with business logic; transactions where needed
- [ ] REST routes with permission guards, validation, pagination
- [ ] Permissions registered and assigned to default roles
- [ ] Audit log entries for sensitive actions
- [ ] Integration tests + cross-tenant tests passing
- [ ] Web pages (list, create, edit, detail, empty states, loading, errors)
- [ ] Mobile screens where the role needs them
- [ ] Seed data added so the UI is never empty
- [ ] OpenAPI docs updated
- [ ] `CLAUDE.md` updated if a convention changed

## Phase report format (end of every phase)

Stop and output:
1. What was built (files, endpoints, screens)
2. Decisions made and why
3. Test results (counts, anything skipped)
4. Known gaps or risks
5. Suggested commit message
Then **wait for my approval** before starting the next phase.

---

## Phase 0 — Housekeeping

- Verify `.gitignore` covers `node_modules`, `.env*`, build outputs, uploads, Expo artifacts. Create `.env.example` files for each package.
- Apply the pending `CLAUDE.md` correction about aggregation scoping so the doc matches the plugin's actual behaviour.
- Add `docker-compose.yml` that runs MongoDB as a single-node replica set (with auto `rs.initiate`), plus Redis for the job queue. One command should bring up the full dev environment.
- Add a CI workflow (GitHub Actions) that installs, type-checks, lints, and runs tests for all packages against a replica-set MongoDB.
- Prepare the first commit. Do not push.

## Phase 1 — Architecture decisions (write ADRs, then stop)

Write short Architecture Decision Records in `docs/adr/` and wait for my approval before implementing:

- **ADR-001 Multi-school identity.** Recommended: a global `User` (email/phone, password, 2FA) plus a tenant-scoped `SchoolMembership` (`userId`, `schoolId`, `roleIds`, `status`, linked `teacherId`/`guardianId`/`studentId`). JWT carries the active `schoolId`; a `POST /auth/switch-school` endpoint issues a new token for another membership. Covers teachers at two schools and parents with children at two schools. Describe the migration from the current user model.
- **ADR-002 Campus scoping.** Decide whether `campusId` is a second scoping dimension (e.g. campus-restricted staff). Recommended: optional `campusIds` on memberships, enforced in services via a helper, not the global plugin.
- **ADR-003 Job queue.** BullMQ + Redis; how tenant context is passed into workers.
- **ADR-004 Provider interfaces.** SMS, email, push (Expo push tokens via `expo-server-sdk`), payment gateway.

## Phase 2 — Tenant isolation hardening

- Audit the plugin against every Mongoose operation: `find*`, `count*`, `distinct`, `update*`, `delete*`, `findOneAndUpdate/Replace/Delete`, `replaceOne`, `insertMany`, `bulkWrite`, upserts, `save`, `aggregate`, `populate`. For any operation the plugin cannot cover, block it with a wrapper or lint rule.
- Aggregations: inject `schoolId` into the first `$match` and into every `$lookup` pipeline targeting a tenant collection. Reject `$lookup` with `localField/foreignField` on tenant collections unless rewritten to pipeline form.
- Block direct `Model.collection` / raw driver access in application code (ESLint rule).
- Implement fail-closed behaviour when no tenant context exists.
- Add a per-school atomic sequence service (`counters` collection, `findOneAndUpdate` with `$inc`) for admission numbers, invoice numbers, receipt numbers, employee codes.
- Implement `schoolId` prefixing + signed URLs + tenant check in `StorageService`.
- **Build the cross-tenant test suite**: create two schools with data; for every model and every endpoint, assert that School A's user cannot list, read, update, delete, or reference School B's records (including by guessing IDs and by passing `schoolId` in the body/query). This suite must run in CI and grow with every module.

## Phase 3 — Platform foundations

- Implement ADR-001 (User + SchoolMembership, switch-school), with migration and tests.
- Auth flows: forgot/reset password (tokenized, expiring, single-use), email verification, account lockout after failed attempts, TOTP 2FA required for `SUPER_ADMIN` and optional for others.
- Security: `helmet`, CORS allowlist, rate limiting (stricter on auth routes), request size limits, request IDs.
- Job queue (BullMQ) with workers, retries, and a dead-letter view for Super Admin.
- Notification delivery: channels (in-app, email, SMS, Expo push), device token registration from mobile, per-user preferences, templates, SMS credit consumption against the plan.
- **Plan limit enforcement**: a `PlanLimitService` checked on create for students, staff, storage uploads, and SMS sends, with clear error codes the UI can show ("Upgrade plan").
- **School settings**: logo/branding, timezone, locale, currency, grading scale reference, fee due day, receipt/invoice prefixes, working days.
- Structured logging (pino), error tracking hook (Sentry-compatible), `/health` and `/ready` endpoints, OpenAPI generation from Zod schemas.
- **Custom roles UI**: School Admin can create/edit roles by picking permissions (grouped by module), cannot grant permissions they don't have, cannot edit system roles.

## Phase 4 — Academic structure

Modules: AcademicSession (one active per school), Campus, Class, Section, Subject, subject-to-class mapping, teacher-to-subject-to-section assignment, class teacher per section, **academic calendar** (holidays, events, working days, term dates), **grading scales**.

Web: School Admin setup screens with a guided "set up your school" checklist. Mobile: read-only calendar for all roles.

## Phase 5 — People, admissions, and onboarding

- Students, Guardians (many-to-many with relationship type, primary contact flag), Teachers, Employees (non-teaching staff).
- **Admissions pipeline**: inquiry → application → admission → enrollment, with per-school admission number from the sequence service and roll number generation per section.
- **Account provisioning**: create parent/student/teacher logins from records, invite via SMS/email, link existing Users via memberships (reuse ADR-001).
- Documents per student/staff (birth certificate, photos) via StorageService.
- **Bulk import/export** (CSV and Excel) for students, guardians, and staff: upload → validate every row with Zod → preview with row-level errors → confirm → import as a background job → downloadable error report. Exports respect current filters.
- Student profile page: personal info, guardians, enrollment history, attendance, marks, fees (tabs fill in as later modules land).

## Phase 6 — Timetable

- Period definitions (per school, per campus if applicable), weekly timetable per section, teacher/room assignment.
- Clash detection (teacher double-booked, room double-booked, section double-booked).
- Substitution/arrangement for absent teachers.
- Web: drag-and-drop timetable builder. Mobile: "My timetable" for teacher, student, parent.

## Phase 7 — Attendance and leave

- Student attendance: daily and period-wise (school setting), statuses (present/absent/late/leave/excused), cutoff time in school timezone, edit window with audit log.
- **Offline support in mobile**: teachers mark attendance offline; store locally (expo-sqlite or MMKV) with client-generated IDs; sync with idempotent endpoints; conflict rule is last-write-wins within the edit window, logged.
- Absence notifications to parents via the notification service.
- **Staff attendance** (manual + future biometric import endpoint).
- **Leave management**: leave types and balances for staff with approval workflow; student leave requests submitted by parents from mobile, approved by class teacher.
- Summaries: per student, per section, per month, excluding holidays from the academic calendar.

## Phase 8 — Communication and daily academics

- Notices/announcements targeted by school, class, section, role, or individual; read receipts; attachments.
- **Homework / daily diary**: teacher posts per section/subject with attachments and due date; parents and students see it on mobile; optional submission.
- **Parent-teacher meetings**: teacher publishes slots, parents book from mobile, reminders, notes after meeting.
- Parent-teacher messaging (optional, behind permission; teachers can disable).

## Phase 9 — Exams, marks, and report cards

- Exam types, exam schedule (date sheet), subject-wise max/pass marks, weightage across terms.
- Marks entry (web and mobile) with draft → submitted → verified by Exam Controller → **published** (transaction, locks marks, notifies parents).
- Grade calculation from school grading scale; positions/ranks optional per school setting.
- **Report card PDFs** generated in background jobs with school branding; bulk generation per section.
- Result analysis: subject averages, pass percentage, toppers.

## Phase 10 — Fees and finance

- Fee heads and fee structures per class/session; installment plans.
- Discounts, scholarships, sibling concessions; late fines (rule-based, in school timezone).
- Invoice generation per cycle (background job, transaction), per-school invoice numbering.
- Payments: cash/bank/online, **partial payments**, receipts with per-school numbering, **refunds**, payment reversal with audit log.
- `PaymentProvider` interface with webhook handling and **idempotency keys**; no duplicate payments on retries.
- Fee challan and receipt PDFs; parents view and pay from mobile.
- Defaulter list, collection reports, reminders via SMS/push.
- Basic expense and income ledger for the Accountant role.

## Phase 11 — Payroll

- Salary structures (basic, allowances, deductions), tax rules as configurable components, advances/loans with repayment schedule.
- Monthly payroll run in a transaction: pull staff attendance and approved leave, compute, review, lock, publish.
- Payslip PDFs; staff view payslips on mobile. Bank transfer export file.

## Phase 12 — Student lifecycle and year end

- **Session rollover**: create next session, copy class/section/subject structure.
- **Bulk promotion**: promote/detain per student with preview, run as a transaction per section, keep full enrollment history.
- Section transfers, withdrawal, alumni status.
- Leaving/transfer certificates, character certificates, **ID cards** (PDF, bulk).

## Phase 13 — Dashboards and reports

- School Admin dashboard: enrollment, today's attendance, fee collection vs due, upcoming exams, pending approvals.
- Teacher dashboard (web + mobile): today's classes, attendance to mark, homework, pending marks.
- Parent dashboard (mobile): per-child attendance, homework, results, fee status, notices; child switcher; school switcher if multi-school.
- Report builder basics: filters + export to CSV/Excel/PDF for attendance, fees, exams, staff.

## Phase 14 — SaaS business layer

- **Billing schools**: subscription invoices, payment collection, upgrades/downgrades with proration, trial expiry, grace period, automatic suspension and reactivation on payment.
- Usage metering dashboard per school (students, staff, storage, SMS credits vs plan).
- **Super Admin impersonation** ("log in as school admin"), time-limited, clearly bannered in the UI, fully audit-logged, cannot change passwords or billing while impersonating.
- Super Admin platform dashboard: active schools, trials expiring, MRR, churn, pending applications, failed jobs.
- **School offboarding**: full data export (JSON + CSV + files zip), retention period, then hard deletion job with audit record.

## Phase 15 — Seed script and polish

- Complete the seed script per `CLAUDE.md`: super admin, plans, two demo schools each with a session, classes, sections, subjects, timetable, ~30 students with guardians, teachers, a week of attendance, an exam with published marks, a fee cycle with some paid/partial/unpaid invoices, one payroll run, notices, and homework. Seed must be idempotent and runnable with one command.
- Accessibility pass on web (keyboard nav, labels, contrast) and mobile (screen reader labels).
- i18n scaffolding on web and mobile (strings extracted, locale from school/user settings), with RTL support verified on at least the main layouts.

---

## Start now

Begin with **Phase 0**. Read the codebase first, then list anything in this prompt that conflicts with what already exists before making changes. Stop after Phase 0 with the phase report.

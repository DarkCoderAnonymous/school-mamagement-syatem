# Project: Multi-School Management System (SaaS)

A multi-tenant platform where many schools run independently under one Super Admin layer.

## Repository layout
Three independent applications in one repo:

school-management-system/
├── backend/     Node.js + Express + TypeScript + Mongoose + MongoDB
├── frontend/    Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
├── mobile/      React Native + Expo (Expo CLI) + TypeScript + Expo Router
└── shared/      Shared TypeScript types & enums, consumed by all three

Each app has its own package.json, .env, README and can run standalone.
The backend is the single source of truth; frontend and mobile only talk to it over REST.

## Tech decisions (do not change without asking)
- Backend: Node.js, Express, TypeScript, Mongoose ODM, MongoDB, JWT (access + refresh),
  BullMQ + Redis for background jobs, Zod for validation, Swagger (swagger-jsdoc/ui) for API docs.
- Frontend (web): Next.js App Router, TypeScript, Tailwind, shadcn/ui, TanStack Query,
  React Hook Form + Zod, Zustand for light client state.
- Mobile: Expo (managed workflow), Expo Router, TypeScript, TanStack Query,
  expo-secure-store for tokens, expo-notifications for push, NativeWind for styling.
- File storage: S3-compatible (use local disk adapter in dev, behind a StorageService interface).
- All money stored as integers (smallest currency unit). All dates stored UTC.

## Backend folder structure
backend/src/
├── config/            env loading + Zod validation, db connection, redis
├── db/                mongoose connection helpers
├── models/            Mongoose schemas, one file per model
├── modules/<feature>/ <feature>.routes.ts, .controller.ts, .service.ts, .validation.ts
├── middleware/        auth, requirePermission, validate, errorHandler
├── tenant/            AsyncLocalStorage tenant context + the tenant-scoping Mongoose plugin
├── rbac/               permission catalogue + default role→permission templates
├── jobs/              BullMQ queues + workers
├── utils/             AppError, response envelope helpers, pagination, mailer
├── app.ts             express app assembly
└── main.ts            bootstrap: connect DB, start server, graceful shutdown

Controllers are thin (parse, call service, respond). Business logic lives in services.
Services never touch req/res.

## MongoDB conventions
- Multi-document writes that must be atomic (school approval, fee payment, payroll run,
  marks publish) use Mongoose transactions — MongoDB must therefore run as a replica set,
  even a single-node one locally (docker-compose runs `--replSet rs0` + an init step).
- The tenant-scoping plugin covers find/update/delete/save AND `aggregate`: it unshifts
  `$match: { schoolId }` as the pipeline's first stage for non-SUPER_ADMIN callers, so
  dashboard/report pipelines are scoped without each one remembering to do it. It also
  overrides any caller-supplied `schoolId` rather than trusting it, so passing another
  school's id in a filter cannot widen a query past its tenant.
- The plugin FAILS CLOSED: a tenant-scoped operation with no tenant context throws
  rather than running unscoped. Trusted non-request code (seed scripts, migrations,
  jobs, tests asserting on raw collections) opts out explicitly with
  `TenantContext.runAsSystem()`, so "unscoped" is always something somebody wrote
  down. Public pre-auth routes (login, refresh, logout, forgot/reset password) use it
  too — they genuinely cannot be scoped, since no school is proven yet.
  CAUTION: a Mongoose query is lazy. `runAsSystem(() => Model.find(...))` returns an
  unexecuted Query that then runs *outside* the scope and throws — await inside the
  callback, or call `.exec()`.
- `$lookup` into a tenant collection is now handled: pipeline form gets a
  `$match: { schoolId }` prepended to its sub-pipeline, and `localField`/`foreignField`
  form is REJECTED (it has nowhere to carry a condition) — rewrite it in pipeline form.
- Operations that cannot be scoped are blocked outright: `estimatedDocumentCount()`
  (takes no filter — use `countDocuments()`) and `bulkWrite()` on tenant collections.
  `insertMany` and upserts stamp `schoolId` like `save()` does.
- Raw driver access (`Model.collection`, `db.collection()`) bypasses all middleware and
  is blocked by an ESLint rule in `backend/eslint.config.mjs`, since no runtime hook can
  catch it.
- Per-school numbering (admission, invoice, receipt, employee codes) goes through
  `services/sequence.service.ts`, which uses an atomic `$inc` — never read-max-and-add-one.
- `backend/test/cross-tenant/` is the registry-driven harness that guards all of the
  above. Adding a module means adding ONE entry to `registry.ts` — never a new test
  file — which earns it the full battery of isolation probes. `npm run check:registry`
  fails CI if a tenant-owned model is unregistered, since an unregistered model gets no
  coverage and a green run hides that.
- **Read `docs/security/tenant-isolation-findings.md` before changing the tenant
  plugin.** It records the five isolation defects the harness found and why each guard
  is shaped the way it is — several look like over-engineering without it.
- Compound indexes on every list query's filter+sort combination, always including
  schoolId as the leading field for tenant-owned collections.
- Use `.lean()` on read-only queries.
- Reference by ObjectId; embed only for data that is never queried independently.

## Response shape (all endpoints)
success: { success: true, data: <payload>, meta?: { page, limit, total, totalPages } }
error:   { success: false, error: { code, message, details? } }

## Who uses what
- Web (Next.js): Super Admin, School Admin, Accountant, Exam Controller, Teacher (full features)
- Mobile (Expo): Parent, Student, Teacher (attendance, marks entry, notices, PTM)

## Multi-tenancy rules — CRITICAL
- Every tenant-owned collection has a non-null `schoolId` field (ObjectId ref to School).
- Every authenticated request carries `schoolId` in the JWT payload.
- **Identity is global; tenancy is a membership (ADR-001).** `User` is a platform
  collection — the person, their credential, globally-unique email, no `schoolId`.
  `SchoolMembership` is tenant-owned and holds the roles, status and per-school domain
  links (`teacherId`/`guardianId`/`studentId`) for one (person, school) pair. A teacher
  at two schools is ONE user with two memberships and potentially different roles at
  each. Listing "people at a school" therefore queries SchoolMembership, never User.
- A platform `SUPER_ADMIN` is a User with **no** memberships and `platformRoleIds`.
- Login resolves a person, not a session: one membership issues tokens directly, several
  return `kind: 'select-school'` with a 5-minute selection token and NO tokens. Never
  guess a default school. `POST /auth/switch-school` re-issues the pair for another
  membership and revokes the old refresh token — a token's audience never mutates.
- A Mongoose plugin, applied to every tenant schema, automatically injects `schoolId` into
  every query (find/update/delete) and every document created, for non-SUPER_ADMIN users,
  via an AsyncLocalStorage-based tenant context read at query time (a pre-hook plugin, not
  something each service has to remember to do manually).
- SUPER_ADMIN can cross schools, but every cross-school read/write is written to AuditLog.
- A student, parent, teacher, class, fee record etc. can NEVER be visible to another school.

## Roles
SUPER_ADMIN, SCHOOL_ADMIN, ACCOUNTANT, EXAM_CONTROLLER, TEACHER, PARENT, STUDENT
Roles map to permissions (e.g. "fee.invoice.create") stored in DB, not hard-coded in guards.
Guards check permissions, not role names, so custom roles can be added later.

Permissions are denormalized into the access token, so **any code that changes what a
membership may do must bump its epoch** (ADR-005):

- `bumpMembershipEpoch(membershipId)` after assigning/removing roles;
  `bumpEpochForRole(roleId)` after editing a role's permission list. A missed bump
  silently reintroduces up to 15 minutes of stale access.
- `authenticate` compares the token's epoch against the live value (Redis, 5s in-process
  cache, DB fallback) and rejects a mismatch with `TOKEN_STALE` — the client refreshes
  and retries, so the user sees nothing.
- `revokeAllSessions(userId)` is the blunt instrument: sets `sessionsValidFrom` and
  revokes refresh tokens. Used on account disable, password change and reset. Unlike an
  epoch bump it **cannot** be recovered by refreshing (`SESSION_REVOKED`).
- The epoch lookup only accepts an ACTIVE, non-deleted membership, so removing someone
  from a school ends their access on the next request.

## Non-negotiables
- TypeScript strict mode everywhere. No `any` without a comment justifying it.
- Every write endpoint validated, authorised, and audit-logged (who/what/when/before/after).
- Soft delete (`deletedAt`) on all core entities.
- Errors returned in a consistent shape: { success, data, error: { code, message, details } }
- Pagination on every list endpoint (page, limit, sort, search, filters).
- Seed script must create: 1 super admin, 2 demo schools, classes, subjects, ~30 students,
  guardians, teachers, one exam with marks, and one fee cycle — so the UI is never empty.
- Write the Mongoose schema for a module BEFORE writing its controllers.

## Out of scope for now
Library, transport, hostel, health records, front desk/visitor log, inventory, LMS.
Do not build them, but do not design anything that would block adding them later.

Dropped roles (out of scope): Receptionist/Admission Officer, Librarian, Transport Manager,
Hostel Warden, Nurse, HOD. Their modules stay out of scope, but the RBAC engine (permissions
in DB, not hard-coded) stays generic so these can be added later without a rewrite.

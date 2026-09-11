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
| Academic sessions | ✅ | ✅ | — | ❌ | ✅ |
| Identity & memberships | ✅ | ✅ | ✅ | ✅ | ✅ |
| Classes & sections | | | | | |
| Subjects | | | | | |
| Students | | | | | |

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
- Phase 10 — fees and finance
- Phase 11 — payroll
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

---

## Known gaps and risks

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

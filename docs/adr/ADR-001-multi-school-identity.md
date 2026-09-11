# ADR-001 — Multi-school identity

- **Status:** Proposed — awaiting decision
- **Date:** 2026-09-12
- **Phase:** 1 (master prompt). Implementation lands in Phase 3.
- **Blocks:** Guardians, Teachers, Admissions (Phase 5)

## Context

Identity and tenancy are currently the same record. `User` carries
`schoolId` directly, and uniqueness is `{ schoolId, email }`
([User.ts:36](../../backend/src/models/User.ts#L36)), so **one person at two
schools is two rows with two passwords**.

Two ordinary cases break this:

1. **A teacher employed at two schools.** Common in school groups and in
   towns where a specialist teaches at several institutions. Today they get
   two accounts, two passwords, and no way to move between schools without
   logging out.
2. **A parent with children at two different schools.** The parent's identity
   is the same person; only the child differs. Today the mobile app can only
   ever show one school's children per login.

Three further strains on the current model:

- `SUPER_ADMIN` is already a special case — the one `User` with
  `schoolId: null`, kept working by a nullable override on a field that is
  otherwise required.
- Password reset is ambiguous. `forgotPassword` looks up by email alone
  ([auth.service.ts](../../backend/src/modules/auth/auth.service.ts)); with
  the same email at two schools, `findOne` silently picks one.
- Login has the same ambiguity, acknowledged in the code as a "known
  simplification" that holds only because every user today is created either
  by the seed or by approval, which sources email from the globally-unique
  `SchoolRegistration.email`.

## Options

### Option A — Do nothing (one `User` row per school)

Keep the current model. Multi-school people keep multiple accounts.

| | |
| --- | --- |
| **Cost to build** | Zero |
| **Teacher at two schools** | Two accounts, two passwords, log out to switch |
| **Parent at two schools** | Two accounts; mobile can't show both children |
| **Password reset** | Ambiguous — resets whichever row `findOne` returns |
| **Risk** | Grows. Every module that references a person (Phase 5) hardens the assumption |

Honest reading: this works until the first customer with a shared teacher,
and then it is a schema migration under pressure rather than a planned one.

### Option B — Array of `schoolIds` on `User`

`User.schoolIds: ObjectId[]`, still one row per person.

| | |
| --- | --- |
| **Cost to build** | Low |
| **Fatal flaw** | Nowhere to put per-school **roles**, status, or domain links |
| **Tenancy** | Puts tenant data on a global document — the tenant plugin can't scope an array membership |

A teacher who is a `TEACHER` at school A and a `SCHOOL_ADMIN` at school B
cannot be expressed. Rejected.

### Option C — Shared credential, per-school user rows

Keep `User` per school, but extract authentication into a `Credential`
record that several `User` rows point at.

| | |
| --- | --- |
| **Cost to build** | Medium — smaller blast radius than D; `user.schoolId` keeps working |
| **Solves** | One password, one reset flow |
| **Doesn't solve** | Still N rows per person. "Which of my accounts is this?" stays a per-row question, and every list of people at a school can still show the same human twice across schools |
| **Switching** | Possible, but the token still points at a row rather than a person + a school |

This is the pragmatic middle. It buys the password fix cheaply and defers
the identity fix — which means paying most of the migration cost twice.

### Option D — Global `User` + tenant-scoped `SchoolMembership` (master prompt's recommendation)

Split the person from their relationship to each school.

```ts
// Global. The person. No schoolId.
User {
  _id, email (globally unique), phone, passwordHash,
  totpSecret?, status: 'ACTIVE' | 'DISABLED',
  passwordResetTokenHash?, passwordResetExpiresAt?
}

// Tenant-owned. One per (person, school).
SchoolMembership {
  _id, userId, schoolId,
  roleIds: ObjectId[],
  status: 'INVITED' | 'ACTIVE' | 'DISABLED',
  campusIds?: ObjectId[],            // ADR-002
  teacherId?, guardianId?, studentId?,  // link to the domain record at THIS school
  deletedAt
}
```

Unique on `{ userId, schoolId }`, partial-filtered to exclude soft-deleted
rows (per CLAUDE.md's soft-delete rule).

| | |
| --- | --- |
| **Cost to build** | High — touches auth, JWT, tenant context, every `user.schoolId` read, and the login UX |
| **Teacher at two schools** | One account, two memberships, different roles per school, switch without logout |
| **Parent at two schools** | One account; `guardianId` per membership links to each school's Guardian record |
| **`SUPER_ADMIN`** | Stops being a special case: a `User` with **no** memberships and a platform role |
| **Tenancy** | Unchanged — `SchoolMembership` is itself tenant-owned, so the existing plugin scopes it with no new machinery |

## Recommendation

**Option D.**

Option A is the cheapest today and the most expensive at the moment it
fails, and that moment is a customer conversation rather than a sprint.
Option C solves the password symptom while leaving the duplicate-person
problem — and its migration is most of D's migration, spent twice.

The decisive argument is timing, not elegance. Phase 5 builds Guardians,
Teachers, Employees and Admissions. Every one of those references a person.
Doing this **before** Phase 5 means those modules are written against
memberships from the start; doing it after means migrating live student,
guardian and staff records, which is a far larger and riskier job.

### What the JWT carries

```ts
interface AccessTokenPayload {
  sub: string;            // User._id — the person
  membershipId: string;   // which membership this token is acting through
  schoolId: string | null;// active school (null only for SUPER_ADMIN)
  isSuperAdmin: boolean;
  roles: string[];        // role names for THIS membership
  permissions: string[];  // union of this membership's roles' permissions
}
```

`schoolId` stays exactly where the tenant context already reads it
([auth.middleware.ts:33](../../backend/src/middleware/auth.middleware.ts#L33)),
so the plugin needs no change. `membershipId` is new and load-bearing: it is
what refresh binds to, and what makes "this token is for school B" a fact
rather than an inference.

### How switching schools works

**Login** resolves a person, not a session:

- One active membership → issue tokens for it. Unchanged from today's UX.
- Several → return `200` with the membership list (school name, logo, roles)
  and **no tokens**. The client shows a picker; `POST /auth/select-school`
  with the chosen `schoolId` issues the pair. Never guess — picking the
  "first" membership is how a parent ends up looking at the wrong child's
  attendance.
- Zero, and not a super admin → `403 NO_ACTIVE_MEMBERSHIP`.

**Switching mid-session** is `POST /auth/switch-school { schoolId }`. It
verifies an active membership for the target, issues a fresh pair bound to
the new `membershipId`, and revokes the old refresh token. Switching is
re-issuance, never mutation of an existing token — otherwise a token's
audience changes under it and the refresh family loses meaning.

`RefreshToken` gains `membershipId` alongside its existing nullable
`schoolId`. The reuse-detection family
([auth.service.ts](../../backend/src/modules/auth/auth.service.ts)) stays
keyed on `userId`, so theft still revokes every session for the person —
across all their schools, which is the correct blast radius for a stolen
credential.

### What happens to existing `User` records

Every current `User` becomes one `User` + one `SchoolMembership`:

- `User.schoolId` → `SchoolMembership.schoolId`
- `User.roles` → `SchoolMembership.roleIds`
- `User.status` splits: account-level (`DISABLED` = can't log in anywhere)
  stays on `User`; school-level (removed from one school) moves to the
  membership
- `mustChangePassword` stays on `User` — it is a credential property
- The `SUPER_ADMIN` row keeps `schoolId: null` and gets **no** membership

**The genuinely hard part is duplicate emails.** Two rows sharing an email
across schools are one person with two passwords, and nothing in the data
says which password is theirs. Neither can be chosen safely. The migration
keeps the oldest `User` as the identity, repoints both memberships at it,
and **forces a password reset** for the merged identity — a deliberate
interruption for a handful of accounts, rather than a silent choice that
locks someone out of a school they could previously reach.

## Consequences

**Good**

- One password, one reset flow, one 2FA enrolment per person.
- School switching without logout; the mobile child-switcher becomes possible.
- `SUPER_ADMIN` stops being a nullable-field special case.
- Tenant isolation is untouched — the plugin, the fail-closed behaviour and
  the cross-tenant suite all keep working as-is.

**Costs — stated plainly**

- **Login gains a branch.** The client must handle "choose a school", and
  both web and mobile need that screen. This is the visible UX cost.
- **Every `user.schoolId` read becomes a membership lookup.** That is the
  bulk of the mechanical work, spread across auth, the seed, and the
  approval flow.
- **Permission resolution gains a hop** (`membership → roleIds → permissions`).
  It must be resolved once per token, not per request — which is exactly the
  question ADR-005 answers, so these two decisions should be taken together.
- **Email becomes globally unique.** Two schools can no longer independently
  own `admin@example.com`. This is correct, but it is a behaviour change a
  customer can notice.
- **`GET /auth/me` changes shape** — it must return the membership list, not
  a single school, so the client can render a switcher.
- **Tests and the cross-tenant suite need extending** with the case that does
  not exist today: one user, two schools, and the assertion that a token for
  school A cannot read school B *even though the same person holds both*.

**Risk if deferred:** it does not get cheaper. Phase 5 multiplies the
surface that assumes one-user-one-school.

## Migration

All steps idempotent; steps 2–3 as a single script with `--dry-run` that
reports what it *would* do first.

1. **Add `SchoolMembership`** with its indexes. Leave `User.schoolId` in
   place, unread by new code. Nothing breaks; nothing changes yet.
2. **Backfill** one membership per existing `User` from its `schoolId` and
   `roles`. Skip the super admin.
3. **Merge duplicate emails.** Group users by lowercased email; for groups
   larger than one, keep the oldest as the identity, repoint the other
   memberships at it, null the losing rows' `passwordHash`, set
   `mustChangePassword`, and trigger a reset email. Report every merge.
4. **Move auth to memberships** — login resolution, `select-school`,
   `switch-school`, `me`, and the token payload. Keep **writing**
   `User.schoolId` for one release so a rollback is possible.
5. **Cut over the rest of the codebase** from `user.schoolId` to membership.
6. **Drop** `User.schoolId`, its index, and the dual-write from step 4.

Steps 1–3 are safe to run against production ahead of the code change;
step 4 is the release boundary. Reversing after step 6 requires a restore,
so step 5 is where the soak time belongs.

## Open questions for the decision

- Should a person be allowed to hold a membership at a school that has
  **suspended** them, for later reactivation? (Recommendation: yes —
  `status: 'DISABLED'` on the membership, not deletion, so history survives.)
- Does `SUPER_ADMIN` ever need a membership — e.g. to be a parent at a
  school on their own platform? (Recommendation: allow it; keep the platform
  role independent of memberships so the two never merge.)

# ADR-005 — Permission freshness

- **Status:** Proposed — awaiting decision
- **Date:** 2026-09-12
- **Related:** [ADR-001](ADR-001-multi-school-identity.md) — where permissions
  live changes if memberships land, so these should be decided together.

## Context

Permissions are denormalized into the access token at issue time
([auth.types.ts](../../backend/src/modules/auth/auth.types.ts)):

```ts
permissions: string[];  // union of this user's roles' permission codes
```

`requirePermission` then checks that array in memory with no database read
([requirePermission.ts:11](../../backend/src/middleware/requirePermission.ts#L11)),
which is what keeps authorisation off the hot path.

### Correcting the premise

It is not true that a role change needs a re-login. **`refresh` re-resolves
permissions from the database.** Both `login` and `refresh` call
`issueTokens`, which calls `resolveRolesAndPermissions` and reads `Role`
fresh every time ([auth.service.ts:20](../../backend/src/modules/auth/auth.service.ts#L20)).

So the actual behaviour is:

- **Staleness is bounded by the access-token TTL — 15 minutes by default**,
  not unbounded and not until logout.
- The web client refreshes reactively: the response interceptor refreshes on
  a `401` and retries. It does not refresh on a timer. So a change lands on
  the first request made *after* the current access token expires.
- A re-login is simply the fastest way to force it, which is why the
  `session.*` backfill was handed over with "sign out and back in" — waiting
  up to 15 minutes would also have worked.

The real problem is therefore narrower and worth stating precisely:

1. **Revocation lags by up to one access-token TTL.** A permission removed —
   or a user removed from a school — remains usable for up to 15 minutes.
   This is the security-relevant direction.
2. **The lag is invisible.** A school admin who removes a teacher's
   `exam.marks.publish` sees no confirmation that it took effect, and the
   teacher sees no explanation when it stops working mid-session.
3. **Nothing forces a session to end.** Disabling an account sets
   `status: 'DISABLED'`, which `refresh` checks — but the *current* access
   token keeps working until it expires. Refresh tokens are not revoked.
4. **An adjacent gap:** `resetPassword` revokes every refresh token for the
   user; `changePassword` does not. Changing your password after a suspected
   compromise leaves other sessions alive.

## Options

### Option A — Do nothing; document the 15-minute window

| | |
| --- | --- |
| **Cost** | Zero |
| **Grant latency** | ≤ 15 min |
| **Revoke latency** | ≤ 15 min |
| **Per-request cost** | None |
| **Weakness** | Cannot answer "remove this person's access now", which is a normal administrative request after a dismissal |

Defensible for permission *grants*. Weak for removals, and weak for account
disable, which admins reasonably expect to be immediate.

### Option B — Shorten the access TTL (e.g. 2 minutes)

| | |
| --- | --- |
| **Cost** | One config change |
| **Revoke latency** | ≤ 2 min |
| **Per-request cost** | None |
| **Weakness** | Refresh traffic rises ~7×, each refresh being a DB read plus a rotation write. Rotation means every refresh writes a `RefreshToken` row and revokes one — this is a write-amplification change, not just a timing one |

Buys a linear improvement at a superlinear cost, and still cannot do
"immediately".

### Option C — Resolve permissions per request; keep them out of the token

Token carries identity only; `requirePermission` loads roles each request.

| | |
| --- | --- |
| **Cost** | Moderate |
| **Revoke latency** | Immediate |
| **Per-request cost** | One indexed read per request (two after ADR-001: membership → roles) |
| **Side benefit** | Tokens shrink. A `SUPER_ADMIN` token currently carries ~40 permission strings in every request header |
| **Weakness** | Puts the database on the authorisation path for every authenticated request, including reads that would otherwise not touch it |

### Option D — Epoch stamp in the token, validated against a cache

Add `permissionsEpoch` to the record that owns roles. The token carries the
epoch it was minted with. `authenticate` compares the token's epoch against
the current one, read from Redis with an in-process fallback cache. Mismatch
→ `401 TOKEN_STALE` → the client's existing interceptor refreshes and
retries → the new token is minted with fresh permissions.

| | |
| --- | --- |
| **Cost** | Moderate |
| **Revoke latency** | Immediate (next request) |
| **Per-request cost** | One Redis `GET`, sub-millisecond, plus a short in-process cache |
| **Weakness** | Redis moves onto the auth path. Needs a defined behaviour when Redis is down |

### Option E — Cache the whole permission set in Redis, keyed by user

Token carries identity; the effective permission set lives in Redis and is
invalidated on role change.

| | |
| --- | --- |
| **Cost** | Higher — cache population, invalidation, and a cold-start path |
| **Revoke latency** | Immediate |
| **Per-request cost** | One Redis `GET` |
| **Weakness** | Two sources of truth for permissions. A missed invalidation is an authorisation bug that no test naturally catches, and it fails *open* |

### Option F — Hard revocation only (`sessionsValidFrom`)

A per-user timestamp; access tokens issued before it are rejected, and
refresh tokens are revoked on privilege change.

| | |
| --- | --- |
| **Cost** | Low |
| **Revoke latency** | Immediate — but only by ending the session entirely |
| **Weakness** | Blunt. Every permission tweak logs the user out, which is hostile when the change is a *grant*. Solves security, damages usability |

## Recommendation

**Option D, with a narrow piece of Option F for account-level events.**

Two mechanisms, because the two events are genuinely different:

- **`permissionsEpoch`** — an integer on the record that owns roles (today
  `User`; after ADR-001, `SchoolMembership`). Bumped whenever a role is
  assigned, unassigned, or a role's permission list is edited. A mismatch
  costs the user one silent refresh, not their session. This covers routine
  permission changes in both directions.
- **`sessionsValidFrom`** — a timestamp on `User`, set on account disable,
  password change, and suspected compromise. Access tokens issued earlier are
  rejected and refresh tokens are revoked. This is the one that should be
  blunt: "end this person's access now" must not be recoverable by refresh.

Why D over C: authorisation stays off the database path, which is the
property that made the denormalized token worth having. Why D over E: the
epoch is a cache-invalidation *signal*, not a cache of the answer. If the
epoch read fails or returns stale, the failure mode is an unnecessary
refresh, not a wrong authorisation decision — E's failure mode is the
opposite.

**Redis-down behaviour must be decided explicitly.** Recommendation: fall
back to reading the epoch from the database, cached in-process for ~5
seconds. This keeps authorisation correct while degraded and bounds the extra
load. It must not fail open — skipping the check when Redis is unavailable
would make "revoke access now" silently conditional on infrastructure
health. Note that today a Redis outage degrades only rate limiting and mail
([redis.ts](../../backend/src/config/redis.ts)); this change makes Redis
a participant in auth, which is a real increase in its importance.

## Consequences

**Good**

- Removals and disables take effect on the next request.
- Grants apply without the user noticing anything, and without a logout.
- The hot path keeps its in-memory permission check.
- An admin UI can honestly report "applied" rather than "applied within 15
  minutes".

**Costs**

- **Redis joins the auth path**, with a defined degraded mode to build and test.
- **Every permission-mutating code path must bump the epoch.** A missed bump
  reintroduces exactly today's staleness, silently. This belongs in the
  service layer that owns role writes, not at call sites — and needs a test
  that asserts the bump, not just the write.
- **`npm run backfill:permissions` must bump epochs too**, or the next
  permission addition repeats the "sign out and back in" instruction.
- **One extra round trip on the first request after any change** — a `401`
  followed by a refresh and retry. Invisible on web; worth checking on mobile,
  where it lands on a slower link.

### Impact on the existing refresh-rotation flow

This is the part most at risk of breaking, and the news is mostly good.

- **No change to rotation semantics.** `refresh` already re-resolves
  permissions from the database, so the new token is automatically correct.
  The only addition is stamping the current epoch into it. One-time use,
  `replacedByTokenHash`, and family-wide revocation on reuse all stay as they
  are.
- **The client already handles it.** A `401` on a normal endpoint triggers
  the interceptor's refresh-and-retry
  ([api-client.ts](../../frontend/src/lib/api-client.ts)). The auth-endpoint
  exemption added earlier matters here: `/auth/refresh` returning `401` must
  *not* trigger another refresh, and it no longer does.
- **Loop safety needs stating.** If a stale-epoch `401` produced a token that
  was *also* stale, the client would loop. Two guards: `refresh` reads the
  epoch from the database (the source of truth, never the cache) when
  stamping; and the interceptor's `_retry` flag already allows exactly one
  retry before surfacing the error.
- **`TOKEN_STALE` should be its own error code**, distinct from an expired
  token. The client behaviour is identical, but conflating them makes it
  impossible to tell "tokens are expiring normally" from "something is
  bumping epochs in a loop".
- **Mobile needs the same interceptor.** The Expo app stores tokens in
  `expo-secure-store` and has no equivalent retry logic yet; without it, a
  stale token surfaces as a spurious logout.
- **Fix the `changePassword` gap while here.** It should revoke refresh
  tokens and set `sessionsValidFrom`, as `resetPassword` already does.

## Migration

Additive; no data migration and no downtime.

1. **Add the fields.** `permissionsEpoch: number` (default `0`) and
   `sessionsValidFrom: Date | null` on `User`. Absent or `0` is a valid
   starting state — no backfill needed.
2. **Stamp both into new tokens.** Tokens minted before this carry no epoch;
   treat a missing epoch as matching, so existing sessions are not mass
   invalidated on deploy.
3. **Bump on writes.** Role assignment/unassignment, role permission edits,
   and `backfill:permissions`. Ship this *before* enforcement so epochs are
   already moving when the check goes live.
4. **Enforce in `authenticate`,** behind a config flag, with the Redis→DB
   fallback. Watch `TOKEN_STALE` rates for a few days: a steady low rate is
   healthy; a spike means a bump path is firing too often.
5. **Wire `sessionsValidFrom`** into account disable and `changePassword`.
6. **Drop the flag** once the rate is understood.

Rollback is step 4's flag until step 6; the fields themselves are inert if
unread.

## Open questions for the decision

- **Is a 15-minute revocation window actually unacceptable today?** If the
  answer is "we have no dismissal workflow yet", Option A plus the
  `changePassword` fix is a legitimate stopping point, and this ADR can be
  revisited when the admin UI for roles is built (Phase 3).
- **Should the epoch live on `User` or `SchoolMembership`?** After ADR-001 a
  role change is per-school, so the membership is the right owner — but that
  makes this decision dependent on ADR-001's outcome.
- **Should a permission *grant* also force a refresh,** or only a removal?
  Bumping on both is simpler and harder to get wrong; bumping only on removal
  halves the refresh traffic at the cost of a rule someone must remember.

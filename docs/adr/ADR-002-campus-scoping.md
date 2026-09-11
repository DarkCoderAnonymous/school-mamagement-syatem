# ADR-002 — Campus scoping

- **Status:** Accepted
- **Date:** 2026-09-12

## Context

A `Campus` schema exists. Some schools run several campuses and want staff
restricted to one: a campus coordinator should not see the other campus's
students. The question is whether `campusId` becomes a second automatic
scoping dimension alongside `schoolId`.

## Decision

**No.** `campusId` stays a normal field, filtered explicitly in services.
Membership carries optional `campusIds` (ADR-001); when it is non-empty, a
service helper narrows the query.

```ts
// In a service, explicitly — never in the global plugin.
const filter = withCampusScope({ deletedAt: null });
```

`withCampusScope` reads the membership's `campusIds` from the tenant context
and adds `{ campusId: { $in: [...] } }` when the list is non-empty. An empty
list means "all campuses at this school".

## Rationale

Tenant isolation is a **security** boundary: a leak across `schoolId` exposes
one customer's data to another, so it must be automatic and impossible to
forget. Campus restriction is an **authorisation preference** inside one
customer's data — a leak there is a permissions bug, not a breach.

Encoding both in one plugin would make the security-critical path harder to
reason about, and campus rules have exceptions that tenant rules never do:
school-wide notices, group-level reports, and a principal who sees everything.
Every exception would need a bypass, and bypasses in the tenant plugin are
exactly what we cannot afford.

## Consequences

Services that must respect campus restriction have to say so. That is a real
risk of omission, mitigated by: campus-aware endpoints listing their helper
use in review, and cross-campus cases being covered in the test suite the way
cross-tenant cases are. If campus restriction later becomes as strict as
tenancy for a customer, this decision gets revisited with real requirements
rather than anticipated ones.

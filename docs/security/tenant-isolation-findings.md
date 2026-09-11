# Tenant isolation findings

Recorded **before** any fix, from the first full run of the registry-driven
cross-tenant harness (`backend/test/cross-tenant/`). 134 probes over 14 tenant
models and 1 endpoint; 22 failed.

This file exists so that the shape of the plugin is explainable later. Several
of the guards below look defensive to the point of paranoia, and without this
record the next person to read them will reasonably wonder why — and may
simplify one away.

| # | Finding | Severity | Layer | Status |
| --- | --- | --- | --- | --- |
| 1 | `create()` trusts a caller-supplied `schoolId` | **Critical** | Plugin (`pre('save')`) | Open |
| 2 | Cross-tenant foreign keys accepted on write | **High** | No validation anywhere | Open |
| 3 | `Teacher.employeeId` globally unique on a tenant collection | **Medium** | Model index | Open |
| 4 | Unique indexes don't exclude soft-deleted rows | **Low** | Model indexes | Open |

---

## Finding 1 — `create()` trusts a caller-supplied `schoolId`

**Severity: Critical.** A write into another tenant.

**Code path:** `backend/src/tenant/tenant.plugin.ts`, the `pre('save')` hook.

```js
if (this.isNew && !this.schoolId) {
  // ...stamp from tenant context...
}
```

The stamp happens **only when the field is absent**. A document that arrives
with a `schoolId` already set keeps it, whatever it says.

This is the exact inverse of what the same plugin does on reads, where a
supplied `schoolId` is deliberately *overridden*:

```js
// query middleware — correct
const filter = this.getFilter();
filter.schoolId = schoolId;   // replaces, never merges
```

So `Model.create({ ...data, schoolId: <school B> })`, executed inside a normal
School A request, writes a row owned by School B. Any service that spreads
user-influenced data into a create is an injection point.

**Exploitability today:** latent, not live. Every HTTP probe passed — no
current endpoint spreads request body into `create` without naming fields. The
academic-sessions service builds its payload field by field. That is a property
of today's two services, not of the architecture, and the next module written
by someone who spreads `req.body` turns it into a live hole.

**How it was found:** the registry-driven model spec asserts, for every tenant
model, that a create with a forged `schoolId` is stamped with the acting
school. 14 of 14 models failed identically — which is what made it obvious the
fault was in the shared plugin rather than in any one model.

---

## Finding 2 — Cross-tenant foreign keys accepted on write

**Severity: High.** Corrupt referential state across a tenant boundary.

**Code path:** nowhere — that is the finding. The plugin stamps `schoolId` on
the document itself and never inspects reference fields. No service validates
them either.

School A can create records referencing School B's rows:

| Model | Field |
| --- | --- |
| `Class` | `academicSessionId`, `campusId` |
| `Section` | `classId` |
| `Teacher` | `employeeId` |
| `Student` | `classId`, `sectionId`, `academicSessionId` |

The created row is correctly stamped for School A, so it passes every existing
isolation check while pointing at another tenant's data.

**What it does NOT do:** leak reads. `populate` was probed explicitly and is
scoped — Mongoose runs the join through the referenced model's query
middleware, so a dangling cross-tenant reference resolves to `null` rather
than returning School B's document. The damage is corrupt state, broken
reports, and a foothold if any future code path ever trusts a stored
reference without re-checking it.

**How it was found:** a registry-declared `foreignKeys` list per model; the
harness attempts a create with each reference pointed at the other school. 7
of 7 reference fields accepted it.

---

## Finding 3 — `Teacher.employeeId` is globally unique on a tenant collection

**Severity: Medium.** Cross-tenant interference and an existence oracle.

**Code path:** `backend/src/models/Teacher.ts`

```js
employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true },
```

A bare `unique: true` builds a **global** index. Every other unique index on a
tenant model is compound with `schoolId`; this one is not, violating the rule
in `CLAUDE.md` ("Unique indexes must be compound with `schoolId`").

Consequences: School A claiming an `employeeId` prevents School B from using
it, and the resulting `E11000` tells School B that *someone else* holds that
id — an existence oracle across a tenant boundary.

**How it was found:** indirectly, and worth recording. The `populate` probe for
`teacher` failed while the equivalent probes for `class`, `section` and
`student` passed. The failure was a duplicate-key error raised while the test
was *setting up* the scenario — the harness could not even construct the
cross-tenant reference, because the global index rejected it first. A probe
failing for an unexpected reason turned out to be the more interesting signal.

---

## Finding 4 — Unique indexes don't exclude soft-deleted rows

**Severity: Low.** A correctness and usability bug, not an isolation failure.

**Code path:** eight index declarations across
`AcademicSession`, `Class`, `Campus`, `Subject`, `Student`, `Section`,
`Employee`, `Counter`.

```js
academicSessionSchema.index({ schoolId: 1, name: 1 }, { unique: true });
```

`CLAUDE.md` requires unique indexes on tenant models to "use partial filters
that exclude soft-deleted records". These don't. Because deletes are soft
(`deletedAt`), the row survives and keeps occupying the unique key: archive a
session named "2025-2026" and that name can never be used again. Same for
admission numbers, employee numbers and subject codes — the identifiers most
likely to be reissued.

`SchoolMembership` and `SchoolRegistration` already do this correctly and are
the model to follow.

**How it was found:** an audit of every `unique` declaration across the models,
prompted by finding 3. Not by a failing probe — which is itself worth noting:
the harness would not have caught this, because it never soft-deletes and then
recreates. A probe for it was added as part of the fix.

---

## Verified holding

Probed and correct, recorded so they are not re-litigated:

fail-closed with no tenant context (queries **and** creates) · aggregate outer
pipeline · caller-supplied `$match` cannot widen · `$lookup` pipeline form
scoped · `$lookup` localField/foreignField form rejected · `insertMany` stamped
· forged `schoolId` inside `insertMany` documents ignored · `bulkWrite` blocked
· `distinct` scoped · `estimatedDocumentCount` blocked · upsert stamps on
insert · upsert cannot be steered into another school by a forged filter ·
`populate` scoped · per-school sequences independent and race-free · every HTTP
probe (path id, body, query param, guessed id, list, get, patch, delete).

## Two defects in the harness itself

Recorded because both would have produced false confidence.

**Foreign-key probes initially passed for the wrong reason.** The factories
reused the fixture's own names, so `create` threw `E11000` and
`rejects.toThrow()` was satisfied by an error with nothing to do with tenancy.
Every factory now takes a required `seed` that must vary any field under a
unique index. A probe that passes on a duplicate key is worse than no probe:
it reports safety it never tested.

**The fail-closed-on-create probe asserted the wrong error.** Mongoose runs
`validate` before `save` middleware, so a required `schoolId` trips schema
validation before the plugin's guard is reached. The probe now asserts refusal
generally, plus the plugin's specific message against `RefreshToken`, whose
nullable `schoolId` means only the plugin can catch it.

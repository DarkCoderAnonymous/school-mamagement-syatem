import { TENANT_MODELS } from './registry';
import { asSchool, asSystem, unknownId, type CrossTenantFixture } from './fixture';
import { setupCrossTenant, teardownCrossTenant } from './setup';

/**
 * Plugin-layer isolation, generated from the registry: every tenant-owned
 * model gets the same battery without anyone copying a test file.
 */

let fx: CrossTenantFixture;

beforeAll(async () => {
  fx = await setupCrossTenant();
}, 120_000);

afterAll(teardownCrossTenant);

describe('Cross-tenant · models (registry-driven)', () => {
  it('covers every tenant-owned model', () => {
    // Guards against the registry silently emptying — a green suite that
    // asserts nothing is worse than a red one.
    expect(TENANT_MODELS.length).toBeGreaterThanOrEqual(14);
  });

  describe.each(TENANT_MODELS.map((e) => [e.name, e] as const))('%s', (name, entry) => {
    it('lists only its own school\'s rows', async () => {
      const rows = await asSchool(fx.a, () => entry.model.find({}).lean());
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => String(r.schoolId) === fx.a.schoolId)).toBe(true);
    });

    it('cannot read the other school\'s row by its real id', async () => {
      const found = await asSchool(fx.a, () =>
        entry.model.findOne({ _id: fx.b.ids[name] }).lean(),
      );
      expect(found).toBeNull();
    });

    it('cannot widen a query with a forged schoolId filter', async () => {
      const rows = await asSchool(fx.a, () =>
        entry.model.find({ schoolId: fx.b.schoolId }).lean(),
      );
      expect(rows.every((r) => String(r.schoolId) === fx.a.schoolId)).toBe(true);

      const counted = await asSchool(fx.a, () =>
        entry.model.countDocuments({ schoolId: fx.b.schoolId }),
      );
      expect(counted).toBe(await asSchool(fx.a, () => entry.model.countDocuments({})));
    });

    it('cannot update the other school\'s row', async () => {
      const res = await asSchool(fx.a, () =>
        entry.model.updateOne({ _id: fx.b.ids[name] }, { $set: entry.mutation }),
      );
      expect(res.matchedCount).toBe(0);

      // lean() on a heterogeneous registry model widens to a union; the
      // registry's own factories are typed, this read is not.
      const untouched = (await asSystem(() =>
        entry.model.findById(fx.b.ids[name]).lean(),
      )) as Record<string, unknown> | null;
      for (const [field, value] of Object.entries(entry.mutation)) {
        expect(String(untouched?.[field])).not.toBe(String(value));
      }
    });

    it('cannot delete the other school\'s row', async () => {
      const res = await asSchool(fx.a, () => entry.model.deleteOne({ _id: fx.b.ids[name] }));
      expect(res.deletedCount).toBe(0);
      expect(await asSystem(() => entry.model.findById(fx.b.ids[name]).lean())).not.toBeNull();
    });

    it('stamps its own schoolId on create, ignoring a forged one', async () => {
      const payload = await asSchool(fx.a, async () => entry.build(fx.a, '-forged'));
      const created = await asSchool(fx.a, () =>
        entry.model.create({ ...payload, schoolId: fx.b.schoolId }),
      );
      expect(String(created.schoolId)).toBe(fx.a.schoolId);
      await asSystem(() => entry.model.deleteOne({ _id: created._id }));
    });

    it('stamps schoolId on a create that omits it entirely', async () => {
      // The plugin's documented contract: a service inside a tenant context
      // should not have to pass schoolId by hand. If this fails with
      // "schoolId is required", the stamp is running after validation and the
      // contract is fiction — every service is silently carrying it instead.
      const payload = await asSchool(fx.a, async () => entry.build(fx.a, `-omit-${Date.now()}`));
      const created = await asSchool(fx.a, () => entry.model.create(payload));

      expect(String(created.schoolId)).toBe(fx.a.schoolId);
      await asSystem(() => entry.model.deleteOne({ _id: created._id }));
    });

    it('has no unique index that spans schools', async () => {
      /**
       * A bare `unique: true` builds a GLOBAL index. On a tenant collection
       * that lets one school's value block another's, and the resulting
       * E11000 tells the loser that somebody else holds it — an existence
       * oracle across a tenant boundary. Every unique index on a tenant model
       * must lead with schoolId.
       */
      // listIndexes() rather than raw driver access, which the project's own
      // ESLint rule blocks and which this suite exists partly to discourage.
      const indexes = (await asSystem(() => entry.model.listIndexes())) as {
        name: string;
        key: Record<string, number>;
        unique?: boolean;
      }[];

      const allowed = new Set((entry.allowedGlobalUniqueIndexes ?? []).map((a) => a.name));
      const offenders = indexes
        .filter((ix) => ix.unique && ix.name !== '_id_')
        .filter((ix) => !Object.keys(ix.key).includes('schoolId'))
        .map((ix) => ix.name)
        .filter((indexName) => !allowed.has(indexName));

      expect(offenders).toEqual([]);
    });

    it('lets a soft-deleted record\'s unique value be reused', async () => {
      /**
       * Deletes are soft, so the row survives and keeps occupying its unique
       * key unless the index excludes it. Without a partial filter, archiving
       * a session named "2025-2026" burns that name forever — likewise
       * admission numbers, employee numbers and subject codes, which are
       * exactly the identifiers schools expect to reissue.
       */
      if (entry.uniqueValueReuseNotApplicable) return;

      const seed = `-reuse-${Date.now()}`;
      const payload = await asSchool(fx.a, async () => entry.build(fx.a, seed));

      const first = await asSchool(fx.a, () => entry.model.create(payload));
      await asSchool(fx.a, () =>
        entry.model.updateOne({ _id: first._id }, { $set: { deletedAt: new Date() } }),
      );

      // The same values again: must be accepted now the original is archived.
      const second = await asSchool(fx.a, () => entry.model.create(payload));
      expect(String(second._id)).not.toBe(String(first._id));

      await asSystem(() => entry.model.deleteMany({ _id: { $in: [first._id, second._id] } }));
    });

    it('finds nothing for a guessed id that belongs to no one', async () => {
      expect(await asSchool(fx.a, () => entry.model.findById(unknownId()).lean())).toBeNull();
    });
  });
});

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
      const created = await asSchool(fx.a, () =>
        entry.model.create({ ...entry.build(fx.a, '-forged'), schoolId: fx.b.schoolId }),
      );
      expect(String(created.schoolId)).toBe(fx.a.schoolId);
      await asSystem(() => entry.model.deleteOne({ _id: created._id }));
    });

    it('finds nothing for a guessed id that belongs to no one', async () => {
      expect(await asSchool(fx.a, () => entry.model.findById(unknownId()).lean())).toBeNull();
    });
  });
});

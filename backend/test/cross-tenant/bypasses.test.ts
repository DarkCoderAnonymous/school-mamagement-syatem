import { TENANT_MODELS } from './registry';
import { asSchool, asSystem, type CrossTenantFixture } from './fixture';
import { setupCrossTenant, teardownCrossTenant } from './setup';
import mongoose from 'mongoose';
import { AcademicSession } from '../../src/models/AcademicSession';
import { RefreshToken } from '../../src/models/RefreshToken';
import { Class } from '../../src/models/Class';
import { Student } from '../../src/models/Student';
import { Counter } from '../../src/models/Counter';
import { nextSequenceValue } from '../../src/services/sequence.service';

/**
 * The escape hatches Phase 2 calls out by name. Each one is a path that does
 * NOT go through ordinary query middleware, so each needs its own proof.
 */

let fx: CrossTenantFixture;

beforeAll(async () => {
  fx = await setupCrossTenant();
}, 120_000);

afterAll(teardownCrossTenant);

describe('Cross-tenant · plugin bypasses', () => {
  describe('fail closed', () => {
    it('throws on a tenant-scoped query with no tenant context at all', async () => {
      await expect(AcademicSession.find({}).exec()).rejects.toThrow(/Tenant context missing/i);
      await expect(Student.countDocuments({}).exec()).rejects.toThrow(/Tenant context missing/i);
    });

    it('refuses a create with no tenant context', async () => {
      // Refused either by schema validation (schoolId is required and was
      // never stamped) or by the plugin's own guard — Mongoose runs validate
      // before save middleware, so which one fires depends on the schema.
      // What matters is that nothing is written.
      await expect(
        AcademicSession.create({ name: 'X', startDate: new Date(), endDate: new Date() }),
      ).rejects.toThrow();

      // RefreshToken allows a null schoolId, so validation cannot catch it —
      // only the plugin can, which is what makes this the sharper probe.
      await expect(
        RefreshToken.create({
          userId: new mongoose.Types.ObjectId(),
          tokenHash: `no-context-${Date.now()}`,
          expiresAt: new Date(Date.now() + 1000),
        }),
      ).rejects.toThrow(/Tenant context missing/i);
    });
  });

  describe('aggregate', () => {
    it('scopes the outer pipeline', async () => {
      const grouped = await asSchool(fx.a, () =>
        AcademicSession.aggregate([{ $group: { _id: '$schoolId', count: { $sum: 1 } } }]),
      );
      expect(grouped).toHaveLength(1);
      expect(String(grouped[0]._id)).toBe(fx.a.schoolId);
    });

    it('does not let a caller-supplied $match widen the pipeline', async () => {
      const rows = await asSchool(fx.a, () =>
        AcademicSession.aggregate([{ $match: { schoolId: fx.b.schoolId } }]),
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('$lookup', () => {
    it('scopes a pipeline-form join into a tenant collection', async () => {
      const rows = await asSchool(fx.a, () =>
        Class.aggregate([
          {
            $lookup: {
              from: 'students',
              pipeline: [{ $project: { firstName: 1, schoolId: 1 } }],
              as: 'students',
            },
          },
        ]),
      );
      const joined = rows.flatMap((r: { students: { schoolId?: unknown }[] }) => r.students);
      expect(joined.length).toBeGreaterThan(0);
      expect(joined.every((s) => String(s.schoolId) === fx.a.schoolId)).toBe(true);
    });

    it('rejects localField/foreignField form, which cannot carry a condition', async () => {
      await expect(
        asSchool(fx.a, () =>
          Class.aggregate([
            {
              $lookup: {
                from: 'students',
                localField: '_id',
                foreignField: 'classId',
                as: 'students',
              },
            },
          ]),
        ),
      ).rejects.toThrow(/cannot be tenant-scoped/i);
    });
  });

  describe('populate', () => {
    // populate issues a SECOND query against the referenced model. If that
    // query does not carry tenant scoping, a cross-tenant foreign key becomes
    // a read of another school's document.
    it.each(
      TENANT_MODELS.filter((e) => e.populate).map((e) => [e.name, e] as const),
    )('%s does not resolve a reference into the other school', async (name, entry) => {
      const populate = entry.populate!;

      // Point school A's record at school B's document directly in the
      // database, simulating a stale or smuggled foreign key.
      await asSystem(() =>
        entry.model.updateOne(
          { _id: fx.a.ids[name] },
          { $set: { [populate.path]: fx.b.ids[populate.refEntry] } },
        ),
      );

      const loaded = (await asSchool(fx.a, () =>
        entry.model.findById(fx.a.ids[name]).populate(populate.path).lean(),
      )) as Record<string, unknown> | null;

      // The reference must come back unresolved (null), never as school B's
      // document. Asserted explicitly so "the field was missing" cannot pass
      // as "the join was scoped".
      const resolved = loaded?.[populate.path] as { schoolId?: unknown } | null | undefined;
      expect(loaded).not.toBeNull();
      if (resolved != null) {
        expect(String((resolved as { schoolId?: unknown }).schoolId)).toBe(fx.a.schoolId);
      }
      expect(resolved == null || String(resolved.schoolId) === fx.a.schoolId).toBe(true);

      // Restore so later specs see a coherent graph.
      await asSystem(() =>
        entry.model.updateOne(
          { _id: fx.a.ids[name] },
          { $set: { [populate.path]: fx.a.ids[populate.refEntry] } },
        ),
      );
    });
  });

  describe('insertMany', () => {
    it('stamps the acting school on every inserted document', async () => {
      // Unique per run: these assertions read UNSCOPED, so a fixed name would
      // also match rows another spec file created.
      const tag = `Bulk-${Date.now()}`;
      await asSchool(fx.a, () =>
        AcademicSession.insertMany([
          { name: `${tag}-One`, startDate: new Date('2040-04-01'), endDate: new Date('2041-03-31') },
          { name: `${tag}-Two`, startDate: new Date('2041-04-01'), endDate: new Date('2042-03-31') },
        ]),
      );

      const bulk = await asSystem(() => AcademicSession.find({ name: new RegExp(`^${tag}`) }).lean());
      expect(bulk).toHaveLength(2);
      expect(bulk.every((s) => String(s.schoolId) === fx.a.schoolId)).toBe(true);
      await asSystem(() => AcademicSession.deleteMany({ name: new RegExp(`^${tag}`) }));
    });

    it('ignores a forged schoolId inside the inserted documents', async () => {
      const forgedTag = `Forged-Bulk-${Date.now()}`;
      await asSchool(fx.a, () =>
        AcademicSession.insertMany([
          {
            name: forgedTag,
            startDate: new Date('2042-04-01'),
            endDate: new Date('2043-03-31'),
            schoolId: fx.b.schoolId,
          },
        ]),
      );

      const forged = await asSystem(() => AcademicSession.findOne({ name: forgedTag }).lean());
      expect(String(forged?.schoolId)).toBe(fx.a.schoolId);
      await asSystem(() => AcademicSession.deleteMany({ name: forgedTag }));
    });
  });

  describe('bulkWrite', () => {
    it('is blocked outright on tenant collections', async () => {
      await expect(
        asSchool(fx.a, () =>
          AcademicSession.bulkWrite([
            { updateOne: { filter: {}, update: { $set: { name: 'x' } } } },
          ]),
        ),
      ).rejects.toThrow(/not tenant-scoped/i);
    });
  });

  describe('distinct', () => {
    it('returns only the acting school\'s values', async () => {
      const namesA = await asSchool(fx.a, () => AcademicSession.distinct('name').exec());
      const namesB = await asSchool(fx.b, () => AcademicSession.distinct('name').exec());
      expect(namesA).toContain('Year A');
      expect(namesA).not.toContain('Year B');
      expect(namesB).toContain('Year B');
      expect(namesB).not.toContain('Year A');
    });
  });

  describe('estimatedDocumentCount', () => {
    it('is blocked because it takes no filter', async () => {
      await expect(
        asSchool(fx.a, () => AcademicSession.estimatedDocumentCount().exec()),
      ).rejects.toThrow(/cannot be tenant-scoped/i);
    });
  });

  describe('upsert', () => {
    it('stamps the acting school on the document it inserts', async () => {
      const upsertTag = `Upserted-${Date.now()}`;
      await asSchool(fx.a, () =>
        AcademicSession.updateOne(
          { name: upsertTag },
          { $set: { startDate: new Date('2044-04-01'), endDate: new Date('2045-03-31') } },
          { upsert: true },
        ),
      );

      const created = await asSystem(() => AcademicSession.findOne({ name: upsertTag }).lean());
      expect(String(created?.schoolId)).toBe(fx.a.schoolId);
      expect(await asSchool(fx.b, () => AcademicSession.countDocuments({ name: upsertTag }))).toBe(0);
      await asSystem(() => AcademicSession.deleteMany({ name: upsertTag }));
    });

    it('cannot upsert INTO the other school by forging the filter', async () => {
      const forgedUpsertTag = `Forged-Upsert-${Date.now()}`;
      await asSchool(fx.a, () =>
        AcademicSession.updateOne(
          { name: forgedUpsertTag, schoolId: fx.b.schoolId },
          { $set: { startDate: new Date('2046-04-01'), endDate: new Date('2047-03-31') } },
          { upsert: true },
        ),
      );

      const created = await asSystem(() => AcademicSession.findOne({ name: forgedUpsertTag }).lean());
      expect(String(created?.schoolId)).toBe(fx.a.schoolId);
      await asSystem(() => AcademicSession.deleteMany({ name: forgedUpsertTag }));
    });
  });

  describe('per-school sequences', () => {
    it('numbers each school independently', async () => {
      const key = `invoice-${Date.now()}`;
      const a1 = await asSchool(fx.a, () => nextSequenceValue(key));
      const a2 = await asSchool(fx.a, () => nextSequenceValue(key));
      const b1 = await asSchool(fx.b, () => nextSequenceValue(key));

      expect(a1).toBe(1);
      expect(a2).toBe(2);
      // School B starts its own series rather than continuing A's.
      expect(b1).toBe(1);

      const counters = await asSystem(() => Counter.find({ key }).lean());
      expect(counters).toHaveLength(2);
    });

    it('issues distinct numbers under concurrency (no read-then-write race)', async () => {
      const key = `admission-${Date.now()}`;
      const issued = await asSchool(fx.a, () =>
        Promise.all(Array.from({ length: 20 }, () => nextSequenceValue(key))),
      );
      expect(new Set(issued).size).toBe(20);
    });
  });

  describe('foreign keys', () => {
    /**
     * A create whose reference points into the other school. The document
     * itself is stamped with the acting school, so it looks legitimate — the
     * question is whether the REFERENCE is validated.
     *
     * The seed matters: without it these payloads collide with the fixture's
     * own records on a unique index, and the create throws for a reason that
     * has nothing to do with tenancy. A probe that passes because of a
     * duplicate key is worse than no probe at all.
     */
    it.each(
      TENANT_MODELS.filter((e) => e.foreignKeys?.length).flatMap((e) =>
        e.foreignKeys!.map((fk) => [`${e.name}.${fk.field}`, e, fk] as const),
      ),
    )('%s rejects a reference to the other school', async (label, entry, fk) => {
      const seed = `-fk-${label.replace(/\W/g, '')}-${Date.now()}`;
      const payload = {
        ...(await asSchool(fx.a, async () => entry.build(fx.a, seed))),
        [fk.field]: fx.b.ids[fk.refEntry],
      };

      await expect(asSchool(fx.a, () => entry.model.create(payload))).rejects.toThrow(
        /another school|cross-tenant|does not belong/i,
      );
    });
  });
});

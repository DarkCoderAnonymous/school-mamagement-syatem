import type { Express } from 'express';
import { createApp } from '../../src/app';
import { connectDB, disconnectDB } from '../../src/db/connection';
import { ensureRbacSeeded } from '../../src/rbac/seedRbac';
import { SchoolMembership } from '../../src/models/SchoolMembership';
import { redis } from '../../src/config/redis';
import { mailerQueue } from '../../src/jobs/mailer.queue';
import { TENANT_MODELS } from './registry';
import { asSchool, asSystem, buildFixture, type CrossTenantFixture, type SchoolFixture } from './fixture';

/**
 * Shared bootstrap for every cross-tenant spec. Builds both schools and walks
 * the registry once per school, in declaration order, so a factory can depend
 * on ids created before it.
 */
export const app: Express = createApp();

export async function seedRegistryData(school: SchoolFixture): Promise<void> {
  for (const entry of TENANT_MODELS) {
    // The approval flow already made this school's membership; a second one
    // for the same user would violate the unique (userId, schoolId) index.
    if (entry.name === 'schoolMembership') {
      school.ids[entry.name] = school.membershipId;
      continue;
    }

    const created = await asSchool(school, async () =>
      entry.model.create({ ...(await entry.build(school, '')), schoolId: school.schoolId }),
    );
    school.ids[entry.name] = String(created._id);
  }
}

export async function setupCrossTenant(): Promise<CrossTenantFixture> {
  await connectDB();
  await ensureRbacSeeded();

  const fixture = await buildFixture(app);
  await seedRegistryData(fixture.a);
  await seedRegistryData(fixture.b);

  // Sanity: the fixture is worthless if the two schools didn't actually get
  // distinct data, and a silent factory failure would make every isolation
  // assertion below pass vacuously.
  const membershipCount = await asSystem(() => SchoolMembership.countDocuments({ deletedAt: null }));
  if (membershipCount < 2) throw new Error('Fixture failed: expected a membership per school');

  return fixture;
}

export async function teardownCrossTenant(): Promise<void> {
  await disconnectDB();
  await mailerQueue.close();
  redis.disconnect();
}

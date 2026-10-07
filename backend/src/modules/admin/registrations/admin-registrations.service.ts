import mongoose from 'mongoose';
import slugify from 'slugify';
import { DEFAULT_SCHOOL_CURRENCY, Role } from '@sms/shared';
import { SchoolRegistration } from '../../../models/SchoolRegistration';
import { School } from '../../../models/School';
import { Subscription } from '../../../models/Subscription';
import { RoleModel } from '../../../models/Role';
import { User } from '../../../models/User';
import { SchoolMembership } from '../../../models/SchoolMembership';
import { AppError } from '../../../utils/AppError';
import { buildPaginationMeta } from '../../../utils/response';
import { restrictSort, searchRegex } from '../../../utils/query';
import { parsePaginationQuery } from '../../../utils/paginate';
import { generateTempPassword, hashPassword } from '../../../utils/password';
import { recordAudit } from '../../../utils/audit';
import { enqueueMail } from '../../../jobs/mailer.queue';
import { ROLE_TEMPLATES, SCHOOL_DEFAULT_ROLES } from '../../../rbac/roleTemplates';

export interface ActorMeta {
  actorUserId: string;
  ip?: string;
}

export async function listRegistrations(query: Record<string, unknown>) {
  const { page, limit, skip, sort, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = {};
  if (typeof query.status === 'string') filter.status = query.status;
  if (search) {
    filter.$or = [{ schoolName: searchRegex(search) }, { email: searchRegex(search) }];
  }

  const [items, total] = await Promise.all([
    SchoolRegistration.find(filter).sort(restrictSort(sort, ['schoolName', 'email', 'status', 'createdAt', 'reviewedAt'], { createdAt: -1 })).skip(skip).limit(limit).lean(),
    SchoolRegistration.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getRegistrationById(id: string) {
  const registration = await SchoolRegistration.findById(id).lean();
  if (!registration) throw AppError.notFound('Registration not found');
  return registration;
}

export async function reviewRegistration(id: string, notes: string | undefined, actor: ActorMeta) {
  const registration = await SchoolRegistration.findById(id);
  if (!registration) throw AppError.notFound('Registration not found');
  if (registration.status !== 'PENDING') {
    throw AppError.conflict(`Cannot review a registration in status ${registration.status}`);
  }

  registration.status = 'UNDER_REVIEW';
  if (notes) registration.reviewNotes = notes;
  registration.reviewedBy = new mongoose.Types.ObjectId(actor.actorUserId);
  await registration.save();

  await recordAudit({
    actorUserId: actor.actorUserId,
    action: 'registration.review',
    entity: 'SchoolRegistration',
    entityId: registration._id,
    ip: actor.ip,
  });

  return registration;
}

async function generateUniqueSlug(schoolName: string, session: mongoose.ClientSession): Promise<string> {
  const base = slugify(schoolName, { lower: true, strict: true }) || 'school';
  let slug = base;
  let suffix = 1;
  // Sequential on purpose: each probe depends on the previous slug, and the
  // loop is bounded by realistic collision counts.
  while (await School.exists({ slug }).session(session)) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
}

/**
 * Atomically provisions a full school from an approved registration: School
 * → Subscription → default Roles → School Admin User → mark registration
 * APPROVED. Any failure rolls back everything — no half-created schools.
 * Requires MongoDB running as a replica set (see docker-compose.yml).
 */
export async function approveRegistration(id: string, actor: ActorMeta) {
  const session = await mongoose.startSession();
  // tempPassword is null when the admin already had an account — we must not
  // reset an existing person's password just because they opened a school.
  let result: { school: unknown; tempPassword: string | null; adminEmail: string } | undefined;

  try {
    await session.withTransaction(async () => {
      const registration = await SchoolRegistration.findById(id).session(session);
      if (!registration) throw AppError.notFound('Registration not found');
      if (!['PENDING', 'UNDER_REVIEW'].includes(registration.status)) {
        throw AppError.conflict(`Registration already ${registration.status.toLowerCase()}`);
      }

      const slug = await generateUniqueSlug(registration.schoolName, session);

      const [school] = await School.create(
        [
          {
            name: registration.schoolName,
            slug,
            contactEmail: registration.email,
            contactPhone: registration.phone,
            address: registration.address,
            // Chosen at registration; fixed from here, since relabelling a
            // currency later would silently change what every amount means.
            currency: registration.currency ?? DEFAULT_SCHOOL_CURRENCY,
            status: 'ACTIVE',
            registrationId: registration._id,
            createdBy: new mongoose.Types.ObjectId(actor.actorUserId),
          },
        ],
        { session },
      );
      if (!school) throw AppError.internal('Failed to create School');

      await Subscription.create(
        [
          {
            schoolId: school._id,
            planId: registration.requestedPlanId,
            status: 'TRIAL',
            startsAt: new Date(),
          },
        ],
        { session },
      );

      const roleDocs = await RoleModel.create(
        SCHOOL_DEFAULT_ROLES.map((name) => ({
          schoolId: school._id,
          name,
          isSystem: true,
          permissions: ROLE_TEMPLATES[name],
        })),
        { session, ordered: true },
      );
      const schoolAdminRole = roleDocs.find((r) => r.name === Role.SCHOOL_ADMIN);
      if (!schoolAdminRole) throw AppError.internal('Failed to seed SCHOOL_ADMIN role');

      const [firstName, ...rest] = registration.contactPerson.trim().split(/\s+/);

      /**
       * Identity is global now (ADR-001), so the person may already exist —
       * a head teacher opening a second school, or a parent who already has
       * an account elsewhere. Reuse the identity and add a membership rather
       * than failing on the unique email, which is the whole point of the
       * split.
       */
      let adminUser = await User.findOne({ email: registration.email.toLowerCase() }).session(session);
      let tempPassword: string | null = null;

      // A platform account belongs to no school by definition (ADR-001) —
      // the same rule provisionSchoolAccount enforces. Giving one a membership
      // would make its next login open that school instead of the console.
      if (adminUser && adminUser.platformRoleIds.length > 0) {
        throw AppError.conflict('This email address cannot be used for a school account', { field: 'email' });
      }

      if (!adminUser) {
        tempPassword = generateTempPassword();
        const [created] = await User.create(
          [
            {
              email: registration.email,
              passwordHash: await hashPassword(tempPassword),
              firstName: firstName || registration.contactPerson,
              lastName: rest.join(' ') || 'Admin',
              phone: registration.phone,
              status: 'ACTIVE',
              mustChangePassword: true,
            },
          ],
          { session },
        );
        if (!created) throw AppError.internal('Failed to create School Admin user');
        adminUser = created;
      }

      const [membership] = await SchoolMembership.create(
        [
          {
            schoolId: school._id,
            userId: adminUser._id,
            roleIds: [schoolAdminRole._id],
            status: 'ACTIVE',
          },
        ],
        { session },
      );
      if (!membership) throw AppError.internal('Failed to create School Admin membership');

      registration.status = 'APPROVED';
      registration.reviewedBy = new mongoose.Types.ObjectId(actor.actorUserId);
      registration.reviewedAt = new Date();
      registration.schoolId = school._id;
      await registration.save({ session });

      await recordAudit({
        schoolId: school._id,
        actorUserId: actor.actorUserId,
        action: 'registration.approve',
        entity: 'School',
        entityId: school._id,
        after: { schoolId: school._id, adminUserId: adminUser._id, membershipId: membership._id },
        ip: actor.ip,
        session,
      });

      result = { school, tempPassword, adminEmail: adminUser.email };
    });
  } finally {
    await session.endSession();
  }

  if (!result) throw AppError.internal('Approval transaction did not produce a result');

  await enqueueMail({
    to: result.adminEmail,
    subject: 'Your school has been approved',
    body: result.tempPassword
      ? `Your school is ready. Log in with email ${result.adminEmail} and temporary password ${result.tempPassword}. You will be asked to change it on first login.`
      : `Your school is ready. Sign in with your existing ${result.adminEmail} account — you will be asked which school to open.`,
  });

  return result;
}

export async function rejectRegistration(id: string, notes: string, actor: ActorMeta) {
  const registration = await SchoolRegistration.findById(id);
  if (!registration) throw AppError.notFound('Registration not found');
  if (!['PENDING', 'UNDER_REVIEW'].includes(registration.status)) {
    throw AppError.conflict(`Cannot reject a registration in status ${registration.status}`);
  }

  registration.status = 'REJECTED';
  registration.reviewNotes = notes;
  registration.reviewedBy = new mongoose.Types.ObjectId(actor.actorUserId);
  registration.reviewedAt = new Date();
  await registration.save();

  await recordAudit({
    actorUserId: actor.actorUserId,
    action: 'registration.reject',
    entity: 'SchoolRegistration',
    entityId: registration._id,
    ip: actor.ip,
  });

  await enqueueMail({
    to: registration.email,
    subject: 'Your school application was not approved',
    body: `Reason: ${notes}`,
  });

  return registration;
}

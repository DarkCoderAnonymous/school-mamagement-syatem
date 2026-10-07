import { DEFAULT_SCHOOL_CURRENCY, DEFAULT_SCHOOL_THEME, SCHOOL_THEMES } from '@sms/shared';
import { School } from '../../models/School';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { TenantContext } from '../../tenant/context';
import type { UpdateSchoolSettingsInput } from './school-settings.validation';

/**
 * The signed-in school's own settings. School is a platform collection (the
 * tenant plugin doesn't scope it), so every read and write here is pinned to
 * the caller's school id from the tenant context — never an id from the
 * request.
 */
function callerSchoolId(): string {
  const schoolId = TenantContext.getSchoolId();
  if (!schoolId) throw AppError.forbidden('No school context');
  return String(schoolId);
}

function toView(school: { name: string; theme?: string; currency?: string; primaryColor?: string }) {
  return {
    name: school.name,
    theme: school.theme || DEFAULT_SCHOOL_THEME,
    /** Chosen at registration and fixed — shown, not editable. */
    currency: school.currency || DEFAULT_SCHOOL_CURRENCY,
    primaryColor: school.primaryColor ?? null,
  };
}

export async function getSchoolSettings() {
  const school = await School.findById(callerSchoolId()).select('name theme currency primaryColor').lean();
  if (!school) throw AppError.notFound('School not found');
  return toView(school);
}

/**
 * Changes the school's accent palette. The avatar colour follows the palette's
 * swatch so the badge and the app agree. Everyone else picks it up the next
 * time their app loads the session (/auth/me on open or reload, or signing
 * in) — a token refresh carries no user, so it doesn't repaint mid-session.
 */
export async function updateSchoolSettings(input: UpdateSchoolSettingsInput, actor: ActorMeta) {
  const school = await School.findById(callerSchoolId());
  if (!school) throw AppError.notFound('School not found');
  const before = { theme: school.theme ?? DEFAULT_SCHOOL_THEME, primaryColor: school.primaryColor };
  const palette = SCHOOL_THEMES.find((t) => t.key === input.theme)!;
  if (before.theme === palette.key) return toView(school);

  school.theme = palette.key;
  school.primaryColor = palette.swatch;
  await school.save();
  await recordAudit({
    schoolId: school._id,
    actorUserId: actor.actorUserId,
    action: 'school.settings.update',
    entity: 'School',
    entityId: school._id,
    before,
    after: { theme: school.theme, primaryColor: school.primaryColor },
    ip: actor.ip,
  });
  return toView(school);
}

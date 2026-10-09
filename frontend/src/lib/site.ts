/**
 * Public identity of the marketing site, in one place so the header, page
 * titles, share cards and structured data can't drift apart.
 */

/** Product name in one place so a rename is a one-line change. */
export const PRODUCT_NAME = 'Principle';

/**
 * Canonical origin. The apex domain 308s to www, so www is the address search
 * engines should credit. Overridable for preview deployments.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.principle.today';

export const SITE_TITLE = `${PRODUCT_NAME} – School Management Software`;

/** 140–160 characters: the length search results show without truncating. */
export const SITE_DESCRIPTION =
  'Principle runs admissions, attendance, fees, exams and payroll from one workspace: a web console for school staff and a mobile app for parents and students.';

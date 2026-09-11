/**
 * A person's relationship to one school (ADR-001).
 *
 * Identity (`User`) is global and holds the credential; tenancy lives here,
 * one row per (person, school). A teacher at two schools is one User with two
 * memberships and potentially different roles at each.
 */
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

/**
 * What the client needs to render a school picker or switcher. Deliberately
 * not the whole membership: no role ids, no domain links, nothing that would
 * leak another school's internals to a person who merely has an account there.
 */
export interface MembershipSummary {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolPrimaryColor: string | null;
  /** Role names at THIS school. */
  roles: string[];
  status: MembershipStatus;
}

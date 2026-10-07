/**
 * Shape of the JWT access-token payload.
 *
 * Roles/permissions are denormalized into the token (rather than looked up
 * per-request) for speed. The staleness that buys is bounded two ways: the
 * short access TTL (15m default), and `permissionsEpoch` (ADR-005), which is
 * compared against the live value on every request so a role change takes
 * effect on the next call rather than at the next expiry.
 */
export interface AccessTokenPayload {
  sub: string; // User._id — the person
  /** SchoolMembership._id this token acts through. Null for a platform SUPER_ADMIN. */
  membershipId: string | null;
  schoolId: string | null;
  isSuperAdmin: boolean;
  roles: string[]; // Role names for this membership, e.g. ["SCHOOL_ADMIN"]
  permissions: string[]; // union of this membership's roles' permission codes
  /** Value of SchoolMembership.permissionsEpoch when this token was minted. */
  permissionsEpoch: number;
  /**
   * The account still has its temporary password: `authenticate` allows only
   * the /auth self-service routes. Cleared by changing the password, which
   * also ends every session — so no live token outlasts the flag. Optional so
   * tokens minted before this claim existed stay valid.
   */
  mustChangePassword?: boolean;
  /** Set by jsonwebtoken; compared against User.sessionsValidFrom. */
  iat?: number;
}

/**
 * Short-lived proof that a password was just verified, handed to a user who
 * has several memberships so they can choose one (ADR-001). It carries no
 * authority of its own: /auth/select-school accepts it only to identify WHO
 * is choosing, and re-checks the membership before issuing real tokens.
 */
export interface SelectionTokenPayload {
  sub: string;
  purpose: 'select-school';
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string; // RefreshToken._id, used to look up + rotate the stored hash
}

/**
 * Shape of the JWT access-token payload. Roles/permissions are denormalized
 * into the token (rather than looked up per-request) for speed; the access
 * token's short TTL (15m default, see config/env.ts) bounds how stale that
 * snapshot can get if a role's permissions change mid-session.
 */
export interface AccessTokenPayload {
  sub: string; // User._id
  schoolId: string | null;
  isSuperAdmin: boolean;
  roles: string[]; // Role names, e.g. ["SCHOOL_ADMIN"]
  permissions: string[]; // union of this user's roles' permission codes
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string; // RefreshToken._id, used to look up + rotate the stored hash
}

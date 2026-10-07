import type { Request } from 'express';

/** Who is doing a write, for audit rows. Built by controllers; services never see `req`. */
export interface ActorMeta {
  actorUserId: string;
  schoolId: string | null;
  ip?: string;
}

export function actorFrom(req: Request): ActorMeta {
  return {
    actorUserId: req.user!.sub,
    schoolId: req.user!.schoolId,
    ip: req.ip,
  };
}

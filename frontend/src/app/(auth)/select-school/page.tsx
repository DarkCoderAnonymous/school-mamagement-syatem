'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Building2, ChevronRight, Loader2 } from 'lucide-react';
import { Role } from '@sms/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthHeading } from '@/components/public/auth-shell';
import { stagger } from '@/lib/motion';
import { selectSchool } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { useAuthStore } from '@/lib/auth-store';

/**
 * The school picker for a person who belongs to more than one school —
 * a teacher employed at two, or a parent with children at two (ADR-001).
 *
 * Reached only from a login that returned `kind: 'select-school'`. The
 * selection token in the store is the only thing that makes this page usable,
 * and it expires in five minutes, so a direct visit sends the user back to
 * sign in rather than showing an empty list.
 */
export default function SelectSchoolPage() {
  const router = useRouter();
  const pending = useAuthStore((s) => s.pendingSelection);
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Choosing a school clears `pending` too (setSession) — that's success, not
  // a stale visit, so it must not bounce to /login. It used to, and since this
  // effect runs after `choose` navigated, its /login replace won: picking a
  // school landed the person back on sign-in.
  useEffect(() => {
    if (!pending && !signedIn) router.replace('/login');
  }, [pending, signedIn, router]);

  if (!pending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }

  const choose = async (schoolId: string) => {
    setError(null);
    setSubmitting(schoolId);
    try {
      const { user, accessToken } = await selectSchool(pending.selectionToken, schoolId);
      useAuthStore.getState().setSession(user, accessToken);

      if (user.mustChangePassword) router.replace('/change-password');
      else if (user.roles.includes(Role.SUPER_ADMIN)) router.replace('/admin');
      else router.replace('/app');
    } catch (err) {
      // The commonest failure here is a token that sat too long on the picker.
      const message =
        err instanceof ApiRequestError
          ? err.code === 'UNAUTHORIZED'
            ? 'That took too long — sign in again.'
            : err.message
          : 'Something went wrong. Try again.';
      setError(message);
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-8">
      <AuthHeading
        title="Choose a school"
        description="Your account has access to more than one school. Pick where you want to work — you can switch at any time."
      />

      {error && (
        <Alert variant="destructive" className="animate-shake">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Couldn&apos;t open that school</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {pending.memberships.map((membership, i) => (
          <li key={membership.membershipId} className="animate-fade-up" style={stagger(i, 60, 150)}>
            <button
              type="button"
              onClick={() => void choose(membership.schoolId)}
              disabled={submitting !== null}
              aria-busy={submitting === membership.schoolId}
              className="group hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring/50 flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Avatar
                className="size-10 shrink-0 rounded-lg after:rounded-lg"
                style={{ backgroundColor: membership.schoolPrimaryColor ?? undefined }}
              >
                {membership.schoolLogoUrl && (
                  <AvatarImage src={membership.schoolLogoUrl} alt="" className="rounded-lg" />
                )}
                <AvatarFallback className="rounded-lg text-sm font-medium">
                  {membership.schoolName?.[0] ?? <Building2 className="size-4" />}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{membership.schoolName}</p>
                {/* The role often differs per school — it's how someone tells
                    "where I teach" from "where I'm a parent". */}
                <p className="text-muted-foreground truncate text-xs capitalize">
                  {membership.roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ')}
                </p>
              </div>

              {submitting === membership.schoolId ? (
                <Loader2
                  className="text-muted-foreground size-4 shrink-0 animate-spin"
                  aria-label="Opening"
                />
              ) : (
                <ChevronRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost"
        className="text-muted-foreground h-10 w-full"
        onClick={() => {
          useAuthStore.getState().clear();
          router.replace('/login');
        }}
      >
        Sign in as someone else
      </Button>
    </div>
  );
}

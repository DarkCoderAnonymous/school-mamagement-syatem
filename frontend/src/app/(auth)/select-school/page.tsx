'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronRight } from 'lucide-react';
import { Role } from '@sms/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) router.replace('/login');
  }, [pending, router]);

  if (!pending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
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
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Choose a school</h1>
        <p className="text-muted-foreground text-sm">
          Your account has access to more than one school. Pick the one you want to work in — you can switch
          at any time.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t open that school</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ul className="divide-y rounded-lg border">
        {pending.memberships.map((membership) => (
          <li key={membership.membershipId}>
            <button
              type="button"
              onClick={() => void choose(membership.schoolId)}
              disabled={submitting !== null}
              className="hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-3 p-4 text-left transition-colors outline-none focus-visible:ring-2 disabled:opacity-60"
            >
              <Avatar
                className="size-9 shrink-0"
                style={{ backgroundColor: membership.schoolPrimaryColor ?? undefined }}
              >
                {membership.schoolLogoUrl && <AvatarImage src={membership.schoolLogoUrl} alt="" />}
                <AvatarFallback className="text-xs">
                  {membership.schoolName?.[0] ?? <Building2 className="size-4" />}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{membership.schoolName}</p>
                {/* The role often differs per school — it's how someone tells
                    "where I teach" from "where I'm a parent". */}
                <p className="text-muted-foreground truncate text-xs">
                  {membership.roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ')}
                </p>
              </div>

              {submitting === membership.schoolId ? (
                <span className="text-muted-foreground text-xs">Opening…</span>
              ) : (
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              )}
            </button>
          </li>
        ))}
      </ul>

      <Button
        variant="ghost"
        className="w-full"
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

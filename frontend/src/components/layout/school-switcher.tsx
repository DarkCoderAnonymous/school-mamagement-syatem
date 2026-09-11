'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { switchSchool } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Moves the session to another of the user's schools (ADR-001).
 *
 * Renders nothing for the common case of a single membership — most staff
 * belong to one school and should not be shown a control that does nothing.
 *
 * Switching re-issues the token pair, so every cached query belongs to the
 * previous school and must be discarded; leaving them would show one school's
 * numbers under another school's name for as long as the cache lives.
 */
export function SchoolSwitcher({ collapsed }: { collapsed?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [switching, setSwitching] = useState(false);

  const memberships = user?.memberships ?? [];
  if (memberships.length < 2) return null;

  const onSelect = async (schoolId: string) => {
    if (schoolId === user?.schoolId || switching) return;
    setSwitching(true);
    try {
      const session = await switchSchool(schoolId);
      useAuthStore.getState().setSession(session.user, session.accessToken);
      queryClient.clear();
      toast.success(`Switched to ${session.user.schoolName}`);
      router.replace('/app');
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError ? err.message : "Couldn't switch schools. Try again.",
      );
    } finally {
      setSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors outline-none focus-visible:ring-2"
        aria-label="Switch school"
        disabled={switching}
      >
        <Avatar className="size-6 shrink-0" style={{ backgroundColor: user?.schoolPrimaryColor ?? undefined }}>
          {user?.schoolLogoUrl && <AvatarImage src={user.schoolLogoUrl} alt="" />}
          <AvatarFallback className="text-[0.625rem]">{user?.schoolName?.[0] ?? 'S'}</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{user?.schoolName}</span>
            <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your schools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((membership) => {
          const active = membership.schoolId === user?.schoolId;
          return (
            <DropdownMenuItem
              key={membership.membershipId}
              onClick={() => void onSelect(membership.schoolId)}
              disabled={switching}
            >
              <Avatar
                className="size-5 shrink-0"
                style={{ backgroundColor: membership.schoolPrimaryColor ?? undefined }}
              >
                {membership.schoolLogoUrl && <AvatarImage src={membership.schoolLogoUrl} alt="" />}
                <AvatarFallback className="text-[0.5rem]">{membership.schoolName?.[0]}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{membership.schoolName}</span>
              {active && <Check className="size-3.5 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

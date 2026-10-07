'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Lock, Palette } from 'lucide-react';
import { DEFAULT_SCHOOL_THEME, Permission, SCHOOL_CURRENCIES, SCHOOL_THEMES } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { setDocumentPalette } from '@/components/school/school-palette';
import { useAuthStore } from '@/lib/auth-store';
import { usePermission } from '@/lib/permissions';
import { errorMessage } from '@/lib/form-errors';
import { cn } from '@/lib/utils';
import { getSchoolSettings, updateSchoolSettings } from '@/lib/api/school';

/**
 * The school's own settings. Today: its accent palette (school admin), and
 * the currency it registered with (fixed, shown for reference). Picking a
 * palette previews it across the whole app until you save or leave.
 */
export default function SchoolSettingsPage() {
  const can = usePermission();
  const canEdit = can(Permission.SCHOOL_UPDATE);
  const savedTheme = useAuthStore((s) => s.user?.schoolTheme) ?? DEFAULT_SCHOOL_THEME;
  const settings = useQuery({ queryKey: ['school-settings'], queryFn: getSchoolSettings });
  const [picked, setPicked] = useState<string>();
  const selected = picked ?? settings.data?.theme ?? savedTheme;
  const dirty = picked !== undefined && picked !== (settings.data?.theme ?? savedTheme);

  // Preview the pick across the app; leaving the page puts the saved one back.
  useEffect(() => {
    setDocumentPalette(selected);
  }, [selected]);
  useEffect(() => () => setDocumentPalette(useAuthStore.getState().user?.schoolTheme), []);

  const save = useMutation({
    mutationFn: (theme: string) => updateSchoolSettings({ theme }),
    onSuccess: (next) => {
      // The shell repaints from the session, so update it rather than waiting for a reload.
      useAuthStore.setState((s) => ({
        user: s.user && { ...s.user, schoolTheme: next.theme, schoolPrimaryColor: next.primaryColor },
      }));
      void settings.refetch();
      setPicked(undefined);
      toast.success(`${SCHOOL_THEMES.find((t) => t.key === next.theme)?.name ?? 'New'} palette saved`, {
        description: 'Everyone in your school sees it the next time they open the app.',
      });
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the palette")),
  });

  const currency = SCHOOL_CURRENCIES.find((c) => c.code === settings.data?.currency);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School settings"
        description={settings.data ? `How ${settings.data.name} looks and works for everyone in it.` : undefined}
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'School settings' }]}
      />

      {settings.isError ? (
        <Card>
          <ErrorState error={settings.error} onRetry={() => void settings.refetch()} title="Couldn't load your school's settings" />
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Palette className="text-muted-foreground size-4" aria-hidden="true" />
                    Theme colours
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    The accent used for buttons, links and the sidebar, on the web and the mobile app. Status colours (paid,
                    overdue, absent) never change, so they always mean the same thing.
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    {dirty && (
                      <Button variant="ghost" onClick={() => setPicked(undefined)} disabled={save.isPending}>
                        Cancel
                      </Button>
                    )}
                    <Button onClick={() => save.mutate(selected)} disabled={!dirty || save.isPending}>
                      {save.isPending ? 'Saving…' : 'Save palette'}
                    </Button>
                  </div>
                )}
              </div>

              {!canEdit && (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Lock className="size-4 shrink-0" aria-hidden="true" />
                  Only someone who can change school settings (your school admin) can pick the palette.
                </p>
              )}

              {settings.isLoading ? (
                <Skeleton className="h-64 w-full rounded-xl" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Theme colours">
                  {SCHOOL_THEMES.map((t) => {
                    const on = selected === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={!canEdit || save.isPending}
                        onClick={() => setPicked(t.key)}
                        // The card carries its own palette, so its preview shows that palette whatever the page is in.
                        data-palette={t.key}
                        className={cn(
                          'bg-card focus-visible:ring-ring/50 group flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed',
                          on ? 'border-primary ring-primary/30 ring-2' : 'hover:border-foreground/20',
                          !canEdit && !on && 'opacity-70',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2.5">
                            <span className="size-6 rounded-full border shadow-xs" style={{ backgroundColor: t.swatch }} aria-hidden="true" />
                            <span className="font-medium">{t.name}</span>
                            {t.key === DEFAULT_SCHOOL_THEME && <span className="text-muted-foreground text-xs">default</span>}
                          </span>
                          {on && <Check className="text-primary size-4" aria-hidden="true" />}
                        </span>
                        {/* A miniature of the app in this palette: a primary button, an accent chip and a link. */}
                        <span className="flex items-center gap-2" aria-hidden="true">
                          <span className="bg-primary text-primary-foreground rounded-md px-2.5 py-1 text-xs font-medium">Save</span>
                          <span className="bg-accent text-accent-foreground rounded-md px-2 py-1 text-xs">Active</span>
                          <span className="text-primary text-xs font-medium underline-offset-2 group-hover:underline">View all</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {dirty && (
                <p className="text-muted-foreground text-xs" aria-live="polite">
                  Previewing {SCHOOL_THEMES.find((t) => t.key === selected)?.name} — save to keep it, or leave the page to go back.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-6">
              <h2 className="font-semibold">Currency</h2>
              <div className="text-sm">
                {settings.isLoading ? <Skeleton className="h-5 w-40" /> : currency ? `${currency.code} — ${currency.name}` : settings.data?.currency}
              </div>
              <p className="text-muted-foreground text-xs">
                Chosen when the school registered. It can’t be changed, because every fee, salary and receipt already recorded is in it.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

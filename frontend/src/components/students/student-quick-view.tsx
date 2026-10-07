'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Phone } from 'lucide-react';
import { Permission } from '@sms/shared';
import { buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge, humanizeStatus } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermission } from '@/lib/permissions';
import { fullName } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getStudent } from '@/lib/api/school';
import {
  StudentRecordPanel,
  useRecordTabs,
  type RecordFilters,
  type RecordTab,
} from './student-records';

const STATUS_TONE = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'DISABLED',
  GRADUATED: 'VERIFIED',
  TRANSFERRED: 'EXPIRED',
} as const;

interface QuickViewContext {
  open: (studentId: string, tab?: RecordTab, filters?: RecordFilters) => void;
}
const Ctx = createContext<QuickViewContext | null>(null);

/**
 * One side panel for the whole school console: click any student's name —
 * on a register, a marks sheet, a result list, an invoice — and their
 * attendance, fees, exam and test records open beside the page, so a
 * half-marked register or unsaved marks aren't lost by navigating away.
 */
export function StudentQuickViewProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<{
    studentId: string;
    tab?: RecordTab;
    filters?: RecordFilters;
  } | null>(null);
  const open = useCallback(
    (studentId: string, tab?: RecordTab, filters?: RecordFilters) =>
      setTarget({ studentId, tab, filters }),
    [],
  );
  const value = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Sheet open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-2xl"
        >
          {target && (
            <QuickView
              key={target.studentId}
              studentId={target.studentId}
              initialTab={target.tab}
              initialFilters={target.filters}
            />
          )}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}

function QuickView({
  studentId,
  initialTab,
  initialFilters,
}: {
  studentId: string;
  initialTab?: RecordTab;
  initialFilters?: RecordFilters;
}) {
  const tabs = useRecordTabs();
  const [tab, setTab] = useState<RecordTab | undefined>(() =>
    tabs.some((t) => t.value === initialTab) ? initialTab : tabs[0]?.value,
  );
  const [filters, setFilters] = useState<RecordFilters>(() =>
    tab === initialTab ? (initialFilters ?? {}) : {},
  );
  const query = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => getStudent(studentId),
  });
  const s = query.data;
  const primary = s?.guardians.find((g) => g.isPrimary)?.guardianId ?? s?.guardians[0]?.guardianId;

  return (
    <>
      <SheetHeader className="bg-popover sticky top-0 z-10 gap-3 border-b p-5 pr-12">
        {s ? (
          <>
            <div className="space-y-1">
              <SheetTitle className="text-lg">{fullName(s)}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {s.classId?.name ?? 'No class'}
                  {s.sectionId ? ` · Section ${s.sectionId.name}` : ''}
                  {s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}
                </span>
                <span className="font-mono text-xs">{s.admissionNumber}</span>
                <StatusBadge status={STATUS_TONE[s.status]} label={humanizeStatus(s.status)} />
              </SheetDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/app/students/${s._id}${tab ? `?tab=${tab}` : ''}`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Open full profile
              </Link>
              {primary && (
                <a
                  href={`tel:${primary.phone}`}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'tabular-nums')}
                >
                  <Phone className="size-3.5" aria-hidden="true" />
                  {fullName(primary)} · {primary.phone}
                </a>
              )}
            </div>
            {tabs.length > 1 && tab && (
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setTab(v as RecordTab);
                  setFilters({});
                }}
              >
                <TabsList className="h-9 max-w-full justify-start overflow-x-auto">
                  {tabs.map((t) => (
                    <TabsTrigger key={t.value} value={t.value} className="px-3">
                      <t.icon aria-hidden="true" />
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </>
        ) : query.isError ? (
          <SheetTitle>Student</SheetTitle>
        ) : (
          <>
            <SheetTitle className="sr-only">Loading student</SheetTitle>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </>
        )}
      </SheetHeader>
      <div className="p-5">
        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            title="Couldn't load this student"
          />
        ) : !tab ? (
          <p className="text-muted-foreground text-sm">
            Your role can see this student&apos;s profile only.
          </p>
        ) : (
          s && (
            <StudentRecordPanel
              studentId={studentId}
              tab={tab}
              filters={filters}
              onFiltersChange={(next) =>
                setFilters((f) => {
                  const merged: Record<string, unknown> = { ...f, ...next };
                  for (const k of Object.keys(merged)) if (merged[k] === null) delete merged[k];
                  return merged as RecordFilters;
                })
              }
            />
          )
        )}
      </div>
    </>
  );
}

/**
 * A student's name that opens their records. A plain click opens the quick
 * view beside the page; ctrl/cmd-click or middle-click opens the full profile
 * in a new tab, as a link should. Without `student.read` it's just the name.
 */
export function StudentLink({
  studentId,
  tab,
  filters,
  children,
  className,
}: {
  studentId: string | null | undefined;
  /** Which record to open on — attendance from a register, exams from a marks sheet. */
  tab?: RecordTab;
  /** Where to start within it — e.g. the month of the register it was opened from. */
  filters?: RecordFilters;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  const can = usePermission();
  if (!studentId || !can(Permission.STUDENT_READ))
    return <span className={className}>{children}</span>;

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!ctx || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.open(studentId, tab, filters);
  };

  return (
    <Link
      href={`/app/students/${studentId}${tab ? `?tab=${tab}` : ''}`}
      onClick={onClick}
      className={cn(
        'hover:text-primary decoration-primary/40 underline-offset-4 hover:underline focus-visible:underline',
        className,
      )}
    >
      {children}
    </Link>
  );
}

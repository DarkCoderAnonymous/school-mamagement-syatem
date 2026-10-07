'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, GraduationCap, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { NativeSelect } from '@/components/form/native-select';
import { useUrlState } from '@/hooks/use-url-state';
import { cn } from '@/lib/utils';
import { getMarksBoard, listExams } from '@/lib/api/exams';
import type { MarksBoardClass } from '@/lib/api/types';

/**
 * Marks entry by class: pick the exam, then a grade card. Each card shows the
 * class's sections, strength and how many of its marks are in; opening one
 * lists its students with their totals, to enter a student's subjects at once.
 */
export function ClassBoard() {
  const url = useUrlState();
  const exams = useQuery({ queryKey: ['exams', 'options'], queryFn: () => listExams({ limit: 100 }), staleTime: 60_000 });
  // Default to the latest exam still taking marks, else the latest one.
  const fallback = exams.data?.items.find((e) => e.status !== 'PUBLISHED' && e.status !== 'SETUP') ?? exams.data?.items[0];
  const examId = url.get('examId') ?? fallback?._id;
  const board = useQuery({ queryKey: ['marks-board', examId], queryFn: () => getMarksBoard(examId!), enabled: Boolean(examId) });

  if (exams.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!exams.data?.items.length) {
    return (
      <div className="bg-card rounded-xl border">
        <EmptyState icon={GraduationCap} title="No exams this session" description="Create an exam and its date sheet on the Exams page first." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <NativeSelect aria-label="Exam" value={examId ?? ''} onChange={(e) => url.set({ examId: e.target.value })}>
          {exams.data.items.map((e) => (
            <option key={e._id} value={e._id}>
              {e.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {board.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}
      {board.isError && (
        <div className="rounded-xl border">
          <ErrorState error={board.error} onRetry={() => void board.refetch()} title="Couldn't load the classes" />
        </div>
      )}
      {board.data && board.data.classes.length === 0 && (
        <div className="bg-card rounded-xl border">
          <EmptyState icon={GraduationCap} title="No classes this session" description="Add classes on the Classes page." />
        </div>
      )}
      {board.data && board.data.classes.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {board.data.classes.map((c, i) => (
            <li key={c._id} className="animate-fade-up" style={{ ['--delay' as string]: `${Math.min(i, 12) * 30}ms` }}>
              <ClassCard examId={board.data.exam._id} cls={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClassCard({ examId, cls }: { examId: string; cls: MarksBoardClass }) {
  const pct = cls.marksExpected ? cls.marksEntered / cls.marksExpected : 0;
  const published = (cls.statusCounts.PUBLISHED ?? 0) > 0 && cls.statusCounts.PUBLISHED === cls.papers;
  const status = cls.papers === 0 ? 'No date sheet' : published ? 'Published' : pct >= 1 ? 'All marks in' : cls.marksEntered === 0 ? 'Not started' : `${Math.round(pct * 100)}% entered`;

  return (
    <Link
      href={`/app/marks/board/${examId}/${cls._id}`}
      className="bg-card hover:border-primary/50 focus-visible:ring-ring/50 group flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold">{cls.name}</p>
          <p className="text-muted-foreground text-xs">
            {cls.sections.length ? `Sections ${cls.sections.map((s) => s.name).join(', ')}` : 'No sections'}
          </p>
        </div>
        <ChevronRight className="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-colors" aria-hidden="true" />
      </div>
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" aria-hidden="true" />
          {cls.students} students
        </span>
        <span>
          {cls.papers} subject{cls.papers === 1 ? '' : 's'}
          {cls.papers > 0 && ` · ${cls.totalMax} marks`}
        </span>
      </div>
      <div className="mt-auto space-y-1.5">
        <span className="bg-muted block h-1.5 overflow-hidden rounded-full" aria-hidden="true">
          <span className={cn('block h-full origin-left', pct >= 1 ? 'bg-success' : 'bg-primary')} style={{ transform: `scaleX(${pct})` }} />
        </span>
        <p className={cn('text-xs', cls.papers === 0 ? 'text-muted-foreground' : 'font-medium')}>
          {status}
          {cls.papers > 0 && !published && (
            <span className="text-muted-foreground font-normal tabular-nums">
              {' '}
              · {cls.marksEntered}/{cls.marksExpected}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}

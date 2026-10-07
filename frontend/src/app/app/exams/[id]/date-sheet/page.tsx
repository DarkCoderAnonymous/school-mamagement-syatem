'use client';

import { Suspense, use, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { NativeSelect } from '@/components/form/native-select';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { clockTime, sheetDate, weekday } from '@/lib/date-sheet';
import { getExam } from '@/lib/api/exams';
import type { ExamDetail, ExamPaper } from '@/lib/api/types';

type ClassSheet = { classId: string; className: string; order: number; papers: ExamPaper[] };

function byClass(exam: ExamDetail): ClassSheet[] {
  const map = new Map<string, ClassSheet>();
  for (const p of exam.papers) {
    const key = p.classId?._id ?? 'none';
    const g = map.get(key) ?? { classId: key, className: p.classId?.name ?? 'Class', order: p.classId?.order ?? 0, papers: [] };
    g.papers.push(p);
    map.set(key, g);
  }
  return [...map.values()]
    .sort((a, b) => a.order - b.order || a.className.localeCompare(b.className))
    .map((g) => ({
      ...g,
      // Scheduled papers in date and time order; any not yet dated go last.
      papers: g.papers.sort(
        (a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.startTime ?? '').localeCompare(b.startTime ?? '') || (a.subjectId?.name ?? '').localeCompare(b.subjectId?.name ?? ''),
      ),
    }));
}

/**
 * The printed date sheet: one sheet per class ("Date Sheet — Grade 1") with
 * each paper's date, day, subject, time and marks — the notice a school
 * sends home. Browser print stands in for PDF; each class starts a new page.
 */
function DateSheets({ id }: { id: string }) {
  const url = useUrlState();
  const fmt = useSchoolFormat();
  const classId = url.get('classId');
  const query = useQuery({ queryKey: ['exams', id], queryFn: () => getExam(id) });
  const all = useMemo(() => (query.data ? byClass(query.data) : []), [query.data]);
  const sheets = classId ? all.filter((s) => s.classId === classId) : all;

  if (query.isLoading) return <Skeleton className="mx-auto h-[36rem] max-w-3xl rounded-xl" />;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load the date sheet" />
      </div>
    );
  }
  const exam = query.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-4 print:hidden">
        <PageHeader
          title="Date sheet"
          description={`${exam.name} · ${sheets.length} class${sheets.length === 1 ? '' : 'es'}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/app' },
            { label: 'Exams', href: '/app/exams' },
            { label: exam.name, href: `/app/exams/${exam._id}` },
            { label: 'Date sheet' },
          ]}
          action={
            <Button onClick={() => window.print()} disabled={sheets.length === 0}>
              <Printer className="size-4" />
              Print
            </Button>
          }
        />
        <div className="max-w-xs">
          <NativeSelect aria-label="Class" value={classId ?? ''} onChange={(e) => url.set({ classId: e.target.value || undefined })}>
            <option value="">All classes (one page each)</option>
            {all.map((s) => (
              <option key={s.classId} value={s.classId}>
                {s.className}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {sheets.length === 0 ? (
        <div className="bg-card rounded-xl border">
          <EmptyState title="No date sheet yet" description="Make a class's date sheet from the exam page first." />
        </div>
      ) : (
        sheets.map((s, i) => (
          <article
            key={s.classId}
            className={`bg-card rounded-xl border p-8 print:rounded-none print:border-0 print:p-0 ${i < sheets.length - 1 ? 'break-after-page' : ''}`}
          >
            <header className="mb-6 border-b-2 border-current pb-4 text-center">
              <p className="text-xl font-bold tracking-wide uppercase">{fmt.schoolName ?? 'School'}</p>
              <p className="mt-1 text-base font-semibold">{exam.name}</p>
              {exam.academicSessionId?.name && <p className="text-muted-foreground text-sm">Session {exam.academicSessionId.name}</p>}
              <p className="mt-3 inline-block rounded-md border-2 border-current px-4 py-1 text-lg font-bold">Date Sheet — {s.className}</p>
            </header>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60 print:bg-transparent">
                  {['Sr.', 'Date', 'Day', 'Subject', 'Time', 'Total marks'].map((h) => (
                    <th key={h} className="border px-3 py-2 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.papers.map((p, n) => (
                  <tr key={p._id}>
                    <td className="border px-3 py-2 tabular-nums">{n + 1}</td>
                    <td className="border px-3 py-2 whitespace-nowrap tabular-nums">{p.date ? sheetDate(p.date) : 'To be announced'}</td>
                    <td className="border px-3 py-2">{weekday(p.date)}</td>
                    <td className="border px-3 py-2 font-medium">{p.subjectId?.name}</td>
                    <td className="border px-3 py-2 whitespace-nowrap tabular-nums">
                      {clockTime(p.startTime)}
                      {p.startTime && p.durationMinutes ? ` (${p.durationMinutes} min)` : ''}
                    </td>
                    <td className="border px-3 py-2 tabular-nums">{p.maxMarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <footer className="mt-20 grid grid-cols-2 gap-16 text-center text-sm">
              <p className="border-t border-current pt-1">Controller of Examinations</p>
              <p className="border-t border-current pt-1">Principal</p>
            </footer>
          </article>
        ))
      )}
    </div>
  );
}

export default function DateSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <DateSheets id={id} />
    </Suspense>
  );
}

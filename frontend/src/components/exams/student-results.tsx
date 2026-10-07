'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Award, ChevronRight } from 'lucide-react';
import { ToggleChip } from '@/components/form/toggle-chip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { useSchoolFormat } from '@/lib/format';
import { ordinal, pctLabel } from '@/lib/labels';
import { listResults } from '@/lib/api/exams';

export type ResultsKind = 'exam' | 'test';
export type Outcome = 'PASS' | 'FAIL';

/** Term exams vs class tests, by the exam's type. */
const TYPES: Record<ResultsKind, string> = { exam: 'MIDTERM,FINAL,OTHER', test: 'UNIT_TEST,MOCK' };
const WORD: Record<ResultsKind, { one: string; many: string; title: string }> = {
  exam: { one: 'exam', many: 'exams', title: 'Exam results' },
  test: { one: 'test', many: 'tests', title: 'Class test results' },
};

/**
 * A student's published results of one kind, newest first, each linking to
 * its report card. Filter by pass or fail; the filter is owned by the page
 * (kept in the URL).
 */
export function StudentResults({
  studentId,
  kind,
  outcome,
  onOutcomeChange,
}: {
  studentId: string;
  kind: ResultsKind;
  outcome: Outcome | undefined;
  onOutcomeChange: (o: Outcome | undefined) => void;
}) {
  const fmt = useSchoolFormat();
  const word = WORD[kind];
  const query = useInfiniteQuery({
    queryKey: ['exam-results', 'student', studentId, kind, outcome ?? null],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listResults({
        studentId,
        examType: TYPES[kind],
        result: outcome,
        sort: '-publishedAt',
        page: pageParam,
        limit: 20,
      }),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.meta.total ?? 0;
  // Over what's loaded — every result unless there are more than a page of them.
  const average = items.length ? items.reduce((sum, r) => sum + r.percentage, 0) / items.length : 0;
  const best = items.reduce<(typeof items)[number] | undefined>(
    (top, r) => (!top || r.percentage > top.percentage ? r : top),
    undefined,
  );
  const passed = items.filter((r) => r.result === 'PASS').length;

  return (
    <div className="space-y-6">
      {!outcome && items.length > 0 && (
        <div className="grid gap-4 @xl:grid-cols-3">
          <StatCard
            label="Average"
            value={pctLabel(average)}
            hint={
              query.hasNextPage
                ? `Latest ${items.length} ${word.many}`
                : `${total} ${total === 1 ? word.one : word.many}`
            }
          />
          <StatCard
            label="Best"
            value={best ? pctLabel(best.percentage) : '—'}
            hint={best?.examName}
          />
          <StatCard
            label="Passed"
            value={`${passed} of ${items.length}`}
            tone={passed === items.length ? 'success' : 'warning'}
          />
        </div>
      )}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">{word.title}</h2>
            <div className="flex gap-2" role="group" aria-label="Filter by result">
              <ToggleChip
                on={outcome === 'PASS'}
                onClick={() => onOutcomeChange(outcome === 'PASS' ? undefined : 'PASS')}
              >
                Passed
              </ToggleChip>
              <ToggleChip
                on={outcome === 'FAIL'}
                onClick={() => onOutcomeChange(outcome === 'FAIL' ? undefined : 'FAIL')}
              >
                Failed
              </ToggleChip>
            </div>
          </div>
          {query.isLoading && <Skeleton className="h-16 w-full" />}
          {query.isError && (
            <ErrorState
              error={query.error}
              onRetry={() => void query.refetch()}
              title="Couldn't load results"
            />
          )}
          {query.isSuccess && items.length === 0 && (
            <EmptyState
              icon={Award}
              className="py-10"
              title={
                outcome
                  ? `No ${outcome === 'PASS' ? 'passed' : 'failed'} ${word.many}`
                  : `No ${word.one} results yet`
              }
              description={
                outcome
                  ? 'Try the other filter.'
                  : `Results appear here once a ${word.one} is published for this student's class.`
              }
            />
          )}
          {items.length > 0 && (
            <ul className="rows-stagger divide-y overflow-hidden rounded-lg border">
              {items.map((r) => (
                <li key={r._id}>
                  <Link
                    href={`/app/results/${r._id}`}
                    className="hover:bg-muted/50 flex items-center gap-4 px-4 py-3 text-sm transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.examName}</span>
                      <span className="text-muted-foreground block text-xs">
                        {r.className} · published {fmt.date(r.publishedAt)}
                      </span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="block font-semibold">
                        {pctLabel(r.percentage)} · {r.grade}
                      </span>
                      {r.classRank && (
                        <span className="text-muted-foreground block text-xs">
                          {ordinal(r.classRank)} of {r.classSize}
                        </span>
                      )}
                    </span>
                    <StatusBadge status={r.result} label={r.result === 'PASS' ? 'Pass' : 'Fail'} />
                    <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {query.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

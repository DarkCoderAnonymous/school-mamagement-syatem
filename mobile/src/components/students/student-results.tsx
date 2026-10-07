import { useState } from 'react';
import { Text, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChoiceChips, StatTile } from '@/components/ui/list';
import { Banner, EmptyState } from '@/components/ui/primitives';
import { ResultCard } from '@/components/management/exam-results';
import { getExamSettings, listResults, pctLabel, type ExamType } from '@/lib/api/management';

export type ResultsKind = 'exam' | 'test';

/** Term exams vs class tests, by the exam's type. */
const TYPES: Record<ResultsKind, ExamType[]> = {
  exam: ['MIDTERM', 'FINAL', 'OTHER'],
  test: ['UNIT_TEST', 'MOCK'],
};
const WORD: Record<ResultsKind, { one: string; many: string }> = {
  exam: { one: 'exam', many: 'exams' },
  test: { one: 'test', many: 'tests' },
};

type Outcome = 'PASS' | 'FAIL';
const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'PASS', label: 'Passed' },
  { value: 'FAIL', label: 'Failed' },
];

/**
 * A student's published results of one kind, newest first — each a report
 * card snapshot that expands to its subjects. Filter by pass or fail.
 */
export function StudentResults({ studentId, kind }: { studentId: string; kind: ResultsKind }) {
  const [outcome, setOutcome] = useState<Outcome>();
  const [open, setOpen] = useState<string>();
  const settings = useQuery({
    queryKey: ['exam-settings'],
    queryFn: getExamSettings,
    staleTime: 300_000,
  });
  const showPositions = settings.data?.showPositions ?? true;
  const q = useInfiniteQuery({
    queryKey: ['exam-results', 'student', studentId, kind, outcome ?? null],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listResults({
        studentId,
        examType: TYPES[kind].join(','),
        result: outcome,
        sort: '-publishedAt',
        page: pageParam,
        limit: 20,
      }),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.meta.total ?? 0;
  const word = WORD[kind];

  // Averages over what's loaded — every result unless there are more than a page of them.
  const average = items.length ? items.reduce((sum, r) => sum + r.percentage, 0) / items.length : 0;
  const best = items.reduce<(typeof items)[number] | undefined>(
    (top, r) => (!top || r.percentage > top.percentage ? r : top),
    undefined,
  );

  return (
    <View className="gap-4">
      {!outcome && items.length > 0 && (
        <View className="flex-row gap-2.5">
          <StatTile
            label="Average"
            value={pctLabel(average)}
            hint={
              q.hasNextPage
                ? `Latest ${items.length} ${word.many}`
                : `${total} ${total === 1 ? word.one : word.many}`
            }
          />
          <StatTile
            label="Best"
            value={best ? pctLabel(best.percentage) : '—'}
            hint={best?.examName}
          />
        </View>
      )}
      <ChoiceChips label="Result" options={OUTCOMES} value={outcome} onChange={setOutcome} />
      {q.isLoading ? (
        <Card className="h-24 opacity-60" />
      ) : q.isError ? (
        <Banner tone="danger" title="Couldn't load results">
          Pull down to try again.
        </Banner>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="results"
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
        </Card>
      ) : (
        <View className="gap-2">
          {items.map((r) => (
            <ResultCard
              key={r._id}
              result={r}
              heading="exam"
              showPositions={showPositions}
              open={open === r._id}
              onToggle={() => setOpen(open === r._id ? undefined : r._id)}
            />
          ))}
          {!q.hasNextPage && items.length > 3 && (
            <Text className="py-1 text-center text-xs text-muted-foreground">{total} results</Text>
          )}
        </View>
      )}
      {q.hasNextPage && (
        <Button
          label="Show more"
          variant="outline"
          size="sm"
          loading={q.isFetchingNextPage}
          onPress={() => q.fetchNextPage()}
        />
      )}
    </View>
  );
}

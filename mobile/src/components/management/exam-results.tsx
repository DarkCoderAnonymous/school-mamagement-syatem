import { useState } from 'react';
import { Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { useDebounced } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { ChoiceChips, PagedList, SearchField } from '@/components/ui/list';
import { Banner, Pill } from '@/components/ui/primitives';
import {
  getExamSettings,
  listResults,
  marksLabel,
  ordinal,
  pctLabel,
  type ExamResult,
} from '@/lib/api/management';
import { formatDate } from '@/lib/format';

type Outcome = 'PASS' | 'FAIL';
const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: 'PASS', label: 'Passed' },
  { value: 'FAIL', label: 'Failed' },
];

/**
 * A class's published results, ranked. These are snapshots taken at
 * publishing — a correction means withdrawing and republishing the class.
 * Tap a student for their subject-by-subject marks.
 */
export function ExamResults({
  examId,
  classId,
  className,
}: {
  examId: string;
  classId: string;
  className?: string;
}) {
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<Outcome>();
  const [open, setOpen] = useState<string>();
  const q = useDebounced(search.trim());
  const settings = useQuery({
    queryKey: ['exam-settings'],
    queryFn: getExamSettings,
    staleTime: 300_000,
  });
  const showPositions = settings.data?.showPositions ?? true;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: className ? `${className} results` : 'Results' }} />
      <PagedList
        queryKey={['exam-results', 'list', { examId, classId, search: q, outcome }]}
        fetchPage={(page) =>
          listResults({
            examId,
            classId,
            page,
            limit: 50,
            sort: 'classRank',
            search: q || undefined,
            result: outcome,
          })
        }
        keyExtractor={(r) => r._id}
        renderItem={(r) => (
          <ResultCard
            result={r}
            showPositions={showPositions}
            open={open === r._id}
            onToggle={() => setOpen(open === r._id ? undefined : r._id)}
          />
        )}
        header={
          <View className="gap-3 pb-2">
            <Banner tone="info" icon="lock">
              Published results are fixed. To correct one, withdraw this class from the exam screen,
              fix the marks, and publish again.
            </Banner>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search student or admission no."
            />
            <ChoiceChips label="Result" options={OUTCOMES} value={outcome} onChange={setOutcome} />
          </View>
        }
        empty={
          q || outcome
            ? {
                icon: 'search',
                title: 'No results match',
                description: 'Try a different search or filter.',
              }
            : {
                icon: 'results',
                title: 'No published results',
                description:
                  'Results appear once every paper of this class is verified and published.',
              }
        }
      />
    </View>
  );
}

/**
 * One published result, tap to expand its subjects. In a class's list it's
 * headed by the student; on a student's page (`heading="exam"`) by the exam.
 */
export function ResultCard({
  result: r,
  showPositions,
  open,
  onToggle,
  heading = 'student',
}: {
  result: ExamResult;
  showPositions: boolean;
  open: boolean;
  onToggle: () => void;
  heading?: 'student' | 'exam';
}) {
  const first = r.classRank === 1;
  const title = heading === 'exam' ? r.examName : r.student.name;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${pctLabel(r.percentage)}, grade ${r.grade}, ${r.result === 'PASS' ? 'passed' : 'failed'}${showPositions && r.classRank ? `, position ${ordinal(r.classRank)}` : ''}`}
        onPress={onToggle}
        className="min-h-[64px] flex-row items-center gap-3 px-4 py-3 active:bg-muted"
      >
        {showPositions && (
          <View
            className={`size-9 items-center justify-center rounded-full ${first ? 'bg-warning-soft' : 'bg-muted'}`}
          >
            <Text
              className={`text-xs font-bold ${first ? 'text-warning-ink' : 'text-muted-foreground'}`}
            >
              {r.classRank ?? '—'}
            </Text>
          </View>
        )}
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-medium text-foreground" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {heading === 'exam'
              ? `${r.className}${r.sectionName ? ` ${r.sectionName}` : ''} · ${formatDate(r.publishedAt)}`
              : r.student.admissionNumber}
            {heading === 'student' && r.sectionName ? ` · Section ${r.sectionName}` : ''} ·{' '}
            {marksLabel(r.totalObtained)}/{marksLabel(r.totalMax)}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text className="text-base font-semibold text-foreground">
            {pctLabel(r.percentage)}{' '}
            <Text className="text-sm text-muted-foreground">· {r.grade}</Text>
          </Text>
          <Pill
            label={r.result === 'PASS' ? 'Pass' : 'Fail'}
            tone={r.result === 'PASS' ? 'success' : 'danger'}
          />
        </View>
        <Icon name={open ? 'minus' : 'plus'} size={14} />
      </Pressable>
      {open && (
        <View className="gap-2 border-t border-border px-4 py-3">
          {r.subjects.map((s) => (
            <View
              key={s.subjectId ?? s.name}
              className="flex-row items-center justify-between gap-3"
            >
              <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                {s.name}
              </Text>
              <Text
                className={`text-sm font-medium ${s.passed ? 'text-foreground' : 'text-destructive'}`}
              >
                {s.isAbsent ? 'Absent' : marksLabel(s.marksObtained)}
                <Text className="text-xs text-muted-foreground">/{marksLabel(s.maxMarks)}</Text>
              </Text>
              <Text className="w-9 text-right text-sm font-semibold text-foreground">
                {s.grade}
              </Text>
            </View>
          ))}
          {r.remark ? (
            <Text className="text-xs text-muted-foreground">Remark: {r.remark}</Text>
          ) : null}
          {showPositions && r.classRank ? (
            <Text className="text-xs text-muted-foreground">
              {ordinal(r.classRank)} of {r.classSize} in class
              {r.sectionRank ? ` · ${ordinal(r.sectionRank)} in section` : ''}
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

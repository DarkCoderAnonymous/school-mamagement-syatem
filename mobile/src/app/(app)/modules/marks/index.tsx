import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Permission } from '@sms/shared';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ChoiceChips, PagedList } from '@/components/ui/list';
import { Meter } from '@/components/ui/primitives';
import { PAPER_STATUS_OPTIONS, PaperStatusPill } from '@/components/teaching/paper-status';
import { useSession } from '@/lib/auth-context';
import { listPapers, type ExamPaper, type PaperStatus } from '@/lib/api/teaching';
import { formatDate } from '@/lib/format';
import { can } from '@/lib/modules';

type Scope = 'mine' | 'all';

/**
 * The papers this person can enter: a teacher's are the class + subject
 * pairs assigned to them; the exam office (who can also publish) may open
 * every paper in the school.
 */
export default function MarksEntryScreen() {
  const { user } = useSession();
  const office = can(user?.permissions, Permission.EXAM_MARKS_PUBLISH);
  const [scope, setScope] = useState<Scope>('mine');
  const [status, setStatus] = useState<PaperStatus>();
  const mine = !office || scope === 'mine';

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Marks entry' }} />
      <PagedList
        queryKey={['exam-papers', 'mobile', mine ? 'mine' : 'all', status ?? 'any']}
        fetchPage={(page) => listPapers({ page, mine, status })}
        keyExtractor={(p) => p._id}
        renderItem={(p) => <PaperCard paper={p} />}
        header={
          <View className="gap-3 pb-2">
            {office && (
              <ChoiceChips<Scope>
                label="Which papers"
                value={scope}
                onChange={(v) => v && setScope(v)}
                options={[
                  { value: 'mine', label: 'My papers' },
                  { value: 'all', label: 'All papers' },
                ]}
              />
            )}
            <ChoiceChips<PaperStatus> label="Filter by status" value={status} onChange={setStatus} options={PAPER_STATUS_OPTIONS} />
            <Text className="px-1 text-xs text-muted-foreground">
              {mine ? 'Papers for the classes and subjects assigned to you.' : 'Every paper in the school, newest first.'}
            </Text>
          </View>
        }
        empty={
          mine
            ? { icon: 'marks', title: status ? 'No papers with this status' : 'No papers for your classes', description: 'Papers show up here once an exam includes a class and subject you’re assigned to teach.' }
            : { icon: 'marks', title: status ? 'No papers with this status' : 'No papers yet', description: 'Papers appear once an exam’s date sheet is set up.' }
        }
      />
    </View>
  );
}

function PaperCard({ paper }: { paper: ExamPaper }) {
  const entered = paper.marksEntered ?? 0;
  const total = paper.classStrength ?? 0;
  const title = `${paper.subjectId?.name ?? 'Subject'} · ${paper.classId?.name ?? 'Class'}`;
  const returned = paper.status === 'OPEN' && !!paper.returnReason;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${paper.examId?.name ?? ''}, ${entered} of ${total} marks entered`}
      onPress={() => router.push({ pathname: '/modules/marks/[paperId]', params: { paperId: paper._id } })}
      className="active:opacity-90"
    >
      <Card className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
              {title}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {paper.examId?.name ?? 'Exam'} · {paper.date ? formatDate(paper.date) : 'Not scheduled'} · Max {paper.maxMarks}
            </Text>
          </View>
          <PaperStatusPill status={paper.status} />
        </View>
        {returned && (
          <View className="flex-row items-center gap-1.5">
            <Icon name="warning" size={14} color="warningInk" />
            <Text className="flex-1 text-xs text-warning-ink" numberOfLines={2}>
              Returned: {paper.returnReason}
            </Text>
          </View>
        )}
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Meter value={total ? entered / total : 0} label={`${entered} of ${total} marks entered`} />
          </View>
          <Text className="text-xs font-medium text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
            {entered}/{total}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

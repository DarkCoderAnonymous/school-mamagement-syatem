import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner, EmptyState, Meter, Pill, SectionTitle } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { useSession } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api/http';
import {
  EXAM_STATUS_LABEL,
  EXAM_TYPE_LABEL,
  getExam,
  getExamBoard,
  PAPER_STATUS_LABEL,
  publishResults,
  withdrawResults,
  type BoardClass,
  type PaperStatus,
} from '@/lib/api/management';
import { formatDate, formatNumber } from '@/lib/format';
import { can } from '@/lib/modules';
import { examStatusTone, paperStatusTone } from './exam-tones';
import { ReasonDialog } from './reason-dialog';

const PAPER_STATUSES: PaperStatus[] = ['OPEN', 'SUBMITTED', 'VERIFIED', 'PUBLISHED'];
const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : 'Check your connection and try again.');

/**
 * One exam, class by class: how far marks entry has got, where each paper is
 * in the workflow, and — for the exam office — publishing a class once every
 * paper is verified, or withdrawing a published class to correct it.
 */
export function ExamBoard({ examId }: { examId: string }) {
  const { user } = useSession();
  const canPublish = can(user?.permissions, Permission.EXAM_MARKS_PUBLISH);
  const queryClient = useQueryClient();
  const exam = useQuery({ queryKey: ['exams', 'detail', examId], queryFn: () => getExam(examId) });
  const board = useQuery({ queryKey: ['exams', 'board', examId], queryFn: () => getExamBoard(examId) });
  const [withdrawing, setWithdrawing] = useState<BoardClass>();

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['exams'] }),
      queryClient.invalidateQueries({ queryKey: ['exam-results'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  };

  const publish = useMutation({
    mutationFn: (c: BoardClass) => publishResults(examId, [c._id]),
    onSuccess: async (res, c) => {
      await refresh();
      const r = res.classes[0];
      Alert.alert(`${c.name} results published`, r ? `${r.passed} of ${r.students} passed. ${res.notified} famil${res.notified === 1 ? 'y' : 'ies'} emailed.` : undefined);
    },
    onError: (err, c) => Alert.alert(`Couldn't publish ${c.name}`, errorText(err)),
  });

  const withdraw = useMutation({
    mutationFn: ({ c, reason }: { c: BoardClass; reason: string }) => withdrawResults(examId, c._id, reason),
    onSuccess: async (_res, { c }) => {
      setWithdrawing(undefined);
      await refresh();
      Alert.alert(`${c.name} results withdrawn`, 'Report cards are down and the papers are back to verified. Publish again once the correction is made.');
    },
    onError: (err, { c }) => {
      setWithdrawing(undefined);
      Alert.alert(`Couldn't withdraw ${c.name}`, errorText(err));
    },
  });

  const confirmPublish = (c: BoardClass) =>
    Alert.alert(
      `Publish ${c.name} results?`,
      'Grades, totals and positions are worked out now and marks are locked. Families with an email on file are told the results are out.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish', onPress: () => publish.mutate(c) },
      ],
    );

  const e = exam.data;
  const classes = board.data?.classes ?? [];
  const withPapers = classes.filter((c) => c.papers > 0);
  const withoutPapers = classes.length - withPapers.length;
  const title = e?.name ?? board.data?.exam.name ?? 'Exam';

  return (
    <Screen edges={[]} onRefresh={() => Promise.all([exam.refetch(), board.refetch()])}>
      <Stack.Screen options={{ title }} />

      {e && (
        <Card className="gap-2 p-4">
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-lg font-semibold text-foreground">{e.name}</Text>
            <Pill label={EXAM_STATUS_LABEL[e.status]} tone={examStatusTone(e.status)} />
          </View>
          <Text className="text-sm text-muted-foreground">
            {EXAM_TYPE_LABEL[e.type]} · {formatDate(e.startDate)} – {formatDate(e.endDate)}
            {e.academicSessionId ? ` · ${e.academicSessionId.name}` : ''}
          </Text>
        </Card>
      )}

      {board.isLoading || exam.isLoading ? (
        <View className="gap-2.5">
          <Card className="h-40 opacity-60" />
          <Card className="h-40 opacity-60" />
        </View>
      ) : board.isError || exam.isError ? (
        <Banner tone="danger" title="Couldn't load this exam">
          {errorText(board.error ?? exam.error)}
        </Banner>
      ) : withPapers.length === 0 ? (
        <Card>
          <EmptyState icon="exams" title="No date sheet yet" description="Papers are added on the web — each class's subjects, dates and marks." />
        </Card>
      ) : (
        <View className="gap-2.5">
          <SectionTitle title="Classes" />
          {withPapers.map((c) => (
            <ClassCard
              key={c._id}
              cls={c}
              canPublish={canPublish}
              publishing={publish.isPending && publish.variables?._id === c._id}
              busy={publish.isPending || withdraw.isPending}
              onPublish={() => confirmPublish(c)}
              onWithdraw={() => setWithdrawing(c)}
              onResults={() => router.push({ pathname: '/modules/exams/[id]', params: { id: examId, classId: c._id, className: c.name } })}
            />
          ))}
          {withoutPapers > 0 && (
            <Text className="px-1 text-xs text-muted-foreground">
              {withoutPapers} other class{withoutPapers === 1 ? ' has' : 'es have'} no papers in this exam.
            </Text>
          )}
        </View>
      )}

      {withdrawing && (
        <ReasonDialog
          visible
          title={`Withdraw ${withdrawing.name} results?`}
          description="Withdrawing is how published results are corrected: report cards come down and the papers go back to verified, so one can be returned to its teacher. Publish again once it's fixed."
          placeholder="Reason, e.g. wrong maths marks"
          confirmLabel="Withdraw"
          destructive
          pending={withdraw.isPending}
          onCancel={() => setWithdrawing(undefined)}
          onConfirm={(reason) => withdraw.mutate({ c: withdrawing, reason })}
        />
      )}
    </Screen>
  );
}

function ClassCard({
  cls,
  canPublish,
  publishing,
  busy,
  onPublish,
  onWithdraw,
  onResults,
}: {
  cls: BoardClass;
  canPublish: boolean;
  publishing: boolean;
  busy: boolean;
  onPublish: () => void;
  onWithdraw: () => void;
  onResults: () => void;
}) {
  const published = (cls.statusCounts.PUBLISHED ?? 0) > 0;
  const allVerified = cls.papers > 0 && (cls.statusCounts.VERIFIED ?? 0) === cls.papers;
  const progress = cls.marksExpected ? cls.marksEntered / cls.marksExpected : 0;
  const verified = (cls.statusCounts.VERIFIED ?? 0) + (cls.statusCounts.PUBLISHED ?? 0);

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-foreground">{cls.name}</Text>
          <Text className="text-xs text-muted-foreground">
            {formatNumber(cls.students)} student{cls.students === 1 ? '' : 's'} · {cls.papers} paper{cls.papers === 1 ? '' : 's'} · {verified} verified
          </Text>
        </View>
        {published ? <Pill label="Published" tone="success" /> : allVerified ? <Pill label="Ready to publish" tone="primary" /> : null}
      </View>

      <View className="gap-1.5">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-xs text-muted-foreground">Marks entered</Text>
          <Text className="text-xs font-semibold text-foreground">
            {formatNumber(cls.marksEntered)} / {formatNumber(cls.marksExpected)}
          </Text>
        </View>
        <Meter value={progress} label={`${cls.name}: ${cls.marksEntered} of ${cls.marksExpected} marks entered`} />
      </View>

      <View className="flex-row flex-wrap gap-1.5">
        {PAPER_STATUSES.filter((s) => (cls.statusCounts[s] ?? 0) > 0).map((s) => (
          <Pill key={s} label={`${PAPER_STATUS_LABEL[s]} ${cls.statusCounts[s]}`} tone={paperStatusTone(s)} />
        ))}
      </View>

      {(published || canPublish) && (
        <View className="gap-2">
          {published ? (
            <View className="flex-row gap-2">
              <Button label="View results" icon="results" variant="outline" size="sm" className="flex-1" onPress={onResults} />
              {canPublish && <Button label="Withdraw" variant="destructive" size="sm" className="flex-1" disabled={busy} onPress={onWithdraw} accessibilityLabel={`Withdraw ${cls.name} results for correction`} />}
            </View>
          ) : (
            <>
              <Button
                label="Publish results"
                icon="send"
                size="sm"
                disabled={!allVerified || busy}
                loading={publishing}
                onPress={onPublish}
                accessibilityLabel={`Publish ${cls.name} results`}
                accessibilityHint={allVerified ? undefined : 'Every paper must be verified first'}
              />
              {!allVerified && <Text className="text-center text-xs text-muted-foreground">Every paper must be verified before results can be published.</Text>}
            </>
          )}
        </View>
      )}
    </Card>
  );
}

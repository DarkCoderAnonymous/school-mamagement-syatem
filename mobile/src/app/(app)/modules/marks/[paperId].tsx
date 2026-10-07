import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ChoiceChips } from '@/components/ui/list';
import { Banner, Meter } from '@/components/ui/primitives';
import { marksLabel, PaperStatusPill } from '@/components/teaching/paper-status';
import { ApiRequestError } from '@/lib/api/http';
import { getMarksSheet, MAX_ENTRIES_PER_SAVE, saveMarks, submitPaper, type MarkEntry, type MarksRow, type MarksSheet } from '@/lib/api/teaching';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/lib/theme';

interface Draft {
  marks: string;
  isAbsent: boolean;
  remarks: string;
}

const baseline = (r: MarksRow): Draft => ({ marks: r.marksObtained === null ? '' : String(r.marksObtained), isAbsent: r.isAbsent, remarks: r.remarks ?? '' });
/** What a draft means, so "45" and "45.0" are the same mark. */
const meaning = (d: Draft) => `${d.isAbsent ? 'AB' : d.marks.trim() === '' ? '' : String(Number(d.marks))}|${d.remarks.trim()}`;
const hasValue = (d: Draft) => d.isAbsent || d.marks.trim() !== '';

/** The backend's rule, checked as typed: 0..max, whole or half marks. */
function problem(d: Draft, max: number): string | null {
  if (d.isAbsent || d.marks.trim() === '') return null;
  const n = Number(d.marks);
  if (!Number.isFinite(n) || n < 0) return 'Not a number';
  if (n > max) return `Max is ${marksLabel(max)}`;
  if (!Number.isInteger(n * 2)) return 'Use whole or half marks';
  return null;
}

const toEntry = (studentId: string, d: Draft): MarkEntry => ({
  studentId,
  marksObtained: d.isAbsent || d.marks.trim() === '' ? null : Number(d.marks),
  isAbsent: d.isAbsent,
  remarks: d.remarks.trim() || undefined,
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const errorText = (err: unknown) => (err instanceof ApiRequestError ? err.message : 'Check your connection and try again.');

/**
 * One paper's marks sheet. Edits are kept per student on top of the server's
 * values, so a refresh never wipes what's being typed; Save sends only the
 * rows that changed, Submit hands a complete paper to the exam office.
 */
export default function PaperScreen() {
  const { paperId, sectionId } = useLocalSearchParams<{ paperId: string; sectionId?: string }>();
  const theme = useTheme();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const key = useMemo(() => ['marks-sheet', paperId], [paperId]);
  // No refetch on focus: a background refetch must never race marks being typed.
  const sheet = useQuery({ queryKey: key, queryFn: () => getMarksSheet(paperId), refetchOnWindowFocus: false });
  const data = sheet.data;
  const paper = data?.paper;
  const max = paper?.maxMarks ?? 100;

  const [overrides, setOverrides] = useState<Record<string, Draft>>({});
  const [section, setSection] = useState<string | undefined>(sectionId);
  const [noteOpen, setNoteOpen] = useState<string>();
  const [savedAt, setSavedAt] = useState<number>();
  const [refreshing, setRefreshing] = useState(false);

  const allRows = useMemo(() => data?.rows ?? [], [data]);
  // One baseline object per row, so unchanged rows keep the same props and skip re-rendering.
  const baselines = useMemo(() => new Map(allRows.map((r) => [r.student._id, baseline(r)])), [allRows]);
  const draftOf = useCallback((r: MarksRow) => overrides[r.student._id] ?? baselines.get(r.student._id) ?? baseline(r), [overrides, baselines]);
  const isDirty = useCallback(
    (r: MarksRow) => {
      const o = overrides[r.student._id];
      const b = baselines.get(r.student._id);
      return !!o && !!b && meaning(o) !== meaning(b);
    },
    [overrides, baselines],
  );
  const changed = useMemo(() => allRows.filter(isDirty), [allRows, isDirty]);
  const invalid = changed.filter((r) => problem(draftOf(r), max));
  const saveable = changed.filter((r) => !problem(draftOf(r), max));
  const entered = allRows.filter((r) => hasValue(draftOf(r))).length;
  const remaining = allRows.length - entered;
  const scores = allRows
    .map(draftOf)
    .filter((d) => !d.isAbsent && d.marks.trim() !== '' && !problem(d, max))
    .map((d) => Number(d.marks));
  const average = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null;
  const belowPass = scores.filter((n) => n < (paper?.passMarks ?? 0)).length;
  const rows = useMemo(() => (section ? allRows.filter((r) => r.student.sectionId === section) : allRows), [allRows, section]);

  const onChange = useCallback((studentId: string, next: Draft) => setOverrides((cur) => ({ ...cur, [studentId]: next })), []);
  const onOpenNote = useCallback((studentId: string) => setNoteOpen(studentId), []);

  const save = useMutation({
    mutationFn: async (entries: MarkEntry[]) => {
      let last: Awaited<ReturnType<typeof saveMarks>> | undefined;
      for (let i = 0; i < entries.length; i += MAX_ENTRIES_PER_SAVE) last = await saveMarks(paperId, entries.slice(i, i + MAX_ENTRIES_PER_SAVE));
      return { res: last!, entries };
    },
    onSuccess: ({ res, entries }) => {
      const sent = new Map(entries.map((e) => [e.studentId, e]));
      // Keep the cached sheet in step with what's now stored.
      queryClient.setQueryData<MarksSheet>(key, (old) =>
        old
          ? {
              ...old,
              enteredCount: res.enteredCount,
              rows: old.rows.map((r) => {
                const e = sent.get(r.student._id);
                return e ? { ...r, marksObtained: e.marksObtained, isAbsent: e.isAbsent, remarks: e.remarks ?? '' } : r;
              }),
            }
          : old,
      );
      // Drop only the edits that were sent — a row changed again mid-save stays unsaved.
      setOverrides((cur) => {
        const next = { ...cur };
        for (const e of entries) {
          const d = next[e.studentId];
          if (d && meaning(d) === meaning({ marks: e.marksObtained === null ? '' : String(e.marksObtained), isAbsent: e.isAbsent, remarks: e.remarks ?? '' })) delete next[e.studentId];
        }
        return next;
      });
      setSavedAt(Date.now());
      void queryClient.invalidateQueries({ queryKey: ['exam-papers'] });
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
    },
    onError: (err) => {
      // Part of a large class may have saved; the refetch shows what did (unsaved edits stay on top).
      void queryClient.invalidateQueries({ queryKey: key });
      Alert.alert("Couldn't save marks", errorText(err));
    },
  });

  const submit = useMutation({
    mutationFn: () => submitPaper(paperId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['exam-papers'] });
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
      Alert.alert('Paper submitted', 'The exam office will check and verify these marks.');
    },
    onError: (err) => Alert.alert("Couldn't submit this paper", errorText(err)),
  });

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(undefined), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  // Leaving with unsaved marks asks first.
  const canEdit = !!data?.canEdit;
  const unsaved = canEdit ? changed.length : 0;
  useEffect(() => {
    if (!unsaved || save.isPending) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Discard unsaved marks?', `${plural(unsaved, 'change')} haven't been saved.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, unsaved, save.isPending]);

  const onSubmit = () =>
    Alert.alert(
      'Submit these marks?',
      `The exam office checks and verifies them. You can't change marks after submitting unless the paper is returned to you.${remaining > 0 ? `\n\n${plural(remaining, 'student')} still ${remaining === 1 ? 'has' : 'have'} no mark.` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: () => submit.mutate() },
      ],
    );

  const title = paper ? `${paper.subjectId?.name ?? 'Paper'} · ${paper.classId?.name ?? ''}` : 'Paper';

  if (sheet.isLoading || !data || !paper) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Stack.Screen options={{ title }} />
        {sheet.isError ? (
          <View className="w-full gap-3 px-4">
            <Banner tone="danger" title="Couldn't load this marks sheet">
              {errorText(sheet.error)}
            </Banner>
            <Button label="Try again" variant="outline" onPress={() => sheet.refetch()} />
          </View>
        ) : (
          <ActivityIndicator color={theme.mutedForeground} />
        )}
      </View>
    );
  }

  const person = (p?: { firstName: string; lastName: string } | null) => (p ? ` by ${p.firstName} ${p.lastName}` : '');

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <Stack.Screen options={{ title }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.student._id}
        contentContainerClassName="gap-2 px-4 pb-6 pt-2"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={theme.mutedForeground}
            colors={[theme.primary]}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await sheet.refetch();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <Card className="gap-3 p-4">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-semibold text-foreground">{paper.examId?.name ?? 'Exam'}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {paper.date ? formatDate(paper.date) : 'Not scheduled'} · Max {marksLabel(paper.maxMarks)} · Pass {marksLabel(paper.passMarks)}
                  </Text>
                </View>
                <PaperStatusPill status={paper.status} />
              </View>
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Meter value={allRows.length ? entered / allRows.length : 0} label={`${entered} of ${allRows.length} marks entered`} />
                </View>
                <Text className="text-xs font-medium text-muted-foreground" style={{ fontVariant: ['tabular-nums'] }}>
                  {entered}/{allRows.length}
                </Text>
              </View>
              <View className="flex-row gap-4">
                <Stat label="Average" value={average === null ? '—' : marksLabel(Math.round(average * 10) / 10)} />
                <Stat label="Highest" value={scores.length ? marksLabel(Math.max(...scores)) : '—'} />
                <Stat label="Below pass" value={String(belowPass)} danger={belowPass > 0} />
              </View>
            </Card>

            {paper.status === 'OPEN' && paper.returnReason && (
              <Banner tone="warning" title="Returned by the exam office">
                {paper.returnReason}
              </Banner>
            )}
            {paper.status === 'SUBMITTED' && (
              <Banner tone="info" icon="lock" title="Submitted — waiting for verification">
                {`Submitted${paper.submittedAt ? ` ${formatDate(paper.submittedAt, true)}` : ''}${person(paper.submittedByUserId)}. Marks are read-only; ask the exam office to return the paper if something needs changing.`}
              </Banner>
            )}
            {paper.status === 'VERIFIED' && (
              <Banner tone="success" title="Verified">
                {`Checked${person(paper.verifiedByUserId)}. Marks are read-only and become final when results are published.`}
              </Banner>
            )}
            {paper.status === 'PUBLISHED' && (
              <Banner tone="info" icon="lock" title="Results published">
                These marks are locked. The exam office corrects results by withdrawing and republishing the class.
              </Banner>
            )}
            {paper.status === 'OPEN' && !canEdit && (
              <Banner tone="info" icon="lock" title="Read-only">
                This class and subject aren&apos;t assigned to you — ask the school office if you should be entering these marks.
              </Banner>
            )}

            {data.sections.length > 1 && (
              <ChoiceChips
                label="Section"
                value={section ?? 'all'}
                onChange={(v) => setSection(!v || v === 'all' ? undefined : v)}
                options={[{ value: 'all', label: 'All sections' }, ...data.sections.map((s) => ({ value: s._id, label: `Section ${s.name}` }))]}
              />
            )}
          </View>
        }
        ListEmptyComponent={<Text className="py-10 text-center text-sm text-muted-foreground">No active students in this {section ? 'section' : 'class'}.</Text>}
        renderItem={({ item: r }) => (
          <MarkRow
            row={r}
            draft={draftOf(r)}
            max={max}
            passMarks={paper.passMarks}
            editable={canEdit}
            dirty={isDirty(r)}
            noteOpen={noteOpen === r.student._id}
            onChange={onChange}
            onOpenNote={onOpenNote}
          />
        )}
      />

      {canEdit && allRows.length > 0 && (
        <View className="gap-2 border-t border-border bg-card px-4 pb-2 pt-3">
          <Text className={`text-center text-xs ${invalid.length ? 'text-destructive' : 'text-muted-foreground'}`} accessibilityLiveRegion="polite">
            {savedAt
              ? '✓ Marks saved'
              : invalid.length
                ? `${plural(invalid.length, 'mark')} ${invalid.length === 1 ? 'needs' : 'need'} fixing before ${invalid.length === 1 ? 'it' : 'they'} can save`
                : changed.length
                  ? `${plural(changed.length, 'unsaved change')} — save before submitting`
                  : remaining > 0
                    ? `${plural(remaining, 'student')} still ${remaining === 1 ? 'needs' : 'need'} a mark or absent`
                    : 'Every student has a mark — ready to submit'}
          </Text>
          <View className="flex-row gap-2">
            <Button
              label={saveable.length ? `Save (${saveable.length})` : 'Saved'}
              variant={changed.length ? 'primary' : 'outline'}
              loading={save.isPending}
              disabled={saveable.length === 0 || submit.isPending}
              className="flex-1"
              onPress={() => save.mutate(saveable.map((r) => toEntry(r.student._id, draftOf(r))))}
            />
            <Button
              label="Submit paper"
              icon="send"
              variant={changed.length ? 'outline' : 'primary'}
              loading={submit.isPending}
              disabled={changed.length > 0 || save.isPending}
              className="flex-1"
              onPress={onSubmit}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className={`text-base font-semibold ${danger ? 'text-destructive' : 'text-foreground'}`} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

/** One student: roll, name, the mark (whole or half, up to the paper's max), an Absent toggle and an optional remark. */
const MarkRow = memo(function MarkRow({
  row,
  draft,
  max,
  passMarks,
  editable,
  dirty,
  noteOpen,
  onChange,
  onOpenNote,
}: {
  row: MarksRow;
  draft: Draft;
  max: number;
  passMarks: number;
  editable: boolean;
  dirty: boolean;
  noteOpen: boolean;
  onChange: (studentId: string, next: Draft) => void;
  onOpenNote: (studentId: string) => void;
}) {
  const theme = useTheme();
  const id = row.student._id;
  const name = `${row.student.firstName} ${row.student.lastName}`;
  const err = problem(draft, max);
  const scored = !draft.isAbsent && draft.marks.trim() !== '' && !err;
  const failing = scored && Number(draft.marks) < passMarks;
  const showNote = noteOpen || !!draft.remarks;

  return (
    <View className={`gap-2.5 rounded-2xl border bg-card p-3.5 ${dirty ? 'border-primary/50' : 'border-border'}`}>
      <View className="flex-row items-center gap-3">
        <View className="size-9 items-center justify-center rounded-full bg-muted">
          <Text className="text-xs font-semibold text-muted-foreground">{row.student.rollNumber ?? '—'}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-medium text-foreground" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-muted-foreground">{row.student.admissionNumber}</Text>
        </View>

        {editable ? (
          <>
            <View className={`h-11 w-24 flex-row items-center rounded-xl border bg-background px-2.5 ${err ? 'border-destructive' : 'border-input'} ${draft.isAbsent ? 'opacity-50' : ''}`}>
              <TextInput
                value={draft.isAbsent ? '' : draft.marks}
                onChangeText={(t) => onChange(id, { ...draft, marks: t.replace(/,/g, '.').replace(/[^\d.]/g, '') })}
                editable={!draft.isAbsent}
                placeholder={draft.isAbsent ? 'AB' : '—'}
                placeholderTextColor={theme.mutedForeground}
                keyboardType="decimal-pad"
                maxLength={6}
                selectTextOnFocus
                accessibilityLabel={`Marks for ${name}, out of ${marksLabel(max)}`}
                className={`flex-1 text-right text-base font-semibold ${failing ? 'text-destructive' : 'text-foreground'}`}
                style={{ fontVariant: ['tabular-nums'] }}
              />
              <Text className="pl-1 text-xs text-muted-foreground">/{marksLabel(max)}</Text>
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`${name} absent`}
              accessibilityState={{ checked: draft.isAbsent }}
              onPress={() => onChange(id, { ...draft, isAbsent: !draft.isAbsent, marks: draft.isAbsent ? draft.marks : '' })}
              className={`h-11 min-w-[44px] items-center justify-center rounded-xl border px-2.5 ${draft.isAbsent ? 'border-warning bg-warning-soft' : 'border-border bg-background'}`}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}
            >
              <Text className={`text-sm font-bold ${draft.isAbsent ? 'text-warning-ink' : 'text-muted-foreground'}`}>AB</Text>
            </Pressable>
          </>
        ) : (
          <Text className={`text-base font-semibold ${draft.isAbsent ? 'text-warning-ink' : failing ? 'text-destructive' : 'text-foreground'}`} style={{ fontVariant: ['tabular-nums'] }}>
            {draft.isAbsent ? 'Absent' : draft.marks.trim() === '' ? '—' : `${draft.marks} / ${marksLabel(max)}`}
          </Text>
        )}
      </View>

      {err && <Text className="text-right text-xs text-destructive">{err}</Text>}

      {editable && !showNote && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Add a remark for ${name}`} hitSlop={8} onPress={() => onOpenNote(id)} className="-my-1 min-h-[32px] flex-row items-center gap-1.5 self-start">
          <Icon name="note" size={14} />
          <Text className="text-xs text-muted-foreground">Add remark</Text>
        </Pressable>
      )}
      {showNote &&
        (editable ? (
          <TextInput
            value={draft.remarks}
            onChangeText={(t) => onChange(id, { ...draft, remarks: t })}
            placeholder="Remark (optional)"
            placeholderTextColor={theme.mutedForeground}
            maxLength={200}
            accessibilityLabel={`Remark for ${name}`}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          />
        ) : (
          <Text className="text-xs text-muted-foreground">Remark: {draft.remarks}</Text>
        ))}
    </View>
  );
});

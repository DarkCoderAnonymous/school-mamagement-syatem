import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { useDebounced } from '@/components/ui/form';
import { ChoiceChips, PagedList, SearchField } from '@/components/ui/list';
import { Meter, Pill } from '@/components/ui/primitives';
import { examStatusTone } from '@/components/management/exam-tones';
import { EXAM_STATUS_LABEL, EXAM_TYPE_LABEL, listExams, type Exam, type ExamType } from '@/lib/api/management';
import { formatDate } from '@/lib/format';

const TYPES = (Object.keys(EXAM_TYPE_LABEL) as ExamType[]).map((value) => ({ value, label: EXAM_TYPE_LABEL[value] }));

/** Exams in the current session: dates, marking progress and publishing status. */
export default function ExamsScreen() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ExamType>();
  const q = useDebounced(search.trim());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Exams & results' }} />
      <PagedList
        queryKey={['exams', 'list', { search: q, type }]}
        fetchPage={(page) => listExams({ page, limit: 25, search: q || undefined, type })}
        keyExtractor={(e) => e._id}
        renderItem={(e) => <ExamCard exam={e} />}
        header={
          <View className="gap-3 pb-2">
            <SearchField value={search} onChangeText={setSearch} placeholder="Search exams" />
            <ChoiceChips label="Exam type" options={TYPES} value={type} onChange={setType} />
          </View>
        }
        empty={
          q || type
            ? { icon: 'search', title: 'No exams match', description: 'Try a different search or type.' }
            : { icon: 'exams', title: 'No exams this session', description: 'Exams are set up on the web — their date sheets, papers and marks.' }
        }
      />
    </View>
  );
}

function ExamCard({ exam }: { exam: Exam }) {
  const total = exam.paperTotal ?? Object.values(exam.paperCounts).reduce((s, n) => s + (n ?? 0), 0);
  const done = (exam.paperCounts.VERIFIED ?? 0) + (exam.paperCounts.PUBLISHED ?? 0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${exam.name}, ${EXAM_STATUS_LABEL[exam.status]}`}
      onPress={() => router.push({ pathname: '/modules/exams/[id]', params: { id: exam._id } })}
      className="active:opacity-90"
    >
      <Card className="gap-3 p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-semibold text-foreground" numberOfLines={2}>
              {exam.name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {EXAM_TYPE_LABEL[exam.type]} · {formatDate(exam.startDate)} – {formatDate(exam.endDate)}
            </Text>
          </View>
          <Pill label={EXAM_STATUS_LABEL[exam.status]} tone={examStatusTone(exam.status)} />
        </View>
        {total === 0 ? (
          <Text className="text-xs text-muted-foreground">No papers yet</Text>
        ) : (
          <View className="gap-1.5">
            <Meter value={done / total} label={`${done} of ${total} papers verified`} />
            <Text className="text-xs text-muted-foreground">
              {done} of {total} paper{total === 1 ? '' : 's'} verified
            </Text>
          </View>
        )}
      </Card>
    </Pressable>
  );
}

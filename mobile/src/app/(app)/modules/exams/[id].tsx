import { useLocalSearchParams } from 'expo-router';
import { ExamBoard } from '@/components/management/exam-board';
import { ExamResults } from '@/components/management/exam-results';

/**
 * One exam. Without `classId` it is the class-by-class progress board
 * (publish / withdraw for the exam office); with `classId` it is that
 * class's published results — pushed as its own screen so Back returns
 * to the board.
 */
export default function ExamScreen() {
  const { id, classId, className } = useLocalSearchParams<{ id: string; classId?: string; className?: string }>();
  return classId ? <ExamResults examId={id} classId={classId} className={className} /> : <ExamBoard examId={id} />;
}

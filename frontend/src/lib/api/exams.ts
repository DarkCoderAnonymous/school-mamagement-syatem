import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost, apiPut } from './http';
import type { ClassSheet, Exam, ExamAnalysis, ExamDetail, ExamPaper, ExamResult, ExamSettings, ExamType, MarksBoard, MarksSheet, ReportCardData } from './types';

/** API client for exams, marks entry and results. */
type Params = Record<string, unknown>;

export const getExamSettings = () => apiGet<ExamSettings>('/exams/settings');
export const updateExamSettings = (input: Partial<ExamSettings>) => apiPatch<ExamSettings>('/exams/settings', input);

export interface ExamInput {
  name: string;
  type: ExamType;
  startDate: string;
  endDate: string;
  description?: string;
  /** Create only: the grades that sit these subjects, and each subject's day and marks. */
  dateSheet?: { classIds: string[]; papers: DateSheetRow[] };
}
export const listExams = (params: Params = {}) => apiGetPaginated<Exam>('/exams', params);
export const getExam = (id: string) => apiGet<ExamDetail>(`/exams/${id}`);
export const createExam = (input: ExamInput) => apiPost<ExamDetail>('/exams', input);
export const updateExam = (id: string, input: Partial<ExamInput>) => apiPatch<ExamDetail>(`/exams/${id}`, input);
export const deleteExam = (id: string) => apiDelete(`/exams/${id}`);

export interface PaperInput {
  subjectId: string;
  maxMarks: number;
  passMarks: number;
  date?: string | null;
  startTime?: string;
}
export const addPapers = (examId: string, input: { classIds: string[]; subjects: PaperInput[] }) =>
  apiPost<{ created: number; skipped: number }>(`/exams/${examId}/papers`, input);
/** One row of a class's date sheet — the full schedule for that subject. */
export interface DateSheetRow {
  subjectId: string;
  date: string | null;
  startTime: string | null;
  durationMinutes?: number | null;
  maxMarks: number;
  passMarks: number;
}
export const saveDateSheet = (examId: string, classId: string, papers: DateSheetRow[]) =>
  apiPut<{ created: number; updated: number }>(`/exams/${examId}/classes/${classId}/date-sheet`, { papers });
export const updatePaper = (id: string, input: Partial<Omit<PaperInput, 'subjectId'>>) => apiPatch<ExamPaper>(`/exams/papers/${id}`, input);
export const deletePaper = (id: string) => apiDelete(`/exams/papers/${id}`);

export const listPapers = (params: Params = {}) => apiGetPaginated<ExamPaper>('/exams/papers', params);
export const getMarksSheet = (id: string, sectionId?: string) => apiGet<MarksSheet>(`/exams/papers/${id}`, sectionId ? { sectionId } : {});
export const saveMarks = (id: string, entries: { studentId: string; marksObtained: number | null; isAbsent: boolean; remarks?: string }[]) =>
  apiPut<{ saved: number; enteredCount: number; savedAt: string }>(`/exams/papers/${id}/marks`, { entries });
export const getMarksBoard = (examId: string) => apiGet<MarksBoard>(`/exams/${examId}/board`);
export const getClassSheet = (examId: string, classId: string, sectionId?: string) =>
  apiGet<ClassSheet>(`/exams/${examId}/classes/${classId}/marks`, sectionId ? { sectionId } : {});
export const saveStudentMarks = (
  examId: string,
  studentId: string,
  entries: { examPaperId: string; marksObtained: number | null; isAbsent: boolean; remarks?: string }[],
) => apiPut<{ saved: number; savedAt: string }>(`/exams/${examId}/students/${studentId}/marks`, { entries });
export const submitPaper = (id: string) => apiPost<ExamPaper>(`/exams/papers/${id}/submit`);
export const verifyPaper = (id: string) => apiPost<ExamPaper>(`/exams/papers/${id}/verify`);
export const returnPaper = (id: string, reason: string) => apiPost<ExamPaper>(`/exams/papers/${id}/return`, { reason });

export const publishResults = (examId: string, classIds: string[]) =>
  apiPost<{ classes: { classId: string; className: string; students: number; passed: number }[]; notified: number }>(`/exams/${examId}/publish`, { classIds });
export const withdrawResults = (examId: string, classId: string, reason: string) => apiPost(`/exams/${examId}/withdraw`, { classId, reason });

export const listResults = (params: Params = {}) => apiGetPaginated<ExamResult>('/exams/results', params);
export const getReportCard = (id: string) => apiGet<ReportCardData>(`/exams/results/${id}`);
export const getAnalysis = (examId: string, classId?: string) => apiGet<ExamAnalysis>(`/exams/${examId}/analysis`, classId ? { classId } : {});

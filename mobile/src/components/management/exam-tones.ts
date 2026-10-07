import type { ExamStatus, PaperStatus } from '@/lib/api/management';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/** Pill tones for exam and paper workflow states — the words carry the meaning, the tone just helps scanning. */
export const examStatusTone = (s: ExamStatus): Tone => ({ SETUP: 'neutral', IN_PROGRESS: 'info', PARTLY_PUBLISHED: 'warning', PUBLISHED: 'success' } as const)[s];
export const paperStatusTone = (s: PaperStatus): Tone => ({ OPEN: 'neutral', SUBMITTED: 'warning', VERIFIED: 'info', PUBLISHED: 'success' } as const)[s];

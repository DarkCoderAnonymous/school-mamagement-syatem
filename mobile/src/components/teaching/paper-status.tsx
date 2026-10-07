import { Pill } from '@/components/ui/primitives';
import type { PaperStatus } from '@/lib/api/teaching';

type Tone = 'primary' | 'warning' | 'success' | 'info';

/** A paper's place in marks entry → verification → results, in words (never colour alone). */
export const PAPER_STATUS: Record<PaperStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Open', tone: 'primary' },
  SUBMITTED: { label: 'Submitted', tone: 'warning' },
  VERIFIED: { label: 'Verified', tone: 'success' },
  PUBLISHED: { label: 'Published', tone: 'info' },
};

export const PAPER_STATUS_OPTIONS = (Object.keys(PAPER_STATUS) as PaperStatus[]).map((s) => ({ value: s, label: PAPER_STATUS[s].label }));

export function PaperStatusPill({ status }: { status: PaperStatus }) {
  const meta = PAPER_STATUS[status] ?? { label: status, tone: 'primary' as const };
  return <Pill label={meta.label} tone={meta.tone} />;
}

/** 45 → "45", 45.5 → "45.5" — marks may be halves. */
export const marksLabel = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

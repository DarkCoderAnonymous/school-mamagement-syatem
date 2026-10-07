'use client';

import { PrintLayout } from '@/components/print/print-layout';
import { useSchoolFormat } from '@/lib/format';
import { fullName, marksLabel, ordinal, pctLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { ExamResult, GradingBand } from '@/lib/api/types';

/**
 * The printed report card. Used for one student and for a whole section's
 * bulk print, so both come out identical. Everything shown comes from the
 * result snapshot written at publish time.
 */
export function ReportCard({
  result,
  schoolName,
  schoolAddress,
  logoUrl,
  bands,
  showPositions,
  sessionName,
  guardian,
  dateOfBirth,
}: {
  result: ExamResult;
  schoolName: string;
  schoolAddress?: string;
  logoUrl?: string | null;
  bands: GradingBand[];
  showPositions: boolean;
  sessionName?: string;
  guardian?: { firstName: string; lastName: string } | null;
  dateOfBirth?: string | null;
}) {
  const fmt = useSchoolFormat();
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  const key = sorted.map((b, i) => {
    const upper = i === 0 ? 100 : sorted[i - 1]!.minPercent;
    return `${b.grade} ${b.minPercent}${i === 0 ? '–100' : `–<${upper}`}%`;
  });
  const passed = result.result === 'PASS';

  return (
    <PrintLayout
      title="Report card"
      schoolName={schoolName}
      schoolAddress={schoolAddress}
      logoUrl={logoUrl}
      meta={[
        { label: 'Student', value: result.student.name },
        { label: 'Admission no.', value: <span className="font-mono">{result.student.admissionNumber}</span> },
        { label: 'Class', value: `${result.className}${result.sectionName ? ` · Section ${result.sectionName}` : ''}` },
        { label: 'Roll no.', value: result.student.rollNumber ?? '—' },
        { label: 'Examination', value: result.examName },
        { label: sessionName ? 'Session' : 'Published', value: sessionName ?? fmt.date(result.publishedAt) },
        ...(dateOfBirth ? [{ label: 'Date of birth', value: fmt.date(dateOfBirth) }] : []),
        ...(guardian ? [{ label: 'Parent / guardian', value: fullName(guardian) }] : []),
      ]}
      footer={`Published ${fmt.date(result.publishedAt)}. Grading: ${key.join(' · ')}. AB = absent.`}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs print:text-black">
            <th className="py-2 font-medium">Subject</th>
            <th className="py-2 text-right font-medium">Max</th>
            <th className="py-2 text-right font-medium">Pass</th>
            <th className="py-2 text-right font-medium">Obtained</th>
            <th className="py-2 text-right font-medium">%</th>
            <th className="py-2 text-center font-medium">Grade</th>
            <th className="py-2 pl-3 font-medium">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {result.subjects.map((s) => (
            <tr key={s.name} className="border-b last:border-0">
              <td className="py-2">{s.name}</td>
              <td className="py-2 text-right tabular-nums">{marksLabel(s.maxMarks)}</td>
              <td className="py-2 text-right tabular-nums">{marksLabel(s.passMarks)}</td>
              <td className={cn('py-2 text-right font-medium tabular-nums', !s.passed && 'text-destructive print:text-black print:underline')}>
                {s.isAbsent ? 'AB' : marksLabel(s.marksObtained)}
              </td>
              <td className="py-2 text-right tabular-nums">{s.isAbsent ? '—' : pctLabel(s.percentage)}</td>
              <td className="py-2 text-center font-semibold">{s.grade}</td>
              <td className="text-muted-foreground py-2 pl-3 text-xs print:text-black">{s.remarks ?? ''}</td>
            </tr>
          ))}
          <tr className="border-t-2 font-semibold">
            <td className="py-2">Total</td>
            <td className="py-2 text-right tabular-nums">{marksLabel(result.totalMax)}</td>
            <td />
            <td className="py-2 text-right tabular-nums">{marksLabel(result.totalObtained)}</td>
            <td className="py-2 text-right tabular-nums">{pctLabel(result.percentage)}</td>
            <td className="py-2 text-center">{result.grade}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <dl className={cn('grid gap-3 rounded-lg border p-4 text-sm', showPositions ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3')}>
        <div>
          <dt className="text-muted-foreground text-xs print:text-black">Percentage</dt>
          <dd className="text-xl font-semibold tabular-nums">{pctLabel(result.percentage)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs print:text-black">Grade</dt>
          <dd className="text-xl font-semibold">
            {result.grade}
            {result.remark && <span className="text-muted-foreground ml-1.5 text-xs font-normal print:text-black">{result.remark}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs print:text-black">Result</dt>
          <dd className={cn('text-xl font-semibold', passed ? 'text-success' : 'text-destructive', 'print:text-black')}>{passed ? 'Pass' : 'Fail'}</dd>
        </div>
        {showPositions && result.classRank && (
          <div>
            <dt className="text-muted-foreground text-xs print:text-black">Position</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {ordinal(result.classRank)}
              <span className="text-muted-foreground ml-1 text-xs font-normal print:text-black">
                of {result.classSize}
                {result.sectionRank ? ` · ${ordinal(result.sectionRank)} in section` : ''}
              </span>
            </dd>
          </div>
        )}
      </dl>

      <div className="grid grid-cols-3 gap-8 pt-10 text-center text-xs">
        {['Class teacher', 'Principal', 'Parent / guardian'].map((role) => (
          <div key={role} className="border-t pt-1.5 print:border-black">
            {role}
          </div>
        ))}
      </div>
    </PrintLayout>
  );
}

'use client';

import { Award, Percent, TrendingUp, Users } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { pctLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { ExamAnalysis } from '@/lib/api/types';
import { StudentLink } from '@/components/students/student-quick-view';
import type { RecordTab } from '@/components/students/student-records';

/** Bars are transforms (scaleX), never width animations, so they stay smooth. */
function Bar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const cls = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive' }[tone];
  return (
    <span className="bg-muted block h-2 overflow-hidden rounded-full" aria-hidden="true">
      <span className={cn('animate-grow-x block h-full origin-left rounded-full', cls)} style={{ transform: `scaleX(${Math.max(0, Math.min(1, value / 100))})` }} />
    </span>
  );
}

const passTone = (p: number) => (p >= 80 ? 'success' : p >= 50 ? 'warning' : 'danger');

export function AnalysisPanel({
  data,
  classComparison,
  resultsTab = 'exams',
}: {
  data: ExamAnalysis;
  classComparison?: ExamAnalysis['classes'];
  /** Which record a topper's name opens — tests for a unit test or mock. */
  resultsTab?: RecordTab;
}) {
  const maxGrade = Math.max(1, ...data.grades.map((g) => g.count));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Students" value={data.students} icon={Users} />
        <StatCard label="Pass rate" value={pctLabel(data.passPercent)} hint={`${data.passed} passed`} icon={Percent} tone={passTone(data.passPercent) === 'danger' ? 'danger' : 'success'} />
        <StatCard label="Class average" value={pctLabel(data.averagePercent)} icon={TrendingUp} />
        <StatCard label="Highest" value={pctLabel(data.highestPercent)} hint={`Lowest ${pctLabel(data.lowestPercent)}`} icon={Award} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section className="bg-card space-y-3 rounded-xl border p-5">
          <h2 className="text-sm font-semibold">Subjects</h2>
          <div className="text-muted-foreground grid grid-cols-[8rem_1fr_4.5rem_1fr_4.5rem] gap-3 text-xs">
            <span />
            <span>Average</span>
            <span />
            <span>Pass rate</span>
            <span />
          </div>
          <ul className="space-y-2.5">
            {data.subjects.map((s) => (
              <li key={s.name} className="grid grid-cols-[8rem_1fr_4.5rem_1fr_4.5rem] items-center gap-3 text-sm">
                <span className="truncate font-medium" title={s.name}>
                  {s.name}
                </span>
                <Bar value={s.averagePercent} />
                <span className="text-right tabular-nums">{pctLabel(s.averagePercent)}</span>
                <Bar value={s.passPercent} tone={passTone(s.passPercent)} />
                <span className="text-right tabular-nums">
                  {pctLabel(s.passPercent)}
                  {s.absent > 0 && <span className="text-muted-foreground block text-[0.6875rem]">{s.absent} absent</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card space-y-3 rounded-xl border p-5">
          <h2 className="text-sm font-semibold">Grade distribution</h2>
          <ul className="space-y-2">
            {data.grades.map((g) => (
              <li key={g.grade} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="font-semibold">{g.grade}</span>
                <span className="bg-muted block h-2 overflow-hidden rounded-full" aria-hidden="true">
                  <span className="bg-primary animate-grow-x block h-full origin-left rounded-full" style={{ transform: `scaleX(${g.count / maxGrade})` }} />
                </span>
                <span className="text-right tabular-nums">{g.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="bg-card space-y-3 rounded-xl border p-5">
          <h2 className="text-sm font-semibold">Top performers</h2>
          {data.toppers.length === 0 ? (
            <p className="text-muted-foreground text-sm">No results yet.</p>
          ) : (
            <ol className="space-y-2">
              {data.toppers.map((t, i) => (
                <li key={t._id} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      i === 0 ? 'bg-warning-soft text-warning-ink' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <StudentLink studentId={t.studentId} tab={resultsTab} className="block truncate font-medium">
                      {t.student.name}
                    </StudentLink>
                    <span className="text-muted-foreground block text-xs">
                      {t.className}
                      {t.sectionName ? ` · ${t.sectionName}` : ''}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-semibold">{pctLabel(t.percentage)}</span>
                    <span className="text-muted-foreground block text-xs">Grade {t.grade}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {classComparison && classComparison.length > 1 && (
          <section className="bg-card space-y-3 rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Classes compared</h2>
            <ul className="space-y-2.5">
              {classComparison.map((c) => (
                <li key={c.classId} className="grid grid-cols-[5.5rem_1fr_4.5rem_5.5rem] items-center gap-3 text-sm">
                  <span className="truncate font-medium">{c.className}</span>
                  <Bar value={c.averagePercent} />
                  <span className="text-right tabular-nums">{pctLabel(c.averagePercent)}</span>
                  <span className="text-muted-foreground text-right text-xs whitespace-nowrap tabular-nums">{pctLabel(c.passPercent)} pass</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

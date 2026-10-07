'use client';

import { PrintLayout } from '@/components/print/print-layout';
import { useSchoolFormat } from '@/lib/format';
import { monthLabel } from '@/lib/labels';
import type { Payslip } from '@/lib/api/types';

/**
 * The printed payslip. One component for the payroll office and for a staff
 * member reading their own, so both see — and print — exactly the same thing.
 * Everything comes from the payslip's own snapshot, never live records.
 */
export function PayslipDocument({ slip }: { slip: Payslip }) {
  const fmt = useSchoolFormat();
  const earnings = [{ name: 'Basic pay', amountMinor: slip.basicMinor }, ...slip.earnings];
  const deductions = [
    ...slip.deductions,
    ...(slip.unpaidLeaveDeductionMinor ? [{ name: `Unpaid leave (${slip.unpaidLeaveDays} of ${slip.daysInMonth} days)`, amountMinor: slip.unpaidLeaveDeductionMinor }] : []),
    ...(slip.advanceRecoveries.length
      ? [{ name: 'Advance recovery', amountMinor: slip.advanceRecoveries.reduce((s, a) => s + a.amountMinor, 0) }]
      : []),
  ];

  return (
    <PrintLayout
      title={`Payslip — ${monthLabel(slip.month)}`}
      schoolName={slip.schoolName ?? 'School'}
      meta={[
        { label: 'Employee', value: slip.employee.name },
        { label: 'Employee no.', value: <span className="font-mono">{slip.employee.employeeNumber}</span> },
        { label: 'Designation', value: [slip.employee.designation, slip.employee.department].filter(Boolean).join(' · ') || '—' },
        { label: 'Pay period', value: monthLabel(slip.month) },
        { label: 'Bank', value: slip.bank?.bankName ?? '—' },
        { label: 'Account', value: slip.bank?.accountNumber ? <span className="font-mono">{slip.bank.accountNumber}</span> : '—' },
      ]}
      footer={slip.status === 'PUBLISHED' ? 'This is a computer-generated payslip.' : `Status: ${slip.status.toLowerCase()} — not final.`}
    >
      <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
        <Column title="Earnings" rows={earnings} total={['Gross pay', slip.grossMinor]} money={fmt.money} />
        <Column title="Deductions" rows={deductions} total={['Total deductions', slip.totalDeductionsMinor]} money={fmt.money} />
      </div>
      {slip.adjustments.length > 0 && (
        <div className="space-y-1 border-t pt-3 text-sm">
          {slip.adjustments.map((a, i) => (
            <p key={i} className="flex justify-between">
              <span>{a.label}</span>
              <span className="tabular-nums">{a.amountMinor < 0 ? `−${fmt.money(-a.amountMinor)}` : `+${fmt.money(a.amountMinor)}`}</span>
            </p>
          ))}
        </div>
      )}
      <p className="bg-muted/60 flex items-baseline justify-between rounded-lg px-4 py-3 print:border print:bg-white">
        <span className="font-semibold">Net pay</span>
        <span className="text-2xl font-semibold tabular-nums">{fmt.money(slip.netMinor)}</span>
      </p>
    </PrintLayout>
  );
}

function Column({
  title,
  rows,
  total,
  money,
}: {
  title: string;
  rows: { name: string; amountMinor: number }[];
  total: [string, number];
  money: (n: number) => string;
}) {
  return (
    <div className="space-y-2 text-sm">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase print:text-black">{title}</h3>
      <ul className="space-y-1.5">
        {rows.length === 0 && <li className="text-muted-foreground">None</li>}
        {rows.map((r, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>{r.name}</span>
            <span className="tabular-nums">{money(r.amountMinor)}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between border-t pt-1.5 font-semibold">
        <span>{total[0]}</span>
        <span className="tabular-nums">{money(total[1])}</span>
      </p>
    </div>
  );
}

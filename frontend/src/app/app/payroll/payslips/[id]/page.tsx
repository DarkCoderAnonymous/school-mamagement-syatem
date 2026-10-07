'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PayslipDocument } from '@/components/payroll/payslip-document';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { monthLabel } from '@/lib/labels';
import { getPayslip } from '@/lib/api/finance';

export default function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useQuery({ queryKey: ['payslips', id], queryFn: () => getPayslip(id) });
  if (query.isLoading) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-xl" />;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this payslip" />
      </div>
    );
  }
  const slip = query.data;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="print:hidden">
        <PageHeader
          title={slip.employee.name}
          description={`Payslip for ${monthLabel(slip.month)}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/app' },
            { label: 'Payroll', href: '/app/payroll' },
            { label: monthLabel(slip.month), href: `/app/payroll/runs/${slip.payrollRunId}` },
            { label: slip.employee.name },
          ]}
          action={
            <Button onClick={() => window.print()}>
              <Printer className="size-4" />
              Print
            </Button>
          }
        />
      </div>
      <PayslipDocument slip={slip} />
    </div>
  );
}

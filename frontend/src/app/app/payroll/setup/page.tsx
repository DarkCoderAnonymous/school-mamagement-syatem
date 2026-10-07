'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { StaffSalariesTab } from './staff-tab';
import { ComponentsTab } from './components-tab';
import { AdvancesTab } from './advances-tab';

export default function PayrollSetupPage() {
  const url = useUrlState();
  const tab = url.get('tab') ?? 'staff';
  return (
    <div className="space-y-6">
      <PageHeader
        title="Salaries & advances"
        description="Who is paid what, the allowances and deductions that make it up, and advances being repaid."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Payroll', href: '/app/payroll' }, { label: 'Salaries & advances' }]}
      />
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'staff' ? undefined : String(v), page: undefined, search: undefined })}>
        <TabsList>
          <TabsTrigger value="staff">Staff & salaries</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
        </TabsList>
        <TabsContent value="staff" className="pt-4"><StaffSalariesTab /></TabsContent>
        <TabsContent value="components" className="pt-4"><ComponentsTab /></TabsContent>
        <TabsContent value="advances" className="pt-4"><AdvancesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

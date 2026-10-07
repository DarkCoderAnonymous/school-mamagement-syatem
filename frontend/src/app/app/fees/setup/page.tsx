'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { FeeHeadsTab } from './heads-tab';
import { FeeStructuresTab } from './structures-tab';
import { ConcessionsTab } from './concessions-tab';
import { FeeSettingsTab } from './settings-tab';

const TABS = [
  { value: 'structures', label: 'Class fees' },
  { value: 'heads', label: 'Fee heads' },
  { value: 'concessions', label: 'Concessions' },
  { value: 'settings', label: 'Late fines & numbering' },
] as const;

export default function FeeSetupPage() {
  const url = useUrlState();
  const tab = url.get('tab') ?? 'structures';
  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee setup"
        description="What each class pays, the discounts some students get, and how late payments are fined."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Fee setup' }]}
      />
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'structures' ? undefined : String(v), page: undefined, search: undefined })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="structures" className="pt-4"><FeeStructuresTab /></TabsContent>
        <TabsContent value="heads" className="pt-4"><FeeHeadsTab /></TabsContent>
        <TabsContent value="concessions" className="pt-4"><ConcessionsTab /></TabsContent>
        <TabsContent value="settings" className="pt-4"><FeeSettingsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

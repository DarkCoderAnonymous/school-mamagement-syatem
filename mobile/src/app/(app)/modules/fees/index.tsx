import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDebounced } from '@/components/ui/form';
import { ChoiceChips, PagedList, SearchField, StatTile } from '@/components/ui/list';
import { Banner } from '@/components/ui/primitives';
import { errorText, FEES_KEY, fullName, InvoiceRow } from '@/components/fees/fee-ui';
import {
  getStudentDues,
  listInvoices,
  type FeeInvoice,
  type InvoiceStatusFilter,
} from '@/lib/api/fees';
import { useSession } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import { can } from '@/lib/modules';

const STATUS_OPTIONS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Part paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/**
 * Look up fees: every invoice, searchable by student or invoice number and
 * filtered by status. Opened with `studentId` (from Students or Defaulters)
 * it shows just that student's invoices under a dues summary.
 */
export default function InvoicesScreen() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const { user } = useSession();
  const canRead = can(user?.permissions, Permission.FEE_INVOICE_READ);
  const canCollect = can(user?.permissions, Permission.FEE_PAYMENT_RECORD);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [status, setStatus] = useState<InvoiceStatusFilter>();

  const dues = useQuery({
    queryKey: [FEES_KEY, 'dues', studentId],
    queryFn: () => getStudentDues(studentId!),
    enabled: Boolean(studentId) && canRead,
  });

  if (!canRead) {
    return (
      <View className="flex-1 bg-background px-4 pt-3">
        <Stack.Screen options={{ title: 'Invoices' }} />
        <Banner tone="warning" icon="lock" title="Not available">
          Your role can’t look up fee invoices.
        </Banner>
      </View>
    );
  }

  const d = dues.data;
  const title = studentId ? (d ? fullName(d.student) : 'Student fees') : 'Invoices';

  const header = (
    <View className="gap-3 pb-1">
      {studentId ? (
        dues.isError ? (
          <Banner tone="danger" title="Couldn't load this student's dues">
            {errorText(dues.error)}
          </Banner>
        ) : d ? (
          <Card className="gap-3 p-4">
            <View className="gap-0.5">
              <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
                {fullName(d.student)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {d.student.admissionNumber}
                {d.student.classId ? ` · ${d.student.classId.name}` : ''}
                {d.student.sectionId ? ` ${d.student.sectionId.name}` : ''}
              </Text>
            </View>
            <View className="flex-row gap-2.5">
              <StatTile
                label="Total due"
                value={formatMoney(d.totalDueMinor, d.currency)}
                hint={`${d.invoices.length} open invoice${d.invoices.length === 1 ? '' : 's'}`}
              />
              <StatTile
                label="Overdue"
                value={formatMoney(d.overdueMinor, d.currency)}
                tone={d.overdueMinor > 0 ? 'danger' : 'default'}
                hint={d.overdueMinor > 0 ? 'Past due date' : 'Nothing overdue'}
              />
            </View>
            {canCollect && d.totalDueMinor > 0 && (
              <Button
                label="Collect payment"
                icon="fees"
                onPress={() =>
                  router.push({ pathname: '/modules/fees/collect', params: { studentId } })
                }
              />
            )}
          </Card>
        ) : null
      ) : (
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Student name, admission or invoice no."
        />
      )}
      <ChoiceChips
        label="Invoice status"
        options={STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title }} />
      <PagedList<FeeInvoice>
        queryKey={[
          FEES_KEY,
          'invoices',
          {
            studentId: studentId ?? null,
            search: studentId ? '' : debounced,
            status: status ?? null,
          },
        ]}
        fetchPage={(page) =>
          listInvoices({
            page,
            limit: 20,
            studentId: studentId || undefined,
            search: !studentId && debounced ? debounced : undefined,
            status,
          })
        }
        keyExtractor={(inv) => inv._id}
        header={header}
        empty={
          debounced || status
            ? {
                icon: 'search',
                title: 'No matching invoices',
                description: 'Try another name or status.',
              }
            : {
                icon: 'receipt',
                title: 'No invoices yet',
                description: studentId
                  ? 'Nothing has been billed to this student.'
                  : 'Invoices appear here once fees are generated.',
              }
        }
        renderItem={(inv) => <InvoiceRow invoice={inv} showStudent={!studentId} />}
      />
    </View>
  );
}

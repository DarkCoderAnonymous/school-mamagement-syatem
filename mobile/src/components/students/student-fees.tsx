import { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChoiceChips, ListRow, StatTile } from '@/components/ui/list';
import { Banner, EmptyState, SectionTitle } from '@/components/ui/primitives';
import { errorText, FEES_KEY, InvoiceRow, METHOD_LABEL } from '@/components/fees/fee-ui';
import { getStudentDues, listInvoices, type InvoiceStatusFilter } from '@/lib/api/fees';
import { useSession } from '@/lib/auth-context';
import { formatDate, formatMoney } from '@/lib/format';
import { can } from '@/lib/modules';

const STATUS_OPTIONS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: 'OPEN', label: 'Still due' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

/** A student's fees: what's due, every invoice (filtered by status) and recent receipts. */
export function StudentFees({ studentId }: { studentId: string }) {
  const { user } = useSession();
  const canCollect = can(user?.permissions, Permission.FEE_PAYMENT_RECORD);
  const [status, setStatus] = useState<InvoiceStatusFilter>();

  const dues = useQuery({
    queryKey: [FEES_KEY, 'dues', studentId],
    queryFn: () => getStudentDues(studentId),
  });
  const invoices = useInfiniteQuery({
    // Same key as the Invoices screen opened for this student, so the two share a cache.
    queryKey: [FEES_KEY, 'invoices', { studentId, search: '', status: status ?? null }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listInvoices({ page: pageParam, limit: 20, studentId, status }),
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });
  const items = invoices.data?.pages.flatMap((p) => p.items) ?? [];
  const d = dues.data;
  const money = (minor: number) => formatMoney(minor, d?.currency);

  return (
    <View className="gap-5">
      {dues.isError ? (
        <Banner tone="danger" title="Couldn't load this student's dues">
          {errorText(dues.error)}
        </Banner>
      ) : !d ? (
        <Card className="h-28 opacity-60" />
      ) : (
        <View className="gap-3">
          <View className="flex-row gap-2.5">
            <StatTile
              label="Total due"
              value={money(d.totalDueMinor)}
              hint={`${d.invoices.length} open invoice${d.invoices.length === 1 ? '' : 's'}`}
            />
            <StatTile
              label="Overdue"
              value={money(d.overdueMinor)}
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
          {d.concessions.length > 0 && (
            <Text className="px-1 text-xs text-muted-foreground">
              Concessions:{' '}
              {d.concessions
                .map((c) => `${c.name} (${c.type === 'PERCENT' ? `${c.value}%` : money(c.value)})`)
                .join(', ')}
            </Text>
          )}
        </View>
      )}

      <View className="gap-2.5">
        <SectionTitle title="Invoices" />
        <ChoiceChips
          label="Invoice status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
        />
        {invoices.isLoading ? (
          <Card className="h-24 opacity-60" />
        ) : invoices.isError ? (
          <Banner tone="danger" title="Couldn't load invoices">
            Pull down to try again.
          </Banner>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon="receipt"
              title={status ? 'No invoices match' : 'No invoices yet'}
              description={
                status ? 'Try another status.' : 'Nothing has been billed to this student.'
              }
            />
          </Card>
        ) : (
          <View className="gap-2">
            {items.map((inv) => (
              <InvoiceRow key={inv._id} invoice={inv} showStudent={false} />
            ))}
          </View>
        )}
        {invoices.hasNextPage && (
          <Button
            label="Show more"
            variant="outline"
            size="sm"
            loading={invoices.isFetchingNextPage}
            onPress={() => invoices.fetchNextPage()}
          />
        )}
      </View>

      {d && d.recentPayments.length > 0 && (
        <View className="gap-2.5">
          <SectionTitle title="Recent receipts" />
          <Card className="overflow-hidden">
            {d.recentPayments.map((p, i, all) => (
              <ListRow
                key={p._id}
                icon="receipt"
                title={p.receiptNumber}
                subtitle={`${formatDate(p.paidAt)} · ${METHOD_LABEL[p.method]}`}
                trailing={
                  <Text
                    className={`text-sm font-semibold ${p.status === 'REVERSED' ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                  >
                    {money(p.netMinor)}
                  </Text>
                }
                accessibilityLabel={`Receipt ${p.receiptNumber}, ${money(p.netMinor)}${p.status === 'REVERSED' ? ', reversed' : ''}`}
                onPress={() =>
                  router.push({ pathname: '/modules/fees/receipt/[id]', params: { id: p._id } })
                }
                last={i === all.length - 1}
              />
            ))}
          </Card>
        </View>
      )}
    </View>
  );
}

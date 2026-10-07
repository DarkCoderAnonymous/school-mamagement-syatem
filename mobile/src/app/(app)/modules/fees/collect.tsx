import { useMemo, useRef, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateField, FormSection, MoneyField, useDebounced } from '@/components/ui/form';
import { Avatar, ChoiceChips, ListRow, SearchField } from '@/components/ui/list';
import { Banner, EmptyState, SectionTitle } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { errorText, FEES_KEY, fullName, invalidateFees, InvoicePill, METHOD_LABEL, METHOD_OPTIONS, newAttemptKey } from '@/components/fees/fee-ui';
import { getInvoice, getStudentDues, recordPayment, searchStudents, type FeeInvoice, type PaymentMethod } from '@/lib/api/fees';
import { useSession } from '@/lib/auth-context';
import { formatDate, formatMoney, parseMoney } from '@/lib/format';
import { can } from '@/lib/modules';
import { useTheme } from '@/lib/theme';

/** Today as the DateField's "Today" shortcut computes it, so the shortcut shows selected. */
const todayDay = () => new Date().toISOString().slice(0, 10);
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
/** Minor units → the major-unit text the MoneyField edits ("1250.50"). Display only. */
const toMajorText = (minor: number) => (minor / 100).toFixed(2);

/**
 * Take a payment at the counter, like the web collect screen: find the
 * student, tick what they're paying, enter the amount (defaults to the
 * selected balance), method and date, confirm, and land on the receipt.
 * Opened with `studentId` or `invoiceId` it skips the search.
 */
export default function CollectFeesScreen() {
  const params = useLocalSearchParams<{ studentId?: string; invoiceId?: string }>();
  const theme = useTheme();
  const { user } = useSession();
  const perms = user?.permissions;
  const allowed = can(perms, Permission.FEE_PAYMENT_RECORD) && can(perms, Permission.FEE_INVOICE_READ);
  const queryClient = useQueryClient();

  const [pickedId, setPickedId] = useState<string | null>(params.studentId || null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());

  // An invoice link without a student: look the invoice up to find whose it is.
  const viaInvoice = useQuery({
    queryKey: [FEES_KEY, 'invoice', params.invoiceId],
    queryFn: () => getInvoice(params.invoiceId!),
    enabled: allowed && !pickedId && Boolean(params.invoiceId),
  });
  const studentId = pickedId ?? viaInvoice.data?.studentId?._id ?? null;

  const results = useQuery({
    queryKey: [FEES_KEY, 'student-search', debounced],
    queryFn: () => searchStudents(debounced),
    enabled: allowed && !studentId && debounced.length >= 2 && can(perms, Permission.STUDENT_READ),
  });

  const dues = useQuery({ queryKey: [FEES_KEY, 'dues', studentId], queryFn: () => getStudentDues(studentId!), enabled: allowed && Boolean(studentId) });
  const invoices = useMemo(() => dues.data?.invoices ?? [], [dues.data]);

  const [selected, setSelected] = useState<string[]>([]);
  const [amountText, setAmountText] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [day, setDay] = useState(todayDay);
  const [attemptKey, setAttemptKey] = useState(newAttemptKey);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  // Fresh dues (new student, or refetched): select the linked invoice if it's open, else everything open.
  const [synced, setSynced] = useState<FeeInvoice[] | null>(null);
  if (synced !== invoices) {
    setSynced(invoices);
    const linked = params.invoiceId && invoices.some((i) => i._id === params.invoiceId) ? [params.invoiceId] : null;
    setSelected(linked ?? invoices.map((i) => i._id));
    setAmountTouched(false);
  }

  const currency = dues.data?.currency;
  const money = (minor: number) => formatMoney(minor, currency);
  const chosen = invoices.filter((i) => selected.includes(i._id));
  // What the server will check against; shown so the cashier sees the default. The server re-checks.
  const selectedTotal = chosen.reduce((s, i) => s + i.balanceMinor, 0);
  const amount = amountTouched ? parseMoney(amountText) : selectedTotal;
  const today = todayDay();
  const dayError = !isDay(day) ? 'Use the format YYYY-MM-DD' : day > today ? "A payment can't be dated in the future" : undefined;
  const amountError =
    amountTouched && amountText.trim() && amount === null
      ? 'Enter an amount like 1250 or 1250.50'
      : amount !== null && amount > selectedTotal && chosen.length > 0
        ? `That's more than the selected invoices come to (${money(selectedTotal)})`
        : undefined;
  const valid = chosen.length > 0 && amount !== null && amount > 0 && amount <= selectedTotal && !dayError;

  const pay = useMutation({
    mutationFn: () =>
      recordPayment({
        studentId: studentId!,
        amountMinor: amount!,
        method,
        reference: method !== 'CASH' && reference.trim() ? reference.trim() : undefined,
        // Today means "now"; a back-dated payment is stamped midday UTC so it stays on that calendar day.
        paidAt: day === today ? undefined : `${day}T12:00:00.000Z`,
        invoiceIds: chosen.map((i) => i._id),
        idempotencyKey: attemptKey,
      }),
    onSuccess: (payment) => {
      setError(null);
      // Refresh in the background; the receipt fetches its own copy.
      void invalidateFees(queryClient);
      router.replace({ pathname: '/modules/fees/receipt/[id]', params: { id: payment._id } });
    },
    onError: (err) => setError(errorText(err, "Couldn't record the payment. Check your connection and try again.")),
    onSettled: () => {
      submitting.current = false;
    },
  });

  const choose = (id: string | null) => {
    setPickedId(id);
    setSearch('');
    setError(null);
    setReference('');
    setAttemptKey(newAttemptKey());
  };

  const confirm = () => {
    if (!valid || submitting.current || pay.isPending || !dues.data) return;
    const who = fullName(dues.data.student);
    const part = amount! < selectedTotal ? ` (part payment — ${money(selectedTotal - amount!)} stays due)` : '';
    Alert.alert(
      `Receive ${money(amount!)}?`,
      `${METHOD_LABEL[method]} from ${who} against ${chosen.length} invoice${chosen.length === 1 ? '' : 's'}${part}.${day === today ? '' : `\nDated ${formatDate(day)}.`}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Receive',
          onPress: () => {
            if (submitting.current) return;
            submitting.current = true;
            pay.mutate();
          },
        },
      ],
    );
  };

  if (!allowed) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ title: 'Collect fees' }} />
        <Banner tone="warning" icon="lock" title="Not available">
          Your role can’t record fee payments.
        </Banner>
      </Screen>
    );
  }

  const showForm = Boolean(dues.data && invoices.length > 0);

  return (
    <Screen
      edges={showForm ? ['bottom'] : []}
      onRefresh={studentId ? () => dues.refetch() : undefined}
      footer={
        showForm ? (
          <View className="gap-2 border-t border-border bg-card px-4 pb-2 pt-3">
            {error && (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-center text-sm text-destructive">
                {error}
              </Text>
            )}
            <Button
              label={amount !== null && amount > 0 ? `Receive ${money(amount)}` : 'Receive payment'}
              icon="fees"
              loading={pay.isPending}
              disabled={!valid}
              onPress={confirm}
            />
          </View>
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: 'Collect fees' }} />

      {!studentId ? (
        <View className="gap-3">
          {params.invoiceId && viaInvoice.isLoading ? (
            <ActivityIndicator className="py-10" color={theme.mutedForeground} />
          ) : (
            <>
              {viaInvoice.isError && (
                <Banner tone="danger" title="Couldn't open that invoice">
                  {errorText(viaInvoice.error)}
                </Banner>
              )}
              {can(perms, Permission.STUDENT_READ) ? (
                <>
                  <SearchField value={search} onChangeText={setSearch} placeholder="Student name or admission no." />
                  {debounced.length < 2 ? (
                    <EmptyState icon="fees" title="Find the student" description="Type at least two letters of a name, or an admission number, to see their dues." />
                  ) : results.isLoading ? (
                    <ActivityIndicator className="py-8" color={theme.mutedForeground} />
                  ) : results.isError ? (
                    <Banner tone="danger" title="Couldn't search students">
                      {errorText(results.error)}
                    </Banner>
                  ) : (results.data?.items.length ?? 0) === 0 ? (
                    <EmptyState icon="search" title="No students found" description="Check the spelling or try the admission number." />
                  ) : (
                    <Card className="overflow-hidden">
                      {results.data!.items.map((s, i, all) => (
                        <ListRow
                          key={s._id}
                          leading={<Avatar name={fullName(s)} size={36} />}
                          title={fullName(s)}
                          subtitle={`${s.admissionNumber}${s.classId ? ` · ${s.classId.name}` : ''}${s.sectionId ? ` ${s.sectionId.name}` : ''}`}
                          onPress={() => choose(s._id)}
                          last={i === all.length - 1}
                        />
                      ))}
                    </Card>
                  )}
                </>
              ) : (
                <Banner tone="info" title="Open a student first">
                  Your role can’t search students — collect from an invoice or the defaulters list instead.
                </Banner>
              )}
            </>
          )}
        </View>
      ) : dues.isLoading ? (
        <ActivityIndicator className="py-10" color={theme.mutedForeground} />
      ) : dues.isError || !dues.data ? (
        <View className="gap-3">
          <Banner tone="danger" title="Couldn't load this student's dues">
            {errorText(dues.error)}
          </Banner>
          <Button label="Try again" variant="outline" onPress={() => void dues.refetch()} />
          <Button label="Choose another student" variant="ghost" onPress={() => choose(null)} />
        </View>
      ) : (
        <>
          <Card className="flex-row items-center gap-3 p-4">
            <Avatar name={fullName(dues.data.student)} />
            <View className="flex-1 gap-0.5">
              <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
                {fullName(dues.data.student)}
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {dues.data.student.admissionNumber}
                {dues.data.student.classId ? ` · ${dues.data.student.classId.name}` : ''}
                {dues.data.student.sectionId ? ` ${dues.data.student.sectionId.name}` : ''}
              </Text>
              <Text className="text-xs text-foreground">
                {money(dues.data.totalDueMinor)} due
                {dues.data.overdueMinor > 0 ? <Text className="text-destructive"> · {money(dues.data.overdueMinor)} overdue</Text> : null}
              </Text>
            </View>
            {!params.studentId && !params.invoiceId && (
              <Button label="Change" variant="ghost" size="sm" onPress={() => choose(null)} accessibilityLabel="Choose another student" />
            )}
          </Card>

          {invoices.length === 0 ? (
            <EmptyState icon="check" title="Nothing owed" description="This student is fully paid up." />
          ) : (
            <>
              <View className="gap-2.5">
                <SectionTitle
                  title="Open dues"
                  action={
                    invoices.length > 1 ? (
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={10}
                        onPress={() => setSelected(selected.length === invoices.length ? [] : invoices.map((i) => i._id))}
                      >
                        <Text className="text-xs font-semibold text-primary">{selected.length === invoices.length ? 'Clear' : 'Select all'}</Text>
                      </Pressable>
                    ) : undefined
                  }
                />
                <Card className="overflow-hidden">
                  {invoices.map((inv, i) => {
                    const on = selected.includes(inv._id);
                    return (
                      <Pressable
                        key={inv._id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${inv.periodLabel}, ${inv.invoiceNumber}, balance ${money(inv.balanceMinor)}${inv.isOverdue ? ', overdue' : ''}`}
                        onPress={() => {
                          setSelected(on ? selected.filter((x) => x !== inv._id) : [...selected, inv._id]);
                          setAmountTouched(false);
                        }}
                        className={`min-h-[60px] flex-row items-center gap-3 px-4 py-3 ${on ? 'bg-primary/10' : 'active:bg-muted'} ${i === invoices.length - 1 ? '' : 'border-b border-border'}`}
                      >
                        <View className={`size-6 items-center justify-center rounded-md border ${on ? 'border-primary bg-primary' : 'border-input bg-card'}`}>
                          {on && <Text className="text-sm font-bold text-primary-foreground">✓</Text>}
                        </View>
                        <View className="flex-1 gap-0.5">
                          <Text className="text-sm font-medium text-foreground">{inv.periodLabel}</Text>
                          <Text className="text-xs text-muted-foreground">
                            {inv.invoiceNumber} · due {formatDate(inv.dueDate)}
                          </Text>
                        </View>
                        <View className="items-end gap-1">
                          <Text className="text-sm font-semibold text-foreground">{money(inv.balanceMinor)}</Text>
                          <InvoicePill invoice={inv} />
                        </View>
                      </Pressable>
                    );
                  })}
                </Card>
                {dues.data.concessions.length > 0 && (
                  <Text className="px-1 text-xs text-muted-foreground">
                    Standing concessions: {dues.data.concessions.map((c) => `${c.name} (${c.type === 'PERCENT' ? `${c.value}%` : money(c.value)})`).join(', ')}
                  </Text>
                )}
              </View>

              <FormSection title="Payment">
                <MoneyField
                  label="Amount received"
                  value={amountTouched ? amountText : toMajorText(selectedTotal)}
                  onChange={(v) => {
                    setAmountText(v);
                    setAmountTouched(true);
                  }}
                  error={amountError}
                  hint={chosen.length ? `Selected invoices: ${money(selectedTotal)}. A smaller amount is a part payment.` : 'Select at least one invoice.'}
                />
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-foreground">Method</Text>
                  <ChoiceChips label="Payment method" options={METHOD_OPTIONS} value={method} onChange={(v) => v && setMethod(v)} />
                </View>
                {method !== 'CASH' && (
                  <TextField
                    label="Reference (optional)"
                    value={reference}
                    onChangeText={setReference}
                    maxLength={80}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="Cheque, transfer or card slip number"
                  />
                )}
                <DateField label="Date received" value={day} onChange={setDay} error={isDay(day) ? dayError : undefined} />
              </FormSection>
            </>
          )}

          {dues.data.recentPayments.length > 0 && (
            <View className="gap-2.5">
              <SectionTitle title="Recent payments" />
              <Card className="overflow-hidden">
                {dues.data.recentPayments.map((p, i, all) => (
                  <ListRow
                    key={p._id}
                    icon="receipt"
                    title={p.receiptNumber}
                    subtitle={`${formatDate(p.paidAt)} · ${METHOD_LABEL[p.method]}`}
                    trailing={
                      <Text className={`text-sm font-semibold ${p.status === 'REVERSED' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {money(p.netMinor)}
                      </Text>
                    }
                    accessibilityLabel={`Receipt ${p.receiptNumber}, ${money(p.netMinor)}${p.status === 'REVERSED' ? ', reversed' : ''}`}
                    onPress={() => router.push({ pathname: '/modules/fees/receipt/[id]', params: { id: p._id } })}
                    last={i === all.length - 1}
                  />
                ))}
              </Card>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

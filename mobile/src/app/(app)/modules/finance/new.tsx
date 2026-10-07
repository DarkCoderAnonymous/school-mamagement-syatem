import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DateField, FormSection, MoneyField, OptionPicker } from '@/components/ui/form';
import { ChoiceChips } from '@/components/ui/list';
import { Banner } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/text-field';
import { ApiRequestError } from '@/lib/api/http';
import { createLedgerEntry, listFinanceCategories, PAYMENT_METHOD_LABEL, type LedgerType, type PaymentMethod } from '@/lib/api/management';
import { parseMoney } from '@/lib/format';

const todayUtc = () => new Date().toISOString().slice(0, 10);
const TYPES: { value: LedgerType; label: string }[] = [
  { value: 'EXPENSE', label: 'Expense' },
  { value: 'INCOME', label: 'Income' },
];
const METHODS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] }));
const MAX_MINOR = 100_000_000_000;

type Errors = Partial<Record<'category' | 'amount' | 'date' | 'description', string>>;

/**
 * Record an expense (a bill, a repair, a purchase) or non-fee income (a
 * donation, a hall rental), mirroring the web form. Fees are never entered
 * here — they reach the totals from their own receipts.
 */
export default function NewLedgerEntryScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const queryClient = useQueryClient();
  const [type, setType] = useState<LedgerType>(params.type === 'INCOME' ? 'INCOME' : 'EXPENSE');
  const [categoryId, setCategoryId] = useState<string>();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayUtc);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [description, setDescription] = useState('');
  const [party, setParty] = useState('');
  const [reference, setReference] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();
  // The server allows up to a day ahead (timezones); measured from when the form opened.
  const [latestDay] = useState(() => Date.now() + 86_400_000);

  const categories = useQuery({ queryKey: ['finance', 'categories'], queryFn: () => listFinanceCategories({ limit: 100 }), staleTime: 60_000 });
  // System categories (payroll postings) are written by the server, never by hand.
  const options = (categories.data?.items ?? []).filter((c) => c.type === type && !c.isSystem).map((c) => ({ value: c._id, label: c.name }));

  const amountMinor = parseMoney(amount);
  const errors: Errors = {};
  if (!categoryId || !options.some((o) => o.value === categoryId)) errors.category = 'Pick a category';
  if (amountMinor === null || amountMinor < 1) errors.amount = 'Enter an amount above zero, like 1250.50';
  else if (amountMinor > MAX_MINOR) errors.amount = 'That amount is too large';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors.date = 'Use the format YYYY-MM-DD';
  else if (Date.parse(`${date}T00:00:00Z`) > latestDay) errors.date = "The date can't be in the future";
  if (!description.trim()) errors.description = 'Say what it was for';
  const valid = Object.keys(errors).length === 0;
  const shown = (k: keyof Errors) => (submitted ? errors[k] : undefined);

  const save = useMutation({
    mutationFn: () =>
      createLedgerEntry({
        type,
        categoryId: categoryId!,
        amountMinor: amountMinor!,
        date: new Date(`${date}T00:00:00.000Z`).toISOString(),
        description: description.trim(),
        party: party.trim() || undefined,
        method,
        reference: reference.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['finance'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })]);
      router.back();
    },
    onError: (err) => setServerError(err instanceof ApiRequestError ? err.message : 'Check your connection and try again.'),
  });

  const submit = () => {
    setSubmitted(true);
    setServerError(undefined);
    if (valid) save.mutate();
  };

  const expense = type === 'EXPENSE';

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <Stack.Screen options={{ title: expense ? 'Record expense' : 'Record income' }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-6 px-4 pb-8 pt-3" keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
          <FormSection>
            <ChoiceChips
              label="Entry type"
              options={TYPES}
              value={type}
              onChange={(v) => {
                if (!v || v === type) return;
                setType(v);
                setCategoryId(undefined);
              }}
            />
            <OptionPicker
              label="Category"
              value={categoryId}
              options={options}
              onChange={setCategoryId}
              placeholder={categories.isLoading ? 'Loading categories…' : 'Choose a category'}
              disabled={categories.isLoading}
              error={shown('category')}
            />
            {categories.isError && <Banner tone="danger">Couldn&apos;t load categories. Go back and try again.</Banner>}
            {categories.data && options.length === 0 && (
              <Banner tone="warning">{`No ${expense ? 'expense' : 'income'} categories yet — add one on the web first.`}</Banner>
            )}
            <MoneyField label="Amount" value={amount} onChange={setAmount} error={shown('amount')} />
            <DateField label="Date" value={date} onChange={setDate} error={shown('date')} />
            <FormSection title={expense ? 'Paid by' : 'Received by'}>
              <ChoiceChips label="Payment method" options={METHODS} value={method} onChange={(v) => v && setMethod(v)} />
            </FormSection>
          </FormSection>

          <FormSection title="Details">
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              maxLength={200}
              placeholder={expense ? 'e.g. Electricity bill — August' : 'e.g. Alumni donation for library'}
              error={shown('description')}
            />
            <TextField label={expense ? 'Paid to (optional)' : 'Received from (optional)'} value={party} onChangeText={setParty} maxLength={120} />
            <TextField label="Reference (optional)" value={reference} onChangeText={setReference} maxLength={60} hint="Bill, invoice or cheque number." />
          </FormSection>

          {serverError && (
            <Banner tone="danger" title="Couldn't record it">
              {serverError}
            </Banner>
          )}

          <Button label={expense ? 'Save expense' : 'Save income'} loading={save.isPending} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

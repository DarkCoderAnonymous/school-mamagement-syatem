import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { MoneyField } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { ChoiceChips } from '@/components/ui/list';
import { TextField } from '@/components/ui/text-field';
import { refundPayment, reversePayment, type FeePayment, type PaymentMethod } from '@/lib/api/fees';
import { formatMoney, parseMoney } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { errorText, invalidateFees, METHOD_OPTIONS } from './fee-ui';

export type MoneyBackMode = 'refund' | 'reverse';

/**
 * Refund (money handed back, up to the net paid; the receipt stays valid) or
 * reverse (a payment recorded in error; the whole receipt is voided). Both
 * need a reason and a confirmation — money records are never edited.
 */
export function MoneyBackSheet({ payment, mode, onClose }: { payment: FeePayment; mode: MoneyBackMode | null; onClose: () => void }) {
  return (
    <Modal visible={mode !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {mode && <SheetBody key={mode} payment={payment} mode={mode} onClose={onClose} />}
    </Modal>
  );
}

function SheetBody({ payment, mode, onClose }: { payment: FeePayment; mode: MoneyBackMode; onClose: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const money = (minor: number) => formatMoney(minor, payment.currency);
  const [amountText, setAmountText] = useState((payment.netMinor / 100).toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>(payment.method);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amount = parseMoney(amountText);
  const amountError =
    mode !== 'refund'
      ? undefined
      : amount === null
        ? 'Enter an amount like 1250 or 1250.50'
        : amount <= 0
          ? 'Amount must be more than zero'
          : amount > payment.netMinor
            ? `At most ${money(payment.netMinor)} can be refunded`
            : undefined;
  const reasonError = reason.trim().length > 0 && reason.trim().length < 3 ? 'Give a reason (3+ characters)' : undefined;
  const valid = reason.trim().length >= 3 && !amountError;

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'refund' ? refundPayment(payment._id, { amountMinor: amount!, method, reason: reason.trim() }) : reversePayment(payment._id, reason.trim()),
    onSuccess: () => {
      void invalidateFees(queryClient);
      onClose();
      Alert.alert(mode === 'refund' ? 'Refund recorded' : 'Payment reversed', 'The invoices it covered are open again for what was taken back.');
    },
    onError: (err) => setError(errorText(err, mode === 'refund' ? "Couldn't record the refund." : "Couldn't reverse the payment.")),
  });

  const submit = () => {
    if (!valid || mutation.isPending) return;
    Alert.alert(
      mode === 'refund' ? `Refund ${money(amount!)}?` : `Reverse ${payment.receiptNumber}?`,
      mode === 'refund'
        ? `Recorded as handed back by ${METHOD_OPTIONS.find((m) => m.value === method)?.label.toLowerCase()}. This can't be undone.`
        : `The whole receipt of ${money(payment.amountMinor)} is voided and its invoices reopen. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: mode === 'refund' ? 'Record refund' : 'Reverse', style: 'destructive', onPress: () => mutation.mutate() },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" style={{ backgroundColor: theme.background }}>
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <Text className="text-lg font-semibold text-foreground">{mode === 'refund' ? 'Refund payment' : 'Reverse payment'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} className="size-11 items-center justify-center rounded-full">
          <View className="size-9 items-center justify-center rounded-full bg-muted">
            <Icon name="close" size={16} color="foreground" />
          </View>
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="gap-4 px-4 py-4" keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-muted-foreground">
            {mode === 'refund'
              ? `Money handed back to the family — up to ${money(payment.netMinor)}. The receipt stays valid for the rest.`
              : 'For a payment recorded in error — a bounced cheque, the wrong student. The whole receipt is voided and its invoices reopen.'}
          </Text>
          {mode === 'refund' && (
            <>
              <MoneyField label="Amount" value={amountText} onChange={setAmountText} error={amountError} />
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-foreground">Refunded by</Text>
                <ChoiceChips label="Refund method" options={METHOD_OPTIONS} value={method} onChange={(v) => v && setMethod(v)} />
              </View>
            </>
          )}
          <TextField label="Reason" value={reason} onChangeText={setReason} maxLength={200} error={reasonError} placeholder={mode === 'refund' ? 'e.g. overpaid, sibling discount' : 'e.g. cheque bounced'} />
          {error && (
            <Text accessibilityRole="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {error}
            </Text>
          )}
          <Button
            label={mode === 'refund' ? 'Record refund' : 'Reverse payment'}
            variant="destructive"
            loading={mutation.isPending}
            disabled={!valid}
            onPress={submit}
          />
          <Button label="Cancel" variant="ghost" onPress={onClose} disabled={mutation.isPending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

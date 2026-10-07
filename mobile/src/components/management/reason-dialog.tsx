import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';

/**
 * A confirm dialog that needs a written reason (the server wants 3+
 * characters) — Alert.prompt is iOS-only, so this is the cross-platform twin.
 */
export function ReasonDialog({
  visible,
  title,
  description,
  placeholder,
  confirmLabel,
  destructive,
  pending,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  description: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const tooShort = reason.trim().length < 3;
  const close = () => {
    if (pending) return;
    setReason('');
    setTouched(false);
    onCancel();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable accessibilityLabel="Dismiss" onPress={close} className="flex-1 items-center justify-center bg-foreground/40 px-6">
          {/* Stop taps inside the card from dismissing it. */}
          <Pressable onPress={() => undefined} className="w-full max-w-md gap-4 rounded-2xl border border-border bg-card p-5" accessibilityViewIsModal>
            <View className="gap-1.5">
              <Text className="text-lg font-semibold text-foreground" accessibilityRole="header">
                {title}
              </Text>
              <Text className="text-sm text-muted-foreground">{description}</Text>
            </View>
            <TextField
              label="Reason"
              value={reason}
              onChangeText={setReason}
              placeholder={placeholder}
              maxLength={200}
              autoFocus
              error={touched && tooShort ? 'Give a reason (3 or more characters)' : undefined}
            />
            <View className="flex-row gap-2">
              <Button label="Cancel" variant="outline" className="flex-1" onPress={close} disabled={pending} />
              <Button
                label={confirmLabel}
                variant={destructive ? 'destructive' : 'primary'}
                className="flex-1"
                loading={pending}
                onPress={() => {
                  setTouched(true);
                  if (tooShort) return;
                  onConfirm(reason.trim());
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

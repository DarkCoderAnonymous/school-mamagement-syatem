import { useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/text-field';
import { forgotPassword } from '@/lib/api/auth';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.includes('@')) return setError('Enter a valid email address');

    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
        <Text className="text-center text-2xl font-semibold">Check your email</Text>
        <Text className="text-center text-sm text-muted-foreground">
          If an account exists for that address, we&apos;ve sent a link to reset the password.
        </Text>
        <Button label="Back to sign in" variant="outline" onPress={() => router.replace('/login')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6" keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          <View className="gap-1">
            <Text className="text-2xl font-semibold text-foreground">Forgot password</Text>
            <Text className="text-sm text-muted-foreground">We&apos;ll email you a reset link</Text>
          </View>

          {error && (
            <Banner tone="danger">{error}</Banner>
          )}

          <TextField
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Button label="Send reset link" loading={loading} onPress={onSubmit} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

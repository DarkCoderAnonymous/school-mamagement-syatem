import { useState } from 'react';
import { Link, router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { login } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { useSession } from '@/lib/auth-context';

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  NO_ACTIVE_MEMBERSHIP: 'This account is not active at any school. Contact your school.',
  SCHOOL_SUSPENDED: "Your school's account has been suspended. Contact your administrator.",
  SUBSCRIPTION_INACTIVE: "Your school's subscription is not active. Contact your administrator.",
  ACCOUNT_DISABLED: 'This account has been disabled.',
  TOO_MANY_REQUESTS: 'Too many login attempts. Try again in a few minutes.',
};

export default function LoginScreen() {
  const { signIn, setPendingSelection } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.includes('@')) return setError('Enter a valid email address');
    if (!password) return setError('Password is required');

    setLoading(true);
    try {
      const result = await login({ email, password });

      // A parent with children at two schools must choose which one to open
      // (ADR-001) — no tokens have been issued yet.
      if (result.kind === 'select-school') {
        setPendingSelection({
          selectionToken: result.selectionToken,
          memberships: result.memberships,
        });
        router.replace('/select-school');
        return;
      }

      await signIn(result.user, result.accessToken, result.refreshToken);
    } catch (err) {
      setError(err instanceof ApiRequestError ? (ERROR_MESSAGES[err.code] ?? err.message) : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6" keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          <View className="gap-1">
            <Text className="text-2xl font-semibold">Sign in</Text>
            <Text className="text-sm text-gray-500">Use your school-issued credentials</Text>
          </View>

          {error && (
            <View className="rounded-lg bg-red-50 p-3">
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          )}

          <TextField
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextField
            label="Password"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
          />

          <Button label={loading ? 'Signing in…' : 'Sign in'} loading={loading} onPress={onSubmit} />

          <Link href="/forgot-password" className="text-center text-sm text-gray-500">
            Forgot password?
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

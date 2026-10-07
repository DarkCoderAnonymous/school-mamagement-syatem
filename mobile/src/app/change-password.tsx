import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { AuthHeader } from '@/components/ui/auth-header';
import { Button } from '@/components/ui/button';
import { Banner } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/text-field';
import { changePassword } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { useSession } from '@/lib/auth-context';

export default function ChangePasswordScreen() {
  const { user, signOut } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!currentPassword) return setError('Current password is required');
    if (newPassword.length < 8) return setError('New password must be at least 8 characters');
    if (newPassword !== confirmPassword) return setError('Passwords do not match');

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      // The server ends every session on a password change, this one included
      // (ADR-005), so the stored tokens are dead — sign in again.
      await signOut();
      Alert.alert('Password updated', "For your security you've been signed out everywhere. Sign in with your new password.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6" keyboardShouldPersistTaps="handled">
        <View className="gap-5">
          <AuthHeader
            title="Set a new password"
            subtitle={
              user?.mustChangePassword
                ? 'You signed in with a temporary password. Choose your own before continuing.'
                : 'Update the password you use to sign in.'
            }
          />

          {error && <Banner tone="danger">{error}</Banner>}

          <TextField
            label="Current password"
            secureTextEntry
            autoCapitalize="none"
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <TextField
            label="New password"
            secureTextEntry
            autoCapitalize="none"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TextField
            label="Confirm new password"
            secureTextEntry
            autoCapitalize="none"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <Button label="Update password" loading={loading} onPress={onSubmit} />
          {user?.mustChangePassword ? (
            <Button label="Log out instead" variant="ghost" onPress={signOut} />
          ) : (
            <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { changePassword } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { useSession } from '@/lib/auth-context';

export default function ChangePasswordScreen() {
  const { user, refreshUser, signOut } = useSession();
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
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-1 justify-center px-6" keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          <View className="gap-1">
            <Text className="text-2xl font-semibold">Set a new password</Text>
            <Text className="text-sm text-gray-500">
              {user?.mustChangePassword
                ? 'You must change your temporary password before continuing.'
                : 'Update your password'}
            </Text>
          </View>

          {error && (
            <View className="rounded-lg bg-red-50 p-3">
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          )}

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
          <Button label="Log out instead" variant="outline" onPress={signOut} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

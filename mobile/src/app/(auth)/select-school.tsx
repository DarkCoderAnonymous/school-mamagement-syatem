import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { selectSchool } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { useSession } from '@/lib/auth-context';

/**
 * School picker for a person who belongs to more than one school — most often
 * on mobile, a parent with children at two schools (ADR-001).
 *
 * Reached only from a login that returned `kind: 'select-school'`. Without a
 * pending selection in the session there is nothing to choose, so a direct
 * visit goes back to sign-in rather than rendering an empty list.
 */
export default function SelectSchoolScreen() {
  const { pendingSelection, signIn, setPendingSelection } = useSession();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingSelection) router.replace('/login');
  }, [pendingSelection]);

  if (!pendingSelection) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const choose = async (schoolId: string) => {
    setError(null);
    setSubmitting(schoolId);
    try {
      const session = await selectSchool(pendingSelection.selectionToken, schoolId);
      await signIn(session.user, session.accessToken, session.refreshToken);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.code === 'UNAUTHORIZED'
            ? 'That took too long — sign in again.'
            : err.message
          : 'Something went wrong',
      );
      setSubmitting(null);
    }
  };

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-10">
      <View className="gap-4">
        <View className="gap-1">
          <Text className="text-2xl font-semibold">Choose a school</Text>
          <Text className="text-sm text-gray-500">
            Your account has access to more than one school. You can switch later.
          </Text>
        </View>

        {error && (
          <View className="rounded-lg bg-red-50 p-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        <View className="overflow-hidden rounded-xl border border-gray-200">
          {pendingSelection.memberships.map((membership, index) => (
            <Pressable
              key={membership.membershipId}
              onPress={() => void choose(membership.schoolId)}
              disabled={submitting !== null}
              accessibilityRole="button"
              accessibilityLabel={`Open ${membership.schoolName}`}
              className={`flex-row items-center gap-3 p-4 ${index > 0 ? 'border-t border-gray-200' : ''} ${
                submitting !== null ? 'opacity-60' : ''
              }`}
            >
              <View
                className="size-10 items-center justify-center rounded-full bg-gray-100"
                style={
                  membership.schoolPrimaryColor
                    ? { backgroundColor: membership.schoolPrimaryColor }
                    : undefined
                }
              >
                <Text className="text-sm font-semibold text-white">
                  {membership.schoolName?.[0] ?? '?'}
                </Text>
              </View>

              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-base font-medium">
                  {membership.schoolName}
                </Text>
                {/* Role differs per school — how a parent tells "where I teach"
                    from "where my child is". */}
                <Text numberOfLines={1} className="text-xs text-gray-500">
                  {membership.roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ')}
                </Text>
              </View>

              {submitting === membership.schoolId && <ActivityIndicator size="small" />}
            </Pressable>
          ))}
        </View>

        <Button
          label="Sign in as someone else"
          variant="outline"
          onPress={() => {
            setPendingSelection(null);
            router.replace('/login');
          }}
        />
      </View>
    </ScrollView>
  );
}

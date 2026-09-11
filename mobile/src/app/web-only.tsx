import { Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-context';

export default function WebOnlyScreen() {
  const { user, signOut } = useSession();

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-white px-6">
      <Text className="text-center text-2xl font-semibold">Please use the web portal</Text>
      <Text className="text-center text-sm text-gray-500">
        {user?.roles.join(', ')} accounts manage the school from the web console, not this app.
      </Text>
      <Button label="Log out" onPress={signOut} className="mt-4" />
    </View>
  );
}

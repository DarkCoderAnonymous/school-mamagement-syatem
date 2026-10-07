import { Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-context';

export default function WebOnlyScreen() {
  const { user, signOut } = useSession();

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
      <Text className="text-center text-2xl font-semibold text-foreground">Please use the web console</Text>
      <Text className="text-center text-sm text-muted-foreground">
        Platform accounts ({user?.roles.join(', ')}) manage schools from the web, not this app.
      </Text>
      <Button label="Log out" onPress={signOut} className="mt-4" />
    </View>
  );
}

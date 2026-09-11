import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth-context';

export default function HomeScreen() {
  const { user, signOut } = useSession();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 py-4">
        <View className="flex-row items-center gap-3 border-b border-gray-100 pb-4">
          {user?.schoolLogoUrl ? (
            <Image source={{ uri: user.schoolLogoUrl }} className="size-12 rounded-full" />
          ) : (
            <View
              className="size-12 items-center justify-center rounded-full"
              style={{ backgroundColor: user?.schoolPrimaryColor ?? '#2563eb' }}
            >
              <Text className="text-lg font-semibold text-white">{user?.schoolName?.[0] ?? 'S'}</Text>
            </View>
          )}
          <View>
            <Text className="text-lg font-semibold">{user?.schoolName ?? 'Your school'}</Text>
            <Text className="text-sm text-gray-500">
              {user?.firstName} {user?.lastName} · {user?.roles.join(', ')}
            </Text>
          </View>
        </View>

        <View className="flex-1 items-center justify-center gap-2">
          <Text className="text-center text-base font-medium">Nothing here yet</Text>
          <Text className="max-w-xs text-center text-sm text-gray-500">
            Attendance, marks, notices and PTM will show up here once your school sets up its academic session.
          </Text>
        </View>

        <Button label="Log out" variant="outline" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

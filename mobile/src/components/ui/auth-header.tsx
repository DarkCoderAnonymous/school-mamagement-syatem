import { Text, View } from 'react-native';
import { Icon } from './icon';

/** Brand mark + heading shared by the sign-in screens, matching the web's auth pages. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View className="gap-6">
      <View className="flex-row items-center gap-2.5">
        <View className="size-10 items-center justify-center rounded-xl bg-primary">
          <Icon name="school" size={20} color="primaryForeground" />
        </View>
        <Text className="text-base font-semibold text-foreground">School Management</Text>
      </View>
      <View className="gap-1">
        <Text className="text-[28px] font-semibold tracking-tight text-foreground">{title}</Text>
        {subtitle && <Text className="text-base text-muted-foreground">{subtitle}</Text>}
      </View>
    </View>
  );
}

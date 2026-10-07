import { Platform } from 'react-native';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Permission } from '@sms/shared';
import { useSession } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme';
import { modulesFor } from '@/lib/modules';

/**
 * The platform's own tab bar (UITabBar / Material bottom navigation): iOS
 * keeps its system material and only takes the brand tint; Android gets the
 * card surface. Attendance shows only for people who can see registers;
 * More lists every other module the person's permissions allow.
 */
export default function AppTabs() {
  const theme = useTheme();
  const { user } = useSession();
  const canSeeAttendance = !!user?.permissions.includes(Permission.ATTENDANCE_READ);
  const hasModules = modulesFor(user?.permissions).length > 0;

  return (
    <NativeTabs
      tintColor={theme.primary}
      iconColor={{ default: theme.mutedForeground, selected: theme.primary }}
      labelStyle={{ default: { color: theme.mutedForeground }, selected: { color: theme.primary, fontWeight: '600' } }}
      backgroundColor={Platform.OS === 'android' ? theme.card : undefined}
      badgeBackgroundColor={theme.destructive}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="attendance" hidden={!canSeeAttendance}>
        <NativeTabs.Trigger.Label>Attendance</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="fact_check" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="modules" hidden={!hasModules}>
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }} md="apps" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

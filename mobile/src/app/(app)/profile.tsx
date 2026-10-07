import { useState } from 'react';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Pill, SectionTitle } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/tabs';
import { useThemeMode, type ThemeMode } from '@/lib/theme-mode';
import { useSession } from '@/lib/auth-context';
import { switchSchool } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { tokenStorage } from '@/lib/token-storage';

const roleLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ');

/** Who you are, where you are, and the account actions. */
export default function ProfileScreen() {
  const { user, signIn, signOut } = useSession();
  const [switching, setSwitching] = useState<string>();
  const others = (user?.memberships ?? []).filter(
    (m) => m.schoolId !== user?.schoolId && m.status === 'ACTIVE',
  );

  const onSwitch = async (schoolId: string, name: string) => {
    setSwitching(schoolId);
    try {
      const session = await switchSchool(schoolId, await tokenStorage.getRefreshToken());
      await signIn(session.user, session.accessToken, session.refreshToken);
      router.replace('/');
    } catch (err) {
      Alert.alert(
        `Couldn't open ${name}`,
        err instanceof ApiRequestError ? err.message : 'Check your connection and try again.',
      );
    } finally {
      setSwitching(undefined);
    }
  };

  const onSignOut = () =>
    Alert.alert('Log out?', 'You can sign back in any time with your email and password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);

  return (
    <Screen>
      <Text className="pt-2 text-[26px] font-semibold tracking-tight text-foreground">Profile</Text>

      <Card className="flex-row items-center gap-4 p-4">
        <View className="size-14 items-center justify-center rounded-full bg-primary/10">
          <Text className="text-lg font-semibold text-primary">
            {(user?.firstName?.[0] ?? '') + (user?.lastName?.[0] ?? '')}
          </Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-lg font-semibold text-foreground">
            {user?.firstName} {user?.lastName}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {user?.email}
          </Text>
          <View className="flex-row flex-wrap gap-1.5 pt-0.5">
            {user?.roles.map((r) => (
              <Pill key={r} label={roleLabel(r)} tone="primary" />
            ))}
          </View>
        </View>
      </Card>

      <View className="gap-2.5">
        <SectionTitle title="School" />
        <Card className="overflow-hidden">
          <SchoolRow
            name={user?.schoolName ?? 'Your school'}
            logo={user?.schoolLogoUrl}
            color={user?.schoolPrimaryColor}
            trailing={<Pill label="Current" tone="success" />}
            last={others.length === 0}
          />
          {others.map((m, i) => (
            <SchoolRow
              key={m.schoolId}
              name={m.schoolName}
              logo={m.schoolLogoUrl}
              color={m.schoolPrimaryColor}
              subtitle={m.roles.map(roleLabel).join(', ')}
              onPress={() => onSwitch(m.schoolId, m.schoolName)}
              busy={switching === m.schoolId}
              last={i === others.length - 1}
            />
          ))}
        </Card>
        {others.length > 0 && (
          <Text className="px-1 text-xs text-muted-foreground">
            Tap a school to switch — you&apos;ll see that school&apos;s classes and registers.
          </Text>
        )}
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Account" />
        <Card className="overflow-hidden">
          <ActionRow
            icon="key"
            label="Change password"
            onPress={() => router.push('/change-password')}
            last
          />
        </Card>
      </View>

      <AppearanceSection />

      <Button label="Log out" icon="logout" variant="destructive" onPress={onSignOut} />
      <Text className="text-center text-xs text-muted-foreground">
        Version {Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </Screen>
  );
}

const MODES: { value: ThemeMode; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System', icon: 'device' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

/** Light, dark or the phone's setting; remembered on this device. */
function AppearanceSection() {
  const { mode, setMode } = useThemeMode();
  return (
    <View className="gap-2.5">
      <SectionTitle title="Appearance" />
      <Tabs label="Theme" tabs={MODES} value={mode} onChange={setMode} />
      <Text className="px-1 text-xs text-muted-foreground">
        {mode === 'system'
          ? "Follows your phone's light or dark setting."
          : `Always ${mode}, whatever the phone is set to.`}
      </Text>
    </View>
  );
}

function SchoolRow({
  name,
  logo,
  color,
  subtitle,
  trailing,
  onPress,
  busy,
  last,
}: {
  name: string;
  logo?: string | null;
  color?: string | null;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  busy?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      disabled={!onPress || busy}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Switch to ${name}` : undefined}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-muted ${last ? '' : 'border-b border-border'} ${busy ? 'opacity-60' : ''}`}
    >
      {logo ? (
        <Image source={{ uri: logo }} className="size-10 rounded-xl" />
      ) : (
        <View
          className="size-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: color ?? undefined }}
        >
          {color ? (
            <Text className="text-sm font-semibold text-white">{name[0]}</Text>
          ) : (
            <Icon name="school" size={20} color="primary" />
          )}
        </View>
      )}
      <View className="flex-1">
        <Text className="text-base font-medium text-foreground" numberOfLines={1}>
          {name}
        </Text>
        {subtitle && <Text className="text-xs text-muted-foreground">{subtitle}</Text>}
      </View>
      {trailing ?? (onPress && <Icon name="swap" size={18} />)}
    </Pressable>
  );
}

function ActionRow({
  icon,
  label,
  detail,
  onPress,
  last,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-muted ${last ? '' : 'border-b border-border'}`}
    >
      <View className="size-9 items-center justify-center rounded-lg bg-muted">
        <Icon name={icon} size={18} color="foreground" />
      </View>
      <View className="flex-1">
        <Text className="text-base text-foreground">{label}</Text>
        {detail && <Text className="text-xs text-muted-foreground">{detail}</Text>}
      </View>
      {onPress && <Icon name="chevronRight" size={16} />}
    </Pressable>
  );
}

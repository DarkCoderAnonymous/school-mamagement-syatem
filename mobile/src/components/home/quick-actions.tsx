import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { Permission } from '@sms/shared';
import type { IconName } from '@/components/ui/icon';
import { SectionTitle } from '@/components/ui/primitives';
import { Tile, TileGrid, type TileTone } from '@/components/ui/tile';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';

interface Action {
  label: string;
  icon: IconName;
  tone: TileTone;
  href: Href;
  permission: Permission;
}

/** In priority order — the everyday jobs first; only the first eight the person may do are shown. */
const ACTIONS: Action[] = [
  {
    label: 'Collect fees',
    icon: 'fees',
    tone: 'success',
    href: '/modules/fees/collect',
    permission: Permission.FEE_PAYMENT_RECORD,
  },
  {
    label: 'Find student',
    icon: 'search',
    tone: 'info',
    href: '/modules/students',
    permission: Permission.STUDENT_READ,
  },
  {
    label: 'Admit student',
    icon: 'student',
    tone: 'info',
    href: '/modules/students/new',
    permission: Permission.STUDENT_CREATE,
  },
  {
    label: 'Staff register',
    icon: 'staffAttendance',
    tone: 'primary',
    href: '/modules/staff-attendance',
    permission: Permission.STAFF_ATTENDANCE_MARK,
  },
  {
    label: 'Add holiday',
    icon: 'calendarOff',
    tone: 'primary',
    href: '/modules/holidays/form',
    permission: Permission.ATTENDANCE_MANAGE,
  },
  {
    label: 'Enter marks',
    icon: 'marks',
    tone: 'primary',
    href: '/modules/marks',
    permission: Permission.EXAM_MARKS_ENTER,
  },
  {
    label: 'Record stock',
    icon: 'swap',
    tone: 'warning',
    href: '/modules/inventory/record',
    permission: Permission.INVENTORY_STOCK_RECORD,
  },
  {
    label: 'New stock item',
    icon: 'inventory',
    tone: 'warning',
    href: '/modules/inventory/new',
    permission: Permission.INVENTORY_MANAGE,
  },
  {
    label: 'Record expense',
    icon: 'finance',
    tone: 'danger',
    href: '/modules/finance/new',
    permission: Permission.FINANCE_RECORD,
  },
  {
    label: 'Defaulters',
    icon: 'alert',
    tone: 'danger',
    href: '/modules/fees/defaulters',
    permission: Permission.FEE_REPORT_READ,
  },
];

/**
 * One tap to the jobs this person does most, by permission — a teacher sees
 * marks entry, the office sees fees, admissions, holidays and stock. Shown
 * straight away; it needs nothing from the server.
 */
export function QuickActions() {
  const { user } = useSession();
  const shown = ACTIONS.filter((a) => can(user?.permissions, a.permission)).slice(0, 8);
  // A teacher's only shortcut would be marks, which Home already leads to — not worth a section.
  if (shown.length < 2) return null;
  return (
    <View className="gap-2.5">
      <SectionTitle title="Quick actions" />
      <TileGrid columns={4}>
        {shown.map((a) => (
          <Tile
            key={a.label}
            compact
            label={a.label}
            icon={a.icon}
            tone={a.tone}
            onPress={() => router.push(a.href)}
          />
        ))}
      </TileGrid>
    </View>
  );
}

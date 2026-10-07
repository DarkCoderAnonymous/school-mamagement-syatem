import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import type { EmployeeStatus, Gender, GuardianRelation, StudentStatus } from '@/lib/api/front-office';

/** Labels and tones shared by the front-office screens — the web's words (frontend/src/lib/labels.ts). */
export const fullName = (p: { firstName: string; lastName: string } | null | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown');

export const STUDENT_STATUS: Record<StudentStatus, { label: string; tone: 'success' | 'neutral' | 'info' | 'warning' }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  GRADUATED: { label: 'Graduated', tone: 'info' },
  TRANSFERRED: { label: 'Transferred', tone: 'warning' },
};

export const EMPLOYEE_STATUS: Record<EmployeeStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  ON_LEAVE: { label: 'On leave', tone: 'warning' },
  TERMINATED: { label: 'Terminated', tone: 'neutral' },
};

export const GENDER_LABEL: Record<Gender, string> = { FEMALE: 'Female', MALE: 'Male', OTHER: 'Other' };
export const RELATION_LABEL: Record<GuardianRelation, string> = { FATHER: 'Father', MOTHER: 'Mother', GUARDIAN: 'Guardian', OTHER: 'Other' };

/** "SCHOOL_ADMIN" → "School admin". */
export const roleLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ');

/** "Grade 5 · A", or a dash when the student has no placement. */
export function placement(cls?: { name: string } | null, section?: { name: string } | null): string {
  if (!cls) return '—';
  return section ? `${cls.name} · ${section.name}` : cls.name;
}

/** Opens the dialler or mail app; says so plainly when the device has neither (a simulator, a tablet). */
export async function openContact(kind: 'tel' | 'mailto', value: string) {
  const url = `${kind}:${kind === 'tel' ? value.replace(/[^\d+]/g, '') : value}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(kind === 'tel' ? "Can't place calls here" : "Can't open email here", value);
  }
}

/**
 * A tappable phone number or email: the whole row is the target (≥ 44pt),
 * labelled for screen readers with the action, not just the value.
 */
export function ContactRow({ kind, value, name, last }: { kind: 'tel' | 'mailto'; value: string; name: string; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${kind === 'tel' ? 'Call' : 'Email'} ${name}, ${value}`}
      onPress={() => openContact(kind, value)}
      className={`min-h-[48px] flex-row items-center gap-3 px-4 py-2.5 active:bg-muted ${last ? '' : 'border-b border-border'}`}
    >
      <View className="size-8 items-center justify-center rounded-full bg-primary/10">
        <Icon name={kind === 'tel' ? 'phone' : 'mail'} size={16} color="primary" />
      </View>
      <Text className="flex-1 text-sm font-medium text-primary" numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

/** Age in whole years on today's date (the web's ageFrom). */
export function ageFrom(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

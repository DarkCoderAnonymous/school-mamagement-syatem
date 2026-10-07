import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { StatTile } from '@/components/ui/list';
import { Meter, SectionTitle } from '@/components/ui/primitives';
import { getDashboard } from '@/lib/api/dashboard';
import { useSession } from '@/lib/auth-context';
import { formatMoney, formatMoneyCompact, formatNumber } from '@/lib/format';
import { can } from '@/lib/modules';

/**
 * The web dashboard, phone-sized: headline counts, today's
 * registers school-wide and the month's fee collection. Each block appears
 * only when the server returned it (it omits what the user can't read).
 */
export function SchoolToday() {
  const { user } = useSession();
  const perms = user?.permissions;
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const d = summary.data;

  // School-wide blocks are for the office; a teacher's home is their own registers and classes.
  const office = can(perms, Permission.ATTENDANCE_MANAGE, Permission.FEE_REPORT_READ);
  if (!d) return null;

  const staffIn = d.staffAttendance
    ? d.staffAttendance.counts.PRESENT +
      d.staffAttendance.counts.LATE +
      d.staffAttendance.counts.HALF_DAY
    : 0;
  const rate = d.attendance?.rate ?? null;

  return (
    <View className="gap-5">
      {office && (d.students || d.teachers) && (
        <View className="gap-2.5">
          <SectionTitle title="School" />
          <View className="flex-row gap-2.5">
            {d.students && (
              <StatTile
                label="Students"
                value={formatNumber(d.students.active)}
                hint={`${d.students.female} girls · ${d.students.male} boys`}
                icon="student"
                onPress={() => router.push('/modules/students')}
              />
            )}
            {d.teachers && (
              <StatTile
                label="Teachers"
                value={formatNumber(d.teachers.total)}
                hint={
                  d.academics
                    ? `${d.academics.classes} classes · ${d.academics.sections} sections`
                    : undefined
                }
                icon="staff"
                onPress={() => router.push('/modules/staff')}
              />
            )}
          </View>
        </View>
      )}

      {office && (d.attendance || d.staffAttendance) && (
        <View className="gap-2.5">
          <SectionTitle title="Today" />
          <View className="flex-row gap-2.5">
            {d.attendance && (
              <Card className="flex-1 gap-2 p-3.5">
                <Text className="text-xs font-medium text-muted-foreground">
                  Student attendance
                </Text>
                {d.attendance.dayOff ? (
                  <Text className="text-sm text-muted-foreground">
                    No school — {d.attendance.dayOff}
                  </Text>
                ) : (
                  <>
                    <Text className="text-2xl font-semibold tracking-tight text-foreground">
                      {rate === null ? '—' : `${rate}%`}
                    </Text>
                    <Meter
                      value={
                        rate === null
                          ? d.attendance.registersTaken / Math.max(1, d.attendance.sections)
                          : rate / 100
                      }
                      tone={
                        rate !== null && rate < 75
                          ? 'danger'
                          : rate !== null && rate < 90
                            ? 'warning'
                            : 'primary'
                      }
                      label="Students present today"
                    />
                    <Text className="text-xs text-muted-foreground">
                      {d.attendance.registersTaken} of {d.attendance.sections} registers
                    </Text>
                  </>
                )}
              </Card>
            )}
            {d.staffAttendance && (
              <Card className="flex-1 gap-2 p-3.5">
                <Text className="text-xs font-medium text-muted-foreground">Staff</Text>
                {d.staffAttendance.dayOff ? (
                  <Text className="text-sm text-muted-foreground">No school today</Text>
                ) : d.staffAttendance.marked === 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push('/modules/staff-attendance')}
                  >
                    <Text className="text-sm text-muted-foreground">Register not taken yet</Text>
                    <Text className="mt-1 text-sm font-semibold text-primary">Take it</Text>
                  </Pressable>
                ) : (
                  <>
                    <Text className="text-2xl font-semibold tracking-tight text-foreground">
                      {staffIn}
                      <Text className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / {d.staffAttendance.onRegister} in
                      </Text>
                    </Text>
                    <Meter
                      value={staffIn / Math.max(1, d.staffAttendance.onRegister)}
                      label="Staff in today"
                    />
                  </>
                )}
              </Card>
            )}
          </View>
        </View>
      )}

      {d.fees && (
        <View className="gap-2.5">
          <SectionTitle title="Fees" />
          <Card className="gap-3 p-4">
            <View className="flex-row items-end justify-between">
              <View>
                <Text className="text-xs font-medium text-muted-foreground">
                  Collected this month
                </Text>
                <Text className="text-3xl font-semibold tracking-tight text-foreground">
                  {formatMoney(d.fees.collectedThisMonthMinor)}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground">
                {formatMoneyCompact(d.fees.collectedTodayMinor)} today
              </Text>
            </View>
            {d.fees.billedMinor > 0 && (
              <>
                <Meter
                  value={d.fees.collectedMinor / d.fees.billedMinor}
                  label="Share of this session's fees collected"
                />
                <Text className="text-xs text-muted-foreground">
                  {Math.round((d.fees.collectedMinor / d.fees.billedMinor) * 100)}% of{' '}
                  {formatMoney(d.fees.billedMinor)} billed this session
                </Text>
              </>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/modules/fees/defaulters')}
              disabled={!can(perms, Permission.FEE_REPORT_READ)}
              className="flex-row items-center justify-between rounded-xl bg-muted px-3 py-2.5 active:opacity-80"
            >
              <View>
                <Text className="text-xs text-muted-foreground">
                  Outstanding · {formatMoneyCompact(d.fees.outstandingMinor)}
                </Text>
                <Text
                  className={`text-sm font-semibold ${d.fees.overdueMinor > 0 ? 'text-destructive' : 'text-foreground'}`}
                >
                  {formatMoney(d.fees.overdueMinor)} overdue · {d.fees.defaulterCount} students
                </Text>
              </View>
              <Icon name="chevronRight" size={16} />
            </Pressable>
          </Card>
        </View>
      )}
    </View>
  );
}

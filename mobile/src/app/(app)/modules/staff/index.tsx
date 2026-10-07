import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { Permission } from '@sms/shared';
import { Card } from '@/components/ui/card';
import { Avatar, ChoiceChips, ListRow, PagedList, SearchField } from '@/components/ui/list';
import { useDebounced } from '@/components/ui/form';
import { EmptyState, Pill } from '@/components/ui/primitives';
import { EMPLOYEE_STATUS, fullName, roleLabel } from '@/components/front-office/people';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import { listMembers, listTeachers, type Member, type Teacher } from '@/lib/api/front-office';

type Tab = 'teachers' | 'staff';

/**
 * The teacher and staff directory: who's who and how to reach them. Read-only
 * on the phone — adding staff and changing roles stays on the web.
 */
export default function StaffDirectoryScreen() {
  const { user } = useSession();
  const tabs = [
    ...(can(user?.permissions, Permission.TEACHER_READ) ? [{ value: 'teachers' as const, label: 'Teachers' }] : []),
    ...(can(user?.permissions, Permission.USER_READ) ? [{ value: 'staff' as const, label: 'Staff' }] : []),
  ];
  const [chosen, setChosen] = useState<Tab>();
  const tab = chosen && tabs.some((t) => t.value === chosen) ? chosen : tabs[0]?.value;
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 350) || undefined;

  const header = (
    <View className="gap-3 pb-2">
      {tabs.length > 1 && <ChoiceChips label="Directory" options={tabs} value={tab} onChange={(v) => v && setChosen(v)} />}
      <SearchField value={search} onChangeText={setSearch} placeholder={tab === 'staff' ? 'Search name or email' : 'Search name, email or employee no.'} />
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Teachers & staff' }} />
      {tab === 'teachers' ? (
        <PagedList<Teacher>
          key="teachers"
          queryKey={['teachers', 'list', { search: debounced }]}
          fetchPage={(page) => listTeachers(page, debounced)}
          keyExtractor={(t) => t._id}
          header={header}
          empty={debounced ? { icon: 'search', title: 'No teachers match', description: 'Try a different name.' } : { icon: 'staff', title: 'No teachers yet', description: 'Teachers are added from the web.' }}
          renderItem={(t) => <TeacherRow teacher={t} />}
        />
      ) : tab === 'staff' ? (
        <PagedList<Member>
          key="staff"
          queryKey={['members', 'list', { search: debounced }]}
          fetchPage={(page) => listMembers(page, debounced)}
          keyExtractor={(m) => m._id}
          header={header}
          empty={debounced ? { icon: 'search', title: 'No staff match', description: 'Try a different name.' } : { icon: 'staff', title: 'No staff accounts', description: 'Staff are invited from the web.' }}
          renderItem={(m) => <MemberRow member={m} isMe={m._id === user?.membershipId} />}
        />
      ) : (
        <EmptyState icon="lock" title="Nothing to show" description="You don't have access to the staff directory." />
      )}
    </View>
  );
}

function TeacherRow({ teacher: t }: { teacher: Teacher }) {
  const name = fullName(t.employee);
  const subjects = t.subjects.map((s) => s.name).join(', ');
  const subtitle = [t.employee.designation, subjects].filter(Boolean).join(' · ');
  const status = EMPLOYEE_STATUS[t.employee.status];
  return (
    <Card className="overflow-hidden">
      <ListRow
        last
        title={name}
        subtitle={subtitle}
        leading={<Avatar name={name} />}
        trailing={t.employee.status !== 'ACTIVE' ? <Pill label={status.label} tone={status.tone} /> : undefined}
        accessibilityLabel={`${name}, ${subtitle}`}
        onPress={() => router.push({ pathname: '/modules/staff/[id]', params: { id: t._id, kind: 'teacher' } })}
      />
    </Card>
  );
}

function MemberRow({ member: m, isMe }: { member: Member; isMe: boolean }) {
  const name = `${fullName(m.user)}${isMe ? ' (you)' : ''}`;
  const subtitle = [m.roles.map((r) => roleLabel(r.name)).join(', '), m.user?.email].filter(Boolean).join(' · ');
  return (
    <Card className="overflow-hidden">
      <ListRow
        last
        title={name}
        subtitle={subtitle}
        leading={<Avatar name={fullName(m.user)} />}
        trailing={m.status !== 'ACTIVE' ? <Pill label={m.status === 'INVITED' ? 'Invited' : 'Disabled'} tone={m.status === 'INVITED' ? 'info' : 'neutral'} /> : undefined}
        accessibilityLabel={`${name}, ${subtitle}`}
        onPress={() => router.push({ pathname: '/modules/staff/[id]', params: { id: m._id, kind: 'member' } })}
      />
    </Card>
  );
}

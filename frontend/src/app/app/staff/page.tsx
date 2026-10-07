'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUrlState } from '@/hooks/use-url-state';
import { useAuthStore } from '@/lib/auth-store';
import { usePermission, usePermissions } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { avatarTint, fullName, initials, roleLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { deleteRole, listMembers, listRoles, updateMemberStatus } from '@/lib/api/school';
import type { Member, SchoolRole } from '@/lib/api/types';
import { EditRolesDialog, InviteMemberDialog, ROLE_BLURB } from './member-dialogs';
import { RoleEditorDialog, type RoleEditorTarget } from './role-editor';

export default function StaffPage() {
  const url = useUrlState();
  const router = useRouter();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const myMembershipId = useAuthStore((s) => s.user?.membershipId);
  const [inviting, setInviting] = useState(false);
  const [editingRoles, setEditingRoles] = useState<Member>();
  const [toggling, setToggling] = useState<Member>();
  const tab = url.get('tab') ?? 'staff';

  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles });
  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    search: url.get('search'),
    roleId: url.get('roleId'),
    status: url.get('status'),
  };
  const members = useQuery({ queryKey: ['members', params], queryFn: () => listMembers(params) });

  const toggleAccess = useMutation({
    mutationFn: (m: Member) => updateMemberStatus(m._id, m.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'),
    onSuccess: async (m) => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(m.status === 'DISABLED' ? `${fullName(m.user)}'s access is disabled` : `${fullName(m.user)} can sign in again`);
      setToggling(undefined);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't change their access")),
  });

  const columns = useMemo<DataTableColumn<Member>[]>(
    () => [
      {
        id: 'name',
        header: 'Person',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className={cn('text-xs font-semibold', avatarTint(row.original._id))}>
                {row.original.user ? initials(row.original.user) : '?'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {fullName(row.original.user)}
                {row.original._id === myMembershipId && <span className="text-muted-foreground font-normal"> (you)</span>}
              </p>
              <p className="text-muted-foreground truncate text-xs">{row.original.user?.email}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Roles',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <span key={r._id} className="bg-muted rounded px-1.5 py-0.5 text-xs">
                {roleLabel(r.name)}
              </span>
            ))}
          </div>
        ),
      },
      {
        id: 'lastLoginAt',
        header: 'Last sign-in',
        cell: ({ row }) => {
          const u = row.original.user;
          if (u?.mustChangePassword) return <span className="text-muted-foreground text-xs">Invited — not signed in yet</span>;
          return <span className="text-sm tabular-nums">{u?.lastLoginAt ? fmt.date(u.lastLoginAt) : '—'}</span>;
        },
      },
      {
        id: 'status',
        header: 'Access',
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED'}
            label={row.original.status === 'ACTIVE' ? 'Enabled' : 'Disabled'}
          />
        ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => {
          const m = row.original;
          if (m._id === myMembershipId) return null;
          const canRoles = can(Permission.ROLE_ASSIGN);
          const canStatus = can(Permission.USER_UPDATE);
          if (!canRoles && !canStatus) return null;
          return (
            // The row opens their profile; the menu mustn't.
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
                  aria-label={`Actions for ${fullName(m.user)}`}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canRoles && <DropdownMenuItem onClick={() => setEditingRoles(m)}>Change roles</DropdownMenuItem>}
                  {canStatus && (
                    <DropdownMenuItem onClick={() => setToggling(m)}>
                      {m.status === 'DISABLED' ? 'Enable access' : 'Disable access'}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [can, fmt, myMembershipId],
  );

  const staffRoles = (roles.data ?? []).filter((r) => !r.isFamilyRole);
  const inviteButton = (
    <PermissionGate permission={[Permission.USER_CREATE]}>
      {can(Permission.ROLE_ASSIGN) && (
        <Button onClick={() => setInviting(true)} disabled={!roles.data}>
          <UserPlus className="size-4" />
          Invite staff
        </Button>
      )}
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & roles"
        description="Who can sign in to your school, and what each role allows."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Staff & roles' }]}
        action={inviteButton}
      />

      <Tabs value={tab} onValueChange={(value) => url.set({ tab: value === 'staff' ? undefined : String(value), page: undefined })}>
        <TabsList>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="staff" className="pt-4">
          <DataTable
            columns={columns}
            data={members.data?.items}
            meta={members.data?.meta}
            loading={members.isLoading}
            error={members.error}
            onRetry={() => void members.refetch()}
            getRowId={(row) => row._id}
            onRowClick={(row) => router.push(`/app/staff/${row._id}`)}
            exportFileName="staff"
            emptyTitle="No staff match these filters"
            emptyDescription="Try a different search, or clear the filters."
            toolbar={
              <FilterBar
                searchPlaceholder="Search name or email…"
                filters={[
                  { key: 'roleId', label: 'Role', options: staffRoles.map((r) => ({ value: r._id, label: roleLabel(r.name) })) },
                  {
                    key: 'status',
                    label: 'Access',
                    options: [
                      { value: 'ACTIVE', label: 'Enabled' },
                      { value: 'DISABLED', label: 'Disabled' },
                    ],
                  },
                ]}
              />
            }
          />
        </TabsContent>

        <TabsContent value="roles" className="pt-4">
          {roles.isLoading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : (
            <RolesOverview roles={staffRoles} />
          )}
        </TabsContent>
      </Tabs>

      <InviteMemberDialog open={inviting} onOpenChange={setInviting} roles={roles.data ?? []} />
      <EditRolesDialog member={editingRoles} onOpenChange={(open) => !open && setEditingRoles(undefined)} roles={roles.data ?? []} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onOpenChange={(open) => !open && setToggling(undefined)}
        title={toggling?.status === 'DISABLED' ? `Enable ${fullName(toggling?.user)}?` : `Disable ${fullName(toggling?.user)}?`}
        description={
          toggling?.status === 'DISABLED'
            ? 'They can sign in to this school again with their existing password.'
            : 'They lose access to this school on their next request. Their account at any other school is unaffected.'
        }
        confirmLabel={toggling?.status === 'DISABLED' ? 'Enable access' : 'Disable access'}
        destructive={toggling?.status !== 'DISABLED'}
        pending={toggleAccess.isPending}
        onConfirm={() => toggling && toggleAccess.mutate(toggling)}
      />
    </div>
  );
}

/** Groups a role's permission codes by module: "student.create" → Student: create. */
function groupPermissions(permissions: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const p of permissions) {
    const [module, ...rest] = p.split('.');
    const key = module ?? p;
    groups.set(key, [...(groups.get(key) ?? []), rest.join(' ') || p]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function RolesOverview({ roles }: { roles: SchoolRole[] }) {
  const can = usePermission();
  const held = new Set(usePermissions());
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<RoleEditorTarget>();
  const [deleting, setDeleting] = useState<SchoolRole>();
  const canManage = can(Permission.ROLE_MANAGE);

  const remove = useMutation({
    mutationFn: (role: SchoolRole) => deleteRole(role._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(`${deleting?.name} deleted`);
      setDeleting(undefined);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't delete the role")),
  });

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Built-in roles are fixed. Create a custom role to choose exactly which modules someone sees.
          </p>
          <Button size="sm" onClick={() => setEditor({ mode: 'create' })}>
            <Plus className="size-4" />
            New role
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => {
          // The server refuses to edit a role holding permissions you lack; don't offer it.
          const editable = canManage && !role.isSystem && role.permissions.every((p) => held.has(p));
          return (
            <section key={role._id} className="bg-card space-y-4 rounded-xl border p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{roleLabel(role.name)}</span>
                    {!role.isSystem && (
                      <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-[0.6875rem] font-medium">
                        Custom
                      </span>
                    )}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {(role.isSystem ? ROLE_BLURB[role.name] : undefined) ?? role.description ?? 'Custom role'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {role.memberCount} {role.memberCount === 1 ? 'person' : 'people'}
                  </span>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
                        aria-label={`Actions for ${roleLabel(role.name)}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {editable && <DropdownMenuItem onClick={() => setEditor({ mode: 'edit', role })}>Edit modules</DropdownMenuItem>}
                        <DropdownMenuItem
                          onClick={() =>
                            setEditor({
                              mode: 'create',
                              template: { ...role, name: `${roleLabel(role.name)} (copy)`.slice(0, 40) },
                            })
                          }
                        >
                          Duplicate as custom role
                        </DropdownMenuItem>
                        {editable && (
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(role)}>
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <dl className="space-y-1.5 border-t pt-4 text-xs">
                {groupPermissions(role.permissions).map(([module, actions]) => (
                  <div key={module} className="grid grid-cols-[7rem_1fr] gap-2">
                    <dt className="text-muted-foreground capitalize">{module}</dt>
                    <dd>{actions.join(', ')}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>

      <RoleEditorDialog target={editor} onOpenChange={(open) => !open && setEditor(undefined)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name}?`}
        description={
          deleting?.memberCount
            ? `${deleting.memberCount} ${deleting.memberCount === 1 ? 'person has' : 'people have'} this role. Change their roles on the Staff tab first.`
            : 'Nobody has this role. Deleting it removes it from the role list; the name can be reused.'
        }
        confirmLabel="Delete role"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

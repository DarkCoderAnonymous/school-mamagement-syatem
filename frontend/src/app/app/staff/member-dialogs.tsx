'use client';

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { usePermissions } from '@/lib/permissions';
import { applyServerError } from '@/lib/form-errors';
import { fullName, roleLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { inviteMember, updateMemberRoles } from '@/lib/api/school';
import type { Member, SchoolRole } from '@/lib/api/types';

/** One line on what each default role is for; custom roles fall back to their description. */
export const ROLE_BLURB: Record<string, string> = {
  SCHOOL_ADMIN: 'Runs the school account: settings, staff, roles and everything below.',
  PRINCIPAL: 'Academic head: students, teachers, classes, exams and stores. Can create roles within their own powers; no billing.',
  ACCOUNTANT: 'Fees, invoices and payments. Can view students and stock.',
  EXAM_CONTROLLER: 'Sets exams, enters and publishes marks.',
  TEACHER: 'Attendance, marks entry and notices for their classes.',
};

/**
 * A role the current user can't grant is shown but disabled, with the reason.
 * The server enforces the same rule (members.service assertAssignable) — this
 * just avoids a round trip that would only say no.
 */
function RolePicker({
  roles,
  selected,
  onToggle,
  error,
}: {
  roles: SchoolRole[];
  selected: string[];
  onToggle: (id: string) => void;
  error?: string;
}) {
  const held = new Set(usePermissions());
  return (
    <fieldset className="space-y-2" aria-describedby={error ? 'roles-error' : undefined}>
      <legend className="mb-2 text-[0.8125rem] font-medium">Roles</legend>
      <ul className="space-y-2">
        {roles
          .filter((r) => !r.isFamilyRole)
          .map((role) => {
            const grantable = role.permissions.every((p) => held.has(p));
            const on = selected.includes(role._id);
            return (
              <li key={role._id}>
                <label
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                    grantable ? 'hover:bg-muted/50 cursor-pointer' : 'cursor-not-allowed opacity-60',
                    on && 'border-primary bg-primary/5',
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary mt-0.5 size-4"
                    checked={on}
                    disabled={!grantable}
                    onChange={() => onToggle(role._id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{roleLabel(role.name)}</span>
                    <span className="text-muted-foreground block text-xs">
                      {grantable
                        ? (ROLE_BLURB[role.name] ?? role.description ?? `${role.permissions.length} permissions`)
                        : 'Includes permissions you don’t have, so you can’t grant it.'}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
      </ul>
      {error && (
        <p id="roles-error" role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </fieldset>
  );
}

const inviteSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().max(30),
  roleIds: z.array(z.string()).min(1, 'Pick at least one role'),
});
type InviteValues = z.infer<typeof inviteSchema>;

export function InviteMemberDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: SchoolRole[];
}) {
  const queryClient = useQueryClient();
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', roleIds: [] },
  });
  useEffect(() => {
    if (open) form.reset({ firstName: '', lastName: '', email: '', phone: '', roleIds: [] });
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: (v: InviteValues) => inviteMember({ ...v, phone: v.phone || undefined }),
    onSuccess: async (member) => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(`${fullName(member.user)} can now sign in`, {
        description: member.user?.mustChangePassword
          ? `A temporary password was emailed to ${member.user.email}.`
          : 'They already had an account and will be asked which school to open.',
      });
      onOpenChange(false);
    },
    onError: (error) => applyServerError(error, form.setError, ['email', 'roleIds'], "Couldn't invite them"),
  });

  const { errors, isSubmitting } = form.formState;
  const selected = useWatch({ control: form.control, name: 'roleIds' });
  const toggle = (id: string) =>
    form.setValue('roleIds', selected.includes(id) ? selected.filter((r) => r !== id) : [...selected, id], {
      shouldValidate: form.formState.isSubmitted,
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a staff member</DialogTitle>
          <DialogDescription>
            Office and leadership roles — principal, accountant, exam controller — or Teacher. Anyone given the Teacher role
            also appears on the Teachers page, where you add their subjects and classes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={errors.firstName?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} autoComplete="off" aria-describedby={describedBy} aria-invalid={!!errors.firstName} {...form.register('firstName')} />
              )}
            </Field>
            <Field label="Last name" error={errors.lastName?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} autoComplete="off" aria-describedby={describedBy} aria-invalid={!!errors.lastName} {...form.register('lastName')} />
              )}
            </Field>
            <Field label="Email" error={errors.email?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} type="email" autoComplete="off" aria-describedby={describedBy} aria-invalid={!!errors.email} {...form.register('email')} />
              )}
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              {({ id, describedBy }) => <Input id={id} type="tel" aria-describedby={describedBy} {...form.register('phone')} />}
            </Field>
          </div>
          <RolePicker roles={roles} selected={selected} onToggle={toggle} error={errors.roleIds?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Inviting…' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditRolesDialog({
  member,
  onOpenChange,
  roles,
}: {
  member?: Member;
  onOpenChange: (open: boolean) => void;
  roles: SchoolRole[];
}) {
  const queryClient = useQueryClient();
  const staffRoleIds = roles.filter((r) => !r.isFamilyRole).map((r) => r._id);
  const form = useForm<{ roleIds: string[] }>({ defaultValues: { roleIds: [] } });

  useEffect(() => {
    if (member) form.reset({ roleIds: member.roles.map((r) => r._id).filter((id) => staffRoleIds.includes(id)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when a different member opens
  }, [member?._id]);

  const mutation = useMutation({
    mutationFn: (roleIds: string[]) => updateMemberRoles(member!._id, roleIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success('Roles updated', { description: 'The change applies on their next action — no sign-out needed.' });
      onOpenChange(false);
    },
    onError: (error) => applyServerError(error, form.setError, ['roleIds'], "Couldn't update their roles"),
  });

  const selected = useWatch({ control: form.control, name: 'roleIds' }) ?? [];
  const toggle = (id: string) => {
    form.clearErrors('roleIds');
    form.setValue('roleIds', selected.includes(id) ? selected.filter((r) => r !== id) : [...selected, id]);
  };

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Roles for {fullName(member?.user)}</DialogTitle>
          <DialogDescription>What they can see and do at this school.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(({ roleIds }) => {
            if (roleIds.length === 0) {
              form.setError('roleIds', { message: 'Keep at least one role, or disable their access instead' });
              return;
            }
            return mutation.mutateAsync(roleIds);
          })}
          noValidate
          className="space-y-4"
        >
          <RolePicker roles={roles} selected={selected} onToggle={toggle} error={form.formState.errors.roleIds?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Save roles'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
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
import { cn } from '@/lib/utils';
import { createRole, listPermissionModules, updateRole } from '@/lib/api/school';
import type { PermissionModule, SchoolRole } from '@/lib/api/types';

const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(40, 'Keep the name under 40 characters')
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} &'()\-/]*$/u, "Use letters, numbers, spaces and & ' ( ) - / only"),
  description: z.string().trim().max(200, 'Keep the description under 200 characters'),
  permissions: z.array(z.string()).min(1, 'Pick at least one module'),
});
type RoleValues = z.infer<typeof roleSchema>;

/** What the dialog opens with: an existing custom role to edit, or a starting point for a new one. */
export type RoleEditorTarget =
  | { mode: 'create'; template?: Pick<SchoolRole, 'name' | 'description' | 'permissions'> }
  | { mode: 'edit'; role: SchoolRole };

const isRead = (code: string) => code.endsWith('.read');

export function RoleEditorDialog({
  target,
  onOpenChange,
}: {
  target?: RoleEditorTarget;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const held = new Set(usePermissions());
  const modules = useQuery({
    queryKey: ['role-permission-modules'],
    queryFn: listPermissionModules,
    enabled: Boolean(target),
    staleTime: Infinity,
  });

  const form = useForm<RoleValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: { name: '', description: '', permissions: [] },
  });

  useEffect(() => {
    if (!target) return;
    const source = target.mode === 'edit' ? target.role : target.template;
    form.reset({
      name: source?.name ?? '',
      description: source?.description ?? '',
      // A duplicated built-in role may hold permissions this user can't grant; start from the part they can.
      permissions: (source?.permissions ?? []).filter((p) => target.mode === 'edit' || held.has(p)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a different role opens
  }, [target]);

  const mutation = useMutation({
    mutationFn: (v: RoleValues) => {
      const input = { name: v.name, description: v.description || undefined, permissions: v.permissions };
      return target?.mode === 'edit' ? updateRole(target.role._id, input) : createRole(input);
    },
    onSuccess: async (role) => {
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(target?.mode === 'edit' ? `${role.name} updated` : `${role.name} created`, {
        description:
          target?.mode === 'edit'
            ? 'People with this role see the change on their next action — no sign-out needed.'
            : 'Assign it from the Staff tab, or when inviting someone.',
      });
      onOpenChange(false);
    },
    onError: (error) =>
      applyServerError(error, form.setError, ['name', 'permissions'], target?.mode === 'edit' ? "Couldn't save the role" : "Couldn't create the role"),
  });

  const selected = useWatch({ control: form.control, name: 'permissions' }) ?? [];
  const setSelected = (next: string[]) =>
    form.setValue('permissions', [...new Set(next)], { shouldValidate: form.formState.isSubmitted, shouldDirty: true });

  /** Turning on any action in a module also turns on viewing it — "record stock" without "view stock" is a dead end. */
  const togglePermission = (module: PermissionModule, code: string) => {
    if (selected.includes(code)) return setSelected(selected.filter((p) => p !== code));
    const reads = isRead(code) ? [] : module.permissions.map((p) => p.code).filter((p) => isRead(p) && held.has(p));
    setSelected([...selected, code, ...reads]);
  };

  const toggleModule = (module: PermissionModule) => {
    const grantable = module.permissions.map((p) => p.code).filter((p) => held.has(p));
    const allOn = grantable.every((p) => selected.includes(p));
    setSelected(allOn ? selected.filter((p) => !grantable.includes(p)) : [...selected, ...grantable]);
  };

  const moduleCount = (modules.data ?? []).filter((m) => m.permissions.some((p) => selected.includes(p.code))).length;
  const { errors, isSubmitting } = form.formState;
  const editing = target?.mode === 'edit';

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>{editing ? `Edit ${target.role.name}` : 'New role'}</DialogTitle>
          <DialogDescription>
            Choose which modules people with this role can see, and what they can do in each. You can only include
            permissions you have yourself.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role name" error={errors.name?.message} required>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    autoComplete="off"
                    placeholder="e.g. Librarian"
                    aria-describedby={describedBy}
                    aria-invalid={!!errors.name}
                    {...form.register('name')}
                  />
                )}
              </Field>
              <Field label="Description" error={errors.description?.message}>
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    rows={1}
                    placeholder="What this role is for"
                    aria-describedby={describedBy}
                    className="min-h-9"
                    {...form.register('description')}
                  />
                )}
              </Field>
            </div>

            <fieldset className="space-y-2" aria-describedby={errors.permissions ? 'permissions-error' : undefined}>
              <legend className="mb-2 text-[0.8125rem] font-medium">Modules & permissions</legend>
              {modules.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              ) : modules.error ? (
                <ErrorState error={modules.error} onRetry={() => void modules.refetch()} />
              ) : (
                <ul className="space-y-2">
                  {(modules.data ?? []).map((module) => (
                    <ModuleRow
                      key={module.module}
                      module={module}
                      held={held}
                      selected={selected}
                      onToggleModule={() => toggleModule(module)}
                      onTogglePermission={(code) => togglePermission(module, code)}
                    />
                  ))}
                </ul>
              )}
              {errors.permissions && (
                <p id="permissions-error" role="alert" className="text-destructive text-xs">
                  {errors.permissions.message}
                </p>
              )}
            </fieldset>
          </div>

          <DialogFooter className="m-0 items-center sm:justify-between">
            <p className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
              {selected.length} {selected.length === 1 ? 'permission' : 'permissions'} across {moduleCount}{' '}
              {moduleCount === 1 ? 'module' : 'modules'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || modules.isLoading}>
                {isSubmitting ? 'Saving…' : editing ? 'Save role' : 'Create role'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModuleRow({
  module,
  held,
  selected,
  onToggleModule,
  onTogglePermission,
}: {
  module: PermissionModule;
  held: Set<string>;
  selected: string[];
  onToggleModule: () => void;
  onTogglePermission: (code: string) => void;
}) {
  const grantable = module.permissions.filter((p) => held.has(p.code));
  const on = module.permissions.filter((p) => selected.includes(p.code)).length;
  const allOn = grantable.length > 0 && grantable.every((p) => selected.includes(p.code));
  const headingId = `module-${module.module}`;

  return (
    <li className={cn('rounded-lg border transition-colors', on > 0 && 'border-primary/60 bg-primary/5')}>
      <label
        className={cn(
          'flex items-center gap-3 px-3 py-2.5',
          grantable.length ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
        )}
      >
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={allOn}
          disabled={!grantable.length}
          ref={(el) => {
            if (el) el.indeterminate = on > 0 && !allOn;
          }}
          onChange={onToggleModule}
          aria-describedby={headingId}
        />
        <span id={headingId} className="flex-1 text-sm font-medium">
          {module.label}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {on > 0 ? `${on} of ${module.permissions.length}` : grantable.length ? 'Hidden' : 'Not yours to grant'}
        </span>
      </label>
      <ul className="space-y-0.5 border-t px-3 py-2 pl-10">
        {module.permissions.map((permission) => {
          const canGrant = held.has(permission.code);
          return (
            <li key={permission.code}>
              <label
                className={cn('flex items-start gap-2.5 py-1', canGrant ? 'cursor-pointer' : 'cursor-not-allowed opacity-50')}
                title={canGrant ? undefined : "You don't have this permission, so you can't include it"}
              >
                <input
                  type="checkbox"
                  className="accent-primary mt-0.5 size-3.5"
                  checked={selected.includes(permission.code)}
                  disabled={!canGrant}
                  onChange={() => onTogglePermission(permission.code)}
                />
                <span className="text-xs leading-snug">{permission.description}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

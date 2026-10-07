'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RequireAuth } from '@/components/auth/require-auth';
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field } from '@/components/form/field';
import { PasswordInput } from '@/components/form/password-input';
import { AuthHeading, AuthShell } from '@/components/public/auth-shell';
import { changePassword } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { useAuthStore } from '@/lib/auth-store';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type Form = z.infer<typeof schema>;

function ChangePasswordForm() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setServerError(null);
    try {
      await changePassword(currentPassword, newPassword);
      // The server ends every session on a password change, this one included
      // (ADR-005), so the tokens held here are dead — sign in again.
      setDone(true);
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    }
  });

  if (done) {
    return (
      <AuthShell>
        <div className="animate-fade-up space-y-8">
          <AuthHeading
            icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
            title="Password updated"
            description="For your security you've been signed out everywhere. Sign in with your new password."
          />
          <Button
            className="h-10 w-full"
            onClick={() => {
              useAuthStore.getState().clear();
              router.replace('/login');
            }}
          >
            Continue to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="animate-fade-up space-y-8">
        <AuthHeading
          icon={<LockKeyhole className="size-5" aria-hidden="true" />}
          title="Set a new password"
          description={
            user?.mustChangePassword
              ? 'You signed in with a temporary password. Choose your own before continuing.'
              : 'Update the password you use to sign in.'
          }
        />

        {serverError && (
          <Alert variant="destructive" className="animate-shake">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <Field
            label="Current password"
            htmlFor="currentPassword"
            error={errors.currentPassword?.message}
          >
            {({ id, describedBy }) => (
              <PasswordInput
                id={id}
                autoComplete="current-password"
                aria-invalid={!!errors.currentPassword}
                aria-describedby={describedBy}
                className="h-10"
                {...register('currentPassword')}
              />
            )}
          </Field>
          <Field
            label="New password"
            htmlFor="newPassword"
            error={errors.newPassword?.message}
            help="At least 8 characters."
          >
            {({ id, describedBy }) => (
              <PasswordInput
                id={id}
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                aria-describedby={describedBy}
                className="h-10"
                {...register('newPassword')}
              />
            )}
          </Field>
          <Field
            label="Confirm new password"
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            {({ id, describedBy }) => (
              <PasswordInput
                id={id}
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={describedBy}
                className="h-10"
                {...register('confirmPassword')}
              />
            )}
          </Field>
          <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

export default function ChangePasswordPage() {
  return (
    <RequireAuth>
      <ChangePasswordForm />
    </RequireAuth>
  );
}

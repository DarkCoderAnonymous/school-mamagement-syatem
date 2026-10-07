'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field } from '@/components/form/field';
import { PasswordInput } from '@/components/form/password-input';
import { AuthHeading } from '@/components/public/auth-shell';
import { resetPassword } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
type Form = z.infer<typeof schema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  // The emailed link carries the token. The field is only shown when it
  // doesn't — someone pasting a token by hand — so the usual case is just
  // "type a new password twice".
  const tokenFromLink = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { token: tokenFromLink },
  });

  const onSubmit = handleSubmit(async ({ token, password }) => {
    setServerError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setServerError(
        err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.',
      );
    }
  });

  if (done) {
    return (
      <div className="space-y-8">
        <AuthHeading
          icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
          title="Password updated"
          description="Your password has been reset and any other sessions were signed out. Sign in with your new password."
        />
        <Link href="/login" className={cn(buttonVariants(), 'h-10 w-full')}>
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AuthHeading
        icon={<LockKeyhole className="size-5" aria-hidden="true" />}
        title="Set a new password"
        description="Choose a password you haven't used here before."
      />

      {serverError && (
        <Alert variant="destructive" className="animate-shake">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>
            {serverError}{' '}
            <Link href="/forgot-password" className="font-medium">
              Request a new link
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {tokenFromLink ? (
          <input type="hidden" {...register('token')} />
        ) : (
          <Field
            label="Reset code"
            htmlFor="token"
            error={errors.token?.message}
            help="Paste the code from the reset email."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                autoComplete="one-time-code"
                aria-invalid={!!errors.token}
                aria-describedby={describedBy}
                className="h-10 font-mono"
                {...register('token')}
              />
            )}
          </Field>
        )}

        <Field
          label="New password"
          htmlFor="password"
          error={errors.password?.message}
          help="At least 8 characters."
        >
          {({ id, describedBy }) => (
            <PasswordInput
              id={id}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby={describedBy}
              className="h-10"
              {...register('password')}
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
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

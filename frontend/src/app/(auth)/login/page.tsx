'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Role } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field } from '@/components/form/field';
import { PasswordInput } from '@/components/form/password-input';
import { AuthHeading } from '@/components/public/auth-shell';
import { login } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';
import { useAuthStore } from '@/lib/auth-store';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  NO_ACTIVE_MEMBERSHIP: 'This account is not active at any school. Contact your administrator.',
  SCHOOL_SUSPENDED: "Your school's account has been suspended. Contact your administrator.",
  SUBSCRIPTION_INACTIVE: "Your school's subscription is not active. Contact your administrator.",
  ACCOUNT_DISABLED: 'This account has been disabled.',
  TOO_MANY_REQUESTS: 'Too many login attempts. Try again in a few minutes.',
};

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await login(values);

      // A person who belongs to several schools gets a choice, not a guessed
      // session (ADR-001). No tokens exist yet at this point.
      if (result.kind === 'select-school') {
        useAuthStore.getState().setPendingSelection({
          selectionToken: result.selectionToken,
          memberships: result.memberships,
        });
        router.replace('/select-school');
        return;
      }

      const { user, accessToken } = result;
      useAuthStore.getState().setSession(user, accessToken);

      if (user.mustChangePassword) {
        router.replace('/change-password');
      } else if (user.roles.includes(Role.SUPER_ADMIN)) {
        router.replace('/admin');
      } else {
        router.replace('/app');
      }
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? (ERROR_MESSAGES[err.code] ?? err.message)
          : 'Something went wrong. Try again.';
      setServerError(message);
    }
  });

  return (
    <div className="space-y-8">
      <AuthHeading
        title="Welcome back"
        description="Sign in with the email your school registered for you."
      />

      {serverError && (
        <Alert variant="destructive" className="animate-shake">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Couldn&apos;t sign in</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              placeholder="you@school.edu"
              aria-invalid={!!errors.email}
              aria-describedby={describedBy}
              className="h-10"
              {...register('email')}
            />
          )}
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          labelAction={
            <Link
              href="/forgot-password"
              className="text-primary hover:text-primary/80 rounded-sm text-xs font-medium underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          {({ id, describedBy }) => (
            <PasswordInput
              id={id}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={describedBy}
              className="h-10"
              {...register('password')}
            />
          )}
        </Field>

        <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* A school still awaiting approval has no login yet, so its applicant lands here too. */}
      <div className="text-muted-foreground space-y-2 border-t pt-6 text-sm">
        <p>
          New to the platform?{' '}
          <Link
            href="/register"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Register your school
          </Link>
        </p>
        <p>
          Already applied?{' '}
          <Link
            href="/register/status"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Check your application status
          </Link>
        </p>
      </div>
    </div>
  );
}

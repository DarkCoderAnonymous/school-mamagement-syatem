'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground text-sm">Use your school-issued credentials</p>
      </div>

      {serverError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t sign in</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-muted-foreground text-xs underline underline-offset-4">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
          {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        Registering a school?{' '}
        <Link href="/register" className="text-foreground underline underline-offset-4">
          Apply here
        </Link>
      </p>
    </div>
  );
}

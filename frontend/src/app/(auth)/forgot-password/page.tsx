'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, KeyRound, Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field } from '@/components/form/field';
import { AuthHeading } from '@/components/public/auth-shell';
import { forgotPassword } from '@/lib/api/auth';
import { ApiRequestError } from '@/lib/api/http';

const schema = z.object({ email: z.string().email('Enter a valid email address') });
type Form = z.infer<typeof schema>;

function BackToSignIn() {
  return (
    <Link
      href="/login"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to sign in
    </Link>
  );
}

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    try {
      await forgotPassword(email);
      setSentTo(email);
    } catch (err) {
      setServerError(
        err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.',
      );
    }
  });

  if (sentTo) {
    return (
      <div className="space-y-8">
        <AuthHeading
          icon={<MailCheck className="size-5" aria-hidden="true" />}
          title="Check your email"
          description={
            <>
              If an account exists for <span className="text-foreground font-medium">{sentTo}</span>
              , we&apos;ve sent a link to reset the password. It may take a minute to arrive — check
              spam too.
            </>
          }
        />
        <div className="space-y-3">
          <Button variant="outline" className="h-10 w-full" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AuthHeading
        icon={<KeyRound className="size-5" aria-hidden="true" />}
        title="Forgot your password?"
        description="Enter the email you sign in with and we'll send you a link to set a new one."
      />

      {serverError && (
        <Alert variant="destructive" className="animate-shake">
          <AlertCircle aria-hidden="true" />
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
        <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <BackToSignIn />
    </div>
  );
}

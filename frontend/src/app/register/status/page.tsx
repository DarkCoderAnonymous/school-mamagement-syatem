'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Check, Loader2, Search, X } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/status-badge';
import { Label } from '@/components/ui/label';
import { SiteFooter, SiteHeader } from '@/components/public/site-chrome';
import { getRegistrationStatus } from '@/lib/api/registrations';
import { ApiRequestError } from '@/lib/api/http';
import type { RegistrationStatusResult } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { stagger } from '@/lib/motion';

const schema = z.object({ email: z.string().email('Enter a valid email address') });
type Form = z.infer<typeof schema>;

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending review',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
};

export default function RegistrationStatusPage() {
  const [result, setResult] = useState<RegistrationStatusResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    setResult(null);
    try {
      setResult(await getRegistrationStatus(email));
    } catch (err) {
      setServerError(
        err instanceof ApiRequestError
          ? err.status === 404
            ? 'We couldn’t find an application for that email. Check the spelling, or register your school.'
            : err.message
          : 'Something went wrong. Try again.',
      );
    }
  });

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader showSectionLinks={false} />
      <main className="flex-1">
        <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Check your application
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Enter the contact email you used when registering your school.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-1.5" noValidate>
            <Label htmlFor="email" className="sr-only">
              Contact email
            </Label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@school.edu"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className="h-11 pl-9"
                  {...register('email')}
                />
              </div>
              <Button type="submit" className="h-11 px-5" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {isSubmitting ? 'Checking…' : 'Check status'}
              </Button>
            </div>
            {errors.email && (
              <p id="email-error" role="alert" className="text-destructive text-xs">
                {errors.email.message}
              </p>
            )}
          </form>

          <div aria-live="polite" className="mt-8">
            {serverError && (
              <Alert variant="destructive" className="animate-shake">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
            {result && <StatusResult result={result} />}
          </div>

          {!result && (
            <p className="text-muted-foreground mt-10 border-t pt-6 text-sm">
              Haven&apos;t applied yet?{' '}
              <Link
                href="/register"
                className="text-foreground font-medium underline-offset-4 hover:underline"
              >
                Register your school
              </Link>
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * Submitted → Reviewed → Decision. PENDING and UNDER_REVIEW differ only in
 * whether someone has picked the application up, so the timeline makes that
 * visible instead of leaving the applicant to guess what "pending" means.
 */
function StatusResult({ result }: { result: RegistrationStatusResult }) {
  const { status } = result;
  const reviewed = status !== 'PENDING';
  const decided = status === 'APPROVED' || status === 'REJECTED';

  const steps = [
    { label: 'Submitted', detail: formatDate(result.submittedAt), state: 'done' as const },
    {
      label: 'In review',
      detail: reviewed ? 'Picked up by our team' : 'Waiting in the queue',
      state: reviewed ? ('done' as const) : ('current' as const),
    },
    {
      label: status === 'REJECTED' ? 'Not approved' : 'Approved',
      detail: decided ? formatDate(result.reviewedAt) : 'Decision pending',
      state:
        status === 'APPROVED'
          ? ('done' as const)
          : status === 'REJECTED'
            ? ('failed' as const)
            : ('todo' as const),
    },
  ];

  return (
    <div className="bg-card animate-fade-up rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">School</p>
          <p className="truncate font-medium">{result.schoolName}</p>
        </div>
        <StatusBadge status={status} label={STATUS_LABEL[status]} />
      </div>

      <ol className="space-y-0 px-5 py-5">
        {steps.map((s, i) => (
          <li
            key={s.label}
            className="animate-fade-up relative flex gap-3 pb-5 last:pb-0"
            style={stagger(i, 140, 150)}
          >
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'animate-grow-y absolute top-6 bottom-0 left-3 w-px origin-top -translate-x-1/2',
                  s.state === 'done' ? 'bg-success' : 'bg-border',
                )}
                // Draws after its own dot has landed, leading the eye to the next step.
                style={stagger(i, 140, 330)}
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                'relative flex size-6 shrink-0 items-center justify-center rounded-full border',
                s.state === 'done' && 'border-success bg-success text-success-foreground',
                s.state === 'failed' &&
                  'border-destructive bg-destructive text-destructive-foreground',
                s.state === 'current' && 'border-primary bg-background',
                s.state === 'todo' && 'bg-background',
              )}
              aria-hidden="true"
            >
              {s.state === 'done' && <Check className="size-3.5" />}
              {s.state === 'failed' && <X className="size-3.5" />}
              {s.state === 'current' && <span className="bg-primary size-2 rounded-full" />}
            </span>
            <div className="pt-0.5">
              <p
                className={cn('text-sm font-medium', s.state === 'todo' && 'text-muted-foreground')}
              >
                {s.label}
              </p>
              <p className="text-muted-foreground text-xs">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {status === 'REJECTED' && result.reviewNotes && (
        <div className="border-t px-5 py-4">
          <p className="text-muted-foreground text-xs">Reason given</p>
          <p className="mt-1 text-sm leading-relaxed">{result.reviewNotes}</p>
        </div>
      )}

      {status === 'APPROVED' && (
        <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Your login details were sent to your contact email.
          </p>
          <Link href="/login" className={cn(buttonVariants(), 'h-9 px-4')}>
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}

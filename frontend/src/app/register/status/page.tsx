'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getRegistrationStatus } from '@/lib/api/registrations';
import { ApiRequestError } from '@/lib/api/http';
import type { RegistrationStatusResult } from '@/lib/api/types';

const schema = z.object({ email: z.string().email('Enter a valid email address') });
type Form = z.infer<typeof schema>;

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  PENDING: { label: 'Pending review', variant: 'secondary' },
  UNDER_REVIEW: { label: 'Under review', variant: 'secondary' },
  APPROVED: { label: 'Approved', variant: 'default' },
  REJECTED: { label: 'Not approved', variant: 'destructive' },
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
      setServerError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    }
  });

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Application status</h1>
        <p className="text-muted-foreground text-sm">Enter the email you registered with</p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2" noValidate>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="email" className="sr-only">
            Email
          </Label>
          <Input id="email" type="email" placeholder="you@school.example" {...register('email')} />
          {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Checking…' : 'Check'}
        </Button>
      </form>

      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{result.schoolName}</span>
              <Badge variant={STATUS_LABEL[result.status]?.variant ?? 'secondary'}>
                {STATUS_LABEL[result.status]?.label ?? result.status}
              </Badge>
            </div>
            {result.status === 'REJECTED' && result.reviewNotes && (
              <p className="text-muted-foreground text-sm">Reason: {result.reviewNotes}</p>
            )}
            {result.status === 'APPROVED' && (
              <p className="text-muted-foreground text-sm">
                Check the email you registered with for login details, or{' '}
                <Link href="/login" className="text-foreground underline underline-offset-4">
                  sign in
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

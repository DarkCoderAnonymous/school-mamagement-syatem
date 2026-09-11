'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { listPublicPlans } from '@/lib/api/plans';
import { submitRegistration } from '@/lib/api/registrations';
import { ApiRequestError } from '@/lib/api/http';
import { formatPlanPrice } from '@/lib/format-price';

const registrationSchema = z.object({
  schoolName: z.string().min(2, 'School name is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  curriculum: z.string().optional(),
  expectedStudents: z.string().optional(),
  contactPerson: z.string().min(2, 'Contact person is required'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().min(5, 'Phone number is required'),
  requestedPlanId: z.string().min(1, 'Select a plan'),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

const STEPS = ['School', 'Contact', 'Plan', 'Review'] as const;
const STEP_FIELDS: Record<number, (keyof RegistrationForm)[]> = {
  0: ['schoolName', 'address', 'city', 'country', 'curriculum', 'expectedStudents'],
  1: ['contactPerson', 'email', 'phone'],
  2: ['requestedPlanId'],
  3: [],
};

const DRAFT_KEY = 'sms-registration-draft';

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const plansQuery = useQuery({ queryKey: ['plans', 'public'], queryFn: listPublicPlans });

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { schoolName: '', contactPerson: '', email: '', phone: '', requestedPlanId: '' },
  });

  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        form.reset(JSON.parse(draft));
      } catch {
        // ignore corrupt draft
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  // Pre-select the free trial plan (if one exists) so applicants aren't
  // blocked picking a paid plan just to get started.
  useEffect(() => {
    if (!plansQuery.data || form.getValues('requestedPlanId')) return;
    const trial = plansQuery.data.find((p) => p.priceMinor === 0);
    if (trial) form.setValue('requestedPlanId', trial._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the plan list itself changes
  }, [plansQuery.data]);

  useEffect(() => {
    const subscription = form.watch((values) => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const next = async () => {
    const valid = await form.trigger(STEP_FIELDS[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await submitRegistration({
        ...values,
        expectedStudents: values.expectedStudents ? Number(values.expectedStudents) : undefined,
        documents: [],
      } as never);
      localStorage.removeItem(DRAFT_KEY);
      setSubmitted({ id: result.id });
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
    }
  });

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <CheckIcon className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold">Application submitted</h1>
        <p className="text-muted-foreground text-sm">
          Your reference is <span className="text-foreground font-mono">{submitted.id}</span>. A Super Admin will
          review your application; check status any time with your email.
        </p>
        <div className="flex gap-3">
          <Link href="/register/status">
            <Button variant="outline">Check status</Button>
          </Link>
          <Link href="/login">
            <Button>Go to sign in</Button>
          </Link>
        </div>
      </div>
    );
  }

  const values = form.watch();

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Register your school</h1>
        <p className="text-muted-foreground text-sm">Takes about five minutes</p>
      </div>

      <ol className="flex items-center justify-center gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs',
                i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {i < step ? <CheckIcon className="size-3.5" /> : i + 1}
            </span>
            <span className={i === step ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground mx-1">—</span>}
          </li>
        ))}
      </ol>

      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate>
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>School details</CardTitle>
              <CardDescription>Tell us about your school</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="schoolName">School name</Label>
                <Input id="schoolName" {...form.register('schoolName')} />
                {form.formState.errors.schoolName && (
                  <p className="text-destructive text-xs">{form.formState.errors.schoolName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" rows={2} {...form.register('address')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" {...form.register('city')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" {...form.register('country')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="curriculum">Curriculum / board</Label>
                  <Input id="curriculum" {...form.register('curriculum')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expectedStudents">Expected students</Label>
                  <Input id="expectedStudents" type="number" min={1} {...form.register('expectedStudents')} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Contact person</CardTitle>
              <CardDescription>Who should we reach for approval and login details?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="contactPerson">Full name</Label>
                <Input id="contactPerson" {...form.register('contactPerson')} />
                {form.formState.errors.contactPerson && (
                  <p className="text-destructive text-xs">{form.formState.errors.contactPerson.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register('email')} />
                <p className="text-muted-foreground text-xs">
                  This becomes the School Admin login if your application is approved.
                </p>
                {form.formState.errors.email && (
                  <p className="text-destructive text-xs">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...form.register('phone')} />
                {form.formState.errors.phone && (
                  <p className="text-destructive text-xs">{form.formState.errors.phone.message}</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Choose a plan</CardTitle>
              <CardDescription>You can change this later</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {plansQuery.isLoading && <p className="text-muted-foreground text-sm">Loading plans…</p>}
              {plansQuery.isError && <p className="text-destructive text-sm">Could not load plans. Try reloading.</p>}
              {plansQuery.data?.map((plan) => (
                <button
                  type="button"
                  key={plan._id}
                  onClick={() => form.setValue('requestedPlanId', plan._id, { shouldValidate: true })}
                  className={cn(
                    'w-full rounded-lg border p-4 text-left transition-colors',
                    values.requestedPlanId === plan._id ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{plan.name}</span>
                    <span className="text-sm">
                      {formatPlanPrice(plan)}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{plan.description}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Up to {plan.limits.students} students · {plan.limits.staff} staff
                  </p>
                </button>
              ))}
              {form.formState.errors.requestedPlanId && (
                <p className="text-destructive text-xs">{form.formState.errors.requestedPlanId.message}</p>
              )}
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Review &amp; submit</CardTitle>
              <CardDescription>Double-check before you apply</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">School</span>
                <span>{values.schoolName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact</span>
                <span>{values.contactPerson}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{values.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{values.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span>{plansQuery.data?.find((p) => p._id === values.requestedPlanId)?.name}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 flex justify-between">
          <Button type="button" variant="outline" onClick={back} disabled={step === 0}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Submitting…' : 'Submit application'}
            </Button>
          )}
        </div>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        Already applied?{' '}
        <Link href="/register/status" className="text-foreground underline underline-offset-4">
          Check your status
        </Link>
      </p>
    </div>
  );
}

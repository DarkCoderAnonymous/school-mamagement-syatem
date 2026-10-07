'use client';

import { Suspense, useEffect, useRef, useState, type ComponentProps, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  HardDriveDownload,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { SCHOOL_CURRENCIES, SCHOOL_CURRENCY_CODES } from '@sms/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field } from '@/components/form/field';
import { FormRow } from '@/components/form/form-layout';
import { SiteFooter, SiteHeader } from '@/components/public/site-chrome';
import { PlanLimits, PlanPrice } from '@/components/public/plan-parts';
import { cn } from '@/lib/utils';
import { stagger } from '@/lib/motion';
import { listPublicPlans } from '@/lib/api/plans';
import { submitRegistration } from '@/lib/api/registrations';
import { ApiRequestError } from '@/lib/api/http';
import { planPriceParts } from '@/lib/format-price';

const registrationSchema = z.object({
  schoolName: z.string().trim().min(2, 'School name is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  curriculum: z.string().optional(),
  currency: z.enum(SCHOOL_CURRENCY_CODES, { message: 'Choose the currency your school charges fees in' }),
  expectedStudents: z.string().regex(/^\d*$/, 'Enter a whole number').optional(),
  contactPerson: z.string().trim().min(2, 'Contact person is required'),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().trim().min(5, 'Phone number is required'),
  requestedPlanId: z.string().min(1, 'Select a plan'),
});

type RegistrationForm = z.infer<typeof registrationSchema>;

const STEPS: {
  label: string;
  title: string;
  description: string;
  fields: (keyof RegistrationForm)[];
}[] = [
  {
    label: 'School',
    title: 'School details',
    description: 'Tell us about the school you’re registering.',
    fields: ['schoolName', 'address', 'city', 'country', 'currency', 'curriculum', 'expectedStudents'],
  },
  {
    label: 'Contact',
    title: 'Contact person',
    description: 'Who should we reach about this application?',
    fields: ['contactPerson', 'email', 'phone'],
  },
  {
    label: 'Plan',
    title: 'Choose a plan',
    description: 'Pick what fits today — you can change plans later.',
    fields: ['requestedPlanId'],
  },
  {
    label: 'Review',
    title: 'Review & submit',
    description: 'Check everything looks right before you apply.',
    fields: [],
  },
];
const LAST_STEP = STEPS.length - 1;

const DRAFT_KEY = 'sms-registration-draft';
/** A draft holds a contact's name, email and phone — don't keep it on a shared computer indefinitely. */
const DRAFT_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * The saved draft's form values, or null when there is none or it is older
 * than DRAFT_TTL_MS. `legacy` marks a draft saved before drafts carried a
 * timestamp: it is accepted (not thrown away mid-form) and re-saved stamped.
 */
function parseDraft(raw: string | null, now: number): { values: unknown; legacy: boolean } | null {
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  if (!('savedAt' in parsed) || !('values' in parsed)) return { values: parsed, legacy: true };
  const { savedAt, values } = parsed as { savedAt: unknown; values: unknown };
  if (typeof savedAt !== 'number' || now - savedAt > DRAFT_TTL_MS) return null;
  return { values, legacy: false };
}

function saveDraft(values: unknown): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), values }));
  } catch {
    // Storage full or blocked — the draft is a convenience, not a requirement.
  }
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader showSectionLinks={false} />
      <main className="flex-1">
        <Suspense fallback={null}>
          <RegisterFlow />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}

function RegisterFlow() {
  const searchParams = useSearchParams();
  const planFromLink = searchParams.get('plan');
  const [step, setStep] = useState(0);
  /** Which way the last step change went — the new step slides in from that side. */
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string; email: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasMounted = useRef(false);
  const appliedLinkPlan = useRef(false);

  const plansQuery = useQuery({ queryKey: ['plans', 'public'], queryFn: listPublicPlans });

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { schoolName: '', contactPerson: '', email: '', phone: '', requestedPlanId: '' },
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const draft = parseDraft(raw, Date.now());
      if (draft) {
        form.reset(draft.values as RegistrationForm);
        if (draft.legacy) saveDraft(draft.values);
      } else if (raw) {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // Corrupt draft or storage blocked — start clean.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  // Plan preselection, in priority order: the plan the visitor clicked on the
  // home page (once), a still-valid plan from their draft, then the free
  // trial so nobody is blocked picking a paid plan just to get started.
  useEffect(() => {
    const plans = plansQuery.data;
    if (!plans) return;
    if (!appliedLinkPlan.current && planFromLink && plans.some((p) => p._id === planFromLink)) {
      appliedLinkPlan.current = true;
      form.setValue('requestedPlanId', planFromLink);
      return;
    }
    const current = form.getValues('requestedPlanId');
    if (current && plans.some((p) => p._id === current)) return;
    form.setValue('requestedPlanId', plans.find((p) => p.priceMinor === 0)?._id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the plan list or link changes
  }, [plansQuery.data, planFromLink]);

  useEffect(() => {
    const subscription = form.watch((values) => saveDraft(values));
    return () => subscription.unsubscribe();
  }, [form]);

  // Move focus to the new step's heading so screen-reader and keyboard users
  // land at the top of what changed, not on a button that no longer exists.
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const goTo = (target: number) => {
    setServerError(null);
    setDirection(target > step ? 'forward' : 'back');
    setStep(target);
  };

  const next = async () => {
    const valid = await form.trigger(STEPS[step].fields, { shouldFocus: true });
    if (valid) goTo(Math.min(step + 1, LAST_STEP));
  };

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const result = await submitRegistration({
        ...values,
        expectedStudents: values.expectedStudents ? Number(values.expectedStudents) : undefined,
      });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      setSubmitted({ id: result.id, email: values.email });
    } catch (err) {
      setServerError(
        err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.',
      );
    }
  });

  // Enter in any field advances a step rather than submitting a half-filled
  // application; only the last step actually submits.
  const onFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    if (step < LAST_STEP) {
      e.preventDefault();
      void next();
      return;
    }
    void submit(e);
  };

  if (submitted) return <Submitted id={submitted.id} email={submitted.email} />;

  const current = STEPS[step];
  const isSubmitting = form.formState.isSubmitting;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-20 lg:py-16">
      <aside className="space-y-8 lg:sticky lg:top-28 lg:self-start">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Register your school
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Takes about five minutes. Every application is reviewed before the school goes live.
          </p>
        </div>
        <Stepper step={step} onSelect={goTo} />
        <p className="text-muted-foreground hidden items-center gap-2 text-xs lg:flex">
          <HardDriveDownload className="size-3.5" aria-hidden="true" />
          Your progress is saved on this device.
        </p>
      </aside>

      <FormProvider {...form}>
        <form onSubmit={onFormSubmit} noValidate className="max-w-[640px] space-y-8">
          <div className="space-y-1.5">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight outline-none"
            >
              {current.title}
            </h2>
            <p className="text-muted-foreground text-sm">{current.description}</p>
          </div>

          {serverError && (
            <Alert variant="destructive" className="animate-shake">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          {/* Keyed by step so each one mounts fresh and slides in from the side it came from. */}
          <div
            key={step}
            className={cn(
              direction === 'forward' && 'animate-step-forward',
              direction === 'back' && 'animate-step-back',
            )}
          >
            {step === 0 && <SchoolStep />}
            {step === 1 && <ContactStep />}
            {step === 2 && (
              <PlanStep
                plans={plansQuery.data}
                isLoading={plansQuery.isLoading}
                isError={plansQuery.isError}
                isFetching={plansQuery.isFetching}
                onRetry={() => void plansQuery.refetch()}
              />
            )}
            {step === 3 && <ReviewStep plans={plansQuery.data} onEdit={goTo} />}
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-6">
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-10 px-3"
                onClick={() => goTo(step - 1)}
              >
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
            ) : (
              <Link
                href="/register/status"
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                Already applied?
              </Link>
            )}
            <Button type="submit" className="h-10 px-5" disabled={isSubmitting}>
              {step < LAST_STEP ? (
                <>
                  Continue
                  <ArrowRight aria-hidden="true" />
                </>
              ) : isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                'Submit application'
              )}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}

/**
 * Vertical, clickable-backwards stepper from 1024px; a single progress line
 * below that, where four labelled circles would wrap or shrink to illegible.
 */
function Stepper({ step, onSelect }: { step: number; onSelect: (step: number) => void }) {
  return (
    <>
      <div className="space-y-2 lg:hidden">
        <p className="text-sm">
          <span className="font-medium">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-muted-foreground"> · {STEPS[step].label}</span>
        </p>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
          <div
            // scaleX rather than width: animating width reflows on every frame.
            className="bg-primary ease-emphasized h-full w-full origin-left rounded-full transition-transform duration-500"
            style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }}
          />
        </div>
      </div>

      <ol className="hidden lg:block">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const content = (
            <>
              <span
                className={cn(
                  'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                  active && 'border-primary bg-primary text-primary-foreground',
                  done && 'border-primary bg-background text-primary',
                  !active && !done && 'bg-background text-muted-foreground',
                )}
              >
                {done ? <Check className="animate-pop size-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span className="pt-1">
                <span
                  className={cn(
                    'block text-sm font-medium',
                    !active && !done && 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
                {done && <span className="sr-only"> (completed)</span>}
              </span>
            </>
          );
          return (
            <li
              key={s.label}
              className="relative pb-6 last:pb-0"
              aria-current={active ? 'step' : undefined}
            >
              {i < LAST_STEP && (
                <span
                  className={cn(
                    'absolute top-7 bottom-0 left-3.5 w-px -translate-x-1/2',
                    done ? 'bg-primary' : 'bg-border',
                  )}
                  aria-hidden="true"
                />
              )}
              {done ? (
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  className="group focus-visible:ring-ring/50 -m-1 flex items-start gap-3 rounded-md p-1 text-left outline-none focus-visible:ring-3"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-start gap-3">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

type TextFieldName = Exclude<keyof RegistrationForm, 'requestedPlanId' | 'address'>;

function TextField({
  name,
  label,
  required,
  help,
  className,
  ...inputProps
}: { name: TextFieldName; label: string; required?: boolean; help?: string } & Omit<
  ComponentProps<typeof Input>,
  'name' | 'id'
>) {
  const {
    register,
    formState: { errors },
  } = useFormContext<RegistrationForm>();
  const error = errors[name]?.message;
  return (
    <Field label={label} htmlFor={name} required={required} help={help} error={error}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={cn('h-10', className)}
          {...inputProps}
          {...register(name)}
        />
      )}
    </Field>
  );
}

function SchoolStep() {
  const { register } = useFormContext<RegistrationForm>();
  return (
    <div className="space-y-5">
      <TextField name="schoolName" label="School name" required autoComplete="organization" />
      <Field label="Address" htmlFor="address">
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            rows={2}
            autoComplete="street-address"
            aria-describedby={describedBy}
            {...register('address')}
          />
        )}
      </Field>
      <FormRow className="gap-5">
        <TextField name="city" label="City" autoComplete="address-level2" />
        <TextField name="country" label="Country" autoComplete="country-name" />
      </FormRow>
      <CurrencyField />
      <FormRow className="gap-5">
        <TextField
          name="curriculum"
          label="Curriculum / board"
          placeholder="e.g. Cambridge, IB, national"
        />
        <TextField
          name="expectedStudents"
          label="Expected students"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="e.g. 450"
        />
      </FormRow>
    </div>
  );
}

/** Currency label as shown in the picker and the review: "PKR — Pakistani rupee". */
const currencyLabel = (code: string | undefined) => {
  const c = SCHOOL_CURRENCIES.find((x) => x.code === code);
  return c ? `${c.code} — ${c.name}` : undefined;
};

/**
 * The currency fees, salaries and receipts are in. Chosen once: after approval
 * it's fixed, because changing it would relabel every amount already recorded.
 */
function CurrencyField() {
  const {
    control,
    trigger,
    formState: { errors },
  } = useFormContext<RegistrationForm>();
  const error = errors.currency?.message;
  return (
    <Field
      label="Currency"
      htmlFor="currency"
      required
      error={error}
      help="Fees, salaries and receipts are shown in this currency. It can’t be changed after approval."
    >
      {({ id, describedBy }) => (
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select
              value={field.value ?? ''}
              onValueChange={(v) => {
                field.onChange(v);
                // Clear "choose a currency" the moment one is chosen, not on the next Continue.
                if (error) void trigger('currency');
              }}
            >
              <SelectTrigger
                id={id}
                className="h-10 w-full"
                aria-invalid={!!error}
                aria-describedby={describedBy}
                onBlur={field.onBlur}
                ref={field.ref}
              >
                <SelectValue placeholder="Select a currency">
                  {(v: string) => currencyLabel(v) ?? 'Select a currency'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SCHOOL_CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </Field>
  );
}

function ContactStep() {
  return (
    <div className="space-y-5">
      <TextField name="contactPerson" label="Full name" required autoComplete="name" />
      <TextField
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        help="This becomes the School Admin login if your application is approved."
      />
      <TextField name="phone" label="Phone" type="tel" required autoComplete="tel" />
    </div>
  );
}

function PlanStep({
  plans,
  isLoading,
  isError,
  isFetching,
  onRetry,
}: {
  plans: Awaited<ReturnType<typeof listPublicPlans>> | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<RegistrationForm>();

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading plans">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">Plans couldn&apos;t be loaded</p>
          <p className="text-muted-foreground text-sm">Your answers so far are saved.</p>
        </div>
        <Button type="button" variant="outline" onClick={onRetry} disabled={isFetching}>
          <RefreshCw className={cn(isFetching && 'animate-spin')} aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (!plans?.length) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm font-medium">No plans are open for registration right now</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Your answers are saved — please check back soon.
        </p>
      </div>
    );
  }

  const error = errors.requestedPlanId?.message;

  return (
    <fieldset className="space-y-3" aria-describedby={error ? 'plan-error' : undefined}>
      <legend className="sr-only">Plan</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((plan) => (
          <label
            key={plan._id}
            className="group bg-card hover:border-foreground/25 has-checked:border-primary has-checked:ring-primary has-focus-visible:outline-ring relative flex cursor-pointer flex-col gap-4 rounded-xl border p-5 ring-1 ring-transparent transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
          >
            <input
              type="radio"
              value={plan._id}
              className="sr-only"
              {...register('requestedPlanId')}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{plan.name}</p>
                {plan.description && (
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                    {plan.description}
                  </p>
                )}
              </div>
              <span
                className="border-input group-has-checked:border-primary group-has-checked:bg-primary flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
                aria-hidden="true"
              >
                <Check className="text-primary-foreground ease-spring size-3 scale-50 opacity-0 transition-[opacity,scale] duration-300 group-has-checked:scale-100 group-has-checked:opacity-100" />
              </span>
            </div>
            <PlanPrice plan={plan} size="sm" />
            <PlanLimits plan={plan} className="border-t pt-4 text-[0.8125rem]" />
          </label>
        ))}
      </div>
      {error && (
        <p id="plan-error" role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function ReviewStep({
  plans,
  onEdit,
}: {
  plans: Awaited<ReturnType<typeof listPublicPlans>> | undefined;
  onEdit: (step: number) => void;
}) {
  const { control } = useFormContext<RegistrationForm>();
  const v = useWatch({ control });
  const plan = plans?.find((p) => p._id === v.requestedPlanId);
  const price = plan ? planPriceParts(plan) : null;

  const sections: { title: string; step: number; rows: [string, string | undefined][] }[] = [
    {
      title: 'School',
      step: 0,
      rows: [
        ['School name', v.schoolName],
        ['Address', [v.address, v.city, v.country].filter(Boolean).join(', ')],
        ['Currency', currencyLabel(v.currency)],
        ['Curriculum', v.curriculum],
        ['Expected students', v.expectedStudents],
      ],
    },
    {
      title: 'Contact',
      step: 1,
      rows: [
        ['Name', v.contactPerson],
        ['Email', v.email],
        ['Phone', v.phone],
      ],
    },
    {
      title: 'Plan',
      step: 2,
      rows: [
        [
          'Plan',
          plan && price ? `${plan.name} · ${price.amount} ${price.period ?? ''}`.trim() : undefined,
        ],
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-card divide-y rounded-xl border">
        {sections.map((section) => (
          <section key={section.title} className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{section.title}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary -mr-2"
                onClick={() => onEdit(section.step)}
                aria-label={`Edit ${section.title.toLowerCase()} details`}
              >
                Edit
              </Button>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
              {section.rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={cn('mb-2 break-words sm:mb-0', !value && 'text-muted-foreground')}>
                    {value || '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        By submitting, you confirm these details are accurate. If approved, login details are sent
        to <span className="text-foreground font-medium">{v.email}</span>.
      </p>
    </div>
  );
}

function Submitted({ id, email }: { id: string; email: string }) {
  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Reference copied');
    } catch {
      toast.error('Couldn’t copy — select the reference and copy it manually.');
    }
  };

  const nextSteps = [
    'Our team reviews your application.',
    `If approved, login details are emailed to ${email}.`,
    'Sign in and start adding classes, staff and students.',
  ];

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="bg-success-soft text-success animate-pop flex size-12 items-center justify-center rounded-xl">
        <CheckCircle2 className="size-6" aria-hidden="true" />
      </div>
      <h1
        className="animate-fade-up mt-6 text-2xl font-semibold tracking-tight sm:text-3xl"
        style={stagger(1, 80)}
      >
        Application submitted
      </h1>
      <p
        className="text-muted-foreground animate-fade-up mt-2 leading-relaxed"
        style={stagger(2, 80)}
      >
        Thanks — we&apos;ve received your application. Keep your reference in case you need to
        contact us.
      </p>

      <div
        className="bg-card animate-fade-up mt-8 flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
        style={stagger(3, 80)}
      >
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">Reference</p>
          <p className="truncate font-mono text-sm">{id}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void copyReference()}>
          <Copy aria-hidden="true" />
          Copy
        </Button>
      </div>

      <h2 className="mt-10 text-sm font-semibold">What happens next</h2>
      <ol className="mt-4 space-y-4">
        {nextSteps.map((text, i) => (
          <li key={text} className="animate-fade-up flex gap-3 text-sm" style={stagger(i, 70, 400)}>
            <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
              {i + 1}
            </span>
            <span className="pt-0.5">{text}</span>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href="/register/status" className={cn(buttonVariants(), 'h-10 px-5')}>
          Check application status
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-5')}>
          Back to home
        </Link>
      </div>
    </div>
  );
}

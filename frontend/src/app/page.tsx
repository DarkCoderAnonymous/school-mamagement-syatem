'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpenCheck,
  Boxes,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardList,
  Monitor,
  NotebookPen,
  Package,
  ReceiptText,
  RefreshCw,
  Smartphone,
  UserPlus,
  UsersRound,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { SiteFooter, SiteHeader } from '@/components/public/site-chrome';
import { PlanLimits, PlanPrice } from '@/components/public/plan-parts';
import { DisplayItalic, HeadlineAccent } from '@/components/public/headline-accent';
import { ModuleMarquee } from '@/components/public/module-marquee';
import { listPublicPlans } from '@/lib/api/plans';
import { planPriceParts } from '@/lib/format-price';
import { stagger } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/public/count-up';
import { Reveal } from '@/components/public/reveal';

/**
 * Icon tints for the feature cards. Drawn from the chart ramp rather than the
 * status colours, so no card reads as "paid", "overdue" or "pending".
 */
const TONES = {
  blue: 'bg-primary/10 text-primary',
  teal: 'bg-chart-2/12 text-chart-2',
  violet: 'bg-chart-5/12 text-chart-5',
} as const;

type Feature = {
  icon: LucideIcon;
  title: string;
  body: string;
  tone: keyof typeof TONES;
  /** Grid span (the wide cards). Every card carries a small illustration of its screen. */
  span?: string;
  visual?: ReactNode;
};

const FEATURES: Feature[] = [
  {
    icon: CalendarCheck,
    title: 'Attendance',
    body: 'Take a whole section’s register in a few taps, then note the exceptions. Holidays and days off are skipped for you, and monthly registers build themselves.',
    tone: 'blue',
    span: 'sm:col-span-2',
    visual: <RegisterVisual />,
  },
  {
    icon: ReceiptText,
    title: 'Fees & receipts',
    body: 'Fee cycles, invoices, part payments and printable receipts — every amount accounted for.',
    tone: 'teal',
    visual: <FeesVisual />,
  },
  {
    icon: UserPlus,
    title: 'Admissions & records',
    body: 'Student profiles, guardians and admission numbers issued in sequence, per school.',
    tone: 'violet',
    visual: <AdmissionVisual />,
  },
  {
    icon: BookOpenCheck,
    title: 'Exams & results',
    body: 'Marks entry by subject, a review step before publishing, and report cards parents can see.',
    tone: 'blue',
    visual: <GradesVisual />,
  },
  {
    icon: UsersRound,
    title: 'Roles & permissions',
    body: 'Give each staff member exactly the access their job needs — and change it any time.',
    tone: 'teal',
    visual: <RolesVisual />,
  },
  {
    icon: Wallet,
    title: 'Payroll & staff register',
    body: 'Mark staff attendance each day; absences and unpaid leave flow straight into that month’s payslips.',
    tone: 'violet',
    span: 'sm:col-span-2',
    visual: <PayslipVisual />,
  },
  {
    icon: Package,
    title: 'Inventory',
    body: 'Stock items, categories and a ledger of every movement in and out of the store room.',
    tone: 'blue',
    span: 'sm:col-span-2 lg:col-span-1',
    visual: <StockVisual />,
  },
];

/** Everything the product covers, for the scrolling strip under the hero. */
const MODULES = [
  { icon: UserPlus, label: 'Admissions' },
  { icon: CalendarCheck, label: 'Attendance' },
  { icon: CalendarDays, label: 'Holidays & days off' },
  { icon: NotebookPen, label: 'Marks entry' },
  { icon: BookOpenCheck, label: 'Report cards' },
  { icon: ReceiptText, label: 'Fee collection' },
  { icon: ClipboardList, label: 'Defaulters' },
  { icon: Wallet, label: 'Payroll' },
  { icon: CheckCheck, label: 'Staff register' },
  { icon: Boxes, label: 'Inventory' },
  { icon: UsersRound, label: 'Custom roles' },
  { icon: Smartphone, label: 'Mobile app' },
] as const;

const HERO_POINTS = [
  'A web console for staff',
  'A mobile app for families',
  'Each school’s data kept separate',
] as const;

const STEPS = [
  {
    title: 'Apply',
    body: 'Tell us about your school and choose a plan. It takes about five minutes.',
  },
  {
    title: 'Get approved',
    body: 'We review your application, and your administrator receives their login.',
  },
  {
    title: 'Bring everyone in',
    body: 'Add classes and students, invite staff with the right roles, and families join on mobile.',
  },
] as const;

const ROLE_GROUPS = [
  {
    icon: Monitor,
    title: 'On the web',
    body: 'The full console for the people who run the school.',
    roles: ['Administrators & principals', 'Accountants', 'Exam controllers', 'Teachers'],
  },
  {
    icon: Smartphone,
    title: 'In the mobile app',
    body: 'The day’s work and the family’s view, in their pocket.',
    roles: [
      'Parents & students — fees, attendance, results',
      'Teachers — registers and marks',
      'Office staff — fee collection and the staff register',
    ],
  },
] as const;

export default function Home() {
  return (
    <div data-landing className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Modules />
        <Features />
        <Roles />
        <HowItWorks />
        <Plans />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="bg-aurora animate-drift absolute -inset-[12%]" />
        <div className="bg-grid text-foreground absolute inset-0" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.02fr] lg:gap-12 lg:pt-24 lg:pb-28">
        <div className="space-y-7">
          <Link
            href="#features"
            className="group bg-card/80 hover:border-primary/30 focus-visible:ring-ring/50 animate-fade-up inline-flex items-center gap-2.5 rounded-full border py-1 pr-3 pl-1 text-xs font-medium shadow-xs backdrop-blur outline-none focus-visible:ring-3"
            style={stagger(0, 80)}
          >
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
              New
            </span>
            Payroll, staff register &amp; inventory
            <ArrowRight
              className="text-muted-foreground size-3.5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>

          <h1
            className="animate-fade-up text-[2.375rem] leading-[1.05] font-semibold sm:text-6xl lg:text-[4rem]"
            style={stagger(1, 80)}
          >
            Run your whole school from one <HeadlineAccent>calm workspace.</HeadlineAccent>
          </h1>

          <p
            className="text-muted-foreground animate-fade-up max-w-xl text-base leading-relaxed sm:text-lg"
            style={stagger(2, 80)}
          >
            Admissions, attendance, fees, exams and payroll — on the web for your staff and on
            mobile for families.
          </p>

          <div className="animate-fade-up flex flex-col gap-3 sm:flex-row" style={stagger(3, 80)}>
            <Link
              href="/register"
              className={cn(
                buttonVariants(),
                'shadow-glow h-12 px-6 text-[0.9375rem] hover:-translate-y-px',
              )}
            >
              Register your school
              <ArrowRight className={ARROW_NUDGE} aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: 'outline' }),
                'bg-card/70 h-12 px-6 text-[0.9375rem] backdrop-blur',
              )}
            >
              Sign in
            </Link>
          </div>

          <ul
            className="animate-fade-up text-muted-foreground flex flex-col gap-x-5 gap-y-2 text-sm sm:flex-row sm:flex-wrap"
            style={stagger(4, 80)}
          >
            {HERO_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-2">
                <span className="bg-success-soft text-success flex size-5 items-center justify-center rounded-full">
                  <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <p className="text-muted-foreground animate-fade-up text-sm" style={stagger(5, 80)}>
            Already applied?{' '}
            <Link
              href="/register/status"
              className="text-foreground font-medium underline decoration-(--highlight) decoration-2 underline-offset-4 hover:decoration-(--primary)"
            >
              Check your application status
            </Link>
          </p>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}

/** Module-level so <CountUp>'s effect doesn't restart on every render. */
const formatPercent = (n: number) => `${n.toFixed(1)}%`;
const formatDollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const formatCount = (n: number) => String(Math.round(n));

/** The arrow leans toward where the button goes. */
const ARROW_NUDGE = 'transition-transform duration-200 ease-out group-hover/button:translate-x-0.5';

/**
 * An illustrative slice of the staff console, built from the real status
 * badges so it matches the product, with two "live" notifications floating
 * over it. Decorative — hidden from assistive tech and dropped below 768px,
 * where it would only push the call to action down.
 */
function ProductPreview() {
  const rows = [
    { name: 'Ayesha Khan', cls: 'Grade 7 · A', amount: '$120', status: 'PAID' },
    { name: 'Daniel Okafor', cls: 'Grade 5 · B', amount: '$120', status: 'PARTIALLY_PAID' },
    { name: 'Mei Lin', cls: 'Grade 9 · A', amount: '$145', status: 'OVERDUE' },
    { name: 'Omar Farooq', cls: 'Grade 3 · C', amount: '$95', status: 'PAID' },
  ];
  const stats = [
    { label: 'Present today', value: 96.4, format: formatPercent, dot: 'bg-success' },
    { label: 'Fees collected', value: 18240, format: formatDollars, dot: 'bg-primary' },
    { label: 'Results pending', value: 3, format: formatCount, dot: 'bg-warning' },
  ];
  const week = [
    { day: 'Mon', pct: 92 },
    { day: 'Tue', pct: 95 },
    { day: 'Wed', pct: 89 },
    { day: 'Thu', pct: 97 },
    { day: 'Fri', pct: 96 },
  ];

  return (
    <div
      aria-hidden="true"
      className="animate-fade-up relative hidden md:mx-6 md:block lg:mx-0"
      style={stagger(0, 0, 240)}
    >
      <div className="bg-aurora absolute -inset-10 -z-10 opacity-90 blur-2xl" />

      <div className="bg-card ring-foreground/5 relative rounded-2xl border shadow-[0_30px_70px_-28px_oklch(0.3_0.06_258/0.35)] ring-1">
        <div className="flex items-center gap-1.5 border-b px-4 py-3">
          <span className="bg-destructive/60 size-2.5 rounded-full" />
          <span className="bg-warning/70 size-2.5 rounded-full" />
          <span className="bg-success/60 size-2.5 rounded-full" />
          <span className="bg-muted text-muted-foreground mx-auto rounded-md px-3 py-0.5 text-[0.6875rem]">
            Dashboard · Spring term
          </span>
          <span className="w-10" />
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="bg-muted/50 rounded-lg px-3 py-2.5">
                <p className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem]">
                  <span className={cn('size-1.5 rounded-full', s.dot)} />
                  {s.label}
                </p>
                <p className="tabular mt-0.5 text-lg font-semibold">
                  <CountUp value={s.value} format={s.format} delay={500} />
                </p>
              </div>
            ))}
          </div>

          <div className="bg-muted/30 rounded-lg border px-4 pt-3 pb-2.5">
            <p className="text-muted-foreground text-[0.6875rem] font-medium">
              Attendance this week
            </p>
            <div className="mt-2 flex h-16 items-end gap-3">
              {week.map((d, i) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-12 w-full items-end">
                    <div
                      className="animate-grow-y from-primary/70 to-primary w-full origin-bottom rounded-t-[4px] bg-linear-to-b"
                      style={{ height: `${(d.pct - 70) * 3.3}%`, ...stagger(i, 70, 600) }}
                    />
                  </div>
                  <span className="text-muted-foreground text-[0.625rem]">{d.day}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <div className="text-muted-foreground bg-muted/40 grid grid-cols-[1.4fr_1fr_0.7fr_1fr] gap-2 border-b px-3 py-2 text-[0.6875rem] font-medium">
              <span>Student</span>
              <span>Class</span>
              <span className="text-right">Due</span>
              <span className="text-right">Status</span>
            </div>
            {/* Rows arrive one by one, the way a live list fills in. */}
            {rows.map((r, i) => (
              <div
                key={r.name}
                className="animate-fade-up grid grid-cols-[1.4fr_1fr_0.7fr_1fr] items-center gap-2 border-b px-3 py-2.5 text-xs last:border-b-0"
                style={stagger(i, 90, 650)}
              >
                <span className="truncate font-medium">{r.name}</span>
                <span className="text-muted-foreground truncate">{r.cls}</span>
                <span className="tabular text-right">{r.amount}</span>
                <span className="text-right">
                  <StatusBadge status={r.status} className="text-[0.6875rem]" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <FloatingNote
        className="top-[44%] -left-4 lg:-left-14"
        delay={1150}
        icon={<CheckCheck className="size-4" />}
        iconClass="bg-success-soft text-success"
        title="Register taken"
        detail="Grade 7 · A — 32 of 33 present"
      />
      <FloatingNote
        className="-right-3 -bottom-7 lg:-right-8"
        delay={1450}
        floatDelay={1800}
        icon={<ReceiptText className="size-4" />}
        iconClass="bg-primary/12 text-primary"
        title="Payment received"
        detail="Receipt RC-00142 · $120.00"
      />
    </div>
  );
}

/**
 * A notification card that pops in over the preview, then bobs gently. The
 * two animations sit on separate elements because both move `transform`.
 */
function FloatingNote({
  className,
  delay,
  floatDelay = 0,
  icon,
  iconClass,
  title,
  detail,
}: {
  className: string;
  delay: number;
  floatDelay?: number;
  icon: ReactNode;
  iconClass: string;
  title: string;
  detail: string;
}) {
  return (
    <div className={cn('animate-pop absolute z-10', className)} style={stagger(0, 0, delay)}>
      <div
        className="animate-float bg-card/95 flex items-center gap-3 rounded-xl border py-2.5 pr-4 pl-2.5 shadow-lg backdrop-blur"
        style={stagger(0, 0, floatDelay)}
      >
        <span className={cn('flex size-8 items-center justify-center rounded-lg', iconClass)}>
          {icon}
        </span>
        <div className="leading-tight">
          <p className="text-xs font-semibold">{title}</p>
          <p className="text-muted-foreground mt-0.5 text-[0.6875rem]">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function Modules() {
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ModuleMarquee items={MODULES} label="What’s included" />
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  body?: string;
  className?: string;
}) {
  return (
    <Reveal className={cn('max-w-2xl space-y-4', className)}>
      <p className="text-primary flex items-center gap-2 text-sm font-semibold">
        <span className="bg-highlight h-0.5 w-6 rounded-full" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 className="text-3xl leading-[1.1] font-semibold sm:text-[2.5rem]">{title}</h2>
      {body && <p className="text-muted-foreground text-base leading-relaxed">{body}</p>}
    </Reveal>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          eyebrow="Features"
          title={
            <>
              The daily work of a school, <DisplayItalic>in one place</DisplayItalic>
            </>
          }
          body="Built around the records schools get audited on, so the numbers always add up."
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body, tone, span, visual }, i) => (
            <Reveal as="li" key={title} index={i % 3} className={cn('group/card flex', span)}>
              {/* Hover lift lives on the inner card so it never fights the reveal's own transition. */}
              <div className="bg-card hover:border-primary/25 flex flex-1 flex-col gap-5 rounded-2xl border p-6 transition-[translate,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-7">
                <div className="space-y-3">
                  <span
                    className={cn(
                      'flex size-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover/card:scale-105',
                      TONES[tone],
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-lg font-semibold">{title}</h3>
                  <p className="text-muted-foreground max-w-prose text-sm leading-relaxed">
                    {body}
                  </p>
                </div>
                {visual && (
                  <div aria-hidden="true" className="mt-auto">
                    {visual}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/*
 * Feature illustrations. Decorative and hidden from assistive tech — the card
 * text says everything. Their bars fill when the card is revealed
 * (`group-data-[reveal=hidden]/card`), so the motion happens where the visitor
 * is looking rather than on page load, far above.
 */
const FILL_ON_REVEAL =
  'transition-transform duration-700 ease-(--ease-emphasized) delay-300 group-data-[reveal=hidden]/card:scale-x-0 origin-left';
const RISE_ON_REVEAL =
  'transition-transform duration-700 ease-(--ease-emphasized) group-data-[reveal=hidden]/card:scale-y-0 origin-bottom';

function RegisterVisual() {
  // One absent (index 11), one late (index 23) — the exceptions a teacher marks.
  const cells = Array.from({ length: 33 }, (_, i) =>
    i === 11 ? 'absent' : i === 23 ? 'late' : 'present',
  );
  return (
    <div className="bg-muted/40 rounded-xl border p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Grade 7 · A</span>
        <span className="text-muted-foreground tabular">Today</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {cells.map((c, i) => (
          <span
            key={i}
            className={cn(
              'size-4 rounded-[4px] sm:size-5',
              c === 'present' && 'bg-success/75',
              c === 'absent' && 'bg-destructive',
              c === 'late' && 'bg-warning',
            )}
          />
        ))}
      </div>
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem]">
        <span className="flex items-center gap-1.5">
          <span className="bg-success/75 size-2 rounded-sm" />
          31 present
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-warning size-2 rounded-sm" />1 late
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-destructive size-2 rounded-sm" />1 absent
        </span>
      </div>
    </div>
  );
}

function FeesVisual() {
  return (
    <div className="bg-muted/40 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground text-[0.6875rem]">Collected this term</span>
        <span className="tabular text-sm font-semibold">83%</span>
      </div>
      <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
        <div className={cn('bg-chart-2 h-full w-[83%] rounded-full', FILL_ON_REVEAL)} />
      </div>
      <p className="tabular text-muted-foreground mt-2 text-[0.6875rem]">$18,240 of $22,000</p>
    </div>
  );
}

function GradesVisual() {
  const grades = [
    { g: 'A+', n: 6 },
    { g: 'A', n: 11 },
    { g: 'B', n: 9 },
    { g: 'C', n: 4 },
    { g: 'D', n: 2 },
  ];
  return (
    <div className="bg-muted/40 flex h-24 items-end gap-2.5 rounded-xl border px-4 pt-3 pb-2">
      {grades.map(({ g, n }, i) => (
        <div key={g} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div
            className={cn('bg-primary/80 w-full rounded-t-[4px]', RISE_ON_REVEAL)}
            style={{ height: `${(n / 11) * 70}%`, transitionDelay: `${250 + i * 60}ms` }}
          />
          <span className="text-muted-foreground text-[0.625rem] font-medium">{g}</span>
        </div>
      ))}
    </div>
  );
}

function PayslipVisual() {
  const lines = [
    { label: 'Basic salary', amount: '$1,200.00' },
    { label: 'Allowances', amount: '$150.00' },
    { label: 'Unpaid days (2) · from the staff register', amount: '−$92.30', muted: true },
  ];
  return (
    <div className="bg-muted/40 rounded-xl border p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Payslip · September</span>
        <span className="font-mono text-muted-foreground text-[0.6875rem]">EMP-0027</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground truncate">{l.label}</dt>
            <dd className={cn('tabular shrink-0', l.muted && 'text-destructive')}>{l.amount}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
          <dt>Net pay</dt>
          <dd className="tabular">$1,257.70</dd>
        </div>
      </dl>
    </div>
  );
}

function AdmissionVisual() {
  return (
    <div className="bg-muted/40 flex items-center gap-3 rounded-xl border p-4">
      <span className="bg-chart-5/15 text-chart-5 grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold">
        AK
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium">Ayesha Khan</p>
        <p className="text-muted-foreground truncate font-mono text-[0.6875rem]">ADM-2026-0042</p>
      </div>
      <div className="text-muted-foreground shrink-0 text-right text-[0.6875rem] leading-snug">
        <p className="text-foreground font-medium">Grade 7 · A</p>
        <p>2 guardians</p>
      </div>
    </div>
  );
}

function RolesVisual() {
  const perms = [
    { label: 'Record payments', on: true },
    { label: 'View fee reports', on: true },
    { label: 'Edit fee setup', on: false },
  ];
  return (
    <div className="bg-muted/40 rounded-xl border p-4">
      <p className="text-xs font-medium">Accountant</p>
      <ul className="mt-3 space-y-2">
        {perms.map((p, i) => (
          <li key={p.label} className="flex items-center justify-between gap-3 text-xs">
            <span className={cn(!p.on && 'text-muted-foreground')}>{p.label}</span>
            <span
              className={cn(
                'relative h-4 w-7 shrink-0 rounded-full transition-colors duration-500',
                p.on ? 'bg-chart-2 group-data-[reveal=hidden]/card:bg-muted' : 'bg-muted-foreground/25',
              )}
              style={{ transitionDelay: `${300 + i * 120}ms` }}
            >
              <span
                className={cn(
                  'bg-card absolute top-0.5 left-0.5 size-3 rounded-full shadow-xs transition-transform duration-500 ease-(--ease-emphasized)',
                  p.on && 'translate-x-3 group-data-[reveal=hidden]/card:translate-x-0',
                )}
                style={{ transitionDelay: `${300 + i * 120}ms` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StockVisual() {
  const items = [
    { name: 'Exercise books', pct: 78 },
    { name: 'Whiteboard markers', pct: 16, low: true },
    { name: 'Lab beakers', pct: 54 },
  ];
  return (
    <div className="bg-muted/40 space-y-3 rounded-xl border p-4">
      {items.map((it, i) => (
        <div key={it.name} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{it.name}</span>
            {it.low ? (
              <span className="bg-warning-soft text-warning-ink shrink-0 rounded px-1.5 text-[0.625rem] font-medium">
                Low
              </span>
            ) : (
              <span className="text-muted-foreground tabular shrink-0 text-[0.6875rem]">{it.pct}%</span>
            )}
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className={cn('h-full rounded-full', it.low ? 'bg-warning' : 'bg-primary/70', FILL_ON_REVEAL)}
              style={{ width: `${it.pct}%`, transitionDelay: `${300 + i * 90}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Roles() {
  return (
    <section id="roles" className="bg-muted/40 scroll-mt-16 border-y">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:py-28">
        <SectionHeading
          eyebrow="Who it’s for"
          title={
            <>
              One account per person, <DisplayItalic>the right view</DisplayItalic> for each role
            </>
          }
          body="A teacher who works at two schools, or a parent with children at both, signs in once and picks the school."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {ROLE_GROUPS.map(({ icon: Icon, title, body, roles }, i) => (
            <Reveal
              key={title}
              index={i}
              className="bg-card relative space-y-4 overflow-hidden rounded-2xl border p-6 sm:p-7"
            >
              {/* A hairline of the accent across the top, fading out — the card's only ornament. */}
              <span
                className="via-primary/60 absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent"
                aria-hidden="true"
              />
              <div className="flex items-center gap-3">
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
              </div>
              <p className="text-muted-foreground text-sm">{body}</p>
              <ul className="space-y-2.5 border-t pt-4 text-sm">
                {roles.map((role) => (
                  <li key={role} className="flex items-start gap-2.5">
                    <Check
                      className="text-success mt-0.5 size-4 shrink-0"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    {role}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl space-y-14 px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          eyebrow="Getting started"
          title={
            <>
              From application to <DisplayItalic>first register</DisplayItalic>
            </>
          }
        />
        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          {/* The thread joining the steps, from 768px up where they sit in a row. */}
          <span
            className="from-primary/40 via-highlight/50 to-primary/10 absolute top-7 right-[16%] left-[16%] hidden h-px bg-linear-to-r md:block"
            aria-hidden="true"
          />
          {STEPS.map((step, i) => (
            <Reveal
              as="li"
              key={step.title}
              index={i}
              className="relative space-y-4 md:text-center"
            >
              <span className="bg-card text-primary font-display relative mx-0 flex size-14 items-center justify-center rounded-2xl border text-2xl italic shadow-sm md:mx-auto">
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-muted-foreground mx-0 max-w-xs text-sm leading-relaxed md:mx-auto">
                {step.body}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Plans() {
  const plansQuery = useQuery({ queryKey: ['plans', 'public'], queryFn: listPublicPlans });

  return (
    <section id="plans" className="bg-muted/40 scroll-mt-16 border-y">
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          eyebrow="Plans"
          title={
            <>
              Pick a plan that <DisplayItalic>fits your school</DisplayItalic>
            </>
          }
          body="Plans differ by how many students and staff they cover. Start with what fits today — you can change plans later."
        />

        {plansQuery.isLoading && (
          <div
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-label="Loading plans"
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-80 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {plansQuery.isError && (
          <div className="bg-card flex flex-col items-start gap-4 rounded-2xl border border-dashed p-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium">Plans couldn&apos;t be loaded</p>
              <p className="text-muted-foreground text-sm">Check your connection and try again.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => void plansQuery.refetch()}
              disabled={plansQuery.isFetching}
            >
              <RefreshCw
                className={cn(plansQuery.isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              Retry
            </Button>
          </div>
        )}

        {plansQuery.data?.length === 0 && (
          <div className="bg-card rounded-2xl border border-dashed p-8 text-center">
            <p className="font-medium">Plans are being finalised</p>
            <p className="text-muted-foreground mt-1 text-sm">
              You can still register — we&apos;ll confirm pricing when we review your application.
            </p>
          </div>
        )}

        {!!plansQuery.data?.length && (
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plansQuery.data.map((plan, i) => {
              const { isTrial } = planPriceParts(plan);
              return (
                // Reveal on the <li>, hover lift on the card inside: each owns its own
                // `transition`, so neither overrides the other.
                <Reveal as="li" key={plan._id} index={i} className="flex">
                  <div
                    className={cn(
                      'bg-card relative flex flex-1 flex-col rounded-2xl border p-7',
                      // Lift on hover says "this is a choice you can make".
                      'hover:shadow-primary/5 transition-[translate,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-lg',
                      isTrial && 'border-primary/50 ring-primary/25 shadow-lg ring-2',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {isTrial && (
                        <span className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          Start here
                        </span>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                        {plan.description}
                      </p>
                    )}
                    <div className="mt-6">
                      <PlanPrice plan={plan} />
                    </div>
                    <PlanLimits plan={plan} className="mt-6 flex-1 border-t pt-6" />
                    <Link
                      href={`/register?plan=${encodeURIComponent(plan._id)}`}
                      className={cn(
                        buttonVariants({ variant: isTrial ? 'default' : 'outline' }),
                        'mt-8 h-11 w-full',
                        isTrial && 'shadow-glow',
                      )}
                    >
                      {isTrial ? 'Start free trial' : `Choose ${plan.name}`}
                    </Link>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:py-24">
      <Reveal className="bg-panel text-panel-foreground relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-14 sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="bg-aurora animate-drift absolute -inset-[20%] opacity-90" />
          <div className="bg-grid text-panel-foreground absolute inset-0" />
        </div>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl space-y-3">
            <h2 className="text-3xl leading-[1.1] font-semibold sm:text-4xl">
              Ready to bring your school <DisplayItalic>online?</DisplayItalic>
            </h2>
            <p className="text-panel-muted leading-relaxed">
              Apply in about five minutes. Once approved, your administrator gets a login and can
              start adding classes and students straight away.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className={cn(
                buttonVariants(),
                'bg-panel-foreground text-panel hover:bg-panel-foreground/90 h-12 px-6 text-[0.9375rem] shadow-lg hover:-translate-y-px',
              )}
            >
              Register your school
              <ArrowRight className={ARROW_NUDGE} aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'text-panel-foreground hover:bg-panel-foreground/10 hover:text-panel-foreground h-12 px-6 text-[0.9375rem]',
              )}
            >
              Sign in
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

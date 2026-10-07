import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Meter, Pill } from '@/components/ui/primitives';
import { getDashboard, type DashboardSummary } from '@/lib/api/dashboard';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';

interface SetupStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  permission: Permission;
  /** A phone screen that does it — only admitting students has one. */
  href?: '/modules/students/new';
  /** Where it lives on the web, for the setup steps that stay web-only (CLAUDE.md). */
  web: string;
}

/**
 * The web dashboard's "Finish setting up your school" checklist, on the phone.
 * Same steps, same rules (frontend/src/app/app/page.tsx): each shows only to
 * someone who may do it, and the card disappears once every step is done.
 * Setup screens are web-only, so most steps say where to go on the web;
 * admitting students opens the phone's own form.
 */
export function SetupChecklist() {
  const { user } = useSession();
  const summary = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard });
  const d = summary.data;
  if (!d) return null;

  const steps = stepsFor(d).filter((s) => can(user?.permissions, s.permission));
  const remaining = steps.filter((s) => !s.done);
  if (remaining.length === 0) return null;
  const doneCount = steps.length - remaining.length;

  return (
    <Card className="overflow-hidden">
      <View className="gap-2 border-b border-border p-4">
        <Text className="text-base font-semibold text-foreground">
          Finish setting up your school
        </Text>
        <Text className="text-xs text-muted-foreground">
          {remaining.length} of {steps.length} step{steps.length === 1 ? '' : 's'} left. Each one
          unlocks the next.
        </Text>
        <Meter
          value={doneCount / steps.length}
          label={`${doneCount} of ${steps.length} setup steps done`}
        />
      </View>
      {steps.map((step, i) => (
        <StepRow key={step.key} step={step} last={i === steps.length - 1} />
      ))}
    </Card>
  );
}

function StepRow({ step, last }: { step: SetupStep; last: boolean }) {
  const href = step.href;
  const content = (
    <>
      {step.done ? (
        <View className="mt-0.5 size-5 items-center justify-center rounded-full bg-success-soft">
          <Icon name="check" size={12} color="success" />
        </View>
      ) : (
        <View className="mt-0.5 size-5 rounded-full border-2 border-dashed border-muted-foreground" />
      )}
      <View className="flex-1 gap-0.5">
        <Text
          className={
            step.done
              ? 'text-sm text-muted-foreground line-through'
              : 'text-sm font-medium text-foreground'
          }
        >
          {step.label}
        </Text>
        {!step.done && (
          <>
            <Text className="text-xs text-muted-foreground">{step.description}</Text>
            {!href && <Text className="text-xs text-muted-foreground">On the web: {step.web}</Text>}
          </>
        )}
      </View>
      {!step.done &&
        (href ? <Icon name="chevronRight" size={16} /> : <Pill label="Web" tone="neutral" />)}
    </>
  );
  const className = `flex-row items-start gap-3 px-4 py-3 ${last ? '' : 'border-b border-border'}`;
  return !step.done && href ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${step.label}. ${step.description}`}
      onPress={() => router.push(href)}
      className={`${className} active:bg-muted`}
    >
      {content}
    </Pressable>
  ) : (
    <View
      className={className}
      accessible
      accessibilityLabel={`${step.label}: ${step.done ? 'done' : `to do, on the web under ${step.web}`}`}
    >
      {content}
    </View>
  );
}

function stepsFor(d: DashboardSummary): SetupStep[] {
  return [
    {
      key: 'session',
      label: 'Create your academic session',
      description: 'The school year that classes, attendance, exams and fees are recorded against.',
      done: Boolean(d.currentSession),
      permission: Permission.SESSION_READ,
      web: 'Academics → Academic sessions',
    },
    {
      key: 'classes',
      label: 'Add classes and sections',
      description: 'Your grades for this session, each split into sections with a class teacher.',
      done: (d.academics?.sections ?? 0) > 0,
      permission: Permission.CLASS_READ,
      web: 'Academics → Classes & sections',
    },
    {
      key: 'subjects',
      label: 'List your subjects',
      description: 'What’s taught — teachers are matched to these, and exams are set per subject.',
      done: (d.academics?.subjects ?? 0) > 0,
      permission: Permission.CLASS_READ,
      web: 'Academics → Subjects',
    },
    {
      key: 'teachers',
      label: 'Add your teachers',
      description: 'Each teacher gets their own sign-in for attendance and marks.',
      done: (d.teachers?.total ?? 0) > 0,
      permission: Permission.TEACHER_READ,
      web: 'People → Teachers',
    },
    {
      key: 'students',
      label: 'Admit students',
      description: 'Admission numbers are issued automatically, with guardians on file.',
      done: (d.students?.active ?? 0) > 0,
      permission: Permission.STUDENT_CREATE,
      href: '/modules/students/new',
      web: 'People → Students',
    },
  ];
}

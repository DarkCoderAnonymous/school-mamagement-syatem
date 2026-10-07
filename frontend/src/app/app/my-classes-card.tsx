'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
import { Permission } from '@sms/shared';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { usePermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { getMyClasses } from '@/lib/api/school';

/**
 * A teacher's answer to "which classes am I for?": every section they're
 * class teacher of or teach in this session, with a shortcut to its register.
 * Renders nothing for staff who don't teach.
 */
export function MyClassesCard() {
  const can = usePermission();
  const teaches = can(Permission.ATTENDANCE_MARK) || can(Permission.EXAM_MARKS_ENTER);
  const mine = useQuery({ queryKey: ['my-classes'], queryFn: getMyClasses, enabled: can(Permission.CLASS_READ) && teaches });

  if (!mine.data) return null;
  const sections = mine.data.sections;
  const office = can(Permission.ATTENDANCE_MANAGE);
  if (sections.length === 0 && office) return null;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="font-semibold">My classes</h2>
          <p className="text-muted-foreground text-xs">This session’s sections you lead or teach in.</p>
        </div>
        {sections.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You haven’t been assigned any classes yet. The school office assigns them from your teacher profile.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map((s) => (
              <li key={s.section._id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {s.class.name} · {s.section.name}
                    {s.isClassTeacher && (
                      <span className="bg-primary/10 text-primary ml-2 rounded px-1.5 py-0.5 text-[0.6875rem] font-medium">Class teacher</span>
                    )}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {s.subjects.length ? s.subjects.map((x) => x.name).join(', ') : 'No subjects assigned here'}
                  </p>
                </div>
                {can(Permission.ATTENDANCE_MARK) && (
                  <Link
                    href={`/app/attendance/${s.section._id}`}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
                    aria-label={`Take the register for ${s.class.name} ${s.section.name}`}
                  >
                    <ClipboardCheck className="size-4" />
                    Register
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

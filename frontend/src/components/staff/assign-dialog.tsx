'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { errorMessage } from '@/lib/form-errors';
import { ApiRequestError } from '@/lib/api/http';
import { cn } from '@/lib/utils';
import { createTeachingAssignment, listClasses, listSubjects } from '@/lib/api/school';

/**
 * Adds teaching assignments in the current session: pick sections and
 * subjects, and every new combination is assigned. These decide the exam
 * papers a teacher can enter marks for, and whose registers they can take.
 */
export function AssignDialog({
  open,
  onOpenChange,
  teacherId,
  profileSubjectIds,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacherId: string;
  profileSubjectIds: string[];
  /** "sectionId:subjectId" pairs they already hold — skipped. */
  existing: Set<string>;
}) {
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const classes = useQuery({ queryKey: ['classes', 'options'], queryFn: () => listClasses({ limit: 100 }), enabled: open });
  const subjectList = useQuery({ queryKey: ['subjects', 'options'], queryFn: () => listSubjects({ limit: 100 }), enabled: open });

  // The subjects on their teacher profile first — the usual picks.
  const orderedSubjects = useMemo(
    () =>
      [...(subjectList.data?.items ?? [])].sort(
        (a, b) => Number(profileSubjectIds.includes(b._id)) - Number(profileSubjectIds.includes(a._id)) || a.name.localeCompare(b.name),
      ),
    [subjectList.data, profileSubjectIds],
  );
  const pairs = sections.flatMap((sectionId) => subjects.map((subjectId) => ({ sectionId, subjectId }))).filter((p) => !existing.has(`${p.sectionId}:${p.subjectId}`));

  const close = (next: boolean) => {
    if (!next) {
      setSections([]);
      setSubjects([]);
    }
    onOpenChange(next);
  };

  const assign = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(pairs.map((p) => createTeachingAssignment({ teacherId, ...p })));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      // Someone else adding the same pair meanwhile isn't a failure.
      const real = failed.filter((r) => !(r.reason instanceof ApiRequestError && r.reason.status === 409));
      return { created: results.length - failed.length, errors: real.map((r) => errorMessage(r.reason, "Couldn't assign")) };
    },
    onSuccess: async ({ created, errors }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teaching-assignments'] }),
        queryClient.invalidateQueries({ queryKey: ['teacher-classes'] }),
      ]);
      if (errors.length) toast.error(errors[0]!, { description: created ? `${created} other assignment${created === 1 ? '' : 's'} saved.` : undefined });
      else {
        toast.success(`${created} assignment${created === 1 ? '' : 's'} added`);
        close(false);
      }
    },
  });

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign classes</DialogTitle>
          <DialogDescription>Pick the sections and the subjects they teach there. Every combination is added.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[0.8125rem] font-medium">Sections</legend>
            {classes.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (classes.data?.items ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">No classes in the current session yet.</p>
            ) : (
              <div className="space-y-3">
                {(classes.data?.items ?? []).map((cls) => (
                  <div key={cls._id}>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">{cls.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cls.sections.map((s) => (
                        <Chip key={s._id} on={sections.includes(s._id)} onClick={() => toggle(sections, setSections, s._id)}>
                          {s.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-[0.8125rem] font-medium">Subjects</legend>
            {subjectList.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {orderedSubjects.map((s) => (
                  <Chip key={s._id} on={subjects.includes(s._id)} onClick={() => toggle(subjects, setSubjects, s._id)}>
                    {s.name}
                    {profileSubjectIds.includes(s._id) && <span className="sr-only"> (on their profile)</span>}
                  </Chip>
                ))}
              </div>
            )}
          </fieldset>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {pairs.length ? `${pairs.length} new assignment${pairs.length === 1 ? '' : 's'}` : 'Pick at least one section and one subject'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={assign.isPending}>
              Cancel
            </Button>
            <Button onClick={() => assign.mutate()} disabled={pairs.length === 0 || assign.isPending}>
              {assign.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'focus-visible:ring-ring rounded-md border px-2.5 py-1 text-sm transition-colors outline-none focus-visible:ring-2',
        on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

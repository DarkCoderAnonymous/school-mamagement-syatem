'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleChip } from '@/components/form/toggle-chip';
import { useClassOptions, useSubjectOptions } from '@/hooks/use-school-options';
import { errorMessage } from '@/lib/form-errors';
import { addPapers } from '@/lib/api/exams';
import type { ExamDetail } from '@/lib/api/types';

interface SubjectRow {
  on: boolean;
  maxMarks: string;
  passMarks: string;
  date: string;
}

/**
 * Builds the date sheet in one go: pick classes, tick subjects with their
 * marking scheme and date. Every class gets every ticked subject; pairs
 * already on the sheet are skipped by the server, so re-running is safe.
 */
export function AddPapersDialog({ exam, open, onOpenChange }: { exam: ExamDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const classes = useClassOptions(open);
  const subjects = useSubjectOptions(open);
  const [classIds, setClassIds] = useState<string[] | null>(null);
  const [rows, setRows] = useState<Record<string, SubjectRow>>({});
  const [error, setError] = useState<string | null>(null);

  // Start fresh each time the dialog opens (adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClassIds(null);
      setRows({});
      setError(null);
    }
  }

  const chosenClasses = classIds ?? (classes.data ?? []).map((c) => c._id);
  const row = (id: string): SubjectRow => rows[id] ?? { on: false, maxMarks: '100', passMarks: '33', date: '' };
  const setRow = (id: string, patch: Partial<SubjectRow>) => setRows((r) => ({ ...r, [id]: { ...row(id), ...patch } }));
  const ticked = (subjects.data ?? []).filter((s) => row(s._id).on);
  const minDate = exam.startDate.slice(0, 10);
  const maxDate = exam.endDate.slice(0, 10);
  const invalid = ticked.some((s) => {
    const r = row(s._id);
    const max = Number(r.maxMarks);
    const pass = Number(r.passMarks);
    return !(max >= 1) || !(pass >= 0) || pass > max;
  });

  const mutation = useMutation({
    mutationFn: () =>
      addPapers(exam._id, {
        classIds: chosenClasses,
        subjects: ticked.map((s) => {
          const r = row(s._id);
          return { subjectId: s._id, maxMarks: Number(r.maxMarks), passMarks: Number(r.passMarks), date: r.date || null };
        }),
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast.success(`${res.created} paper${res.created === 1 ? '' : 's'} added`, {
        description: res.skipped ? `${res.skipped} were already on the date sheet.` : undefined,
      });
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e, "Couldn't add the papers")),
  });

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add papers</DialogTitle>
          <DialogDescription>
            Each chosen class sits each ticked subject. Dates must fall between the exam&apos;s dates.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="bg-destructive-soft text-destructive animate-shake flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="flex w-full items-center justify-between text-[0.8125rem] font-medium">
            Classes
            <button
              type="button"
              className="text-primary text-xs hover:underline"
              onClick={() => setClassIds(chosenClasses.length === (classes.data?.length ?? 0) ? [] : (classes.data ?? []).map((c) => c._id))}
            >
              {chosenClasses.length === (classes.data?.length ?? 0) ? 'Clear all' : 'Select all'}
            </button>
          </legend>
          <div className="flex flex-wrap gap-2">
            {classes.data?.map((c) => (
              <ToggleChip key={c._id} on={chosenClasses.includes(c._id)} onClick={() => setClassIds(toggle(chosenClasses, c._id))}>
                {c.name}
              </ToggleChip>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-[0.8125rem] font-medium">Subjects</legend>
          <div className="text-muted-foreground hidden grid-cols-[1fr_5.5rem_5.5rem_9.5rem] gap-2 px-1 text-xs font-medium sm:grid">
            <span />
            <span>Max marks</span>
            <span>Pass marks</span>
            <span>Date</span>
          </div>
          <ul className="divide-y rounded-lg border">
            {subjects.data?.map((s) => {
              const r = row(s._id);
              const bad = r.on && Number(r.passMarks) > Number(r.maxMarks);
              return (
                <li key={s._id} className="grid grid-cols-2 items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_5.5rem_5.5rem_9.5rem]">
                  <label className="col-span-2 flex items-center gap-2.5 text-sm sm:col-span-1">
                    <input type="checkbox" className="accent-primary size-4" checked={r.on} onChange={(e) => setRow(s._id, { on: e.target.checked })} />
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground font-mono text-xs">{s.code}</span>
                  </label>
                  <Input aria-label={`${s.name} max marks`} type="number" min={1} step="0.5" disabled={!r.on} value={r.maxMarks} onChange={(e) => setRow(s._id, { maxMarks: e.target.value })} />
                  <Input
                    aria-label={`${s.name} pass marks`}
                    type="number"
                    min={0}
                    step="0.5"
                    disabled={!r.on}
                    aria-invalid={bad}
                    value={r.passMarks}
                    onChange={(e) => setRow(s._id, { passMarks: e.target.value })}
                  />
                  <Input
                    aria-label={`${s.name} date`}
                    type="date"
                    className="col-span-2 sm:col-span-1"
                    min={minDate}
                    max={maxDate}
                    disabled={!r.on}
                    value={r.date}
                    onChange={(e) => setRow(s._id, { date: e.target.value })}
                  />
                </li>
              );
            })}
          </ul>
          {subjects.data?.length === 0 && <p className="text-muted-foreground text-xs">Add subjects first, on the Subjects page.</p>}
          {invalid && <p className="text-destructive text-xs">Check the marks: max must be at least 1 and pass marks can&apos;t exceed max.</p>}
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={chosenClasses.length === 0 || ticked.length === 0 || invalid || mutation.isPending}>
            {mutation.isPending ? 'Adding…' : `Add ${chosenClasses.length * ticked.length || ''} papers`.replace('  ', ' ')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

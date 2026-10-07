'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Link2, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { useClassOptions } from '@/hooks/use-school-options';
import { fullName, RELATION_LABEL } from '@/lib/labels';
import { listGuardians, type GuardianLinkInput, type StudentInput } from '@/lib/api/school';
import type { Guardian, GuardianRelation, Student } from '@/lib/api/types';

const guardianSchema = z
  .object({
    mode: z.enum(['new', 'existing']),
    guardianId: z.string(),
    display: z.string(),
    firstName: z.string().trim().max(60),
    lastName: z.string().trim().max(60),
    phone: z.string().trim().max(30),
    email: z.string().trim().max(254),
    occupation: z.string().trim().max(80),
    relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']),
    createLogin: z.boolean(),
  })
  .superRefine((g, ctx) => {
    if (g.mode === 'existing') return;
    if (!g.firstName) ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'First name is required' });
    if (!g.lastName) ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'Last name is required' });
    if (g.phone.length < 5) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Phone number is required' });
    if (g.email && !z.string().email().safeParse(g.email).success) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address' });
    }
    if (g.createLogin && !g.email) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'An email is needed for a parent sign-in' });
    }
  });

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  dateOfBirth: z
    .string()
    .min(1, 'Date of birth is required')
    .refine((d) => new Date(d) < new Date(), 'Date of birth must be in the past'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { errorMap: () => ({ message: 'Select a gender' }) }),
  classId: z.string().min(1, 'Select a class'),
  sectionId: z.string().min(1, 'Select a section'),
  rollNumber: z.string().trim().max(20),
  admissionDate: z.string(),
  address: z.string().trim().max(300),
  bloodGroup: z.string().trim().max(5),
  previousSchool: z.string().trim().max(120),
  status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED']),
  guardians: z.array(guardianSchema).min(1, 'Add at least one parent or guardian').max(4),
  primaryIndex: z.coerce.number().int().min(0),
});

export type StudentFormValues = z.infer<typeof schema>;

const BLANK_GUARDIAN: StudentFormValues['guardians'][number] = {
  mode: 'new',
  guardianId: '',
  display: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  occupation: '',
  relation: 'FATHER',
  createLogin: false,
};

const iso = (date: string) => (date ? new Date(`${date}T00:00:00.000Z`).toISOString() : undefined);

/** Form values → API payload. Guardians are sent only when asked, so an edit that didn't touch them leaves the links alone. */
export function toStudentInput(v: StudentFormValues, includeGuardians = true): Partial<StudentInput> {
  const guardians: GuardianLinkInput[] = v.guardians.map((g, i) =>
    g.mode === 'existing'
      ? { guardianId: g.guardianId, relation: g.relation, isPrimary: i === v.primaryIndex }
      : {
          firstName: g.firstName,
          lastName: g.lastName,
          phone: g.phone,
          email: g.email || undefined,
          occupation: g.occupation || undefined,
          relation: g.relation,
          isPrimary: i === v.primaryIndex,
          createLogin: g.createLogin,
        },
  );
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    dateOfBirth: iso(v.dateOfBirth)!,
    gender: v.gender,
    classId: v.classId,
    sectionId: v.sectionId,
    rollNumber: v.rollNumber || undefined,
    admissionDate: iso(v.admissionDate),
    address: v.address || undefined,
    bloodGroup: v.bloodGroup || undefined,
    previousSchool: v.previousSchool || undefined,
    ...(includeGuardians ? { guardians } : {}),
  };
}

export function defaultsFromStudent(s?: Student, preset?: { classId?: string; sectionId?: string }): StudentFormValues {
  const primary = s?.guardians.findIndex((g) => g.isPrimary) ?? 0;
  return {
    firstName: s?.firstName ?? '',
    lastName: s?.lastName ?? '',
    dateOfBirth: s?.dateOfBirth?.slice(0, 10) ?? '',
    gender: (s?.gender ?? '') as StudentFormValues['gender'],
    classId: s?.classId?._id ?? preset?.classId ?? '',
    sectionId: s?.sectionId?._id ?? preset?.sectionId ?? '',
    rollNumber: s?.rollNumber ?? '',
    admissionDate: s?.admissionDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    address: s?.address ?? '',
    bloodGroup: s?.bloodGroup ?? '',
    previousSchool: s?.previousSchool ?? '',
    status: s?.status ?? 'ACTIVE',
    guardians: s?.guardians.length
      ? s.guardians.map((g) => ({
          ...BLANK_GUARDIAN,
          mode: 'existing' as const,
          guardianId: g.guardianId?._id ?? '',
          display: g.guardianId ? `${fullName(g.guardianId)} · ${g.guardianId.phone}` : 'Guardian',
          relation: g.relation,
        }))
      : [{ ...BLANK_GUARDIAN }],
    primaryIndex: Math.max(0, primary),
  };
}

export function useStudentForm(initial: StudentFormValues) {
  return useForm<StudentFormValues>({ resolver: zodResolver(schema), defaultValues: initial, mode: 'onTouched' });
}

/** Server fields → form paths, for applyServerError. */
export const STUDENT_SERVER_FIELDS = ['classId', 'sectionId', 'firstName', 'lastName', 'dateOfBirth'] as const;

export function StudentFormFields({ form, isEdit }: { form: UseFormReturn<StudentFormValues>; isEdit: boolean }) {
  const { register, formState, watch, setValue } = form;
  const { errors } = formState;
  const classes = useClassOptions();
  const classId = watch('classId');
  const sections = useMemo(
    () => classes.data?.find((c) => c._id === classId)?.sections ?? [],
    [classes.data, classId],
  );

  // A section from a different class can't stay selected once the class changes.
  useEffect(() => {
    const current = form.getValues('sectionId');
    if (classes.data && current && !sections.some((s) => s._id === current)) {
      setValue('sectionId', sections.length === 1 ? sections[0]!._id : '');
    } else if (classes.data && !current && sections.length === 1) {
      setValue('sectionId', sections[0]!._id);
    }
  }, [sections, classes.data, form, setValue]);

  return (
    <div className="space-y-6">
      <FormPanel title="Student" description="As it should appear on report cards and certificates.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName?.message} required>
            {({ id, describedBy }) => (
              <Input id={id} autoComplete="off" aria-describedby={describedBy} aria-invalid={!!errors.firstName} {...register('firstName')} />
            )}
          </Field>
          <Field label="Last name" error={errors.lastName?.message} required>
            {({ id, describedBy }) => (
              <Input id={id} autoComplete="off" aria-describedby={describedBy} aria-invalid={!!errors.lastName} {...register('lastName')} />
            )}
          </Field>
          <Field label="Date of birth" error={errors.dateOfBirth?.message} required>
            {({ id, describedBy }) => (
              <Input id={id} type="date" aria-describedby={describedBy} aria-invalid={!!errors.dateOfBirth} {...register('dateOfBirth')} />
            )}
          </Field>
          <Field label="Gender" error={errors.gender?.message} required>
            {({ id, describedBy }) => (
              <NativeSelect id={id} aria-describedby={describedBy} aria-invalid={!!errors.gender} {...register('gender')}>
                <option value="">Select…</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </NativeSelect>
            )}
          </Field>
        </div>
      </FormPanel>

      <FormPanel title="Class placement" description="Only classes in the current session are listed.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Class"
            error={errors.classId?.message}
            required
            help={classes.data?.length === 0 ? 'No classes yet — create them under Classes & sections.' : undefined}
          >
            {({ id, describedBy }) => (
              <NativeSelect id={id} aria-describedby={describedBy} aria-invalid={!!errors.classId} disabled={classes.isLoading} {...register('classId')}>
                <option value="">{classes.isLoading ? 'Loading…' : 'Select a class'}</option>
                {classes.data?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field
            label="Section"
            error={errors.sectionId?.message}
            required
            help={classId && sections.length === 0 ? 'This class has no sections yet.' : undefined}
          >
            {({ id, describedBy }) => (
              <NativeSelect id={id} aria-describedby={describedBy} aria-invalid={!!errors.sectionId} disabled={!classId} {...register('sectionId')}>
                <option value="">{classId ? 'Select a section' : 'Pick a class first'}</option>
                {sections.map((s) => (
                  <option key={s._id} value={s._id}>
                    Section {s.name} ({s.studentCount}/{s.capacity})
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Roll number" error={errors.rollNumber?.message}>
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...register('rollNumber')} />}
          </Field>
          <Field label="Admission date" error={errors.admissionDate?.message}>
            {({ id, describedBy }) => <Input id={id} type="date" aria-describedby={describedBy} {...register('admissionDate')} />}
          </Field>
          {isEdit && (
            <Field label="Status" help="Graduated and transferred students leave class rosters but keep their records.">
              {({ id, describedBy }) => (
                <NativeSelect id={id} aria-describedby={describedBy} {...register('status')}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="GRADUATED">Graduated</option>
                  <option value="TRANSFERRED">Transferred</option>
                </NativeSelect>
              )}
            </Field>
          )}
        </div>
      </FormPanel>

      <GuardiansPanel form={form} />

      <FormPanel title="Additional details">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Previous school" error={errors.previousSchool?.message}>
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...register('previousSchool')} />}
          </Field>
          <Field label="Blood group" error={errors.bloodGroup?.message}>
            {({ id, describedBy }) => (
              <NativeSelect id={id} aria-describedby={describedBy} {...register('bloodGroup')}>
                <option value="">—</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <Field label="Home address" error={errors.address?.message}>
          {({ id, describedBy }) => <Textarea id={id} rows={2} aria-describedby={describedBy} {...register('address')} />}
        </Field>
      </FormPanel>
    </div>
  );
}

function FormPanel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card space-y-4 rounded-xl border p-5 sm:p-6">
      <div className="space-y-0.5">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function GuardiansPanel({ form }: { form: UseFormReturn<StudentFormValues> }) {
  const { control, register, formState, watch, setValue } = form;
  const { fields, append, remove, update } = useFieldArray({ control, name: 'guardians' });
  const primaryIndex = Number(watch('primaryIndex'));
  const errors = formState.errors.guardians;

  const removeAt = (index: number) => {
    remove(index);
    if (primaryIndex === index) setValue('primaryIndex', 0);
    else if (primaryIndex > index) setValue('primaryIndex', primaryIndex - 1);
  };

  return (
    <FormPanel
      title="Parents & guardians"
      description="The primary contact is who the school calls first and who sees fees and results."
    >
      <ul className="space-y-4">
        {fields.map((field, index) => {
          const g = watch(`guardians.${index}`);
          const e = errors?.[index];
          return (
            <li key={field.id} className="relative rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    className="accent-primary size-4"
                    value={index}
                    checked={primaryIndex === index}
                    onChange={() => setValue('primaryIndex', index, { shouldDirty: true })}
                  />
                  Primary contact
                </label>
                <div className="w-36">
                  <NativeSelect aria-label="Relationship" className="h-8" {...register(`guardians.${index}.relation`)}>
                    {(Object.keys(RELATION_LABEL) as GuardianRelation[]).map((r) => (
                      <option key={r} value={r}>
                        {RELATION_LABEL[r]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  {g.mode === 'new' && (
                    <LinkExistingGuardian
                      onPick={(picked) =>
                        update(index, {
                          ...g,
                          mode: 'existing',
                          guardianId: picked._id,
                          display: `${fullName(picked)} · ${picked.phone}`,
                        })
                      }
                    />
                  )}
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeAt(index)} aria-label="Remove guardian">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              {g.mode === 'existing' ? (
                <div className="bg-muted/50 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm">
                  <UserRound className="text-muted-foreground size-4" aria-hidden="true" />
                  <span className="flex-1 truncate">{g.display}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => update(index, { ...BLANK_GUARDIAN, relation: g.relation })}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First name" error={e?.firstName?.message} required>
                    {({ id, describedBy }) => (
                      <Input id={id} autoComplete="off" aria-describedby={describedBy} aria-invalid={!!e?.firstName} {...register(`guardians.${index}.firstName`)} />
                    )}
                  </Field>
                  <Field label="Last name" error={e?.lastName?.message} required>
                    {({ id, describedBy }) => (
                      <Input id={id} autoComplete="off" aria-describedby={describedBy} aria-invalid={!!e?.lastName} {...register(`guardians.${index}.lastName`)} />
                    )}
                  </Field>
                  <Field label="Phone" error={e?.phone?.message} required>
                    {({ id, describedBy }) => (
                      <Input id={id} type="tel" aria-describedby={describedBy} aria-invalid={!!e?.phone} {...register(`guardians.${index}.phone`)} />
                    )}
                  </Field>
                  <Field label="Email" error={e?.email?.message}>
                    {({ id, describedBy }) => (
                      <Input id={id} type="email" aria-describedby={describedBy} aria-invalid={!!e?.email} {...register(`guardians.${index}.email`)} />
                    )}
                  </Field>
                  <Field label="Occupation" error={e?.occupation?.message}>
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...register(`guardians.${index}.occupation`)} />}
                  </Field>
                  <label className="flex cursor-pointer items-start gap-2.5 self-end pb-1 text-sm">
                    <input type="checkbox" className="accent-primary mt-0.5 size-4" {...register(`guardians.${index}.createLogin`)} />
                    <span>
                      <span className="font-medium">Give them a parent sign-in</span>
                      <span className="text-muted-foreground block text-xs">For the mobile app. Needs an email.</span>
                    </span>
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {typeof errors?.message === 'string' && <p className="text-destructive text-xs">{errors.message}</p>}
      {fields.length < 4 && (
        <Button type="button" variant="outline" size="sm" onClick={() => append({ ...BLANK_GUARDIAN, relation: 'MOTHER' })}>
          <Plus className="size-3.5" />
          Add another guardian
        </Button>
      )}
    </FormPanel>
  );
}

/**
 * Siblings share parents: rather than re-typing a family already on file,
 * find them by name or phone and link the existing record.
 */
function LinkExistingGuardian({ onPick }: { onPick: (g: Guardian) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const results = useQuery({
    queryKey: ['guardians', { search: debounced, limit: 6 }],
    queryFn: () => listGuardians({ search: debounced, limit: 6 }),
    enabled: open && debounced.length >= 2,
  });

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Link2 className="size-3.5" />
        Existing family
      </Button>
    );
  }

  return (
    <div className="bg-popover absolute right-4 left-4 z-20 mt-2 space-y-2 rounded-lg border p-3 shadow-lg sm:left-auto sm:w-96">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden="true" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Search a parent by name or phone…"
          aria-label="Search existing guardians"
          className="pl-8"
        />
      </div>
      <div className="max-h-60 overflow-y-auto" aria-live="polite">
        {debounced.length < 2 && <p className="text-muted-foreground px-1 py-2 text-xs">Type at least 2 characters.</p>}
        {results.isFetching && <p className="text-muted-foreground px-1 py-2 text-xs">Searching…</p>}
        {results.data?.items.length === 0 && <p className="text-muted-foreground px-1 py-2 text-xs">No matching guardians.</p>}
        <ul>
          {results.data?.items.map((g) => (
            <li key={g._id}>
              <button
                type="button"
                onClick={() => {
                  onPick(g);
                  setOpen(false);
                }}
                className="hover:bg-muted focus-visible:bg-muted w-full rounded-md px-2 py-2 text-left outline-none"
              >
                <p className="text-sm font-medium">
                  {fullName(g)} <span className="text-muted-foreground font-normal">· {g.phone}</span>
                </p>
                {g.children?.length ? (
                  <p className="text-muted-foreground text-xs">Parent of {g.children.map((c) => c.firstName).join(', ')}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}


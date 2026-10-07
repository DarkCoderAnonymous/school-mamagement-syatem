import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from 'expo-router';
import { Alert, FlatList, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { TextField } from '@/components/ui/text-field';
import { ChoiceChips, SearchField } from '@/components/ui/list';
import { DateField, FormSection, OptionPicker, useDebounced } from '@/components/ui/form';
import { Banner } from '@/components/ui/primitives';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import { useTheme } from '@/lib/theme';
import { ApiRequestError } from '@/lib/api/http';
import {
  listClassOptions,
  searchGuardians,
  serverFieldErrors,
  type Gender,
  type Guardian,
  type GuardianLinkInput,
  type GuardianRelation,
  type Student,
  type StudentInput,
  type StudentStatus,
} from '@/lib/api/front-office';
import { fullName, GENDER_LABEL, RELATION_LABEL, STUDENT_STATUS } from './people';

/**
 * The admit / edit student form — the web's student-form.tsx on a phone:
 * same required fields, same client rules, and server rejections land on the
 * field they name (`error.details.field`) or in a banner above the save bar.
 */

export interface GuardianDraft {
  key: string;
  mode: 'new' | 'existing';
  guardianId: string;
  display: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  occupation: string;
  relation: GuardianRelation;
  createLogin: boolean;
}

export interface StudentDraft {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | undefined;
  classId: string;
  sectionId: string;
  rollNumber: string;
  admissionDate: string;
  address: string;
  bloodGroup: string;
  previousSchool: string;
  status: StudentStatus;
  guardians: GuardianDraft[];
  primaryIndex: number;
}

type Errors = Record<string, string>;

let seq = 0;
const newKey = () => `g${Date.now().toString(36)}${(seq++).toString(36)}`;

const blankGuardian = (relation: GuardianRelation = 'FATHER'): GuardianDraft => ({
  key: newKey(),
  mode: 'new',
  guardianId: '',
  display: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  occupation: '',
  relation,
  createLogin: false,
});

const today = () => new Date().toISOString().slice(0, 10);
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const iso = (day: string) => `${day}T00:00:00.000Z`;

export function draftFromStudent(s?: Student, preset?: { classId?: string; sectionId?: string }): StudentDraft {
  const primary = s?.guardians.findIndex((g) => g.isPrimary) ?? 0;
  return {
    firstName: s?.firstName ?? '',
    lastName: s?.lastName ?? '',
    dateOfBirth: s?.dateOfBirth?.slice(0, 10) ?? '',
    gender: s?.gender,
    classId: s?.classId?._id ?? preset?.classId ?? '',
    sectionId: s?.sectionId?._id ?? preset?.sectionId ?? '',
    rollNumber: s?.rollNumber ?? '',
    admissionDate: s?.admissionDate?.slice(0, 10) ?? today(),
    address: s?.address ?? '',
    bloodGroup: s?.bloodGroup ?? '',
    previousSchool: s?.previousSchool ?? '',
    status: s?.status ?? 'ACTIVE',
    guardians: s?.guardians.length
      ? s.guardians.map((g) => ({
          ...blankGuardian(g.relation),
          mode: 'existing' as const,
          guardianId: g.guardianId?._id ?? '',
          display: g.guardianId ? `${fullName(g.guardianId)} · ${g.guardianId.phone}` : 'Guardian',
        }))
      : [blankGuardian()],
    primaryIndex: Math.max(0, primary),
  };
}

/** The web form's zod rules, as plain checks. Keys are field paths ("guardians.1.phone"). */
function validate(d: StudentDraft): Errors {
  const e: Errors = {};
  if (!d.firstName.trim()) e.firstName = 'First name is required';
  if (!d.lastName.trim()) e.lastName = 'Last name is required';
  if (!d.dateOfBirth) e.dateOfBirth = 'Date of birth is required';
  else if (!isDay(d.dateOfBirth)) e.dateOfBirth = 'Use the format YYYY-MM-DD';
  else if (d.dateOfBirth >= today()) e.dateOfBirth = 'Date of birth must be in the past';
  if (!d.gender) e.gender = 'Select a gender';
  if (!d.classId) e.classId = 'Select a class';
  if (!d.sectionId) e.sectionId = 'Select a section';
  if (d.rollNumber.trim().length > 20) e.rollNumber = 'At most 20 characters';
  if (d.admissionDate && !isDay(d.admissionDate)) e.admissionDate = 'Use the format YYYY-MM-DD';
  if (d.guardians.length === 0) e.guardians = 'Add at least one parent or guardian';
  d.guardians.forEach((g, i) => {
    if (g.mode === 'existing') return;
    const p = `guardians.${i}`;
    if (!g.firstName.trim()) e[`${p}.firstName`] = 'First name is required';
    if (!g.lastName.trim()) e[`${p}.lastName`] = 'Last name is required';
    if (g.phone.trim().length < 5) e[`${p}.phone`] = 'Phone number is required';
    if (g.email.trim() && !isEmail(g.email.trim())) e[`${p}.email`] = 'Enter a valid email address';
    else if (g.createLogin && !g.email.trim()) e[`${p}.email`] = 'An email is needed for a parent sign-in';
  });
  return e;
}

/** Draft → API payload. On an edit, guardians are sent only when they changed, so untouched links are left alone. */
export function toStudentInput(d: StudentDraft, opts: { isEdit: boolean; includeGuardians: boolean }): Partial<StudentInput> {
  // An edit sends cleared text as '' so it clears on the server; an admission just omits it.
  const text = (v: string) => (opts.isEdit ? v.trim() : v.trim() || undefined);
  const guardians: GuardianLinkInput[] = d.guardians.map((g, i) =>
    g.mode === 'existing'
      ? { guardianId: g.guardianId, relation: g.relation, isPrimary: i === d.primaryIndex }
      : {
          firstName: g.firstName.trim(),
          lastName: g.lastName.trim(),
          phone: g.phone.trim(),
          email: g.email.trim() || undefined,
          occupation: g.occupation.trim() || undefined,
          relation: g.relation,
          isPrimary: i === d.primaryIndex,
          createLogin: g.createLogin,
        },
  );
  return {
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    dateOfBirth: iso(d.dateOfBirth),
    gender: d.gender,
    classId: d.classId,
    sectionId: d.sectionId,
    rollNumber: text(d.rollNumber),
    admissionDate: d.admissionDate ? iso(d.admissionDate) : undefined,
    address: text(d.address),
    bloodGroup: text(d.bloodGroup),
    previousSchool: text(d.previousSchool),
    ...(opts.isEdit ? { status: d.status } : {}),
    ...(opts.includeGuardians ? { guardians } : {}),
  };
}

const TOP_FIELDS = new Set(['firstName', 'lastName', 'dateOfBirth', 'gender', 'classId', 'sectionId', 'rollNumber', 'admissionDate', 'address', 'bloodGroup', 'previousSchool', 'status', 'guardians']);
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDER_OPTIONS = (['FEMALE', 'MALE', 'OTHER'] as Gender[]).map((g) => ({ value: g, label: GENDER_LABEL[g] }));
const RELATION_OPTIONS = (Object.keys(RELATION_LABEL) as GuardianRelation[]).map((r) => ({ value: r, label: RELATION_LABEL[r] }));
const STATUS_OPTIONS = (Object.keys(STUDENT_STATUS) as StudentStatus[]).map((s) => ({ value: s, label: STUDENT_STATUS[s].label }));

export function StudentForm({
  initial,
  isEdit,
  submitLabel,
  placementFallback,
  submit,
  onSaved,
}: {
  initial: StudentDraft;
  isEdit: boolean;
  submitLabel: string;
  /** The saved class/section's names, for a placement outside the current session's class list. */
  placementFallback?: { className?: string; sectionName?: string };
  submit: (draft: StudentDraft, guardiansChanged: boolean) => Promise<Student>;
  onSaved: (student: Student) => void;
}) {
  const navigation = useNavigation();
  const { user } = useSession();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const leaving = useRef(false);

  const initialJson = useMemo(() => JSON.stringify(initial), [initial]);
  const dirty = JSON.stringify(draft) !== initialJson;
  const guardiansChanged = JSON.stringify([draft.guardians, draft.primaryIndex]) !== JSON.stringify([initial.guardians, initial.primaryIndex]);

  const classes = useQuery({ queryKey: ['front-office', 'class-options'], queryFn: listClassOptions, staleTime: 5 * 60_000, enabled: can(user?.permissions, Permission.CLASS_READ) });
  const fallbackClassName = placementFallback?.className;
  const fallbackSectionName = placementFallback?.sectionName;
  const classOptions = useMemo(() => {
    const opts = (classes.data ?? []).map((c) => ({ value: c._id, label: c.name }));
    if (initial.classId && !opts.some((o) => o.value === initial.classId) && fallbackClassName) {
      opts.unshift({ value: initial.classId, label: fallbackClassName });
    }
    return opts;
  }, [classes.data, initial.classId, fallbackClassName]);
  const sections = useMemo(() => classes.data?.find((c) => c._id === draft.classId)?.sections ?? [], [classes.data, draft.classId]);
  const sectionOptions = useMemo(() => {
    const opts = sections.map((s) => ({ value: s._id, label: `Section ${s.name}`, description: `${s.studentCount}/${s.capacity} students` }));
    if (draft.classId === initial.classId && initial.sectionId && !opts.some((o) => o.value === initial.sectionId) && fallbackSectionName) {
      opts.unshift({ value: initial.sectionId, label: `Section ${fallbackSectionName}`, description: 'Current placement' });
    }
    return opts;
  }, [sections, draft.classId, initial.classId, initial.sectionId, fallbackSectionName]);

  const set = (patch: Partial<StudentDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    const cleared = Object.keys(patch);
    if (cleared.some((k) => errors[k])) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !cleared.includes(k))));
  };
  const setGuardian = (index: number, patch: Partial<GuardianDraft>) => {
    setDraft((d) => ({ ...d, guardians: d.guardians.map((g, i) => (i === index ? { ...g, ...patch } : g)) }));
    const prefix = `guardians.${index}`;
    if (Object.keys(errors).some((k) => k.startsWith(prefix))) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith(prefix))));
  };
  const removeGuardian = (index: number) =>
    setDraft((d) => ({
      ...d,
      guardians: d.guardians.filter((_, i) => i !== index),
      primaryIndex: d.primaryIndex === index ? 0 : d.primaryIndex > index ? d.primaryIndex - 1 : d.primaryIndex,
    }));

  const pickClass = (classId: string) => {
    const own = classes.data?.find((c) => c._id === classId)?.sections ?? [];
    // A section from another class can't stay selected; a class with one section picks it.
    const keep = own.some((s) => s._id === draft.sectionId) || (classId === initial.classId && draft.sectionId === initial.sectionId);
    set({ classId, sectionId: keep ? draft.sectionId : own.length === 1 ? own[0]!._id : '' });
  };

  const mutation = useMutation({
    mutationFn: () => submit(draft, guardiansChanged),
    onSuccess: (student) => {
      leaving.current = true;
      onSaved(student);
    },
    onError: (err) => {
      const fields = serverFieldErrors(err);
      const mapped: Errors = {};
      for (const [key, message] of Object.entries(fields)) {
        const guardian = /^guardians\.(\d+)/.exec(key);
        if (guardian) mapped[`guardians.${guardian[1]}`] = message;
        else if (TOP_FIELDS.has(key)) mapped[key] = message;
      }
      setErrors(mapped);
      const message = err instanceof ApiRequestError ? err.message : 'Check your connection and try again.';
      setFormError(Object.keys(mapped).length ? 'Check the highlighted fields.' : message);
    },
  });

  const onSubmit = () => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError('Check the highlighted fields.');
      return;
    }
    setFormError(undefined);
    mutation.mutate();
  };

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty || mutation.isPending) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (leaving.current) return;
      e.preventDefault();
      Alert.alert('Discard changes?', "What you've entered hasn't been saved.", [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, dirty, mutation.isPending]);

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-6 px-4 pb-8 pt-3"
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        <FormSection title="Student">
          <TextField label="First name *" value={draft.firstName} onChangeText={(v) => set({ firstName: v })} error={errors.firstName} autoComplete="off" maxLength={60} />
          <TextField label="Last name *" value={draft.lastName} onChangeText={(v) => set({ lastName: v })} error={errors.lastName} autoComplete="off" maxLength={60} />
          <DateField label="Date of birth *" value={draft.dateOfBirth} onChange={(v) => set({ dateOfBirth: v })} error={errors.dateOfBirth} />
          <View className="gap-1.5">
            <Text className="text-sm font-medium text-foreground">Gender *</Text>
            <ChoiceChips label="Gender" options={GENDER_OPTIONS} value={draft.gender} onChange={(v) => v && set({ gender: v })} />
            {errors.gender ? <Text className="text-xs text-destructive">{errors.gender}</Text> : null}
          </View>
        </FormSection>

        <FormSection title="Class placement">
          <OptionPicker
            label="Class *"
            value={draft.classId || undefined}
            placeholder={classes.isLoading ? 'Loading…' : 'Select a class'}
            options={classOptions}
            onChange={pickClass}
            error={errors.classId ?? (classes.data?.length === 0 ? 'No classes this session — create them on the web first.' : undefined)}
          />
          <OptionPicker
            label="Section *"
            value={draft.sectionId || undefined}
            placeholder={draft.classId ? (sectionOptions.length ? 'Select a section' : 'This class has no sections') : 'Pick a class first'}
            options={sectionOptions}
            disabled={!draft.classId || sectionOptions.length === 0}
            onChange={(v) => set({ sectionId: v })}
            error={errors.sectionId}
          />
          <TextField label="Roll number" value={draft.rollNumber} onChangeText={(v) => set({ rollNumber: v })} error={errors.rollNumber} maxLength={20} autoCapitalize="characters" />
          <DateField label="Admission date" value={draft.admissionDate} onChange={(v) => set({ admissionDate: v })} error={errors.admissionDate} />
          {isEdit && (
            <OptionPicker
              label="Status"
              value={draft.status}
              options={STATUS_OPTIONS.map((o) => ({ ...o, description: o.value === 'GRADUATED' || o.value === 'TRANSFERRED' ? 'Leaves class rosters, keeps the record' : undefined }))}
              onChange={(v) => set({ status: v })}
              error={errors.status}
            />
          )}
        </FormSection>

        <FormSection title="Parents & guardians">
          <Text className="-mt-1 px-1 text-xs text-muted-foreground">The primary contact is who the school calls first and who sees fees and results.</Text>
          {draft.guardians.map((g, i) => (
            <GuardianCard
              key={g.key}
              index={i}
              guardian={g}
              primary={draft.primaryIndex === i}
              removable={draft.guardians.length > 1}
              errors={errors}
              onChange={(patch) => setGuardian(i, patch)}
              onPrimary={() => set({ primaryIndex: i })}
              onRemove={() => removeGuardian(i)}
            />
          ))}
          {errors.guardians ? <Text className="px-1 text-xs text-destructive">{errors.guardians}</Text> : null}
          {draft.guardians.length < 4 && (
            <Button label="Add another guardian" icon="plus" variant="outline" size="sm" onPress={() => set({ guardians: [...draft.guardians, blankGuardian('MOTHER')] })} />
          )}
        </FormSection>

        <FormSection title="Additional details">
          <TextField label="Previous school" value={draft.previousSchool} onChangeText={(v) => set({ previousSchool: v })} error={errors.previousSchool} maxLength={120} />
          <OptionPicker
            label="Blood group"
            value={draft.bloodGroup || 'none'}
            options={[{ value: 'none', label: 'Not recorded' }, ...BLOOD_GROUPS.map((b) => ({ value: b, label: b }))]}
            onChange={(v) => set({ bloodGroup: v === 'none' ? '' : v })}
            error={errors.bloodGroup}
          />
          <TextField
            label="Home address"
            value={draft.address}
            onChangeText={(v) => set({ address: v })}
            error={errors.address}
            maxLength={300}
            multiline
            className="h-20 py-3"
            textAlignVertical="top"
          />
        </FormSection>
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 pb-2 pt-3">
        {formError && (
          <Banner tone="danger" title={isEdit ? "Couldn't save the student" : "Couldn't admit the student"}>
            {formError}
          </Banner>
        )}
        <Button label={submitLabel} loading={mutation.isPending} disabled={isEdit && !dirty} onPress={onSubmit} />
      </View>
    </SafeAreaView>
  );
}

function GuardianCard({
  index,
  guardian: g,
  primary,
  removable,
  errors,
  onChange,
  onPrimary,
  onRemove,
}: {
  index: number;
  guardian: GuardianDraft;
  primary: boolean;
  removable: boolean;
  errors: Errors;
  onChange: (patch: Partial<GuardianDraft>) => void;
  onPrimary: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const [linking, setLinking] = useState(false);
  const p = `guardians.${index}`;
  const label = `Guardian ${index + 1}`;

  return (
    <Card className="gap-3.5 p-4">
      <View className="flex-row items-center justify-between gap-2">
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: primary }}
          accessibilityLabel={`${label} is the primary contact`}
          onPress={onPrimary}
          className="min-h-[44px] flex-row items-center gap-2"
        >
          <View className={`size-5 items-center justify-center rounded-full border-2 ${primary ? 'border-primary' : 'border-input'}`}>
            {primary && <View className="size-2.5 rounded-full bg-primary" />}
          </View>
          <Text className="text-sm font-medium text-foreground">Primary contact</Text>
        </Pressable>
        {removable && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()}`} onPress={onRemove} className="size-11 items-center justify-center rounded-full active:bg-muted">
            <Icon name="trash" size={18} />
          </Pressable>
        )}
      </View>

      <View className="gap-1.5">
        <Text className="text-sm font-medium text-foreground">Relationship</Text>
        <ChoiceChips label={`${label} relationship`} options={RELATION_OPTIONS} value={g.relation} onChange={(v) => v && onChange({ relation: v })} />
      </View>

      {errors[p] ? <Text className="text-xs text-destructive">{errors[p]}</Text> : null}

      {g.mode === 'existing' ? (
        <View className="flex-row items-center gap-3 rounded-xl bg-muted px-3.5 py-2.5">
          <Icon name="profile" size={18} />
          <Text className="flex-1 text-sm text-foreground" numberOfLines={2}>
            {g.display}
          </Text>
          <Button label="Change" size="sm" variant="ghost" onPress={() => onChange({ ...blankGuardian(g.relation), key: g.key })} />
        </View>
      ) : (
        <>
          <Button label="Link an existing family" icon="search" size="sm" variant="ghost" onPress={() => setLinking(true)} />
          <TextField label="First name *" value={g.firstName} onChangeText={(v) => onChange({ firstName: v })} error={errors[`${p}.firstName`]} autoComplete="off" maxLength={60} />
          <TextField label="Last name *" value={g.lastName} onChangeText={(v) => onChange({ lastName: v })} error={errors[`${p}.lastName`]} autoComplete="off" maxLength={60} />
          <TextField label="Phone *" value={g.phone} onChangeText={(v) => onChange({ phone: v })} error={errors[`${p}.phone`]} keyboardType="phone-pad" maxLength={30} />
          <TextField
            label="Email"
            value={g.email}
            onChangeText={(v) => onChange({ email: v })}
            error={errors[`${p}.email`]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
          />
          <TextField label="Occupation" value={g.occupation} onChangeText={(v) => onChange({ occupation: v })} maxLength={80} />
          <View className="min-h-[44px] flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">Give them a parent sign-in</Text>
              <Text className="text-xs text-muted-foreground">For the mobile app. Needs an email.</Text>
            </View>
            <Switch
              accessibilityLabel={`Give ${label.toLowerCase()} a parent sign-in`}
              value={g.createLogin}
              onValueChange={(v) => onChange({ createLogin: v })}
              trackColor={{ true: theme.primary, false: theme.input }}
            />
          </View>
        </>
      )}

      <LinkGuardianSheet
        open={linking}
        onClose={() => setLinking(false)}
        onPick={(picked) => {
          onChange({ mode: 'existing', guardianId: picked._id, display: `${fullName(picked)} · ${picked.phone}` });
          setLinking(false);
        }}
      />
    </Card>
  );
}

/** Siblings share parents: find the family already on file by name or phone instead of re-typing it. */
function LinkGuardianSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (g: Guardian) => void }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 300);
  const results = useQuery({
    queryKey: ['front-office', 'guardian-search', debounced],
    queryFn: () => searchGuardians(debounced),
    enabled: open && debounced.length >= 2,
  });

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background" style={{ backgroundColor: theme.background }}>
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Text className="text-lg font-semibold text-foreground">Existing family</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} className="size-9 items-center justify-center rounded-full bg-muted">
            <Icon name="close" size={16} color="foreground" />
          </Pressable>
        </View>
        <View className="px-4 pt-3">
          <SearchField value={search} onChangeText={setSearch} placeholder="Search a parent by name or phone" />
        </View>
        <FlatList
          data={debounced.length >= 2 ? (results.data?.items ?? []) : []}
          keyExtractor={(g) => g._id}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-1 px-4 py-3"
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Link ${fullName(item)}, ${item.phone}`}
              onPress={() => onPick(item)}
              className="min-h-[52px] justify-center rounded-xl px-3.5 py-2.5 active:bg-muted"
            >
              <Text className="text-base text-foreground">
                {fullName(item)} <Text className="text-sm text-muted-foreground">· {item.phone}</Text>
              </Text>
              {item.children?.length ? <Text className="text-xs text-muted-foreground">Parent of {item.children.map((c) => c.firstName).join(', ')}</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <Text className="py-8 text-center text-sm text-muted-foreground">
              {debounced.length < 2 ? 'Type at least 2 characters.' : results.isFetching ? 'Searching…' : results.isError ? "Couldn't search — try again." : 'No matching guardians.'}
            </Text>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost, apiPut } from './http';
import type {
  DashboardSummary,
  EmployeeStatus,
  Gender,
  Guardian,
  GuardianRelation,
  InventoryCategory,
  InventoryItem,
  InventoryMovement,
  InventorySummary,
  InventoryUnit,
  Member,
  MovementType,
  SchoolClass,
  PermissionModule,
  AttendanceBoard,
  AttendanceRegister,
  AttendanceStatus,
  AttendanceSettings,
  Holiday,
  StudentAttendance,
  EmployeeAttendance,
  StaffAttendanceStatus,
  StaffMonthSummary,
  StaffRegister,
  MonthlyRegister,
  MyClasses,
  TeachingAssignment,
  TeacherClasses,
  SchoolRole,
  Section,
  Student,
  StudentStatus,
  Subject,
  Teacher,
  TeacherDetail,
} from './types';

/**
 * API client for the school modules: academics, people, staff and inventory.
 * One function per endpoint, named for what the screen does with it.
 */

type Params = Record<string, unknown>;

// ─── School settings ─────────────────────────────────────────────────────────
export interface SchoolSettings {
  name: string;
  /** SCHOOL_THEMES key. */
  theme: string;
  /** Fixed at registration. */
  currency: string;
  primaryColor: string | null;
}
export const getSchoolSettings = () => apiGet<SchoolSettings>('/school-settings');
export const updateSchoolSettings = (input: { theme: string }) => apiPatch<SchoolSettings>('/school-settings', input);

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const getDashboardSummary = () => apiGet<DashboardSummary>('/dashboard/summary');

// ─── Classes & sections ──────────────────────────────────────────────────────
export interface ClassInput {
  name: string;
  order?: number;
  academicSessionId?: string;
}
export const listClasses = (params: Params = {}) =>
  apiGetPaginated<SchoolClass>('/classes', params);
export const getClass = (id: string) => apiGet<SchoolClass>(`/classes/${id}`);
export const createClass = (input: ClassInput) => apiPost<SchoolClass>('/classes', input);
export const updateClass = (id: string, input: Partial<ClassInput>) =>
  apiPatch<SchoolClass>(`/classes/${id}`, input);
export const archiveClass = (id: string) => apiDelete(`/classes/${id}`);

export interface SectionInput {
  classId: string;
  name: string;
  capacity?: number;
  room?: string;
  classTeacherId?: string | null;
}
export const listSections = (params: Params = {}) => apiGetPaginated<Section>('/sections', params);
export const createSection = (input: SectionInput) => apiPost<Section>('/sections', input);
export const updateSection = (id: string, input: Partial<Omit<SectionInput, 'classId'>>) =>
  apiPatch<Section>(`/sections/${id}`, input);
export const archiveSection = (id: string) => apiDelete(`/sections/${id}`);

// ─── Subjects ────────────────────────────────────────────────────────────────
export interface SubjectInput {
  name: string;
  code: string;
  isElective?: boolean;
  description?: string;
}
export const listSubjects = (params: Params = {}) => apiGetPaginated<Subject>('/subjects', params);
export const createSubject = (input: SubjectInput) => apiPost<Subject>('/subjects', input);
export const updateSubject = (id: string, input: Partial<SubjectInput>) =>
  apiPatch<Subject>(`/subjects/${id}`, input);
export const archiveSubject = (id: string) => apiDelete(`/subjects/${id}`);

// ─── Teachers ────────────────────────────────────────────────────────────────
export interface TeacherInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  designation?: string;
  department?: string;
  joiningDate?: string;
  qualification?: string;
  specialization?: string;
  experienceYears?: number;
  subjectIds?: string[];
}
export type TeacherUpdateInput = Partial<Omit<TeacherInput, 'email'>> & { status?: EmployeeStatus };
export const listTeachers = (params: Params = {}) => apiGetPaginated<Teacher>('/teachers', params);
export const getTeacher = (id: string) => apiGet<TeacherDetail>(`/teachers/${id}`);
export const createTeacher = (input: TeacherInput) => apiPost<TeacherDetail>('/teachers', input);
export const updateTeacher = (id: string, input: TeacherUpdateInput) =>
  apiPatch<TeacherDetail>(`/teachers/${id}`, input);
export const archiveTeacher = (id: string) => apiDelete(`/teachers/${id}`);

// ─── Students & guardians ────────────────────────────────────────────────────
export type GuardianLinkInput =
  | { guardianId: string; relation: GuardianRelation; isPrimary: boolean }
  | {
      firstName: string;
      lastName: string;
      phone: string;
      email?: string;
      occupation?: string;
      relation: GuardianRelation;
      isPrimary: boolean;
      createLogin?: boolean;
    };
export interface StudentInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  classId: string;
  sectionId: string;
  rollNumber?: string;
  admissionDate?: string;
  address?: string;
  bloodGroup?: string;
  previousSchool?: string;
  status?: StudentStatus;
  guardians: GuardianLinkInput[];
}
export const listStudents = (params: Params = {}) => apiGetPaginated<Student>('/students', params);
export const getStudent = (id: string) => apiGet<Student>(`/students/${id}`);
export const createStudent = (input: StudentInput) => apiPost<Student>('/students', input);
export const updateStudent = (id: string, input: Partial<StudentInput>) =>
  apiPatch<Student>(`/students/${id}`, input);
export const archiveStudent = (id: string) => apiDelete(`/students/${id}`);
export const listGuardians = (params: Params = {}) =>
  apiGetPaginated<Guardian>('/guardians', params);

// ─── Staff & roles ───────────────────────────────────────────────────────────
export interface InviteMemberInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roleIds: string[];
}
export interface RoleInput {
  name: string;
  description?: string;
  permissions: string[];
}
export const listRoles = () => apiGet<SchoolRole[]>('/roles');
export const listPermissionModules = () => apiGet<PermissionModule[]>('/roles/permissions');
export const createRole = (input: RoleInput) => apiPost<SchoolRole>('/roles', input);
export const updateRole = (id: string, input: Partial<RoleInput>) =>
  apiPatch<SchoolRole>(`/roles/${id}`, input);
export const deleteRole = (id: string) => apiDelete(`/roles/${id}`);
export const listMembers = (params: Params = {}) => apiGetPaginated<Member>('/members', params);
export const getMember = (id: string) => apiGet<Member>(`/members/${id}`);
export const inviteMember = (input: InviteMemberInput) => apiPost<Member>('/members', input);
export const updateMemberRoles = (id: string, roleIds: string[]) =>
  apiPatch<Member>(`/members/${id}/roles`, { roleIds });
export const updateMemberStatus = (id: string, status: 'ACTIVE' | 'DISABLED') =>
  apiPatch<Member>(`/members/${id}/status`, { status });

// ─── Inventory ───────────────────────────────────────────────────────────────
export interface CategoryInput {
  name: string;
  description?: string;
}
export interface ItemInput {
  name: string;
  categoryId: string;
  sku?: string;
  unit?: InventoryUnit;
  reorderLevel?: number;
  unitCostMinor?: number;
  location?: string;
  description?: string;
  openingQuantity?: number;
}
export interface MovementInput {
  type: MovementType;
  quantity: number;
  unitCostMinor?: number;
  party?: string;
  reference?: string;
  note?: string;
  occurredAt?: string;
}
export const getInventorySummary = () => apiGet<InventorySummary>('/inventory/summary');
export const listInventoryCategories = (params: Params = {}) =>
  apiGetPaginated<InventoryCategory>('/inventory/categories', params);
export const createInventoryCategory = (input: CategoryInput) =>
  apiPost<InventoryCategory>('/inventory/categories', input);
export const updateInventoryCategory = (id: string, input: Partial<CategoryInput>) =>
  apiPatch<InventoryCategory>(`/inventory/categories/${id}`, input);
export const archiveInventoryCategory = (id: string) => apiDelete(`/inventory/categories/${id}`);

export const listInventoryItems = (params: Params = {}) =>
  apiGetPaginated<InventoryItem>('/inventory/items', params);
export const getInventoryItem = (id: string) => apiGet<InventoryItem>(`/inventory/items/${id}`);
export const createInventoryItem = (input: ItemInput) =>
  apiPost<InventoryItem>('/inventory/items', input);
export const updateInventoryItem = (
  id: string,
  input: Partial<Omit<ItemInput, 'openingQuantity' | 'sku'>>,
) => apiPatch<InventoryItem>(`/inventory/items/${id}`, input);
export const archiveInventoryItem = (id: string) => apiDelete(`/inventory/items/${id}`);

export const recordInventoryMovement = (itemId: string, input: MovementInput) =>
  apiPost<{ movement: InventoryMovement; item: InventoryItem }>(
    `/inventory/items/${itemId}/movements`,
    input,
  );
export const listItemMovements = (itemId: string, params: Params = {}) =>
  apiGetPaginated<InventoryMovement>(`/inventory/items/${itemId}/movements`, params);
export const listInventoryMovements = (params: Params = {}) =>
  apiGetPaginated<InventoryMovement>('/inventory/movements', params);

// ─── Teaching assignments & attendance ───────────────────────────────────────
export interface AssignmentInput {
  teacherId: string;
  sectionId: string;
  subjectId: string;
}
export const listTeachingAssignments = (params: Params = {}) =>
  apiGetPaginated<TeachingAssignment>('/teaching-assignments', params);
export const getMyClasses = () => apiGet<MyClasses>('/teaching-assignments/mine');
export const createTeachingAssignment = (input: AssignmentInput) =>
  apiPost<TeachingAssignment>('/teaching-assignments', input);
export const deleteTeachingAssignment = (id: string) => apiDelete(`/teaching-assignments/${id}`);
/** A teacher's sections and subjects in a session — the current one when `academicSessionId` is omitted. */
export const getTeacherClasses = (teacherId: string, academicSessionId?: string) =>
  apiGet<TeacherClasses>(`/teaching-assignments/teachers/${teacherId}`, { academicSessionId });

export const getAttendanceBoard = (params: { date?: string; mine?: boolean } = {}) =>
  apiGet<AttendanceBoard>('/attendance/board', {
    date: params.date,
    mine: params.mine ? 'true' : undefined,
  });
export const getAttendanceRegister = (sectionId: string, date?: string) =>
  apiGet<AttendanceRegister>('/attendance/register', { sectionId, date });
export interface SaveRegisterInput {
  sectionId: string;
  date: string;
  entries: { studentId: string; status: AttendanceStatus; remark?: string }[];
}
export const saveAttendanceRegister = (input: SaveRegisterInput) =>
  apiPut<AttendanceRegister>('/attendance/register', input);

export const getAttendanceSettings = () => apiGet<AttendanceSettings>('/attendance/settings');
export const updateAttendanceSettings = (input: Partial<AttendanceSettings>) =>
  apiPatch<AttendanceSettings>('/attendance/settings', input);
export interface HolidayInput {
  name: string;
  startDate: string;
  endDate?: string;
}
export const listHolidays = (
  params: { from?: string; to?: string; page?: number; limit?: number } = {},
) => apiGetPaginated<Holiday>('/attendance/holidays', params);
export const createHoliday = (input: HolidayInput) =>
  apiPost<Holiday>('/attendance/holidays', input);
export const deleteHoliday = (id: string) => apiDelete(`/attendance/holidays/${id}`);

export const getStaffRegister = (date?: string) =>
  apiGet<StaffRegister>('/staff-attendance/register', { date });
export const saveStaffRegister = (input: {
  date: string;
  entries: { employeeId: string; status: StaffAttendanceStatus; remark?: string }[];
}) => apiPut<StaffRegister>('/staff-attendance/register', input);
export const getStaffMonthSummary = (month: string) =>
  apiGet<StaffMonthSummary>('/staff-attendance/summary', { month });
/** One employee's month; `month` is YYYY-MM, omitted means the school's current month. */
export const getEmployeeAttendance = (employeeId: string, month?: string) =>
  apiGet<EmployeeAttendance>(`/staff-attendance/employees/${employeeId}`, { month });

/** `month` is YYYY-MM; omitted means the school's current month. */
export const getStudentAttendance = (studentId: string, month?: string) =>
  apiGet<StudentAttendance>(`/attendance/students/${studentId}`, { month });
export const getMonthlyRegister = (sectionId: string, month: string) =>
  apiGet<MonthlyRegister>('/attendance/monthly', { sectionId, month });

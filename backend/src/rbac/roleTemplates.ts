import { Permission, Role } from '@sms/shared';

/**
 * Default permission set per role name. Used to seed the platform
 * SUPER_ADMIN system role on boot, and to seed a school's own copy of the
 * six school-level roles when a registration is approved (see
 * modules/admin/registrations/registrations.service.ts). A school is free
 * to edit its own roles afterwards — these are just sane starting points,
 * not something re-applied later.
 */
export const ROLE_TEMPLATES: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: Object.values(Permission),

  [Role.SCHOOL_ADMIN]: [
    Permission.SESSION_CREATE,
    Permission.SESSION_READ,
    Permission.SESSION_UPDATE,
    Permission.SESSION_DELETE,
    Permission.STUDENT_CREATE,
    Permission.STUDENT_READ,
    Permission.STUDENT_UPDATE,
    Permission.STUDENT_DELETE,
    Permission.TEACHER_CREATE,
    Permission.TEACHER_READ,
    Permission.TEACHER_UPDATE,
    Permission.TEACHER_DELETE,
    Permission.CLASS_CREATE,
    Permission.CLASS_READ,
    Permission.CLASS_UPDATE,
    Permission.CLASS_DELETE,
    // The admin holds every permission of every default staff role: role
    // assignment only grants permissions the assigner holds (members.service
    // assertAssignable), so without these an admin couldn't appoint a teacher
    // or exam controller from the staff screen.
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_MANAGE,
    Permission.STAFF_ATTENDANCE_READ,
    Permission.STAFF_ATTENDANCE_MARK,
    Permission.INVENTORY_READ,
    Permission.INVENTORY_MANAGE,
    Permission.INVENTORY_STOCK_RECORD,
    Permission.EXAM_CREATE,
    Permission.EXAM_READ,
    Permission.EXAM_MARKS_ENTER,
    Permission.EXAM_MARKS_PUBLISH,
    Permission.FEE_INVOICE_CREATE,
    Permission.FEE_INVOICE_READ,
    Permission.FEE_PAYMENT_RECORD,
    Permission.FEE_STRUCTURE_MANAGE,
    Permission.FEE_CONCESSION_MANAGE,
    Permission.FEE_INVOICE_ADJUST,
    Permission.FEE_PAYMENT_REFUND,
    Permission.FEE_REPORT_READ,
    Permission.PAYROLL_READ,
    Permission.PAYROLL_MANAGE,
    Permission.PAYROLL_RUN,
    Permission.PAYSLIP_SELF_READ,
    Permission.FINANCE_READ,
    Permission.FINANCE_RECORD,
    Permission.FINANCE_MANAGE,
    Permission.NOTICE_CREATE,
    Permission.NOTICE_READ,
    Permission.SCHOOL_READ,
    Permission.SCHOOL_UPDATE,
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.ROLE_ASSIGN,
    Permission.ROLE_MANAGE,
    Permission.AUDIT_LOG_READ,
  ],

  /**
   * The academic head. Everything about students, staff, classes and stores,
   * plus exam publishing — but not the school's account: no school settings
   * and no money movement (invoices and payments stay with the accountant/
   * admin). They can still read fees and staff accounts to answer questions.
   *
   * They may invite staff, define custom roles and assign roles, but only
   * within their own permissions (members.service assertAssignable,
   * roles.service assertWithinActor), so a principal can build a "Librarian"
   * or "Deputy Principal" role but never one with fee writes or settings.
   */
  [Role.PRINCIPAL]: [
    Permission.SESSION_CREATE,
    Permission.SESSION_READ,
    Permission.SESSION_UPDATE,
    Permission.STUDENT_CREATE,
    Permission.STUDENT_READ,
    Permission.STUDENT_UPDATE,
    Permission.STUDENT_DELETE,
    Permission.TEACHER_CREATE,
    Permission.TEACHER_READ,
    Permission.TEACHER_UPDATE,
    Permission.TEACHER_DELETE,
    Permission.CLASS_CREATE,
    Permission.CLASS_READ,
    Permission.CLASS_UPDATE,
    Permission.CLASS_DELETE,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_READ,
    Permission.ATTENDANCE_MANAGE,
    Permission.STAFF_ATTENDANCE_READ,
    Permission.STAFF_ATTENDANCE_MARK,
    Permission.INVENTORY_READ,
    Permission.INVENTORY_MANAGE,
    Permission.INVENTORY_STOCK_RECORD,
    Permission.EXAM_CREATE,
    Permission.EXAM_READ,
    Permission.EXAM_MARKS_PUBLISH,
    Permission.FEE_INVOICE_READ,
    Permission.FEE_REPORT_READ,
    Permission.PAYROLL_READ,
    Permission.PAYSLIP_SELF_READ,
    Permission.FINANCE_READ,
    Permission.NOTICE_CREATE,
    Permission.NOTICE_READ,
    Permission.SCHOOL_READ,
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.ROLE_ASSIGN,
    Permission.ROLE_MANAGE,
  ],

  [Role.ACCOUNTANT]: [
    Permission.SESSION_READ,
    Permission.STUDENT_READ,
    Permission.FEE_INVOICE_CREATE,
    Permission.FEE_INVOICE_READ,
    Permission.FEE_PAYMENT_RECORD,
    Permission.FEE_STRUCTURE_MANAGE,
    Permission.FEE_CONCESSION_MANAGE,
    Permission.FEE_INVOICE_ADJUST,
    Permission.FEE_PAYMENT_REFUND,
    Permission.FEE_REPORT_READ,
    Permission.PAYROLL_READ,
    Permission.PAYROLL_MANAGE,
    Permission.PAYROLL_RUN,
    Permission.PAYSLIP_SELF_READ,
    Permission.FINANCE_READ,
    Permission.FINANCE_RECORD,
    Permission.FINANCE_MANAGE,
    Permission.INVENTORY_READ,
    Permission.NOTICE_READ,
    // Unpaid days on payslips come from the staff register.
    Permission.STAFF_ATTENDANCE_READ,
  ],

  [Role.EXAM_CONTROLLER]: [
    Permission.SESSION_READ,
    Permission.STUDENT_READ,
    Permission.CLASS_READ,
    Permission.EXAM_CREATE,
    Permission.EXAM_READ,
    Permission.EXAM_MARKS_ENTER,
    Permission.EXAM_MARKS_PUBLISH,
    Permission.NOTICE_READ,
    Permission.PAYSLIP_SELF_READ,
  ],

  [Role.TEACHER]: [
    Permission.SESSION_READ,
    Permission.STUDENT_READ,
    Permission.CLASS_READ,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_READ,
    Permission.EXAM_READ,
    Permission.EXAM_MARKS_ENTER,
    Permission.NOTICE_CREATE,
    Permission.NOTICE_READ,
    Permission.PAYSLIP_SELF_READ,
  ],

  /**
   * Family roles hold NO school-wide read permission. `student.read`,
   * `fee.invoice.read` and `exam.read` guard endpoints that list every record
   * in the school (/students, /guardians, /fees/invoices), so a parent holding
   * them could read other families' children, phone numbers and fees. Family
   * access must come through endpoints scoped to the linked guardian/student
   * (the mobile phase), each with its own self-scoped permission.
   */
  [Role.PARENT]: [Permission.NOTICE_READ],

  [Role.STUDENT]: [Permission.NOTICE_READ],
};

/**
 * Permissions that must be REMOVED from existing schools' system roles —
 * the backfill script is otherwise additive only. Each entry is a security
 * correction, not a preference; see the comment on the family roles above.
 */
export const REVOKED_FROM_TEMPLATES: Partial<Record<Role, Permission[]>> = {
  [Role.PARENT]: [Permission.STUDENT_READ, Permission.FEE_INVOICE_READ, Permission.EXAM_READ],
  [Role.STUDENT]: [Permission.STUDENT_READ, Permission.EXAM_READ],
};

/** The roles provisioned into every newly approved school. */
export const SCHOOL_DEFAULT_ROLES: Role[] = [
  Role.SCHOOL_ADMIN,
  Role.PRINCIPAL,
  Role.ACCOUNTANT,
  Role.EXAM_CONTROLLER,
  Role.TEACHER,
  Role.PARENT,
  Role.STUDENT,
];

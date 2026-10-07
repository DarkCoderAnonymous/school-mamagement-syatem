/**
 * Roles available in the platform.
 *
 * Guards check *permissions*, not role names — this enum exists for seeding,
 * display, and default role→permission mapping, not for hard-coded checks.
 */
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
  /**
   * Academic and staff head of a school: sees and approves everything about
   * students, teachers, classes and inventory, but does not own the school's
   * account — no billing, no school settings, no role assignment.
   */
  PRINCIPAL = 'PRINCIPAL',
  ACCOUNTANT = 'ACCOUNTANT',
  EXAM_CONTROLLER = 'EXAM_CONTROLLER',
  TEACHER = 'TEACHER',
  PARENT = 'PARENT',
  STUDENT = 'STUDENT',
}

/**
 * Permissions are dotted strings persisted in the database (role_permissions
 * table) rather than hard-coded in guards, so custom roles/permissions can be
 * added later without a code change. This enum is a starter catalog used by
 * the seed script; it is not the source of truth at runtime.
 */
export enum Permission {
  // Student
  STUDENT_CREATE = 'student.create',
  STUDENT_READ = 'student.read',
  STUDENT_UPDATE = 'student.update',
  STUDENT_DELETE = 'student.delete',

  // Teacher
  TEACHER_CREATE = 'teacher.create',
  TEACHER_READ = 'teacher.read',
  TEACHER_UPDATE = 'teacher.update',
  TEACHER_DELETE = 'teacher.delete',

  // Academic session (school year)
  SESSION_CREATE = 'session.create',
  SESSION_READ = 'session.read',
  SESSION_UPDATE = 'session.update',
  SESSION_DELETE = 'session.delete',

  // Class / Subject
  CLASS_CREATE = 'class.create',
  CLASS_READ = 'class.read',
  CLASS_UPDATE = 'class.update',
  CLASS_DELETE = 'class.delete',

  // Inventory (school stores: furniture, lab equipment, stationery, sports kit)
  INVENTORY_READ = 'inventory.read',
  /** Create/edit/archive items and categories. */
  INVENTORY_MANAGE = 'inventory.manage',
  /** Record stock received, issued, returned, written off or counted. */
  INVENTORY_STOCK_RECORD = 'inventory.stock.record',

  // Attendance
  ATTENDANCE_MARK = 'attendance.mark',
  ATTENDANCE_READ = 'attendance.read',
  ATTENDANCE_MANAGE = 'attendance.manage',

  // Staff attendance (the office's daily staff register)
  STAFF_ATTENDANCE_READ = 'staff.attendance.read',
  STAFF_ATTENDANCE_MARK = 'staff.attendance.mark',

  // Exams / marks
  EXAM_CREATE = 'exam.create',
  EXAM_READ = 'exam.read',
  EXAM_MARKS_ENTER = 'exam.marks.enter',
  EXAM_MARKS_PUBLISH = 'exam.marks.publish',

  // Fees
  FEE_INVOICE_CREATE = 'fee.invoice.create',
  FEE_INVOICE_READ = 'fee.invoice.read',
  FEE_PAYMENT_RECORD = 'fee.payment.record',
  /** Fee heads, class fee structures and late-fine settings. */
  FEE_STRUCTURE_MANAGE = 'fee.structure.manage',
  /** Per-student discounts, scholarships and sibling concessions. */
  FEE_CONCESSION_MANAGE = 'fee.concession.manage',
  /** Ad-hoc discounts, late fines and cancelling an invoice. */
  FEE_INVOICE_ADJUST = 'fee.invoice.adjust',
  /** Refunds and payment reversals — money going back out. */
  FEE_PAYMENT_REFUND = 'fee.payment.refund',
  /** Defaulters, collection reports and payment reminders. */
  FEE_REPORT_READ = 'fee.report.read',

  // Payroll
  PAYROLL_READ = 'payroll.read',
  /** Salary components, salary structures, staff on payroll, advances. */
  PAYROLL_MANAGE = 'payroll.manage',
  /** Create, review, lock and publish a monthly payroll run. */
  PAYROLL_RUN = 'payroll.run',
  /** A staff member reading their OWN published payslips. */
  PAYSLIP_SELF_READ = 'payslip.self.read',

  // Finance ledger (expenses and non-fee income)
  FINANCE_READ = 'finance.read',
  FINANCE_RECORD = 'finance.record',
  /** Ledger categories and voiding entries. */
  FINANCE_MANAGE = 'finance.manage',

  // Notices
  NOTICE_CREATE = 'notice.create',
  NOTICE_READ = 'notice.read',

  // School / tenant administration
  SCHOOL_CREATE = 'school.create',
  SCHOOL_READ = 'school.read',
  SCHOOL_UPDATE = 'school.update',
  SCHOOL_STATUS_UPDATE = 'school.status.update',

  // School registration (onboarding) review, super-admin only
  REGISTRATION_READ = 'registration.read',
  REGISTRATION_REVIEW = 'registration.review',
  REGISTRATION_APPROVE = 'registration.approve',
  REGISTRATION_REJECT = 'registration.reject',

  // Plan catalogue, super-admin only
  PLAN_MANAGE = 'plan.manage',

  // Users & RBAC
  USER_CREATE = 'user.create',
  USER_READ = 'user.read',
  USER_UPDATE = 'user.update',
  ROLE_ASSIGN = 'role.assign',
  ROLE_MANAGE = 'role.manage',

  // Audit
  AUDIT_LOG_READ = 'audit.log.read',
}

/**
 * Roles available in the platform.
 *
 * Guards check *permissions*, not role names — this enum exists for seeding,
 * display, and default role→permission mapping, not for hard-coded checks.
 */
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
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

  // Attendance
  ATTENDANCE_MARK = 'attendance.mark',
  ATTENDANCE_READ = 'attendance.read',

  // Exams / marks
  EXAM_CREATE = 'exam.create',
  EXAM_READ = 'exam.read',
  EXAM_MARKS_ENTER = 'exam.marks.enter',
  EXAM_MARKS_PUBLISH = 'exam.marks.publish',

  // Fees
  FEE_INVOICE_CREATE = 'fee.invoice.create',
  FEE_INVOICE_READ = 'fee.invoice.read',
  FEE_PAYMENT_RECORD = 'fee.payment.record',

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

  // Audit
  AUDIT_LOG_READ = 'audit.log.read',
}

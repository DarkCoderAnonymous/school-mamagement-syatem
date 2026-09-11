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
    Permission.ATTENDANCE_READ,
    Permission.EXAM_CREATE,
    Permission.EXAM_READ,
    Permission.EXAM_MARKS_PUBLISH,
    Permission.FEE_INVOICE_CREATE,
    Permission.FEE_INVOICE_READ,
    Permission.FEE_PAYMENT_RECORD,
    Permission.NOTICE_CREATE,
    Permission.NOTICE_READ,
    Permission.SCHOOL_READ,
    Permission.SCHOOL_UPDATE,
    Permission.USER_CREATE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.ROLE_ASSIGN,
    Permission.AUDIT_LOG_READ,
  ],

  [Role.ACCOUNTANT]: [
    Permission.STUDENT_READ,
    Permission.FEE_INVOICE_CREATE,
    Permission.FEE_INVOICE_READ,
    Permission.FEE_PAYMENT_RECORD,
    Permission.NOTICE_READ,
  ],

  [Role.EXAM_CONTROLLER]: [
    Permission.STUDENT_READ,
    Permission.CLASS_READ,
    Permission.EXAM_CREATE,
    Permission.EXAM_READ,
    Permission.EXAM_MARKS_ENTER,
    Permission.EXAM_MARKS_PUBLISH,
    Permission.NOTICE_READ,
  ],

  [Role.TEACHER]: [
    Permission.STUDENT_READ,
    Permission.CLASS_READ,
    Permission.ATTENDANCE_MARK,
    Permission.ATTENDANCE_READ,
    Permission.EXAM_READ,
    Permission.EXAM_MARKS_ENTER,
    Permission.NOTICE_CREATE,
    Permission.NOTICE_READ,
  ],

  [Role.PARENT]: [Permission.STUDENT_READ, Permission.FEE_INVOICE_READ, Permission.EXAM_READ, Permission.NOTICE_READ],

  [Role.STUDENT]: [Permission.STUDENT_READ, Permission.EXAM_READ, Permission.NOTICE_READ],
};

/** The six roles provisioned into every newly approved school. */
export const SCHOOL_DEFAULT_ROLES: Role[] = [
  Role.SCHOOL_ADMIN,
  Role.ACCOUNTANT,
  Role.EXAM_CONTROLLER,
  Role.TEACHER,
  Role.PARENT,
  Role.STUDENT,
];

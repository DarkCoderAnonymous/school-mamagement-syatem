import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes';
import registrationsRoutes from '../modules/registrations/registrations.routes';
import plansRoutes from '../modules/plans/plans.routes';
import adminPlansRoutes from '../modules/plans/admin-plans.routes';
import authRoutes from '../modules/auth/auth.routes';
import academicSessionsRoutes from '../modules/academic-sessions/academic-sessions.routes';
import adminRegistrationsRoutes from '../modules/admin/registrations/admin-registrations.routes';
import adminSchoolsRoutes from '../modules/admin/schools/admin-schools.routes';
import schoolSettingsRoutes from '../modules/school-settings/school-settings.routes';
import { classesRouter, sectionsRouter } from '../modules/classes/classes.routes';
import subjectsRoutes from '../modules/subjects/subjects.routes';
import teachersRoutes from '../modules/teachers/teachers.routes';
import { guardiansRouter, studentsRouter } from '../modules/students/students.routes';
import { membersRouter } from '../modules/members/members.routes';
import { rolesRouter } from '../modules/roles/roles.routes';
import teachingAssignmentsRouter from '../modules/teaching-assignments/teaching-assignments.routes';
import attendanceRouter from '../modules/attendance/attendance.routes';
import staffAttendanceRouter from '../modules/staff-attendance/staff-attendance.routes';
import {
  categoriesRouter,
  inventoryRouter,
  itemsRouter,
  movementsRouter,
} from '../modules/inventory/inventory.routes';
import dashboardRoutes from '../modules/dashboard/dashboard.routes';
import {
  concessionsRouter,
  feeHeadsRouter,
  feeStructuresRouter,
  feesRouter,
  invoicesRouter,
  paymentsRouter,
} from '../modules/fees/fees.routes';
import {
  advancesRouter,
  componentsRouter,
  payrollRouter,
  runsRouter,
  structuresRouter,
} from '../modules/payroll/payroll.routes';
import { financeCategoriesRouter, financeRouter, ledgerRouter } from '../modules/finance/finance.routes';
import { examPapersRouter, examResultsRouter, examsRouter } from '../modules/exams/exams.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/registrations', registrationsRoutes);
router.use('/plans', plansRoutes);
router.use('/auth', authRoutes);
router.use('/academic-sessions', academicSessionsRoutes);
router.use('/classes', classesRouter);
router.use('/sections', sectionsRouter);
router.use('/subjects', subjectsRoutes);
router.use('/teachers', teachersRoutes);
router.use('/students', studentsRouter);
router.use('/guardians', guardiansRouter);
router.use('/members', membersRouter);
router.use('/roles', rolesRouter);
router.use('/teaching-assignments', teachingAssignmentsRouter);
router.use('/attendance', attendanceRouter);
router.use('/staff-attendance', staffAttendanceRouter);
// More specific inventory paths first, so /inventory/items isn't taken by the /inventory router.
router.use('/inventory/categories', categoriesRouter);
router.use('/inventory/items', itemsRouter);
router.use('/inventory/movements', movementsRouter);
router.use('/inventory', inventoryRouter);
router.use('/dashboard', dashboardRoutes);
router.use('/school-settings', schoolSettingsRoutes);
// Specific sub-paths before each module's catch-all router.
router.use('/fees/heads', feeHeadsRouter);
router.use('/fees/structures', feeStructuresRouter);
router.use('/fees/concessions', concessionsRouter);
router.use('/fees/invoices', invoicesRouter);
router.use('/fees/payments', paymentsRouter);
router.use('/fees', feesRouter);
router.use('/payroll/components', componentsRouter);
router.use('/payroll/structures', structuresRouter);
router.use('/payroll/advances', advancesRouter);
router.use('/payroll/runs', runsRouter);
router.use('/payroll', payrollRouter);
router.use('/finance/categories', financeCategoriesRouter);
router.use('/finance/entries', ledgerRouter);
router.use('/finance', financeRouter);
router.use('/exams/papers', examPapersRouter);
router.use('/exams/results', examResultsRouter);
router.use('/exams', examsRouter);
router.use('/admin/plans', adminPlansRoutes);
router.use('/admin/registrations', adminRegistrationsRoutes);
router.use('/admin/schools', adminSchoolsRoutes);

export default router;

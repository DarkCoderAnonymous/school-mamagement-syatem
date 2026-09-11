import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes';
import registrationsRoutes from '../modules/registrations/registrations.routes';
import plansRoutes from '../modules/plans/plans.routes';
import adminPlansRoutes from '../modules/plans/admin-plans.routes';
import authRoutes from '../modules/auth/auth.routes';
import adminRegistrationsRoutes from '../modules/admin/registrations/admin-registrations.routes';
import adminSchoolsRoutes from '../modules/admin/schools/admin-schools.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/registrations', registrationsRoutes);
router.use('/plans', plansRoutes);
router.use('/auth', authRoutes);
router.use('/admin/plans', adminPlansRoutes);
router.use('/admin/registrations', adminRegistrationsRoutes);
router.use('/admin/schools', adminSchoolsRoutes);

export default router;

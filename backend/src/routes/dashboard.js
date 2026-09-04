import { Router } from 'express';
import { tenantDashboard } from '../controllers/dashboardController.js';
import { authenticate, requireRoles, requireActiveTenant, blockSupportWrites } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveTenant, blockSupportWrites);
router.get('/', requireRoles('tenant_admin', 'super_admin'), tenantDashboard);

export default router;

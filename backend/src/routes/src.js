import { Router } from 'express';
import * as src from '../controllers/srcController.js';
import { authenticate, requireRoles, requireActiveTenant, blockSupportWrites } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveTenant, blockSupportWrites, requireRoles('tenant_admin'));
router.get('/halls', src.listSrcHalls);
router.get('/halls/:tenantId/dashboard', src.srcHallDashboard);
router.get('/halls/:tenantId/search', src.srcHallSearch);
router.get('/halls/:tenantId/exceptions', src.srcHallExceptions);
router.get('/halls/:tenantId/exceptions/:id/photo', src.srcHallExceptionPhoto);

export default router;

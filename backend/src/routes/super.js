import { Router } from 'express';
import * as superAdmin from '../controllers/superController.js';
import { authenticate, requireRoles } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireRoles('super_admin'));
router.get('/overview', superAdmin.overview);
router.get('/analysis', superAdmin.systemAnalysis);
router.get('/uploads', superAdmin.listUploads);
router.get('/uploads/:id/download', superAdmin.downloadUpload);
router.get('/distributions/:id/excel', superAdmin.downloadDistributionExcel);
router.get('/tenants/:tenantId', superAdmin.getTenant);
router.patch('/tenants/:tenantId/status', superAdmin.setTenantActive);

export default router;

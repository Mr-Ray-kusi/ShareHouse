import { Router } from 'express';
import * as fieldQr from '../controllers/fieldQrController.js';
import { authenticate, requireRoles, requireActiveTenant, blockSupportWrites } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveTenant, blockSupportWrites);
router.get('/', requireRoles('tenant_admin', 'super_admin'), fieldQr.listFieldQrs);
router.post('/', requireRoles('tenant_admin'), fieldQr.createFieldQrs);
router.post('/:id/delete', requireRoles('tenant_admin'), fieldQr.deleteFieldQr);

export default router;

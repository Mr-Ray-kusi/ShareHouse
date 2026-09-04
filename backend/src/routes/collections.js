import { Router } from 'express';
import * as collections from '../controllers/collectionController.js';
import { authenticate, requireRoles, requireActiveTenant, blockSupportWrites } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveTenant, blockSupportWrites);
router.get('/search', requireRoles('tenant_admin', 'assistant', 'super_admin'), collections.searchBeneficiaries);
router.get('/activity', requireRoles('tenant_admin', 'super_admin'), collections.activityFeed);
router.post('/mark', requireRoles('assistant', 'tenant_admin'), collections.markReceived);

export default router;

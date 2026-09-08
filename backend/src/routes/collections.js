import { Router } from 'express';
import * as collections from '../controllers/collectionController.js';
import { authenticate, requireRoles, requireActiveTenant, blockSupportWrites } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveTenant, blockSupportWrites);
router.get('/search', requireRoles('tenant_admin', 'assistant', 'super_admin'), collections.searchBeneficiaries);
router.get('/offline-pack', requireRoles('tenant_admin', 'assistant', 'super_admin'), collections.offlinePack);
router.get('/activity', requireRoles('tenant_admin', 'super_admin'), collections.activityFeed);
router.get('/voids', requireRoles('tenant_admin', 'super_admin'), collections.listVoids);
router.post('/mark', requireRoles('assistant', 'tenant_admin'), collections.markReceived);
router.post('/mark-batch', requireRoles('assistant', 'tenant_admin'), collections.markReceivedBatch);
router.post('/void', requireRoles('tenant_admin'), collections.voidReceived);

export default router;

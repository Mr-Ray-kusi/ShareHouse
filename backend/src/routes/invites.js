import { Router } from 'express';
import * as invites from '../controllers/inviteController.js';
import { authenticate, requireRoles, requireActiveTenant, blockSupportWrites } from '../middleware/auth.js';

const router = Router();
router.use(authenticate, requireActiveTenant, blockSupportWrites);
router.get('/', requireRoles('tenant_admin', 'super_admin'), invites.listInvites);
router.get('/:id/collections', requireRoles('tenant_admin', 'super_admin'), invites.listAssistantCollections);
router.post('/', requireRoles('tenant_admin'), invites.createInvite);
router.post('/:id/password', requireRoles('tenant_admin'), invites.setInvitePassword);
router.post('/:id/revoke', requireRoles('tenant_admin'), invites.revokeInvite);

export default router;

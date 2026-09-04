import { Router } from 'express';
import * as payments from '../controllers/paymentController.js';
import { authenticate, requireRoles } from '../middleware/auth.js';

const router = Router();

router.post('/webhook', payments.webhook);
router.get('/verify', payments.verify);
router.post('/verify', payments.verify);
router.get('/tenant/:tenantId', payments.publicTenantStatus);
router.post(
  '/initialize',
  authenticate,
  requireRoles('tenant_admin'),
  payments.startPayment
);

export default router;

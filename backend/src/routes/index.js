import { Router } from 'express';
import authRoutes from './auth.js';
import paymentRoutes from './payments.js';
import distributionRoutes from './distributions.js';
import inviteRoutes from './invites.js';
import collectionRoutes from './collections.js';
import dashboardRoutes from './dashboard.js';
import superRoutes from './super.js';
import telemetryRoutes from './telemetry.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sharehouse-api', time: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/payments', paymentRoutes);
router.use('/distributions', distributionRoutes);
router.use('/invites', inviteRoutes);
router.use('/collections', collectionRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/super', superRoutes);
router.use('/telemetry', telemetryRoutes);

export default router;

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as telemetry from '../controllers/telemetryController.js';

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();
router.post('/', limiter, telemetry.ingest);
export default router;

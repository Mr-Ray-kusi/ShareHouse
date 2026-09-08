import { Router } from 'express';
import multer from 'multer';
import * as exceptions from '../controllers/exceptionController.js';
import { authenticate, requireRoles, requireActiveTenant, blockSupportWrites } from '../middleware/auth.js';

const photo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//i.test(file.mimetype || '') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else {
      const err = new Error('Walk-in photo must be an image.');
      err.status = 400;
      cb(err);
    }
  },
});

const router = Router();
router.use(authenticate, requireActiveTenant, blockSupportWrites);
router.get('/', requireRoles('tenant_admin', 'assistant', 'super_admin'), exceptions.listExceptions);
router.post(
  '/',
  requireRoles('assistant', 'tenant_admin'),
  photo.single('photo'),
  exceptions.createException
);
router.get('/:id/photo', requireRoles('tenant_admin', 'assistant', 'super_admin'), exceptions.exceptionPhoto);
router.post('/:id/review', requireRoles('tenant_admin'), exceptions.reviewException);
router.post('/:id/cancel', requireRoles('assistant', 'tenant_admin'), exceptions.cancelException);

export default router;

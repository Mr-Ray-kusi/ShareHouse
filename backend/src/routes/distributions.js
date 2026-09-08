import { Router } from 'express';
import multer from 'multer';
import * as dist from '../controllers/distributionController.js';
import { authenticate, requireRoles, requireActiveTenant, blockSupportWrites } from '../middleware/auth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else {
      const err = new Error('Only Excel files are allowed (.xlsx, .xls, .csv).');
      err.status = 400;
      cb(err);
    }
  },
});

const router = Router();
router.use(authenticate, requireActiveTenant, blockSupportWrites);
router.get('/', requireRoles('tenant_admin', 'super_admin'), dist.listDistributions);
router.post('/', requireRoles('tenant_admin'), dist.createDistribution);
router.get('/active', requireRoles('tenant_admin', 'assistant', 'super_admin'), dist.getActiveDistribution);
router.get('/:id', requireRoles('tenant_admin', 'super_admin'), dist.getDistribution);
router.patch('/:id', requireRoles('tenant_admin'), dist.updateDistribution);
router.patch('/:id/status', requireRoles('tenant_admin'), dist.setDistributionStatus);
router.get('/:id/beneficiaries', requireRoles('tenant_admin', 'super_admin'), dist.listBeneficiaries);
router.post(
  '/:id/beneficiaries/preview',
  requireRoles('tenant_admin'),
  upload.single('file'),
  dist.previewBeneficiariesUpload
);
router.post(
  '/:id/beneficiaries/manual',
  requireRoles('tenant_admin'),
  dist.addBeneficiary
);
router.patch(
  '/:id/beneficiaries/:beneficiaryId',
  requireRoles('tenant_admin'),
  dist.updateBeneficiary
);
router.delete(
  '/:id/beneficiaries/:beneficiaryId',
  requireRoles('tenant_admin'),
  dist.removeBeneficiary
);
router.post(
  '/:id/beneficiaries',
  requireRoles('tenant_admin'),
  upload.single('file'),
  dist.uploadBeneficiaries
);

export default router;

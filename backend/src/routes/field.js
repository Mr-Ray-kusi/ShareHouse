import { Router } from 'express';
import * as fieldQr from '../controllers/fieldQrController.js';

const router = Router();

router.get('/:token', fieldQr.getFieldPublic);
router.get('/:token/search', fieldQr.searchFieldPublic);
router.post('/:token/verify', fieldQr.verifyFieldPublic);

export default router;

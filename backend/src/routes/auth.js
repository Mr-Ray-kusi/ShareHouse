import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { getInvitePublic } from '../controllers/inviteController.js';

const router = Router();

router.post('/register', auth.register);
router.post('/login', auth.login);
router.post('/join/:code', auth.joinAssistant);
router.get('/join/:code', getInvitePublic);
router.post('/refresh', auth.refresh);
router.post('/logout', authenticate, auth.logout);
router.get('/me', authenticate, auth.me);

export default router;

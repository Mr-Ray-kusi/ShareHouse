import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { getInvitePublic } from '../controllers/inviteController.js';
import { getPorterInvitePublic } from '../controllers/porterInviteController.js';

const router = Router();

router.post('/register', auth.register);
router.post('/login', auth.login);
router.post('/join/:code', auth.joinAssistant);
router.get('/join/:code', getInvitePublic);
router.post('/lodge-join/:code', auth.joinPorter);
router.get('/lodge-join/:code', getPorterInvitePublic);
router.post('/refresh', auth.refresh);
router.post('/logout', authenticate, auth.logout);
router.get('/me', authenticate, auth.me);

export default router;

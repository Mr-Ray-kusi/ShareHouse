import { Router } from 'express';
import multer from 'multer';
import * as register from '../controllers/lodgeRegisterController.js';
import * as porters from '../controllers/porterInviteController.js';
import * as desk from '../controllers/lodgeDeskController.js';
import * as board from '../controllers/lodgeBoardController.js';
import * as roster from '../controllers/lodgeRosterController.js';
import * as presidents from '../controllers/presidentController.js';
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

router.get('/dashboard', requireRoles('hall_admin'), board.lodgeDashboard);
router.get('/board', requireRoles('hall_admin'), board.lodgeBoardList);

router.get('/rooms', requireRoles('hall_admin'), register.listRooms);
router.get('/rooms/:id', requireRoles('hall_admin'), register.getRoom);
router.get('/occupants', requireRoles('hall_admin'), register.searchOccupants);
router.post('/rooms/upload', requireRoles('hall_admin'), upload.single('file'), register.uploadRoomRegister);

router.get('/presidents', requireRoles('hall_admin'), presidents.listPresidents);
router.post('/presidents', requireRoles('hall_admin'), presidents.createPresident);
router.post('/presidents/:id/password', requireRoles('hall_admin'), presidents.setPresidentPassword);
router.post('/presidents/:id/revoke', requireRoles('hall_admin'), presidents.revokePresident);
router.post('/presidents/:id/restore', requireRoles('hall_admin'), presidents.restorePresident);
router.post('/presidents/:id/delete', requireRoles('hall_admin'), presidents.deletePresident);

router.get('/porters', requireRoles('hall_admin'), porters.listPorterInvites);
router.post('/porters', requireRoles('hall_admin'), porters.createPorterInvite);
router.post('/porters/:id/password', requireRoles('hall_admin'), porters.setPorterPassword);
router.post('/porters/:id/revoke', requireRoles('hall_admin'), porters.revokePorterInvite);
router.post('/porters/:id/restore', requireRoles('hall_admin'), porters.restorePorterInvite);
router.post('/porters/:id/delete', requireRoles('hall_admin'), porters.deletePorterInvite);

router.get('/roster', requireRoles('hall_admin'), roster.getRoster);
router.post('/roster', requireRoles('hall_admin'), roster.saveRoster);

router.get('/desk/meta', requireRoles('porter'), desk.deskMeta);
router.get('/desk/search', requireRoles('porter'), desk.searchLodgeDesk);
router.post('/desk/give', requireRoles('porter'), desk.giveKey);
router.post('/desk/receive', requireRoles('porter'), desk.receiveKey);

export default router;

import { KeyMovement, ShiftRoster, User } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { asIdList, todayStamp } from '../utils/lodge.js';

export const getRoster = asyncHandler(async (req, res) => {
  const rosterDate = String(req.query.date || todayStamp());
  const [roster, porters, movements] = await Promise.all([
    ShiftRoster.findOne({ tenantId: req.tenantId, rosterDate }),
    User.find({ tenantId: req.tenantId, role: 'porter', isActive: true }).select('-passwordHash -refreshTokens'),
    KeyMovement.find({
      tenantId: req.tenantId,
      createdAt: { $gte: new Date(`${rosterDate}T00:00:00.000Z`) },
    }).limit(800),
  ]);

  const dayMoves = movements.filter((item) => String(item.createdAt).slice(0, 10) === rosterDate || new Date(item.createdAt).toISOString().slice(0, 10) === rosterDate);
  const counts = {
    morningIn: dayMoves.filter((item) => item.shift === 'morning' && item.action === 'in').length,
    morningOut: dayMoves.filter((item) => item.shift === 'morning' && item.action === 'out').length,
    eveningIn: dayMoves.filter((item) => item.shift === 'evening' && item.action === 'in').length,
    eveningOut: dayMoves.filter((item) => item.shift === 'evening' && item.action === 'out').length,
  };

  res.json({
    rosterDate,
    morningPorterIds: asIdList(roster?.morningPorterIds),
    eveningPorterIds: asIdList(roster?.eveningPorterIds),
    porters: porters.map((user) => ({
      id: String(user._id),
      name: user.name,
    })),
    handover: counts,
  });
});

export const saveRoster = asyncHandler(async (req, res) => {
  const rosterDate = String(req.body?.date || todayStamp());
  const morningPorterIds = asIdList(req.body?.morningPorterIds);
  const eveningPorterIds = asIdList(req.body?.eveningPorterIds);
  let roster = await ShiftRoster.findOne({ tenantId: req.tenantId, rosterDate });
  if (!roster) {
    roster = await ShiftRoster.create({
      tenantId: req.tenantId,
      rosterDate,
      morningPorterIds,
      eveningPorterIds,
      createdBy: req.user._id,
    });
  } else {
    roster.morningPorterIds = morningPorterIds;
    roster.eveningPorterIds = eveningPorterIds;
    await roster.save();
  }
  res.json({
    message: 'Roster saved.',
    rosterDate,
    morningPorterIds,
    eveningPorterIds,
  });
});

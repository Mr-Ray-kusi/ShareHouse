import { KeyMovement, Occupant, Room, ShiftRoster } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { looksLikeStudentIndex, searchRegex } from '../utils/search.js';
import {
  normalizeRoomNumber,
  resolvePorterShift,
  todayStamp,
} from '../utils/lodge.js';

function occupantRow(occupant, selected = false) {
  return {
    id: String(occupant._id),
    roomId: String(occupant.roomId),
    roomNumber: occupant.roomNumber,
    fullName: occupant.fullName,
    studentIndex: occupant.studentIndex,
    phone: occupant.phone,
    cohort: occupant.cohort,
    selected,
    sheetRow: {
      Room: occupant.roomNumber,
      'Student Index': occupant.studentIndex,
      'Full Name': occupant.fullName,
      Phone: occupant.phone || '',
      'Fresher/Continuing': occupant.cohort === 'fresher' ? 'Fresher' : 'Continuing',
    },
  };
}

function roomState(room) {
  return {
    id: String(room._id),
    roomNumber: room.roomNumber,
    keyStatus: room.keyStatus,
    outOccupantId: room.outOccupantId ? String(room.outOccupantId) : null,
    outOccupantName: room.outOccupantName || '',
    outStudentIndex: room.outStudentIndex || '',
    outStaffName: room.outStaffName || '',
    outShift: room.outShift || '',
    outAt: room.outAt || null,
  };
}

async function currentRoster(tenantId) {
  return ShiftRoster.findOne({ tenantId, rosterDate: todayStamp() });
}

async function logMovement(fields) {
  return KeyMovement.create(fields);
}

export const deskMeta = asyncHandler(async (req, res) => {
  const roster = await currentRoster(req.tenantId);
  const shift = await resolvePorterShift(roster, req.user._id);
  res.json({
    shift,
    rosterDate: todayStamp(),
    onDuty: Boolean(roster),
    morningCount: (roster?.morningPorterIds || []).length,
    eveningCount: (roster?.eveningPorterIds || []).length,
    staffName: req.user.name,
  });
});

export const searchLodgeDesk = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const roster = await currentRoster(req.tenantId);
  const shift = await resolvePorterShift(roster, req.user._id);
  const meta = {
    shift,
    rosterDate: todayStamp(),
    staffName: req.user.name,
    headers: ['Room', 'Student Index', 'Full Name', 'Phone', 'Fresher/Continuing'],
  };
  if (q.length < 1) return res.json({ ...meta, rooms: [], results: [] });

  const roomNumber = normalizeRoomNumber(q);
  const looksLikeRoom = /^[A-Z0-9][A-Z0-9./-]{0,10}$/i.test(q.replace(/\s+/g, ''));
  let rooms = [];
  if (looksLikeRoom) {
    rooms = await Room.find({
      tenantId: req.tenantId,
      roomNumber: { $startsWith: roomNumber },
    }).sort({ roomNumber: 1 }).limit(20);
  }

  let occupants = [];
  if (rooms.length) {
    occupants = await Occupant.find({
      tenantId: req.tenantId,
      isActive: true,
      roomId: { $in: rooms.map((room) => room._id) },
    }).sort({ fullName: 1 }).limit(80);
  } else {
    const filter = { tenantId: req.tenantId, isActive: true };
    if (looksLikeStudentIndex(q)) filter.studentIndex = { $startsWith: q.trim() };
    else filter.searchText = searchRegex(q);
    occupants = await Occupant.find(filter).sort({ roomNumber: 1, fullName: 1 }).limit(24);
    if (occupants.length) {
      rooms = await Room.find({
        tenantId: req.tenantId,
        _id: { $in: [...new Set(occupants.map((row) => String(row.roomId)))] },
      });
    }
  }

  if (!rooms.length && q.length >= 2) {
    await logMovement({
      tenantId: req.tenantId,
      roomId: null,
      roomNumber: roomNumber || q,
      occupantId: null,
      studentName: q,
      studentIndex: looksLikeStudentIndex(q) ? q.trim().toUpperCase() : '',
      action: 'failed',
      staffId: req.user._id,
      staffName: req.user.name,
      shift,
      note: 'Name or room not on the lodge register.',
    }).catch(() => {});
  }

  const occupantsByRoom = new Map();
  for (const occupant of occupants) {
    const key = String(occupant.roomId);
    if (!occupantsByRoom.has(key)) occupantsByRoom.set(key, []);
    occupantsByRoom.get(key).push(occupantRow(occupant));
  }

  const packed = rooms.map((room) => ({
    ...roomState(room),
    occupants: occupantsByRoom.get(String(room._id)) || [],
    canGive: room.keyStatus === 'in_lodge',
    canReceive: room.keyStatus === 'out',
  }));

  res.json({
    ...meta,
    rooms: packed,
    results: packed.flatMap((room) =>
      room.occupants.map((occupant) => ({
        ...occupant,
        keyStatus: room.keyStatus,
        canGive: room.canGive,
        canReceive: room.canReceive,
        outOccupantName: room.outOccupantName,
        outAt: room.outAt,
        outStaffName: room.outStaffName,
        outShift: room.outShift,
      }))
    ),
  });
});

async function moveKey(req, action) {
  const { occupantId } = req.body || {};
  if (!occupantId) {
    const err = new Error('Select the occupant on this room before the key can move.');
    err.status = 400;
    throw err;
  }

  const occupant = await Occupant.findOne({
    _id: occupantId,
    tenantId: req.tenantId,
    isActive: true,
  });
  const roster = await currentRoster(req.tenantId);
  const shift = await resolvePorterShift(roster, req.user._id);

  if (!occupant) {
    await logMovement({
      tenantId: req.tenantId,
      roomId: null,
      roomNumber: String(req.body?.roomNumber || ''),
      occupantId: null,
      studentName: String(req.body?.studentName || ''),
      studentIndex: String(req.body?.studentIndex || ''),
      action: 'failed',
      staffId: req.user._id,
      staffName: req.user.name,
      shift,
      note: 'Name not on that room.',
    }).catch(() => {});
    const err = new Error('That name is not on this room.');
    err.status = 404;
    throw err;
  }

  const room = await Room.findOne({ _id: occupant.roomId, tenantId: req.tenantId });
  if (!room) {
    const err = new Error('Room not found.');
    err.status = 404;
    throw err;
  }

  if (action === 'out' && room.keyStatus === 'out') {
    const err = new Error(`This key is already out with ${room.outOccupantName || 'a student'}.`);
    err.status = 409;
    throw err;
  }
  if (action === 'in' && room.keyStatus === 'in_lodge') {
    const err = new Error('This key is already in the lodge.');
    err.status = 409;
    throw err;
  }

  if (action === 'out') {
    room.keyStatus = 'out';
    room.outOccupantId = occupant._id;
    room.outOccupantName = occupant.fullName;
    room.outStudentIndex = occupant.studentIndex;
    room.outStaffId = req.user._id;
    room.outStaffName = req.user.name;
    room.outShift = shift;
    room.outAt = new Date();
  } else {
    room.keyStatus = 'in_lodge';
    room.outOccupantId = null;
    room.outOccupantName = '';
    room.outStudentIndex = '';
    room.outStaffId = null;
    room.outStaffName = '';
    room.outShift = '';
    room.outAt = null;
  }
  await room.save();

  const movement = await logMovement({
    tenantId: req.tenantId,
    roomId: room._id,
    roomNumber: room.roomNumber,
    occupantId: occupant._id,
    studentName: occupant.fullName,
    studentIndex: occupant.studentIndex,
    action,
    staffId: req.user._id,
    staffName: req.user.name,
    shift,
    note: '',
  });

  return {
    message: action === 'out' ? 'Key given out.' : 'Key received into the lodge.',
    room: roomState(room),
    occupant: occupantRow(occupant),
    movement,
    shift,
  };
}

export const giveKey = asyncHandler(async (req, res) => {
  const payload = await moveKey(req, 'out');
  res.status(201).json(payload);
});

export const receiveKey = asyncHandler(async (req, res) => {
  const payload = await moveKey(req, 'in');
  res.status(201).json(payload);
});

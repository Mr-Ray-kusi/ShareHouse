import { Occupant, Room, KeyMovement } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseRoomRegisterWorkbook } from '../services/lodgeExcel.js';
import { normalizeRoomNumber } from '../utils/lodge.js';
import { foldSearch, searchRegex } from '../utils/search.js';

function roomPayload(room, occupants = []) {
  return {
    id: String(room._id),
    roomNumber: room.roomNumber,
    keyStatus: room.keyStatus,
    occupantCount: occupants.length,
    occupants,
    outOccupantId: room.outOccupantId ? String(room.outOccupantId) : null,
    outOccupantName: room.outOccupantName || '',
    outStudentIndex: room.outStudentIndex || '',
    outStaffName: room.outStaffName || '',
    outShift: room.outShift || '',
    outAt: room.outAt || null,
  };
}

export const uploadRoomRegister = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ message: 'Upload an Excel file (.xlsx or .xls).' });
  }
  const { occupants: rows, skipped, totalRows, headers } = parseRoomRegisterWorkbook(req.file.buffer);
  const roomsByNumber = new Map();
  const existingRooms = await Room.find({ tenantId: req.tenantId }).limit(5000);
  for (const room of existingRooms) roomsByNumber.set(room.roomNumber, room);

  const neededNumbers = [...new Set(rows.map((row) => row.roomNumber))];
  for (const roomNumber of neededNumbers) {
    if (roomsByNumber.has(roomNumber)) continue;
    const created = await Room.create({
      tenantId: req.tenantId,
      roomNumber,
      keyStatus: 'in_lodge',
    });
    roomsByNumber.set(roomNumber, created);
  }

  const keepIds = [];
  let added = 0;
  let updated = 0;
  for (const row of rows) {
    const room = roomsByNumber.get(row.roomNumber);
    let occupant = await Occupant.findOne({
      tenantId: req.tenantId,
      roomId: room._id,
      studentIndex: row.studentIndex,
    });
    if (!occupant) {
      occupant = await Occupant.create({
        tenantId: req.tenantId,
        roomId: room._id,
        ...row,
        isActive: true,
      });
      added += 1;
    } else {
      occupant.fullName = row.fullName;
      occupant.phone = row.phone;
      occupant.cohort = row.cohort;
      occupant.roomNumber = row.roomNumber;
      occupant.searchText = row.searchText;
      occupant.isActive = true;
      await occupant.save();
      updated += 1;
    }
    keepIds.push(String(occupant._id));
  }

  const current = await Occupant.find({ tenantId: req.tenantId, isActive: true }).limit(8000);
  let deactivated = 0;
  for (const occupant of current) {
    if (keepIds.includes(String(occupant._id))) continue;
    occupant.isActive = false;
    await occupant.save();
    deactivated += 1;
  }

  res.json({
    message: `Imported ${rows.length} occupants across ${neededNumbers.length} rooms.`,
    inserted: added,
    updated,
    deactivated,
    skipped,
    totalRows,
    headers,
    roomCount: neededNumbers.length,
  });
});

export const listRooms = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const rooms = await Room.find({ tenantId: req.tenantId }).sort({ roomNumber: 1 }).limit(2000);
  const occupants = await Occupant.find({ tenantId: req.tenantId, isActive: true }).limit(8000);
  const byRoom = new Map();
  for (const occupant of occupants) {
    const key = String(occupant.roomId);
    if (!byRoom.has(key)) byRoom.set(key, []);
    byRoom.get(key).push({
      id: String(occupant._id),
      fullName: occupant.fullName,
      studentIndex: occupant.studentIndex,
      phone: occupant.phone,
      cohort: occupant.cohort,
    });
  }

  const needle = foldSearch(q);
  const results = rooms
    .map((room) => roomPayload(room, byRoom.get(String(room._id)) || []))
    .filter((room) => {
      if (!needle) return true;
      const hay = foldSearch(
        `${room.roomNumber} ${room.occupants.map((o) => `${o.fullName} ${o.studentIndex} ${o.phone}`).join(' ')}`
      );
      return hay.includes(needle) || room.roomNumber.startsWith(String(q).trim().toUpperCase());
    });

  res.json({ rooms: results, headers: ['Room', 'Student Index', 'Full Name', 'Phone', 'Fresher/Continuing'] });
});

export const getRoom = asyncHandler(async (req, res) => {
  const room = await Room.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!room) return res.status(404).json({ message: 'Room not found.' });
  const occupants = await Occupant.find({ tenantId: req.tenantId, roomId: room._id, isActive: true }).sort({ fullName: 1 });
  const movements = await KeyMovement.find({ tenantId: req.tenantId, roomId: room._id })
    .sort({ createdAt: -1 })
    .limit(400);
  res.json({
    room: roomPayload(
      room,
      occupants.map((occupant) => ({
        id: String(occupant._id),
        fullName: occupant.fullName,
        studentIndex: occupant.studentIndex,
        phone: occupant.phone,
        cohort: occupant.cohort,
      }))
    ),
    movements: movements.map((item) => ({
      id: String(item._id),
      action: item.action,
      studentName: item.studentName,
      studentIndex: item.studentIndex,
      staffName: item.staffName,
      shift: item.shift,
      note: item.note,
      createdAt: item.createdAt,
      sheetRow: {
        Action: item.action === 'in' ? 'Brought in' : item.action === 'out' ? 'Taken out' : 'Failed attempt',
        Student: item.studentName,
        'Student Index': item.studentIndex,
        Staff: item.staffName,
        Shift: item.shift,
        When: item.createdAt,
        Note: item.note,
      },
    })),
    headers: ['Action', 'Student', 'Student Index', 'Staff', 'Shift', 'When', 'Note'],
  });
});

export const searchOccupants = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const filter = { tenantId: req.tenantId, isActive: true };
  const roomNumber = normalizeRoomNumber(q);
  const looksLikeRoom = /^[A-Z0-9][A-Z0-9./-]{0,10}$/i.test(q.replace(/\s+/g, '')) && /\d/.test(q);
  if (looksLikeRoom) filter.roomNumber = { $startsWith: roomNumber };
  else filter.searchText = searchRegex(q);
  const items = await Occupant.find(filter).sort({ roomNumber: 1, fullName: 1 }).limit(40);
  res.json({
    results: items.map((occupant) => ({
      id: String(occupant._id),
      roomId: String(occupant.roomId),
      roomNumber: occupant.roomNumber,
      fullName: occupant.fullName,
      studentIndex: occupant.studentIndex,
      phone: occupant.phone,
      cohort: occupant.cohort,
    })),
  });
});

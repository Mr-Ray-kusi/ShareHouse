import { KeyMovement, Occupant, Room, ShiftRoster } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { todayStamp } from '../utils/lodge.js';

const STALE_MS = 12 * 60 * 60 * 1000;

function movementRow(item) {
  return {
    id: String(item._id),
    action: item.action,
    roomNumber: item.roomNumber,
    studentName: item.studentName,
    studentIndex: item.studentIndex,
    staffName: item.staffName,
    shift: item.shift,
    note: item.note,
    createdAt: item.createdAt,
    sheetRow: {
      Room: item.roomNumber,
      Action: item.action === 'in' ? 'Brought in' : item.action === 'out' ? 'Taken out' : 'Failed attempt',
      Student: item.studentName,
      'Student Index': item.studentIndex,
      Staff: item.staffName,
      Shift: item.shift,
      When: item.createdAt,
      Note: item.note || '',
    },
  };
}

function roomRow(room) {
  return {
    id: String(room._id),
    roomNumber: room.roomNumber,
    keyStatus: room.keyStatus,
    outOccupantName: room.outOccupantName || '',
    outStudentIndex: room.outStudentIndex || '',
    outStaffName: room.outStaffName || '',
    outShift: room.outShift || '',
    outAt: room.outAt || null,
    sheetRow: {
      Room: room.roomNumber,
      Status: room.keyStatus === 'out' ? 'Out' : 'In lodge',
      Occupant: room.outOccupantName || '',
      'Student Index': room.outStudentIndex || '',
      Staff: room.outStaffName || '',
      Shift: room.outShift || '',
      Since: room.outAt || '',
    },
  };
}

export const lodgeDashboard = asyncHandler(async (req, res) => {
  const start = new Date(`${todayStamp()}T00:00:00.000Z`);
  const [rooms, todayMoves, roster] = await Promise.all([
    Room.find({ tenantId: req.tenantId }).limit(4000),
    KeyMovement.find({
      tenantId: req.tenantId,
      createdAt: { $gte: start },
    }).sort({ createdAt: -1 }).limit(400),
    ShiftRoster.findOne({ tenantId: req.tenantId, rosterDate: todayStamp() }),
  ]);

  const inLodge = rooms.filter((room) => room.keyStatus !== 'out');
  const out = rooms.filter((room) => room.keyStatus === 'out');
  const staleOut = out.filter((room) => room.outAt && Date.now() - new Date(room.outAt).getTime() >= STALE_MS);
  const failed = todayMoves.filter((item) => item.action === 'failed');
  const movements = todayMoves.filter((item) => item.action !== 'failed');

  res.json({
    stats: {
      inLodge: inLodge.length,
      out: out.length,
      today: movements.length,
      watch: staleOut.length + failed.length,
    },
    roster: roster
      ? {
        rosterDate: roster.rosterDate,
        morningCount: (roster.morningPorterIds || []).length,
        eveningCount: (roster.eveningPorterIds || []).length,
      }
      : null,
    headers: {
      inLodge: ['Room', 'Status'],
      out: ['Room', 'Status', 'Occupant', 'Student Index', 'Staff', 'Shift', 'Since'],
      today: ['Room', 'Action', 'Student', 'Student Index', 'Staff', 'Shift', 'When', 'Note'],
      watch: ['Room', 'Action', 'Student', 'Student Index', 'Staff', 'Shift', 'When', 'Note'],
    },
  });
});

export const lodgeBoardList = asyncHandler(async (req, res) => {
  const view = String(req.query.view || 'inLodge');
  const start = new Date(`${todayStamp()}T00:00:00.000Z`);

  if (view === 'inLodge' || view === 'out') {
    const rooms = await Room.find({
      tenantId: req.tenantId,
      keyStatus: view === 'out' ? 'out' : 'in_lodge',
    }).sort({ roomNumber: 1 }).limit(2000);
    const rows = rooms.map(roomRow);
    if (view === 'inLodge') {
      const occupants = rooms.length
        ? await Occupant.find({
          tenantId: req.tenantId,
          isActive: true,
          roomId: { $in: rooms.map((room) => room._id) },
        }).limit(8000)
        : [];
      const counts = new Map();
      for (const occupant of occupants) {
        const key = String(occupant.roomId);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      rows.forEach((row) => {
        row.sheetRow.Occupants = String(counts.get(row.id) || 0);
      });
    }
    return res.json({
      view,
      headers: view === 'out'
        ? ['Room', 'Status', 'Occupant', 'Student Index', 'Staff', 'Shift', 'Since']
        : ['Room', 'Status', 'Occupants'],
      results: rows,
    });
  }

  if (view === 'today') {
    const items = await KeyMovement.find({
      tenantId: req.tenantId,
      createdAt: { $gte: start },
      action: { $ne: 'failed' },
    }).sort({ createdAt: -1 }).limit(400);
    return res.json({
      view,
      headers: ['Room', 'Action', 'Student', 'Student Index', 'Staff', 'Shift', 'When', 'Note'],
      results: items.map(movementRow),
    });
  }

  const rooms = await Room.find({ tenantId: req.tenantId, keyStatus: 'out' }).limit(2000);
  const stale = rooms
    .filter((room) => room.outAt && Date.now() - new Date(room.outAt).getTime() >= STALE_MS)
    .map((room) => ({
      ...roomRow(room),
      sheetRow: {
        Room: room.roomNumber,
        Action: 'Out too long',
        Student: room.outOccupantName,
        'Student Index': room.outStudentIndex,
        Staff: room.outStaffName,
        Shift: room.outShift,
        When: room.outAt,
        Note: 'Key still out after 12 hours',
      },
    }));
  const failed = await KeyMovement.find({
    tenantId: req.tenantId,
    createdAt: { $gte: start },
    action: 'failed',
  }).sort({ createdAt: -1 }).limit(200);

  res.json({
    view: 'watch',
    headers: ['Room', 'Action', 'Student', 'Student Index', 'Staff', 'Shift', 'When', 'Note'],
    results: [...stale, ...failed.map(movementRow)],
  });
});

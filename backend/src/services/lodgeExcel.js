import XLSX from 'xlsx';
import { foldSearch } from '../utils/search.js';
import { normalizeRoomNumber, occupantSearchText } from '../utils/lodge.js';

function cellText(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function normalizeHeader(value) {
  return cellText(value)
    .toLowerCase()
    .replace(/[\n\r]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HINTS = {
  room: ['room', 'room no', 'room number', 'roomnumber', 'hostel room', 'block room', 'rm'],
  index: [
    'student index', 'index number', 'index no', 'index', 'matric', 'student id',
    'student no', 'reg no', 'admission',
  ],
  name: ['full name', 'fullname', 'student name', 'name of student', 'names', 'name'],
  phone: ['phone', 'phone number', 'mobile', 'contact', 'tel', 'whatsapp'],
  cohort: ['fresher', 'continuing', 'status', 'category', 'type', 'student type', 'year status'],
};

function headerScore(header, hints) {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const hint of hints) {
    if (h === hint) best = Math.max(best, 100);
    else if (h.includes(hint) || hint.includes(h)) best = Math.max(best, 75);
  }
  return best;
}

function pickColumn(headers, key, used) {
  let best = { col: -1, score: 0 };
  headers.forEach((header, col) => {
    if (used.has(col)) return;
    const score = headerScore(header, HINTS[key]);
    if (score > best.score) best = { col, score };
  });
  return best.score >= 40 ? best.col : -1;
}

function parseCohort(value) {
  const raw = foldSearch(value);
  if (!raw) return 'continuing';
  if (raw.includes('fresh') || raw === 'f' || raw.includes('new')) return 'fresher';
  return 'continuing';
}

export function parseRoomRegisterWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  if (!matrix.length) {
    const err = new Error('This sheet is empty.');
    err.status = 400;
    throw err;
  }

  let headerRow = 0;
  for (let i = 0; i < Math.min(8, matrix.length); i += 1) {
    const joined = (matrix[i] || []).map(normalizeHeader).join(' ');
    if (HINTS.room.some((hint) => joined.includes(hint)) && HINTS.name.some((hint) => joined.includes(hint))) {
      headerRow = i;
      break;
    }
  }

  const headers = (matrix[headerRow] || []).map((cell, idx) => cellText(cell) || `Column ${idx + 1}`);
  const used = new Set();
  const columns = {
    room: pickColumn(headers, 'room', used),
    index: pickColumn(headers, 'index', used),
    name: pickColumn(headers, 'name', used),
    phone: pickColumn(headers, 'phone', used),
    cohort: pickColumn(headers, 'cohort', used),
  };
  Object.values(columns).forEach((col) => {
    if (col >= 0) used.add(col);
  });

  if (columns.room < 0 || columns.name < 0) {
    const err = new Error('Could not find Room and Full Name columns. Use headers like Room, Student Index, Full Name, Phone, Fresher/Continuing.');
    err.status = 400;
    throw err;
  }

  const occupants = [];
  const skipped = [];
  const seen = new Set();

  for (let r = headerRow + 1; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    const roomNumber = normalizeRoomNumber(row[columns.room]);
    const fullName = cellText(row[columns.name]);
    const studentIndex = cellText(columns.index >= 0 ? row[columns.index] : '').toUpperCase();
    const phone = cellText(columns.phone >= 0 ? row[columns.phone] : '');
    const cohort = parseCohort(columns.cohort >= 0 ? row[columns.cohort] : '');
    if (!roomNumber && !fullName) continue;
    if (!roomNumber || !fullName) {
      skipped.push({ row: r + 1, reason: 'Room and full name are required.' });
      continue;
    }
    const indexKey = studentIndex || `NAME:${foldSearch(fullName)}`;
    const key = `${roomNumber}|${indexKey}`;
    if (seen.has(key)) {
      skipped.push({ row: r + 1, reason: `Duplicate ${fullName} on ${roomNumber}.` });
      continue;
    }
    seen.add(key);
    occupants.push({
      roomNumber,
      fullName,
      studentIndex: studentIndex || `R${roomNumber}-${occupants.length + 1}`,
      phone,
      cohort,
      searchText: occupantSearchText({
        studentIndex: studentIndex || fullName,
        fullName,
        phone,
        roomNumber,
        cohort,
      }),
    });
  }

  if (!occupants.length) {
    const err = new Error('Could not read any occupants. Check that the sheet has Room and Full Name columns.');
    err.status = 400;
    throw err;
  }

  return {
    occupants,
    skipped,
    totalRows: occupants.length + skipped.length,
    headers: ['Room', 'Student Index', 'Full Name', 'Phone', 'Fresher/Continuing'],
  };
}

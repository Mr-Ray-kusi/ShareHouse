import XLSX from 'xlsx';
import { foldSearch } from '../utils/search.js';

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

const HEADER_HINTS = {
  index: [
    'student index', 'index number', 'index no', 'indexno', 'index',
    'matric', 'matric no', 'matriculation', 'student id', 'studentid',
    'student no', 'student number', 'reg no', 'reg number', 'registration',
    'admission', 'candidate', 'ref no', 'reference', 'id number', 'id no',
  ],
  firstName: ['first name', 'firstname', 'given name', 'forename'],
  lastName: ['last name', 'lastname', 'surname', 'family name'],
  otherName: ['other name', 'other names', 'middle name', 'middle names'],
  name: ['full name', 'fullname', 'student name', 'beneficiary', 'name of student', 'names'],
  level: ['level', 'year', 'class', 'lvl', 'programme year', 'academic year'],
  phone: [
    'phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number',
    'tel', 'telephone', 'whatsapp', 'cell', 'msisdn',
  ],
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

function looksLikePhone(value) {
  const digits = cellText(value).replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

function looksLikeLevel(value) {
  const s = cellText(value).toLowerCase().replace(/\s+/g, '');
  return /^(100|200|300|400|500|600|[1-6]00l?|l[1-6]|level[1-6]|year[1-6]|[1-6])$/.test(s);
}

function looksLikeName(value) {
  const s = cellText(value);
  if (s.length < 2) return false;
  const letterRatio = s.replace(/[^A-Za-z]/g, '').length / s.length;
  return letterRatio >= 0.55 && /[A-Za-z]{2,}/.test(s);
}

function looksLikeIndex(value) {
  const s = cellText(value);
  if (s.length < 2 || s.length > 40) return false;
  if (looksLikePhone(s) || looksLikeLevel(s)) return false;
  if (looksLikeName(s) && /\s/.test(s) && !/\d/.test(s)) return false;
  return /[A-Za-z0-9]/.test(s) && (/\d/.test(s) || /^[A-Za-z0-9/.\-]+$/.test(s));
}

function sampleScore(values, tester) {
  const filled = values.map(cellText).filter(Boolean);
  if (!filled.length) return 0;
  const hits = filled.filter(tester).length;
  return Math.round((hits / filled.length) * 100);
}

function columnValues(matrix, col, startRow, limit = 25) {
  const out = [];
  for (let r = startRow; r < matrix.length && out.length < limit; r += 1) {
    const v = cellText(matrix[r]?.[col]);
    if (v) out.push(v);
  }
  return out;
}

function findHeaderRow(matrix) {
  const maxScan = Math.min(matrix.length, 12);
  let best = { row: 0, score: -1, keywords: 0 };
  for (let r = 0; r < maxScan; r += 1) {
    const row = matrix[r] || [];
    const filled = row.map(cellText).filter(Boolean);
    if (filled.length < 2) continue;
    let score = filled.length;
    let keywords = 0;
    for (const cell of filled) {
      const h = normalizeHeader(cell);
      for (const hints of Object.values(HEADER_HINTS)) {
        if (headerScore(h, hints) >= 75) {
          score += 20;
          keywords += 1;
        }
      }
    }
    if (score > best.score) best = { row: r, score, keywords };
  }
  if (best.keywords === 0) return -1;
  return best.row;
}

function pickBestColumn(scores, used) {
  let best = { col: -1, score: 0 };
  for (const { col, score } of scores) {
    if (used.has(col)) continue;
    if (score > best.score) best = { col, score };
  }
  return best.score >= 20 ? best.col : -1;
}

function detectColumns(headers, matrix, dataStart) {
  const width = Math.max(headers.length, ...matrix.map((r) => r.length), 0);
  const used = new Set();
  const scored = [];

  for (let col = 0; col < width; col += 1) {
    const header = headers[col] || '';
    const samples = columnValues(matrix, col, dataStart);
    scored.push({
      col,
      header,
      index: headerScore(header, HEADER_HINTS.index) + sampleScore(samples, looksLikeIndex) * 0.6,
      firstName: headerScore(header, HEADER_HINTS.firstName),
      lastName: headerScore(header, HEADER_HINTS.lastName),
      otherName: headerScore(header, HEADER_HINTS.otherName),
      name: headerScore(header, HEADER_HINTS.name) + sampleScore(samples, looksLikeName) * 0.5,
      level: headerScore(header, HEADER_HINTS.level) + sampleScore(samples, looksLikeLevel) * 0.8,
      phone: headerScore(header, HEADER_HINTS.phone) + sampleScore(samples, looksLikePhone) * 0.8,
    });
  }

  const map = {};
  map.index = pickBestColumn(scored.map((s) => ({ col: s.col, score: s.index })), used);
  if (map.index >= 0) used.add(map.index);

  map.lastName = pickBestColumn(scored.map((s) => ({ col: s.col, score: s.lastName })), used);
  if (map.lastName >= 0) used.add(map.lastName);
  map.firstName = pickBestColumn(scored.map((s) => ({ col: s.col, score: s.firstName })), used);
  if (map.firstName >= 0) used.add(map.firstName);
  map.otherName = pickBestColumn(scored.map((s) => ({ col: s.col, score: s.otherName })), used);
  if (map.otherName >= 0) used.add(map.otherName);

  map.name = pickBestColumn(scored.map((s) => ({ col: s.col, score: s.name })), used);
  if (map.name >= 0) used.add(map.name);

  map.phone = pickBestColumn(scored.map((s) => ({ col: s.col, score: s.phone })), used);
  if (map.phone >= 0) used.add(map.phone);
  map.level = pickBestColumn(scored.map((s) => ({ col: s.col, score: s.level })), used);

  if (map.index < 0) {
    const fallback = scored.find((s) => !used.has(s.col) && s.index >= 15);
    if (fallback) {
      map.index = fallback.col;
      used.add(fallback.col);
    }
  }
  if (map.name < 0 && map.firstName < 0 && map.lastName < 0) {
    const fallback = scored.find((s) => !used.has(s.col) && s.name >= 15);
    if (fallback) map.name = fallback.col;
  }

  return map;
}

function joinName(parts) {
  return parts.map(cellText).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function readCell(row, col) {
  if (col < 0) return '';
  return cellText(row[col]);
}

function uniqueHeaders(headers) {
  const seen = new Map();
  return headers.map((raw, i) => {
    const base = cellText(raw) || `Column ${i + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

export function parseBeneficiaryWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    const err = new Error('The Excel file has no sheets.');
    err.status = 400;
    throw err;
  }

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  });

  const usable = matrix.filter((row) => (row || []).some((cell) => cellText(cell)));
  if (!usable.length) {
    const err = new Error('The Excel file is empty.');
    err.status = 400;
    throw err;
  }

  const headerRow = findHeaderRow(usable);
  const hasHeader = headerRow >= 0;
  const headers = uniqueHeaders(
    hasHeader
      ? (usable[headerRow] || [])
      : (usable[0] || []).map((_, i) => `Column ${i + 1}`)
  );
  const dataRows = hasHeader ? usable.slice(headerRow + 1) : usable;
  const columns = detectColumns(headers, usable, hasHeader ? headerRow + 1 : 0);

  const headerLabel = (col) => (col >= 0 ? headers[col] || `Column ${col + 1}` : null);
  const detected = {
    studentIndex: headerLabel(columns.index),
    fullName: headerLabel(columns.name)
      || [headerLabel(columns.lastName), headerLabel(columns.firstName), headerLabel(columns.otherName)]
        .filter(Boolean)
        .join(' + ')
      || null,
    level: headerLabel(columns.level),
    phone: headerLabel(columns.phone),
  };

  const beneficiaries = [];
  const skipped = [];
  const seen = new Set();

  dataRows.forEach((row, index) => {
    const rowNumber = (hasHeader ? headerRow + 1 : 0) + index + 1;
    if (!(row || []).some((cell) => cellText(cell))) return;

    let studentIndex = readCell(row, columns.index).toUpperCase();
    let fullName = readCell(row, columns.name);
    if (!fullName) {
      fullName = joinName([
        readCell(row, columns.lastName),
        readCell(row, columns.firstName),
        readCell(row, columns.otherName),
      ]);
    }
    const level = readCell(row, columns.level);
    const phone = readCell(row, columns.phone);

    if (!fullName && studentIndex && looksLikeName(studentIndex)) {
      fullName = studentIndex;
      studentIndex = '';
    }

    if (!studentIndex && fullName) {
      studentIndex = `ROW-${rowNumber}`;
    }
    if (!fullName && studentIndex) {
      fullName = studentIndex;
    }

    if (!studentIndex && !fullName) {
      skipped.push({ row: rowNumber, reason: 'Could not read a name or ID from this row' });
      return;
    }

    if (seen.has(studentIndex)) {
      skipped.push({ row: rowNumber, reason: `Duplicate ID ${studentIndex} in file` });
      return;
    }
    const sheetRow = {};
    headers.forEach((header, col) => {
      sheetRow[header] = readCell(row, col);
    });
    const searchText = foldSearch([
      studentIndex,
      fullName,
      level,
      phone,
      ...Object.values(sheetRow),
    ]
      .filter(Boolean)
      .join(' '));

    seen.add(studentIndex);
    beneficiaries.push({ studentIndex, fullName, level, phone, sheetRow, searchText });
  });

  if (!beneficiaries.length) {
    const err = new Error(
      'Could not read any students from this sheet. Check that the file has a name or ID column.'
    );
    err.status = 400;
    throw err;
  }

  return { beneficiaries, skipped, totalRows: dataRows.length, columns: detected, headers };
}

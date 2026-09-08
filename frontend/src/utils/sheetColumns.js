function normalizeHeader(value) {
  return String(value || '')
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

export function defaultSheetHeaders() {
  return ['Student Index', 'Full Name', 'Level', 'Phone'];
}

export function classifySheetHeaders(headers = []) {
  const cols = (headers || []).filter(Boolean);
  const used = new Set();
  function pick(hints, min = 40) {
    let best = { header: '', score: 0 };
    for (const header of cols) {
      if (used.has(header)) continue;
      const score = headerScore(header, hints);
      if (score > best.score) best = { header, score };
    }
    if (best.score >= min) {
      used.add(best.header);
      return best.header;
    }
    return '';
  }

  const roles = {
    index: pick(HEADER_HINTS.index),
    lastName: pick(HEADER_HINTS.lastName),
    firstName: pick(HEADER_HINTS.firstName),
    otherName: pick(HEADER_HINTS.otherName),
    name: pick(HEADER_HINTS.name),
    phone: pick(HEADER_HINTS.phone),
    level: pick(HEADER_HINTS.level),
  };
  if (!roles.index && cols[0]) roles.index = cols[0];
  return roles;
}

export function requiredSheetHeaders(headers = []) {
  const roles = classifySheetHeaders(headers);
  const required = new Set();
  if (roles.index) required.add(roles.index);
  if (roles.name) required.add(roles.name);
  else {
    if (roles.lastName) required.add(roles.lastName);
    if (roles.firstName) required.add(roles.firstName);
  }
  return required;
}

export function fieldsFromSheetValues(values, headers = []) {
  const roles = classifySheetHeaders(headers);
  const studentIndex = String(roles.index ? values[roles.index] : '').trim();
  const fullName = String(roles.name ? values[roles.name] : '').trim()
    || [roles.lastName, roles.firstName, roles.otherName]
      .filter(Boolean)
      .map((key) => String(values[key] || '').trim())
      .filter(Boolean)
      .join(' ');
  return {
    studentIndex,
    fullName,
    level: String(roles.level ? values[roles.level] : '').trim(),
    phone: String(roles.phone ? values[roles.phone] : '').trim(),
    sheetRow: { ...values },
  };
}

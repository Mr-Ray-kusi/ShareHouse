import { Beneficiary, Invite, Distribution } from '../models/index.js';
import { foldSearch } from '../utils/search.js';
import { classifySheetHeaders } from './listService.js';
import { getActiveDistribution } from './activeDistribution.js';

const IDENTITY_HEADERS = [
  'student index', 'index number', 'index no', 'index', 'matric', 'student id',
  'full name', 'student name', 'name', 'first name', 'last name', 'surname',
  'phone', 'phone number', 'mobile', 'email', 'contact',
];

function headerKey(value) {
  return foldSearch(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function presentAssignment(row) {
  const column = String(row?.assignmentColumn || row?.column || '').trim();
  let values = row?.assignmentValues ?? row?.values ?? [];
  if (typeof values === 'string') {
    values = values.split(/[,{}\n]/).map((part) => part.trim()).filter(Boolean);
  }
  if (!Array.isArray(values)) values = [];
  const cleaned = [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
  if (!column || !cleaned.length) return null;
  return { column, values: cleaned };
}

export function formatAssignment(row) {
  const assignment = presentAssignment(row);
  if (!assignment) return 'Whole list';
  return `${assignment.column}: ${assignment.values.join(', ')}`;
}

export function isIdentityColumn(column) {
  const key = headerKey(column);
  if (!key) return true;
  return IDENTITY_HEADERS.some((hint) => key === hint || key.startsWith(`${hint} `));
}

export function throwIfAssignmentSchema(err) {
  const text = `${err?.message || ''} ${err?.details || ''} ${err?.code || ''}`;
  if (!/assignmentColumn|assignmentValues|PGRST204/i.test(text)) return;
  const wrapped = new Error(
    'Assistant sections need a one-time database update. Run backend/supabase/assistant-assignment.sql in the Supabase SQL Editor, then try again.'
  );
  wrapped.status = 503;
  throw wrapped;
}

export function parseAssignment(body = {}) {
  const column = String(body.assignmentColumn || body.column || '').trim();
  let raw = body.assignmentValues ?? body.values ?? [];
  if (typeof raw === 'string') {
    raw = raw.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
  }
  if (!Array.isArray(raw)) raw = [];
  const values = [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
  if (!column) return { assignmentColumn: '', assignmentValues: [] };
  if (isIdentityColumn(column)) {
    const err = new Error('Choose a section column such as Level or Hall, not a name, ID, or phone.');
    err.status = 400;
    throw err;
  }
  if (!values.length) {
    const err = new Error(`Pick at least one ${column} value, or leave this assistant on the whole list.`);
    err.status = 400;
    throw err;
  }
  if (column.length > 80 || values.length > 40) {
    const err = new Error('That section is too broad. Pick a column and a shorter list of values.');
    err.status = 400;
    throw err;
  }
  return { assignmentColumn: column, assignmentValues: values };
}

export function sheetCell(beneficiary, column) {
  const want = headerKey(column);
  const row = beneficiary?.sheetRow && typeof beneficiary.sheetRow === 'object'
    ? beneficiary.sheetRow
    : {};
  if (Object.prototype.hasOwnProperty.call(row, column)) return row[column];
  for (const [key, value] of Object.entries(row)) {
    if (headerKey(key) === want) return value;
  }
  if (want === 'level' || want.includes('level') || want === 'year' || want.includes('class')) {
    return beneficiary?.level || '';
  }
  return '';
}

function valueMatches(cell, want) {
  const a = foldSearch(cell);
  const b = foldSearch(want);
  if (!a || !b) return false;
  if (a === b) return true;
  const tokens = a.split(' ');
  if (tokens.includes(b)) return true;
  if (a === `${b}s` || b === `${a}s`) return true;
  return false;
}

export function beneficiaryMatchesAssignment(beneficiary, assignment) {
  const parsed = presentAssignment(assignment);
  if (!parsed) return true;
  const cell = sheetCell(beneficiary, parsed.column);
  return parsed.values.some((want) => valueMatches(cell, want));
}

export function assertBeneficiaryAssigned(beneficiary, assignment) {
  if (beneficiaryMatchesAssignment(beneficiary, assignment)) return;
  const parsed = presentAssignment(assignment);
  const err = new Error(
    parsed
      ? `This student is not in your section (${parsed.column}: ${parsed.values.join(', ')}).`
      : 'This student is not in your section.'
  );
  err.status = 403;
  throw err;
}

export async function getAssistantAssignment(req) {
  if (req._assistantAssignment !== undefined) return req._assistantAssignment;
  if (req.user?.role !== 'assistant') {
    req._assistantAssignment = null;
    return null;
  }
  let invite = req.user.inviteId ? await Invite.findById(req.user.inviteId) : null;
  if (!invite) {
    invite = await Invite.findOne({
      tenantId: req.tenantId,
      assistantId: req.user._id,
      isActive: true,
    });
  }
  req._assistantAssignment = presentAssignment(invite);
  return req._assistantAssignment;
}

export function assignmentColumnCandidates(headers = []) {
  const roles = classifySheetHeaders(headers);
  const blocked = new Set(
    [roles.index, roles.name, roles.firstName, roles.lastName, roles.otherName, roles.phone]
      .filter(Boolean)
      .map(headerKey)
  );
  const cols = [];
  for (const header of headers || []) {
    const key = headerKey(header);
    if (!key || blocked.has(key) || isIdentityColumn(header)) continue;
    if (!cols.some((existing) => headerKey(existing) === key)) cols.push(header);
  }
  if (!cols.length && (headers || []).some((header) => headerKey(header) === 'level')) {
    const levelHeader = headers.find((header) => headerKey(header) === 'level');
    if (levelHeader) cols.push(levelHeader);
  }
  return cols;
}

function uniqueSorted(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const label = String(value || '').trim();
    if (!label) continue;
    const key = foldSearch(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

export async function loadAssignmentOptions(tenantId) {
  const dist =
    (await getActiveDistribution(tenantId)) ||
    (await Distribution.findOne({ tenantId }).sort({ createdAt: -1 }));
  const fallback = [
    { header: 'Level', values: ['100', '200', '300', '400'] },
    { header: 'Hall', values: [] },
  ];
  if (!dist) {
    return { distribution: null, columns: fallback };
  }
  const headers = dist.sheetHeaders?.length ? dist.sheetHeaders : ['Student Index', 'Full Name', 'Level', 'Phone'];
  const candidates = assignmentColumnCandidates(headers);
  const items = await Beneficiary.find({ tenantId, distributionId: dist._id })
    .select('level sheetRow')
    .limit(8000);
  const columns = (candidates.length ? candidates : ['Level', 'Hall']).map((header) => ({
    header,
    values: uniqueSorted(items.map((row) => sheetCell(row, header))).slice(0, 60),
  }));
  for (const row of columns) {
    if (row.header === 'Level' && !row.values.length) {
      row.values = ['100', '200', '300', '400'];
    }
  }
  return {
    distribution: { id: dist._id, title: dist.title, status: dist.status },
    columns: columns.length ? columns : fallback,
  };
}

import { Search } from 'lucide-react';
import { emitTelemetry } from '../telemetry';

let searchTimer;

export default function SearchBar({
  value,
  onChange,
  onSearch,
  placeholder = 'Search name or ID',
}) {
  function emit(next) {
    onChange(next);
    onSearch?.(next);
    window.clearTimeout(searchTimer);
    const term = String(next || '').trim();
    if (term.length >= 2) {
      searchTimer = window.setTimeout(() => {
        emitTelemetry({ name: 'site_search', term, path: window.location.pathname });
      }, 700);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch?.(value);
      }}
      className="flex flex-row gap-2 items-stretch"
    >
      <label className="input flex items-center gap-2 sm:gap-3 flex-1 min-w-0 !px-3">
        <Search className="shrink-0 text-forest-700" size={18} />
        <input
          className="min-w-0 flex-1 bg-transparent border-0 outline-none py-0.5 text-base placeholder:text-ink/45"
          placeholder={placeholder}
          value={value}
          onChange={(e) => emit(e.target.value)}
        />
      </label>
      <button className="btn-primary px-4 sm:px-5 shrink-0" type="submit">Search</button>
    </form>
  );
}

export function foldSearch(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function rowMatchesQuery(row, query) {
  const needle = foldSearch(query);
  if (!needle) return true;
  const hay = foldSearch(
    [
      row.studentIndex,
      row.fullName,
      row.phone,
      row.level,
      ...Object.values(row.sheetRow || {}),
    ]
      .filter(Boolean)
      .join(' ')
  );
  return hay.includes(needle);
}

function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeGenderValue(value) {
  const v = String(value || '').replace(/\s+/g, '');
  return /^(m|f|male|female|man|woman|boy|girl)$/i.test(v);
}

export function detectFilterColumns(headers = [], rows = []) {
  const genderHeader = headers.find((h) => {
    const n = normalizeHeader(h);
    return (
      n === 'gender' ||
      n === 'sex' ||
      n === 'gender sex' ||
      n === 'm f' ||
      n === 'male female' ||
      n.includes('gender') ||
      /(^| )sex( |$)/.test(n)
    );
  }) || headers.find((h) => {
    const values = rows.map((r) => String(r.sheetRow?.[h] || '').trim()).filter(Boolean);
    if (values.length < 2) return false;
    const hits = values.filter(looksLikeGenderValue).length;
    return hits / values.length >= 0.7;
  }) || null;

  const levelHeader = headers.find((h) => {
    const n = normalizeHeader(h);
    return (
      n === 'level' ||
      n === 'lvl' ||
      n === 'year' ||
      n === 'class' ||
      n === 'programme year' ||
      n === 'academic year' ||
      n.startsWith('level') ||
      n.endsWith(' level')
    );
  }) || null;

  return { genderHeader, levelHeader };
}

function uniqueValues(rows, header) {
  const set = new Set();
  rows.forEach((row) => {
    const v = String(row.sheetRow?.[header] || '').trim();
    if (v) set.add(v);
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function ColumnFilters({ headers = [], rows = [], filters = {}, onChange }) {
  const { genderHeader, levelHeader } = detectFilterColumns(headers, rows);
  if (!genderHeader && !levelHeader) return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {genderHeader && (
        <select
          className="input py-2 w-full min-w-0 sm:min-w-[140px]"
          value={filters.gender || ''}
          onChange={(e) => onChange({ ...filters, gender: e.target.value })}
        >
          <option value="">All {genderHeader}</option>
          {uniqueValues(rows, genderHeader).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
      {levelHeader && (
        <select
          className="input py-2 w-full min-w-0 sm:min-w-[140px]"
          value={filters.level || ''}
          onChange={(e) => onChange({ ...filters, level: e.target.value })}
        >
          <option value="">All {levelHeader}</option>
          {uniqueValues(rows, levelHeader).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export function applyFilters(rows, filters = {}, headers = []) {
  const { genderHeader, levelHeader } = detectFilterColumns(headers, rows);
  return rows.filter((row) => {
    if (filters.gender && genderHeader) {
      if (String(row.sheetRow?.[genderHeader] || '') !== filters.gender) return false;
    }
    if (filters.level && levelHeader) {
      if (String(row.sheetRow?.[levelHeader] || '') !== filters.level) return false;
    }
    return true;
  });
}

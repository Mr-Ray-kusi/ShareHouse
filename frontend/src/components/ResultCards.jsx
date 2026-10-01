import { formatCollectedAt } from '../utils/sheetExport';
import { classifySheetHeaders } from '../utils/sheetColumns';

function sheetValue(row, header) {
  if (!header) return '';
  return String((row.sheetRow || {})[header] || '').trim();
}

export default function ResultCards({
  headers = [],
  rows = [],
  onMark,
  busyId,
  showMark = false,
  emptyMessage,
}) {
  const cols = headers.length ? headers : ['Student Index', 'Full Name', 'Level', 'Phone'];
  const roles = classifySheetHeaders(cols);

  if (!rows.length) {
    return <p className="p-4 text-sm text-ink/60">{emptyMessage || 'No matching student.'}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-2">
      {rows.map((row) => {
        const id = row.id || row._id;
        const taken = Boolean(row.collected);
        const name = row.fullName || sheetValue(row, roles.name) || 'Student';
        const indexValue = row.studentIndex || sheetValue(row, roles.index);
        const dobValue = sheetValue(row, roles.dob);
        const levelValue = row.level || sheetValue(row, roles.level);
        const used = new Set([roles.name, roles.index, roles.dob, roles.level, roles.firstName, roles.lastName, roles.otherName].filter(Boolean));
        const extras = cols.filter((header) => !used.has(header) && sheetValue(row, header) && sheetValue(row, header).toLowerCase() !== name.toLowerCase());
        const tone = taken
          ? 'bg-red-600 text-white'
          : row.queued
            ? 'bg-gold-400 text-ink'
            : 'bg-white border border-forest-100 shadow-lift';
        const muted = taken ? 'text-white/70' : 'text-ink/45';
        const body = taken ? 'text-white' : 'text-ink';

        return (
          <article key={id} className={`rounded-2xl p-3 ${tone}`}>
            <p className={`text-[10px] uppercase tracking-[0.16em] ${taken ? 'text-white/80' : 'text-forest-700/70'}`}>
              {taken ? 'Already collected' : 'On the list'}
            </p>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <div className="min-w-0">
                <p className={`text-[10px] uppercase tracking-wider ${muted}`}>Name</p>
                <p className={`font-display text-base leading-tight truncate ${body}`}>{name}</p>
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] uppercase tracking-wider ${muted}`}>{roles.index || 'ID'}</p>
                <p className={`text-sm font-semibold leading-tight truncate ${body}`}>{indexValue || '—'}</p>
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] uppercase tracking-wider ${muted}`}>{roles.dob || 'Date of birth'}</p>
                <p className={`text-sm leading-tight truncate ${body}`}>{dobValue || '—'}</p>
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] uppercase tracking-wider ${muted}`}>{roles.level || 'Level'}</p>
                <p className={`text-sm leading-tight truncate ${body}`}>{levelValue || '—'}</p>
              </div>
            </div>
            {extras.length ? (
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                {extras.map((header) => (
                  <div key={header} className="min-w-0">
                    <p className={`text-[10px] uppercase tracking-wider ${muted}`}>{header}</p>
                    <p className={`text-sm leading-tight truncate ${body}`}>{sheetValue(row, header)}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-2">
              {taken ? (
                <p className="text-sm font-semibold leading-tight">
                  Verified
                  {row.markedBy ? <span className={`block text-xs font-normal ${taken ? 'text-white/80' : 'text-ink/70'}`}>{row.markedBy}</span> : null}
                  {row.collectedAt ? (
                    <span className={`block text-xs font-normal ${taken ? 'text-white/80' : 'text-ink/70'}`}>{formatCollectedAt(row.collectedAt)}</span>
                  ) : null}
                </p>
              ) : row.queued ? (
                <p className="text-sm font-semibold">Queued — will sync</p>
              ) : showMark ? (
                <button
                  type="button"
                  className="btn-primary w-full py-2 text-sm"
                  disabled={busyId === id}
                  onClick={() => onMark?.(row)}
                >
                  {busyId === id ? 'Saving…' : 'Verify'}
                </button>
              ) : (
                <p className="text-xs font-semibold text-forest-700">Pending</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

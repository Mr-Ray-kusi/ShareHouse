import { formatCollectedAt } from '../utils/sheetExport';

export default function ResultCards({
  headers = [],
  rows = [],
  onMark,
  busyId,
  showMark = false,
  emptyMessage,
}) {
  const cols = headers.length ? headers : ['Student Index', 'Full Name', 'Level', 'Phone'];

  if (!rows.length) {
    return <p className="p-4 text-sm text-ink/60">{emptyMessage || 'No matching student.'}</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {rows.map((row) => {
        const id = row.id || row._id;
        const sheet = row.sheetRow || {};
        const taken = Boolean(row.collected);
        return (
          <article
            key={id}
            className={`aspect-square rounded-2xl p-4 flex flex-col overflow-hidden ${
              taken ? 'bg-red-600 text-white' : 'bg-white border border-forest-100 shadow-lift'
            }`}
          >
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-1.5">
              <p className={`text-[10px] uppercase tracking-[0.16em] ${taken ? 'text-white/80' : 'text-forest-700/70'}`}>
                {taken ? 'Already collected' : 'On the list'}
              </p>
              <h3 className="font-display text-xl leading-tight">{row.fullName || sheet['Full Name'] || 'Student'}</h3>
              {cols.map((h) => {
                const value = sheet[h];
                if (!value) return null;
                if (String(value).toLowerCase() === String(row.fullName || '').toLowerCase()) return null;
                return (
                  <p key={h} className={`text-sm leading-snug ${taken ? 'text-white/90' : 'text-ink/80'}`}>
                    <span className={`block text-[10px] uppercase tracking-wider ${taken ? 'text-white/70' : 'text-ink/45'}`}>{h}</span>
                    {value}
                  </p>
                );
              })}
            </div>
            <div className="mt-3 shrink-0">
              {taken ? (
                <p className="text-sm font-semibold leading-tight">
                  Verified
                  {row.markedBy ? <span className="block text-xs font-normal text-white/80">{row.markedBy}</span> : null}
                  {row.collectedAt ? (
                    <span className="block text-xs font-normal text-white/80">{formatCollectedAt(row.collectedAt)}</span>
                  ) : null}
                </p>
              ) : showMark ? (
                <button
                  type="button"
                  className="btn-primary w-full"
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

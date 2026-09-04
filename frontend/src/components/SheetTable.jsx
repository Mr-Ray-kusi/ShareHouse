import { formatCollectedAt } from '../utils/sheetExport';

export default function SheetTable({
  headers = [],
  rows = [],
  onMark,
  busyId,
  showMark = false,
  extraColumns = [],
  emptyMessage,
  fillHeight = false,
  sortKey = '',
  sortDir = 'asc',
  onSort,
}) {
  const cols = headers.length
    ? headers
    : ['Student Index', 'Full Name', 'Level', 'Phone'];

  function headerClick(key) {
    if (!onSort) return;
    if (sortKey === key) onSort(key, sortDir === 'asc' ? 'desc' : 'asc');
    else onSort(key, 'asc');
  }

  function mark(label, display) {
    const active = sortKey === label;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 ${onSort ? 'cursor-pointer select-none' : 'cursor-default'}`}
        onClick={() => headerClick(label)}
      >
        {display || label}
        {active && <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    );
  }

  return (
    <div className={`card ${fillHeight ? 'h-full min-h-0 overflow-auto' : 'overflow-x-auto'}`}>
      <table className="w-full text-sm min-w-[640px]">
        <thead className="text-left text-xs uppercase tracking-wider text-forest-700/70 border-b border-forest-100 bg-mist/60 sticky top-0 z-10">
          <tr>
            {cols.map((h) => (
              <th key={h} className="px-3 py-3 whitespace-nowrap">{mark(h)}</th>
            ))}
            {extraColumns.map((col) => (
              <th key={col.header} className="px-3 py-3 whitespace-nowrap">{col.header}</th>
            ))}
            <th className="px-3 py-3 whitespace-nowrap">{mark('__status', 'Status')}</th>
            {showMark && <th className="px-3 py-3"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const sheet = row.sheetRow || {};
            return (
              <tr key={row.id || row._id} className={`border-b border-forest-50 ${row.collected ? 'bg-red-50/40' : 'bg-white'}`}>
                {cols.map((h) => (
                  <td key={h} className="px-3 py-2 whitespace-nowrap">
                    {sheet[h] || '—'}
                  </td>
                ))}
                {extraColumns.map((col) => (
                  <td key={col.header} className="px-3 py-2 whitespace-nowrap">
                    {col.cell?.(row) ?? '—'}
                  </td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.collected ? (
                    <span className="text-xs font-semibold text-red-700 leading-tight block">
                      <span>{row.markedBy || row.assistantName || 'Verified'}</span>
                      {row.collectedAt ? (
                        <span className="block font-normal text-ink/65">{formatCollectedAt(row.collectedAt)}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-forest-700">Pending</span>
                  )}
                </td>
                {showMark && (
                  <td className="px-3 py-2">
                    {!row.collected && (
                      <button
                        className="btn-primary text-xs py-1.5 px-3"
                        disabled={busyId === (row.id || row._id)}
                        onClick={() => onMark?.(row)}
                      >
                        {busyId === (row.id || row._id) ? 'Saving…' : 'Verify'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="p-4 text-ink/60">{emptyMessage || 'No students on this list yet. Upload an Excel sheet to fill the table.'}</p>
      )}
    </div>
  );
}

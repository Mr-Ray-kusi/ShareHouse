function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function formatCollectedAt(date) {
  if (!date) return '';
  return new Date(date).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function statusLabel(row) {
  if (!row?.collected) return 'Pending';
  const name = row.markedBy || row.assistantName || '';
  const when = formatCollectedAt(row.collectedAt);
  return [name, when].filter(Boolean).join(' · ') || 'Verified';
}

export function sheetValue(row, header) {
  if (header === '__status') return statusLabel(row);
  if (header === '__name') return row.fullName || row.sheetRow?.['Full Name'] || '';
  if (header === '__collectedAt') return row.collectedAt ? new Date(row.collectedAt).toISOString() : '';
  return row.sheetRow?.[header] ?? row[header] ?? '';
}

export function sortSheetRows(rows, key, dir = 'asc') {
  if (!key) return rows;
  const mul = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (key === '__status' || key === '__collectedAt') {
      const at = a.collected ? new Date(a.collectedAt || 0).getTime() : 0;
      const bt = b.collected ? new Date(b.collectedAt || 0).getTime() : 0;
      if (at !== bt) return (at - bt) * mul;
    }
    const av = String(sheetValue(a, key) || '');
    const bv = String(sheetValue(b, key) || '');
    return av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' }) * mul;
  });
}

export function rowsToCsv(headers, rows) {
  const cols = [...headers, 'Status'];
  const lines = [cols.map(csvCell).join(',')];
  rows.forEach((row) => {
    const cells = headers.map((h) => csvCell(sheetValue(row, h)));
    cells.push(csvCell(statusLabel(row)));
    lines.push(cells.join(','));
  });
  return `\uFEFF${lines.join('\n')}`;
}

export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([rowsToCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function printSheet(title, headers, rows) {
  const cols = [...headers, 'Status'];
  const body = rows.map((row) => {
    const cells = headers.map((h) => `<td>${escapeHtml(sheetValue(row, h) || '—')}</td>`).join('');
    return `<tr>${cells}<td>${escapeHtml(statusLabel(row))}</td></tr>`;
  }).join('');
  const thead = cols.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const html = `<!doctype html><html><head><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: sans-serif; padding: 24px; color: #12241c; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { color: #555; margin: 0 0 16px; font-size: 13px; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; }
      th, td { border: 1px solid #d7e4db; padding: 6px 8px; text-align: left; }
      th { background: #eaf6ef; }
    </style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <p>${rows.length} student${rows.length === 1 ? '' : 's'} · printed ${new Date().toLocaleString()}</p>
    <table><thead><tr>${thead}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}">No rows</td></tr>`}</tbody></table>
    </body></html>`;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 400);
  };
  if (frame.contentWindow.document.readyState === 'complete') run();
  else frame.onload = run;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

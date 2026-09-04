import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { downloadFile } from '../../api/client';
import { PageIntro, Panel } from '../../components/super/SuperCharts';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

export default function SuperUploads() {
  const { uploads = [], search, busy, setBusy, setError } = useOutletContext();
  const q = String(search || '').trim().toLowerCase();
  const rows = useMemo(
    () => uploads.filter((item) => {
      if (!q) return true;
      return [item.hallName, item.schoolName, item.originalFileName, item.distributionTitle].join(' ').toLowerCase().includes(q);
    }),
    [uploads, q]
  );

  async function download(item) {
    setBusy(item.id);
    setError('');
    try {
      const url = item.kind === 'file'
        ? `/api/super/uploads/${item.id}/download`
        : `/api/super/distributions/${item.distributionId}/excel`;
      await downloadFile(url, item.originalFileName);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Download failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <PageIntro
        kicker="Files"
        title="Uploaded Excel files"
        subtitle="Every list a hall has uploaded. Download the original file when it was stored, or a rebuilt sheet from the saved rows."
      />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <tr>
                <th className="pb-3 pr-3">Hall</th>
                <th className="pb-3 pr-3">File</th>
                <th className="pb-3 pr-3">Uploaded</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={`${item.kind}-${item.id}`} className="border-b border-slate-50">
                  <td className="py-3 pr-3">
                    <p className="font-semibold">{item.hallName}</p>
                    <p className="text-xs text-slate-400">{item.schoolName}</p>
                  </td>
                  <td className="py-3 pr-3">{item.originalFileName}</td>
                  <td className="py-3 pr-3">{fmtDate(item.createdAt)}</td>
                  <td className="py-3 text-right">
                    <button
                      className="rounded-full bg-[#2563eb] text-white text-xs font-semibold px-4 py-1.5 hover:bg-[#1d4ed8] disabled:opacity-50"
                      disabled={busy === item.id}
                      onClick={() => download(item)}
                    >
                      {busy === item.id ? 'Downloading…' : 'Download'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-6 text-slate-400">No Excel files match that search.</p>}
        </div>
      </Panel>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, QrCode, Trash2 } from 'lucide-react';
import api from '../api/client';

function qrImage(url) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(url)}`;
}

function fieldLink(row) {
  return `${window.location.origin}${row.fieldPath}`;
}

export default function FieldQrPanel({ supportMode }) {
  const [distributions, setDistributions] = useState([]);
  const [qrs, setQrs] = useState([]);
  const [distributionId, setDistributionId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await api.get('/api/field-qr');
    const dists = data.distributions || [];
    setDistributions(dists);
    setQrs(data.qrs || []);
    setDistributionId((prev) => {
      if (prev && dists.some((d) => d.id === prev)) return prev;
      const active = dists.find((d) => d.status === 'active');
      return active?.id || dists[0]?.id || '';
    });
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load QR codes.'));
  }, []);

  const visible = useMemo(
    () => qrs.filter((row) => row.isActive && (!distributionId || row.distributionId === distributionId)),
    [qrs, distributionId]
  );

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/api/field-qr', { distributionId, count: 1 });
      setQrs((prev) => [...(data.qrs || []), ...prev]);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not generate QR code.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this QR code? Scanners will no longer reach the list.')) return;
    await api.post(`/api/field-qr/${id}/delete`);
    setQrs((prev) => prev.filter((row) => row.id !== id));
  }

  function downloadQr(row) {
    const url = fieldLink(row);
    const a = document.createElement('a');
    a.href = qrImage(url);
    a.download = `${row.label.replace(/\s+/g, '-')}.png`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.click();
  }

  return (
    <div className="card p-5 mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-forest-700">Field QR codes</p>
          <h2 className="font-display text-2xl mt-1">Self-verify stations</h2>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="min-w-[200px]">
            <span className="label">Campaign</span>
            <select className="input" value={distributionId} onChange={(e) => setDistributionId(e.target.value)}>
              {!distributions.length && <option value="">No campaign yet</option>}
              {distributions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} {d.status === 'active' ? '(active)' : `(${d.status})`}
                </option>
              ))}
            </select>
          </label>
          {!supportMode && (
            <button className="btn-primary" type="button" disabled={busy || !distributionId} onClick={generate}>
              <QrCode size={16} />
              {busy ? 'Generating…' : 'Generate QR code'}
            </button>
          )}
          <button className="btn-ghost" type="button" disabled={!visible.length} onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 print:grid-cols-3">
        {visible.map((row) => {
          const url = fieldLink(row);
          return (
            <div key={row.id} className="rounded-2xl border border-forest-100 bg-white p-3 text-center break-inside-avoid">
              <img src={qrImage(url)} alt={row.label} className="mx-auto w-full max-w-[200px] aspect-square object-contain bg-white" />
              <p className="font-semibold mt-2">{row.label}</p>
              <p className="text-[11px] font-mono break-all text-ink/55 mt-1">{url}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1 print:hidden">
                {!supportMode && (
                  <button type="button" className="btn-ghost text-xs text-red-700" onClick={() => remove(row.id)}>
                    <Trash2 size={12} /> Delete
                  </button>
                )}
                <button type="button" className="btn-ghost text-xs" onClick={() => downloadQr(row)}>
                  <Download size={12} /> Save
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!visible.length && (
        <p className="text-sm text-ink/55 mt-4">No QR codes for this campaign yet.</p>
      )}
    </div>
  );
}

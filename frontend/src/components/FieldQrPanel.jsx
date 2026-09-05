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
  const campaign = distributions.find((d) => d.id === distributionId);

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
    <div className="card mt-6 overflow-hidden">
      <div className="lg:grid lg:grid-cols-[minmax(260px,300px)_1fr]">
        <div className="p-5 lg:bg-ink lg:text-cream lg:p-6 flex flex-col gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-forest-700 lg:text-gold-400">Field QR codes</p>
            <h2 className="font-display text-2xl lg:text-3xl mt-1">Self-verify stations</h2>
            {campaign ? (
              <p className="hidden lg:block text-sm text-cream/65 mt-2">{campaign.title}</p>
            ) : null}
          </div>
          <label className="block">
            <span className="label lg:text-cream/70">Campaign</span>
            <select className="input lg:bg-white" value={distributionId} onChange={(e) => setDistributionId(e.target.value)}>
              {!distributions.length && <option value="">No campaign yet</option>}
              {distributions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} {d.status === 'active' ? '(active)' : `(${d.status})`}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-row lg:flex-col gap-2">
            {!supportMode && (
              <button className="btn-gold flex-1 lg:w-full" type="button" disabled={busy || !distributionId} onClick={generate}>
                <QrCode size={16} />
                {busy ? 'Generating…' : 'Generate QR code'}
              </button>
            )}
            <button className="btn-ghost flex-1 lg:w-full lg:border-white/20 lg:text-cream lg:hover:bg-white/10" type="button" disabled={!visible.length} onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
          </div>
          <p className="hidden lg:block text-xs text-cream/50 mt-auto">{visible.length} station{visible.length === 1 ? '' : 's'}</p>
        </div>

        <div className="p-5 lg:p-6 lg:bg-mist/50">
          {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
          {visible.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {visible.map((row) => {
                const url = fieldLink(row);
                return (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-forest-100 bg-white p-3 text-center lg:text-left lg:flex lg:items-center lg:gap-4 break-inside-avoid"
                  >
                    <img
                      src={qrImage(url)}
                      alt={row.label}
                      className="mx-auto lg:mx-0 w-full max-w-[180px] lg:w-28 lg:max-w-none aspect-square object-contain bg-white shrink-0"
                    />
                    <div className="min-w-0 flex-1 mt-2 lg:mt-0">
                      <p className="font-semibold">{row.label}</p>
                      <p className="text-[11px] font-mono break-all text-ink/55 mt-1">{url}</p>
                      <div className="mt-2 flex flex-wrap justify-center lg:justify-start gap-1 print:hidden">
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
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-ink/55">No QR codes for this campaign yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

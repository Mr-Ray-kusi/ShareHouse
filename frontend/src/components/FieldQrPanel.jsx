import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Download, Printer, QrCode } from 'lucide-react';
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
  const [copied, setCopied] = useState('');

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
      await api.post('/api/field-qr', { distributionId, count: 5 });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not generate QR codes.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id) {
    if (!window.confirm('Revoke this QR code? Scanners will no longer reach the list.')) return;
    await api.post(`/api/field-qr/${id}/revoke`);
    await load();
  }

  async function copyLink(row) {
    const url = fieldLink(row);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopied(row.id);
    setTimeout(() => setCopied((prev) => (prev === row.id ? '' : prev)), 1600);
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

  function printQrs() {
    window.print();
  }

  return (
    <div className="card p-5 mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-forest-700">Field QR codes</p>
          <h2 className="font-display text-2xl mt-1">Self-verify stations</h2>
          <p className="text-sm text-ink/60 mt-1">
            Print at least 5 codes for a sharing campaign. Anyone who scans sees Field collection
            {campaign ? ` — ${campaign.title}` : ''} — and can search their name, ID, or program, then verify themselves.
          </p>
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
              {busy ? 'Generating…' : 'Generate 5 QR codes'}
            </button>
          )}
          <button className="btn-ghost" type="button" disabled={!visible.length} onClick={printQrs}>
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
                <button type="button" className="btn-ghost text-xs" onClick={() => copyLink(row)}>
                  {copied === row.id ? <Check size={12} /> : <Copy size={12} />}
                  Copy
                </button>
                <button type="button" className="btn-ghost text-xs" onClick={() => downloadQr(row)}>
                  <Download size={12} /> Save
                </button>
                {!supportMode && (
                  <button type="button" className="btn-ghost text-xs text-red-700" onClick={() => revoke(row.id)}>
                    Revoke
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!visible.length && (
        <p className="text-sm text-ink/55 mt-4">No QR codes for this campaign yet. Generate 5 to share around the hall.</p>
      )}
    </div>
  );
}

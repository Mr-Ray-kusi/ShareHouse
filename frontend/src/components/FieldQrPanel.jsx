import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, QrCode } from 'lucide-react';
import api from '../api/client';
import UnitCodeBanner from './UnitCodeBanner';

function qrImage(url) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(url)}`;
}

function fieldLink(row) {
  return `${window.location.origin}${row.fieldPath}`;
}

export default function FieldQrPanel({ supportMode }) {
  const [distributions, setDistributions] = useState([]);
  const [qrs, setQrs] = useState([]);
  const [unitCode, setUnitCode] = useState('');
  const [distributionId, setDistributionId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rotating, setRotating] = useState(false);

  async function load() {
    const { data } = await api.get('/api/field-qr');
    const dists = data.distributions || [];
    setDistributions(dists);
    setQrs(data.qrs || []);
    setUnitCode(data.unitCode || '');
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
    () => qrs.filter((row) => row.isActive && (!distributionId || row.distributionId === distributionId)).slice(0, 1),
    [qrs, distributionId]
  );
  const campaign = distributions.find((d) => d.id === distributionId);
  const shared = visible[0];

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/api/field-qr', { distributionId, count: 1 });
      setQrs(data.qrs || []);
      if (data.unitCode) setUnitCode(data.unitCode);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not generate QR code.');
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!window.confirm('Create a new unit code? Old posters still work, but students must use the new code to verify.')) return;
    setRotating(true);
    setError('');
    try {
      const { data } = await api.post('/api/field-qr/rotate-unit');
      setUnitCode(data.unitCode || '');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not rotate the unit code.');
    } finally {
      setRotating(false);
    }
  }

  function downloadQr(row) {
    const url = fieldLink(row);
    const a = document.createElement('a');
    a.href = qrImage(url);
    a.download = `${(row.label || 'collection-qr').replace(/\s+/g, '-')}.png`;
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
            <h2 className="font-display text-2xl lg:text-3xl mt-1">Collection QR</h2>
            {campaign ? (
              <p className="hidden lg:block text-sm text-cream/65 mt-2">{campaign.title}</p>
            ) : null}
            <p className="hidden lg:block text-xs text-cream/50 mt-2">
              One shared QR for every table. Students still need the unit code to finish verify.
            </p>
          </div>
          <label className="block">
            <span className="label lg:text-cream/70">Campaign</span>
            <select className="input bg-forest-50 text-ink border-forest-200 lg:bg-forest-50" value={distributionId} onChange={(e) => setDistributionId(e.target.value)}>
              {!distributions.length && <option value="">No campaign yet</option>}
              {distributions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} {d.status === 'active' ? '(active)' : `(${d.status})`}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-row lg:flex-col gap-2 print:hidden">
            {!supportMode && !shared && campaign?.status === 'active' && (
              <button className="btn-gold flex-1 lg:w-full" type="button" disabled={busy || !distributionId} onClick={generate}>
                <QrCode size={16} />
                {busy ? 'Creating…' : 'Create collection QR'}
              </button>
            )}
            <button className="btn flex-1 lg:w-full border-0 bg-forest-50 text-forest-900 hover:bg-forest-100" type="button" disabled={!shared} onClick={() => window.print()}>
              <Printer size={14} /> Print QR
            </button>
          </div>
        </div>

        <div className="p-5 lg:p-6 lg:bg-mist/50 space-y-4">
          {error && <p className="text-sm text-red-700">{error}</p>}
          <UnitCodeBanner
            code={unitCode}
            onRotate={rotate}
            rotating={rotating}
            canRotate={!supportMode && Boolean(unitCode)}
          />
          {shared ? (
            <div className="rounded-2xl border border-forest-100 bg-white p-3 text-center lg:text-left lg:flex lg:items-center lg:gap-4 break-inside-avoid">
              <img
                src={qrImage(fieldLink(shared))}
                alt={shared.label}
                className="mx-auto lg:mx-0 w-full max-w-[180px] lg:w-28 lg:max-w-none aspect-square object-contain bg-white shrink-0"
              />
              <div className="min-w-0 flex-1 mt-2 lg:mt-0">
                <p className="font-semibold">{shared.label || 'Collection QR'}</p>
                <p className="text-[11px] font-mono break-all text-ink/55 mt-1">{fieldLink(shared)}</p>
                <p className="text-xs text-ink/55 mt-2">Print this same QR at every table.</p>
                <div className="mt-2 flex flex-row justify-center gap-1 lg:hidden print:hidden">
                  <button type="button" className="btn-ghost text-xs" onClick={() => downloadQr(shared)}>
                    <Download size={12} /> Save
                  </button>
                </div>
              </div>
              <div className="hidden lg:flex flex-col gap-2 shrink-0 print:hidden">
                <button type="button" className="btn-ghost text-xs w-full" onClick={() => downloadQr(shared)}>
                  <Download size={12} /> Save
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink/55">No collection QR for this campaign yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

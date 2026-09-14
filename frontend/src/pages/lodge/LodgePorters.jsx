import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';

export default function LodgePorters() {
  const { tenant } = useAuth();
  const [invites, setInvites] = useState([]);
  const [joinUrl, setJoinUrl] = useState('');
  const [joinPath, setJoinPath] = useState('');
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState('');

  async function load() {
    const { data } = await api.get('/api/lodge/porters');
    setInvites(data.invites || []);
    setJoinUrl(data.joinUrl || '');
    setJoinPath(data.joinPath || '');
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load porters.'));
  }, []);

  async function copyText(id, value) {
    const text = String(value || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? '' : prev)), 1600);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/lodge/porters', { label: label.trim(), password: password.trim() || undefined });
      setLabel('');
      setPassword('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add this porter.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · lodge staff`}
        title="Porters"
        subtitle="One lodge join link. Each porter gets their own password. Name must match password."
      />
      {(joinUrl || joinPath) && (
        <div className="card p-5 mt-6">
          <p className="text-xs uppercase tracking-widest text-forest-700">Shared lodge link</p>
          <p className="mt-2 font-mono text-lg break-all">{joinUrl || joinPath}</p>
          <p className="text-sm text-ink/60 mt-1">Path: {joinPath}</p>
        </div>
      )}
      <form onSubmit={create} className="card p-5 mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <input className="input" placeholder="Name (e.g. Morning — Kofi)" value={label} onChange={(e) => setLabel(e.target.value)} required />
        <input className="input" placeholder="Unique password (leave blank to generate)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Add porter'}</button>
      </form>
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      <div className="mt-6 space-y-3">
        {invites.map((inv) => {
          const secret = inv.password || inv.passwordPlain || '';
          return (
            <div key={inv._id || inv.id} className="card p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{inv.label || inv.porterName || 'Porter'}</p>
                <p className="text-xs text-ink/60">
                  {inv.isActive ? 'Active' : 'Revoked'}
                  {inv.porterName ? ` · ${inv.porterName}` : ' · not joined yet'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {secret ? (
                  <button type="button" className="btn-ghost text-xs font-mono" onClick={() => copyText(inv._id || inv.id, secret)}>
                    {copiedId === (inv._id || inv.id) ? <Check size={14} /> : <Copy size={14} />}
                    <span className="select-all">{secret}</span>
                  </button>
                ) : null}
                {inv.isActive ? (
                  <button type="button" className="btn-ghost text-xs text-red-700" onClick={() => api.post(`/api/lodge/porters/${inv._id || inv.id}/revoke`).then(load)}>
                    Revoke
                  </button>
                ) : (
                  <button type="button" className="btn-ghost text-xs" onClick={() => api.post(`/api/lodge/porters/${inv._id || inv.id}/restore`).then(load)}>
                    Restore
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

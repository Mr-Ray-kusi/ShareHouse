import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';

export default function LodgePresidents() {
  const { tenant } = useAuth();
  const [presidents, setPresidents] = useState([]);
  const [hallId, setHallId] = useState(tenant?.tenantId || '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [resetId, setResetId] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  async function load() {
    const { data } = await api.get('/api/lodge/presidents');
    setPresidents(data.presidents || []);
    setHallId(data.hallId || tenant?.tenantId || '');
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load hall presidents.'));
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
      await api.post('/api/lodge/presidents', { name: name.trim(), password: password.trim() || undefined });
      setName('');
      setPassword('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add this hall president.');
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword(id) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/lodge/presidents/${id}/password`, {
        password: resetPassword.trim() || undefined,
      });
      setResetId('');
      setResetPassword('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not set password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · hall staff`}
        title="Hall presidents"
        subtitle="Create a name and unique password. They sign in on the same page, choose Hall president, and open the sharing desk."
      />
      <div className="card p-5 mt-6">
        <p className="text-xs uppercase tracking-widest text-forest-700">Hall ID for president login</p>
        <p className="mt-2 font-mono text-lg break-all">{hallId || tenant?.tenantId || '—'}</p>
        <p className="text-sm text-ink/60 mt-1">Give this ID with the president name and password. A system admin must approve the account first.</p>
      </div>
      <form onSubmit={create} className="card p-5 mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <input className="input" placeholder="Name (e.g. Hall president — Ama)" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="input" placeholder="Unique password (leave blank to generate)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Add president'}</button>
      </form>
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      <div className="mt-6 space-y-3">
        {presidents.map((row) => {
          const id = row.id || row._id;
          const secret = row.password || '';
          const status = row.pendingApproval ? 'Awaiting system admin approval' : row.isActive ? 'Active' : 'Revoked';
          return (
            <div key={id} className="card p-4 flex flex-col gap-3">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-xs text-ink/60">{status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {secret ? (
                    <button type="button" className="btn-ghost text-xs font-mono" onClick={() => copyText(id, secret)}>
                      {copiedId === id ? <Check size={14} /> : <Copy size={14} />}
                      <span className="select-all">{secret}</span>
                    </button>
                  ) : null}
                  {!row.pendingApproval && row.isActive && (
                    <button type="button" className="btn-ghost text-xs" onClick={() => { setResetId(id); setResetPassword(''); }}>
                      Set password
                    </button>
                  )}
                  {row.pendingApproval ? null : row.isActive ? (
                    <button type="button" className="btn-ghost text-xs text-red-700" onClick={() => api.post(`/api/lodge/presidents/${id}/revoke`).then(load)}>
                      Revoke
                    </button>
                  ) : (
                    <button type="button" className="btn-ghost text-xs" onClick={() => api.post(`/api/lodge/presidents/${id}/restore`).then(load).catch((err) => setError(err.response?.data?.message || 'Could not restore.'))}>
                      Restore
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost text-xs text-red-700"
                    onClick={() => {
                      if (!window.confirm('Delete this hall president? This cannot be undone.')) return;
                      api.post(`/api/lodge/presidents/${id}/delete`).then(load);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {resetId === id && (
                <form
                  className="flex flex-col md:flex-row gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setNewPassword(id);
                  }}
                >
                  <input
                    className="input"
                    placeholder="New unique password (blank = generate)"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                  />
                  <button className="btn-primary" disabled={busy}>Save password</button>
                </form>
              )}
            </div>
          );
        })}
        {!presidents.length && <p className="text-sm text-ink/55">No hall president login yet.</p>}
      </div>
    </div>
  );
}

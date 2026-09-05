import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Download, Printer, Trash2 } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import { downloadCsv, printSheet, sortSheetRows } from '../../utils/sheetExport';
import HallHero from '../../components/HallHero';
import FieldQrPanel from '../../components/FieldQrPanel';

export default function Assistants() {
  const { tenant, supportMode } = useAuth();
  const [invites, setInvites] = useState([]);
  const [joinUrl, setJoinUrl] = useState('');
  const [joinPath, setJoinPath] = useState('');
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [openId, setOpenId] = useState('');
  const [verified, setVerified] = useState({ headers: [], results: [] });
  const [loadingList, setLoadingList] = useState(false);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [copiedId, setCopiedId] = useState('');

  async function load() {
    const { data } = await api.get('/api/invites');
    setInvites(data.invites || []);
    setJoinUrl(data.joinUrl || '');
    setJoinPath(data.joinPath || '');
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load assistants.'));
  }, []);

  async function loadVerified(id) {
    setLoadingList(true);
    setError('');
    try {
      const { data } = await api.get(`/api/invites/${id}/collections`);
      setVerified({
        headers: data.headers || [],
        results: data.results || [],
        distribution: data.distribution || null,
      });
    } catch (err) {
      setVerified({ headers: [], results: [] });
      setError(err.response?.data?.message || 'Could not load verified students.');
    } finally {
      setLoadingList(false);
    }
  }

  function selectAssistant(id) {
    if (openId === id) {
      setOpenId('');
      setVerified({ headers: [], results: [] });
      return;
    }
    setOpenId(id);
    setSortKey('');
    setSortDir('asc');
    loadVerified(id);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!label.trim()) {
        setError('Assistant name is required.');
        setBusy(false);
        return;
      }
      await api.post('/api/invites', { label: label.trim(), password: password.trim() || undefined });
      setLabel('');
      setPassword('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create invite.');
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword(id) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/invites/${id}/password`, {
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

  async function revoke(id) {
    if (!window.confirm('Revoke this assistant password?')) return;
    await api.post(`/api/invites/${id}/revoke`);
    await load();
  }

  async function restore(id) {
    await api.post(`/api/invites/${id}/restore`);
    await load();
  }

  async function remove(id) {
    if (!window.confirm('Delete this assistant? This cannot be undone.')) return;
    await api.post(`/api/invites/${id}/delete`);
    if (openId === id) {
      setOpenId('');
      setVerified({ headers: [], results: [] });
    }
    await load();
  }

  const openInvite = invites.find((inv) => inv._id === openId);
  const assistantTitle = openInvite?.label || openInvite?.assistantName || 'Assistant';
  const rows = useMemo(
    () => sortSheetRows(verified.results || [], sortKey, sortDir),
    [verified.results, sortKey, sortDir]
  );
  const fileBase = `${tenant?.tenantId || 'hall'}-${assistantTitle}`.replace(/\s+/g, '-');

  async function copyPassword(id, value) {
    const text = String(value || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? '' : prev)), 1600);
  }

  function exportCurrent(mode) {
    const title = `${tenant?.name || 'Hall'} · ${assistantTitle} verified`;
    if (mode === 'print') printSheet(title, verified.headers || [], rows);
    else downloadCsv(`${fileBase}-verified.csv`, verified.headers || [], rows);
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · /${tenant?.tenantId || ''}`}
        title="Assistants"
        subtitle="One hall link for assistants. Generate field QR codes so students can search and verify themselves."
      />

      {(joinUrl || joinPath) && (
        <div className="card p-5 mt-6">
          <p className="text-xs uppercase tracking-widest text-forest-700">Shared hall link</p>
          <p className="mt-2 font-mono text-lg break-all">{joinUrl || joinPath}</p>
          <p className="text-sm text-ink/60 mt-1">Path: {joinPath}</p>
        </div>
      )}

      <FieldQrPanel supportMode={supportMode} />

      {!supportMode && (
        <form onSubmit={create} className="card p-5 mt-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input className="input" placeholder="Name (e.g. Table 2 — Kojo)" value={label} onChange={(e) => setLabel(e.target.value)} required />
          <input
            className="input"
            type="text"
            placeholder="Unique password (leave blank to generate)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Add assistant'}</button>
        </form>
      )}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

      <div className="mt-6 space-y-3">
        {invites.map((inv) => {
          const open = openId === inv._id;
          const secret = inv.password || inv.passwordPlain || '';
          return (
            <div key={inv._id} className={`card overflow-hidden ${open ? 'ring-2 ring-forest-600' : ''}`}>
              <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left hover:opacity-80"
                  onClick={() => selectAssistant(inv._id)}
                >
                  <p className="font-semibold">
                    {inv.label || inv.assistantName || 'Assistant'}
                    {inv.assistantName && inv.label ? <span className="text-ink/50 font-normal"> · {inv.assistantName}</span> : null}
                  </p>
                  <p className="text-xs text-ink/60">
                    {inv.isActive ? 'Active' : 'Revoked'}
                    {inv.assistantName ? '' : ' · not joined yet'}
                    {open ? ' · showing verified list' : ' · tap to view verified students'}
                  </p>
                </button>
                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                  {secret ? (
                    <button
                      type="button"
                      className="btn-ghost text-xs font-mono shrink-0"
                      title="Copy password"
                      onClick={() => copyPassword(inv._id, secret)}
                    >
                      {copiedId === inv._id ? <Check size={14} /> : <Copy size={14} />}
                      <span className="select-all">{secret}</span>
                    </button>
                  ) : null}
                  {!supportMode && (
                    <>
                      {inv.isActive && (
                        <button
                          type="button"
                          className="btn-ghost text-xs shrink-0"
                          onClick={() => { setResetId(inv._id); setResetPassword(''); }}
                        >
                          Set password
                        </button>
                      )}
                      {inv.isActive ? (
                        <button type="button" className="btn-ghost text-xs text-red-700 shrink-0" onClick={() => revoke(inv._id)}>Revoke</button>
                      ) : (
                        <button type="button" className="btn-ghost text-xs shrink-0" onClick={() => restore(inv._id)}>Restore</button>
                      )}
                      <button type="button" className="btn-ghost text-xs text-red-700 shrink-0" onClick={() => remove(inv._id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              {resetId === inv._id && (
                <form
                  className="px-4 pb-4 flex flex-col md:flex-row gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setNewPassword(inv._id);
                  }}
                  onClick={(e) => e.stopPropagation()}
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
              {open && (
                <div className="border-t border-forest-100 p-4 bg-mist/30">
                  <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                    <div>
                      <h2 className="font-display text-xl">Verified by {assistantTitle}</h2>
                      <p className="text-sm text-ink/60 mt-1">
                        {loadingList ? 'Loading…' : `${rows.length} student${rows.length === 1 ? '' : 's'} verified.`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-ghost text-xs" onClick={() => exportCurrent('download')} disabled={!rows.length}>
                        <Download size={14} /> Download this list
                      </button>
                      <button className="btn-ghost text-xs" onClick={() => exportCurrent('print')} disabled={!rows.length}>
                        <Printer size={14} /> Print this list
                      </button>
                    </div>
                  </div>
                  <SheetTable
                    headers={verified.headers || []}
                    rows={rows}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={(key, dir) => {
                      setSortKey(key);
                      setSortDir(dir);
                    }}
                    emptyMessage={inv.assistantName ? 'This assistant has not verified anyone yet.' : 'This assistant has not joined yet.'}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

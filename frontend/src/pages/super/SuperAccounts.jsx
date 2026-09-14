import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import { PageIntro, Panel } from '../../components/super/SuperCharts';

function accountStatus(row) {
  if (row.pendingApproval) return 'Awaiting approval';
  if (row.isActive) return 'Active';
  return 'Deactivated';
}

export default function SuperAccounts() {
  const { search, setError } = useOutletContext();
  const [accounts, setAccounts] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ tenantId: '', name: '', password: '' });

  async function load() {
    const { data } = await api.get('/api/super/accounts');
    setAccounts(data.accounts || []);
    setTenants(data.tenants || []);
    setPending(data.pending || 0);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load accounts.'));
  }, [setError]);

  const q = String(search || '').trim().toLowerCase();
  const rows = useMemo(
    () => accounts.filter((row) => {
      if (!q) return true;
      return [row.name, row.email, row.hallName, row.schoolName, row.tenantId, row.roleLabel]
        .join(' ')
        .toLowerCase()
        .includes(q);
    }),
    [accounts, q]
  );

  async function setActive(id, isActive) {
    setBusy(id);
    try {
      await api.patch(`/api/super/users/${id}/status`, { isActive });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update account.');
    } finally {
      setBusy('');
    }
  }

  async function remove(id) {
    if (!window.confirm('Delete this account? This cannot be undone.')) return;
    setBusy(id);
    try {
      await api.post(`/api/super/users/${id}/delete`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete account.');
    } finally {
      setBusy('');
    }
  }

  async function createHidden(e) {
    e.preventDefault();
    setBusy('create');
    try {
      await api.post(`/api/super/tenants/${form.tenantId}/presidents`, {
        name: form.name.trim(),
        password: form.password.trim() || undefined,
      });
      setForm({ tenantId: form.tenantId, name: '', password: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create hall president.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <PageIntro
        kicker="Accounts"
        title="Staff accounts"
        subtitle="Approve or delete hall administrators and hall presidents. You can also create a hidden president login the hall administrator cannot see."
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div className="desk-card p-4">
          <p className="text-sm text-slate-500">Accounts</p>
          <p className="text-2xl font-semibold mt-1">{accounts.length}</p>
        </div>
        <div className="desk-card p-4 bg-[#2563eb] text-white">
          <p className="text-sm text-white/80">Awaiting approval</p>
          <p className="text-2xl font-semibold mt-1">{pending}</p>
        </div>
      </div>

      <Panel title="Hidden hall president" className="mb-4">
        <p className="text-sm text-slate-500 mb-3">
          Use this when a hall president must share resources without hall administration knowing.
        </p>
        <form className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_auto]" onSubmit={createHidden}>
          <select
            className="input"
            value={form.tenantId}
            onChange={(e) => setForm((prev) => ({ ...prev, tenantId: e.target.value }))}
            required
          >
            <option value="">Select hall</option>
            {tenants.map((hall) => (
              <option key={hall.tenantId} value={hall.tenantId}>
                {hall.name} · {hall.tenantId}
              </option>
            ))}
          </select>
          <input className="input" placeholder="President name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
          <input className="input" placeholder="Password (blank = generate)" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} autoComplete="off" />
          <button className="rounded-full bg-[#2563eb] text-white text-xs font-semibold px-4 py-1.5" disabled={busy === 'create'}>
            {busy === 'create' ? 'Saving…' : 'Create hidden login'}
          </button>
        </form>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <tr>
                <th className="pb-3 pr-3">Person</th>
                <th className="pb-3 pr-3">Hall</th>
                <th className="pb-3 pr-3">Role</th>
                <th className="pb-3 pr-3">Status</th>
                <th className="pb-3 pr-3">Password</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-50">
                  <td className="py-3 pr-3">
                    <p className="font-semibold">{row.name}</p>
                    <p className="text-xs text-slate-400">{row.email || 'No email'}</p>
                  </td>
                  <td className="py-3 pr-3">
                    <Link to={`/super/tenants/${row.tenantId}`} className="font-semibold hover:text-[#2563eb]">{row.hallName}</Link>
                    <p className="text-xs text-slate-400">{row.tenantId}</p>
                  </td>
                  <td className="py-3 pr-3">
                    {row.roleLabel}
                    {row.hiddenFromHall ? <p className="text-xs text-slate-400">Hidden from hall admin</p> : null}
                  </td>
                  <td className="py-3 pr-3">{accountStatus(row)}</td>
                  <td className="py-3 pr-3 font-mono text-xs">{row.password || '—'}</td>
                  <td className="py-3 text-right space-x-2 whitespace-nowrap">
                    {row.isActive ? (
                      <button
                        className="rounded-full px-3 py-1.5 text-xs font-semibold border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                        disabled={busy === row.id}
                        onClick={() => setActive(row.id, false)}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        className="rounded-full bg-[#2563eb] text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        disabled={busy === row.id}
                        onClick={() => setActive(row.id, true)}
                      >
                        {row.pendingApproval ? 'Approve' : 'Reactivate'}
                      </button>
                    )}
                    <button
                      className="rounded-full px-3 py-1.5 text-xs font-semibold border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      disabled={busy === row.id}
                      onClick={() => remove(row.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-6 text-slate-400">No accounts match that search.</p>}
        </div>
      </Panel>
    </div>
  );
}

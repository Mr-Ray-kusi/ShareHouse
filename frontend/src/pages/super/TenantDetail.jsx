import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { downloadFile } from '../../api/client';
import { MetricCard, PageIntro, Panel } from '../../components/super/SuperCharts';
import { BadgeCheck, Coins, Package } from 'lucide-react';

function accountStatus(row) {
  if (row.pendingApproval) return 'Awaiting approval';
  if (row.isActive) return 'Active';
  return 'Deactivated';
}

export default function TenantDetail() {
  const { tenantId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [president, setPresident] = useState({ name: '', password: '' });
  const [presidentBusy, setPresidentBusy] = useState(false);

  async function reload() {
    const { data: d } = await api.get(`/api/super/tenants/${tenantId}`);
    setData(d);
  }

  useEffect(() => {
    reload().catch((err) => setError(err.response?.data?.message || 'Not found.'));
  }, [tenantId]);

  async function downloadUpload(file) {
    setBusy(file._id);
    setError('');
    try {
      await downloadFile(`/api/super/uploads/${file._id}/download`, file.originalFileName);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Download failed.');
    } finally {
      setBusy('');
    }
  }

  async function setActive(isActive) {
    setStatusBusy(true);
    setError('');
    try {
      const { data: d } = await api.patch(`/api/super/tenants/${tenantId}/status`, { isActive });
      setData((prev) => ({ ...prev, tenant: d.tenant }));
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed.');
    } finally {
      setStatusBusy(false);
    }
  }

  async function setUserActive(id, isActive) {
    setBusy(id);
    setError('');
    try {
      await api.patch(`/api/super/users/${id}/status`, { isActive });
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update account.');
    } finally {
      setBusy('');
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Delete this account? This cannot be undone.')) return;
    setBusy(id);
    setError('');
    try {
      await api.post(`/api/super/users/${id}/delete`);
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete account.');
    } finally {
      setBusy('');
    }
  }

  if (error && !data) return <p className="text-rose-600">{error}</p>;
  if (!data) return <p className="text-slate-400">Loading…</p>;

  const t = data.tenant;
  const staff = [...(data.hallAdmins || []), ...(data.admins || [])];

  return (
    <div>
      <Link to="/super/halls" className="text-sm text-[#2563eb] font-medium">← Registered Halls</Link>
      <PageIntro kicker={t.schoolName} title={t.name} subtitle={`${t.adminName} · ${t.adminEmail} · Hall ID ${t.tenantId}`} />
      <div className="mb-4">
        <button
          className="rounded-full bg-[#2563eb] text-white text-xs font-semibold px-4 py-1.5 disabled:opacity-50"
          disabled={statusBusy || (!t.isActive && !t.lastPaymentAt)}
          onClick={() => setActive(!t.isActive)}
        >
          {statusBusy ? 'Saving…' : t.isActive ? 'Deactivate hall' : 'Approve hall'}
        </button>
        <Link to="/super/accounts" className="ml-3 text-sm text-[#2563eb] font-medium">Staff accounts</Link>
      </div>
      {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}
      <div className="grid md:grid-cols-3 gap-4">
        <MetricCard icon={Coins} label="Plan" value={`${t.subscriptionPlan} · GHS ${t.subscriptionFee}`} />
        <MetricCard
          icon={BadgeCheck}
          label="Status"
          value={!t.lastPaymentAt ? 'Awaiting payment' : t.isActive ? 'Active' : 'Awaiting approval'}
          hint={`Expires ${t.expiryDate ? new Date(t.expiryDate).toLocaleDateString() : '—'}`}
        />
        <MetricCard accent icon={Package} label="Collections" value={data.collectionCount} hint="Logged collections for this hall" />
      </div>

      <Panel title="Hall staff accounts" className="mt-4">
        <p className="text-sm text-slate-500 mb-3">
          Approve or delete the hall administrator and each hall president. Hidden presidents are not shown to hall administration.
        </p>
        <ul className="space-y-3 text-sm mb-4">
          {staff.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">{row.name} · {row.roleLabel}</p>
                <p className="text-xs text-slate-400">
                  {accountStatus(row)}
                  {row.hiddenFromHall ? ' · Hidden from hall admin' : ''}
                  {row.email ? ` · ${row.email}` : ''}
                  {row.password ? ` · ${row.password}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {row.isActive ? (
                  <button
                    className="rounded-full px-3 py-1.5 text-xs font-semibold border border-slate-200"
                    disabled={busy === row.id}
                    onClick={() => setUserActive(row.id, false)}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    className="rounded-full bg-[#2563eb] text-white px-3 py-1.5 text-xs font-semibold"
                    disabled={busy === row.id}
                    onClick={() => setUserActive(row.id, true)}
                  >
                    Approve
                  </button>
                )}
                <button
                  className="rounded-full px-3 py-1.5 text-xs font-semibold border border-rose-200 text-rose-700"
                  disabled={busy === row.id}
                  onClick={() => deleteUser(row.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {!staff.length && <li className="text-slate-400">No hall administrator or president accounts yet.</li>}
        </ul>
        <form
          className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            setPresidentBusy(true);
            setError('');
            try {
              await api.post(`/api/super/tenants/${tenantId}/presidents`, {
                name: president.name.trim(),
                password: president.password.trim() || undefined,
              });
              setPresident({ name: '', password: '' });
              await reload();
            } catch (err) {
              setError(err.response?.data?.message || 'Could not create hall president.');
            } finally {
              setPresidentBusy(false);
            }
          }}
        >
          <input className="input" placeholder="Hidden president name" value={president.name} onChange={(e) => setPresident((prev) => ({ ...prev, name: e.target.value }))} required />
          <input className="input" placeholder="Password (blank = generate)" value={president.password} onChange={(e) => setPresident((prev) => ({ ...prev, password: e.target.value }))} autoComplete="off" />
          <button className="rounded-full bg-[#2563eb] text-white text-xs font-semibold px-4 py-1.5" disabled={presidentBusy}>
            {presidentBusy ? 'Saving…' : 'Create hidden president'}
          </button>
        </form>
      </Panel>

      <Panel title="Uploaded Excel files" className="mt-4">
        <ul className="space-y-3">
          {(data.uploads || []).map((file) => (
            <li key={file._id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {file.originalFileName}
                <span className="text-slate-400"> · {new Date(file.createdAt).toLocaleDateString()}</span>
              </span>
              <button
                className="rounded-full bg-[#2563eb] text-white text-xs font-semibold px-4 py-1.5"
                disabled={busy === file._id}
                onClick={() => downloadUpload(file)}
              >
                {busy === file._id ? 'Downloading…' : 'Download'}
              </button>
            </li>
          ))}
          {!(data.uploads || []).length && (
            <li className="text-slate-400">No original Excel files stored for this hall yet.</li>
          )}
        </ul>
      </Panel>
    </div>
  );
}

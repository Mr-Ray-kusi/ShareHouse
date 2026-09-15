import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import api, { downloadFile } from '../../api/client';
import { MetricCard, PageIntro, Panel } from '../../components/super/SuperCharts';
import { BadgeCheck, Coins, Package } from 'lucide-react';

export default function TenantDetail() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const { reload } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmId, setConfirmId] = useState('');

  useEffect(() => {
    api
      .get(`/api/super/tenants/${tenantId}`)
      .then(({ data: d }) => setData(d))
      .catch((err) => setError(err.response?.data?.message || 'Not found.'));
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

  async function sendReset() {
    setResetBusy(true);
    setError('');
    setNotice('');
    try {
      const { data: d } = await api.post(`/api/super/tenants/${tenantId}/password-reset`, {}, { timeout: 30000 });
      setNotice(d.message || 'Password reset email sent.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send the reset email.');
    } finally {
      setResetBusy(false);
    }
  }

  async function deleteAccount() {
    if (confirmId.trim() !== tenantId) return;
    const kind = data?.tenant?.subscriptionPlan === 'src' ? 'SRC' : 'hall';
    const ok = window.confirm(`Permanently delete this ${kind} account? This cannot be undone.`);
    if (!ok) return;
    setDeleteBusy(true);
    setError('');
    try {
      await api.delete(`/api/super/tenants/${tenantId}`, { timeout: 120000 });
      if (reload) await reload().catch(() => {});
      navigate('/super/halls', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete this account.');
      setDeleteBusy(false);
    }
  }

  if (error && !data) return <p className="text-rose-600">{error}</p>;
  if (!data) return <p className="text-slate-400">Loading…</p>;

  const t = data.tenant;
  const kind = t.subscriptionPlan === 'src' ? 'SRC' : 'Hall';
  const canDelete = confirmId.trim() === t.tenantId;

  return (
    <div>
      <Link to="/super/halls" className="text-sm text-[#2563eb] font-medium">← Registered Halls</Link>
      <PageIntro kicker={t.schoolName} title={t.name} subtitle={`${t.adminName} · ${t.adminEmail}`} />
      <div className="mb-4">
        <button
          className="rounded-full bg-[#2563eb] text-white text-xs font-semibold px-4 py-1.5 disabled:opacity-50"
          disabled={statusBusy || (!t.isActive && !t.lastPaymentAt)}
          onClick={() => setActive(!t.isActive)}
        >
          {statusBusy ? 'Saving…' : t.isActive ? 'Deactivate login' : 'Approve login'}
        </button>
      </div>
      {notice && <p className="text-sm text-emerald-700 mb-4">{notice}</p>}
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
      <Panel title="Password reset" className="mt-4">
        <p className="text-sm text-slate-500">
          Send a reset link to the email used when this {kind.toLowerCase()} account was created.
        </p>
        <p className="mt-2 text-sm font-medium">{t.adminEmail}</p>
        <button
          className="mt-4 rounded-full bg-[#2563eb] text-white text-xs font-semibold px-4 py-1.5 disabled:opacity-50"
          disabled={resetBusy || !t.adminEmail}
          onClick={sendReset}
        >
          {resetBusy ? 'Sending…' : 'Send reset email'}
        </button>
      </Panel>
      <Panel title={`Delete ${kind.toLowerCase()} account`} className="mt-4">
        <p className="text-sm text-slate-500">
          Permanently remove this {kind.toLowerCase()}, its president and assistant logins, lists, and collection history. This cannot be undone.
        </p>
        <label className="block mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Type {t.tenantId} to confirm
        </label>
        <input
          className="mt-1 w-full max-w-md rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
          value={confirmId}
          onChange={(e) => setConfirmId(e.target.value)}
          autoComplete="off"
        />
        <button
          className="mt-4 rounded-full bg-rose-600 text-white text-xs font-semibold px-4 py-1.5 disabled:opacity-50"
          disabled={!canDelete || deleteBusy}
          onClick={deleteAccount}
        >
          {deleteBusy ? 'Deleting…' : `Delete ${kind.toLowerCase()} permanently`}
        </button>
      </Panel>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { downloadFile } from '../../api/client';
import { MetricCard, PageIntro, Panel } from '../../components/super/SuperCharts';
import { BadgeCheck, Coins, Package } from 'lucide-react';

export default function TenantDetail() {
  const { tenantId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

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

  if (error && !data) return <p className="text-rose-600">{error}</p>;
  if (!data) return <p className="text-slate-400">Loading…</p>;

  const t = data.tenant;

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
    </div>
  );
}

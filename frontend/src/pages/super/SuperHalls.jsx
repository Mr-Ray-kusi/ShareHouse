import { useMemo } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../../api/client';
import { PageIntro, Panel } from '../../components/super/SuperCharts';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

export default function SuperHalls() {
  const { analysis, search, reload, busy, setBusy, setError } = useOutletContext();
  const tenants = analysis?.tenants || [];
  const q = String(search || '').trim().toLowerCase();
  const rows = useMemo(
    () => tenants.filter((t) => {
      if (!q) return true;
      return [t.name, t.schoolName, t.tenantId, t.adminEmail].join(' ').toLowerCase().includes(q);
    }),
    [tenants, q]
  );

  async function toggle(tenant, isActive) {
    setBusy(tenant.tenantId);
    try {
      await api.patch(`/api/super/tenants/${tenant.tenantId}/status`, { isActive });
      await reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <PageIntro
        kicker="Halls"
        title="Registered Halls"
        subtitle="Approve a hall after Paystack payment to turn on its login. Super admin does not enter live desks, distributions, or assistant tables."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="desk-card p-4">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-2xl font-semibold mt-1">{analysis?.kpis?.totalTenants ?? tenants.length}</p>
        </div>
        <div className="desk-card p-4">
          <p className="text-sm text-slate-500">Active</p>
          <p className="text-2xl font-semibold mt-1">{analysis?.kpis?.active ?? 0}</p>
        </div>
        <div className="desk-card p-4">
          <p className="text-sm text-slate-500">Expired</p>
          <p className="text-2xl font-semibold mt-1">{analysis?.kpis?.expired ?? 0}</p>
        </div>
        <div className="desk-card p-4 bg-[#2563eb] text-white">
          <p className="text-sm text-white/80">Revenue</p>
          <p className="text-2xl font-semibold mt-1">GHS {analysis?.kpis?.revenue ?? 0}</p>
        </div>
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <tr>
                <th className="pb-3 pr-3">Hall</th>
                <th className="pb-3 pr-3">Plan</th>
                <th className="pb-3 pr-3">Status</th>
                <th className="pb-3 pr-3">Expiry</th>
                <th className="pb-3 pr-3">Fee</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const expired = t.expiryDate && new Date(t.expiryDate) < new Date();
                const paid = Boolean(t.lastPaymentAt);
                const status = !paid
                  ? 'Awaiting payment'
                  : t.isActive
                    ? (expired ? 'Expired' : 'Active')
                    : 'Awaiting approval';
                return (
                  <tr key={t.tenantId} className="border-b border-slate-50">
                    <td className="py-3 pr-3">
                      <Link to={`/super/tenants/${t.tenantId}`} className="font-semibold hover:text-[#2563eb]">{t.name}</Link>
                      <p className="text-xs text-slate-400">{t.schoolName} · {t.tenantId}</p>
                    </td>
                    <td className="py-3 pr-3 capitalize">{t.subscriptionPlan}</td>
                    <td className="py-3 pr-3">{status}</td>
                    <td className="py-3 pr-3">{fmtDate(t.expiryDate)}</td>
                    <td className="py-3 pr-3">{t.subscriptionFee}</td>
                    <td className="py-3 text-right">
                      <button
                        className="rounded-full px-3 py-1.5 text-xs font-semibold border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                        disabled={busy === t.tenantId || (!t.isActive && !paid)}
                        title={!paid ? 'Hall must pay with Paystack before approval' : ''}
                        onClick={() => toggle(t, !t.isActive)}
                      >
                        {t.isActive ? 'Deactivate' : 'Approve login'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-6 text-slate-400">No halls match that search.</p>}
        </div>
      </Panel>
    </div>
  );
}

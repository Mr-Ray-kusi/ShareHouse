import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ExceptionPanel from '../../components/ExceptionPanel';
import HallHero from '../../components/HallHero';

function checkoutUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:'
      && (url.hostname === 'paystack.com' || url.hostname.endsWith('.paystack.com'))
    ) return url.href;
  } catch {
    return '';
  }
  return '';
}

function exceptionBase(group) {
  return group.own ? '/api/exceptions' : `/api/src/halls/${group.tenantId}/exceptions`;
}

export default function SrcWalkIns() {
  const { tenant } = useAuth();
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data: srcData } = await api.get('/api/src/halls');
    const hallGroups = await Promise.all((srcData.halls || [])
      .filter((hall) => hall.campaign?.id)
      .map(async (hall) => {
        const base = `/api/src/halls/${hall.tenantId}/exceptions`;
        const params = { distributionId: hall.campaign.id };
        const [{ data: exceptionData }, { data: paymentData }] = await Promise.all([
          api.get(base, { params }),
          api.get(`${base}/payment`, { params }),
        ]);
        return {
          key: hall.tenantId,
          tenantId: hall.tenantId,
          name: hall.name,
          distribution: exceptionData.distribution,
          exceptions: exceptionData.exceptions || [],
          payment: paymentData.payment,
          own: false,
        };
      }));

    const [{ data: ownData }, { data: ownPaymentData }] = await Promise.all([
      api.get('/api/exceptions'),
      api.get('/api/exceptions/payment'),
    ]);
    const ownGroup = ownData.distribution
      ? [{
        key: tenant?.tenantId || 'src',
        tenantId: tenant?.tenantId,
        name: tenant?.name || 'SRC campaign',
        distribution: ownData.distribution,
        exceptions: ownData.exceptions || [],
        payment: ownPaymentData.payment,
        own: true,
      }]
      : [];
    const nextGroups = [...ownGroup, ...hallGroups];
    setGroups(nextGroups);
    setSelected((current) => Object.fromEntries(
      Object.entries(current).map(([key, ids]) => {
        const group = nextGroups.find((item) => item.key === key);
        const waiting = new Set(
          (group?.exceptions || [])
            .filter((row) => row.status === 'pending')
            .map((row) => row.id)
        );
        return [key, ids.filter((id) => waiting.has(id))];
      })
    ));
  }, [tenant?.name, tenant?.tenantId]);

  useEffect(() => {
    if (tenant && tenant.subscriptionPlan !== 'src') return undefined;
    load().catch((err) => setError(err.response?.data?.message || 'Could not load student additions.'));
    return undefined;
  }, [load, tenant?.subscriptionPlan]);

  if (tenant && tenant.subscriptionPlan !== 'src') return <Navigate to="/app" replace />;

  function toggleSelection(group, row) {
    setSelected((current) => {
      const ids = current[group.key] || [];
      return {
        ...current,
        [group.key]: ids.includes(row.id) ? ids.filter((id) => id !== row.id) : [...ids, row.id],
      };
    });
  }

  async function paySelected(group) {
    const waiting = new Set(
      group.exceptions.filter((row) => row.status === 'pending').map((row) => row.id)
    );
    const ids = (selected[group.key] || []).filter((id) => waiting.has(id));
    if (!ids.length) return;
    setBusy(group.key);
    setError('');
    try {
      const { data } = await api.post(`${exceptionBase(group)}/payment`, {
        distributionId: group.distribution.id,
        exceptionIds: ids,
      });
      const url = checkoutUrl(data.payment?.authorization_url);
      if (!url) throw new Error('Paystack did not return a valid checkout link. Refresh and retry.');
      window.location.assign(url);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not start the student-addition payment.');
      load().catch((loadErr) => setError(loadErr.response?.data?.message || 'Could not refresh student additions.'));
    } finally {
      setBusy('');
    }
  }

  async function reject(group, row) {
    const note = window.prompt('Reason for rejecting this request?', 'Not eligible');
    if (note === null) return;
    setBusy(row.id);
    setError('');
    try {
      const endpoint = group.own
        ? `${exceptionBase(group)}/${row.id}/review`
        : `/api/src/halls/${group.tenantId}/exceptions/${row.id}/review`;
      await api.post(endpoint, { action: 'reject', note: note || 'Rejected' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reject this request.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · SRC`}
        title="Student additions"
        subtitle="Review walk-in requests and pay only for selected new students. After payment, they are added to their hall's active list automatically."
      />
      <div className="card mt-4 p-4 text-sm">
        <p className="font-semibold">Incremental billing: GHS 0.05 per selected new student.</p>
        <p className="mt-1 text-ink/65">
          Students already covered by the campaign payment are not charged again. A request appears on the hall's general list only after Paystack confirms payment.
        </p>
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {!groups.length && !error ? (
        <p className="mt-5 text-sm text-ink/60">
          No active hall campaigns or student requests are available yet. Check <Link className="font-semibold text-forest-700" to="/app/halls">Campus halls</Link> for linked halls.
        </p>
      ) : null}
      <div className="mt-5 space-y-5">
        {groups.map((group) => {
          const waiting = group.exceptions.filter((row) => row.status === 'pending');
          const selectedCount = (selected[group.key] || []).filter((id) => (
            waiting.some((row) => row.id === id)
          )).length;
          const amount = (selectedCount * 5 / 100).toFixed(2);
          const active = group.distribution?.status === 'active';
          const pendingPayment = group.payment?.status === 'pending';
          const continueUrl = checkoutUrl(group.payment?.authorizationUrl);
          const base = exceptionBase(group);

          return (
            <section key={group.key} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl">{group.name}</p>
                  <p className="mt-1 text-xs text-ink/55">
                    {group.distribution?.title || 'Campaign'}
                    {' · '}
                    {group.exceptions.length} request{group.exceptions.length === 1 ? '' : 's'}
                  </p>
                </div>
                {pendingPayment ? (
                  continueUrl ? (
                    <a className="btn-primary" href={continueUrl}>Continue pending payment</a>
                  ) : (
                    <span className="text-sm text-ink/60">Payment is initializing. Refresh shortly.</span>
                  )
                ) : null}
              </div>

              {group.exceptions.length ? (
                <div className="mt-4">
                  <ExceptionPanel
                    items={group.exceptions}
                    canReview={false}
                    canReject
                    photoBase={base}
                    busyId={busy}
                    locked={Boolean(busy) || pendingPayment}
                    selectedIds={selected[group.key] || []}
                    onSelect={(row) => toggleSelection(group, row)}
                    onReject={(row) => reject(group, row)}
                  />
                </div>
              ) : (
                <p className="mt-4 text-sm text-ink/55">No student additions for this campaign.</p>
              )}

              {waiting.length ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-forest-100 pt-4">
                  <p className="text-sm">
                    Selected: <strong>{selectedCount}</strong>
                    {' · '}
                    Pay: <strong>GHS {amount}</strong>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={!waiting.length || Boolean(busy) || pendingPayment}
                      onClick={() => setSelected((current) => ({
                        ...current,
                        [group.key]: waiting.map((row) => row.id),
                      }))}
                    >
                      Select all waiting
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!active || !selectedCount || Boolean(busy) || pendingPayment}
                      onClick={() => paySelected(group)}
                    >
                      {busy === group.key ? 'Preparing payment…' : `Pay & add ${selectedCount || ''}`}
                    </button>
                  </div>
                </div>
              ) : null}
              {!active && waiting.length ? (
                <p className="mt-2 text-xs text-amber-800">This campaign is not active, so new-student payments cannot be started.</p>
              ) : null}

            </section>
          );
        })}
      </div>
    </div>
  );
}

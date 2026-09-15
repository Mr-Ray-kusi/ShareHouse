import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';

export default function SrcHalls() {
  const { tenant } = useAuth();
  const [halls, setHalls] = useState([]);
  const [srcId, setSrcId] = useState(tenant?.tenantId || '');
  const [error, setError] = useState('');

  useEffect(() => {
    if (tenant && tenant.subscriptionPlan !== 'src') return undefined;
    api
      .get('/api/src/halls')
      .then(({ data }) => {
        setHalls(data.halls || []);
        setSrcId(data.srcId || tenant?.tenantId || '');
      })
      .catch((err) => setError(err.response?.data?.message || 'Could not load campus halls.'));
  }, [tenant?.tenantId, tenant?.subscriptionPlan]);

  if (tenant && tenant.subscriptionPlan !== 'src') {
    return <Navigate to="/app" replace />;
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · SRC`}
        title="Campus halls"
        subtitle="Monitor sharing campaigns. Hall presidents approve students. SRC cannot approve walk-ins."
      />
      <div className="card p-5">
        <p className="text-xs uppercase tracking-widest text-forest-700">SRC ID for hall registration</p>
        <p className="mt-2 font-mono text-lg break-all">{srcId || '—'}</p>
        <p className="text-sm text-ink/60 mt-1">Halls at this school appear here. They can also enter this ID when they register.</p>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {halls.map((hall) => {
          const campaign = hall.campaign;
          return (
            <Link key={hall.tenantId} to={`/app/halls/${hall.tenantId}`} className="card p-5 hover:bg-mist/80">
              <p className="font-semibold">{hall.name}</p>
              <p className="text-xs text-ink/60 mt-1">{hall.schoolName} · {hall.tenantId}</p>
              {campaign ? (
                <p className="text-sm mt-3">
                  {campaign.title}
                  {' · '}
                  {campaign.received}/{campaign.total} received
                  {campaign.pendingExceptions ? ` · ${campaign.pendingExceptions} walk-in${campaign.pendingExceptions === 1 ? '' : 's'} waiting` : ''}
                </p>
              ) : (
                <p className="text-sm text-ink/55 mt-3">No sharing campaign yet.</p>
              )}
              <div className="h-2 bg-forest-100 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-forest-600" style={{ width: `${campaign?.percent || 0}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
      {!halls.length && !error && (
        <p className="mt-6 text-sm text-ink/55">No halls under this SRC yet. Halls register with the same school name, or with this SRC ID.</p>
      )}
    </div>
  );
}

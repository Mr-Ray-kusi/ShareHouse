import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Paywall() {
  const { tenant, logout } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/api/payments/initialize');
      const url = data.payment?.authorization_url;
      if (url) window.location.href = url;
      else setError('Paystack did not return a checkout URL. Check API keys.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start payment.');
      setBusy(false);
    }
  }

  const expired = tenant?.expiryDate && new Date(tenant.expiryDate) < new Date() && tenant?.isActive;

  return (
    <div className="min-h-screen grain">
      <div className="kente-bar" />
      <div className="max-w-lg mx-auto px-4 py-16">
        <h1 className="font-display text-4xl">{expired ? 'Year ended' : 'Activate this hall'}</h1>
        <p className="mt-3 text-ink/70">
          {tenant?.name} · {tenant?.schoolName}. {expired ? 'Renew to reopen the desk.' : 'Complete Paystack payment to turn on distributions, Excel upload, and assistant links.'}
        </p>
        <div className="card p-6 mt-8">
          <p className="text-sm uppercase tracking-widest text-forest-700">{tenant?.subscriptionPlan} plan</p>
          <p className="font-display text-5xl mt-2">GHS {tenant?.subscriptionFee || '—'}</p>
          {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
          <button className="btn-primary w-full mt-6" onClick={pay} disabled={busy}>
            {busy ? 'Redirecting…' : 'Pay with Paystack'}
          </button>
        </div>
        <div className="mt-6 flex gap-4 text-sm">
          <Link to="/login" onClick={logout} className="text-forest-700">Use another account</Link>
        </div>
      </div>
    </div>
  );
}

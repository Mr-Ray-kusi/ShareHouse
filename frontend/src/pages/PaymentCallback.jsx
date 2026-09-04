import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function PaymentCallback() {
  const [params] = useSearchParams();
  const { refreshMe, user } = useAuth();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('Confirming Paystack payment…');

  useEffect(() => {
    const reference = params.get('reference') || params.get('trxref');
    async function run() {
      try {
        if (reference) {
          await api.get('/api/payments/verify', { params: { reference } });
        }
        await refreshMe();
        setStatus('ok');
        setMessage('Subscription is active for one year.');
      } catch (err) {
        setStatus('err');
        setMessage(err.response?.data?.message || 'Could not verify payment. If you were charged, wait a moment — the webhook may still activate the hall.');
      }
    }
    run();
  }, []);

  return (
    <div className="min-h-screen grain grid place-items-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        <p className="text-xs uppercase tracking-widest text-forest-700">Paystack</p>
        <h1 className="font-display text-3xl mt-2">{status === 'ok' ? 'Hall activated' : status === 'err' ? 'Payment check' : 'Working…'}</h1>
        <p className="mt-3 text-sm text-ink/70">{message}</p>
        <div className="mt-6">
          {user ? (
            <Link to="/app" className="btn-primary">Open hall desk</Link>
          ) : (
            <Link to="/login" className="btn-primary">Sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}

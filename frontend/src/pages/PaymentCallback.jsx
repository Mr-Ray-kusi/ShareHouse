import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function PaymentCallback() {
  const [params] = useSearchParams();
  const { refreshMe, user } = useAuth();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('Confirming campaign payment…');
  const [distributionId, setDistributionId] = useState(params.get('distribution') || '');

  useEffect(() => {
    const reference = params.get('reference') || params.get('trxref');
    async function run() {
      try {
        if (!reference) throw new Error('Paystack did not return a payment reference.');
        const { data } = await api.get('/api/payments/verify', { params: { reference } });
        if (data.distribution?._id) setDistributionId(String(data.distribution._id));
        setMessage(data.message || 'Payment confirmed. The campaign is now active.');
        try {
          await refreshMe();
        } catch {
          /* A paid campaign remains active even if the session has expired. */
        }
        setStatus('ok');
      } catch (err) {
        setStatus('err');
        setMessage(err.response?.data?.message || err.message || 'Could not verify payment. If you were charged, wait a moment and try again.');
      }
    }
    run();
  }, []);

  return (
    <div className="min-h-screen grain grid place-items-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        <p className="text-xs uppercase tracking-widest text-forest-700">Paystack</p>
        <h1 className="font-display text-3xl mt-2">
          {status === 'ok' ? 'Campaign payment confirmed' : status === 'err' ? 'Payment check' : 'Working…'}
        </h1>
        <p className="mt-3 text-sm text-ink/70">{message}</p>
        <div className="mt-6">
          {user && status === 'ok' ? (
            <Link to={distributionId ? `/app/distributions/${distributionId}` : '/app'} className="btn-primary">Open campaign</Link>
          ) : (
            <Link to="/login" className="btn-primary">Back to sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function PaymentCallback() {
  const [params] = useSearchParams();
  const { refreshMe, user } = useAuth();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('Confirming Paystack payment…');
  const [pendingApproval, setPendingApproval] = useState(false);

  useEffect(() => {
    const reference = params.get('reference') || params.get('trxref');
    async function run() {
      try {
        let pending = false;
        if (reference) {
          const { data } = await api.get('/api/payments/verify', { params: { reference } });
          pending = Boolean(data.pendingApproval);
          setMessage(
            data.message
            || (pending
              ? 'Payment received. A system admin must approve this hall before you can sign in.'
              : 'Payment confirmed.')
          );
        }
        try {
          await refreshMe();
        } catch {
          /* new halls stay signed out until a system admin approves */
        }
        setPendingApproval(pending);
        setStatus('ok');
      } catch (err) {
        setStatus('err');
        setMessage(err.response?.data?.message || 'Could not verify payment. If you were charged, wait a moment — the webhook may still record the payment.');
      }
    }
    run();
  }, []);

  return (
    <div className="min-h-screen grain grid place-items-center px-4">
      <div className="card max-w-md w-full p-8 text-center">
        <p className="text-xs uppercase tracking-widest text-forest-700">Paystack</p>
        <h1 className="font-display text-3xl mt-2">
          {status === 'ok' ? (pendingApproval || !user ? 'Payment received' : 'Hall activated') : status === 'err' ? 'Payment check' : 'Working…'}
        </h1>
        <p className="mt-3 text-sm text-ink/70">{message}</p>
        <div className="mt-6">
          {user && !pendingApproval ? (
            <Link to="/app" className="btn-primary">Open hall desk</Link>
          ) : (
            <Link to="/login" className="btn-primary">Back to sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}

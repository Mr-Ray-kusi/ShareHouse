import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import AuthScreen from '../components/AuthScreen';
import PasswordField from '../components/PasswordField';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <h1 className="font-display text-3xl md:text-4xl">Choose a new password</h1>
      <p className="mt-1 text-sm text-ink/70">Use the link from the email sent to the address used when this hall or SRC was registered.</p>
      {!token ? (
        <p className="mt-6 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          This reset link is missing. Ask the ShareHouse operator to send a new email.
        </p>
      ) : done ? (
        <p className="mt-6 text-sm">
          Password updated.{' '}
          <Link to="/login" className="font-semibold text-forest-700">Sign in</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div>
            <label className="label">New password</label>
            <PasswordField
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <PasswordField
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <button className="btn-primary w-full sm:w-auto sm:px-10" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}
    </AuthScreen>
  );
}

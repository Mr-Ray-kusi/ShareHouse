import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../components/AuthScreen';
import PasswordField from '../components/PasswordField';

function homeFor(role) {
  if (role === 'super_admin') return '/super/health';
  if (role === 'assistant') return '/collect';
  return '/app';
}

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await login(email, password);
      const from = location.state?.from?.pathname;
      navigate(from || homeFor(data.user.role), { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AuthScreen>
        <p className="text-ink/70">Loading ShareHouse…</p>
      </AuthScreen>
    );
  }

  if (user) {
    const from = location.state?.from?.pathname;
    return <Navigate to={from || homeFor(user.role)} replace />;
  }

  return (
    <AuthScreen>
      <h1 className="font-display text-3xl md:text-4xl">Sign in to your desk</h1>
      <p className="mt-1 text-sm text-ink/70">Hall presidents, SRC officers, and the ShareHouse operator.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <PasswordField
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>
        <button className="btn-primary w-full sm:w-auto sm:px-10" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        New hall? <Link to="/register" className="font-semibold text-forest-700">Register and pay</Link>
      </p>
    </AuthScreen>
  );
}

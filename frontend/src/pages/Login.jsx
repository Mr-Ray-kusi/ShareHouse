import { useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../utils/homeFor';
import AuthScreen from '../components/AuthScreen';
import PasswordField from '../components/PasswordField';

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [desk, setDesk] = useState('hall_admin');
  const [email, setEmail] = useState('');
  const [hall, setHall] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = desk === 'tenant_admin'
        ? { desk, hall, name, password }
        : { desk, email, password };
      const data = await login(payload);
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
      <p className="mt-1 text-sm text-ink/70">Choose hall administrator or hall president. Operators use the administrator form.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDesk('hall_admin')}
            className={`rounded-xl border px-3 py-3 text-left ${desk === 'hall_admin' ? 'border-forest-600 bg-forest-50' : 'border-forest-100'}`}
          >
            <p className="font-semibold">Hall administrator</p>
            <p className="text-xs text-ink/60">Lodge, rooms, porters, and president logins</p>
          </button>
          <button
            type="button"
            onClick={() => setDesk('tenant_admin')}
            className={`rounded-xl border px-3 py-3 text-left ${desk === 'tenant_admin' ? 'border-forest-600 bg-forest-50' : 'border-forest-100'}`}
          >
            <p className="font-semibold">Hall president</p>
            <p className="text-xs text-ink/60">Sharing desk, lists, and assistants</p>
          </button>
        </div>
        {desk === 'tenant_admin' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Hall ID</label>
              <input
                className="input"
                autoComplete="off"
                placeholder="Hall ID from hall administration"
                value={hall}
                onChange={(e) => setHall(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">President name</label>
              <input
                className="input"
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Password</label>
              <PasswordField
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
        ) : (
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
        )}
        <button className="btn-primary w-full sm:w-auto sm:px-10" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Porters use the lodge join link. Assistants use the hall join link.
      </p>
      <p className="mt-2 text-sm">
        New hall? <Link to="/register" className="font-semibold text-forest-700">Register as hall administrator and pay</Link>
      </p>
    </AuthScreen>
  );
}

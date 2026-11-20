import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../components/AuthScreen';
import PasswordField from '../components/PasswordField';

const empty = {
  name: '',
  schoolName: '',
  adminName: '',
  adminEmail: '',
  adminPhone: '',
  password: '',
  subscriptionPlan: 'src',
};

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
      navigate('/app/distributions', { replace: true });
    } catch (err) {
      const apiMessage = typeof err.response?.data?.message === 'string' ? err.response.data.message : '';
      if (apiMessage) setError(apiMessage);
      else if (err.response?.status === 405) {
        setError('Signup did not reach the API. Wait for a fresh deploy, then try again.');
      } else if (err.request && !err.response) {
        setError('Could not reach the API. Check that FRONTEND_URL on Render matches this site exactly (no trailing slash).');
      } else {
        setError(err.message || 'Registration failed.');
      }
      setBusy(false);
    }
  }

  return (
    <AuthScreen>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl md:text-4xl">Create an SRC account</h1>
          <p className="mt-1 text-sm text-ink/70">Pay GHS 0.05 per student when activating a campaign.</p>
        </div>
        <p className="text-sm">
          Already registered? <Link to="/login" className="font-semibold text-forest-700">Sign in</Link>
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">SRC name</label>
            <input className="input" placeholder="KNUST SRC" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div>
            <label className="label">School</label>
            <input className="input" placeholder="KNUST" value={form.schoolName} onChange={(e) => set('schoolName', e.target.value)} required />
          </div>
          <div>
            <label className="label">SRC officer name</label>
            <input className="input" value={form.adminName} onChange={(e) => set('adminName', e.target.value)} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} required />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.adminPhone} onChange={(e) => set('adminPhone', e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <PasswordField minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} required />
          </div>
        </div>
        <button className="btn-primary w-full md:w-auto md:px-10" disabled={busy}>{busy ? 'Creating account…' : 'Create SRC account'}</button>
      </form>
    </AuthScreen>
  );
}

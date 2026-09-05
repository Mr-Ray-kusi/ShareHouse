import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthScreen from '../components/AuthScreen';

const empty = {
  name: '',
  schoolName: '',
  adminName: '',
  adminEmail: '',
  adminPhone: '',
  password: '',
  subscriptionPlan: 'hall',
};

export default function Register() {
  const { register } = useAuth();
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
      const data = await register(form);
      const url = data.payment?.authorization_url;
      if (!url) {
        setError(data.paymentError || 'Paystack did not return a checkout URL. Check the API keys.');
        setBusy(false);
        return;
      }
      window.location.href = url;
    } catch (err) {
      const apiMessage = err.response?.data?.message;
      if (apiMessage) setError(apiMessage);
      else if (err.request && !err.response) {
        setError('Could not reach the API. Check VITE_API_URL and that FRONTEND_URL on Render matches this site exactly (no trailing slash).');
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
          <h1 className="font-display text-3xl md:text-4xl">Start New</h1>
          <p className="mt-1 text-sm text-ink/70">Register a hall or SRC. Paystack payment is required, then a system admin must approve your login.</p>
        </div>
        <p className="text-sm">
          Already registered? <Link to="/login" className="font-semibold text-forest-700">Sign in</Link>
        </p>
      </div>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => set('subscriptionPlan', 'hall')} className={`rounded-xl border px-3 py-3 text-left ${form.subscriptionPlan === 'hall' ? 'border-forest-600 bg-forest-50' : 'border-forest-100'}`}>
            <p className="font-semibold">Hall · GHS 500</p>
            <p className="text-xs text-ink/60">Single hall welfare desk</p>
          </button>
          <button type="button" onClick={() => set('subscriptionPlan', 'src')} className={`rounded-xl border px-3 py-3 text-left ${form.subscriptionPlan === 'src' ? 'border-gold-500 bg-gold-400/10' : 'border-forest-100'}`}>
            <p className="font-semibold">SRC · GHS 1,500</p>
            <p className="text-xs text-ink/60">Campus-wide desk</p>
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Hall / SRC name</label>
            <input className="input" placeholder="Atlantic Hall" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div>
            <label className="label">School</label>
            <input className="input" placeholder="KNUST" value={form.schoolName} onChange={(e) => set('schoolName', e.target.value)} required />
          </div>
          <div>
            <label className="label">President name</label>
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
            <input className="input" type="password" minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} required />
          </div>
        </div>
        <button className="btn-primary w-full md:w-auto md:px-10" disabled={busy}>{busy ? 'Opening Paystack…' : 'Continue to payment'}</button>
      </form>
    </AuthScreen>
  );
}

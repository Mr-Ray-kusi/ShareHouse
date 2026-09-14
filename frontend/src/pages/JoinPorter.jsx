import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function JoinPorter() {
  const { code } = useParams();
  const { joinPorter } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/api/auth/lodge-join/${code}`)
      .then(({ data }) => setInvite(data.invite))
      .catch((err) => setError(err.response?.data?.message || 'Lodge invite not found.'));
  }, [code]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await joinPorter(code, name, password);
      navigate('/lodge/desk');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not join the lodge.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-cream">
      <div className="kente-bar" />
      <div className="max-w-md mx-auto px-4 py-16">
        <p className="text-xs uppercase tracking-[0.22em] text-gold-400">Porter access</p>
        <h1 className="font-display text-4xl mt-3">Join the porter lodge</h1>
        <p className="text-cream/70 mt-2 text-sm">
          {invite?.hallName || 'Hall'} {invite?.schoolName ? `· ${invite.schoolName}` : ''}
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6">
          {error && <p className="text-sm text-red-200">{error}</p>}
          <div>
            <label className="label text-cream/70">Your name</label>
            <input
              className="input bg-white text-ink"
              placeholder="The name saved for you on the lodge list"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label text-cream/70">Your porter password</label>
            <input
              className="input bg-white text-ink"
              type="password"
              placeholder="Enter the password given to you"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn-gold w-full" disabled={busy}>{busy ? 'Opening…' : 'Enter lodge'}</button>
        </form>
        <p className="text-xs text-cream/40 mt-6">Use the porter name hall administration saved, with your own password.</p>
        <Link to="/" className="text-cream/50 text-sm mt-4 inline-block">Back to ShareHouse</Link>
      </div>
    </div>
  );
}

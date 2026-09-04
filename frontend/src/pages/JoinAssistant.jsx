import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function JoinAssistant() {
  const { code } = useParams();
  const { joinAssistant } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get(`/api/auth/join/${code}`)
      .then(({ data }) => setInvite(data.invite))
      .catch((err) => setError(err.response?.data?.message || 'Invite not found.'));
  }, [code]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await joinAssistant(code, name, password);
      navigate('/collect');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not join.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-cream">
      <div className="kente-bar" />
      <div className="max-w-md mx-auto px-4 py-16">
        <p className="text-xs uppercase tracking-[0.22em] text-gold-400">Assistant access</p>
        <h1 className="font-display text-4xl mt-3">Join the collection table</h1>
        <p className="text-cream/70 mt-2 text-sm">
          {invite?.hallName || 'Hall'} {invite?.schoolName ? `· ${invite.schoolName}` : ''}
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4 bg-white/5 border border-white/10 rounded-2xl p-6">
          {error && <p className="text-sm text-red-200">{error}</p>}
          <div>
            <label className="label text-cream/70">Your name</label>
            <input
              className="input bg-white text-ink"
              placeholder="The name saved for you on the hall list"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label text-cream/70">Your assistant password</label>
            <input
              className="input bg-white text-ink"
              type="password"
              placeholder="Enter the password given to you"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn-gold w-full" disabled={busy}>{busy ? 'Opening…' : 'Enter collection'}</button>
        </form>
        <p className="text-xs text-cream/40 mt-6">Use the assistant name the president saved, with your own password. A name and password from two different people will not work.</p>
        <Link to="/" className="text-cream/50 text-sm mt-4 inline-block">Back to WelfareShare</Link>
      </div>
    </div>
  );
}

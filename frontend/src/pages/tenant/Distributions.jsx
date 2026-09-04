import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';

export default function Distributions() {
  const { tenant, supportMode } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [itemName, setItemName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await api.get('/api/distributions');
    setItems(data.distributions || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load distributions.'));
  }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/api/distributions', { title, itemName });
      setTitle('');
      setItemName('');
      navigate(`/app/distributions/${data.distribution._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create distribution.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · /${tenant?.tenantId || ''}`}
        title="Distributions"
        subtitle="One active sharing event at a time. Activating a new one completes the previous."
      />

      {!supportMode && (
        <form onSubmit={create} className="card p-5 mt-6 grid md:grid-cols-[1fr_1fr_auto] gap-3">
          <input className="input" placeholder="Christmas Rice Sharing" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input className="input" placeholder="Item (e.g. 5kg rice)" value={itemName} onChange={(e) => setItemName(e.target.value)} />
          <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
        </form>
      )}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

      <div className="mt-6 space-y-3">
        {items.map((d) => (
          <Link key={d._id} to={`/app/distributions/${d._id}`} className="card p-4 flex items-center justify-between hover:border-forest-300">
            <div>
              <p className="font-semibold">{d.title}</p>
              <p className="text-xs text-ink/60">{d.itemName || 'Welfare item'} · {d.beneficiaryCount} students · {d.receivedCount} received</p>
            </div>
            <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-lg ${
              d.status === 'active' ? 'bg-forest-100 text-forest-800' : 'bg-mist text-ink/70'
            }`}>{d.status}</span>
          </Link>
        ))}
        {items.length === 0 && <p className="text-sm text-ink/60">No distributions yet.</p>}
      </div>
    </div>
  );
}

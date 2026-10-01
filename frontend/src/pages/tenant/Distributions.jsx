import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
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
  const [removingId, setRemovingId] = useState('');

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

  async function removeCompleted(dist) {
    const ok = window.confirm(
      `Remove “${dist.title}”? The student list and collection history for this completed campaign will be deleted.`
    );
    if (!ok) return;
    setRemovingId(dist._id);
    setError('');
    try {
      await api.delete(`/api/distributions/${dist._id}`, { timeout: 120000 });
      setItems((prev) => prev.filter((row) => row._id !== dist._id));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove that campaign.');
    } finally {
      setRemovingId('');
    }
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · /${tenant?.tenantId || ''}`}
        title="Distributions"
        subtitle="One active sharing event at a time. Activating a new one completes the previous. Completed campaigns can be removed."
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
          <div key={d._id} className="card p-4 flex items-center justify-between gap-3">
            <Link to={`/app/distributions/${d._id}`} className="min-w-0 flex-1 hover:opacity-80">
              <p className="font-semibold">{d.title}</p>
              <p className="text-xs text-ink/60">{d.itemName || 'Welfare item'} · {d.beneficiaryCount} students · {d.receivedCount} received</p>
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-lg ${
                d.status === 'active' ? 'bg-forest-100 text-forest-800' : 'bg-mist text-ink/70'
              }`}>{d.status}</span>
              {!supportMode && d.status === 'completed' ? (
                <button
                  type="button"
                  className="btn-ghost text-xs text-red-700"
                  disabled={removingId === d._id}
                  onClick={() => removeCompleted(d)}
                >
                  <Trash2 size={14} />
                  {removingId === d._id ? 'Removing…' : 'Remove'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-ink/60">No distributions yet.</p>}
      </div>
    </div>
  );
}

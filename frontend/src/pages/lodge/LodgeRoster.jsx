import { useEffect, useState } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function LodgeRoster() {
  const { tenant } = useAuth();
  const [date, setDate] = useState(today());
  const [porters, setPorters] = useState([]);
  const [morning, setMorning] = useState([]);
  const [evening, setEvening] = useState([]);
  const [handover, setHandover] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(nextDate = date) {
    const { data } = await api.get('/api/lodge/roster', { params: { date: nextDate } });
    setPorters(data.porters || []);
    setMorning(data.morningPorterIds || []);
    setEvening(data.eveningPorterIds || []);
    setHandover(data.handover || null);
  }

  useEffect(() => {
    load(date).catch((err) => setError(err.response?.data?.message || 'Could not load the roster.'));
  }, [date]);

  function toggle(list, setList, id) {
    setList((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/api/lodge/roster', {
        date,
        morningPorterIds: morning,
        eveningPorterIds: evening,
      });
      await load(date);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the roster.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.name || 'Hall'} · duty`}
        title="Morning / evening roster"
        subtitle="Events inherit this shift when the porter is signed in. Porters do not pick a shift at login."
      />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={save} className="card p-5 mt-6 space-y-5">
        <div>
          <label className="label">Date</label>
          <input className="input max-w-xs" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { title: 'Morning', list: morning, setList: setMorning, counts: handover ? `${handover.morningIn} in · ${handover.morningOut} out` : '' },
            { title: 'Evening', list: evening, setList: setEvening, counts: handover ? `${handover.eveningIn} in · ${handover.eveningOut} out` : '' },
          ].map((shift) => (
            <div key={shift.title}>
              <p className="font-semibold">{shift.title}</p>
              {shift.counts ? <p className="text-xs text-ink/55 mt-1">Handover today: {shift.counts}</p> : null}
              <div className="mt-3 space-y-2">
                {porters.map((porter) => (
                  <label key={`${shift.title}-${porter.id}`} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={shift.list.includes(porter.id)}
                      onChange={() => toggle(shift.list, shift.setList, porter.id)}
                    />
                    {porter.name}
                  </label>
                ))}
                {!porters.length && <p className="text-sm text-ink/55">Add porters first.</p>}
              </div>
            </div>
          ))}
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save roster'}</button>
      </form>
    </div>
  );
}

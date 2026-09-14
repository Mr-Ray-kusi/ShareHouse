import { useEffect, useRef, useState } from 'react';
import { Ban, CheckCircle2 } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';
import SearchBar from '../../components/SearchBar';

export default function PorterDesk() {
  const { tenant } = useAuth();
  const [q, setQ] = useState('');
  const [rooms, setRooms] = useState([]);
  const [meta, setMeta] = useState({ shift: '', staffName: '' });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    api.get('/api/lodge/desk/meta')
      .then(({ data }) => setMeta(data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load the lodge desk.'));
  }, []);

  async function runSearch(term = q) {
    const needle = String(term || '').trim();
    setError('');
    setSelected(null);
    if (!needle) {
      setRooms([]);
      setSearched(false);
      return;
    }
    const token = ++seq.current;
    setLoading(true);
    try {
      const { data } = await api.get('/api/lodge/desk/search', { params: { q: needle } });
      if (token !== seq.current) return;
      setRooms(data.rooms || []);
      setMeta((prev) => ({ ...prev, shift: data.shift || prev.shift, staffName: data.staffName || prev.staffName }));
      setSearched(true);
    } catch (err) {
      if (token !== seq.current) return;
      setRooms([]);
      setSearched(true);
      setError(err.response?.data?.message || 'Search failed.');
    } finally {
      if (token === seq.current) setLoading(false);
    }
  }

  async function move(action) {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/api/lodge/desk/${action}`, { occupantId: selected.id });
      setFlash(data.message);
      setMeta((prev) => ({ ...prev, shift: data.shift || prev.shift }));
      setSelected(null);
      await runSearch(q);
      setTimeout(() => setFlash(''), 2200);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not move this key.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col px-3 pt-3 pb-2 max-w-6xl mx-auto">
      <div className="shrink-0 space-y-2">
        <HallHero
          compact
          eyebrow="Porter desk"
          title={tenant?.name || 'ShareHouse'}
          subtitle={`${meta.shift ? `${meta.shift} shift` : 'On duty'}${meta.staffName ? ` · ${meta.staffName}` : ''}`}
        />
        {flash && (
          <div className="rounded-xl bg-forest-600 text-white px-3 py-2 flex items-center gap-2 text-sm">
            <CheckCircle2 size={16} /> {flash}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 text-red-800 px-3 py-2 flex items-center gap-2 text-sm">
            <Ban size={16} /> {error}
          </div>
        )}
        <SearchBar
          value={q}
          onChange={setQ}
          onSearch={runSearch}
          debounceMs={220}
          placeholder="Search room or student index"
        />
        <p className="text-xs text-ink/60">
          {loading
            ? 'Searching…'
            : searched
              ? (rooms.length ? `${rooms.length} room${rooms.length === 1 ? '' : 's'}. Tap the occupant, then receive or give the key.` : 'No room or occupant matched.')
              : 'Search the room first. A room number is not proof — pick the named occupant.'}
        </p>
      </div>
      <div className="flex-1 min-h-0 mt-2 overflow-y-auto">
        <div className="space-y-4 pb-4">
          {rooms.map((room) => (
            <section key={room.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl">Room {room.roomNumber}</p>
                  <p className="text-sm text-ink/60">
                    {room.keyStatus === 'out'
                      ? `Out with ${room.outOccupantName}${room.outAt ? ` · ${new Date(room.outAt).toLocaleString()}` : ''}`
                      : 'Key is in the lodge'}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                {(room.occupants || []).map((occupant) => {
                  const active = selected?.id === occupant.id;
                  return (
                    <button
                      key={occupant.id}
                      type="button"
                      onClick={() => setSelected(active ? null : { ...occupant, canGive: room.canGive, canReceive: room.canReceive })}
                      className={`text-left rounded-xl px-3 py-3 border ${
                        active ? 'border-forest-600 bg-forest-50 ring-2 ring-forest-600' : 'border-forest-100 bg-white'
                      }`}
                    >
                      <p className="font-semibold">{occupant.fullName}</p>
                      <p className="text-xs text-ink/60">
                        {occupant.studentIndex} · {occupant.cohort === 'fresher' ? 'Fresher' : 'Continuing'}
                        {occupant.phone ? ` · ${occupant.phone}` : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
              {selected && (room.occupants || []).some((occupant) => occupant.id === selected.id) ? (
                <div className="mt-3">
                  {room.canReceive ? (
                    <button className="btn-primary w-full" disabled={busy} onClick={() => move('receive')}>
                      {busy ? 'Saving…' : `Receive key from ${selected.fullName}`}
                    </button>
                  ) : (
                    <button className="btn-primary w-full" disabled={busy} onClick={() => move('give')}>
                      {busy ? 'Saving…' : `Give key to ${selected.fullName}`}
                    </button>
                  )}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

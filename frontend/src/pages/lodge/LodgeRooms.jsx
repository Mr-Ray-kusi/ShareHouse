import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';
import SearchBar from '../../components/SearchBar';

export default function LodgeRooms() {
  const { tenant } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');

  async function load(q = query) {
    const { data } = await api.get('/api/lodge/rooms', { params: q ? { q } : {} });
    setRooms(data.rooms || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.response?.data?.message || 'Could not load rooms.'));
  }, []);

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    setSummary('');
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/api/lodge/rooms/upload', body, { timeout: 60000 });
      setSummary(data.message || 'Register updated.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not upload the room register.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · room register`}
        title="Rooms"
        subtitle="Year-long occupant list. Room number is search only — staff still pick a named occupant."
      />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {summary && <p className="mt-3 text-sm text-forest-800">{summary}</p>}
      <div className="card p-5 mt-6 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-forest-700">Upload Excel</p>
          <p className="text-sm text-ink/60 mt-1">Columns: Room, Student Index, Full Name, Phone, Fresher/Continuing.</p>
        </div>
        <label className="btn-primary cursor-pointer">
          {busy ? 'Uploading…' : 'Upload register'}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={upload} disabled={busy} />
        </label>
      </div>
      <div className="mt-6">
        <SearchBar
          value={query}
          onChange={setQuery}
          onSearch={(term) => load(term).catch((err) => setError(err.response?.data?.message || 'Search failed.'))}
          debounceMs={220}
          placeholder="Search room, name, or index"
        />
      </div>
      <div className="mt-4 space-y-3">
        {rooms.map((room) => (
          <Link key={room.id} to={`/lodge/rooms/${room.id}`} className="card p-4 block hover:bg-mist/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Room {room.roomNumber}</p>
                <p className="text-sm text-ink/60">
                  {room.occupantCount} occupant{room.occupantCount === 1 ? '' : 's'}
                  {room.occupants?.length ? ` · ${room.occupants.map((o) => o.fullName).join(', ')}` : ''}
                </p>
              </div>
              <p className={`text-xs font-semibold ${room.keyStatus === 'out' ? 'text-red-700' : 'text-forest-700'}`}>
                {room.keyStatus === 'out' ? `Out with ${room.outOccupantName}` : 'In lodge'}
              </p>
            </div>
          </Link>
        ))}
        {!rooms.length && <p className="text-sm text-ink/55">No rooms on the register yet.</p>}
      </div>
    </div>
  );
}

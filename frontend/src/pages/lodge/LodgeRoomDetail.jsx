import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';
import SheetTable from '../../components/SheetTable';
import { printSheet, sortSheetRows } from '../../utils/sheetExport';

export default function LodgeRoomDetail() {
  const { roomId } = useParams();
  const { tenant } = useAuth();
  const [room, setRoom] = useState(null);
  const [movements, setMovements] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    api
      .get(`/api/lodge/rooms/${roomId}`)
      .then(({ data }) => {
        setRoom(data.room);
        setMovements(data.movements || []);
        setHeaders(data.headers || []);
      })
      .catch((err) => setError(err.response?.data?.message || 'Could not load this room.'));
  }, [roomId]);

  const rows = useMemo(() => sortSheetRows(movements, sortKey, sortDir), [movements, sortKey, sortDir]);

  return (
    <div>
      <Link to="/lodge/rooms" className="text-sm font-semibold text-forest-700">← Rooms</Link>
      <HallHero
        eyebrow={`${tenant?.name || 'Hall'} · room history`}
        title={room ? `Room ${room.roomNumber}` : 'Room'}
        subtitle={
          room?.keyStatus === 'out'
            ? `Out with ${room.outOccupantName}${room.outAt ? ` · ${new Date(room.outAt).toLocaleString()}` : ''}`
            : 'Key is in the lodge'
        }
      />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {room?.occupants?.length ? (
        <div className="card p-4 mt-4">
          <p className="text-xs uppercase tracking-widest text-forest-700">Occupants</p>
          <ul className="mt-2 space-y-1 text-sm">
            {room.occupants.map((occupant) => (
              <li key={occupant.id}>
                {occupant.fullName} · {occupant.studentIndex} · {occupant.cohort === 'fresher' ? 'Fresher' : 'Continuing'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3 mt-8">
        <div>
          <h2 className="font-display text-2xl">Brought by / taken by</h2>
          <p className="text-sm text-ink/60 mt-1">{rows.length} movement{rows.length === 1 ? '' : 's'}.</p>
        </div>
        <button
          className="btn-ghost text-xs"
          onClick={() => printSheet(`${tenant?.name || 'Hall'} · Room ${room?.roomNumber || ''}`, headers, rows)}
          disabled={!rows.length}
        >
          <Printer size={14} /> Print this list
        </button>
      </div>
      <div className="mt-3">
        <SheetTable
          headers={headers}
          rows={rows}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key, dir) => {
            setSortKey(key);
            setSortDir(dir);
          }}
          emptyMessage="No key movements on this room yet."
        />
      </div>
    </div>
  );
}

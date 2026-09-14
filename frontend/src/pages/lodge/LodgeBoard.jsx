import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import HallHero from '../../components/HallHero';
import SheetTable from '../../components/SheetTable';
import SearchBar, { applyFilters, ColumnFilters, rowMatchesQuery } from '../../components/SearchBar';
import { printSheet, sortSheetRows } from '../../utils/sheetExport';

const VIEWS = {
  inLodge: { title: 'In lodge', empty: 'Every key is out.' },
  out: { title: 'Out', empty: 'Every key is in the lodge.' },
  today: { title: 'Today’s movements', empty: 'No key movements yet today.' },
  watch: { title: 'Watch', empty: 'No overdue keys or failed attempts.' },
};

export default function LodgeBoard() {
  const { tenant } = useAuth();
  const [stats, setStats] = useState({ inLodge: 0, out: 0, today: 0, watch: 0 });
  const [view, setView] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loaded = useRef('');

  async function loadDesk() {
    const { data } = await api.get('/api/lodge/dashboard');
    setStats(data.stats || stats);
  }

  async function loadView(nextView) {
    if (!nextView) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/lodge/board', { params: { view: nextView } });
      setHeaders(data.headers || []);
      setRows(data.results || []);
      loaded.current = nextView;
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this list.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDesk().catch((err) => setError(err.response?.data?.message || 'Could not load the lodge.'));
  }, []);

  useEffect(() => {
    if (view) loadView(view);
  }, [view]);

  const visible = useMemo(() => {
    let next = rows;
    if (query.trim()) next = next.filter((row) => rowMatchesQuery(row, query));
    next = applyFilters(next, filters, headers);
    return sortSheetRows(next, sortKey, sortDir);
  }, [rows, query, filters, headers, sortKey, sortDir]);

  const cards = [
    { key: 'inLodge', label: 'In lodge', value: stats.inLodge },
    { key: 'out', label: 'Out', value: stats.out },
    { key: 'today', label: 'Today’s movements', value: stats.today },
    { key: 'watch', label: 'Watch', value: stats.watch },
  ];

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · /${tenant?.tenantId || ''}`}
        title={`${tenant?.name || 'Hall'} lodge`}
        subtitle="Room keys only. Sharing stays on the president desk."
      />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
        {cards.map((card) => {
          const active = view === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setView((prev) => (prev === card.key ? null : card.key))}
              className={`card p-4 text-left transition ${active ? 'ring-2 ring-forest-600 bg-forest-50' : 'hover:bg-mist/80'}`}
            >
              <p className="text-xs uppercase tracking-widest text-forest-700/70">{card.label}</p>
              <p className="font-display text-3xl mt-1">{card.value}</p>
            </button>
          );
        })}
      </div>
      {!view && <p className="mt-8 text-sm text-ink/55">Tap a card above to open that list.</p>}
      {view && (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">{VIEWS[view].title}</h2>
              <p className="text-sm text-ink/60 mt-1">{loading ? 'Loading…' : `${visible.length} shown.`}</p>
            </div>
            <button className="btn-ghost text-xs" onClick={() => printSheet(`${tenant?.name || 'Hall'} · ${VIEWS[view].title}`, headers, visible)} disabled={!visible.length}>
              <Printer size={14} /> Print this list
            </button>
          </div>
          <div className="mt-4 card p-4">
            <SearchBar value={query} onChange={setQuery} placeholder="Search this list" />
            <ColumnFilters headers={headers} rows={rows} filters={filters} onChange={setFilters} />
          </div>
          <div className="mt-3">
            <SheetTable
              headers={headers}
              rows={visible}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={(key, dir) => {
                setSortKey(key);
                setSortDir(dir);
              }}
              emptyMessage={VIEWS[view].empty}
            />
          </div>
        </section>
      )}
    </div>
  );
}

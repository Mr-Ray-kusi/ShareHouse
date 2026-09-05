import { useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { io } from 'socket.io-client';
import api, { getAccessToken } from '../../api/client';
import { apiOrigin } from '../../api/baseUrl';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import SearchBar, { ColumnFilters, applyFilters, rowMatchesQuery } from '../../components/SearchBar';
import { downloadCsv, printSheet, sortSheetRows } from '../../utils/sheetExport';
import HallHero from '../../components/HallHero';

function activityRow(item) {
  return {
    id: item.id || item._id,
    studentIndex: item.studentIndex,
    fullName: item.beneficiaryName || item.fullName,
    collected: true,
    markedBy: item.assistantName || item.markedBy,
    collectedAt: item.collectedAt,
    assistantName: item.assistantName || item.markedBy,
    sheetRow: item.sheetRow && Object.keys(item.sheetRow || {}).length
      ? item.sheetRow
      : {
        'Student Index': item.studentIndex,
        'Full Name': item.beneficiaryName || item.fullName,
      },
  };
}

const VIEWS = {
  all: { title: 'On the list', empty: 'No students on this list yet.' },
  received: { title: 'Received', empty: 'No one has received yet.' },
  pending: { title: 'Pending', empty: 'Everyone on the list has received.' },
  complete: { title: 'Complete', empty: 'No collections yet. The table updates live as assistants verify students.' },
};

export default function TenantDashboard() {
  const { tenant } = useAuth();
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [list, setList] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [filters, setFilters] = useState({});
  const [error, setError] = useState('');
  const [view, setView] = useState(null);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [listReady, setListReady] = useState(false);

  async function loadDesk() {
    const { data: d } = await api.get('/api/dashboard');
    setData(d);
    if (d.headers?.length) setHeaders((prev) => (prev.length ? prev : d.headers));
  }

  async function loadList() {
    const { data: d } = await api.get('/api/collections/search');
    setList(d.results || []);
    setHeaders(d.headers || []);
    setListReady(true);
  }

  useEffect(() => {
    loadDesk().catch((err) => setError(err.response?.data?.message || 'Could not load desk.'));
  }, []);

  useEffect(() => {
    if (!view || listReady) return undefined;
    loadList().catch(() => {});
    return undefined;
  }, [view, listReady]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return undefined;
    const socket = io(apiOrigin() || undefined, {
      auth: { token },
    });
    socket.on('collection:new', (payload) => {
      const incoming = payload.collection;
      setQuery('');
      setData((prev) => {
        if (!prev) return prev;
        const row = activityRow(incoming);
        const activity = [row, ...(prev.activity || []).filter((a) => String(a.id || a._id) !== String(row.id))].slice(0, 50);
        return { ...prev, stats: payload.stats, activity };
      });
      setList((prev) =>
        prev.map((row) =>
          row.studentIndex === incoming.studentIndex || row.id === incoming.beneficiaryId
            ? { ...row, collected: true, markedBy: incoming.assistantName, collectedAt: incoming.collectedAt }
            : row
        )
      );
    });
    return () => socket.disconnect();
  }, []);

  const stats = data?.stats || { total: 0, received: 0, pending: 0, percent: 0 };
  const dist = data?.distribution;
  const needle = query.trim();
  const activityRows = useMemo(
    () => (data?.activity || []).map(activityRow),
    [data?.activity]
  );

  const receivedRows = useMemo(() => list.filter((r) => r.collected), [list]);
  const pendingRows = useMemo(() => list.filter((r) => !r.collected), [list]);

  const visible = useMemo(() => {
    if (!view) return [];
    let rows = view === 'complete' ? activityRows : list;
    if (view === 'received') rows = receivedRows;
    if (view === 'pending') rows = pendingRows;
    if (needle) rows = rows.filter((row) => rowMatchesQuery(row, needle));
    rows = applyFilters(rows, filters, headers);
    return sortSheetRows(rows, sortKey, sortDir);
  }, [view, list, activityRows, receivedRows, pendingRows, needle, filters, headers, sortKey, sortDir]);

  const cards = [
    { key: 'all', label: 'On the list', value: stats.total },
    { key: 'received', label: 'Received', value: stats.received },
    { key: 'pending', label: 'Pending', value: stats.pending },
    { key: 'complete', label: 'Complete', value: `${stats.percent}%` },
  ];

  const fileBase = `${tenant?.tenantId || 'hall'}-${dist?.title || 'list'}`.replace(/\s+/g, '-');

  function exportCurrent(mode) {
    const title = VIEWS[view]?.title || 'List';
    if (mode === 'print') printSheet(`${tenant?.name || 'Hall'} · ${title}`, headers, visible);
    else downloadCsv(`${fileBase}-${view || 'list'}.csv`, headers, visible);
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · /${tenant?.tenantId || ''}`}
        title={`${tenant?.name || 'Hall'} desk`}
        subtitle={
          dist
            ? `${dist.title}${dist.itemName ? ` · ${dist.itemName}` : ''}`
            : 'No distribution yet. Create one to start sharing.'
        }
      />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <div className="h-3 bg-forest-100 rounded-full mt-5 overflow-hidden">
        <div className="h-full bg-forest-600 transition-all" style={{ width: `${stats.percent || 0}%` }} />
      </div>

      {!view && (
        <p className="mt-8 text-sm text-ink/55">Tap a card above to open that list.</p>
      )}

      {view && (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">{needle ? 'Search result' : VIEWS[view].title}</h2>
              <p className="text-sm text-ink/60 mt-1">{visible.length} shown. Click a column header to sort.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost text-xs" onClick={() => exportCurrent('download')}>
                <Download size={14} /> Download this list
              </button>
              <button className="btn-ghost text-xs" onClick={() => exportCurrent('print')}>
                <Printer size={14} /> Print this list
              </button>
            </div>
          </div>

          <div className="mt-4 card p-4">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search name or ID — any capitalization"
            />
            <ColumnFilters headers={headers} rows={list} filters={filters} onChange={setFilters} />
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
              emptyMessage={needle ? 'No student matched that search.' : VIEWS[view].empty}
            />
          </div>
        </section>
      )}
    </div>
  );
}

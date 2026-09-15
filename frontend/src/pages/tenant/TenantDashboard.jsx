import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { io } from 'socket.io-client';
import api, { getAccessToken } from '../../api/client';
import { apiOrigin } from '../../api/baseUrl';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import SearchBar, { ColumnFilters, applyFilters, rowMatchesQuery } from '../../components/SearchBar';
import { downloadCsv, printSheet, sortSheetRows } from '../../utils/sheetExport';
import HallHero from '../../components/HallHero';
import VoidMarkModal from '../../components/VoidMarkModal';
import ExceptionPanel, { reviewWalkIn } from '../../components/ExceptionPanel';

function activityRow(item) {
  return {
    id: item.id || item._id,
    beneficiaryId: item.beneficiaryId || item.id,
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
  const { hallId } = useParams();
  const { tenant } = useAuth();
  const monitor = Boolean(hallId);
  const isSrc = tenant?.subscriptionPlan === 'src';
  const canReview = !monitor && !isSrc;
  const hallApi = monitor ? `/api/src/halls/${hallId}` : '';
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [list, setList] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [filters, setFilters] = useState({});
  const [error, setError] = useState('');
  const [view, setView] = useState(null);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [listLoading, setListLoading] = useState(false);
  const [voidRow, setVoidRow] = useState(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const [exceptions, setExceptions] = useState([]);
  const [exceptionBusy, setExceptionBusy] = useState('');
  const listRequested = useRef(false);

  async function loadDesk() {
    const { data: d } = await api.get(monitor ? `${hallApi}/dashboard` : '/api/dashboard');
    setData(d);
    if (d.headers?.length) setHeaders((prev) => (prev.length ? prev : d.headers));
  }

  async function loadList() {
    if (listRequested.current) return;
    listRequested.current = true;
    setListLoading(true);
    try {
      const { data: d } = await api.get(monitor ? `${hallApi}/search` : '/api/collections/search');
      setList(d.results || []);
      setHeaders(d.headers || []);
    } catch (err) {
      listRequested.current = false;
      throw err;
    } finally {
      setListLoading(false);
    }
  }

  async function loadExceptions() {
    try {
      const { data } = await api.get(monitor ? `${hallApi}/exceptions` : '/api/exceptions', { params: { status: 'pending' } });
      setExceptions(data.exceptions || []);
    } catch (_err) {
      /* ignore */
    }
  }

  useEffect(() => {
  useEffect(() => {
    listRequested.current = false;
    setList([]);
    setView(null);
    loadDesk().catch((err) => setError(err.response?.data?.message || 'Could not load desk.'));
    loadExceptions();
  }, [hallId]);

  useEffect(() => {
    if (view && view !== 'complete') {
      loadList().catch(() => {});
    }
  }, [view]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return undefined;
    const socket = io(apiOrigin() || undefined, {
      auth: { token },
    });
    if (hallId) socket.emit('src:watch', hallId);
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
    socket.on('collection:void', (payload) => {
      setData((prev) => {
        if (!prev) return prev;
        const activity = (prev.activity || []).filter((a) => (
          String(a.beneficiaryId || '') !== String(payload.beneficiaryId)
          && String(a.id || a._id) !== String(payload.collectionId)
        ));
        return { ...prev, stats: payload.stats || prev.stats, activity };
      });
      setList((prev) =>
        prev.map((row) =>
          String(row.id) === String(payload.beneficiaryId) || row.studentIndex === payload.studentIndex
            ? { ...row, collected: false, markedBy: null, collectedAt: null }
            : row
        )
      );
    });
    socket.on('exception:new', (payload) => {
      if (payload?.exception) {
        setExceptions((prev) => [payload.exception, ...prev.filter((row) => row.id !== payload.exception.id)]);
      }
    });
    socket.on('exception:updated', (payload) => {
      if (!payload?.exception) return;
      setExceptions((prev) => {
        if (payload.exception.status === 'pending') {
          return [payload.exception, ...prev.filter((row) => row.id !== payload.exception.id)];
        }
        return prev.filter((row) => row.id !== payload.exception.id);
      });
    });
    return () => socket.disconnect();
  }, [hallId]);

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

  const deskTenant = data?.tenant || tenant;
  const fileBase = `${deskTenant?.tenantId || 'hall'}-${dist?.title || 'list'}`.replace(/\s+/g, '-');

  function exportCurrent(mode) {
    const title = VIEWS[view]?.title || 'List';
    if (mode === 'print') printSheet(`${deskTenant?.name || 'Hall'} · ${title}`, headers, visible);
    else downloadCsv(`${fileBase}-${view || 'list'}.csv`, headers, visible);
  }

  async function voidMark(reason) {
    if (!voidRow || monitor) return;
    setVoidBusy(true);
    setError('');
    try {
      const beneficiaryId = voidRow.beneficiaryId || voidRow.id;
      const { data } = await api.post('/api/collections/void', { beneficiaryId, reason });
      setData((prev) => {
        if (!prev) return prev;
        const activity = (prev.activity || []).filter((a) => (
          String(a.beneficiaryId || a.id) !== String(beneficiaryId)
        ));
        return { ...prev, stats: data.stats || prev.stats, activity };
      });
      setList((prev) =>
        prev.map((row) =>
          String(row.id) === String(beneficiaryId) || row.studentIndex === voidRow.studentIndex
            ? { ...row, collected: false, markedBy: null, collectedAt: null }
            : row
        )
      );
      setVoidRow(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not void that mark.');
    } finally {
      setVoidBusy(false);
    }
  }

  if (monitor && tenant && !isSrc) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div>
      <HallHero
        eyebrow={`${deskTenant?.schoolName || ''} · /${deskTenant?.tenantId || ''}${monitor ? ' · SRC monitor' : ''}`}
        title={`${deskTenant?.name || 'Hall'} desk`}
        subtitle={
          dist
            ? `${dist.title}${dist.itemName ? ` · ${dist.itemName}` : ''}`
            : 'No distribution yet. Create one to start sharing.'
        }
      />
      {monitor ? (
        <p className="mb-3 text-sm">
          <Link to="/app/halls" className="font-semibold text-forest-700">← Campus halls</Link>
        </p>
      ) : null}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {exceptions.length > 0 && (
        <section className="mt-6 card p-4">
          <h2 className="font-display text-2xl">Walk-ins waiting</h2>
          <p className="text-sm text-ink/60 mt-1">
            {canReview
              ? 'Approve from the live desk so the table can serve them.'
              : 'SRC can monitor walk-ins. Only the hall president can approve a student.'}
          </p>
          <div className="mt-3">
            <ExceptionPanel
              items={exceptions}
              canReview={canReview}
              photoBase={monitor ? `${hallApi}/exceptions` : '/api/exceptions'}
              busyId={exceptionBusy}
              onApprove={async (row, markReceived) => {
                setExceptionBusy(row.id);
                try {
                  await reviewWalkIn(row.id, 'approve', { markReceived });
                  await loadExceptions();
                  await loadDesk();
                  listRequested.current = false;
                } catch (err) {
                  setError(err.response?.data?.message || 'Could not approve that walk-in.');
                } finally {
                  setExceptionBusy('');
                }
              }}
              onReject={async (row) => {
                const note = window.prompt('Reason for rejecting this walk-in?', 'Not eligible') || 'Rejected';
                setExceptionBusy(row.id);
                try {
                  await reviewWalkIn(row.id, 'reject', { note });
                  await loadExceptions();
                } catch (err) {
                  setError(err.response?.data?.message || 'Could not reject that walk-in.');
                } finally {
                  setExceptionBusy('');
                }
              }}
            />
          </div>
        </section>
      )}

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
            {listLoading && view !== 'complete' ? (
              <p className="text-sm text-ink/55 py-6">Loading this list…</p>
            ) : (
              <SheetTable
                headers={headers}
                rows={visible}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={(key, dir) => {
                  setSortKey(key);
                  setSortDir(dir);
                }}
                showVoid={!monitor}
                onVoid={monitor ? undefined : setVoidRow}
                emptyMessage={needle ? 'No student matched that search.' : VIEWS[view].empty}
              />
            )}
          </div>
        </section>
      )}

      <VoidMarkModal
        row={voidRow}
        busy={voidBusy}
        onCancel={() => setVoidRow(null)}
        onConfirm={voidMark}
      />
    </div>
  );
}

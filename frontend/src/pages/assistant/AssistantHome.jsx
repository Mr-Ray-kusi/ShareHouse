import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Ban } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import SearchBar, { ColumnFilters, applyFilters, rowMatchesQuery } from '../../components/SearchBar';
import { sortSheetRows } from '../../utils/sheetExport';
import HallHero from '../../components/HallHero';

export default function AssistantHome() {
  const { tenant } = useAuth();
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [filters, setFilters] = useState({});
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [distribution, setDistribution] = useState(null);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function loadList() {
    setError('');
    try {
      const { data } = await api.get('/api/collections/search');
      setDistribution(data.distribution);
      setHeaders(data.headers || []);
      setList(data.results || []);
    } catch (err) {
      setList([]);
      setError(err.response?.data?.message || 'Could not load the hall list.');
    }
  }

  useEffect(() => {
    loadList();
  }, []);

  function patchRow(id, extra) {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...extra } : r)));
  }

  async function mark(row) {
    if (row.collected) return;
    setBusyId(row.id);
    setError('');
    try {
      const { data } = await api.post('/api/collections/mark', { beneficiaryId: row.id });
      setFlash(`${row.fullName} verified`);
      patchRow(row.id, {
        collected: true,
        markedBy: data.collection.assistantName,
        collectedAt: data.collection.collectedAt,
      });
      setQ('');
      setTimeout(() => setFlash(null), 2500);
    } catch (err) {
      if (err.response?.status === 409) {
        patchRow(row.id, { collected: true, markedBy: err.response.data.collection?.assistantName });
        setQ('');
        setError('Already collected. Do not give a second serving.');
      } else {
        setError(err.response?.data?.message || 'Could not verify student.');
      }
    } finally {
      setBusyId(null);
    }
  }

  const needle = q.trim();
  const visible = useMemo(() => {
    let rows = list;
    if (needle) {
      rows = rows.filter((row) => rowMatchesQuery(row, needle));
    } else {
      rows = rows.filter((row) => !row.collected);
    }
    rows = applyFilters(rows, filters, headers);
    return sortSheetRows(rows, sortKey, sortDir);
  }, [list, filters, headers, needle, sortKey, sortDir]);

  return (
    <div className="h-full min-h-0 flex flex-col px-3 pt-3 pb-2 max-w-6xl mx-auto">
      <div className="shrink-0 space-y-2">
        <HallHero
          compact
          eyebrow="Field collection"
          title={tenant?.name || 'WelfareShare'}
          subtitle={
            distribution
              ? `${distribution.title} · ${visible.length} ${needle ? 'match' : 'pending'}`
              : 'No active distribution yet.'
          }
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
          placeholder="Search name or ID"
        />
        <ColumnFilters headers={headers} rows={list} filters={filters} onChange={setFilters} />
        {needle && (
          <p className="text-xs text-ink/60">
            {visible.length
              ? `${visible.length} match${visible.length === 1 ? '' : 'es'}.`
              : 'No student matched that search.'}
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0 mt-2">
        <SheetTable
          headers={headers}
          rows={visible}
          showMark
          onMark={mark}
          busyId={busyId}
          fillHeight
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key, dir) => {
            setSortKey(key);
            setSortDir(dir);
          }}
          emptyMessage={needle ? 'No student matched that search.' : 'Everyone pending has been served. Search to look up a collected student.'}
        />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Ban } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import ResultCards from '../../components/ResultCards';
import SearchBar from '../../components/SearchBar';
import HallHero from '../../components/HallHero';
import UnitCodeBanner from '../../components/UnitCodeBanner';

export default function AssistantHome() {
  const { tenant } = useAuth();
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [distribution, setDistribution] = useState(null);
  const [unitCode, setUnitCode] = useState('');
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchSeq = useRef(0);

  async function loadMeta() {
    const { data } = await api.get('/api/collections/search', { params: { meta: 1 } });
    setDistribution(data.distribution);
    setHeaders(data.headers || []);
    setUnitCode(data.unitCode || '');
  }

  useEffect(() => {
    loadMeta().catch((err) => setError(err.response?.data?.message || 'Could not load the hall list.'));
  }, []);

  async function runSearch(term = q) {
    const needle = String(term || '').trim();
    setError('');
    if (needle.length < 2) {
      setList([]);
      setSearched(false);
      return;
    }
    const seq = ++searchSeq.current;
    setLoading(true);
    try {
      const { data } = await api.get('/api/collections/search', { params: { q: needle } });
      if (seq !== searchSeq.current) return;
      setDistribution(data.distribution);
      setHeaders(data.headers || []);
      setList(data.results || []);
      if (data.unitCode) setUnitCode(data.unitCode);
      setSearched(true);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      setList([]);
      setSearched(true);
      setError(err.response?.data?.message || 'Search failed.');
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  function patchRow(id, extra) {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...extra } : r)));
  }

  async function mark(row) {
    if (row.collected) return;
    setBusyId(row.id);
    setError('');
    patchRow(row.id, { collected: true, markedBy: 'Verifying…' });
    try {
      const { data } = await api.post('/api/collections/mark', { beneficiaryId: row.id });
      setFlash(`${row.fullName} verified`);
      patchRow(row.id, {
        collected: true,
        markedBy: data.collection.assistantName,
        collectedAt: data.collection.collectedAt,
      });
      setTimeout(() => setFlash(null), 2200);
    } catch (err) {
      if (err.response?.status === 409) {
        patchRow(row.id, { collected: true, markedBy: err.response.data.collection?.assistantName });
        setError('Already collected. Do not give a second serving.');
      } else {
        patchRow(row.id, { collected: false, markedBy: null, collectedAt: null });
        setError(err.response?.data?.message || 'Could not verify student.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col px-3 pt-3 pb-2 max-w-6xl mx-auto">
      <div className="shrink-0 space-y-2">
        <HallHero
          compact
          eyebrow="Field collection"
          title={tenant?.name || 'ShareHouse'}
          subtitle={
            distribution
              ? `${distribution.title} · search a student to verify`
              : 'No active distribution yet.'
          }
        />
        <UnitCodeBanner code={unitCode} compact />
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
          onChange={(next) => {
            setQ(next);
            if (searched && String(next || '').trim().length < 2) {
              setSearched(false);
              setList([]);
            }
          }}
          onSearch={runSearch}
          debounceMs={220}
          placeholder="Search name, ID, or program"
        />
        <p className="text-xs text-ink/60">
          {loading
            ? 'Searching…'
            : searched
              ? (list.length ? `${list.length} match${list.length === 1 ? '' : 'es'}.` : 'No student matched that search.')
              : 'Search the student in front of you. Give them the unit code if they scanned the QR.'}
        </p>
      </div>
      <div className="flex-1 min-h-0 mt-2 overflow-y-auto md:overflow-hidden">
        {searched ? (
          <>
            <div className="md:hidden pb-4">
              <ResultCards
                headers={headers}
                rows={list}
                showMark
                onMark={mark}
                busyId={busyId}
                emptyMessage="No student matched that search."
              />
            </div>
            <div className="hidden md:block h-full">
              <SheetTable
                headers={headers}
                rows={list}
                showMark
                onMark={mark}
                busyId={busyId}
                fillHeight
                emptyMessage="No student matched that search."
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

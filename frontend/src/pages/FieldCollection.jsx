import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Ban, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import HallHero from '../components/HallHero';
import SearchBar from '../components/SearchBar';
import ResultCards from '../components/ResultCards';

export default function FieldCollection() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [q, setQ] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get(`/api/field/${token}`)
      .then(({ data }) => {
        setMeta(data);
        setHeaders(data.headers || []);
      })
      .catch((err) => setError(err.response?.data?.message || 'This QR link is not valid.'));
  }, [token]);

  async function runSearch(term = q) {
    const needle = String(term || '').trim();
    setError('');
    if (needle.length < 2) {
      setRows([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/api/field/${token}/search`, { params: { q: needle } });
      setHeaders(data.headers || []);
      setRows(data.results || []);
      setSearched(true);
    } catch (err) {
      setRows([]);
      setSearched(true);
      setError(err.response?.data?.message || 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  async function mark(row) {
    if (row.collected) return;
    setBusyId(row.id);
    setError('');
    try {
      const { data } = await api.post(`/api/field/${token}/verify`, { beneficiaryId: row.id });
      setFlash(`${row.fullName} verified`);
      setRows((prev) => prev.map((r) => (
        r.id === row.id
          ? { ...r, collected: true, markedBy: data.collection.assistantName, collectedAt: data.collection.collectedAt }
          : r
      )));
      setTimeout(() => setFlash(''), 2500);
    } catch (err) {
      if (err.response?.status === 409) {
        setRows((prev) => prev.map((r) => (
          r.id === row.id
            ? { ...r, collected: true, markedBy: err.response.data.collection?.assistantName }
            : r
        )));
        setError('Already collected. Do not give a second serving.');
      } else {
        setError(err.response?.data?.message || 'Could not verify student.');
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-mist flex flex-col">
      <div className="kente-bar shrink-0" />
      <header className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-forest-100">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-forest-700/70">Field collection</p>
          <p className="font-semibold truncate">{meta?.hallName || 'ShareHouse'}</p>
        </div>
        {meta?.station ? <p className="text-xs text-ink/50 shrink-0">{meta.station}</p> : null}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 max-w-xl mx-auto w-full">
        <HallHero
          compact
          eyebrow="Field collection"
          title={meta?.hallName || 'ShareHouse'}
          subtitle={meta ? `${meta.campaignTitle}${meta.itemName ? ` · ${meta.itemName}` : ''}` : 'Loading campaign…'}
        />
        {flash && (
          <div className="rounded-xl bg-forest-600 text-white px-3 py-2 flex items-center gap-2 text-sm mb-2">
            <CheckCircle2 size={16} /> {flash}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-red-50 text-red-800 px-3 py-2 flex items-center gap-2 text-sm mb-2">
            <Ban size={16} /> {error}
          </div>
        )}
        <SearchBar
          value={q}
          onChange={(next) => {
            setQ(next);
            if (searched) {
              setSearched(false);
              setRows([]);
            }
          }}
          onSearch={runSearch}
          placeholder="Search name, ID, or program"
        />
        <p className="text-xs text-ink/55 mt-2 mb-3">
          {loading ? 'Searching…' : searched
            ? (rows.length ? `${rows.length} match${rows.length === 1 ? '' : 'es'}.` : 'No student matched that search.')
            : 'Search your name, student ID, or program, then verify yourself.'}
        </p>
        {searched && (
          <ResultCards
            headers={headers}
            rows={rows}
            showMark
            onMark={mark}
            busyId={busyId}
            emptyMessage="No student matched that search."
          />
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Ban, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import HallHero from '../components/HallHero';
import SearchBar from '../components/SearchBar';
import ResultCards from '../components/ResultCards';
import PasswordField from '../components/PasswordField';

function unitStorageKey(token) {
  return `sh_unit_${String(token || '').toUpperCase()}`;
}

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
  const [pending, setPending] = useState(null);
  const [unitCode, setUnitCode] = useState('');
  const searchSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    api
      .get(`/api/field/${token}`)
      .then(({ data }) => {
        if (!alive) return;
        setMeta(data);
        setHeaders(data.headers || []);
      })
      .catch((err) => {
        if (alive) setError(err.response?.data?.message || 'This QR link is not valid.');
      });
    try {
      setUnitCode(sessionStorage.getItem(unitStorageKey(token)) || '');
    } catch {
      setUnitCode('');
    }
    return () => { alive = false; };
  }, [token]);

  async function runSearch(term = q) {
    const needle = String(term || '').trim();
    setError('');
    if (needle.length < 2) {
      setRows([]);
      setSearched(false);
      return;
    }
    const seq = ++searchSeq.current;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/field/${token}/search`, { params: { q: needle } });
      if (seq !== searchSeq.current) return;
      setHeaders(data.headers || []);
      setRows(data.results || []);
      setSearched(true);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      setRows([]);
      setSearched(true);
      setError(err.response?.data?.message || 'Search failed.');
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  function requestVerify(row) {
    if (row.collected) return;
    setError('');
    setPending(row);
  }

  async function confirmVerify(e) {
    e?.preventDefault?.();
    const row = pending;
    if (!row) return;
    const code = String(unitCode || '').trim();
    if (!code) {
      setError('Enter the unit code from a collection assistant.');
      return;
    }
    setBusyId(row.id);
    setError('');
    setRows((prev) => prev.map((r) => (
      r.id === row.id ? { ...r, collected: true, markedBy: 'Verifying…' } : r
    )));
    setPending(null);
    try {
      const { data } = await api.post(`/api/field/${token}/verify`, {
        beneficiaryId: row.id,
        unitCode: code,
      });
      try {
        sessionStorage.setItem(unitStorageKey(token), code);
      } catch {
        /* ignore */
      }
      setFlash(`${row.fullName} verified`);
      setRows((prev) => prev.map((r) => (
        r.id === row.id
          ? { ...r, collected: true, markedBy: data.collection.assistantName, collectedAt: data.collection.collectedAt }
          : r
      )));
      setTimeout(() => setFlash(''), 2200);
    } catch (err) {
      setRows((prev) => prev.map((r) => (
        r.id === row.id ? { ...r, collected: false, markedBy: null, collectedAt: null } : r
      )));
      if (err.response?.status === 409) {
        setRows((prev) => prev.map((r) => (
          r.id === row.id
            ? { ...r, collected: true, markedBy: err.response.data.collection?.assistantName }
            : r
        )));
        setError('Already collected. Do not give a second serving.');
      } else if (err.response?.data?.code === 'UNIT_CODE_REQUIRED' || err.response?.status === 401) {
        try {
          sessionStorage.removeItem(unitStorageKey(token));
        } catch {
          /* ignore */
        }
        setUnitCode('');
        setPending(row);
        setError(err.response?.data?.message || 'That unit code is not correct.');
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
            if (searched && String(next || '').trim().length < 2) {
              setSearched(false);
              setRows([]);
            }
          }}
          onSearch={runSearch}
          debounceMs={220}
          placeholder="Search name, ID, or program"
        />
        <p className="text-xs text-ink/55 mt-2 mb-3">
          {loading ? 'Searching…' : searched
            ? (rows.length ? `${rows.length} match${rows.length === 1 ? '' : 'es'}.` : 'No student matched that search.')
            : 'Search your name, then verify. An assistant must enter the unit code.'}
        </p>
        {searched && (
          <ResultCards
            headers={headers}
            rows={rows}
            showMark
            onMark={requestVerify}
            busyId={busyId}
            emptyMessage="No student matched that search."
          />
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-40 bg-ink/50 grid place-items-end sm:place-items-center p-3">
          <form onSubmit={confirmVerify} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-desk">
            <p className="text-xs uppercase tracking-widest text-forest-700/70">Finish verification</p>
            <h2 className="font-display text-2xl mt-1">{pending.fullName}</h2>
            <p className="text-sm text-ink/60 mt-1">
              Ask a hall admin or collection assistant for the unit code, then enter it here.
            </p>
            {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
            <label className="block mt-4">
              <span className="label">Unit code</span>
              <PasswordField
                autoFocus
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                placeholder="Staff unit code"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setPending(null)}>Cancel</button>
              <button className="btn-primary flex-1" disabled={busyId === pending.id}>
                {busyId === pending.id ? 'Saving…' : 'Confirm verify'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

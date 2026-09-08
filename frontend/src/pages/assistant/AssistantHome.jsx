import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Ban } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import ResultCards from '../../components/ResultCards';
import SearchBar from '../../components/SearchBar';
import HallHero from '../../components/HallHero';
import ConfirmMarkModal from '../../components/ConfirmMarkModal';
import ExceptionPanel from '../../components/ExceptionPanel';
import Modal from '../../components/Modal';
import CameraCapture from '../../components/CameraCapture';
import {
  applyMarkToPack,
  enqueueException,
  enqueueMark,
  getPack,
  isNetworkError,
  listQueuedMarks,
  queueCounts,
  searchPack,
} from '../../offline/deskStore';
import { flushDeskQueue, hydratePackIfNeeded } from '../../offline/syncDesk';

const emptyWalkIn = { fullName: '', studentIndex: '', level: '', phone: '', reason: '' };

export default function AssistantHome() {
  const { tenant } = useAuth();
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [distribution, setDistribution] = useState(null);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [queue, setQueue] = useState({ marks: 0, exceptions: 0 });
  const [confirmRow, setConfirmRow] = useState(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkIn, setWalkIn] = useState(emptyWalkIn);
  const [walkInPhoto, setWalkInPhoto] = useState(null);
  const [walkIns, setWalkIns] = useState([]);
  const [walkBusy, setWalkBusy] = useState(false);
  const searchSeq = useRef(0);

  async function refreshQueue() {
    setQueue(await queueCounts());
  }

  async function loadMeta() {
    try {
      const { data } = await api.get('/api/collections/search', { params: { meta: 1 } });
      setDistribution(data.distribution);
      setHeaders(data.headers || []);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const pack = await getPack();
      if (pack) {
        setDistribution(pack.distribution);
        setHeaders(pack.headers || []);
      } else {
        throw err;
      }
    }
  }

  async function loadWalkIns() {
    try {
      const { data } = await api.get('/api/exceptions', { params: { mine: 1 } });
      setWalkIns(data.exceptions || []);
    } catch (_err) {
      /* keep last list when offline */
    }
  }

  useEffect(() => {
    loadMeta().catch((err) => setError(err.response?.data?.message || 'Could not load the hall list.'));
    loadWalkIns();
    hydratePackIfNeeded().catch(() => {});
    refreshQueue();
  }, []);

  useEffect(() => {
    function syncOnline() {
      const next = navigator.onLine;
      setOnline(next);
      if (next) {
        flushDeskQueue()
          .then(setQueue)
          .then(() => hydratePackIfNeeded())
          .then((pack) => {
            if (pack?.headers) setHeaders(pack.headers);
            if (pack?.distribution) setDistribution(pack.distribution);
          })
          .catch(() => {});
        loadWalkIns();
      }
    }
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  async function mergeQueued(rows) {
    const queued = (await listQueuedMarks()) || [];
    const queuedIds = new Set(queued.map((item) => String(item.beneficiaryId)));
    return rows.map((row) => (
      queuedIds.has(String(row.id))
        ? { ...row, queued: true, markedBy: row.markedBy || 'Queued' }
        : row
    ));
  }

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
      setList(await mergeQueued(data.results || []));
      setSearched(true);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      if (isNetworkError(err)) {
        const pack = await getPack();
        const local = searchPack(pack, needle);
        setDistribution(pack?.distribution || null);
        setHeaders(pack?.headers || headers);
        setList(await mergeQueued(local));
        setSearched(true);
        if (!pack) setError('Offline and no saved hall list yet. Connect once to download it.');
      } else {
        setList([]);
        setSearched(true);
        setError(err.response?.data?.message || 'Search failed.');
      }
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  }

  function patchRow(id, extra) {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, ...extra } : r)));
  }

  async function confirmMark() {
    const row = confirmRow;
    if (!row || row.collected) return;
    setBusyId(row.id);
    setError('');
    try {
      const { data } = await api.post('/api/collections/mark', { beneficiaryId: row.id });
      setFlash(`${row.fullName} verified`);
      patchRow(row.id, {
        collected: true,
        queued: false,
        markedBy: data.collection.assistantName,
        collectedAt: data.collection.collectedAt,
      });
      await applyMarkToPack(row.id, {
        collected: true,
        queued: false,
        markedBy: data.collection.assistantName,
        collectedAt: data.collection.collectedAt,
      });
      setTimeout(() => setFlash(null), 2200);
    } catch (err) {
      if (err.response?.status === 409) {
        patchRow(row.id, { collected: true, queued: false, markedBy: err.response.data.collection?.assistantName });
        setError('Already collected. Do not give a second serving.');
      } else if (isNetworkError(err)) {
        await enqueueMark(row);
        await applyMarkToPack(row.id, { collected: false, queued: true, markedBy: 'Queued' });
        patchRow(row.id, { queued: true, markedBy: 'Queued' });
        setFlash(`${row.fullName} queued. Give the item once, then sync when you are back online.`);
        await refreshQueue();
        setTimeout(() => setFlash(null), 2800);
      } else {
        setError(err.response?.data?.message || 'Could not verify student.');
      }
    } finally {
      setBusyId(null);
      setConfirmRow(null);
    }
  }

  async function submitWalkIn(e) {
    e.preventDefault();
    setWalkBusy(true);
    setError('');
    const form = new FormData();
    form.append('fullName', walkIn.fullName.trim());
    form.append('studentIndex', walkIn.studentIndex.trim());
    form.append('level', walkIn.level.trim());
    form.append('phone', walkIn.phone.trim());
    form.append('reason', walkIn.reason.trim());
    if (walkInPhoto) form.append('photo', walkInPhoto);
    try {
      const { data } = await api.post('/api/exceptions', form);
      setFlash(data.message);
      setWalkIn(emptyWalkIn);
      setWalkInPhoto(null);
      setWalkInOpen(false);
      await loadWalkIns();
      setTimeout(() => setFlash(null), 2800);
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueException({
          ...walkIn,
          photoBlob: walkInPhoto || null,
          photoName: walkInPhoto?.name,
        });
        setFlash('Walk-in queued. It will send when you are back online. Do not give the item until it is approved.');
        setWalkIn(emptyWalkIn);
        setWalkInPhoto(null);
        setWalkInOpen(false);
        await refreshQueue();
        setTimeout(() => setFlash(null), 3200);
      } else {
        setError(err.response?.data?.message || 'Could not send the walk-in request.');
      }
    } finally {
      setWalkBusy(false);
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col px-3 pt-3 pb-2 max-w-6xl mx-auto">
      <div className="shrink-0 space-y-2">
        <HallHero
          compact
          eyebrow="Collection desk"
          title={tenant?.name || 'ShareHouse'}
          subtitle={
            distribution
              ? `${distribution.title} · search a student to verify`
              : 'No active distribution yet.'
          }
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-semibold ${online ? 'bg-forest-100 text-forest-800' : 'bg-gold-400 text-ink'}`}>
            {online ? 'Online' : 'Offline — using the saved list'}
          </span>
          {queue.marks + queue.exceptions > 0 ? (
            <span className="rounded-full bg-gold-400 px-2.5 py-1 font-semibold text-ink">
              {queue.marks} mark{queue.marks === 1 ? '' : 's'} and {queue.exceptions} walk-in{queue.exceptions === 1 ? '' : 's'} waiting to sync
            </span>
          ) : null}
        </div>
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
              : 'Search the student in front of you, then confirm before you verify.'}
        </p>
        {searched ? (
          <button type="button" className="btn-ghost text-xs" onClick={() => { setWalkInPhoto(null); setWalkInOpen(true); }}>
            Not on the list? Request a walk-in
          </button>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 mt-2 overflow-y-auto md:overflow-hidden">
        {searched ? (
          <>
            <div className="md:hidden pb-4">
              <ResultCards
                headers={headers}
                rows={list}
                showMark
                onMark={setConfirmRow}
                busyId={busyId}
                emptyMessage="No student matched that search."
              />
            </div>
            <div className="hidden md:block h-full">
              <SheetTable
                headers={headers}
                rows={list}
                showMark
                onMark={setConfirmRow}
                busyId={busyId}
                fillHeight
                emptyMessage="No student matched that search."
              />
            </div>
          </>
        ) : walkIns.length ? (
          <div className="mt-4">
            <h2 className="font-display text-xl mb-2">Your walk-ins</h2>
            <ExceptionPanel
              items={walkIns}
              onCancel={async (row) => {
                await api.post(`/api/exceptions/${row.id}/cancel`);
                await loadWalkIns();
              }}
            />
          </div>
        ) : null}
      </div>

      <ConfirmMarkModal
        row={confirmRow}
        busy={Boolean(busyId)}
        offline={!online}
        onCancel={() => setConfirmRow(null)}
        onConfirm={confirmMark}
      />

      {walkInOpen ? (
        <Modal title="Walk-in request" onClose={walkBusy ? undefined : () => { setWalkInOpen(false); setWalkInPhoto(null); }}>
          <p className="text-sm text-ink/70">
            Do not give the item until the hall admin approves this request.
          </p>
          <form className="mt-4 space-y-3" onSubmit={submitWalkIn}>
            <div>
              <label className="label">Full name</label>
              <input className="input" value={walkIn.fullName} onChange={(e) => setWalkIn((p) => ({ ...p, fullName: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Student index (if they have one)</label>
              <input className="input" value={walkIn.studentIndex} onChange={(e) => setWalkIn((p) => ({ ...p, studentIndex: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Level</label>
                <input className="input" value={walkIn.level} onChange={(e) => setWalkIn((p) => ({ ...p, level: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={walkIn.phone} onChange={(e) => setWalkIn((p) => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Why are they not on the list?</label>
              <textarea className="input min-h-[88px]" value={walkIn.reason} onChange={(e) => setWalkIn((p) => ({ ...p, reason: e.target.value }))} required />
            </div>
            <CameraCapture
              value={walkInPhoto}
              onChange={setWalkInPhoto}
              label="Photo (optional)"
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-ghost" disabled={walkBusy} onClick={() => { setWalkInOpen(false); setWalkInPhoto(null); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={walkBusy}>{walkBusy ? 'Sending…' : 'Send for approval'}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

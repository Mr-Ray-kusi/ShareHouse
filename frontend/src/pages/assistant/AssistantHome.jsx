import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Ban } from 'lucide-react';
import { io } from 'socket.io-client';
import api, { getAccessToken } from '../../api/client';
import { apiOrigin } from '../../api/baseUrl';
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
  completeSheetRow,
  fieldsFromSheetValues,
  formSheetHeaders,
  requiredSheetHeaders,
} from '../../utils/sheetColumns';

import {
  applyMarkToPack,
  enqueueException,
  enqueueMark,
  getPack,
  isNetworkError,
  listQueuedMarks,
  listQueuedExceptions,
  queueCounts,
  searchPack,
} from '../../offline/deskStore';
import { flushDeskQueue, hydratePackIfNeeded } from '../../offline/syncDesk';

function blankWalkIn(headers) {
  const values = {};
  for (const header of headers || []) values[header] = '';
  return values;
}

export default function AssistantHome() {
  const { tenant, user } = useAuth();
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
  const [walkIn, setWalkIn] = useState({});
  const [walkInReason, setWalkInReason] = useState('');
  const [walkInPhoto, setWalkInPhoto] = useState(null);
  const [walkIns, setWalkIns] = useState([]);
  const [walkBusy, setWalkBusy] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [populatedHeaders, setPopulatedHeaders] = useState([]);
  const [approvedQueue, setApprovedQueue] = useState([]);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const searchSeq = useRef(0);
  const pendingWalkInIds = useRef(new Set());

  function exceptionAsStudent(row) {
    return {
      id: row.beneficiaryId || row.id,
      studentIndex: row.studentIndex,
      fullName: row.fullName,
      level: row.level,
      phone: row.phone,
      sheetRow: row.sheetRow || {},
      collected: Boolean(row.markedOnApprove),
    };
  }

  function rememberApproved(row) {
    if (!row || row.status !== 'approved') return;
    setApprovedQueue((prev) => [row, ...prev.filter((item) => item.id !== row.id)]);
  }

  async function refreshQueue() {
    setQueue(await queueCounts());
  }

  async function loadMeta() {
    try {
      const { data } = await api.get('/api/collections/search', { params: { meta: 1 } });
      setDistribution(data.distribution);
      setHeaders(data.headers || []);
      setAssignment(data.assignment || null);
      setPopulatedHeaders(data.populatedHeaders || []);
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const pack = await getPack();
      if (pack) {
        setDistribution(pack.distribution);
        setHeaders(pack.headers || []);
        setAssignment(pack.assignment || null);
        setPopulatedHeaders(pack.populatedHeaders || []);
      } else {
        throw err;
      }
    }
  }

  async function loadWalkIns() {
    try {
      const { data } = await api.get('/api/exceptions', { params: { mine: 1 } });
      const items = data.exceptions || [];
      const prevPending = pendingWalkInIds.current;
      for (const row of items) {
        if (row.status === 'approved' && prevPending.has(row.id)) rememberApproved(row);
      }
      pendingWalkInIds.current = new Set(items.filter((row) => row.status === 'pending').map((row) => row.id));
      setWalkIns(items);
    } catch (_err) {
      /* keep last list when offline */
    }
  }

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return undefined;
    const socket = io(apiOrigin() || undefined, { auth: { token } });
    socket.on('exception:updated', (payload) => {
      const row = payload?.exception;
      if (!row) return;
      const mine = String(row.requestedBy || '') === String(user?.id || user?._id || '');
      setWalkIns((prev) => {
        const next = [row, ...prev.filter((item) => item.id !== row.id)];
        return next;
      });
      if (row.status === 'approved' && mine) {
        pendingWalkInIds.current.delete(row.id);
        rememberApproved(row);
        hydratePackIfNeeded().catch(() => {});
      } else if (row.status === 'pending' && mine) {
        pendingWalkInIds.current.add(row.id);
      } else {
        pendingWalkInIds.current.delete(row.id);
      }
    });
    return () => socket.disconnect();
  }, [user?.id, user?._id]);

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
            if (pack?.assignment !== undefined) setAssignment(pack.assignment || null);
            if (pack?.populatedHeaders) setPopulatedHeaders(pack.populatedHeaders);
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
      const rows = await mergeQueued(data.results || []);
      if (seq !== searchSeq.current) return;
      setDistribution(data.distribution);
      setHeaders(data.headers || []);
      setAssignment(data.assignment || null);
      if (data.populatedHeaders) setPopulatedHeaders(data.populatedHeaders);
      setList(rows);
      setSearched(true);
      setQ('');
    } catch (err) {
      if (seq !== searchSeq.current) return;
      if (isNetworkError(err)) {
        const pack = await getPack();
        const local = searchPack(pack, needle);
        const rows = await mergeQueued(local);
        if (seq !== searchSeq.current) return;
        setDistribution(pack?.distribution || null);
        setHeaders(pack?.headers || headers);
        setAssignment(pack?.assignment || null);
        if (pack?.populatedHeaders) setPopulatedHeaders(pack.populatedHeaders);
        setList(rows);
        setSearched(true);
        setQ('');
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

  async function lookupStudent(item) {
    const needle = String(item.studentIndex || item.fullName || '').trim();
    if (needle.length < 2) return null;
    try {
      const { data } = await api.get('/api/collections/search', { params: { q: needle } });
      if (data.headers) setHeaders(data.headers);
      if (data.populatedHeaders) setPopulatedHeaders(data.populatedHeaders);
      if (data.distribution) setDistribution(data.distribution);
      const results = data.results || [];
      return results.find((row) => String(row.id) === String(item.beneficiaryId || item.id))
        || results.find((row) => String(row.studentIndex || '').toUpperCase() === String(item.studentIndex || '').toUpperCase())
        || null;
    } catch (err) {
      if (!isNetworkError(err)) return null;
      const pack = await getPack();
      const local = searchPack(pack, needle);
      return local.find((row) => String(row.id) === String(item.beneficiaryId || item.id))
        || local.find((row) => String(row.studentIndex || '').toUpperCase() === String(item.studentIndex || '').toUpperCase())
        || null;
    }
  }

  async function revealDeskStudents() {
    if (noticeOpen) {
      searchSeq.current += 1;
      setNoticeOpen(false);
      setSearched(false);
      setList([]);
      setError('');
      setLoading(false);
      return;
    }
    const pending = walkIns.filter((row) => row.status === 'pending');
    const approved = [
      ...approvedQueue,
      ...walkIns.filter((row) => row.status === 'approved'),
    ];
    setError('');
    setLoading(true);
    searchSeq.current += 1;
    try {
      const queuedMarks = (await listQueuedMarks()) || [];
      const queuedWalkIns = (await listQueuedExceptions()) || [];
      const rows = [];
      const seen = new Set();
      function addRow(row) {
        if (!row) return;
        const key = String(row.id || row.beneficiaryId || '');
        if (!key || seen.has(key)) return;
        seen.add(key);
        rows.push(row);
      }
      for (const item of queuedMarks) {
        const row = item.row || {};
        addRow({
          ...row,
          id: item.beneficiaryId || item.id || row.id,
          queued: true,
          collected: Boolean(row.collected),
        });
      }
      for (const item of approved) {
        addRow((await lookupStudent(item)) || exceptionAsStudent(item));
      }
      for (const item of queuedWalkIns) {
        addRow(exceptionAsStudent(item));
      }
      setApprovedQueue([]);
      setList(await mergeQueued(rows));
      setSearched(true);
      setQ('');
      setNoticeOpen(true);
      if (!rows.length && !pending.length) {
        setError('No waiting or approved student to show yet.');
      }
    } finally {
      setLoading(false);
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
    const sheetRow = completeSheetRow(walkIn, headers.length ? headers : walkInCols);
    const fields = fieldsFromSheetValues(sheetRow, headers.length ? headers : walkInCols);
    const form = new FormData();
    form.append('fullName', fields.fullName);
    form.append('studentIndex', fields.studentIndex);
    form.append('level', fields.level);
    form.append('phone', fields.phone);
    form.append('reason', walkInReason.trim());
    form.append('sheetRow', JSON.stringify(sheetRow));
    if (walkInPhoto) form.append('photo', walkInPhoto);
    try {
      const { data } = await api.post('/api/exceptions', form);
      setFlash(data.message);
      setWalkIn(blankWalkIn(headers));
      setWalkInReason('');
      setWalkInPhoto(null);
      setWalkInOpen(false);
      await loadWalkIns();
      setTimeout(() => setFlash(null), 2800);
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueException({
          ...fields,
          reason: walkInReason.trim(),
          sheetRow,
          photoBlob: walkInPhoto || null,
          photoName: walkInPhoto?.name,
        });
        setFlash('Walk-in queued. It will send when you are back online. Do not give the item until it is approved.');
        setWalkIn(blankWalkIn(headers));
        setWalkInReason('');
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

  const walkInCols = formSheetHeaders(headers, populatedHeaders);
  const walkInRequired = requiredSheetHeaders(walkInCols, walkInCols);
  const pendingWalkIns = walkIns.filter((row) => row.status === 'pending');
  const approvedWalkIns = walkIns.filter((row) => row.status === 'approved');
  const noticeCount = approvedWalkIns.length + pendingWalkIns.length + queue.marks + queue.exceptions;
  const noticeLabel = `${
    approvedWalkIns.length
      ? `${approvedWalkIns.length} approved walk-in${approvedWalkIns.length === 1 ? '' : 's'}`
      : pendingWalkIns.length
        ? `${pendingWalkIns.length} walk-in${pendingWalkIns.length === 1 ? '' : 's'} waiting`
        : `${queue.marks} mark${queue.marks === 1 ? '' : 's'} and ${queue.exceptions} walk-in${queue.exceptions === 1 ? '' : 's'} waiting to sync`
  }. ${noticeOpen ? 'Tap to hide' : 'Tap to show'}`;

  return (
    <div className="h-full min-h-0 flex flex-col px-3 pt-3 pb-2 max-w-6xl mx-auto">
      <div className="shrink-0 space-y-2">
        <HallHero
          compact
          eyebrow="Collection desk"
          title={tenant?.name || 'ShareHouse'}
          subtitle={
            distribution
              ? `${distribution.title} · ${assignment?.values?.length
                ? `only ${assignment.column} ${assignment.values.join(', ')}`
                : 'search a student to verify'}`
              : 'No active distribution yet.'
          }
        />
        <div className="flex flex-wrap gap-2 text-xs items-center">
          <span className={`rounded-full px-2.5 py-1 font-semibold ${online ? 'bg-forest-100 text-forest-800' : 'bg-gold-400 text-ink'}`}>
            {online ? 'Online' : 'Offline — using the saved list'}
          </span>
          {noticeCount > 0 ? (
            <button
              type="button"
              className="relative rounded-full bg-gold-400 px-2.5 py-1 font-semibold text-ink"
              onClick={revealDeskStudents}
            >
              {(approvedQueue.length || pendingWalkIns.length || approvedWalkIns.length) ? (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-gold-400 ring-2 ring-white animate-ping" />
              ) : null}
              {noticeLabel}
            </button>
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
        <div className="relative">
          <SearchBar
          value={q}
          onChange={(next) => {
            searchSeq.current += 1;
            setQ(next);
            setSearched(false);
            setNoticeOpen(false);
            setList([]);
            setLoading(false);
          }}
          onSearch={runSearch}
          debounceMs={1000}
          placeholder={
            assignment?.values?.length
              ? `Search your ${assignment.column} students`
              : 'Search name, ID, or program'
          }
        />
        </div>
        <p className="text-xs text-ink/60">
          {loading
            ? 'Searching…'
            : searched
              ? (list.length
                ? `${list.length} match${list.length === 1 ? '' : 'es'}.`
                : (assignment?.values?.length
                  ? 'No student in your section matched that search.'
                  : 'No student matched that search.'))
              : (assignment?.values?.length
                ? `You can verify ${assignment.column} ${assignment.values.join(', ')}. Search the student in front of you, then confirm.`
                : 'Search the student in front of you, then confirm before you verify.')}
        </p>
        {searched ? (
          <button type="button" className="btn-ghost text-xs" onClick={() => {
            setWalkIn(blankWalkIn(headers));
            setWalkInReason('');
            setWalkInPhoto(null);
            setWalkInOpen(true);
          }}>
            Not on the list? Request a walk-in
          </button>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 mt-2 overflow-y-auto md:overflow-hidden">
        {searched ? (
          <>
            <div className="md:hidden pb-4">
              {list.length ? (
                <ResultCards
                  headers={headers}
                  rows={list}
                  showMark
                  onMark={setConfirmRow}
                  busyId={busyId}
                />
              ) : (!noticeOpen || !pendingWalkIns.length) ? (
                <p className="p-4 text-sm text-ink/60">
                  {noticeOpen
                    ? 'No waiting or approved student to show yet.'
                    : (assignment?.values?.length ? 'No student in your section matched that search.' : 'No student matched that search.')}
                </p>
              ) : null}
              {noticeOpen && pendingWalkIns.length ? (
                <div className={list.length ? 'mt-3' : ''}>
                  <ExceptionPanel
                    items={pendingWalkIns}
                    compact
                    onCancel={async (row) => {
                      await api.post(`/api/exceptions/${row.id}/cancel`);
                      await loadWalkIns();
                    }}
                  />
                </div>
              ) : null}
            </div>
            <div className="hidden md:block h-full">
              {list.length ? (
                <SheetTable
                  headers={headers}
                  rows={list}
                  showMark
                  onMark={setConfirmRow}
                  busyId={busyId}
                  fillHeight={!noticeOpen || !pendingWalkIns.length}
                  emptyMessage={assignment?.values?.length ? 'No student in your section matched that search.' : 'No student matched that search.'}
                />
              ) : null}
              {noticeOpen && pendingWalkIns.length ? (
                <div className={list.length ? 'mt-3' : ''}>
                  <ExceptionPanel
                    items={pendingWalkIns}
                    compact
                    onCancel={async (row) => {
                      await api.post(`/api/exceptions/${row.id}/cancel`);
                      await loadWalkIns();
                    }}
                  />
                </div>
              ) : null}
            </div>
          </>
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
        <Modal wide title="Walk-in request" onClose={walkBusy ? undefined : () => { setWalkInOpen(false); setWalkInPhoto(null); }}>
          <p className="text-sm text-ink/70">
            Fill the same columns as the hall list. Empty columns are not asked for. Do not give the item until the hall admin approves this request.
          </p>
          <form className="mt-4 space-y-3" onSubmit={submitWalkIn}>
            {walkInCols.length ? walkInCols.map((header) => (
                <div key={header}>
                  <label className="label">{header}</label>
                  <input
                    className="input"
                    value={walkIn[header] || ''}
                    onChange={(e) => setWalkIn((prev) => ({ ...prev, [header]: e.target.value }))}
                    required={walkInRequired.has(header)}
                  />
                </div>
            )) : (
              <p className="text-sm text-red-700">The hall list columns have not loaded. Search once while online, then try again.</p>
            )}
            <div>
              <label className="label">Why are they not on the list?</label>
              <textarea className="input min-h-[88px]" value={walkInReason} onChange={(e) => setWalkInReason(e.target.value)} required />
            </div>
            <CameraCapture
              value={walkInPhoto}
              onChange={setWalkInPhoto}
              label="Photo (optional)"
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-ghost" disabled={walkBusy} onClick={() => { setWalkInOpen(false); setWalkInPhoto(null); }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={walkBusy || !walkInCols.length}>{walkBusy ? 'Sending…' : 'Send for approval'}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

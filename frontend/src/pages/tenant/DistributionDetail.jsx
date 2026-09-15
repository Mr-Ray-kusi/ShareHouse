import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import SearchBar, { ColumnFilters, applyFilters, rowMatchesQuery } from '../../components/SearchBar';
import HallHero from '../../components/HallHero';
import UploadPreviewModal from '../../components/UploadPreviewModal';
import StudentEditor from '../../components/StudentEditor';
import ExceptionPanel, { reviewWalkIn } from '../../components/ExceptionPanel';

export default function DistributionDetail() {
  const { id } = useParams();
  const { tenant, supportMode } = useAuth();
  const isSrc = tenant?.subscriptionPlan === 'src';
  const [dist, setDist] = useState(null);
  const [list, setList] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});
  const [uploadMsg, setUploadMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [editor, setEditor] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [exceptionBusy, setExceptionBusy] = useState('');

  async function load(search) {
    const { data } = await api.get(`/api/distributions/${id}/beneficiaries`, {
      params: search ? { q: search } : {},
    });
    setDist(data.distribution);
    setHeaders(data.headers || []);
    return data.beneficiaries || [];
  }

  async function loadExceptions() {
    try {
      const { data } = await api.get('/api/exceptions', { params: { distributionId: id } });
      setExceptions(data.exceptions || []);
    } catch (_err) {
      /* ignore */
    }
  }

  useEffect(() => {
    load()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Not found.'));
    loadExceptions();
  }, [id]);

  async function startPreview(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    setUploadMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(`/api/distributions/${id}/beneficiaries/preview`, form, { timeout: 60000 });
      setPendingFile(file);
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not read that Excel file.');
    } finally {
      setBusy(false);
    }
  }

  async function applyUpload(options) {
    if (!pendingFile) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      form.append('removeMissing', options.removeMissing ? 'true' : 'false');
      form.append('resetMarks', options.resetMarks ? 'true' : 'false');
      form.append('confirmRemoveCollected', options.confirmRemoveCollected ? 'true' : 'false');
      form.append('confirmResetMarks', options.confirmResetMarks ? 'true' : 'false');
      const { data } = await api.post(`/api/distributions/${id}/beneficiaries`, form, { timeout: 60000 });
      setUploadMsg(`${data.message}${data.skipped?.length ? ` · ${data.skipped.length} rows skipped` : ''}`);
      setPreview(null);
      setPendingFile(null);
      const rows = await load();
      setList(rows);
      setFilters({});
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    setBusy(true);
    try {
      const { data } = await api.patch(`/api/distributions/${id}/status`, { status });
      setDist(data.distribution);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update status.');
    } finally {
      setBusy(false);
    }
  }

  async function saveStudent(fields) {
    setBusy(true);
    setError('');
    try {
      if (editor?.id) {
        await api.patch(`/api/distributions/${id}/beneficiaries/${editor.id}`, fields);
      } else {
        await api.post(`/api/distributions/${id}/beneficiaries/manual`, fields);
      }
      setEditor(null);
      setList(await load());
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save that student.');
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(row) {
    const collected = Boolean(row.collected);
    const ok = window.confirm(
      collected
        ? `Remove ${row.fullName}? They already collected. This voids that mark.`
        : `Remove ${row.fullName} from the list?`
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/api/distributions/${id}/beneficiaries/${row.id}`, {
        params: collected ? { confirmCollected: true } : {},
      });
      setList(await load());
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove that student.');
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const csv = 'Student Index,Full Name,Level,Phone\nKNUST/001/24,Ama Boateng,400,0240000000\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sharehouse-beneficiaries.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const needle = q.trim();
  const filtered = useMemo(() => {
    const searched = needle ? list.filter((row) => rowMatchesQuery(row, needle)) : list;
    return applyFilters(searched, filters, headers);
  }, [list, filters, headers, needle]);

  const pendingWalkIns = exceptions.filter((row) => row.status === 'pending');

  if (!dist) return <p className="text-ink/60">{error || 'Loading…'}</p>;

  return (
    <div>
      <HallHero
        eyebrow={dist.status}
        title={dist.title}
        subtitle={`${dist.itemName || 'Welfare item'} · ${dist.beneficiaryCount} on list · ${dist.receivedCount} received${tenant?.name ? ` · ${tenant.name}` : ''}`}
      />

      {!supportMode && (
        <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
          {dist.status === 'active' ? (
            <button className="btn-ghost" disabled={busy} onClick={() => setStatus('completed')}>Mark completed</button>
          ) : (
            <button className="btn-primary" disabled={busy} onClick={() => setStatus('active')}>Make active</button>
          )}
          <label className="btn-gold cursor-pointer text-center">
            {busy ? 'Reading…' : 'Update Excel list'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={startPreview} disabled={busy} />
          </label>
          <button className="btn-ghost" onClick={() => setEditor({})}>Add one student</button>
          <button className="btn-ghost" onClick={downloadTemplate}>Download Excel template (CSV)</button>
        </div>
      )}
      {uploadMsg && <p className="text-sm text-forest-700 mt-3">{uploadMsg}</p>}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

      {pendingWalkIns.length > 0 && !supportMode && (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Walk-ins waiting</h2>
          <p className="text-sm text-ink/60 mt-1">
            {isSrc
              ? 'SRC can monitor walk-ins. Only the hall president can approve a student.'
              : 'Approve only if you are sure they should collect.'}
          </p>
          <div className="mt-3">
            <ExceptionPanel
              items={pendingWalkIns}
              canReview={!supportMode && !isSrc}
              busyId={exceptionBusy}
              onApprove={async (row, markReceived) => {
                setExceptionBusy(row.id);
                try {
                  await reviewWalkIn(row.id, 'approve', { markReceived });
                  await loadExceptions();
                  setList(await load());
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

      <div className="mt-8 max-w-2xl">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Search name or ID — any capitalization"
        />
      </div>

      <div className="mt-6">
        <ColumnFilters headers={headers} rows={list} filters={filters} onChange={setFilters} />
        <div className="mt-3">
          <SheetTable
            headers={headers}
            rows={filtered}
            onEdit={supportMode ? undefined : setEditor}
            extraColumns={supportMode ? [] : [{
              header: 'Remove',
              cell: (row) => (
                <button type="button" className="btn-ghost text-xs py-1 px-2" onClick={() => removeStudent(row)}>
                  Remove
                </button>
              ),
            }]}
            emptyMessage={needle ? 'No student matched that search.' : undefined}
          />
        </div>
      </div>

      {preview ? (
        <UploadPreviewModal
          preview={preview}
          busy={busy}
          onCancel={() => {
            setPreview(null);
            setPendingFile(null);
          }}
          onApply={applyUpload}
        />
      ) : null}

      {editor ? (
        <StudentEditor
          key={editor.id || 'new'}
          student={editor.id ? editor : null}
          headers={headers}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={saveStudent}
        />
      ) : null}
    </div>
  );
}

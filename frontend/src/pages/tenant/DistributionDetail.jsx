import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import SearchBar, { ColumnFilters, applyFilters, rowMatchesQuery } from '../../components/SearchBar';
import HallHero from '../../components/HallHero';
import UploadPreviewModal from '../../components/UploadPreviewModal';
import StudentEditor from '../../components/StudentEditor';
import ExceptionPanel, { reviewWalkIn } from '../../components/ExceptionPanel';

function getPaystackCheckoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && (url.hostname === 'paystack.com' || url.hostname.endsWith('.paystack.com'))) {
      return url.href;
    }
  } catch {
    return '';
  }
  return '';
}

export default function DistributionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenant, supportMode } = useAuth();
  const isSrc = tenant?.subscriptionPlan === 'src';
  const [dist, setDist] = useState(null);
  const [billing, setBilling] = useState(null);
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
  const [removing, setRemoving] = useState(false);

  async function load(search) {
    const { data } = await api.get(`/api/distributions/${id}/beneficiaries`, {
      params: search ? { q: search } : {},
    });
    setDist(data.distribution);
    setBilling(data.billing);
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
      setDist(data.distribution);
      setBilling(data.billing);
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
    setError('');
    try {
      if (status === 'active') {
        const { data } = await api.post(
          `/api/payments/distributions/${id}/initialize`,
          {},
          { timeout: 35_000 }
        );
        const checkoutUrl = getPaystackCheckoutUrl(
          data.payment?.authorization_url || data.distribution?.paymentUrl
        );
        if (checkoutUrl) {
          window.location.assign(checkoutUrl);
          return;
        }
        if (data.alreadyPaid) {
          const { data: activeData } = await api.patch(`/api/distributions/${id}/status`, { status });
          setDist(activeData.distribution);
          return;
        }
        throw new Error('Payment was initialized, but Paystack did not return a valid checkout link. Please try again.');
      }

      const { data } = await api.patch(`/api/distributions/${id}/status`, { status });
      setDist(data.distribution);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not update status.');
    } finally {
      setBusy(false);
    }
  }

  async function removeCampaign() {
    const ok = window.confirm(
      `Remove “${dist.title}”? The student list and collection history for this completed campaign will be deleted.`
    );
    if (!ok) return;
    setRemoving(true);
    setError('');
    try {
      await api.delete(`/api/distributions/${id}`, { timeout: 120000 });
      navigate('/app/distributions');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove that campaign.');
    } finally {
      setRemoving(false);
    }
  }

  async function saveStudent(fields) {
    setBusy(true);
    setError('');
    const knownIds = new Set(list.map((row) => row.id));
    try {
      const editing = Boolean(editor?.id);
      let data;
      if (editor?.id) {
        ({ data } = await api.patch(`/api/distributions/${id}/beneficiaries/${editor.id}`, fields));
      } else {
        ({ data } = await api.post(`/api/distributions/${id}/beneficiaries/manual`, fields));
      }
      const savedStudent = data.beneficiary;
      setEditor(null);
      setDist(data.distribution);
      setBilling(data.billing || {
        studentCount: data.distribution.beneficiaryCount,
        ratePesewas: 5,
        amountPesewas: data.distribution.beneficiaryCount * 5,
      });
      setList((current) => {
        const found = current.some((row) => row.id === savedStudent.id);
        const updated = editing && found
          ? current.map((row) => (row.id === savedStudent.id ? savedStudent : row))
          : [savedStudent, ...current.filter((row) => row.id !== savedStudent.id)];
        return updated.sort((a, b) => a.fullName.localeCompare(b.fullName));
      });
      if (!editing) {
        setQ('');
        setFilters({});
      }
      setUploadMsg(data.message);
    } catch (err) {
      if (!editor?.id && err.response?.status >= 500) {
        try {
          const rows = await load(fields.studentIndex || fields.fullName);
          const savedStudent = rows.find((row) => (
            !knownIds.has(row.id)
            && (fields.studentIndex
              ? row.studentIndex?.trim().toUpperCase() === fields.studentIndex.trim().toUpperCase()
              : row.fullName?.trim().replace(/\s+/g, ' ').toLowerCase()
                === fields.fullName.trim().replace(/\s+/g, ' ').toLowerCase()
                && row.level === fields.level
                && row.phone === fields.phone)
          ));
          if (savedStudent) {
            setEditor(null);
            setList((current) => (
              [savedStudent, ...current.filter((row) => row.id !== savedStudent.id)]
                .sort((a, b) => a.fullName.localeCompare(b.fullName))
            ));
            setQ('');
            setFilters({});
            setUploadMsg('Student saved successfully.');
            return;
          }
        } catch (_reconcileError) {
          // Keep the original save error if the follow-up check cannot reach the server.
        }
      }
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
  const studentCount = Number(billing?.studentCount ?? dist?.beneficiaryCount) || 0;
  const ratePesewas = Number(billing?.ratePesewas) || 5;
  const campaignAmountPesewas = Number.isSafeInteger(billing?.amountPesewas)
    ? billing.amountPesewas
    : studentCount * ratePesewas;
  const paymentMatchesList = (
    dist?.paymentStatus === 'paid'
    && dist.paymentStudentCount === studentCount
    && dist.paymentAmount === campaignAmountPesewas
  );

  if (!dist) return <p className="text-ink/60">{error || 'Loading…'}</p>;

  return (
    <div>
      <HallHero
        eyebrow={dist.status}
        title={dist.title}
        subtitle={`${dist.itemName || 'Welfare item'} · ${studentCount} on list · ${dist.receivedCount} received${tenant?.name ? ` · ${tenant.name}` : ''}`}
      />

      {!supportMode && (
        <div className="mt-5 flex flex-col gap-2 md:flex-row md:items-center md:flex-wrap">
          {dist.status === 'active' ? (
            <button className="btn-ghost" disabled={busy} onClick={() => setStatus('completed')}>Mark completed</button>
          ) : (
            <button className="btn-primary" disabled={busy} onClick={() => setStatus('active')}>
              {busy
                ? 'Preparing…'
                : paymentMatchesList
                  ? 'Activate paid campaign'
                  : `Pay GHS ${(campaignAmountPesewas / 100).toFixed(2)} and activate`}
            </button>
          )}
          <label className="btn-gold cursor-pointer text-center">
            {busy ? 'Reading…' : 'Update Excel list'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={startPreview} disabled={busy} />
          </label>
          <button className="btn-ghost" onClick={() => setEditor({})}>Add one student</button>
          <button className="btn-ghost" onClick={downloadTemplate}>Download Excel template (CSV)</button>
          {dist.status === 'completed' ? (
            <button type="button" className="btn-ghost text-red-700" disabled={busy || removing} onClick={removeCampaign}>
              <Trash2 size={16} />
              {removing ? 'Removing…' : 'Remove campaign'}
            </button>
          ) : null}
        </div>
      )}
      {!supportMode && dist.status !== 'active' && (
        <div className="mt-3 rounded-2xl border border-forest-700/15 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/70">
            {paymentMatchesList ? 'Campaign payment' : 'Amount to pay when activating'}
          </p>
          <p className="mt-1 font-display text-2xl text-forest-900">
            GHS {(campaignAmountPesewas / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-sm text-ink/60">
            {paymentMatchesList
              ? `Payment is confirmed for all ${studentCount} students on this campaign.`
              : `${studentCount} recipients × ${ratePesewas} pesewas (GHS ${(ratePesewas / 100).toFixed(2)}) each = GHS ${(campaignAmountPesewas / 100).toFixed(2)}. Payment is required only when you activate the campaign.`}
          </p>
        </div>
      )}
      {uploadMsg && <p className="text-sm text-forest-700 mt-3">{uploadMsg}</p>}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

      {pendingWalkIns.length > 0 && !supportMode && (
        <section className="mt-8">
          <h2 className="font-display text-2xl">Walk-ins waiting</h2>
          <p className="text-sm text-ink/60 mt-1">
            {isSrc
              ? 'Review assistant requests here. Approved students still require a paid active campaign before verification.'
              : 'Only the linked SRC administrator can approve or reject a walk-in.'}
          </p>
          <div className="mt-3">
            <ExceptionPanel
              items={pendingWalkIns}
              canReview={!supportMode && isSrc}
              allowMarkReceived={false}
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
          rows={list}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={saveStudent}
        />
      ) : null}
    </div>
  );
}

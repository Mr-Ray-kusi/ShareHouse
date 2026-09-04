import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import SearchBar, { ColumnFilters, applyFilters, rowMatchesQuery } from '../../components/SearchBar';
import HallHero from '../../components/HallHero';

export default function DistributionDetail() {
  const { id } = useParams();
  const { tenant, supportMode } = useAuth();
  const [dist, setDist] = useState(null);
  const [list, setList] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});
  const [uploadMsg, setUploadMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(search) {
    const { data } = await api.get(`/api/distributions/${id}/beneficiaries`, {
      params: search ? { q: search } : {},
    });
    setDist(data.distribution);
    setHeaders(data.headers || []);
    return data.beneficiaries || [];
  }

  useEffect(() => {
    load()
      .then(setList)
      .catch((err) => setError(err.response?.data?.message || 'Not found.'));
  }, [id]);

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    setUploadMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(`/api/distributions/${id}/beneficiaries`, form);
      setUploadMsg(`${data.message}${data.skipped?.length ? ` · ${data.skipped.length} rows skipped` : ''}`);
      const rows = await load();
      setList(rows);
      setFilters({});
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed.');
    } finally {
      setBusy(false);
      e.target.value = '';
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

  function downloadTemplate() {
    const csv = 'Student Index,Full Name,Level,Phone\nKNUST/001/24,Ama Boateng,400,0240000000\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'welfareshare-beneficiaries.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const needle = q.trim();
  const filtered = useMemo(() => {
    const searched = needle ? list.filter((row) => rowMatchesQuery(row, needle)) : list;
    return applyFilters(searched, filters, headers);
  }, [list, filters, headers, needle]);

  if (!dist) return <p className="text-ink/60">{error || 'Loading…'}</p>;

  return (
    <div>
      <HallHero
        eyebrow={dist.status}
        title={dist.title}
        subtitle={`${dist.itemName || 'Welfare item'} · ${dist.beneficiaryCount} on list · ${dist.receivedCount} received${tenant?.name ? ` · ${tenant.name}` : ''}`}
      />

      {!supportMode && (
        <div className="flex flex-wrap gap-2 mt-5">
          {dist.status !== 'active' && (
            <button className="btn-primary" disabled={busy} onClick={() => setStatus('active')}>Make active</button>
          )}
          {dist.status === 'active' && (
            <button className="btn-ghost" disabled={busy} onClick={() => setStatus('completed')}>Mark completed</button>
          )}
          <button className="btn-ghost" onClick={downloadTemplate}>Download Excel template (CSV)</button>
          <label className="btn-gold cursor-pointer">
            {busy ? 'Uploading…' : 'Upload Excel list'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={upload} disabled={busy} />
          </label>
        </div>
      )}
      {uploadMsg && <p className="text-sm text-forest-700 mt-3">{uploadMsg}</p>}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

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
          <SheetTable headers={headers} rows={filtered} emptyMessage={needle ? 'No student matched that search.' : undefined} />
        </div>
      </div>
    </div>
  );
}

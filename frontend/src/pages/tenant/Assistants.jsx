import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Copy, Check, Download, Printer, Trash2 } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import SheetTable from '../../components/SheetTable';
import { downloadCsv, printSheet, sortSheetRows } from '../../utils/sheetExport';
import HallHero from '../../components/HallHero';
import AssistantAssignmentFields, { assignmentSummary } from '../../components/AssistantAssignmentFields';

function assignmentColumnsFromRoster(headers, beneficiaries) {
  const identityHeaders = [
    'id', 'id no', 'student index', 'index number', 'index no', 'index', 'matric', 'student id',
    'full name', 'student name', 'name', 'first name', 'last name', 'surname',
    'phone', 'phone number', 'mobile', 'email', 'contact',
  ];
  const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return headers.filter(Boolean).map((header) => ({
    header,
    disabled: identityHeaders.some((identity) => (
      normalize(header) === identity || normalize(header).startsWith(`${identity} `)
    )),
    values: [...new Set(beneficiaries
      .map((row) => {
        const key = Object.keys(row.sheetRow || {}).find((item) => normalize(item) === normalize(header));
        return String(key ? row.sheetRow[key] : '').trim();
      })
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .slice(0, 60),
  }));
}

export default function Assistants() {
  const { tenant, supportMode } = useAuth();
  const { pathname } = useLocation();
  const [invites, setInvites] = useState([]);
  const [halls, setHalls] = useState([]);
  const [joinUrl, setJoinUrl] = useState('');
  const [joinPath, setJoinPath] = useState('');
  const [hallName, setHallName] = useState('');
  const [hallId, setHallId] = useState('');
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [openId, setOpenId] = useState('');
  const [verified, setVerified] = useState({ headers: [], results: [] });
  const [loadingList, setLoadingList] = useState(false);
  const [assignmentDistributionId, setAssignmentDistributionId] = useState('');
  const [roster, setRoster] = useState({ distributionId: '', headers: [], beneficiaries: [] });
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [copiedId, setCopiedId] = useState('');
  const [oneTimePasswords, setOneTimePasswords] = useState({});
  const [assignColumns, setAssignColumns] = useState([]);
  const [assignColumn, setAssignColumn] = useState('');
  const [assignValues, setAssignValues] = useState([]);
  const [editId, setEditId] = useState('');
  const [editHallId, setEditHallId] = useState('');

  async function load(preferredHallId = '') {
    setError('');
    setRosterError('');
    const [inviteResult, hallResult, distributionResult] = await Promise.allSettled([
      api.get('/api/invites'),
      api.get('/api/invites/halls'),
      api.get('/api/distributions'),
    ]);
    if (inviteResult.status === 'fulfilled') {
      const { data } = inviteResult.value;
      setInvites(data.invites || []);
      setJoinUrl(data.joinUrl || '');
      setJoinPath(data.joinPath || '');
    } else {
      setError(inviteResult.reason.response?.data?.message || 'Could not load assistants.');
    }

    if (hallResult.status === 'fulfilled') {
      setHalls(hallResult.value.data.halls || []);
    } else {
      setError(hallResult.reason.response?.data?.message || 'Could not load hall allocations.');
    }

    if (distributionResult.status !== 'fulfilled') {
      setRosterError(distributionResult.reason.response?.data?.message || 'Could not load the active student list.');
      return;
    }

    const distributions = distributionResult.value.data.distributions || [];
    const currentDistribution = distributions.find((distribution) => distribution.status === 'active')
      || distributions[0];
    const nextDistributionId = currentDistribution?._id || '';
    if (nextDistributionId !== assignmentDistributionId) {
      setAssignColumns([]);
      setAssignColumn('');
      setAssignValues([]);
      setRoster({ distributionId: '', headers: [], beneficiaries: [] });
    }
    setAssignmentDistributionId(nextDistributionId);
    const nextHalls = hallResult.status === 'fulfilled' ? hallResult.value.data.halls || [] : [];
    setHallId((current) => (
      nextHalls.some((hall) => hall._id === preferredHallId)
        ? preferredHallId
        : nextHalls.some((hall) => hall._id === current)
          ? current
          : nextHalls[0]?._id || ''
    ));
  }

  useEffect(() => {
    if (pathname !== '/app/assistants') return;
    load().catch((err) => setError(err.response?.data?.message || 'Could not load assistants.'));
  }, [pathname, tenant?.tenantId]);

  useEffect(() => {
    let active = true;
    if (!assignmentDistributionId) {
      setRoster({ distributionId: '', headers: [], beneficiaries: [] });
      setRosterLoading(false);
      setRosterError('');
      return () => {
        active = false;
      };
    }

    setRosterLoading(true);
    setRosterError('');
    api.get(`/api/distributions/${assignmentDistributionId}/beneficiaries`)
      .then(({ data }) => {
        if (active) {
          const headers = [...(data.headers || [])];
          const knownHeaders = new Set(headers.map((header) => String(header).toLowerCase().trim()));
          for (const beneficiary of data.beneficiaries || []) {
            for (const header of Object.keys(beneficiary.sheetRow || {})) {
              const key = header.toLowerCase().trim();
              if (!knownHeaders.has(key)) {
                headers.push(header);
                knownHeaders.add(key);
              }
            }
          }
          setRoster({
            distributionId: assignmentDistributionId,
            headers,
            beneficiaries: data.beneficiaries || [],
          });
        }
      })
      .catch((err) => {
        if (active) setRosterError(err.response?.data?.message || 'Could not load the current student list.');
      })
      .finally(() => {
        if (active) setRosterLoading(false);
      });

    return () => {
      active = false;
    };
  }, [assignmentDistributionId]);

  useEffect(() => {
    if (
      assignColumns.length
      || roster.distributionId !== assignmentDistributionId
      || !roster.headers.length
    ) return;
    const columns = assignmentColumnsFromRoster(roster.headers, roster.beneficiaries);
    const selected = columns.find((column) => !column.disabled && /hall/i.test(column.header) && column.values.length)
      || columns.find((column) => !column.disabled && column.values.length);
    setAssignColumns(columns);
    setAssignColumn(selected?.header || '');
    setAssignValues([]);
  }, [assignColumns.length, assignmentDistributionId, roster]);

  async function loadVerified(id) {
    setLoadingList(true);
    setError('');
    try {
      const { data } = await api.get(`/api/invites/${id}/collections`);
      setVerified({
        headers: data.headers || [],
        results: data.results || [],
        distribution: data.distribution || null,
      });
    } catch (err) {
      setVerified({ headers: [], results: [] });
      setError(err.response?.data?.message || 'Could not load verified students.');
    } finally {
      setLoadingList(false);
    }
  }

  function selectAssistant(id) {
    if (openId === id) {
      setOpenId('');
      setVerified({ headers: [], results: [] });
      return;
    }
    setOpenId(id);
    setSortKey('');
    setSortDir('asc');
    loadVerified(id);
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!label.trim()) {
        setError('Assistant name is required.');
        setBusy(false);
        return;
      }
      if (!hallId) {
        setError('Create or select a hall allocation first.');
        return;
      }
      const { data } = await api.post('/api/invites', {
        label: label.trim(),
        password: password.trim() || undefined,
        hallId,
      });
      setLabel('');
      setPassword('');
      setOneTimePasswords((current) => ({
        ...current,
        [data.invite._id]: data.invite.password,
      }));
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create invite.');
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword(id) {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/api/invites/${id}/password`, {
        password: resetPassword.trim() || undefined,
      });
      setResetId('');
      setResetPassword('');
      setOneTimePasswords((current) => ({
        ...current,
        [id]: data.invite.password,
      }));
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not set password.');
    } finally {
      setBusy(false);
    }
  }

  async function createHall(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!hallName.trim() || (assignColumn && assignValues.length !== 1)) {
        setError('Enter a hall name and choose one hall value, or select Whole list.');
        return;
      }
      const { data } = await api.post('/api/invites/halls', {
        name: hallName.trim(),
        wholeList: !assignColumn,
        ...(assignColumn ? {
          assignmentColumn: assignColumn,
          assignmentValues: assignValues,
        } : {}),
      });
      setHalls((current) => [
        ...current.filter((hall) => hall._id !== data.hall._id),
        data.hall,
      ].sort((a, b) => a.name.localeCompare(b.name)));
      setHallId(data.hall._id);
      setHallName('');
      setAssignValues([]);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create hall allocation.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteHall(hall) {
    if (!window.confirm(`Remove the ${hall.name} allocation?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/api/invites/halls/${hall._id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove that hall allocation.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment(id) {
    setBusy(true);
    setError('');
    try {
      if (!editHallId) {
        setError('Select a hall allocation for this assistant.');
        setBusy(false);
        return;
      }
      await api.patch(`/api/invites/${id}/assignment`, {
        hallId: editHallId,
      });
      setEditId('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save that section.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id) {
    if (!window.confirm('Revoke this assistant password?')) return;
    await api.post(`/api/invites/${id}/revoke`);
    await load();
  }

  async function restore(id) {
    await api.post(`/api/invites/${id}/restore`);
    await load();
  }

  async function remove(id) {
    if (!window.confirm('Delete this assistant? This cannot be undone.')) return;
    await api.post(`/api/invites/${id}/delete`);
    if (openId === id) {
      setOpenId('');
      setVerified({ headers: [], results: [] });
    }
    await load();
  }

  const openInvite = invites.find((inv) => inv._id === openId);
  const assistantTitle = openInvite?.label || openInvite?.assistantName || 'Assistant';
  const rows = useMemo(
    () => sortSheetRows(verified.results || [], sortKey, sortDir),
    [verified.results, sortKey, sortDir]
  );
  const fileBase = `${tenant?.tenantId || 'hall'}-${assistantTitle}`.replace(/\s+/g, '-');
  const inviteGroups = [
    ...halls.map((hall) => ({
      id: hall._id,
      name: hall.name,
      assistants: hall.assistants,
      invites: invites.filter((invite) => invite.hallId === hall._id),
    })),
    {
      id: 'unallocated',
      name: 'Unallocated assistants',
      assistants: null,
      invites: invites.filter((invite) => !halls.some((hall) => hall._id === invite.hallId)),
    },
  ].filter((group) => group.invites.length);

  async function copyPassword(id, value) {
    const text = String(value || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? '' : prev)), 1600);
  }

  function exportCurrent(mode) {
    const title = `${tenant?.name || 'Hall'} · ${assistantTitle} verified`;
    if (mode === 'print') printSheet(title, verified.headers || [], rows);
    else downloadCsv(`${fileBase}-verified.csv`, verified.headers || [], rows);
  }

  return (
    <div>
      <HallHero
        eyebrow={`${tenant?.schoolName || ''} · /${tenant?.tenantId || ''}`}
        title="Hall allocations"
        subtitle="Create a hall allocation from the student list, then add at least two assistants with separate passwords to each hall."
      />

      {(joinUrl || joinPath) && (
        <div className="card p-5 mt-6">
          <p className="text-xs uppercase tracking-widest text-forest-700">Shared hall link</p>
          <p className="mt-2 font-mono text-lg break-all">{joinUrl || joinPath}</p>
          <p className="text-sm text-ink/60 mt-1">Path: {joinPath}</p>
        </div>
      )}

      {!supportMode && (
        <>
          <section className="card p-5 mt-6 space-y-4">
            <div>
              <h2 className="font-display text-2xl">Create hall allocation</h2>
              <p className="text-sm text-ink/60 mt-1">Select the hall column and value from the uploaded list.</p>
            </div>
            {halls.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {halls.map((hall) => (
                  <div key={hall._id} className="rounded-xl border border-forest-100 bg-mist/50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{hall.name}</p>
                        <p className="text-xs text-ink/60">
                          {hall.assignmentColumn === '__whole_list__'
                            ? 'Whole student list'
                            : `${hall.assignmentColumn}: ${hall.assignmentValue}`}
                        </p>
                        <p className={`mt-1 text-xs ${hall.assistants.active >= 2 ? 'text-forest-700' : 'text-amber-800'}`}>
                          {hall.assistants.active} active assistant{hall.assistants.active === 1 ? '' : 's'} · minimum 2
                        </p>
                      </div>
                      {!hall.assistants.total ? (
                        <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => deleteHall(hall)}>
                          <Trash2 size={14} /> Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <form onSubmit={createHall} className="space-y-3">
              <input
                className="input"
                placeholder="Hall name (e.g. Hall One)"
                value={hallName}
                onChange={(e) => setHallName(e.target.value)}
                maxLength={80}
                required
              />
              <AssistantAssignmentFields
                columns={assignColumns}
                column={assignColumn}
                values={assignValues}
                onColumn={setAssignColumn}
                onValues={setAssignValues}
                disabled={busy || rosterLoading}
                singleValue
                columnLabel="Allocate students by"
                valueLabel="Allowed group"
              />
              {rosterError && <p className="text-sm text-red-700">{rosterError}</p>}
              {rosterLoading && <p className="text-xs text-ink/60">Loading active list columns…</p>}
              <button className="btn-primary" disabled={busy || (assignColumn && assignValues.length !== 1)}>
                {busy ? 'Saving…' : 'Create hall allocation'}
              </button>
            </form>
          </section>

          <form onSubmit={create} className="card p-5 mt-4 space-y-3">
            <h2 className="font-display text-2xl">Add assistant to a hall</h2>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
              <select className="input" value={hallId} onChange={(e) => setHallId(e.target.value)} required disabled={!halls.length}>
                <option value="">{halls.length ? 'Select a hall' : 'Create a hall allocation first'}</option>
                {halls.map((hall) => (
                  <option key={hall._id} value={hall._id}>
                    {hall.name} · {hall.assistants.active} active
                  </option>
                ))}
              </select>
              <input className="input" placeholder="Assistant name" value={label} onChange={(e) => setLabel(e.target.value)} required />
            <input
              className="input"
              type="text"
              placeholder="Unique password (leave blank to generate)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
              <button className="btn-primary" disabled={busy || !halls.length}>
                {busy ? 'Creating…' : 'Add assistant'}
              </button>
            </div>
            <p className="text-xs text-ink/60">Student verification stays disabled for a hall until it has at least two active assistants.</p>
          </form>
        </>
      )}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}

      <div className="mt-6 space-y-6">
        {inviteGroups.map((group) => (
          <section key={group.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl">{group.name}</h2>
              {group.assistants ? (
                <p className={`text-xs ${group.assistants.active >= 2 ? 'text-forest-700' : 'text-amber-800'}`}>
                  {group.assistants.active} active assistant{group.assistants.active === 1 ? '' : 's'} · minimum 2
                </p>
              ) : null}
            </div>
            <div className="space-y-3">
        {group.invites.map((inv) => {
          const open = openId === inv._id;
          const hall = halls.find((item) => item._id === inv.hallId);
          const secret = oneTimePasswords[inv._id] || inv.password || inv.passwordPlain || '';
          return (
            <div key={inv._id} className={`card overflow-hidden ${open ? 'ring-2 ring-forest-600' : ''}`}>
              <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left hover:opacity-80"
                  onClick={() => selectAssistant(inv._id)}
                >
                  <p className="font-semibold">
                    {inv.label || inv.assistantName || 'Assistant'}
                    {inv.assistantName && inv.label ? <span className="text-ink/50 font-normal"> · {inv.assistantName}</span> : null}
                  </p>
                  <p className="text-xs text-ink/60">
                    {inv.isActive ? 'Active' : 'Revoked'}
                    {` · ${hall?.name || 'Unallocated'}`}
                    {hall ? ` · ${assignmentSummary(inv)}` : ''}
                    {inv.assistantName ? '' : ' · not joined yet'}
                    {open ? ' · showing verified list' : ' · tap to view verified students'}
                  </p>
                </button>
                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                  {secret ? (
                    <button
                      type="button"
                      className="btn-ghost text-xs font-mono shrink-0"
                      title="Copy password"
                      onClick={() => copyPassword(inv._id, secret)}
                    >
                      {copiedId === inv._id ? <Check size={14} /> : <Copy size={14} />}
                      <span className="select-all">{secret}</span>
                    </button>
                  ) : null}
                  {!supportMode && (
                    <>
                      {inv.isActive && (
                        <button
                          type="button"
                          className="btn-ghost text-xs shrink-0"
                          onClick={() => { setResetId(inv._id); setResetPassword(''); }}
                        >
                          Set password
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost text-xs shrink-0"
                        onClick={() => {
                          if (editId === inv._id) {
                            setEditId('');
                            return;
                          }
                          setEditId(inv._id);
                          setEditHallId(inv.hallId || '');
                        }}
                      >
                        {editId === inv._id ? 'Cancel allocation' : 'Change hall'}
                      </button>
                      {inv.isActive ? (
                        <button type="button" className="btn-ghost text-xs text-red-700 shrink-0" onClick={() => revoke(inv._id)}>Revoke</button>
                      ) : (
                        <button type="button" className="btn-ghost text-xs shrink-0" onClick={() => restore(inv._id)}>Restore</button>
                      )}
                      <button type="button" className="btn-ghost text-xs text-red-700 shrink-0" onClick={() => remove(inv._id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editId === inv._id && (
                <form
                  className="px-4 pb-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveAssignment(inv._id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <label className="label" htmlFor={`assistant-hall-${inv._id}`}>Hall allocation</label>
                  <select
                    id={`assistant-hall-${inv._id}`}
                    className="input"
                    value={editHallId}
                    onChange={(e) => setEditHallId(e.target.value)}
                    disabled={busy}
                    required
                  >
                    <option value="">Select a hall</option>
                    {halls.map((hallOption) => (
                      <option key={hallOption._id} value={hallOption._id}>{hallOption.name}</option>
                    ))}
                  </select>
                  <button className="btn-primary" disabled={busy || !halls.length}>Save hall allocation</button>
                </form>
              )}
              {resetId === inv._id && (
                <form
                  className="px-4 pb-4 flex flex-col md:flex-row gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setNewPassword(inv._id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    className="input"
                    placeholder="New unique password (blank = generate)"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                  />
                  <button className="btn-primary" disabled={busy}>Save password</button>
                </form>
              )}
              {open && (
                <div className="border-t border-forest-100 p-4 bg-mist/30">
                  <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                    <div>
                      <h2 className="font-display text-xl">Verified by {assistantTitle}</h2>
                      <p className="text-sm text-ink/60 mt-1">
                        {loadingList ? 'Loading…' : `${rows.length} student${rows.length === 1 ? '' : 's'} verified.`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-ghost text-xs" onClick={() => exportCurrent('download')} disabled={!rows.length}>
                        <Download size={14} /> Download this list
                      </button>
                      <button className="btn-ghost text-xs" onClick={() => exportCurrent('print')} disabled={!rows.length}>
                        <Printer size={14} /> Print this list
                      </button>
                    </div>
                  </div>
                  <SheetTable
                    headers={verified.headers || []}
                    rows={rows}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={(key, dir) => {
                      setSortKey(key);
                      setSortDir(dir);
                    }}
                    emptyMessage={inv.assistantName ? 'This assistant has not verified anyone yet.' : 'This assistant has not joined yet.'}
                  />
                </div>
              )}
            </div>
          );
        })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import Modal from './Modal';

function SampleList({ items, empty }) {
  if (!items?.length) return empty ? <p className="text-xs text-ink/55">{empty}</p> : null;
  return (
    <ul className="mt-1 space-y-1 text-sm">
      {items.map((row) => (
        <li key={row.studentIndex}>
          <span className="font-semibold">{row.studentIndex}</span>
          {' · '}
          {row.fullName || row.to || row.from}
          {row.from && row.to && row.from !== row.to ? ` (${row.from} → ${row.to})` : ''}
        </li>
      ))}
    </ul>
  );
}

export default function UploadPreviewModal({ preview, busy, onCancel, onApply }) {
  const [removeMissing, setRemoveMissing] = useState(false);
  const [resetMarks, setResetMarks] = useState(false);
  const [typed, setTyped] = useState('');
  if (!preview) return null;

  const missingCollected = preview.missingFromFile?.collectedCount || 0;
  const canReset = resetMarks && (preview.needsConfirmReset ? typed.trim().toUpperCase() === 'RESET' : true);
  const canPrune = !resetMarks && removeMissing && missingCollected > 0
    ? typed.trim().toUpperCase() === 'REMOVE'
    : true;

  return (
    <Modal title="Review this Excel update" onClose={busy ? undefined : onCancel} wide>
      <p className="text-sm text-ink/70">
        {preview.fileName} · {preview.incomingCount} students in the file · {preview.existingCount} already on this list.
        Marks stay unless you choose to reset them.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-mist px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-forest-700/70">New</p>
          <p className="font-display text-3xl">{preview.added?.count || 0}</p>
          <SampleList items={preview.added?.sample} empty="No new IDs." />
        </div>
        <div className="rounded-2xl bg-mist px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-forest-700/70">Details changed</p>
          <p className="font-display text-3xl">{preview.updated?.count || 0}</p>
          <SampleList items={preview.updated?.sample} empty="No name or contact changes." />
        </div>
        <div className="rounded-2xl bg-mist px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-forest-700/70">Unchanged</p>
          <p className="font-display text-3xl">{preview.unchanged?.count || 0}</p>
        </div>
        <div className="rounded-2xl bg-mist px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-forest-700/70">On list, not in file</p>
          <p className="font-display text-3xl">{preview.missingFromFile?.count || 0}</p>
          <p className="text-xs text-ink/60">{missingCollected} of these already collected</p>
          <SampleList items={preview.missingFromFile?.sample} />
        </div>
      </div>
      {preview.skipped?.length ? (
        <p className="mt-3 text-sm text-ink/65">{preview.skipped.length} row(s) skipped in the file.</p>
      ) : null}

      <label className="mt-5 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={removeMissing}
          onChange={(e) => {
            setRemoveMissing(e.target.checked);
            setTyped('');
          }}
        />
        <span>Also remove students who are missing from this file. Their marks would be voided.</span>
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={resetMarks}
          onChange={(e) => {
            setResetMarks(e.target.checked);
            setTyped('');
          }}
        />
        <span>Replace the whole list and erase every mark. Only use this if the current list is wrong.</span>
      </label>

      {(resetMarks && preview.needsConfirmReset) || (removeMissing && missingCollected > 0 && !resetMarks) ? (
        <div className="mt-4">
          <label className="label">
            {resetMarks ? 'Type RESET to erase all marks' : 'Type REMOVE to drop collected students'}
          </label>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={resetMarks ? 'btn-danger' : 'btn-primary'}
          disabled={busy || !canReset || !canPrune}
          onClick={() => onApply({
            removeMissing: resetMarks || removeMissing,
            resetMarks,
            confirmRemoveCollected: removeMissing && missingCollected > 0,
            confirmResetMarks: resetMarks,
          })}
        >
          {busy ? 'Updating…' : resetMarks ? 'Replace list and reset marks' : 'Update list and keep marks'}
        </button>
      </div>
    </Modal>
  );
}

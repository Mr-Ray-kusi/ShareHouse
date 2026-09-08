import { useState } from 'react';
import Modal from './Modal';

export default function VoidMarkModal({ row, busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  if (!row) return null;
  return (
    <Modal title="Void this mark" onClose={busy ? undefined : onCancel}>
      <p className="text-sm text-ink/70">
        {row.fullName || row.beneficiaryName} · {row.studentIndex}. This only reverses a mistake.
        The student can be marked again.
      </p>
      <label className="label mt-4">Reason</label>
      <textarea
        className="input min-h-[96px]"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Wrong student, duplicate tap, or similar"
        required
      />
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
          Keep mark
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={busy || reason.trim().length < 3}
          onClick={() => onConfirm(reason.trim())}
        >
          {busy ? 'Voiding…' : 'Void mark'}
        </button>
      </div>
    </Modal>
  );
}

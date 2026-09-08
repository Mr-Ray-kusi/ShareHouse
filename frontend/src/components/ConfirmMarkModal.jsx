import Modal from './Modal';

export default function ConfirmMarkModal({ row, busy, offline, onCancel, onConfirm }) {
  if (!row) return null;
  const sheet = row.sheetRow || {};
  return (
    <Modal title="Confirm this student" onClose={busy ? undefined : onCancel}>
      <p className="text-sm text-ink/70">
        Check the name and ID with the person in front of you before you give the item.
      </p>
      <div className="mt-4 rounded-2xl bg-mist px-4 py-3">
        <p className="font-display text-2xl leading-tight">{row.fullName}</p>
        <p className="mt-1 text-sm font-semibold">{row.studentIndex}</p>
        {row.level ? <p className="text-sm text-ink/70">Level {row.level}</p> : null}
        {sheet.Program || sheet.Programme ? (
          <p className="text-sm text-ink/70">{sheet.Program || sheet.Programme}</p>
        ) : null}
      </div>
      {offline ? (
        <p className="mt-3 rounded-xl bg-gold-400/20 px-3 py-2 text-sm">
          You are offline. The mark will sit in a queue and sync when the phone reconnects.
          Do not give a second serving if another table may have already marked them.
        </p>
      ) : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Saving…' : 'Yes, mark received'}
        </button>
      </div>
    </Modal>
  );
}

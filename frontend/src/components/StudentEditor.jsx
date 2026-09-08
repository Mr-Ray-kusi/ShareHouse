import { useState } from 'react';
import Modal from './Modal';

const empty = { studentIndex: '', fullName: '', level: '', phone: '' };

export default function StudentEditor({ student, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    studentIndex: student?.studentIndex || '',
    fullName: student?.fullName || '',
    level: student?.level || '',
    phone: student?.phone || '',
  }));
  const editing = Boolean(student?.id);

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Modal title={editing ? 'Edit student' : 'Add student'} onClose={busy ? undefined : onClose}>
      {editing && student.collected ? (
        <p className="mb-3 rounded-xl bg-gold-400/20 px-3 py-2 text-sm">
          This student already collected. A spelling or ID fix keeps that mark.
        </p>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...empty, ...form });
        }}
      >
        <div>
          <label className="label">Student index</label>
          <input
            className="input"
            value={form.studentIndex}
            onChange={(e) => set('studentIndex', e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Full name</label>
          <input
            className="input"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Level</label>
            <input className="input" value={form.level} onChange={(e) => set('level', e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add to list'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

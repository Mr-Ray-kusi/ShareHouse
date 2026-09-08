import { useMemo, useState } from 'react';
import Modal from './Modal';
import {
  classifySheetHeaders,
  defaultSheetHeaders,
  fieldsFromSheetValues,
  requiredSheetHeaders,
} from '../utils/sheetColumns';

function initialValues(student, headers) {
  const sheet = student?.sheetRow || {};
  const roles = classifySheetHeaders(headers);
  const values = {};
  for (const header of headers) {
    values[header] = sheet[header] ?? '';
  }
  if (roles.index && !values[roles.index] && student?.studentIndex) {
    values[roles.index] = student.studentIndex;
  }
  if (roles.name && !values[roles.name] && student?.fullName) {
    values[roles.name] = student.fullName;
  }
  if (roles.level && !values[roles.level] && student?.level) {
    values[roles.level] = student.level;
  }
  if (roles.phone && !values[roles.phone] && student?.phone) {
    values[roles.phone] = student.phone;
  }
  return values;
}

export default function StudentEditor({ student, headers = [], busy, onClose, onSave }) {
  const cols = headers.length ? headers : defaultSheetHeaders();
  const required = useMemo(() => requiredSheetHeaders(cols), [cols]);
  const [values, setValues] = useState(() => initialValues(student, cols));
  const editing = Boolean(student?.id);

  function set(header, value) {
    setValues((prev) => ({ ...prev, [header]: value }));
  }

  return (
    <Modal title={editing ? 'Edit student' : 'Add student'} onClose={busy ? undefined : onClose} wide>
      <p className="text-sm text-ink/70">
        {headers.length
          ? 'These fields match the columns from the uploaded Excel sheet.'
          : 'Upload an Excel list first if you want this form to follow your sheet columns.'}
      </p>
      {editing && student.collected ? (
        <p className="mt-3 rounded-xl bg-gold-400/20 px-3 py-2 text-sm">
          This student already collected. A spelling or ID fix keeps that mark.
        </p>
      ) : null}
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(fieldsFromSheetValues(values, cols));
        }}
      >
        {cols.map((header) => (
          <div key={header}>
            <label className="label">{header}</label>
            <input
              className="input"
              value={values[header] || ''}
              onChange={(e) => set(header, e.target.value)}
              required={required.has(header)}
            />
          </div>
        ))}
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

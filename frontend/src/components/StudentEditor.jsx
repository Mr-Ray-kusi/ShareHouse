import { useMemo, useState } from 'react';
import Modal from './Modal';
import {
  classifySheetHeaders,
  completeSheetRow,
  defaultSheetHeaders,
  fieldsFromSheetValues,
  formSheetHeaders,
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
  if (!roles.name && student?.fullName) {
    const hasParts = [roles.lastName, roles.firstName, roles.otherName]
      .some((key) => key && String(values[key] || '').trim());
    if (!hasParts && roles.lastName) values[roles.lastName] = student.fullName;
  }
  if (roles.level && !values[roles.level] && student?.level) {
    values[roles.level] = student.level;
  }
  if (roles.phone && !values[roles.phone] && student?.phone) {
    values[roles.phone] = student.phone;
  }
  return values;
}

export default function StudentEditor({ student, headers = [], rows = [], busy, onClose, onSave }) {
  const allCols = headers.length ? headers : defaultSheetHeaders();
  const cols = useMemo(() => formSheetHeaders(allCols, rows, student), [allCols, rows, student]);
  const required = useMemo(() => requiredSheetHeaders(cols, cols), [cols]);
  const [values, setValues] = useState(() => initialValues(student, allCols));
  const editing = Boolean(student?.id);

  function set(header, value) {
    setValues((prev) => ({ ...prev, [header]: value }));
  }

  return (
    <Modal title={editing ? 'Edit student' : 'Add student'} onClose={busy ? undefined : onClose} wide>
      <p className="text-sm text-ink/70">
        {headers.length
          ? 'Only columns that already have values on this list are shown. The student is saved on the same Excel row as everyone else.'
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
          onSave(fieldsFromSheetValues(completeSheetRow(values, allCols), allCols));
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

import { useState } from 'react';

export function assignmentSummary(invite) {
  const column = String(invite?.assignmentColumn || '').trim();
  const values = Array.isArray(invite?.assignmentValues) ? invite.assignmentValues.filter(Boolean) : [];
  if (!column || !values.length) return 'Whole list';
  return `${column}: ${values.join(', ')}`;
}

export default function AssistantAssignmentFields({
  columns = [],
  column,
  values,
  onColumn,
  onValues,
  disabled,
}) {
  const [custom, setCustom] = useState('');
  const headers = columns.map((row) => row.header);
  const current = columns.find((row) => row.header === column);
  const options = current?.values || [];
  const extra = (values || []).filter((value) => !options.includes(value));

  function toggle(value) {
    if ((values || []).includes(value)) onValues(values.filter((item) => item !== value));
    else onValues([...(values || []), value]);
  }

  function addCustom() {
    const next = custom.trim();
    if (!next || !column) return;
    if (!(values || []).includes(next)) onValues([...(values || []), next]);
    setCustom('');
  }

  return (
    <div className="space-y-2">
      <label className="label">Who they can verify</label>
      <select
        className="input"
        value={column}
        disabled={disabled}
        onChange={(e) => {
          onColumn(e.target.value);
          onValues([]);
          setCustom('');
        }}
      >
        <option value="">Whole list</option>
        {column && !headers.includes(column) ? <option value={column}>{column}</option> : null}
        {columns.map((row) => (
          <option key={row.header} value={row.header}>{row.header}</option>
        ))}
      </select>
      {column ? (
        <>
          <p className="text-xs text-ink/60">
            Pick the {column} values this assistant should handle — for example only 100s, or one hall. You can choose more than one.
          </p>
          {options.length ? (
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {options.map((value) => {
                const on = (values || []).includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    className={on ? 'btn-primary text-xs py-1.5 px-3' : 'btn-ghost text-xs py-1.5 px-3'}
                    onClick={() => toggle(value)}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-ink/60">No {column} values on the current list yet. Type them below.</p>
          )}
          {extra.length ? (
            <div className="flex flex-wrap gap-2">
              {extra.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  className="btn-primary text-xs py-1.5 px-3"
                  onClick={() => toggle(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              className="input"
              placeholder={`Add a ${column} value`}
              value={custom}
              disabled={disabled}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <button type="button" className="btn-ghost shrink-0" disabled={disabled || !custom.trim()} onClick={addCustom}>
              Add
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-ink/60">Leave this on the whole list, or choose a column from the Excel sheet such as Level or Hall.</p>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import api, { getAccessToken } from '../api/client';
import { apiOrigin } from '../api/baseUrl';

function statusLabel(status) {
  if (status === 'pending') return 'Waiting';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  if (status === 'cancelled') return 'Cancelled';
  return status;
}

function PhotoThumb({ id, hasPhoto, photoBase = '/api/exceptions' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!hasPhoto || !id) return undefined;
    let revoke = '';
    const headers = {};
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    fetch(`${apiOrigin()}${photoBase}/${id}/photo`, { headers, credentials: 'include' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return;
        revoke = URL.createObjectURL(blob);
        setSrc(revoke);
      })
      .catch(() => {});
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [id, hasPhoto, photoBase]);
  if (!hasPhoto) return null;
  if (!src) return <p className="text-xs text-ink/50">Photo attached</p>;
  return <img src={src} alt="Walk-in photo" className="mt-2 h-24 w-24 rounded-xl object-cover" />;
}

export default function ExceptionPanel({
  items = [],
  canReview = false,
  busyId = '',
  photoBase = '/api/exceptions',
  onApprove,
  onReject,
  onCancel,
  emptyMessage = 'No walk-in requests.',
}) {
  if (!items.length) {
    return <p className="text-sm text-ink/60">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((row) => (
        <article key={row.id} className="rounded-2xl border border-forest-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{row.fullName}</p>
              <p className="text-sm text-ink/70">{row.studentIndex}</p>
              <p className="mt-1 text-sm">{row.reason}</p>
              <p className="mt-1 text-xs text-ink/55">
                {row.requestedByName}
                {row.level ? ` · Level ${row.level}` : ''}
                {row.phone ? ` · ${row.phone}` : ''}
              </p>
              {row.reviewNote && row.status !== 'pending' ? (
                <p className="mt-1 text-xs text-ink/60">{row.reviewNote}</p>
              ) : null}
              <PhotoThumb id={row.id} hasPhoto={row.hasPhoto} photoBase={photoBase} />
            </div>
            <span className="rounded-full bg-mist px-2 py-1 text-xs font-semibold uppercase tracking-wider">
              {statusLabel(row.status)}
            </span>
          </div>
          {row.status === 'pending' && canReview ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={busyId === row.id}
                onClick={() => onApprove?.(row, true)}
              >
                Approve and mark received
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                disabled={busyId === row.id}
                onClick={() => onApprove?.(row, false)}
              >
                Approve only
              </button>
              <button
                type="button"
                className="btn-danger text-xs"
                disabled={busyId === row.id}
                onClick={() => onReject?.(row)}
              >
                Reject
              </button>
            </div>
          ) : null}
          {row.status === 'pending' && onCancel && !canReview ? (
            <button
              type="button"
              className="btn-ghost mt-3 text-xs"
              disabled={busyId === row.id}
              onClick={() => onCancel?.(row)}
            >
              Cancel request
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export async function reviewWalkIn(id, action, extras = {}) {
  const { data } = await api.post(`/api/exceptions/${id}/review`, { action, ...extras });
  return data;
}

import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';

export default function UnitCodeBanner({
  code,
  compact = false,
  onRotate,
  rotating = false,
  canRotate = false,
}) {
  const [copied, setCopied] = useState(false);
  const value = String(code || '').trim();
  if (!value) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.left = '-9999px';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className={`rounded-2xl border border-gold-400/40 bg-gold-500/15 ${compact ? 'px-3 py-2' : 'p-4'} print:hidden`}>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 rounded-xl bg-gold-500 text-ink grid place-items-center">
          <KeyRound size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.16em] text-forest-800/70">Unit code · staff only</p>
          <p className="font-mono text-xl font-semibold tracking-[0.18em]">{value}</p>
        </div>
        <button type="button" className="btn-ghost text-xs shrink-0" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {!compact && (
        <p className="text-xs text-ink/60 mt-2">
          Students must enter this code after they tap Verify. Do not print it on the QR poster.
        </p>
      )}
      {canRotate && (
        <button
          type="button"
          className="btn-ghost text-xs mt-3"
          disabled={rotating}
          onClick={onRotate}
        >
          {rotating ? 'Rotating…' : 'New unit code'}
        </button>
      )}
    </div>
  );
}

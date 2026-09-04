import { useId, useMemo, useState } from 'react';

export function MetricCard({ label, value, hint, delta, icon: Icon, accent = false }) {
  const up = Number(delta) >= 0;
  return (
    <div className={`desk-card p-5 min-h-[132px] ${accent ? 'bg-[#2563eb] text-white' : 'text-slate-900'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-medium ${accent ? 'text-white/80' : 'text-slate-500'}`}>{label}</p>
          <p className="text-[1.85rem] font-semibold tracking-tight mt-2 leading-none">{value ?? '—'}</p>
        </div>
        {Icon ? (
          <div className={`h-11 w-11 rounded-2xl grid place-items-center ${accent ? 'bg-white/15' : 'bg-[#2563eb]/10 text-[#2563eb]'}`}>
            <Icon size={20} />
          </div>
        ) : null}
      </div>
      {(delta != null || hint) && (
        <p className={`text-xs mt-4 ${accent ? 'text-white/75' : 'text-slate-400'}`}>
          {delta != null && (
            <span className={accent ? 'text-white' : up ? 'text-emerald-600' : 'text-rose-500'}>
              {up ? '+' : ''}{delta}%
            </span>
          )}
          {hint ? ` ${hint}` : ''}
        </p>
      )}
    </div>
  );
}

function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaChart({
  data = [],
  valueKey = 'value',
  labelKey = 'label',
  height = 260,
  color = '#2563eb',
  unit = '',
}) {
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const width = 720;
  const padX = 28;
  const padY = 28;

  const chart = useMemo(() => {
    const rows = data.length ? data : [{ [labelKey]: '', [valueKey]: 0 }];
    const values = rows.map((r) => Number(r[valueKey]) || 0);
    const max = Math.max(1, ...values);
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const pts = rows.map((row, i) => {
      const x = padX + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
      const y = padY + innerH - (values[i] / max) * innerH;
      return { x, y, label: row[labelKey], value: values[i], i };
    });
    const line = smoothPath(pts);
    const area = pts.length
      ? `${line} L ${pts[pts.length - 1].x} ${height - padY} L ${pts[0].x} ${height - padY} Z`
      : '';
    const peak = pts.reduce((best, p) => (p.value > best.value ? p : best), pts[0] || { value: 0 });
    return { pts, line, area, max, peak, rows };
  }, [data, valueKey, labelKey, height]);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[240px] md:h-[280px]"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={width - padX}
            y1={padY + t * (height - padY * 2)}
            y2={padY + t * (height - padY * 2)}
            stroke="#e8edf5"
            strokeDasharray="4 6"
          />
        ))}
        <path d={chart.area} fill={`url(#fill-${gid})`} />
        <path d={chart.line} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
        {chart.pts.map((p) => (
          <circle
            key={p.i}
            cx={p.x}
            cy={p.y}
            r={hover?.i === p.i ? 6 : 0}
            fill="#fff"
            stroke={color}
            strokeWidth="3"
            onMouseEnter={() => setHover(p)}
          />
        ))}
        {chart.pts.map((p) => (
          <rect
            key={`h-${p.i}`}
            x={p.x - 16}
            y={padY}
            width="32"
            height={height - padY * 2}
            fill="transparent"
            onMouseEnter={() => setHover(p)}
          />
        ))}
        {chart.peak && chart.peak.value > 0 && (
          <g transform={`translate(${chart.peak.x}, ${chart.peak.y - 18})`}>
            <rect x="-34" y="-16" width="68" height="22" rx="11" fill="#0f172a" />
            <text x="0" y="0" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="600" dominantBaseline="middle">
              {chart.peak.value}{unit}
            </text>
          </g>
        )}
        {chart.pts.filter((_, i) => i % Math.ceil(chart.pts.length / 7) === 0 || i === chart.pts.length - 1).map((p) => (
          <text key={`l-${p.i}`} x={p.x} y={height - 8} textAnchor="middle" fill="#94a3b8" fontSize="11">
            {p.label}
          </text>
        ))}
      </svg>
      {hover && (
        <div className="absolute top-2 right-3 rounded-xl bg-slate-900 text-white text-xs px-3 py-1.5">
          {hover.label}: <strong>{hover.value}{unit}</strong>
        </div>
      )}
    </div>
  );
}

export function DonutChart({ slices = [], centerLabel = 'Total', centerValue }) {
  const size = 220;
  const r = 72;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1;
  let offset = 0;
  const rings = slices.map((slice) => {
    const value = Number(slice.value) || 0;
    const len = (value / total) * c;
    const item = { ...slice, dash: `${len} ${c - len}`, offset };
    offset += len;
    return item;
  });
  const display = centerValue ?? slices.reduce((s, x) => s + (Number(x.value) || 0), 0);

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth="22" />
        {rings.map((ring) => (
          <circle
            key={ring.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ring.color}
            strokeWidth="22"
            strokeDasharray={ring.dash}
            strokeDashoffset={-ring.offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
        <text x={size / 2} y={size / 2 - 8} textAnchor="middle" fill="#64748b" fontSize="12">{centerLabel}</text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fill="#0f172a" fontSize="22" fontWeight="700">{display}</text>
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="font-semibold text-slate-900">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProgressList({ items = [], labelKey = 'label', valueKey = 'value' }) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey]) || 0));
  if (!items.length) {
    return <p className="text-sm text-slate-400">No data in this window yet. It fills as the system is used.</p>;
  }
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const value = Number(item[valueKey]) || 0;
        const pct = Math.round((value / max) * 100);
        return (
          <div key={item[labelKey]}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="truncate pr-3 text-slate-600">{item[labelKey]}</span>
              <span className="text-slate-900 font-semibold">{item.suffix || `${pct}%`}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-[#2563eb]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DayStrip({ days = [], countKey = 'collections' }) {
  const month = days[0]?.date
    ? new Date(days[0].date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : '';
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-slate-900">{month || 'This week'}</p>
      </div>
      <div className="flex justify-between gap-2">
        {days.map((d) => (
          <div key={d.key} className="flex-1 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{d.weekday || d.label}</p>
            <div
              className={`mx-auto mt-2 h-11 w-11 rounded-full grid place-items-center text-sm font-semibold ${
                d.isToday ? 'bg-[#2563eb] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {d.dayNumber || d.date}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{d[countKey] || 0}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Panel({ title, children, className = '' }) {
  return (
    <section className={`desk-card p-5 ${className}`}>
      {title ? <h3 className="font-semibold text-slate-900 mb-4">{title}</h3> : null}
      {children}
    </section>
  );
}

export function PageIntro({ kicker, title, subtitle }) {
  return (
    <div className="mb-6">
      <p className="text-xs uppercase tracking-[0.18em] text-[#2563eb] font-semibold">{kicker}</p>
      <h1 className="text-3xl font-semibold text-slate-900 mt-1">{title}</h1>
      {subtitle ? <p className="text-slate-500 mt-1 text-sm max-w-2xl">{subtitle}</p> : null}
    </div>
  );
}

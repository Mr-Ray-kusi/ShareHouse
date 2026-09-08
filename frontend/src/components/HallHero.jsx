export default function HallHero({ eyebrow, title, subtitle, compact = false }) {
  return (
    <section
      className={`relative overflow-hidden rounded-[1.75rem] bg-forest-900 ${
        compact ? 'min-h-[88px] mb-2' : 'min-h-[160px] mb-6'
      }`}
    >
      <div className={`relative z-10 text-white ${compact ? 'px-4 py-4' : 'px-6 py-8'}`}>
        {eyebrow ? (
          <p className="text-xs uppercase tracking-[0.2em] text-gold-400">{eyebrow}</p>
        ) : null}
        <h1 className={`font-display mt-1 ${compact ? 'text-2xl' : 'text-4xl'}`}>{title}</h1>
        {subtitle ? <p className="text-white/80 mt-1">{subtitle}</p> : null}
      </div>
    </section>
  );
}

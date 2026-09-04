export default function HallHero({ eyebrow, title, subtitle, compact = false }) {
  return (
    <section
      className={`relative overflow-hidden rounded-[1.75rem] ${
        compact ? 'min-h-[88px] mb-2' : 'min-h-[160px] mb-6'
      }`}
    >
      <img
        src="/hero-queue.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[center_28%]"
      />
      <div className="absolute inset-0 bg-forest-900/70" />
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

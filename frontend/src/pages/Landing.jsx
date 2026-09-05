import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, ChevronLeft, ChevronRight, FileSpreadsheet, Link2, Radio } from 'lucide-react';

const highlights = [
  {
    icon: FileSpreadsheet,
    title: 'Excel list in one upload',
    body: 'Upload any Excel list. Columns are detected from the sheet — no required header names.',
  },
  {
    icon: Link2,
    title: 'Connect with Assistant',
    body: 'Invite each assistant with a unique password. Revoke any table whenever you need.',
  },
  {
    icon: Ban,
    title: 'No second serving',
    body: 'A student marked received stays marked. The unique index blocks duplicates.',
  },
  {
    icon: Radio,
    title: 'Live collection desk',
    body: 'Totals, pending count, and who marked whom as it happens.',
  },
];

export default function Landing() {
  const [start, setStart] = useState(0);
  const visible = 3;
  const cards = Array.from({ length: visible }, (_, i) => highlights[(start + i) % highlights.length]);

  function prev() {
    setStart((s) => (s - 1 + highlights.length) % highlights.length);
  }
  function next() {
    setStart((s) => (s + 1) % highlights.length);
  }

  return (
    <div className="min-h-screen bg-white text-ink">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-400 font-display text-lg text-ink">S</div>
            <span className="text-xl font-bold tracking-tight">ShareHouse</span>
          </Link>
          <div className="flex gap-2">
            <Link to="/login" className="btn-ghost">Sign in</Link>
            <Link to="/register" className="btn-primary">Start New</Link>
          </div>
        </div>
      </header>

      <section id="home" className="relative">
        <div className="relative min-h-[560px] md:min-h-[640px]">
          <img
            src="/hero-queue.png"
            alt="Students queuing for a hall welfare share while an assistant sits and hands out items"
            className="absolute inset-0 h-full w-full object-cover object-[center_28%]"
          />
          <div className="absolute inset-0 bg-ink/45" />
          <div className="relative z-10 mx-auto flex min-h-[560px] max-w-6xl items-center px-4 py-20 md:min-h-[640px] md:pb-36">
            <div className="max-w-xl text-white">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-gold-400">We are here to help your hall</p>
              <h1 className="mt-3 text-4xl font-black uppercase leading-[1.05] md:text-6xl">
                Welcome to<br />ShareHouse
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/85 md:text-base">
                Manage and control all your souvenirs, welfare items and many more on one single
                platform for live monitoring, avoid duplication, saves time and improve accountability.
              </p>
              <Link
                to="/register"
                className="mt-7 inline-flex rounded-full bg-gold-400 px-8 py-3 text-sm font-bold uppercase tracking-[0.12em] text-ink hover:bg-gold-500"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>

        <div className="relative z-20 mx-auto -mt-16 max-w-6xl px-4 pb-6">
          <div className="flex flex-col gap-6 rounded-[2rem] bg-ink px-6 py-7 text-white md:flex-row md:items-center md:px-10">
            <h2 className="max-w-xs text-2xl font-black uppercase leading-tight md:text-3xl">
              Best desk for a fair share day
            </h2>
            <div className="flex flex-1 items-center gap-3">
              <button type="button" onClick={prev} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400 text-ink md:inline-flex" aria-label="Previous">
                <ChevronLeft size={18} />
              </button>
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                {cards.map((card) => (
                  <div key={card.title} className="rounded-2xl bg-gold-400 p-4 text-ink">
                    <card.icon size={22} />
                    <p className="mt-3 text-sm font-bold leading-snug">{card.title}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={next} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-400 text-ink md:inline-flex" aria-label="Next">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white px-4 pb-8 pt-10">
        <div className="mx-auto grid max-w-6xl gap-0 overflow-hidden rounded-[1.5rem] md:grid-cols-2">
          <div className="bg-gold-400 px-8 py-10 text-left md:px-12">
            <h3 className="text-2xl font-black uppercase md:text-3xl">Hall plan · GHS 500</h3>
            <p className="mt-3 max-w-md text-sm text-ink/80">
              One hall, one tenant, one year. Unlimited distributions, Excel upload, assistant links,
              and a live collection desk.
            </p>
            <Link to="/register" className="mt-6 inline-flex rounded-full bg-ink px-6 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white">
              Choose Hall
            </Link>
          </div>
          <div className="bg-[#c4920f] px-8 py-10 text-left md:px-12">
            <h3 className="text-2xl font-black uppercase md:text-3xl">SRC plan · GHS 1,500</h3>
            <p className="mt-3 max-w-md text-sm text-ink/80">
              Campus-wide desk for the student body. Same toolkit, higher-volume lists, priority
              activation after Paystack.
            </p>
            <Link to="/register" className="mt-6 inline-flex rounded-full bg-ink px-6 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white">
              Choose SRC
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-black uppercase">Featured tools</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((item) => (
              <div key={item.title} className="rounded-3xl border border-black/5 bg-cream p-5">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-400 text-ink">
                  <item.icon size={22} />
                </div>
                <h3 className="mt-4 font-bold">{item.title}</h3>
                <p className="mt-2 text-sm text-ink/65">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-ink py-8 text-center text-sm text-white/50">
        <p>ShareHouse · Welfare desk for tertiary Ghana · © {new Date().getFullYear()}</p>
        <p className="mt-2 text-white/70">Powered by Techrise Academy</p>
      </footer>
    </div>
  );
}

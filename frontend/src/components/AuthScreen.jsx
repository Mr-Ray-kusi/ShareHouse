import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function AuthScreen({ children }) {
  return (
    <div className="relative min-h-screen">
      <img
        src="/hero-queue.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-[center_28%]"
      />
      <div className="absolute inset-0 bg-ink/55" />

      <div className="relative z-10 flex min-h-screen flex-col px-4 py-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-white">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-400 font-display text-lg text-ink">S</div>
            <span className="font-bold">ShareHouse</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white hover:text-gold-400">
            <ArrowLeft size={16} /> Back to home
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center py-8 lg:max-w-4xl">
          <div className="rounded-3xl bg-white/95 p-6 shadow-lift backdrop-blur-sm sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

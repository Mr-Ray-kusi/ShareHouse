import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { KeyRound, LayoutDashboard, LogOut, Users, CalendarDays, Crown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-xl bg-forest-600 grid place-items-center text-gold-400 font-display text-lg">
        W
      </div>
      <div>
        <p className="font-display text-lg leading-none">ShareHouse</p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-forest-700/70">Porter lodge</p>
      </div>
    </div>
  );
}

export default function LodgeShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = [
    { to: '/lodge', label: 'Live lodge', icon: LayoutDashboard },
    { to: '/lodge/rooms', label: 'Rooms', icon: KeyRound },
    { to: '/lodge/porters', label: 'Porters', icon: Users },
    { to: '/lodge/presidents', label: 'Presidents', icon: Crown },
    { to: '/lodge/roster', label: 'Roster', icon: CalendarDays },
  ];

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-mist flex">
      <aside className="hidden md:flex w-52 shrink-0 h-full flex-col bg-ink text-cream">
        <div className="p-4 border-b border-white/10">
          <BrandMark />
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/lodge'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  isActive ? 'bg-white/10 text-gold-400' : 'text-cream/80 hover:bg-white/5'
                }`
              }
            >
              <link.icon size={18} />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-sm">
          <p className="font-medium">{user?.name}</p>
          <p className="text-cream/60 text-xs">Hall administration</p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="kente-bar md:hidden shrink-0" />
        <header className="md:hidden shrink-0 flex items-center justify-between px-4 py-3 bg-white border-b border-forest-100">
          <BrandMark />
          <button className="btn-ghost text-xs" onClick={handleLogout}>
            <LogOut size={14} />
          </button>
        </header>
        <div className="md:hidden shrink-0 flex justify-center gap-2 px-3 py-2 bg-white border-b border-forest-100 overflow-x-auto">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/lodge'}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-forest-600 text-white' : 'bg-mist text-forest-800'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
        <div className="hidden md:flex shrink-0 justify-end px-6 py-3 bg-mist">
          <button className="btn-ghost" onClick={handleLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
        <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-10 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

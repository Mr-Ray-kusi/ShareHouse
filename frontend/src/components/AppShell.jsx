import { NavLink, Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Package, Users, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-xl bg-forest-600 grid place-items-center text-gold-400 font-display text-lg">
        W
      </div>
      <div>
        <p className="font-display text-lg leading-none">WelfareShare</p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-forest-700/70">Halls of Ghana</p>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuper = user?.role === 'super_admin';
  const isAssistant = user?.role === 'assistant';

  if (isSuper && location.pathname.startsWith('/app')) {
    return <Navigate to="/super/health" replace />;
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  if (isAssistant) {
    return (
      <div className="h-[100dvh] overflow-hidden flex flex-col bg-mist">
        <div className="kente-bar shrink-0" />
        <header className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-forest-100">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-forest-700/70">Field collection</p>
            <p className="font-semibold truncate">{tenant?.name || 'WelfareShare'}</p>
          </div>
          <button className="btn-ghost text-xs shrink-0" onClick={handleLogout}>
            Sign out
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </div>
    );
  }

  const links = [
    { to: '/app', label: 'Live desk', icon: LayoutDashboard },
    { to: '/app/distributions', label: 'Distributions', icon: Package },
    { to: '/app/assistants', label: 'Assistants', icon: Users },
  ];

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
              end={link.to === '/app' || link.to === '/super'}
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
          <p className="text-cream/60 text-xs capitalize">{user?.role?.replace('_', ' ')}</p>
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
        <div className="md:hidden shrink-0 flex gap-2 overflow-x-auto px-3 py-2 bg-white border-b border-forest-100">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end
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

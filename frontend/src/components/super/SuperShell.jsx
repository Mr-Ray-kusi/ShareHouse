import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Activity,
  MousePointerClick,
  Filter,
  Globe2,
  Building2,
  FileSpreadsheet,
  LogOut,
  Search,
  Bell,
} from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const LINKS = [
  { to: '/super/health', label: 'Health & performance', icon: Activity },
  { to: '/super/behaviour', label: 'User behaviour', icon: MousePointerClick },
  { to: '/super/funnel', label: 'Business funnel', icon: Filter },
  { to: '/super/audience', label: 'Audience & acquisition', icon: Globe2 },
  { to: '/super/halls', label: 'Registered Halls', icon: Building2 },
  { to: '/super/uploads', label: 'Uploaded Excel files', icon: FileSpreadsheet },
];

export default function SuperShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [analysis, setAnalysis] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');

  async function reload() {
    const [{ data }, { data: files }] = await Promise.all([
      api.get('/api/super/analysis'),
      api.get('/api/super/uploads'),
    ]);
    setAnalysis(data);
    setUploads(files.uploads || []);
  }

  useEffect(() => {
    reload().catch((err) => setError(err.response?.data?.message || 'Could not load analysis.'));
  }, []);

  const title = useMemo(
    () => LINKS.find((l) => location.pathname.startsWith(l.to))?.label || 'System analysis',
    [location.pathname]
  );

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const ctx = { analysis, uploads, error, search, setSearch, reload, busy, setBusy, setError };

  return (
    <div className="h-[100dvh] overflow-hidden flex bg-[#f3f5fa] text-slate-900">
      <aside className="hidden md:flex w-[200px] shrink-0 h-full flex-col bg-[#0c0d10] text-white px-3 py-5">
        <div className="flex items-center gap-3 px-2 mb-8">
          <div className="h-10 w-10 rounded-2xl bg-[#2563eb] grid place-items-center font-semibold">W</div>
          <div>
            <p className="font-semibold leading-none">ShareHouse</p>
            <p className="text-[11px] text-white/45 mt-1 tracking-[0.16em] uppercase">Operator</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1.5">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-full px-4 py-2.5 text-sm transition ${
                  isActive ? 'bg-[#2563eb] text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <link.icon size={18} />
              <span className="leading-tight">{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="mt-6 w-full rounded-2xl bg-[#2563eb] py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#1d4ed8]"
        >
          <LogOut size={16} /> LOGOUT
        </button>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <header className="shrink-0 flex items-center gap-3 px-4 md:px-8 py-4">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#2563eb]" size={18} />
            <input
              className="desk-search"
              placeholder={`Search ${title.toLowerCase()}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="h-11 w-11 rounded-full bg-white shadow-desk grid place-items-center text-slate-500" type="button">
            <Bell size={18} />
          </button>
          <div className="hidden sm:flex items-center gap-3 pl-2">
            <div className="text-right">
              <p className="text-sm font-semibold leading-none">{user?.name || 'Super admin'}</p>
              <p className="text-[11px] text-slate-400 mt-1">Operator</p>
            </div>
            <div className="h-11 w-11 rounded-full bg-[#2563eb] text-white grid place-items-center font-semibold">
              {(user?.name || 'S').slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="md:hidden shrink-0 flex gap-2 overflow-x-auto px-4 pb-2">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-[#2563eb] text-white' : 'bg-white text-slate-600'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <main className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 pb-10">
          {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}
          <Outlet context={ctx} />
        </main>
      </div>
    </div>
  );
}

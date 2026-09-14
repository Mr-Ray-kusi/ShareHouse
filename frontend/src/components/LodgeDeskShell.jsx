import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LodgeDeskShell() {
  const { tenant, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-mist">
      <div className="kente-bar shrink-0" />
      <header className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-forest-100">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-forest-700/70">Porter lodge</p>
          <p className="font-semibold truncate">{tenant?.name || 'ShareHouse'}</p>
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

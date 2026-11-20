import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Paywall() {
  const { tenant, logout } = useAuth();

  return (
    <div className="min-h-screen grain">
      <div className="kente-bar" />
      <div className="max-w-lg mx-auto px-4 py-16">
        <h1 className="font-display text-4xl">Account deactivated</h1>
        <p className="mt-3 text-ink/70">
          {tenant?.name} · {tenant?.schoolName}. Contact the ShareHouse system administrator to restore access.
        </p>
        <div className="mt-6 flex gap-4 text-sm">
          <Link to="/login" onClick={logout} className="text-forest-700">Sign in with another account</Link>
        </div>
      </div>
    </div>
  );
}

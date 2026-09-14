import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../utils/homeFor';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading, tenant } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-forest-700">
        Loading ShareHouse…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }

  const paywalled =
    user.role === 'tenant_admin' &&
    tenant &&
    (!tenant.isActive || (tenant.expiryDate && new Date(tenant.expiryDate) < new Date()));

  if (paywalled && !location.pathname.startsWith('/paywall')) {
    return <Navigate to="/paywall" replace />;
  }

  return children;
}

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading, tenant } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-forest-700">
        Loading WelfareShare…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user.role)) {
    if (user.role === 'super_admin') return <Navigate to="/super" replace />;
    if (user.role === 'assistant') return <Navigate to="/collect" replace />;
    return <Navigate to="/app" replace />;
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

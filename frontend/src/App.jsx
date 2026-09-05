import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import PaymentCallback from './pages/PaymentCallback';
import JoinAssistant from './pages/JoinAssistant';
import Paywall from './pages/Paywall';
import SuperShell from './components/super/SuperShell';
import SuperDashboard from './pages/super/SuperDashboard';
import SuperHealth from './pages/super/SuperHealth';
import SuperBehaviour from './pages/super/SuperBehaviour';
import SuperFunnel from './pages/super/SuperFunnel';
import SuperAudience from './pages/super/SuperAudience';
import SuperHalls from './pages/super/SuperHalls';
import SuperUploads from './pages/super/SuperUploads';
import TenantDetail from './pages/super/TenantDetail';
import TenantDashboard from './pages/tenant/TenantDashboard';
import Distributions from './pages/tenant/Distributions';
import DistributionDetail from './pages/tenant/DistributionDetail';
import Assistants from './pages/tenant/Assistants';
import AssistantHome from './pages/assistant/AssistantHome';
import FieldCollection from './pages/FieldCollection';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (user.role === 'super_admin') return <Navigate to="/super/health" replace />;
  if (user.role === 'assistant') return <Navigate to="/collect" replace />;
  return <Navigate to="/app" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/payment/callback" element={<PaymentCallback />} />
      <Route path="/join/:code" element={<JoinAssistant />} />
      <Route path="/field/:token" element={<FieldCollection />} />
      <Route path="/go" element={<HomeRedirect />} />

      <Route
        path="/paywall"
        element={
          <ProtectedRoute roles={['tenant_admin']}>
            <Paywall />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute roles={['tenant_admin']}>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/app" element={<TenantDashboard />} />
        <Route path="/app/distributions" element={<Distributions />} />
        <Route path="/app/distributions/:id" element={<DistributionDetail />} />
        <Route path="/app/assistants" element={<Assistants />} />
      </Route>

      <Route
        element={
          <ProtectedRoute roles={['super_admin']}>
            <SuperShell />
          </ProtectedRoute>
        }
      >
        <Route path="/super" element={<SuperDashboard />} />
        <Route path="/super/health" element={<SuperHealth />} />
        <Route path="/super/behaviour" element={<SuperBehaviour />} />
        <Route path="/super/funnel" element={<SuperFunnel />} />
        <Route path="/super/audience" element={<SuperAudience />} />
        <Route path="/super/halls" element={<SuperHalls />} />
        <Route path="/super/uploads" element={<SuperUploads />} />
        <Route path="/super/tenants/:tenantId" element={<TenantDetail />} />
      </Route>

      <Route
        element={
          <ProtectedRoute roles={['assistant']}>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/collect" element={<AssistantHome />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

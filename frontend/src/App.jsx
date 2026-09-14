import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { homeFor } from './utils/homeFor';
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
import SuperAccounts from './pages/super/SuperAccounts';
import TenantDetail from './pages/super/TenantDetail';
import TenantDashboard from './pages/tenant/TenantDashboard';
import Distributions from './pages/tenant/Distributions';
import DistributionDetail from './pages/tenant/DistributionDetail';
import Assistants from './pages/tenant/Assistants';
import AssistantHome from './pages/assistant/AssistantHome';
import JoinPorter from './pages/JoinPorter';
import LodgeShell from './components/LodgeShell';
import LodgeDeskShell from './components/LodgeDeskShell';
import LodgeBoard from './pages/lodge/LodgeBoard';
import LodgeRooms from './pages/lodge/LodgeRooms';
import LodgeRoomDetail from './pages/lodge/LodgeRoomDetail';
import LodgePorters from './pages/lodge/LodgePorters';
import LodgePresidents from './pages/lodge/LodgePresidents';
import LodgeRoster from './pages/lodge/LodgeRoster';
import PorterDesk from './pages/lodge/PorterDesk';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={homeFor(user.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/payment/callback" element={<PaymentCallback />} />
      <Route path="/join/:code" element={<JoinAssistant />} />
      <Route path="/lodge-join/:code" element={<JoinPorter />} />
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
        <Route path="/super/accounts" element={<SuperAccounts />} />
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

      <Route
        element={
          <ProtectedRoute roles={['hall_admin']}>
            <LodgeShell />
          </ProtectedRoute>
        }
      >
        <Route path="/lodge" element={<LodgeBoard />} />
        <Route path="/lodge/rooms" element={<LodgeRooms />} />
        <Route path="/lodge/rooms/:roomId" element={<LodgeRoomDetail />} />
        <Route path="/lodge/porters" element={<LodgePorters />} />
        <Route path="/lodge/presidents" element={<LodgePresidents />} />
        <Route path="/lodge/roster" element={<LodgeRoster />} />
      </Route>

      <Route
        element={
          <ProtectedRoute roles={['porter']}>
            <LodgeDeskShell />
          </ProtectedRoute>
        }
      >
        <Route path="/lodge/desk" element={<PorterDesk />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

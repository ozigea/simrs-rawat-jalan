import type { ReactNode } from 'react';
import { Result, Spin } from 'antd';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import AppLayout from './components/AppLayout';
import MasterCrudPage from './components/MasterCrudPage';
import { masterConfigs } from './features/master/configs';
import DashboardPage from './features/dashboard/DashboardPage';
import BillingPage from './features/billing/BillingPage';
import InvoicePage from './features/billing/InvoicePage';
import PaymentHistoryPage from './features/billing/PaymentHistoryPage';
import ExamPage from './features/visits/ExamPage';
import LabWorklistPage from './features/visits/LabWorklistPage';
import PatientHistoryPage from './features/visits/PatientHistoryPage';
import PharmacyPage from './features/visits/PharmacyPage';
import QueuePage from './features/visits/QueuePage';
import RegistrationPage from './features/visits/RegistrationPage';
import VisitListPage from './features/visits/VisitListPage';
import LoginPage from './pages/LoginPage';
import StatusPage from './pages/StatusPage';

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spin fullscreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppLayout />;
}

function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const { can } = useAuth();
  return can(perm) ? <>{children}</> : <Result status="403" title="Anda tidak berhak mengakses halaman ini" />;
}

function MasterRoute() {
  const { path } = useParams();
  const { can } = useAuth();
  const config = masterConfigs.find((c) => c.path === path);
  if (!config) return <Result status="404" title="Halaman tidak ditemukan" />;
  if (!can(`master.${config.permission}.read`)) return <Result status="403" title="Anda tidak berhak mengakses halaman ini" />;
  // key remounts the page (fresh filters/paging) when switching between masters
  return <MasterCrudPage key={config.path} config={config} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<StatusPage />} />
        <Route path="dashboard" element={<Guard perm="dashboard.revenue"><DashboardPage /></Guard>} />
        <Route path="registration" element={<Guard perm="visit.create"><RegistrationPage /></Guard>} />
        <Route path="queue" element={<Guard perm="queue.read"><QueuePage /></Guard>} />
        <Route path="billing" element={<Guard perm="billing.read"><BillingPage /></Guard>} />
        <Route path="billing/invoices/:id" element={<Guard perm="billing.read"><InvoicePage /></Guard>} />
        <Route path="payments" element={<Guard perm="billing.read"><PaymentHistoryPage /></Guard>} />
        <Route path="pharmacy" element={<Guard perm="pharmacy.worklist"><PharmacyPage /></Guard>} />
        <Route path="lab" element={<Guard perm="lab.worklist"><LabWorklistPage /></Guard>} />
        <Route path="visits" element={<Guard perm="visit.list"><VisitListPage /></Guard>} />
        <Route path="visits/:id/exam" element={<Guard perm="visit.list"><ExamPage /></Guard>} />
        <Route path="patients/:id/history" element={<Guard perm="patient.history"><PatientHistoryPage /></Guard>} />
        <Route path="master/:path" element={<MasterRoute />} />
        <Route path="*" element={<Result status="404" title="Halaman tidak ditemukan" />} />
      </Route>
    </Routes>
  );
}

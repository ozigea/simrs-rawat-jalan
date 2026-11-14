import { Result, Spin } from 'antd';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import AppLayout from './components/AppLayout';
import MasterCrudPage from './components/MasterCrudPage';
import { masterConfigs } from './features/master/configs';
import LoginPage from './pages/LoginPage';
import StatusPage from './pages/StatusPage';

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spin fullscreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppLayout />;
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
        <Route path="master/:path" element={<MasterRoute />} />
        <Route path="*" element={<Result status="404" title="Halaman tidak ditemukan" />} />
      </Route>
    </Routes>
  );
}

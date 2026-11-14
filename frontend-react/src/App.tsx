import { Layout, Typography } from 'antd';
import { Route, Routes } from 'react-router-dom';
import StatusPage from './pages/StatusPage';

export default function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
          SIMRS Rawat Jalan
        </Typography.Title>
      </Layout.Header>
      <Layout.Content style={{ padding: 24, maxWidth: 960, width: '100%', margin: '0 auto' }}>
        <Routes>
          <Route path="*" element={<StatusPage />} />
        </Routes>
      </Layout.Content>
    </Layout>
  );
}

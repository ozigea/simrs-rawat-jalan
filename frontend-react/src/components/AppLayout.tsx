import { useMemo } from 'react';
import { Button, Layout, Menu, Space, Tag, Typography } from 'antd';
import { DashboardOutlined, DatabaseOutlined, HomeOutlined, LogoutOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { masterConfigs } from '../features/master/configs';
import { ROLE_LABELS } from '../lib/format';

export default function AppLayout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Menu follows the user's permissions (UX only - the API enforces them too).
  const items = useMemo(() => {
    const master = masterConfigs
      .filter((c) => can(`master.${c.permission}.read`))
      .map((c) => ({ key: `/master/${c.path}`, label: c.title }));
    const service = [
      { perm: 'visit.create', key: '/registration', label: 'Pendaftaran' },
      { perm: 'queue.read', key: '/queue', label: 'Antrean' },
      { perm: 'visit.list', key: '/visits', label: 'Daftar Kunjungan' },
      { perm: 'pharmacy.worklist', key: '/pharmacy', label: 'Farmasi' },
      { perm: 'lab.worklist', key: '/lab', label: 'Laboratorium' },
      { perm: 'billing.read', key: '/billing', label: 'Kasir' },
      { perm: 'billing.read', key: '/payments', label: 'Riwayat Pembayaran' },
    ].filter((i) => can(i.perm)).map(({ key, label }) => ({ key, label }));
    return [
      { key: '/', icon: <HomeOutlined />, label: 'Beranda' },
      ...(can('dashboard.revenue') ? [{ key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' }] : []),
      ...(service.length ? [{ key: 'service', icon: <MedicineBoxOutlined />, label: 'Pelayanan', children: service }] : []),
      ...(master.length ? [{ key: 'master', icon: <DatabaseOutlined />, label: 'Master Data', children: master }] : []),
    ];
  }, [can]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider breakpoint="lg" collapsedWidth={0} width={240} theme="dark">
        <div style={{ color: '#fff', padding: 16, fontWeight: 600, fontSize: 16 }}>SIMRS Rawat Jalan</div>
        <Menu
          theme="dark"
          mode="inline"
          items={items}
          selectedKeys={[location.pathname.startsWith('/visits/') ? '/visits' : location.pathname.startsWith('/billing') ? '/billing' : location.pathname]}
          defaultOpenKeys={['service', 'master']}
          onClick={(e) => navigate(e.key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header style={{ background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 24px' }}>
          <Space>
            <Typography.Text strong>{user?.full_name}</Typography.Text>
            {user?.roles.map((r) => (
              <Tag key={r} color="blue">
                {ROLE_LABELS[r] ?? r}
              </Tag>
            ))}
            <Button icon={<LogoutOutlined />} onClick={() => { logout(); navigate('/login'); }}>
              Keluar
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

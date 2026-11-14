import { Alert, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { nodeApi, yiiApi, type ApiEnvelope } from '../api/client';

interface Health {
  service: string;
  status: string;
  db: string;
  time: string;
}

function HealthCard({ title, client }: { title: string; client: AxiosInstance }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['health', title],
    queryFn: async () => (await client.get<ApiEnvelope<Health>>('/health')).data,
    refetchInterval: 10000,
    retry: false,
  });

  return (
    <Card title={title} loading={isLoading} size="small">
      {error ? (
        <Alert type="error" showIcon message="Tidak dapat dihubungi" description={String(error)} />
      ) : (
        data?.data && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Status">
              <Tag color={data.data.status === 'UP' ? 'green' : 'red'}>{data.data.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Database">
              <Tag color={data.data.db === 'UP' ? 'green' : 'red'}>{data.data.db}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Waktu server">{data.data.time}</Descriptions.Item>
            <Descriptions.Item label="Request ID">{data.request_id}</Descriptions.Item>
          </Descriptions>
        )
      )}
    </Card>
  );
}

export default function StatusPage() {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={3}>Status Layanan</Typography.Title>
      <HealthCard title="Yii2 Core API" client={yiiApi} />
      <HealthCard title="Node.js Service" client={nodeApi} />
    </Space>
  );
}

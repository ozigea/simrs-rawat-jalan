import { Button, Card, Descriptions, Result, Space, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Row } from '../../components/MasterCrudPage/types';
import PatientHistory from './PatientHistory';

export default function PatientHistoryPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const patientId = Number(id);
  const { data: patient, isLoading, isError } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row>>(`/patients/${patientId}`)).data.data!,
    enabled: can('master.patients.read'),
  });

  if (!can('patient.history')) return <Result status="403" title="Anda tidak berhak mengakses halaman ini" />;
  if (isLoading) return <Spin />;
  if (isError) return <Result status="404" title="Pasien tidak ditemukan" />;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Button onClick={() => navigate(-1)}>Kembali</Button>
      <Card title="Riwayat Pasien">
        {patient && (
          <Descriptions size="small" column={{ xs: 1, md: 3 }} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="No. RM">{patient.mrn}</Descriptions.Item>
            <Descriptions.Item label="Nama">{patient.name}</Descriptions.Item>
            <Descriptions.Item label="Tanggal lahir">{patient.birth_date}</Descriptions.Item>
          </Descriptions>
        )}
        <PatientHistory patientId={patientId} />
      </Card>
    </Space>
  );
}

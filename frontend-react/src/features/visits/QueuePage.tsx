import { useState } from 'react';
import { Badge, Button, Card, DatePicker, Empty, Space, Statistic, Table, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import RemoteSelect from '../../components/MasterCrudPage/RemoteSelect';
import type { Row } from '../../components/MasterCrudPage/types';
import VisitStatusTag from '../../components/VisitStatusTag';
import { notifyError } from '../../lib/errors';

const polyclinics = { path: 'polyclinics', label: (r: Record<string, unknown>) => String(r.name) };

/** Queue board per schedule (R-10, R-12). Polls every 10 s (K-15). Doctors call patients from here. */
export default function QueuePage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [poli, setPoli] = useState<number | null>(null);
  const dateStr = date.format('YYYY-MM-DD');
  const isToday = dateStr === dayjs().format('YYYY-MM-DD');

  const { data, isFetching } = useQuery({
    queryKey: ['queues', dateStr, poli],
    refetchInterval: 10_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/queues', { params: { date: dateStr, polyclinic_id: poli ?? undefined } })).data.data ?? [],
  });

  const call = async (visitId: number) => {
    try {
      await yiiApi.post(`/visits/${visitId}/call`);
      qc.invalidateQueries({ queryKey: ['queues'] });
      navigate(`/visits/${visitId}/exam`);
    } catch (e) {
      notifyError(e);
      qc.invalidateQueries({ queryKey: ['queues'] });
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>Antrean Pasien</Typography.Title>
        <DatePicker allowClear={false} value={date} format="DD-MM-YYYY" onChange={(d) => d && setDate(d)} />
        <RemoteSelect remote={polyclinics} value={poli} onChange={(v) => setPoli(v as number | null)} placeholder="Semua poli" style={{ width: 200 }} />
        <Badge status={isFetching ? 'processing' : 'default'} text="Diperbarui otomatis tiap 10 detik" />
      </Space>

      {(data ?? []).length === 0 && <Card><Empty description="Tidak ada jadwal praktik" /></Card>}
      {(data ?? []).map((s) => (
        <Card
          key={s.schedule_id}
          size="small"
          title={`${s.polyclinic_name} - ${s.doctor_name}`}
          extra={<Typography.Text type="secondary">{s.start_time} - {s.end_time}</Typography.Text>}
        >
          <Space size="large" style={{ marginBottom: 12 }} wrap>
            <Statistic title="Terdaftar" value={s.total} suffix={`/ ${s.quota}`} />
            <Statistic title="Menunggu" value={s.waiting} />
            <Statistic title="Sedang diperiksa" value={s.current_queue_no ?? '-'} />
            <Statistic title="Berikutnya" value={s.next_queue_no ?? '-'} />
          </Space>
          <Table<Row>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={s.items}
            locale={{ emptyText: 'Belum ada pasien' }}
            columns={[
              { title: 'No', dataIndex: 'queue_no', width: 70, render: (v: number) => <strong>{v}</strong> },
              { title: 'Pasien', dataIndex: 'patient_name' },
              { title: 'No. RM', dataIndex: 'mrn' },
              { title: 'Status', dataIndex: 'status', render: (v: string) => <VisitStatusTag status={v} /> },
              {
                title: '',
                key: 'a',
                render: (_: unknown, r: Row) =>
                  can('exam.write') ? (
                    r.status === 'WAITING' ? (
                      <Button size="small" type="primary" disabled={!isToday} onClick={() => call(r.id)}>Panggil</Button>
                    ) : (
                      <Button size="small" onClick={() => navigate(`/visits/${r.id}/exam`)}>Periksa</Button>
                    )
                  ) : null,
              },
            ]}
          />
        </Card>
      ))}
    </Space>
  );
}

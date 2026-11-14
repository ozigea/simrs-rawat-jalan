import { useState } from 'react';
import { Button, Space, Table, Typography, message } from 'antd';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toApiError, yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import ReasonModal from '../../components/ReasonModal';
import VisitStatusTag from '../../components/VisitStatusTag';
import type { Row } from '../../components/MasterCrudPage/types';
import { notifyError } from '../../lib/errors';

interface Props {
  /** Query filters: date, polyclinic_id, status, q ... */
  params: Record<string, string | number | undefined>;
  /** Refresh every 10 s (queue-like screens, K-15). */
  poll?: boolean;
}

/** Visit list shared by the registration and visit-list pages. Actions follow permissions. */
export default function VisitTable({ params, poll }: Props) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);

  const query = { ...params, page, per_page: perPage };
  const { data, isFetching, error } = useQuery({
    queryKey: ['visits', query],
    placeholderData: keepPreviousData,
    refetchInterval: poll ? 10_000 : false,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/visits', { params: query })).data,
  });

  const cancel = async (reason: string) => {
    try {
      await yiiApi.post(`/visits/${cancelTarget!.id}/cancel`, { reason });
      message.success('Kunjungan dibatalkan');
      setCancelTarget(null);
      qc.invalidateQueries({ queryKey: ['visits'] });
      qc.invalidateQueries({ queryKey: ['queues'] });
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <>
      {error && <Typography.Text type="danger">{toApiError(error).message}</Typography.Text>}
      <Table<Row>
        rowKey="id"
        size="middle"
        loading={isFetching}
        dataSource={data?.data ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: perPage,
          total: data?.meta?.total ?? 0,
          showSizeChanger: true,
          showTotal: (t) => `${t} kunjungan`,
          onChange: (p, s) => { setPage(p); setPerPage(s); },
        }}
        columns={[
          { title: 'Antrean', dataIndex: 'queue_no', width: 90, render: (v: number) => <strong>{v}</strong> },
          { title: 'Tanggal', dataIndex: 'visit_date', width: 110 },
          { title: 'No. Kunjungan', dataIndex: 'visit_no' },
          { title: 'Pasien', render: (_: unknown, r: Row) => <span>{r.patient_name} <Typography.Text type="secondary">({r.mrn})</Typography.Text></span> },
          { title: 'Poli', dataIndex: 'polyclinic_name' },
          { title: 'Dokter', dataIndex: 'doctor_name' },
          { title: 'Status', dataIndex: 'status', render: (v: string) => <VisitStatusTag status={v} /> },
          {
            title: 'Aksi',
            key: 'actions',
            render: (_: unknown, r: Row) => (
              <Space size="small">
                {(can('exam.read') || can('exam.write')) && r.status !== 'CANCELLED' && (
                  <Button size="small" onClick={() => navigate(`/visits/${r.id}/exam`)}>
                    {can('exam.write') ? 'Periksa' : 'Detail'}
                  </Button>
                )}
                {can('patient.history') && (
                  <Button size="small" onClick={() => navigate(`/patients/${r.patient_id}/history`)}>
                    Riwayat
                  </Button>
                )}
                {can('visit.cancel') && r.status === 'WAITING' && (
                  <Button size="small" danger onClick={() => setCancelTarget(r)}>
                    Batalkan
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      <ReasonModal open={!!cancelTarget} title={`Batalkan kunjungan antrean ${cancelTarget?.queue_no ?? ''}`} onOk={cancel} onCancel={() => setCancelTarget(null)} />
    </>
  );
}

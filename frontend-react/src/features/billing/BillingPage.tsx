import { useState } from 'react';
import { Button, Card, DatePicker, Input, Select, Space, Table, Typography, message } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Row } from '../../components/MasterCrudPage/types';
import { INVOICE_STATUS_OPTIONS, InvoiceStatusTag } from '../../components/StatusTags';
import { notifyError } from '../../lib/errors';
import { formatMoney } from '../../lib/format';

/** Cashier home: visits waiting for a bill + the invoice list (R-22). */
export default function BillingPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<number | null>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const canCreate = can('billing.write');

  const waiting = useQuery({
    queryKey: ['visits-no-invoice'],
    enabled: canCreate,
    refetchInterval: 10_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/visits', { params: { status: 'EXAMINED', no_invoice: 1, per_page: 50, sort: 'queue_no' } })).data.data ?? [],
  });

  const params = { status, q: q || undefined, from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD'), page, per_page: 20 };
  const invoices = useQuery({
    queryKey: ['invoices', params],
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/invoices', { params })).data,
  });

  const create = async (visitId: number) => {
    setCreating(visitId);
    try {
      const r = await yiiApi.post<ApiEnvelope<Row>>(`/visits/${visitId}/invoice`);
      message.success('Tagihan dibuat');
      navigate(`/billing/invoices/${r.data.data!.id}`);
    } catch (e) {
      notifyError(e);
    } finally {
      setCreating(null);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {canCreate && (
        <Card title="Menunggu tagihan (pemeriksaan selesai, tagihan belum dibuat)">
          <Table<Row>
            rowKey="id"
            size="middle"
            loading={waiting.isFetching}
            dataSource={waiting.data ?? []}
            pagination={false}
            locale={{ emptyText: 'Tidak ada kunjungan yang menunggu tagihan' }}
            columns={[
              { title: 'Tanggal', dataIndex: 'visit_date', width: 110 },
              { title: 'Antrean', dataIndex: 'queue_no', width: 90 },
              { title: 'Pasien', render: (_: unknown, r: Row) => <span>{r.patient_name} <Typography.Text type="secondary">({r.mrn})</Typography.Text></span> },
              { title: 'Poli', dataIndex: 'polyclinic_name' },
              { title: 'Dokter', dataIndex: 'doctor_name' },
              { title: '', key: 'a', render: (_: unknown, r: Row) => <Button type="primary" size="small" loading={creating === r.id} onClick={() => create(r.id)}>Buat tagihan</Button> },
            ]}
          />
        </Card>
      )}

      <Card title="Daftar tagihan">
        <Space wrap style={{ marginBottom: 16 }}>
          <Select allowClear placeholder="Semua status" style={{ width: 180 }} options={INVOICE_STATUS_OPTIONS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
          <DatePicker.RangePicker format="DD-MM-YYYY" value={range as [Dayjs, Dayjs] | null} onChange={(v) => { setRange(v); setPage(1); }} />
          <Input.Search allowClear placeholder="Cari nama, No. RM, No. invoice" style={{ width: 280 }} onSearch={(v) => { setQ(v.trim()); setPage(1); }} />
        </Space>
        <Table<Row>
          rowKey="id"
          size="middle"
          loading={invoices.isFetching}
          dataSource={invoices.data?.data ?? []}
          scroll={{ x: 'max-content' }}
          pagination={{ current: page, pageSize: 20, total: invoices.data?.meta?.total ?? 0, onChange: setPage, showSizeChanger: false }}
          columns={[
            { title: 'No. invoice', dataIndex: 'invoice_no' },
            { title: 'Tanggal', dataIndex: 'visit_date', render: (v: string) => dayjs(v).format('DD-MM-YYYY') },
            { title: 'Pasien', render: (_: unknown, r: Row) => <span>{r.patient_name} <Typography.Text type="secondary">({r.mrn})</Typography.Text></span> },
            { title: 'Total', dataIndex: 'total_amount', align: 'right', render: (v: string) => formatMoney(v) },
            { title: 'Dibayar', dataIndex: 'paid_amount', align: 'right', render: (v: string) => formatMoney(v) },
            { title: 'Sisa', dataIndex: 'remaining', align: 'right', render: (v: string) => formatMoney(v) },
            { title: 'Status', dataIndex: 'status', render: (v: string) => <InvoiceStatusTag status={v} /> },
            { title: '', key: 'a', render: (_: unknown, r: Row) => <Button size="small" onClick={() => navigate(`/billing/invoices/${r.id}`)}>{can('billing.write') && r.status !== 'PAID' ? 'Bayar' : 'Buka'}</Button> },
          ]}
        />
      </Card>
    </Space>
  );
}

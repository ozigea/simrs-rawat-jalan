import { useState } from 'react';
import { Button, Card, DatePicker, Input, Select, Space, Table, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { yiiApi, type ApiEnvelope } from '../../api/client';
import type { Row } from '../../components/MasterCrudPage/types';
import { formatMoney } from '../../lib/format';
import { openPdf } from '../../lib/pdf';

const METHODS = [
  { value: 'CASH', label: 'Tunai' }, { value: 'DEBIT', label: 'Debit' }, { value: 'CREDIT', label: 'Kredit' },
  { value: 'QRIS', label: 'QRIS' }, { value: 'TRANSFER', label: 'Transfer' },
];

/** Payment history with filters (R-25). */
export default function PaymentHistoryPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>([dayjs(), dayjs()]);
  const [method, setMethod] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const params = { method, q: q || undefined, from: range?.[0]?.format('YYYY-MM-DD'), to: range?.[1]?.format('YYYY-MM-DD'), page, per_page: 20 };
  const { data, isFetching } = useQuery({
    queryKey: ['payments', params],
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/payments', { params })).data,
  });

  return (
    <Card title="Riwayat Pembayaran">
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker.RangePicker allowClear format="DD-MM-YYYY" value={range as [Dayjs, Dayjs] | null} onChange={(v) => { setRange(v); setPage(1); }} />
        <Select allowClear placeholder="Semua metode" style={{ width: 160 }} options={METHODS} value={method} onChange={(v) => { setMethod(v); setPage(1); }} />
        <Input.Search allowClear placeholder="Cari nama, No. RM, No. pembayaran/invoice" style={{ width: 320 }} onSearch={(v) => { setQ(v.trim()); setPage(1); }} />
      </Space>
      <Table<Row>
        rowKey="id"
        size="middle"
        loading={isFetching}
        dataSource={data?.data ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{ current: page, pageSize: 20, total: data?.meta?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        summary={(rows) => (rows.length ? (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={4} align="right"><strong>Jumlah halaman ini</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right"><strong>{formatMoney(rows.reduce((s, r) => s + Number(r.amount), 0))}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={2} colSpan={3} />
          </Table.Summary.Row>
        ) : null)}
        columns={[
          { title: 'Waktu', dataIndex: 'paid_at', render: (v: string) => dayjs(v).format('DD-MM-YYYY HH:mm') },
          { title: 'No. pembayaran', dataIndex: 'payment_no' },
          { title: 'Pasien', render: (_: unknown, r: Row) => <span>{r.patient_name} <Typography.Text type="secondary">({r.mrn})</Typography.Text></span> },
          { title: 'Invoice', dataIndex: 'invoice_no', render: (v: string, r: Row) => <a onClick={() => navigate(`/billing/invoices/${r.invoice_id}`)}>{v}</a> },
          { title: 'Jumlah', dataIndex: 'amount', align: 'right', render: (v: string) => formatMoney(v) },
          { title: 'Metode', dataIndex: 'method', render: (v: string) => METHODS.find((m) => m.value === v)?.label ?? v },
          { title: 'Kasir', dataIndex: 'cashier_name' },
          { title: '', key: 'a', render: (_: unknown, r: Row) => <Button size="small" icon={<PrinterOutlined />} onClick={() => openPdf(`/payments/${r.id}/receipt`, `kuitansi-${r.payment_no}.pdf`)}>Kuitansi</Button> },
        ]}
      />
    </Card>
  );
}

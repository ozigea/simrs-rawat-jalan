import { useState } from 'react';
import { Alert, Button, Card, Drawer, Descriptions, Input, Popconfirm, Select, Space, Table, Typography, message } from 'antd';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { toApiError, yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Row } from '../../components/MasterCrudPage/types';
import { RX_STATUS_OPTIONS, RxStatusTag } from '../../components/StatusTags';
import { formatMoney } from '../../lib/format';

/** Pharmacy worklist (R-18): process and hand over prescriptions; stock is enforced by the server. */
export default function PharmacyPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string | undefined>('NEW');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [shortages, setShortages] = useState<Record<number, string>>({});
  const [dispensing, setDispensing] = useState(false);

  const params = { status, q: q || undefined, page, per_page: 20 };
  const { data, isFetching } = useQuery({
    queryKey: ['rx-list', params],
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/prescriptions', { params })).data,
  });
  const { data: rx } = useQuery({
    queryKey: ['rx', openId],
    enabled: openId !== null,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row>>(`/prescriptions/${openId}`)).data.data!,
  });

  const dispense = async () => {
    setDispensing(true);
    setShortages({});
    try {
      await yiiApi.post(`/prescriptions/${openId}/dispense`);
      message.success('Obat diserahkan, stok berkurang');
      await Promise.all([qc.invalidateQueries({ queryKey: ['rx'] }), qc.invalidateQueries({ queryKey: ['rx-list'] })]);
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'STOCK_INSUFFICIENT') {
        const map: Record<number, string> = {};
        err.details.forEach((d) => {
          const m = d.field?.match(/items\[(\d+)\]/);
          if (m) map[Number(m[1])] = d.message;
        });
        setShortages(map);
        message.error({ content: `${err.message}. Tidak ada obat yang diserahkan.`, duration: 6 });
      } else {
        message.error(err.message);
      }
      qc.invalidateQueries({ queryKey: ['rx'] });
    } finally {
      setDispensing(false);
    }
  };

  return (
    <Card title="Farmasi - Resep">
      <Space wrap style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="Semua status" style={{ width: 180 }} options={RX_STATUS_OPTIONS} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
        <Input.Search allowClear placeholder="Cari nama, No. RM, No. resep" style={{ width: 280 }} onSearch={(v) => { setQ(v.trim()); setPage(1); }} />
        <Typography.Text type="secondary">Diperbarui otomatis tiap 10 detik</Typography.Text>
      </Space>
      <Table<Row>
        rowKey="id"
        size="middle"
        loading={isFetching}
        dataSource={data?.data ?? []}
        pagination={{ current: page, pageSize: 20, total: data?.meta?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'No. resep', dataIndex: 'prescription_no' },
          { title: 'Pasien', render: (_: unknown, r: Row) => <span>{r.patient_name} <Typography.Text type="secondary">({r.mrn})</Typography.Text></span> },
          { title: 'Dokter', dataIndex: 'doctor_name' },
          { title: 'Item', dataIndex: 'item_count', width: 70 },
          { title: 'Waktu', dataIndex: 'created_at', render: (v: string) => dayjs(v).format('DD-MM HH:mm') },
          { title: 'Status', dataIndex: 'status', render: (v: string) => <RxStatusTag status={v} /> },
          { title: '', key: 'a', render: (_: unknown, r: Row) => <Button size="small" type={r.status === 'NEW' ? 'primary' : 'default'} onClick={() => { setShortages({}); setOpenId(r.id); }}>{r.status === 'NEW' ? 'Proses' : 'Detail'}</Button> },
        ]}
      />

      <Drawer title={rx ? `Resep ${rx.prescription_no}` : 'Resep'} open={openId !== null} onClose={() => setOpenId(null)} width={760} destroyOnHidden>
        {rx && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Pasien">{rx.patient_name} ({rx.mrn})</Descriptions.Item>
              <Descriptions.Item label="Dokter">{rx.doctor_name}</Descriptions.Item>
              <Descriptions.Item label="Kunjungan">{rx.visit_no}</Descriptions.Item>
              <Descriptions.Item label="Status"><RxStatusTag status={rx.status} /></Descriptions.Item>
              {rx.dispensed_at && <Descriptions.Item label="Diserahkan oleh" span={2}>{rx.dispensed_by_name} - {dayjs(rx.dispensed_at).format('DD-MM-YYYY HH:mm')}</Descriptions.Item>}
              {rx.cancel_reason && <Descriptions.Item label="Alasan batal" span={2}>{rx.cancel_reason}</Descriptions.Item>}
            </Descriptions>
            {Object.keys(shortages).length > 0 && <Alert type="error" showIcon message="Stok tidak mencukupi - tidak ada obat yang diserahkan" description="Sesuaikan stok di Kartu stok atau minta dokter mengubah resep." />}
            <Table<Row>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={rx.items}
              columns={[
                { title: 'Obat', dataIndex: 'medicine_name' },
                { title: 'Dosis / frekuensi', render: (_: unknown, r: Row) => `${r.dose} - ${r.frequency}` },
                { title: 'Jumlah', dataIndex: 'qty', render: (v: number, r: Row) => `${v} ${r.unit}` },
                {
                  title: 'Stok',
                  dataIndex: 'stock_qty',
                  render: (v: number, r: Row, i: number) => {
                    const short = rx.status === 'NEW' && v < r.qty;
                    return <Typography.Text type={short || shortages[i] ? 'danger' : undefined}>{v}{shortages[i] ? ` (${shortages[i]})` : short ? ' (kurang)' : ''}</Typography.Text>;
                  },
                },
                { title: 'Subtotal', align: 'right', render: (_: unknown, r: Row) => formatMoney(Number(r.unit_price) * r.qty) },
              ]}
            />
            {rx.status === 'NEW' && can('pharmacy.dispense') && (
              <Popconfirm title="Serahkan obat?" description="Stok akan dikurangi dan biaya masuk tagihan." okText="Serahkan" cancelText="Batal" onConfirm={dispense}>
                <Button type="primary" loading={dispensing}>Serahkan obat</Button>
              </Popconfirm>
            )}
          </Space>
        )}
      </Drawer>
    </Card>
  );
}

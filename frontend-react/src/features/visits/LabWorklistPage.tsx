import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Drawer, Form, Input, Select, Space, Table, Typography, message } from 'antd';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { toApiError, yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Row } from '../../components/MasterCrudPage/types';
import { FlagTag, LAB_STATUS_OPTIONS, LabStatusTag } from '../../components/StatusTags';

const OPEN = 'ORDERED,IN_PROGRESS';
const FLAGS = ['NORMAL', 'LOW', 'HIGH', 'CRITICAL'].map((v) => ({ value: v, label: v }));

/** Laboratory worklist (R-20): lab analyst enters results; results from the external LIS arrive on their own. */
export default function LabWorklistPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [status, setStatus] = useState<string | undefined>(OPEN);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const canEnter = can('lab.result');

  const params = { status, q: q || undefined, page, per_page: 20 };
  const { data, isFetching } = useQuery({
    queryKey: ['lab-list', params],
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/lab-orders', { params })).data,
  });
  const { data: order } = useQuery({
    queryKey: ['lab-order', openId],
    enabled: openId !== null,
    refetchInterval: 10_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row>>(`/lab-orders/${openId}`)).data.data!,
  });

  useEffect(() => {
    if (order) {
      const values: Row = {};
      order.items.forEach((i: Row) => { values[`v${i.id}`] = i.result_value ?? undefined; values[`f${i.id}`] = i.result_flag ?? undefined; values[`n${i.id}`] = i.result_note ?? undefined; });
      form.setFieldsValue(values);
    }
  }, [order, form]);

  const save = async (values: Row) => {
    const results = (order!.items as Row[])
      .filter((i) => values[`v${i.id}`] !== undefined && String(values[`v${i.id}`]).trim() !== '')
      .map((i) => ({ item_id: i.id, value: String(values[`v${i.id}`]).trim(), flag: values[`f${i.id}`] || undefined, note: values[`n${i.id}`] || undefined }));
    if (!results.length) {
      message.warning('Isi minimal satu hasil');
      return;
    }
    setSaving(true);
    try {
      await yiiApi.put(`/lab-orders/${openId}/results`, { results });
      message.success('Hasil disimpan');
      await Promise.all([qc.invalidateQueries({ queryKey: ['lab-order'] }), qc.invalidateQueries({ queryKey: ['lab-list'] })]);
    } catch (e) {
      const err = toApiError(e);
      message.error({ content: [err.message, ...err.details.map((d) => d.message)].join(' - '), duration: 6 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Laboratorium - Permintaan">
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Semua status"
          style={{ width: 220 }}
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ value: OPEN, label: 'Belum selesai' }, ...LAB_STATUS_OPTIONS]}
        />
        <Input.Search allowClear placeholder="Cari nama, No. RM, No. order" style={{ width: 280 }} onSearch={(v) => { setQ(v.trim()); setPage(1); }} />
        <Typography.Text type="secondary">Diperbarui otomatis tiap 10 detik</Typography.Text>
      </Space>
      <Table<Row>
        rowKey="id"
        size="middle"
        loading={isFetching}
        dataSource={data?.data ?? []}
        pagination={{ current: page, pageSize: 20, total: data?.meta?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'No. order', dataIndex: 'order_no' },
          { title: 'Pasien', render: (_: unknown, r: Row) => <span>{r.patient_name} <Typography.Text type="secondary">({r.mrn})</Typography.Text></span> },
          { title: 'Dokter', dataIndex: 'doctor_name' },
          { title: 'Hasil', render: (_: unknown, r: Row) => `${r.resulted_count}/${r.item_count}`, width: 80 },
          { title: 'Waktu', dataIndex: 'created_at', render: (v: string) => dayjs(v).format('DD-MM HH:mm') },
          { title: 'Status', dataIndex: 'status', render: (v: string) => <LabStatusTag status={v} /> },
          { title: '', key: 'a', render: (_: unknown, r: Row) => <Button size="small" type={canEnter && r.status !== 'RESULTED' ? 'primary' : 'default'} onClick={() => setOpenId(r.id)}>{canEnter && r.status !== 'RESULTED' ? 'Input hasil' : 'Detail'}</Button> },
        ]}
      />

      <Drawer title={order ? `Order ${order.order_no}` : 'Order lab'} open={openId !== null} onClose={() => setOpenId(null)} width={820} destroyOnHidden>
        {order && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Pasien">{order.patient_name} ({order.mrn})</Descriptions.Item>
              <Descriptions.Item label="Dokter">{order.doctor_name}</Descriptions.Item>
              <Descriptions.Item label="Kunjungan">{order.visit_no}</Descriptions.Item>
              <Descriptions.Item label="Status"><LabStatusTag status={order.status} /></Descriptions.Item>
            </Descriptions>
            <Form form={form} onFinish={save}>
              <Table<Row>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={order.items}
                columns={[
                  { title: 'Pemeriksaan', dataIndex: 'test_name' },
                  { title: 'Normal', render: (_: unknown, r: Row) => `${r.normal_range ?? '-'} ${r.unit ?? ''}` },
                  { title: 'Hasil', render: (_: unknown, r: Row) => (canEnter ? <Form.Item name={`v${r.id}`} style={{ margin: 0 }}><Input style={{ width: 110 }} maxLength={100} /></Form.Item> : r.result_value ?? '-') },
                  { title: 'Flag', render: (_: unknown, r: Row) => (canEnter ? <Form.Item name={`f${r.id}`} style={{ margin: 0 }}><Select allowClear options={FLAGS} style={{ width: 110 }} /></Form.Item> : <FlagTag flag={r.result_flag} />) },
                  { title: 'Catatan', render: (_: unknown, r: Row) => (canEnter ? <Form.Item name={`n${r.id}`} style={{ margin: 0 }}><Input maxLength={255} /></Form.Item> : r.result_note ?? '-') },
                  { title: 'Sumber', dataIndex: 'result_source', width: 80, render: (v: string | null) => v ?? '-' },
                ]}
              />
              {canEnter && order.status !== 'CANCELLED' && (
                <Button type="primary" htmlType="submit" loading={saving} style={{ marginTop: 12 }}>Simpan hasil</Button>
              )}
            </Form>
          </Space>
        )}
      </Drawer>
    </Card>
  );
}

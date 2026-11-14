import { useState } from 'react';
import { Button, Drawer, Form, Input, InputNumber, Space, Table, Tag, message } from 'antd';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { toApiError, yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Row } from '../../components/MasterCrudPage/types';

interface Props {
  medicine: Row | null;
  onClose: () => void;
}

const TYPE_COLOR: Record<string, string> = { IN: 'green', OUT: 'red', ADJUST: 'blue' };

/** Stock card (kartu stok) of one medicine + manual adjustment for roles that may do it. */
export default function MedicineStockDrawer({ medicine, onClose }: Props) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ['stock-movements', medicine?.id, page],
    enabled: !!medicine,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await yiiApi.get<ApiEnvelope<Row[]>>(`/medicines/${medicine!.id}/stock-movements`, { params: { page, per_page: 10 } })).data,
  });

  const adjust = async (values: { qty_change: number; reason: string }) => {
    setSaving(true);
    try {
      await yiiApi.post(`/medicines/${medicine!.id}/stock-adjustments`, values);
      message.success('Stok disesuaikan');
      form.resetFields();
      setPage(1);
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      qc.invalidateQueries({ queryKey: ['medicines'] });
    } catch (e) {
      const err = toApiError(e);
      const fieldErrors = err.details.filter((d) => d.field);
      if (fieldErrors.length) form.setFields(fieldErrors.map((d) => ({ name: d.field!, errors: [d.message] })));
      else message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title={medicine ? `Kartu stok - ${medicine.name}` : ''} open={!!medicine} onClose={onClose} width={640} destroyOnHidden>
      {can('master.medicines.stock_adjust') && (
        <Form form={form} layout="inline" onFinish={adjust} style={{ marginBottom: 16 }}>
          <Form.Item name="qty_change" rules={[{ required: true, message: 'Jumlah wajib diisi' }]}>
            <InputNumber precision={0} placeholder="+ masuk / - keluar" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="reason" rules={[{ required: true, message: 'Alasan wajib diisi' }]}>
            <Input placeholder="Alasan penyesuaian" maxLength={255} style={{ width: 220 }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            Sesuaikan
          </Button>
        </Form>
      )}
      <Space style={{ marginBottom: 8 }}>
        Stok saat ini: <strong>{medicine?.stock_qty}</strong> {medicine?.unit}
      </Space>
      <Table<Row>
        rowKey="id"
        size="small"
        loading={isFetching}
        dataSource={data?.data ?? []}
        pagination={{ current: page, pageSize: 10, total: data?.meta?.total ?? 0, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'Waktu', dataIndex: 'created_at', render: (v: string) => dayjs(v).format('DD-MM-YYYY HH:mm') },
          { title: 'Jenis', dataIndex: 'movement_type', render: (v: string) => <Tag color={TYPE_COLOR[v]}>{v}</Tag> },
          { title: 'Jumlah', dataIndex: 'qty_change', align: 'right' },
          { title: 'Saldo', dataIndex: 'balance_after', align: 'right' },
          { title: 'Keterangan', dataIndex: 'reason' },
          { title: 'Oleh', dataIndex: 'created_by_name' },
        ]}
      />
    </Drawer>
  );
}

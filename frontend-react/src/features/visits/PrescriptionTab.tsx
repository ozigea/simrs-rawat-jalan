import { useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Table, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { yiiApi, toApiError, type ApiEnvelope } from '../../api/client';
import type { Row } from '../../components/MasterCrudPage/types';
import ReasonModal from '../../components/ReasonModal';
import { RxStatusTag } from '../../components/StatusTags';
import { notifyError } from '../../lib/errors';
import { formatMoney } from '../../lib/format';

interface Props {
  visit: Row;
  canWrite: boolean;
  reload: () => Promise<unknown>;
}

/** Prescriptions of the visit (R-17). Stock warnings are informative; the pharmacy enforces stock on dispense. */
export default function PrescriptionTab({ visit, canWrite, reload }: Props) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const prescriptions: Row[] = visit.clinical?.prescriptions ?? [];
  const editable = canWrite && ['IN_EXAM', 'EXAMINED'].includes(visit.status);

  const { data: medicines } = useQuery({
    queryKey: ['medicine-options'],
    staleTime: 30_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/medicines', { params: { per_page: 100, is_active: true, sort: 'name' } })).data.data ?? [],
  });
  const options = (medicines ?? []).map((m) => ({ value: m.id as number, label: `${m.name} - stok ${m.stock_qty} ${m.unit} - ${formatMoney(m.price)}` }));

  const submit = async (values: { items: Row[]; notes?: string }) => {
    setSaving(true);
    setWarnings([]);
    try {
      const r = await yiiApi.post<ApiEnvelope<Row>>(`/visits/${visit.id}/prescriptions`, values);
      const warn = (r.data.data?.warnings ?? []) as { message: string }[];
      setWarnings(warn.map((w) => w.message));
      message.success('Resep dibuat dan dikirim ke farmasi');
      form.resetFields();
      form.setFieldsValue({ items: [{ qty: 1 }] });
      await reload();
    } catch (e) {
      const err = toApiError(e);
      const first = err.details[0];
      message.error({ content: first ? `${err.message}: ${first.message}` : err.message, duration: 6 });
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async (reason: string) => {
    try {
      await yiiApi.post(`/prescriptions/${cancelTarget!.id}/cancel`, { reason });
      setCancelTarget(null);
      message.success('Resep dibatalkan');
      await reload();
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {editable && (
        <Card size="small" title="Resep baru">
          <Form form={form} layout="vertical" onFinish={submit} initialValues={{ items: [{ qty: 1 }] }}>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((f) => (
                    <Space key={f.key} align="start" wrap>
                      <Form.Item name={[f.name, 'medicine_id']} rules={[{ required: true, message: 'Pilih obat' }]}>
                        <Select showSearch optionFilterProp="label" style={{ width: 360 }} placeholder="Obat" options={options} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'dose']} rules={[{ required: true, message: 'Dosis?' }]}>
                        <Input placeholder="Dosis (500 mg)" style={{ width: 130 }} maxLength={100} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'frequency']} rules={[{ required: true, message: 'Frekuensi?' }]}>
                        <Input placeholder="Frekuensi (3x1)" style={{ width: 130 }} maxLength={100} />
                      </Form.Item>
                      <Form.Item name={[f.name, 'qty']} rules={[{ required: true, message: 'Jumlah?' }]}>
                        <InputNumber min={1} max={9999} precision={0} placeholder="Jml" />
                      </Form.Item>
                      <Form.Item name={[f.name, 'instruction']}>
                        <Input placeholder="Aturan pakai (opsional)" style={{ width: 200 }} />
                      </Form.Item>
                      {fields.length > 1 && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />}
                    </Space>
                  ))}
                  <Space>
                    <Button icon={<PlusOutlined />} onClick={() => add({ qty: 1 })}>Tambah obat</Button>
                    <Button type="primary" htmlType="submit" loading={saving}>Kirim resep</Button>
                  </Space>
                </>
              )}
            </Form.List>
          </Form>
          {warnings.length > 0 && <Alert style={{ marginTop: 12 }} type="warning" showIcon message="Perhatian stok (resep tetap dibuat)" description={warnings.map((w) => <div key={w}>{w}</div>)} />}
        </Card>
      )}

      {prescriptions.length === 0 && <Typography.Text type="secondary">Belum ada resep.</Typography.Text>}
      {prescriptions.map((rx) => (
        <Card
          key={rx.id}
          size="small"
          title={<Space>{rx.prescription_no} <RxStatusTag status={rx.status} /></Space>}
          extra={editable && rx.status === 'NEW' && <Button size="small" danger onClick={() => setCancelTarget(rx)}>Batalkan</Button>}
        >
          <Table<Row>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={rx.items}
            columns={[
              { title: 'Obat', dataIndex: 'medicine_name' },
              { title: 'Dosis', dataIndex: 'dose' },
              { title: 'Frekuensi', dataIndex: 'frequency' },
              { title: 'Jml', dataIndex: 'qty', width: 70, render: (v: number, r: Row) => `${v} ${r.unit}` },
              { title: 'Aturan', dataIndex: 'instruction', render: (v: string | null) => v ?? '-' },
            ]}
          />
          {rx.status === 'CANCELLED' && <Typography.Text type="danger">Dibatalkan: {rx.cancel_reason}</Typography.Text>}
        </Card>
      ))}
      <ReasonModal open={!!cancelTarget} title={`Batalkan resep ${cancelTarget?.prescription_no ?? ''}`} onOk={doCancel} onCancel={() => setCancelTarget(null)} />
    </Space>
  );
}

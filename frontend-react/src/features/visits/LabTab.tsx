import { useState } from 'react';
import { Button, Card, Input, Select, Space, Table, Typography, message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { yiiApi, type ApiEnvelope } from '../../api/client';
import type { Row } from '../../components/MasterCrudPage/types';
import { FlagTag, LabStatusTag } from '../../components/StatusTags';
import { notifyError } from '../../lib/errors';
import { formatMoney } from '../../lib/format';

interface Props {
  visit: Row;
  canWrite: boolean;
  reload: () => Promise<unknown>;
}

/** Lab requests of the visit and their results (R-20). The page refreshes while results are pending. */
export default function LabTab({ visit, canWrite, reload }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const orders: Row[] = visit.clinical?.lab_orders ?? [];
  const editable = canWrite && ['IN_EXAM', 'EXAMINED'].includes(visit.status);

  const { data: tests } = useQuery({
    queryKey: ['lab-test-options'],
    staleTime: 60_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/lab-tests', { params: { per_page: 100, is_active: true, sort: 'name' } })).data.data ?? [],
  });
  const options = (tests ?? []).map((t) => ({ value: t.id as number, label: `${t.name} - ${formatMoney(t.tariff)}` }));

  const submit = async () => {
    setSaving(true);
    try {
      await yiiApi.post(`/visits/${visit.id}/lab-orders`, { items: selected.map((id) => ({ lab_test_id: id })), notes: notes || undefined });
      message.success('Permintaan lab dikirim');
      setSelected([]);
      setNotes('');
      await reload();
    } catch (e) {
      notifyError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {editable && (
        <Card size="small" title="Permintaan lab baru">
          <Space wrap align="start">
            <Select mode="multiple" showSearch optionFilterProp="label" style={{ minWidth: 420 }} placeholder="Pilih pemeriksaan" options={options} value={selected} onChange={setSelected} maxTagCount="responsive" />
            <Input placeholder="Catatan (opsional)" style={{ width: 240 }} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={255} />
            <Button type="primary" disabled={selected.length === 0} loading={saving} onClick={submit}>Minta pemeriksaan</Button>
          </Space>
        </Card>
      )}
      {orders.length === 0 && <Typography.Text type="secondary">Belum ada permintaan laboratorium.</Typography.Text>}
      {orders.map((o) => (
        <Card key={o.id} size="small" title={<Space>{o.order_no} <LabStatusTag status={o.status} /></Space>}>
          <Table<Row>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={o.items}
            columns={[
              { title: 'Pemeriksaan', dataIndex: 'test_name' },
              { title: 'Hasil', dataIndex: 'result_value', render: (v: string | null, r: Row) => (v ? <strong>{v} {r.unit ?? ''}</strong> : <Typography.Text type="secondary">menunggu</Typography.Text>) },
              { title: 'Flag', dataIndex: 'result_flag', render: (v: string | null) => <FlagTag flag={v} /> },
              { title: 'Nilai normal', dataIndex: 'normal_range', render: (v: string | null) => v ?? '-' },
              { title: 'Sumber', dataIndex: 'result_source', render: (v: string | null) => v ?? '-' },
            ]}
          />
        </Card>
      ))}
    </Space>
  );
}

import { useState } from 'react';
import { Card, DatePicker, Input, Select, Space } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import RemoteSelect from '../../components/MasterCrudPage/RemoteSelect';
import { VISIT_STATUS_OPTIONS } from '../../components/VisitStatusTag';
import VisitTable from './VisitTable';

const polyclinics = { path: 'polyclinics', label: (r: Record<string, unknown>) => String(r.name) };

export default function VisitListPage() {
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [poli, setPoli] = useState<number | null>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [q, setQ] = useState('');

  return (
    <Card title="Daftar Kunjungan">
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker value={date} format="DD-MM-YYYY" onChange={setDate} placeholder="Semua tanggal" />
        <RemoteSelect remote={polyclinics} value={poli} onChange={(v) => setPoli(v as number | null)} placeholder="Semua poli" style={{ width: 200 }} />
        <Select allowClear placeholder="Semua status" style={{ width: 180 }} options={VISIT_STATUS_OPTIONS} value={status} onChange={setStatus} />
        <Input.Search allowClear placeholder="Cari nama, No. RM, No. kunjungan" style={{ width: 280 }} onSearch={(v) => setQ(v.trim())} />
      </Space>
      <VisitTable params={{ date: date?.format('YYYY-MM-DD'), polyclinic_id: poli ?? undefined, status, q: q || undefined }} poll />
    </Card>
  );
}

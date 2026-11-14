import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, DatePicker, Descriptions, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { toApiError, yiiApi, type ApiEnvelope } from '../../api/client';
import RemoteSelect from '../../components/MasterCrudPage/RemoteSelect';
import type { Row } from '../../components/MasterCrudPage/types';
import { notifyError } from '../../lib/errors';
import { uuid } from '../../lib/uuid';
import VisitTable from './VisitTable';

/** Patient picker: server-side search by name / No. RM / NIK / phone (R-08). */
function PatientSelect({ value, onChange }: { value?: Row | null; onChange: (p: Row | null) => void }) {
  const [q, setQ] = useState('');
  const { data, isFetching } = useQuery({
    queryKey: ['patient-search', q],
    enabled: q.trim().length >= 2,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/patients', { params: { q: q.trim(), per_page: 20, is_active: true } })).data.data ?? [],
  });
  const options = (data ?? []).map((p) => ({ value: p.id as number, label: `${p.mrn} - ${p.name}${p.nik ? ` (${p.nik})` : ''}`, row: p }));
  return (
    <Select
      showSearch
      allowClear
      filterOption={false}
      style={{ width: 360 }}
      placeholder="Cari pasien: No. RM, NIK, nama, telepon"
      notFoundContent={q.trim().length < 2 ? 'Ketik minimal 2 karakter' : isFetching ? 'Mencari...' : 'Pasien tidak ditemukan'}
      onSearch={setQ}
      options={options}
      value={value?.id}
      onChange={(_v, opt) => onChange(opt && !Array.isArray(opt) ? (opt as { row: Row }).row : null)}
    />
  );
}

export default function RegistrationPage() {
  const qc = useQueryClient();
  const [patient, setPatient] = useState<Row | null>(null);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [poli, setPoli] = useState<number | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // One Idempotency-Key per confirmation dialog, reused on retries until it succeeds (D-1).
  const idemKey = useRef<string>('');

  const dateStr = date.format('YYYY-MM-DD');
  const { data: schedules, isFetching } = useQuery({
    queryKey: ['schedules-available', dateStr, poli],
    queryFn: async () =>
      (await yiiApi.get<ApiEnvelope<Row[]>>('/schedules/available', { params: { date: dateStr, polyclinic_id: poli ?? undefined } })).data.data ?? [],
  });
  const polyOptions = useMemo(() => ({ path: 'polyclinics', params: { is_active: true }, label: (r: Row) => String(r.name) }), []);

  const open = (schedule: Row) => {
    idemKey.current = uuid();
    setFormError(null);
    setTarget(schedule);
  };

  const submit = async () => {
    if (!patient || !target) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const r = await yiiApi.post<ApiEnvelope<Row>>(
        '/visits',
        { patient_id: patient.id, schedule_id: target.id, visit_date: dateStr },
        { headers: { 'Idempotency-Key': idemKey.current } },
      );
      const visit = r.data.data!;
      setTarget(null);
      setPatient(null);
      Modal.success({
        title: 'Pendaftaran berhasil',
        content: (
          <div style={{ textAlign: 'center' }}>
            <div>Nomor antrean</div>
            <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1 }}>{visit.queue_no}</div>
            <div>{String(visit.patient_name)} - {String(visit.polyclinic_name)}</div>
            <div>{String(visit.doctor_name)}</div>
            <Typography.Text type="secondary">{String(visit.visit_no)}</Typography.Text>
          </div>
        ),
      });
      qc.invalidateQueries({ queryKey: ['visits'] });
      qc.invalidateQueries({ queryKey: ['schedules-available'] });
      qc.invalidateQueries({ queryKey: ['queues'] });
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'DUPLICATE_VISIT') {
        const existing = err.details[0] as { visit?: Row } | undefined;
        setFormError(`${err.message}${existing?.visit ? ` (antrean ${existing.visit.queue_no}, ${existing.visit.visit_no})` : ''}`);
      } else if (err.code === 'NETWORK' || err.code === 'TIMEOUT') {
        // Same key is kept: pressing the button again is a safe retry (no second visit).
        setFormError(`${err.message}. Tekan "Daftarkan" lagi untuk mencoba ulang dengan aman.`);
      } else {
        setFormError(err.message);
        notifyError(e);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="Pendaftaran Kunjungan">
        <Space wrap size="middle" style={{ marginBottom: 16 }}>
          <PatientSelect value={patient} onChange={setPatient} />
          <DatePicker
            allowClear={false}
            value={date}
            format="DD-MM-YYYY"
            disabledDate={(d) => d.isBefore(dayjs().startOf('day'))}
            onChange={(d) => d && setDate(d)}
          />
          <RemoteSelect remote={polyOptions} value={poli} onChange={(v) => setPoli(v as number | null)} placeholder="Semua poli" style={{ width: 200 }} />
        </Space>
        {!patient && <Alert type="info" showIcon message="Pilih pasien terlebih dahulu, lalu pilih jadwal dokter." style={{ marginBottom: 12 }} />}
        <Table<Row>
          rowKey="id"
          size="middle"
          loading={isFetching}
          dataSource={schedules ?? []}
          pagination={false}
          locale={{ emptyText: 'Tidak ada jadwal praktik pada tanggal ini' }}
          columns={[
            { title: 'Poli', dataIndex: 'polyclinic_name' },
            { title: 'Dokter', dataIndex: 'doctor_name' },
            { title: 'Jam', render: (_: unknown, r: Row) => `${r.start_time} - ${r.end_time}` },
            { title: 'Kuota', dataIndex: 'quota', width: 80 },
            { title: 'Sisa', dataIndex: 'remaining', width: 90, render: (v: number) => <Tag color={v > 0 ? 'green' : 'red'}>{v}</Tag> },
            {
              title: '',
              key: 'a',
              render: (_: unknown, r: Row) => (
                <Button type="primary" size="small" disabled={!patient || r.remaining <= 0} onClick={() => open(r)}>
                  Daftar
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card title={`Pendaftaran ${date.format('DD-MM-YYYY')}`}>
        <VisitTable params={{ date: dateStr }} poll />
      </Card>

      <Modal
        open={!!target}
        title="Konfirmasi pendaftaran"
        okText="Daftarkan"
        cancelText="Batal"
        confirmLoading={submitting}
        onOk={submit}
        onCancel={() => setTarget(null)}
        maskClosable={false}
      >
        {formError && <Alert type="error" showIcon message={formError} style={{ marginBottom: 12 }} />}
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Pasien">{patient?.name} ({patient?.mrn})</Descriptions.Item>
          <Descriptions.Item label="Tanggal">{date.format('DD-MM-YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Poli">{target?.polyclinic_name}</Descriptions.Item>
          <Descriptions.Item label="Dokter">{target?.doctor_name}</Descriptions.Item>
          <Descriptions.Item label="Jam">{target?.start_time} - {target?.end_time}</Descriptions.Item>
        </Descriptions>
      </Modal>
    </Space>
  );
}

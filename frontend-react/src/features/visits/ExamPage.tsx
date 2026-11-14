import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Descriptions, Form, Input, InputNumber, Popconfirm, Radio, Result, Select, Space, Spin, Table, Tabs, Tag, Typography, message,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { toApiError, yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Row } from '../../components/MasterCrudPage/types';
import ReasonModal from '../../components/ReasonModal';
import VisitStatusTag from '../../components/VisitStatusTag';
import { notifyError } from '../../lib/errors';
import { formatMoney } from '../../lib/format';
import LabTab from './LabTab';
import PatientHistory from './PatientHistory';
import PrescriptionTab from './PrescriptionTab';

type Reload = () => Promise<unknown>;

/** Maps API field errors onto the form; returns true when something was mapped. */
function applyFieldErrors(form: ReturnType<typeof Form.useForm>[0], e: unknown): boolean {
  const err = toApiError(e);
  const mapped = err.details.filter((d) => d.field && form.getFieldValue(d.field) !== undefined);
  if (mapped.length) form.setFields(mapped.map((d) => ({ name: d.field!, errors: [d.message] })));
  return mapped.length > 0;
}

// ------------------------------------------------------------------ examination (R-13)
function ExaminationTab({ visit, canWrite, reload }: { visit: Row; canWrite: boolean; reload: Reload }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const exam: Row | null = visit.clinical?.examination ?? null;
  const editable = canWrite && ['IN_EXAM', 'EXAMINED'].includes(visit.status);

  useEffect(() => {
    form.resetFields();
    if (exam) form.setFieldsValue({ ...exam, temperature: exam.temperature === null ? null : Number(exam.temperature), weight_kg: exam.weight_kg === null ? null : Number(exam.weight_kg), height_cm: exam.height_cm === null ? null : Number(exam.height_cm) });
  }, [exam, form]);

  const save = async (values: Row) => {
    setSaving(true);
    try {
      await yiiApi.put(`/visits/${visit.id}/examination`, { ...values, version: exam?.version });
      message.success('Pemeriksaan disimpan');
      await reload();
    } catch (e) {
      if (!applyFieldErrors(form, e)) notifyError(e);
      if (toApiError(e).code === 'VERSION_CONFLICT') await reload();
    } finally {
      setSaving(false);
    }
  };

  const num = (label: string, name: string, extra: Row = {}) => (
    <Form.Item label={label} name={name} style={{ width: 150 }}>
      <InputNumber style={{ width: '100%' }} disabled={!editable} {...extra} />
    </Form.Item>
  );

  return (
    <Form form={form} layout="vertical" onFinish={save}>
      {visit.status === 'WAITING' && <Alert type="warning" showIcon message="Pasien belum dipanggil. Panggil pasien untuk mulai mengisi pemeriksaan." style={{ marginBottom: 12 }} />}
      <Form.Item label="Keluhan utama" name="chief_complaint" rules={[{ required: true, message: 'Keluhan utama wajib diisi' }]}>
        <Input.TextArea rows={2} maxLength={5000} disabled={!editable} />
      </Form.Item>
      <Form.Item label="Anamnesis" name="anamnesis">
        <Input.TextArea rows={3} maxLength={5000} disabled={!editable} />
      </Form.Item>
      <Space wrap size="middle" align="start">
        {num('Sistolik (mmHg)', 'systolic', { min: 30, max: 300, precision: 0 })}
        {num('Diastolik (mmHg)', 'diastolic', { min: 20, max: 200, precision: 0 })}
        {num('Nadi (/menit)', 'pulse', { min: 20, max: 300, precision: 0 })}
        {num('Napas (/menit)', 'resp_rate', { min: 5, max: 80, precision: 0 })}
        {num('Suhu (C)', 'temperature', { min: 25, max: 45, step: 0.1, precision: 1 })}
        {num('SpO2 (%)', 'spo2', { min: 0, max: 100, precision: 0 })}
        {num('Berat (kg)', 'weight_kg', { min: 0.1, max: 500, step: 0.5, precision: 1 })}
        {num('Tinggi (cm)', 'height_cm', { min: 1, max: 300, step: 0.5, precision: 1 })}
      </Space>
      <Form.Item label="Pemeriksaan fisik" name="physical_exam">
        <Input.TextArea rows={3} maxLength={5000} disabled={!editable} />
      </Form.Item>
      {editable && (
        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>Simpan pemeriksaan</Button>
          {exam && <Typography.Text type="secondary">Versi {exam.version}</Typography.Text>}
        </Space>
      )}
    </Form>
  );
}

// ------------------------------------------------------------------ diagnoses (R-14)
function DiagnosisTab({ visit, canWrite, reload }: { visit: Row; canWrite: boolean; reload: Reload }) {
  const [form] = Form.useForm();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const diagnoses: Row[] = visit.clinical?.diagnoses ?? [];
  const editable = canWrite && ['IN_EXAM', 'EXAMINED', 'DONE'].includes(visit.status);

  const { data: options, isFetching } = useQuery({
    queryKey: ['icd10-search', q],
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/icd10', { params: { q: q || undefined, per_page: 20, is_active: true } })).data.data ?? [],
  });

  const add = async (values: { icd10_code: string; type: string; notes?: string }) => {
    setAdding(true);
    try {
      await yiiApi.post(`/visits/${visit.id}/diagnoses`, values);
      form.resetFields();
      message.success('Diagnosis ditambahkan');
      await reload();
    } catch (e) {
      if (!applyFieldErrors(form, e)) notifyError(e);
    } finally {
      setAdding(false);
    }
  };

  const doVoid = async (reason: string) => {
    try {
      await yiiApi.delete(`/visits/${visit.id}/diagnoses/${voiding!.id}`, { params: { reason } });
      setVoiding(null);
      message.success('Diagnosis dibatalkan');
      await reload();
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {editable && (
        <Form form={form} layout="inline" onFinish={add} initialValues={{ type: diagnoses.some((d) => d.type === 'PRIMARY' && d.status === 'ACTIVE') ? 'SECONDARY' : 'PRIMARY' }}>
          <Form.Item name="icd10_code" rules={[{ required: true, message: 'Pilih diagnosis' }]}>
            <Select
              showSearch
              filterOption={false}
              loading={isFetching}
              style={{ width: 360 }}
              placeholder="Cari kode / nama ICD-10"
              onSearch={setQ}
              options={(options ?? []).map((o) => ({ value: o.code as string, label: `${o.code} - ${o.description}` }))}
            />
          </Form.Item>
          <Form.Item name="type">
            <Radio.Group optionType="button" options={[{ value: 'PRIMARY', label: 'Utama' }, { value: 'SECONDARY', label: 'Sekunder' }]} />
          </Form.Item>
          <Form.Item name="notes">
            <Input placeholder="Catatan (opsional)" style={{ width: 200 }} maxLength={255} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={adding}>Tambah</Button>
        </Form>
      )}
      <Table<Row>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={diagnoses}
        locale={{ emptyText: 'Belum ada diagnosis' }}
        columns={[
          { title: 'Kode', dataIndex: 'icd10_code', width: 90 },
          { title: 'Diagnosis', dataIndex: 'description' },
          { title: 'Jenis', dataIndex: 'type', render: (v: string) => <Tag color={v === 'PRIMARY' ? 'blue' : 'default'}>{v === 'PRIMARY' ? 'Utama' : 'Sekunder'}</Tag> },
          {
            title: 'Status',
            render: (_: unknown, r: Row) => (r.status === 'VOID' ? <Tag color="red" title={r.void_reason}>Dibatalkan: {r.void_reason}</Tag> : <Tag color="green">Aktif</Tag>),
          },
          {
            title: '',
            key: 'a',
            render: (_: unknown, r: Row) => editable && r.status === 'ACTIVE' && <Button size="small" danger onClick={() => setVoiding(r)}>Batalkan</Button>,
          },
        ]}
        rowClassName={(r) => (r.status === 'VOID' ? 'row-void' : '')}
      />
      <ReasonModal open={!!voiding} title={`Batalkan diagnosis ${voiding?.icd10_code ?? ''}`} onOk={doVoid} onCancel={() => setVoiding(null)} />
    </Space>
  );
}

// ------------------------------------------------------------------ procedures (R-16)
function ProcedureTab({ visit, canWrite, reload }: { visit: Row; canWrite: boolean; reload: Reload }) {
  const [form] = Form.useForm();
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const lines: Row[] = visit.clinical?.procedures ?? [];
  const editable = canWrite && ['IN_EXAM', 'EXAMINED'].includes(visit.status);
  const total = useMemo(() => lines.filter((l) => l.status === 'ACTIVE').reduce((s, l) => s + Number(l.amount), 0), [lines]);

  const { data: procedures } = useQuery({
    queryKey: ['procedure-options'],
    staleTime: 60_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>('/procedures', { params: { per_page: 100, is_active: true, sort: 'name' } })).data.data ?? [],
  });
  const options = (procedures ?? []).map((p) => ({ value: p.id as number, label: `${p.name} - ${formatMoney(p.tariff)}` }));

  const add = async (values: { items: { procedure_id: number; qty: number }[] }) => {
    setAdding(true);
    try {
      await yiiApi.post(`/visits/${visit.id}/procedures`, { items: values.items.map((i) => ({ procedure_id: i.procedure_id, qty: i.qty ?? 1 })) });
      form.resetFields();
      message.success('Tindakan ditambahkan dan masuk tagihan');
      await reload();
    } catch (e) {
      notifyError(e);
    } finally {
      setAdding(false);
    }
  };

  const doVoid = async (reason: string) => {
    try {
      await yiiApi.post(`/visit-procedures/${voiding!.id}/void`, { reason });
      setVoiding(null);
      message.success('Tindakan dibatalkan');
      await reload();
    } catch (e) {
      notifyError(e);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {editable && (
        <Form form={form} onFinish={add} initialValues={{ items: [{ qty: 1 }] }}>
          <Form.List name="items">
            {(fields, { add: addRow, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="baseline">
                    <Form.Item name={[f.name, 'procedure_id']} rules={[{ required: true, message: 'Pilih tindakan' }]}>
                      <Select showSearch optionFilterProp="label" style={{ width: 380 }} placeholder="Pilih tindakan" options={options} />
                    </Form.Item>
                    <Form.Item name={[f.name, 'qty']} rules={[{ required: true, message: 'Jumlah?' }]}>
                      <InputNumber min={1} max={99} precision={0} />
                    </Form.Item>
                    {fields.length > 1 && <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(f.name)} />}
                  </Space>
                ))}
                <Space>
                  <Button icon={<PlusOutlined />} onClick={() => addRow({ qty: 1 })}>Baris tindakan</Button>
                  <Button type="primary" htmlType="submit" loading={adding}>Simpan tindakan</Button>
                </Space>
              </>
            )}
          </Form.List>
        </Form>
      )}
      <Table<Row>
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={lines}
        locale={{ emptyText: 'Belum ada tindakan' }}
        columns={[
          { title: 'Tindakan', dataIndex: 'procedure_name' },
          { title: 'Jml', dataIndex: 'qty', width: 60 },
          { title: 'Tarif', dataIndex: 'unit_tariff', align: 'right', render: (v: string) => formatMoney(v) },
          { title: 'Subtotal', dataIndex: 'amount', align: 'right', render: (v: string) => formatMoney(v) },
          { title: 'Status', render: (_: unknown, r: Row) => (r.status === 'VOID' ? <Tag color="red">Dibatalkan: {r.void_reason}</Tag> : <Tag color="green">Aktif</Tag>) },
          { title: '', key: 'a', render: (_: unknown, r: Row) => editable && r.status === 'ACTIVE' && <Button size="small" danger onClick={() => setVoiding(r)}>Batalkan</Button> },
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={3} align="right"><strong>Total tindakan</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right"><strong>{formatMoney(total)}</strong></Table.Summary.Cell>
            <Table.Summary.Cell index={2} colSpan={2} />
          </Table.Summary.Row>
        )}
        rowClassName={(r) => (r.status === 'VOID' ? 'row-void' : '')}
      />
      <ReasonModal open={!!voiding} title={`Batalkan tindakan ${voiding?.procedure_name ?? ''}`} onOk={doVoid} onCancel={() => setVoiding(null)} />
    </Space>
  );
}

// ------------------------------------------------------------------ page
export default function ExamPage() {
  const { id } = useParams();
  const visitId = Number(id);
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: visit, isLoading, error, refetch } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row>>(`/visits/${visitId}`)).data.data!,
    // Lab results can arrive at any time (external system): refresh while some are pending.
    refetchInterval: (q) => ((q.state.data?.clinical?.lab_orders as Row[] | undefined)?.some((o) => o.status !== 'RESULTED' && o.status !== 'CANCELLED') ? 10_000 : false),
  });
  const reload: Reload = async () => {
    await refetch();
    qc.invalidateQueries({ queryKey: ['queues'] });
    qc.invalidateQueries({ queryKey: ['visits'] });
  };

  if (isLoading) return <Spin />;
  if (error || !visit) {
    const code = toApiError(error).code;
    return <Result status={code === 'FORBIDDEN' ? '403' : '404'} title={code === 'FORBIDDEN' ? 'Anda tidak berhak mengakses kunjungan ini' : 'Kunjungan tidak ditemukan'} extra={<Button onClick={() => navigate(-1)}>Kembali</Button>} />;
  }

  const canWrite = can('exam.write');
  const act = async (path: 'call' | 'finish') => {
    setBusy(true);
    try {
      await yiiApi.post(`/visits/${visitId}/${path}`);
      message.success(path === 'call' ? 'Pasien dipanggil' : 'Pemeriksaan diselesaikan');
      await reload();
    } catch (e) {
      const err = toApiError(e);
      message.error({ content: [err.message, ...err.details.map((d) => d.message)].join(' - '), duration: 6 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Button onClick={() => navigate(-1)}>Kembali</Button>
        {canWrite && visit.status === 'WAITING' && <Button type="primary" loading={busy} onClick={() => act('call')}>Panggil pasien</Button>}
        {canWrite && visit.status === 'IN_EXAM' && (
          <Popconfirm title="Selesaikan pemeriksaan?" description="Pemeriksaan dan diagnosis utama harus sudah terisi." okText="Selesai" cancelText="Batal" onConfirm={() => act('finish')}>
            <Button type="primary" loading={busy}>Selesai periksa</Button>
          </Popconfirm>
        )}
      </Space>

      <Card size="small">
        <Descriptions size="small" column={{ xs: 1, md: 3 }}>
          <Descriptions.Item label="Antrean"><strong>{visit.queue_no}</strong></Descriptions.Item>
          <Descriptions.Item label="No. kunjungan">{visit.visit_no}</Descriptions.Item>
          <Descriptions.Item label="Status"><VisitStatusTag status={visit.status} /></Descriptions.Item>
          <Descriptions.Item label="Pasien">{visit.patient_name} ({visit.mrn})</Descriptions.Item>
          <Descriptions.Item label="Poli">{visit.polyclinic_name}</Descriptions.Item>
          <Descriptions.Item label="Dokter">{visit.doctor_name}</Descriptions.Item>
        </Descriptions>
      </Card>

      {!visit.clinical ? (
        <Alert type="info" showIcon message="Data medis tidak tersedia untuk peran Anda." />
      ) : (
        <Card>
          <Tabs
            items={[
              { key: 'exam', label: 'Pemeriksaan', children: <ExaminationTab visit={visit} canWrite={canWrite} reload={reload} /> },
              { key: 'dx', label: `Diagnosis (${visit.clinical.diagnoses.filter((d: Row) => d.status === 'ACTIVE').length})`, children: <DiagnosisTab visit={visit} canWrite={canWrite} reload={reload} /> },
              { key: 'proc', label: `Tindakan (${visit.clinical.procedures.filter((d: Row) => d.status === 'ACTIVE').length})`, children: <ProcedureTab visit={visit} canWrite={canWrite} reload={reload} /> },
              { key: 'rx', label: `Resep (${visit.clinical.prescriptions.length})`, children: <PrescriptionTab visit={visit} canWrite={canWrite} reload={reload} /> },
              { key: 'lab', label: `Lab (${visit.clinical.lab_orders.length})`, children: <LabTab visit={visit} canWrite={canWrite} reload={reload} /> },
              { key: 'hist', label: 'Riwayat pasien', children: <PatientHistory patientId={visit.patient_id} /> },
            ]}
          />
        </Card>
      )}
    </Space>
  );
}

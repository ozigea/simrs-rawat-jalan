import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Result, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import { toApiError, yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { Row } from '../../components/MasterCrudPage/types';
import { InvoiceStatusTag } from '../../components/StatusTags';
import { formatMoney } from '../../lib/format';
import { openPdf } from '../../lib/pdf';
import { uuid } from '../../lib/uuid';

const METHODS = [
  { value: 'CASH', label: 'Tunai' },
  { value: 'DEBIT', label: 'Kartu debit (simulasi)' },
  { value: 'CREDIT', label: 'Kartu kredit (simulasi)' },
  { value: 'QRIS', label: 'QRIS (simulasi)' },
  { value: 'TRANSFER', label: 'Transfer (simulasi)' },
];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS.map((m) => [m.value, m.label]));
const TYPE_LABEL: Record<string, string> = { REGISTRATION: 'Pendaftaran', PROCEDURE: 'Tindakan', LAB: 'Laboratorium', MEDICINE: 'Obat', ADJUSTMENT: 'Penyesuaian' };
const simRef = () => `SIM-${dayjs().format('YYMMDDHHmmss')}`;

/** Invoice detail (R-22) with the payment form (R-23, D-3) and printable documents (R-25). */
export default function InvoicePage() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [method, setMethod] = useState('CASH');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // One key per payment attempt: it survives network errors/retries and is renewed only after success (D-3).
  const idemKey = useRef<string>(uuid());

  const { data: inv, isLoading, error } = useQuery({
    queryKey: ['invoice', invoiceId],
    refetchInterval: 10_000,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row>>(`/invoices/${invoiceId}`)).data.data!,
  });

  const remaining = Number(inv?.remaining ?? 0);
  const open = !!inv && ['UNPAID', 'PARTIAL'].includes(inv.status) && remaining > 0;
  const remainingKey = inv?.remaining;
  // Default the amount to the current balance whenever it changes (first load, after a payment, after a correction).
  useEffect(() => {
    if (remainingKey !== undefined) form.setFieldsValue({ amount: Math.max(Number(remainingKey), 0).toFixed(2) });
  }, [remainingKey, form]);

  const amount = Form.useWatch('amount', form);
  const cash = Form.useWatch('cash_received', form);
  const change = method === 'CASH' && amount && cash ? Number(cash) - Number(amount) : null;

  if (isLoading) return <Spin />;
  if (error || !inv) return <Result status="404" title="Tagihan tidak ditemukan" extra={<Button onClick={() => navigate('/billing')}>Kembali</Button>} />;

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['invoice', invoiceId] }), qc.invalidateQueries({ queryKey: ['invoices'] }), qc.invalidateQueries({ queryKey: ['payments'] })]);

  const submit = async (values: Row) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const body = { method: values.method, amount: String(values.amount), cash_received: values.method === 'CASH' ? String(values.cash_received) : undefined, reference_no: values.method === 'CASH' ? undefined : values.reference_no };
      const r = await yiiApi.post<ApiEnvelope<Row>>(`/invoices/${invoiceId}/payments`, body, { headers: { 'Idempotency-Key': idemKey.current } });
      const p = r.data.data!;
      idemKey.current = uuid();
      await refresh();
      setMethod('CASH');
      form.setFieldsValue({ method: 'CASH', amount: Math.max(Number(p.remaining), 0).toFixed(2), cash_received: undefined, reference_no: simRef() });
      Modal.success({
        title: 'Pembayaran berhasil',
        content: (
          <div>
            <div>{p.payment_no} - {METHOD_LABEL[p.method]}</div>
            <div>Dibayar: <strong>{formatMoney(p.amount)}</strong></div>
            {p.method === 'CASH' && <div>Kembalian: <strong>{formatMoney(p.change_amount)}</strong></div>}
            <div>Sisa tagihan: <strong>{formatMoney(p.remaining)}</strong> ({p.invoice_status === 'PAID' ? 'LUNAS' : 'belum lunas'})</div>
            <Button style={{ marginTop: 8 }} icon={<PrinterOutlined />} onClick={() => openPdf(`/payments/${p.id}/receipt`, `kuitansi-${p.payment_no}.pdf`)}>Cetak kuitansi</Button>
          </div>
        ),
      });
    } catch (e) {
      const err = toApiError(e);
      const field = err.details.find((d) => d.field && ['amount', 'cash_received', 'reference_no', 'method'].includes(d.field));
      if (field) form.setFields([{ name: field.field!, errors: [field.message] }]);
      if (err.code === 'NETWORK' || err.code === 'TIMEOUT') {
        setFormError(`${err.message}. Pembayaran mungkin sudah tercatat - tekan "Bayar" sekali lagi: kunci idempotensi yang sama mencegah pembayaran ganda.`);
      } else {
        setFormError(err.message);
        if (['INVOICE_ALREADY_PAID', 'OVERPAYMENT'].includes(err.code)) {
          idemKey.current = uuid();
          await refresh();
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Button onClick={() => navigate('/billing')}>Kembali</Button>
        <Button icon={<PrinterOutlined />} onClick={() => openPdf(`/invoices/${invoiceId}/pdf`, `invoice-${inv.invoice_no}.pdf`)}>Cetak invoice (PDF)</Button>
      </Space>

      <Card size="small">
        <Descriptions size="small" column={{ xs: 1, md: 3 }}>
          <Descriptions.Item label="No. invoice"><strong>{inv.invoice_no}</strong></Descriptions.Item>
          <Descriptions.Item label="Status"><InvoiceStatusTag status={inv.status} /></Descriptions.Item>
          <Descriptions.Item label="Versi">{inv.version}</Descriptions.Item>
          <Descriptions.Item label="Pasien">{inv.patient_name} ({inv.mrn})</Descriptions.Item>
          <Descriptions.Item label="Kunjungan">{inv.visit_no} - {dayjs(inv.visit_date).format('DD-MM-YYYY')}</Descriptions.Item>
          <Descriptions.Item label="Poli / dokter">{inv.polyclinic_name} / {inv.doctor_name}</Descriptions.Item>
        </Descriptions>
      </Card>

      {inv.status === 'OVERPAID' && <Alert type="warning" showIcon message="Kelebihan bayar" description={`Total tagihan turun setelah pembayaran. Kelebihan ${formatMoney(-remaining)} perlu dikembalikan secara manual (refund di luar cakupan aplikasi).`} />}

      <Card title="Rincian tagihan">
        <Table<Row>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={inv.lines}
          rowClassName={(r) => (r.status === 'VOID' ? 'row-void' : '')}
          columns={[
            { title: 'Jenis', dataIndex: 'source_type', width: 130, render: (v: string) => TYPE_LABEL[v] ?? v },
            { title: 'Rincian', dataIndex: 'description', render: (v: string, r: Row) => (r.status === 'VOID' ? <span>{v} <Tag color="red">dibatalkan: {r.void_reason}</Tag></span> : v) },
            { title: 'Jml', dataIndex: 'qty', width: 70 },
            { title: 'Harga', dataIndex: 'unit_price', align: 'right', render: (v: string) => formatMoney(v) },
            { title: 'Subtotal', dataIndex: 'amount', align: 'right', render: (v: string, r: Row) => (r.status === 'VOID' ? '-' : formatMoney(v)) },
          ]}
          summary={() => (
            <>
              <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={4} align="right"><strong>Total</strong></Table.Summary.Cell><Table.Summary.Cell index={1} align="right"><strong>{formatMoney(inv.total_amount)}</strong></Table.Summary.Cell></Table.Summary.Row>
              <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={4} align="right">Dibayar</Table.Summary.Cell><Table.Summary.Cell index={1} align="right">{formatMoney(inv.paid_amount)}</Table.Summary.Cell></Table.Summary.Row>
              <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={4} align="right"><strong>Sisa</strong></Table.Summary.Cell><Table.Summary.Cell index={1} align="right"><strong>{formatMoney(inv.remaining)}</strong></Table.Summary.Cell></Table.Summary.Row>
            </>
          )}
        />
      </Card>

      {can('billing.write') && (
        <Card title="Pembayaran">
          {!open ? (
            <Typography.Text type="secondary">{inv.status === 'PAID' ? 'Tagihan sudah lunas.' : 'Tidak ada sisa tagihan yang dapat dibayar.'}</Typography.Text>
          ) : (
            <Form form={form} layout="vertical" initialValues={{ method: 'CASH', reference_no: simRef() }} onFinish={submit} style={{ maxWidth: 520 }}>
              {formError && <Alert type="error" showIcon message={formError} style={{ marginBottom: 12 }} />}
              <Form.Item label="Metode" name="method" rules={[{ required: true }]}>
                <Select options={METHODS} onChange={setMethod} />
              </Form.Item>
              <Form.Item label="Jumlah dibayar" name="amount" extra={`Sisa tagihan ${formatMoney(inv.remaining)} - boleh dicicil`} rules={[{ required: true, message: 'Jumlah wajib diisi' }, { validator: async (_, v) => { if (v !== undefined && v !== null && v !== '' && (Number(v) <= 0 || Number(v) > remaining)) throw new Error(`Jumlah harus antara 0 dan sisa tagihan (${formatMoney(inv.remaining)})`); } }]}>
                <InputNumber stringMode min="0.01" step="1000" precision={2} style={{ width: '100%' }} />
              </Form.Item>
              {method === 'CASH' ? (
                <>
                  <Form.Item label="Uang diterima" name="cash_received" rules={[{ required: true, message: 'Uang diterima wajib diisi' }, { validator: async (_, v) => { if (v && amount && Number(v) < Number(amount)) throw new Error('Uang diterima kurang dari jumlah dibayar'); } }]}>
                    <InputNumber stringMode min="0" step="1000" precision={2} style={{ width: '100%' }} />
                  </Form.Item>
                  {change !== null && change >= 0 && <Typography.Paragraph>Kembalian: <strong>{formatMoney(change)}</strong></Typography.Paragraph>}
                </>
              ) : (
                <Form.Item label="No. referensi (simulasi)" name="reference_no" rules={[{ required: true, message: 'No. referensi wajib untuk non-tunai' }]}>
                  <Input maxLength={60} />
                </Form.Item>
              )}
              <Button type="primary" htmlType="submit" loading={submitting}>Bayar</Button>
            </Form>
          )}
        </Card>
      )}

      <Card title="Riwayat pembayaran tagihan ini">
        <Table<Row>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={inv.payments}
          locale={{ emptyText: 'Belum ada pembayaran' }}
          columns={[
            { title: 'No. pembayaran', dataIndex: 'payment_no' },
            { title: 'Waktu', dataIndex: 'paid_at', render: (v: string) => dayjs(v).format('DD-MM-YYYY HH:mm') },
            { title: 'Metode', dataIndex: 'method', render: (v: string, r: Row) => `${METHOD_LABEL[v] ?? v}${r.reference_no ? ` (${r.reference_no})` : ''}` },
            { title: 'Jumlah', dataIndex: 'amount', align: 'right', render: (v: string) => formatMoney(v) },
            { title: 'Kembalian', dataIndex: 'change_amount', align: 'right', render: (v: string) => (Number(v) > 0 ? formatMoney(v) : '-') },
            { title: 'Kasir', dataIndex: 'cashier_name' },
            { title: '', key: 'a', render: (_: unknown, r: Row) => <Button size="small" icon={<PrinterOutlined />} onClick={() => openPdf(`/payments/${r.id}/receipt`, `kuitansi-${r.payment_no}.pdf`)}>Kuitansi</Button> },
          ]}
        />
      </Card>
    </Space>
  );
}

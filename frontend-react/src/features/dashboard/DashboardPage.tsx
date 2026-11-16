import { useState, type ReactNode } from 'react';
import { Alert, Button, Card, Col, DatePicker, Empty, Row, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { nodeApi, toApiError, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { INVOICE_STATUS_OPTIONS, InvoiceStatusTag } from '../../components/StatusTags';
import { formatMoney } from '../../lib/format';

interface Summary { visits: number; cancelled_visits: number; procedures: number; procedure_amount: string; revenue: string; medicine_qty: number; invoices: number; outstanding: string }
interface PolyRow { polyclinic_id: number; polyclinic_name: string; visit_count: number; cancelled_count: number }
interface ProcRow { procedure_id: number; procedure_code: string; procedure_name: string; qty: number; amount: string }
interface MedRow { medicine_id: number; medicine_code: string; medicine_name: string; unit: string; qty: number; amount: string }
interface RevDay { date: string; amount: string; payment_count: number }
interface RevMethod { method: string; payment_count: number; amount: string }
interface StatusRow { status: string; invoice_count: number; total_amount: string; paid_amount: string }
type Period = { from: string; to: string };

const STATUS_COLOR: Record<string, string> = { UNPAID: '#ff4d4f', PARTIAL: '#fa8c16', PAID: '#52c41a', OVERPAID: '#722ed1' };
const STATUS_LABEL = Object.fromEntries(INVOICE_STATUS_OPTIONS.map((o) => [o.value, o.label]));
const METHOD_LABEL: Record<string, string> = { CASH: 'Tunai', DEBIT: 'Debit', CREDIT: 'Kartu kredit', QRIS: 'QRIS', TRANSFER: 'Transfer' };
const FMT = 'YYYY-MM-DD';

/** One independent widget: its own request, so one failing/slow endpoint (e.g. Node down) never blanks the page. */
function useWidget<T>(name: string, path: string, params: Record<string, string | number>) {
  return useQuery({
    queryKey: ['dashboard', name, params],
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => (await nodeApi.get<ApiEnvelope<T>>(`/dashboard/${path}`, { params })).data.data as T,
  });
}

interface WidgetState { isLoading: boolean; isFetching: boolean; error: unknown; refetch: () => unknown; data: unknown }

function Widget({ title, q, children, extra }: { title: string; q: WidgetState; children: ReactNode; extra?: ReactNode }) {
  const isEmpty = Array.isArray(q.data) && q.data.length === 0;
  return (
    <Card title={title} size="small" extra={extra} style={{ height: '100%' }}>
      {q.error ? (
        <Alert
          type="error"
          showIcon
          message="Data dashboard tidak dapat dimuat"
          description={toApiError(q.error).message}
          action={<Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => q.refetch()}>Muat ulang</Button>}
        />
      ) : q.isLoading ? (
        <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
      ) : isEmpty ? (
        <Empty description="Tidak ada data pada periode ini" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        children
      )}
    </Card>
  );
}

const money = (v: unknown) => formatMoney(Number(v));

function Kpis({ params }: { params: Period }) {
  const q = useWidget<Summary>('summary', 'summary', params);
  const s = q.data;
  const cards: { title: string; value: ReactNode; hint?: string }[] = s
    ? [
        { title: 'Kunjungan', value: s.visits, hint: `${s.cancelled_visits} dibatalkan` },
        { title: 'Pendapatan', value: formatMoney(s.revenue), hint: 'pembayaran berhasil' },
        { title: 'Tindakan', value: s.procedures, hint: formatMoney(s.procedure_amount) },
        { title: 'Obat diserahkan', value: s.medicine_qty, hint: 'total unit' },
        { title: 'Tagihan', value: s.invoices, hint: 'invoice pada periode' },
        { title: 'Sisa tagihan', value: formatMoney(s.outstanding), hint: 'belum dibayar + sebagian' },
      ]
    : [];
  return (
    <Widget title="Ringkasan" q={q}>
      <Row gutter={[16, 16]}>
        {cards.map((c) => (
          <Col key={c.title} xs={12} md={8} xl={4}>
            <Statistic title={c.title} value={typeof c.value === 'number' ? c.value : undefined} formatter={typeof c.value === 'number' ? undefined : () => c.value} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{c.hint}</Typography.Text>
          </Col>
        ))}
      </Row>
    </Widget>
  );
}

function VisitsByPolyclinic({ params }: { params: Period }) {
  const q = useWidget<PolyRow[]>('poly', 'visits-by-polyclinic', params);
  return (
    <Widget title="Kunjungan per poli" q={q}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={q.data ?? []}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="polyclinic_name" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="visit_count" name="Kunjungan" fill="#1677ff" maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
      <Table
        size="small"
        pagination={false}
        rowKey="polyclinic_id"
        dataSource={q.data ?? []}
        columns={[
          { title: 'Poli', dataIndex: 'polyclinic_name' },
          { title: 'Kunjungan', dataIndex: 'visit_count', align: 'right' },
          { title: 'Dibatalkan', dataIndex: 'cancelled_count', align: 'right' },
        ]}
      />
    </Widget>
  );
}

function Revenue({ params }: { params: Period }) {
  const daily = useWidget<RevDay[]>('rev-day', 'revenue', { ...params, group: 'day' });
  const method = useWidget<RevMethod[]>('rev-method', 'revenue', { ...params, group: 'method' });
  return (
    <Widget title="Tren pendapatan" q={daily}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={(daily.data ?? []).map((d) => ({ ...d, amount: Number(d.amount), label: dayjs(d.date).format('DD/MM') }))}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" minTickGap={16} />
          <YAxis tickFormatter={(v) => (v >= 1_000_000 ? `${v / 1_000_000} jt` : `${v / 1000} rb`)} width={56} />
          <Tooltip formatter={(v) => money(v)} labelFormatter={(_l, p) => (p?.[0] ? dayjs(p[0].payload.date).format('DD MMM YYYY') : '')} />
          <Line type="monotone" dataKey="amount" name="Pendapatan" stroke="#52c41a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <Typography.Text strong>Per metode pembayaran</Typography.Text>
      {method.error ? (
        <Alert type="error" showIcon message={toApiError(method.error).message} style={{ marginTop: 8 }} />
      ) : (
        <Table
          size="small"
          pagination={false}
          rowKey="method"
          loading={method.isLoading}
          dataSource={method.data ?? []}
          columns={[
            { title: 'Metode', dataIndex: 'method', render: (m: string) => METHOD_LABEL[m] ?? m },
            { title: 'Transaksi', dataIndex: 'payment_count', align: 'right' },
            { title: 'Jumlah', dataIndex: 'amount', align: 'right', render: money },
          ]}
        />
      )}
    </Widget>
  );
}

function Ranking<T extends { qty: number }>({ title, q, nameKey, unit, cols, rowKey }: { title: string; q: WidgetState & { data?: T[] }; nameKey: keyof T; unit: string; cols: object[]; rowKey: keyof T }) {
  return (
    <Widget title={title} q={q}>
      <ResponsiveContainer width="100%" height={Math.max(160, (q.data?.length ?? 0) * 28 + 30)}>
        <BarChart data={q.data ?? []} layout="vertical" margin={{ left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey={nameKey as string} width={130} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="qty" name={unit} fill="#13c2c2" maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
      <Table size="small" pagination={false} rowKey={rowKey as string} dataSource={q.data ?? []} columns={cols as never} />
    </Widget>
  );
}

function PaymentStatus({ params }: { params: Period }) {
  const q = useWidget<StatusRow[]>('status', 'payment-status', params);
  const rows = q.data ?? [];
  return (
    <Widget title="Status pembayaran" q={q}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie isAnimationActive={false} data={rows} dataKey="invoice_count" nameKey="status" innerRadius={50} outerRadius={80} label={(e) => String(e.value)}>
            {rows.map((r) => <Cell key={r.status} fill={STATUS_COLOR[r.status] ?? '#999'} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [v, STATUS_LABEL[String(n)] ?? n]} />
          <Legend formatter={(v) => STATUS_LABEL[String(v)] ?? v} />
        </PieChart>
      </ResponsiveContainer>
      <Table
        size="small"
        pagination={false}
        rowKey="status"
        dataSource={rows}
        columns={[
          { title: 'Status', dataIndex: 'status', render: (s: string) => <InvoiceStatusTag status={s} /> },
          { title: 'Invoice', dataIndex: 'invoice_count', align: 'right' },
          { title: 'Total', dataIndex: 'total_amount', align: 'right', render: money },
          { title: 'Terbayar', dataIndex: 'paid_amount', align: 'right', render: money },
        ]}
      />
    </Widget>
  );
}

/** R-26: dashboard with a period filter. Admin sees everything; cashier only the money widgets (plan section 8). */
export default function DashboardPage() {
  const { can } = useAuth();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()]);
  const params: Period = { from: range[0].format(FMT), to: range[1].format(FMT) };
  const full = can('dashboard.read');
  const procedures = useWidget<ProcRow[]>('procedures', 'procedures', { ...params, limit: 10 });
  const medicines = useWidget<MedRow[]>('medicines', 'medicine-usage', { ...params, limit: 10 });

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Dashboard</Typography.Title>
        <Space wrap>
          <Typography.Text type="secondary">Periode</Typography.Text>
          <DatePicker.RangePicker
            allowClear={false}
            value={range}
            format="DD MMM YYYY"
            maxDate={dayjs()}
            presets={[
              { label: 'Hari ini', value: [dayjs(), dayjs()] },
              { label: '7 hari terakhir', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: '30 hari terakhir', value: [dayjs().subtract(29, 'day'), dayjs()] },
              { label: 'Bulan ini', value: [dayjs().startOf('month'), dayjs()] },
            ]}
            onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
          />
          {!full && <Tag color="blue">Hanya pendapatan</Tag>}
        </Space>
      </Space>

      {full && <Kpis params={params} />}
      <Row gutter={[16, 16]}>
        {full && <Col xs={24} xl={12}><VisitsByPolyclinic params={params} /></Col>}
        <Col xs={24} xl={full ? 12 : 24}><Revenue params={params} /></Col>
        <Col xs={24} xl={12}><PaymentStatus params={params} /></Col>
        {full && (
          <>
            <Col xs={24} xl={12}>
              <Ranking
                title="Rekap tindakan (10 teratas)"
                q={procedures}
                nameKey="procedure_name"
                unit="Jumlah"
                rowKey="procedure_id"
                cols={[
                  { title: 'Tindakan', dataIndex: 'procedure_name' },
                  { title: 'Jumlah', dataIndex: 'qty', align: 'right' },
                  { title: 'Nilai', dataIndex: 'amount', align: 'right', render: money },
                ]}
              />
            </Col>
            <Col xs={24} xl={12}>
              <Ranking
                title="Pemakaian obat (10 teratas)"
                q={medicines}
                nameKey="medicine_name"
                unit="Jumlah"
                rowKey="medicine_id"
                cols={[
                  { title: 'Obat', dataIndex: 'medicine_name' },
                  { title: 'Jumlah', dataIndex: 'qty', align: 'right', render: (v: number, r: MedRow) => `${v} ${r.unit}` },
                  { title: 'Nilai', dataIndex: 'amount', align: 'right', render: money },
                ]}
              />
            </Col>
          </>
        )}
      </Row>
    </Space>
  );
}

import { Tag } from 'antd';

const STATUS: Record<string, { label: string; color: string }> = {
  WAITING: { label: 'Menunggu', color: 'gold' },
  IN_EXAM: { label: 'Diperiksa', color: 'blue' },
  EXAMINED: { label: 'Selesai periksa', color: 'green' },
  DONE: { label: 'Selesai', color: 'default' },
  CANCELLED: { label: 'Batal', color: 'red' },
};

export const VISIT_STATUS_OPTIONS = Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }));

export default function VisitStatusTag({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, color: 'default' };
  return <Tag color={s.color}>{s.label}</Tag>;
}

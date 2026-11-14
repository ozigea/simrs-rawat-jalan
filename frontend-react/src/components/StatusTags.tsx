import { Tag } from 'antd';

const RX: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Baru', color: 'gold' },
  DISPENSED: { label: 'Diserahkan', color: 'green' },
  CANCELLED: { label: 'Dibatalkan', color: 'red' },
};
const LAB: Record<string, { label: string; color: string }> = {
  ORDERED: { label: 'Diminta', color: 'gold' },
  IN_PROGRESS: { label: 'Diproses', color: 'blue' },
  RESULTED: { label: 'Hasil keluar', color: 'green' },
  CANCELLED: { label: 'Dibatalkan', color: 'red' },
};
const FLAG: Record<string, string> = { NORMAL: 'green', LOW: 'orange', HIGH: 'orange', CRITICAL: 'red' };

export const RX_STATUS_OPTIONS = Object.entries(RX).map(([value, s]) => ({ value, label: s.label }));
export const LAB_STATUS_OPTIONS = Object.entries(LAB).map(([value, s]) => ({ value, label: s.label }));

export function RxStatusTag({ status }: { status: string }) {
  const s = RX[status] ?? { label: status, color: 'default' };
  return <Tag color={s.color}>{s.label}</Tag>;
}

export function LabStatusTag({ status }: { status: string }) {
  const s = LAB[status] ?? { label: status, color: 'default' };
  return <Tag color={s.color}>{s.label}</Tag>;
}

export function FlagTag({ flag }: { flag: string | null }) {
  return flag ? <Tag color={FLAG[flag] ?? 'default'}>{flag}</Tag> : null;
}

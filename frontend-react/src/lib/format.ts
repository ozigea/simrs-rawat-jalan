const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Money arrives as a decimal string (NUMERIC) - never parsed into float for storage. */
export const formatMoney = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '-' : idr.format(Number(value));

export const DAY_NAMES: Record<number, string> = { 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 7: 'Minggu' };

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  pendaftaran: 'Pendaftaran',
  dokter: 'Dokter',
  farmasi: 'Farmasi',
  lab: 'Laboratorium',
  kasir: 'Kasir',
};

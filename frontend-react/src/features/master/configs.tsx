import { useState } from 'react';
import { Button, Tag } from 'antd';
import { ProfileOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnConfig, MasterConfig, Option, RemoteOptions, Row } from '../../components/MasterCrudPage/types';
import { DAY_NAMES, ROLE_LABELS, formatMoney } from '../../lib/format';
import MedicineStockDrawer from './MedicineStockDrawer';

const activeOptions: Option[] = [
  { value: true, label: 'Aktif' },
  { value: false, label: 'Nonaktif' },
];

const activeTag = (v: unknown) => <Tag color={v ? 'green' : 'default'}>{v ? 'Aktif' : 'Nonaktif'}</Tag>;
const activeColumn: ColumnConfig = { key: 'is_active', title: 'Status', render: activeTag, width: 100 };
const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));
const hhmm = (v: unknown) => String(v ?? '').slice(0, 5);

const doctors: RemoteOptions = { path: 'staff', params: { staff_type: 'DOCTOR', is_active: true }, label: (r) => String(r.name) };
const polyclinics: RemoteOptions = { path: 'polyclinics', params: { is_active: true }, label: (r) => String(r.name) };
const staffOptions: RemoteOptions = {
  path: 'staff',
  params: { is_active: true },
  label: (r) => `${r.name} (${r.code})`,
};

const dayOptions: Option[] = Object.entries(DAY_NAMES).map(([value, label]) => ({ value: Number(value), label }));
const roleOptions: Option[] = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const staffTypeOptions: Option[] = [
  { value: 'DOCTOR', label: 'Dokter' },
  { value: 'NURSE', label: 'Perawat' },
  { value: 'PHARMACIST', label: 'Apoteker' },
  { value: 'LAB_ANALYST', label: 'Analis Lab' },
];
const staffTypeLabel = (v: unknown) => staffTypeOptions.find((o) => o.value === v)?.label ?? String(v);

function MedicineStockButton({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" icon={<ProfileOutlined />} onClick={() => setOpen(true)}>
        Kartu stok
      </Button>
      <MedicineStockDrawer medicine={open ? row : null} onClose={() => setOpen(false)} />
    </>
  );
}

export const masterConfigs: MasterConfig[] = [
  {
    permission: 'patients',
    path: 'patients',
    title: 'Pasien',
    searchPlaceholder: 'Cari No. RM, NIK, nama, telepon',
    defaultSort: '-id',
    columns: [
      { key: 'mrn', title: 'No. RM', sortable: true, width: 120 },
      { key: 'nik', title: 'NIK', render: dash },
      { key: 'name', title: 'Nama', sortable: true },
      { key: 'gender', title: 'JK', render: (v) => (v === 'M' ? 'L' : 'P'), width: 60 },
      { key: 'birth_date', title: 'Tgl lahir', sortable: true, render: (v) => dayjs(String(v)).format('DD-MM-YYYY') },
      { key: 'phone', title: 'Telepon', render: dash },
      activeColumn,
    ],
    fields: [
      { name: 'nik', label: 'NIK', type: 'text', maxLength: 16, pattern: /^\d{16}$/, patternMessage: 'NIK harus 16 digit angka', help: 'Opsional. 16 digit angka.' },
      { name: 'name', label: 'Nama', type: 'text', required: true, maxLength: 150 },
      { name: 'birth_date', label: 'Tanggal lahir', type: 'date', required: true },
      { name: 'gender', label: 'Jenis kelamin', type: 'select', required: true, options: [{ value: 'M', label: 'Laki-laki' }, { value: 'F', label: 'Perempuan' }] },
      { name: 'phone', label: 'Telepon', type: 'text', maxLength: 30 },
      { name: 'address', label: 'Alamat', type: 'textarea' },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [
      { name: 'gender', label: 'Jenis kelamin', options: [{ value: 'M', label: 'Laki-laki' }, { value: 'F', label: 'Perempuan' }] },
      { name: 'is_active', label: 'Status', options: activeOptions },
    ],
  },
  {
    permission: 'staff',
    path: 'staff',
    title: 'Dokter & Tenaga Medis',
    searchPlaceholder: 'Cari kode, nama, No. STR, spesialisasi',
    columns: [
      { key: 'code', title: 'Kode', sortable: true, width: 100 },
      { key: 'name', title: 'Nama', sortable: true },
      { key: 'staff_type', title: 'Jenis', sortable: true, render: staffTypeLabel },
      { key: 'license_no', title: 'No. STR/SIP', render: dash },
      { key: 'specialization', title: 'Spesialisasi', render: dash },
      activeColumn,
    ],
    fields: [
      { name: 'code', label: 'Kode', type: 'text', required: true, maxLength: 20 },
      { name: 'name', label: 'Nama', type: 'text', required: true, maxLength: 150 },
      { name: 'staff_type', label: 'Jenis tenaga', type: 'select', required: true, options: staffTypeOptions },
      { name: 'license_no', label: 'No. STR/SIP', type: 'text', maxLength: 50 },
      { name: 'specialization', label: 'Spesialisasi', type: 'text', maxLength: 100 },
      { name: 'phone', label: 'Telepon', type: 'text', maxLength: 30 },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [
      { name: 'staff_type', label: 'Jenis tenaga', options: staffTypeOptions },
      { name: 'is_active', label: 'Status', options: activeOptions },
    ],
  },
  {
    permission: 'polyclinics',
    path: 'polyclinics',
    title: 'Poli / Unit',
    searchPlaceholder: 'Cari kode atau nama poli',
    columns: [
      { key: 'code', title: 'Kode', sortable: true, width: 120 },
      { key: 'name', title: 'Nama poli', sortable: true },
      { key: 'registration_fee', title: 'Biaya pendaftaran', sortable: true, render: (v) => formatMoney(v as string) },
      activeColumn,
    ],
    fields: [
      { name: 'code', label: 'Kode', type: 'text', required: true, maxLength: 20 },
      { name: 'name', label: 'Nama poli', type: 'text', required: true, maxLength: 100 },
      { name: 'registration_fee', label: 'Biaya pendaftaran', type: 'money', required: true, defaultValue: '0' },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [{ name: 'is_active', label: 'Status', options: activeOptions }],
  },
  {
    permission: 'schedules',
    path: 'schedules',
    title: 'Jadwal Praktik',
    defaultSort: 'polyclinic_id,day_of_week,start_time',
    columns: [
      { key: 'polyclinic_name', title: 'Poli' },
      { key: 'doctor_name', title: 'Dokter' },
      { key: 'day_of_week', title: 'Hari', sortable: true, render: (v) => DAY_NAMES[Number(v)] },
      { key: 'start_time', title: 'Jam', sortable: true, render: (_v, r) => `${hhmm(r.start_time)} - ${hhmm(r.end_time)}` },
      { key: 'quota', title: 'Kuota', sortable: true, width: 90 },
      activeColumn,
    ],
    fields: [
      { name: 'polyclinic_id', label: 'Poli', type: 'select', required: true, remote: polyclinics },
      { name: 'doctor_id', label: 'Dokter', type: 'select', required: true, remote: doctors },
      { name: 'day_of_week', label: 'Hari', type: 'select', required: true, options: dayOptions },
      { name: 'start_time', label: 'Jam mulai', type: 'time', required: true },
      { name: 'end_time', label: 'Jam selesai', type: 'time', required: true },
      { name: 'quota', label: 'Kuota pasien', type: 'integer', required: true, min: 1, defaultValue: 20 },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [
      { name: 'polyclinic_id', label: 'Poli', remote: polyclinics },
      { name: 'doctor_id', label: 'Dokter', remote: { ...doctors, params: { staff_type: 'DOCTOR' } } },
      { name: 'day_of_week', label: 'Hari', options: dayOptions },
      { name: 'is_active', label: 'Status', options: activeOptions },
    ],
  },
  {
    permission: 'procedures',
    path: 'procedures',
    title: 'Tindakan & Tarif',
    searchPlaceholder: 'Cari kode atau nama tindakan',
    columns: [
      { key: 'code', title: 'Kode', sortable: true, width: 120 },
      { key: 'name', title: 'Nama tindakan', sortable: true },
      { key: 'tariff', title: 'Tarif', sortable: true, render: (v) => formatMoney(v as string) },
      activeColumn,
    ],
    fields: [
      { name: 'code', label: 'Kode', type: 'text', required: true, maxLength: 20 },
      { name: 'name', label: 'Nama tindakan', type: 'text', required: true, maxLength: 150 },
      { name: 'tariff', label: 'Tarif', type: 'money', required: true },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [{ name: 'is_active', label: 'Status', options: activeOptions }],
  },
  {
    permission: 'medicines',
    path: 'medicines',
    title: 'Obat',
    searchPlaceholder: 'Cari kode atau nama obat',
    columns: [
      { key: 'code', title: 'Kode', sortable: true, width: 110 },
      { key: 'name', title: 'Nama obat', sortable: true },
      { key: 'unit', title: 'Satuan', width: 90 },
      { key: 'price', title: 'Harga', sortable: true, render: (v) => formatMoney(v as string) },
      {
        key: 'stock_qty',
        title: 'Stok',
        sortable: true,
        render: (v, r) => (Number(v) <= Number(r.min_stock) ? <Tag color="orange">{String(v)} (menipis)</Tag> : String(v)),
      },
      activeColumn,
    ],
    fields: [
      { name: 'code', label: 'Kode', type: 'text', required: true, maxLength: 20 },
      { name: 'name', label: 'Nama obat', type: 'text', required: true, maxLength: 150 },
      { name: 'unit', label: 'Satuan', type: 'text', required: true, maxLength: 30, placeholder: 'tablet, kapsul, sachet' },
      { name: 'price', label: 'Harga', type: 'money', required: true },
      { name: 'min_stock', label: 'Stok minimum', type: 'integer', min: 0, defaultValue: 0 },
      { name: 'initial_stock', label: 'Stok awal', type: 'integer', min: 0, createOnly: true, defaultValue: 0, help: 'Perubahan stok berikutnya lewat Kartu stok.' },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [{ name: 'is_active', label: 'Status', options: activeOptions }],
    rowActions: (row) => <MedicineStockButton row={row} />,
  },
  {
    permission: 'lab_tests',
    path: 'lab-tests',
    title: 'Pemeriksaan Laboratorium',
    searchPlaceholder: 'Cari kode atau nama pemeriksaan',
    columns: [
      { key: 'code', title: 'Kode', sortable: true, width: 110 },
      { key: 'name', title: 'Pemeriksaan', sortable: true },
      { key: 'tariff', title: 'Tarif', sortable: true, render: (v) => formatMoney(v as string) },
      { key: 'unit', title: 'Satuan', render: dash },
      { key: 'normal_range', title: 'Nilai normal', render: dash },
      activeColumn,
    ],
    fields: [
      { name: 'code', label: 'Kode', type: 'text', required: true, maxLength: 20 },
      { name: 'name', label: 'Nama pemeriksaan', type: 'text', required: true, maxLength: 150 },
      { name: 'tariff', label: 'Tarif', type: 'money', required: true },
      { name: 'unit', label: 'Satuan', type: 'text', maxLength: 30 },
      { name: 'normal_range', label: 'Nilai normal', type: 'text', maxLength: 100 },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [{ name: 'is_active', label: 'Status', options: activeOptions }],
  },
  {
    permission: 'icd10',
    path: 'icd10',
    idKey: 'code',
    title: 'Diagnosis ICD-10',
    searchPlaceholder: 'Cari kode atau deskripsi',
    defaultSort: 'code',
    columns: [
      { key: 'code', title: 'Kode', sortable: true, width: 120 },
      { key: 'description', title: 'Deskripsi', sortable: true },
      activeColumn,
    ],
    fields: [
      { name: 'code', label: 'Kode ICD-10', type: 'text', required: true, maxLength: 10, disabledOnEdit: true, pattern: /^[A-Za-z]\d{2}(\.[0-9A-Za-z]{1,4})?$/, patternMessage: 'Format kode tidak valid (contoh: A01.0)' },
      { name: 'description', label: 'Deskripsi', type: 'text', required: true, maxLength: 255 },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [{ name: 'is_active', label: 'Status', options: activeOptions }],
  },
  {
    permission: 'users',
    path: 'users',
    title: 'Pengguna & Peran',
    searchPlaceholder: 'Cari username atau nama',
    columns: [
      { key: 'username', title: 'Username', sortable: true },
      { key: 'full_name', title: 'Nama lengkap', sortable: true },
      { key: 'role', title: 'Peran', render: (v) => (v ? <Tag color="blue">{ROLE_LABELS[String(v)] ?? String(v)}</Tag> : '-') },
      { key: 'staff_name', title: 'Tenaga medis', render: dash },
      { key: 'last_login_at', title: 'Login terakhir', sortable: true, render: (v) => (v ? dayjs(String(v)).format('DD-MM-YYYY HH:mm') : '-') },
      activeColumn,
    ],
    fields: [
      { name: 'username', label: 'Username', type: 'text', required: true, maxLength: 50, pattern: /^[A-Za-z0-9._-]{3,50}$/, patternMessage: 'Username 3-50 karakter: huruf, angka, titik, garis bawah, strip' },
      { name: 'full_name', label: 'Nama lengkap', type: 'text', required: true, maxLength: 150 },
      { name: 'password', label: 'Password', type: 'password', requiredOnCreateOnly: true, min: 8, maxLength: 72, help: 'Minimal 8 karakter. Kosongkan saat ubah bila tidak diganti.' },
      { name: 'role', label: 'Peran', type: 'select', required: true, options: roleOptions },
      { name: 'staff_id', label: 'Tenaga medis', type: 'select', remote: staffOptions, help: 'Wajib terhubung untuk peran Dokter (membatasi akses ke pasien sendiri).' },
      { name: 'is_active', label: 'Status', type: 'switch', defaultValue: true },
    ],
    filters: [{ name: 'is_active', label: 'Status', options: activeOptions }],
  },
];

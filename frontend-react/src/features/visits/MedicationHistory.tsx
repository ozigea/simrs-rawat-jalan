import { useState } from 'react';
import { Table } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { yiiApi, type ApiEnvelope } from '../../api/client';
import type { Row } from '../../components/MasterCrudPage/types';

/** Medicines dispensed to a patient over time (R-19). */
export default function MedicationHistory({ patientId }: { patientId: number }) {
  const [page, setPage] = useState(1);
  const { data, isFetching } = useQuery({
    queryKey: ['patient-medications', patientId, page],
    placeholderData: keepPreviousData,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>(`/patients/${patientId}/medications`, { params: { page, per_page: 20 } })).data,
  });
  return (
    <Table<Row>
      rowKey="id"
      size="small"
      loading={isFetching}
      dataSource={data?.data ?? []}
      locale={{ emptyText: 'Belum ada obat yang diserahkan' }}
      pagination={{ current: page, pageSize: 20, total: data?.meta?.total ?? 0, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
      columns={[
        { title: 'Tanggal', dataIndex: 'dispensed_at', render: (v: string) => dayjs(v).format('DD-MM-YYYY HH:mm') },
        { title: 'Obat', dataIndex: 'medicine_name' },
        { title: 'Dosis', dataIndex: 'dose' },
        { title: 'Frekuensi', dataIndex: 'frequency' },
        { title: 'Jumlah', dataIndex: 'qty', render: (v: number, r: Row) => `${v} ${r.unit}` },
        { title: 'Dokter', dataIndex: 'doctor_name' },
        { title: 'No. resep', dataIndex: 'prescription_no' },
      ]}
    />
  );
}

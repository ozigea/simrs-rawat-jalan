import { useState } from 'react';
import { Collapse, Descriptions, Empty, List, Pagination, Space, Tag, Typography } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { yiiApi, type ApiEnvelope } from '../../api/client';
import type { Row } from '../../components/MasterCrudPage/types';
import VisitStatusTag from '../../components/VisitStatusTag';
import { formatMoney } from '../../lib/format';

const dash = (v: unknown, unit = '') => (v === null || v === undefined || v === '' ? '-' : `${v}${unit}`);

/** Medical history of a patient (R-11, R-15): one panel per visit, newest first. */
export default function PatientHistory({ patientId }: { patientId: number }) {
  const [page, setPage] = useState(1);
  const { data, isFetching } = useQuery({
    queryKey: ['patient-history', patientId, page],
    placeholderData: keepPreviousData,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>(`/patients/${patientId}/history`, { params: { page, per_page: 10 } })).data,
  });
  const visits = data?.data ?? [];

  if (!isFetching && visits.length === 0) return <Empty description="Belum ada riwayat kunjungan" />;

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Collapse
        key={visits.map((v) => v.id).join('-')} /* remount so the newest visit opens once data arrives */
        defaultActiveKey={visits[0] ? [String(visits[0].id)] : []}
        items={visits.map((v) => ({
          key: String(v.id),
          label: (
            <Space wrap>
              <strong>{v.visit_date}</strong>
              <span>{v.polyclinic_name}</span>
              <Typography.Text type="secondary">{v.doctor_name}</Typography.Text>
              <VisitStatusTag status={v.status} />
              {v.diagnoses.map((d: Row) => (
                <Tag key={d.icd10_code} color={d.type === 'PRIMARY' ? 'blue' : 'default'}>{d.icd10_code}</Tag>
              ))}
            </Space>
          ),
          children: (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
                <Descriptions.Item label="Keluhan utama">{dash(v.chief_complaint)}</Descriptions.Item>
                <Descriptions.Item label="Anamnesis">{dash(v.anamnesis)}</Descriptions.Item>
                <Descriptions.Item label="Tekanan darah">{v.systolic ? `${v.systolic}/${v.diastolic} mmHg` : '-'}</Descriptions.Item>
                <Descriptions.Item label="Nadi / Napas">{dash(v.pulse)} / {dash(v.resp_rate)}</Descriptions.Item>
                <Descriptions.Item label="Suhu / SpO2">{dash(v.temperature, ' C')} / {dash(v.spo2, '%')}</Descriptions.Item>
                <Descriptions.Item label="BB / TB">{dash(v.weight_kg, ' kg')} / {dash(v.height_cm, ' cm')}</Descriptions.Item>
                <Descriptions.Item label="Pemeriksaan fisik" span={2}>{dash(v.physical_exam)}</Descriptions.Item>
              </Descriptions>
              <List
                size="small"
                header={<strong>Diagnosis</strong>}
                locale={{ emptyText: 'Tidak ada diagnosis' }}
                dataSource={v.diagnoses}
                renderItem={(d: Row) => (
                  <List.Item>
                    <Tag color={d.type === 'PRIMARY' ? 'blue' : 'default'}>{d.type === 'PRIMARY' ? 'Utama' : 'Sekunder'}</Tag>
                    {d.icd10_code} - {d.description}
                  </List.Item>
                )}
              />
              <List
                size="small"
                header={<strong>Tindakan</strong>}
                locale={{ emptyText: 'Tidak ada tindakan' }}
                dataSource={v.procedures}
                renderItem={(p: Row) => (
                  <List.Item>
                    {p.name} x{p.qty} <Typography.Text type="secondary">({formatMoney(p.unit_tariff)})</Typography.Text>
                  </List.Item>
                )}
              />
            </Space>
          ),
        }))}
      />
      <Pagination current={page} pageSize={10} total={data?.meta?.total ?? 0} onChange={setPage} showSizeChanger={false} hideOnSinglePage />
    </Space>
  );
}

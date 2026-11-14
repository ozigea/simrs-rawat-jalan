import { useState } from 'react';
import { Button, Card, Input, Popconfirm, Select, Space, Table, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { SorterResult } from 'antd/es/table/interface';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toApiError, yiiApi, type ApiEnvelope } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import FormModal from './FormModal';
import { useRemoteOptions } from './RemoteSelect';
import type { FilterConfig, MasterConfig, Row } from './types';

function FilterSelect({ filter, value, onChange }: { filter: FilterConfig; value?: string | number | boolean; onChange: (v: string | number | boolean | undefined) => void }) {
  const remote = useRemoteOptions(filter.remote);
  const options = (filter.options ?? remote.options) as { value: string | number | boolean; label: string }[];
  return (
    <Select
      allowClear
      showSearch
      optionFilterProp="label"
      placeholder={filter.label}
      style={{ minWidth: 160 }}
      loading={remote.loading}
      options={options}
      value={value}
      onChange={(v) => onChange(v ?? undefined)}
    />
  );
}

/**
 * Generic master-data page: server-side search / filter / sort / paging plus create-edit-delete
 * dialogs, all driven by a MasterConfig. Buttons follow the user's permissions.
 */
export default function MasterCrudPage({ config }: { config: MasterConfig }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const idKey = config.idKey ?? 'id';

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<string | undefined>(config.defaultSort);
  const [filters, setFilters] = useState<Record<string, string | number | boolean | undefined>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const params = { page, per_page: perPage, q: q || undefined, sort, ...filters };
  const { data, isFetching, error } = useQuery({
    queryKey: [config.path, params],
    placeholderData: keepPreviousData,
    queryFn: async () => (await yiiApi.get<ApiEnvelope<Row[]>>(`/${config.path}`, { params })).data,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: [config.path] });
  const canCreate = can(`master.${config.permission}.create`);
  const canUpdate = can(`master.${config.permission}.update`);
  const canDelete = can(`master.${config.permission}.delete`);

  const remove = async (row: Row) => {
    try {
      await yiiApi.delete(`/${config.path}/${row[idKey]}`);
      message.success('Data berhasil dihapus');
      refresh();
    } catch (e) {
      message.error({ content: toApiError(e).message, duration: 6 });
    }
  };

  const columns = config.columns.map((c) => ({
    title: c.title,
    dataIndex: c.key,
    key: c.key,
    width: c.width,
    sorter: c.sortable ? true : undefined,
    sortOrder: sort?.replace(/^-/, '') === c.key ? (sort.startsWith('-') ? ('descend' as const) : ('ascend' as const)) : null,
    render: c.render ? (v: unknown, row: Row) => c.render!(v, row) : undefined,
  }));

  if (canUpdate || canDelete || config.rowActions) {
    columns.push({
      title: 'Aksi',
      dataIndex: '__actions',
      key: '__actions',
      width: 220,
      sorter: undefined,
      sortOrder: null,
      render: (_: unknown, row: Row) => (
        <Space size="small">
          {config.rowActions?.(row)}
          {canUpdate && (
            <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); setFormOpen(true); }}>
              Ubah
            </Button>
          )}
          {canDelete && (
            <Popconfirm title="Hapus data ini?" okText="Hapus" cancelText="Batal" okButtonProps={{ danger: true }} onConfirm={() => remove(row)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    });
  }

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {config.title}
          </Typography.Title>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              Tambah
            </Button>
          )}
        </Space>

        <Space wrap>
          <Input.Search
            allowClear
            placeholder={config.searchPlaceholder ?? 'Cari...'}
            style={{ width: 280 }}
            onSearch={(v) => { setQ(v.trim()); setPage(1); }}
          />
          {config.filters?.map((f) => (
            <FilterSelect
              key={f.name}
              filter={f}
              value={filters[f.name]}
              onChange={(v) => { setFilters((prev) => ({ ...prev, [f.name]: v })); setPage(1); }}
            />
          ))}
        </Space>

        {error && <Typography.Text type="danger">{toApiError(error).message}</Typography.Text>}

        <Table<Row>
          rowKey={idKey}
          size="middle"
          loading={isFetching}
          columns={columns}
          dataSource={data?.data ?? []}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: perPage,
            total: data?.meta?.total ?? 0,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t) => `${t} data`,
          }}
          onChange={(p, _f, sorter) => {
            setPage(p.current ?? 1);
            setPerPage(p.pageSize ?? 20);
            const s = sorter as SorterResult<Row>;
            setSort(s.order && s.columnKey ? `${s.order === 'descend' ? '-' : ''}${String(s.columnKey)}` : config.defaultSort);
          }}
        />
      </Space>

      <FormModal
        config={config}
        record={editing}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); refresh(); }}
      />
    </Card>
  );
}

import { Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { yiiApi, type ApiEnvelope } from '../../api/client';
import type { Option, RemoteOptions, Row } from './types';

/** Loads options (max 100 rows) from a list endpoint; used by forms and filters. */
export function useRemoteOptions(remote: RemoteOptions | undefined): { options: Option[]; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['options', remote?.path, remote?.params],
    enabled: !!remote,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await yiiApi.get<ApiEnvelope<Row[]>>(`/${remote!.path}`, { params: { per_page: 100, ...remote!.params } });
      return r.data.data ?? [];
    },
  });
  const valueKey = remote?.value ?? 'id';
  const options = (data ?? []).map((row) => ({ value: row[valueKey] as string | number, label: remote!.label(row) }));
  return { options, loading: isLoading };
}

interface Props {
  id?: string;
  remote: RemoteOptions;
  value?: string | number | null;
  onChange?: (value: string | number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

export default function RemoteSelect({ remote, value, onChange, ...rest }: Props) {
  const { options, loading } = useRemoteOptions(remote);
  return (
    <Select
      showSearch
      allowClear
      optionFilterProp="label"
      loading={loading}
      options={options as { value: string | number; label: string }[]}
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
      {...rest}
    />
  );
}

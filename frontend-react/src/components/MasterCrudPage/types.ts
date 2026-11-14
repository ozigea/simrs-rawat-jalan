import type { ReactNode } from 'react';

export type FieldType = 'text' | 'textarea' | 'password' | 'integer' | 'money' | 'select' | 'switch' | 'date' | 'time';

export interface Option {
  value: string | number | boolean;
  label: string;
}

/** Options loaded from another list endpoint (e.g. doctors for a schedule). */
export interface RemoteOptions {
  path: string;
  params?: Record<string, string | number | boolean>;
  label: (row: Record<string, unknown>) => string;
  value?: string;
}

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Required on create, optional on edit (e.g. password). */
  requiredOnCreateOnly?: boolean;
  maxLength?: number;
  min?: number;
  pattern?: RegExp;
  patternMessage?: string;
  options?: Option[];
  remote?: RemoteOptions;
  createOnly?: boolean;
  disabledOnEdit?: boolean;
  help?: string;
  placeholder?: string;
  defaultValue?: unknown;
}

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ColumnConfig {
  key: string;
  title: string;
  render?: (value: unknown, row: Row) => ReactNode;
  sortable?: boolean;
  width?: number;
}

export interface FilterConfig {
  name: string;
  label: string;
  options?: Option[];
  remote?: RemoteOptions;
}

export interface MasterConfig {
  /** Permission slug: master.<permission>.{read,create,update,delete}. */
  permission: string;
  /** URL segment under the API and the React route (/master/<path>). */
  path: string;
  title: string;
  /** Row key used in URLs (default "id"; ICD-10 uses "code"). */
  idKey?: string;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  filters?: FilterConfig[];
  searchPlaceholder?: string;
  defaultSort?: string;
  rowActions?: (row: Row) => ReactNode;
}

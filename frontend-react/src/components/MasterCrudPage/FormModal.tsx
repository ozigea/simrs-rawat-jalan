import { useEffect, useState } from 'react';
import { DatePicker, Form, Input, InputNumber, Modal, Select, Switch, TimePicker, message } from 'antd';
import dayjs from 'dayjs';
import { toApiError, yiiApi } from '../../api/client';
import RemoteSelect from './RemoteSelect';
import { validateField } from './validate';
import type { FieldConfig, MasterConfig, Row } from './types';

interface Props {
  config: MasterConfig;
  record: Row | null; // null = create
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Server values -> form values (dates/times become dayjs for the pickers). */
function toFormValues(fields: FieldConfig[], record: Row | null): Row {
  const values: Row = {};
  for (const f of fields) {
    const raw = record ? record[f.name] : f.defaultValue;
    if (f.type === 'date') values[f.name] = raw ? dayjs(raw as string) : undefined;
    else if (f.type === 'time') values[f.name] = raw ? dayjs(raw as string, 'HH:mm:ss') : undefined;
    else if (f.type === 'switch') values[f.name] = raw ?? true;
    else values[f.name] = raw ?? undefined;
  }
  return values;
}

/** Form values -> request body. */
function toPayload(fields: FieldConfig[], values: Row, isEdit: boolean): Row {
  const body: Row = {};
  for (const f of fields) {
    if (f.createOnly && isEdit) continue;
    const v = values[f.name];
    if (f.type === 'date') body[f.name] = v ? dayjs(v).format('YYYY-MM-DD') : null;
    else if (f.type === 'time') body[f.name] = v ? dayjs(v).format('HH:mm') : null;
    else if (f.type === 'password') {
      if (v) body[f.name] = v; // empty password on edit = keep the current one
    } else if (typeof v === 'string') body[f.name] = v.trim();
    else body[f.name] = v ?? null;
  }
  return body;
}

interface InputProps {
  field: FieldConfig;
  isEdit: boolean;
  // injected by Form.Item
  id?: string;
  value?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  onChange?: (value: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Must forward id/value/onChange: Form.Item injects them into its direct child. */
function FieldInput({ field, isEdit, id, value, onChange }: InputProps) {
  const disabled = field.disabledOnEdit && isEdit;
  const select = field.options as { value: string | number; label: string }[] | undefined;
  switch (field.type) {
    case 'textarea':
      return <Input.TextArea id={id} rows={3} maxLength={field.maxLength} disabled={disabled} value={value} onChange={(e) => onChange?.(e.target.value)} />;
    case 'password':
      return <Input.Password id={id} autoComplete="new-password" disabled={disabled} value={value} onChange={(e) => onChange?.(e.target.value)} />;
    case 'integer':
      return <InputNumber id={id} style={{ width: '100%' }} precision={0} min={field.min} disabled={disabled} value={value} onChange={onChange} />;
    case 'money':
      return <InputNumber id={id} style={{ width: '100%' }} stringMode min="0" step="1000" precision={2} disabled={disabled} value={value} onChange={onChange} />;
    case 'select':
      return field.remote ? (
        <RemoteSelect id={id} remote={field.remote} disabled={disabled} placeholder={field.placeholder} value={value} onChange={onChange} />
      ) : (
        <Select id={id} options={select} disabled={disabled} placeholder={field.placeholder} value={value} onChange={onChange} />
      );
    case 'switch':
      return <Switch id={id} checkedChildren="Aktif" unCheckedChildren="Nonaktif" disabled={disabled} checked={!!value} onChange={onChange} />;
    case 'date':
      return <DatePicker id={id} style={{ width: '100%' }} format="DD-MM-YYYY" disabledDate={(d) => d.isAfter(dayjs())} disabled={disabled} value={value} onChange={onChange} />;
    case 'time':
      return <TimePicker id={id} style={{ width: '100%' }} format="HH:mm" minuteStep={5} needConfirm={false} disabled={disabled} value={value} onChange={onChange} />;
    default:
      return <Input id={id} maxLength={field.maxLength} disabled={disabled} placeholder={field.placeholder} value={value} onChange={(e) => onChange?.(e.target.value)} />;
  }
}

export default function FormModal({ config, record, open, onClose, onSaved }: Props) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isEdit = record !== null;
  const fields = config.fields.filter((f) => !(f.createOnly && isEdit));

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(toFormValues(config.fields, record));
    }
  }, [open, record, config.fields, form]);

  const submit = async (values: Row) => {
    setSaving(true);
    try {
      const body = toPayload(config.fields, values, isEdit);
      if (isEdit) {
        await yiiApi.put(`/${config.path}/${record![config.idKey ?? 'id']}`, body);
      } else {
        await yiiApi.post(`/${config.path}`, body);
      }
      message.success(isEdit ? 'Data berhasil diperbarui' : 'Data berhasil ditambahkan');
      onSaved();
    } catch (e) {
      const err = toApiError(e);
      const fieldErrors = err.details.filter((d) => d.field && config.fields.some((f) => f.name === d.field));
      if (fieldErrors.length) {
        form.setFields(fieldErrors.map((d) => ({ name: d.field!, errors: [d.message] })));
      } else {
        message.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${isEdit ? 'Ubah' : 'Tambah'} ${config.title}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Simpan"
      cancelText="Batal"
      confirmLoading={saving}
      destroyOnHidden
      maskClosable={false}
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        {fields.map((f) => (
          <Form.Item
            key={f.name}
            name={f.name}
            label={f.label}
            extra={f.help}
            rules={[
              {
                validator: async (_, value) => {
                  const msg = validateField(f, value, isEdit);
                  if (msg) throw new Error(msg);
                },
              },
            ]}
            required={!!f.required || (!!f.requiredOnCreateOnly && !isEdit)}
          >
            <FieldInput field={f} isEdit={isEdit} />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}

import { z } from 'zod';
import type { FieldConfig } from './types';

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * Validates one form value with a zod schema derived from the field config.
 * Returns an error message, or undefined when valid. The server still re-validates everything.
 */
export function validateField(field: FieldConfig, value: unknown, isEdit: boolean): string | undefined {
  const required = field.required || (field.requiredOnCreateOnly && !isEdit);
  if (isEmpty(value)) {
    return required ? `${field.label} wajib diisi` : undefined;
  }

  let schema: z.ZodTypeAny;
  switch (field.type) {
    case 'integer': {
      let s = z.number({ invalid_type_error: `${field.label} harus berupa angka` }).int(`${field.label} harus bilangan bulat`);
      if (field.min !== undefined) s = s.min(field.min, `${field.label} minimal ${field.min}`);
      schema = s;
      break;
    }
    case 'money':
      schema = z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, `${field.label} harus angka positif (maks 2 desimal)`)
        .refine((v) => Number(v) >= (field.min ?? 0), `${field.label} minimal ${field.min ?? 0}`);
      break;
    case 'text':
    case 'textarea':
    case 'password': {
      let s = z.string();
      if (field.maxLength) s = s.max(field.maxLength, `${field.label} maksimal ${field.maxLength} karakter`);
      if (field.min !== undefined) s = s.min(field.min, `${field.label} minimal ${field.min} karakter`);
      if (field.pattern) s = s.regex(field.pattern, field.patternMessage ?? `${field.label} tidak valid`);
      schema = s;
      break;
    }
    default:
      return undefined; // select / switch / date / time: presence is the only client-side rule
  }

  const result = schema.safeParse(field.type === 'text' || field.type === 'textarea' ? String(value).trim() : value);
  return result.success ? undefined : result.error.issues[0].message;
}

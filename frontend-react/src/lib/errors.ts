import { message } from 'antd';
import { toApiError } from '../api/client';

/** Shows an API error as a toast; field details (if any) are appended on separate lines. */
export function notifyError(e: unknown) {
  const err = toApiError(e);
  const extra = err.details.map((d) => d.message).filter(Boolean);
  message.error({ content: [err.message, ...extra].join(' - '), duration: 6 });
}

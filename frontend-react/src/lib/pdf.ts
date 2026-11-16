import { message } from 'antd';
import { yiiApi } from '../api/client';

/** Fetches a PDF with the auth header and opens it in a new tab (falls back to a download if popups are blocked). */
export async function openPdf(path: string, filename: string) {
  const win = window.open('', '_blank'); // opened synchronously so the popup blocker allows it
  try {
    const res = await yiiApi.get<Blob>(path, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (win) {
      win.location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    win?.close();
    message.error('PDF tidak dapat dibuat atau Anda tidak berhak mencetaknya');
  }
}

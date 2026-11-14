import { useEffect, useState } from 'react';
import { Input, Modal } from 'antd';

interface Props {
  open: boolean;
  title: string;
  onOk: (reason: string) => Promise<void> | void;
  onCancel: () => void;
}

/** Asks for a mandatory reason (void / cancel actions, D-4). */
export default function ReasonModal({ open, title, onOk, onCancel }: Props) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = reason.trim().length >= 3;

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      okText="Konfirmasi"
      cancelText="Batal"
      okButtonProps={{ disabled: !valid, danger: true }}
      confirmLoading={busy}
      onCancel={onCancel}
      onOk={async () => {
        setBusy(true);
        try {
          await onOk(reason.trim());
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input.TextArea rows={3} maxLength={255} showCount placeholder="Alasan (wajib, minimal 3 karakter)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}

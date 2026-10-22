"use client";

import type { ReactNode } from "react";
import { Button } from "./button";
import { Modal } from "./modal";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, loading, onConfirm, onCancel }: Props) {
  return (
    <Modal open={open} onClose={onCancel} labelledBy="confirm-title" describedBy="confirm-message" role="alertdialog">
      <h2 id="confirm-title" className="text-h2 font-semibold text-ink">
        {title}
      </h2>
      <div id="confirm-message" className="mt-2 text-body text-muted">
        {children}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

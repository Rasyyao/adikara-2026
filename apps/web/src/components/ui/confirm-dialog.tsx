"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Native <dialog>: focus is trapped, Escape closes it, and the page behind is inert. */
export function ConfirmDialog({ open, title, children, confirmLabel, loading, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-lg border border-border bg-surface p-6 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-ink/40"
    >
      <h2 className="text-h2 font-semibold">{title}</h2>
      <div className="mt-2 text-body text-muted">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Batal
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

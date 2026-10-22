"use client";

import { useEffect, useRef, type ReactNode } from "react";

const EXIT_MS = 200; // matches the exit animation in globals.css

interface ModalProps {
  open: boolean;
  /** Asked to close by Escape or a click on the backdrop. The parent flips `open`; the exit animation then plays. */
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  /** Extra classes for the card, for example a different max width. */
  className?: string;
  children: ReactNode;
}

/**
 * The one overlay for the whole app: error popups, confirmations and form dialogs all render through it,
 * so they share the dimmed backdrop, the pop-in and the exit animation (see `.modal` in globals.css).
 * Native <dialog>: the page behind is inert, focus is trapped, and it sits in the top layer.
 */
export function Modal({ open, onClose, labelledBy, describedBy, role = "dialog", className = "", children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      delete dialog.dataset.closing;
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) return;
    dialog.dataset.closing = "true";
    const timer = setTimeout(() => {
      dialog.close();
      delete dialog.dataset.closing;
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dimmed area (the dialog element itself, outside the card) also closes it.
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="modal fixed inset-0 m-auto size-full max-h-none max-w-none bg-transparent p-4 backdrop:bg-black/50 backdrop:backdrop-blur-[2px] open:flex open:items-center open:justify-center"
    >
      <div role={role} className={`modal__card w-full max-w-[440px] rounded-lg border border-border bg-surface p-6 shadow-[var(--shadow-overlay)] ${className}`}>
        {children}
      </div>
    </dialog>
  );
}

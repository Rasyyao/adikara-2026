"use client";

import { Minimize2, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  title: string;
  /** Small line above the title, e.g. "Soal dari guru". */
  eyebrow?: string;
  onClose: () => void;
  /** "minimize" keeps the work and shows a small chip to come back (a student in class); "close" ends it. */
  closeKind?: "close" | "minimize";
  /** Extra controls in the header, e.g. the teacher's close-problem button. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A large popup over the page, the way an interactive whiteboard puts an activity in front of the class: nearly full
 * screen, the page dimmed behind it. Escape or the button closes (or minimises) it. Not a native <dialog>, so the
 * dragged blocks (portaled to <body>) can still float above it.
 */
export function ProblemDialog({ title, eyebrow, onClose, closeKind = "close", actions, children }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Escape inside the code editor only leaves the editor
      if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement)) onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [onClose]);

  const CloseIcon = closeKind === "minimize" ? Minimize2 : X;
  return (
    <div className="pdialog-backdrop fixed inset-0 z-[70] flex items-stretch justify-center bg-ink/50 p-0 backdrop-blur-[2px] sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pdialog flex h-full w-full max-w-[1400px] flex-col overflow-hidden bg-bg shadow-[var(--shadow-overlay)] outline-none sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#7445CC,#2F6FD6)] text-lg text-white" aria-hidden="true">
            🧩
          </span>
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="text-caption font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>}
            <h1 id={titleId} className="truncate text-h3 font-semibold text-ink">
              {title}
            </h1>
          </div>
          {actions}
          <button
            type="button"
            onClick={onClose}
            aria-label={closeKind === "minimize" ? "Kecilkan soal" : "Tutup"}
            title={closeKind === "minimize" ? "Kecilkan (jawabanmu tetap tersimpan)" : "Tutup"}
            className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink"
          >
            <CloseIcon size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

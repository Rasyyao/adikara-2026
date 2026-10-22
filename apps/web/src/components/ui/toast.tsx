"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Modal } from "./modal";

type ToastType = "error" | "success" | "info";

interface ToastInput {
  message: string;
  title?: string;
  /** Optional link shown inside the toast, for example "Lanjutkan sesi". */
  action?: { label: string; href: string };
  /** Milliseconds before it closes by itself. Errors stay longer. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
  type: ToastType;
  closing: boolean;
}

interface ToastApi {
  error: (input: string | ToastInput) => void;
  success: (input: string | ToastInput) => void;
  info: (input: string | ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const MAX_VISIBLE = 3;
const EXIT_MS = 200;
const DEFAULT_DURATION: Record<ToastType, number> = { error: 6000, success: 4000, info: 5000 };

const STYLE: Record<ToastType, { Icon: typeof Info; tone: string; title: string }> = {
  error: { Icon: AlertCircle, tone: "text-danger", title: "Terjadi masalah" },
  success: { Icon: CheckCircle2, tone: "text-success", title: "Berhasil" },
  info: { Icon: Info, tone: "text-primary", title: "Info" },
};

/**
 * Call `useToast()` anywhere under the provider: `toast.error("Pesan")`, `toast.success({ message, action })`.
 * Errors open a centered modal over a dimmed, blurred page so they cannot be missed; success and info
 * are small toasts at the top that close by themselves.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // The error stays in state after closing so its content is still on screen during the exit animation.
  const [errorModal, setErrorModal] = useState<ToastInput | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((item) => (item.id === id ? { ...item, closing: true } : item)));
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback((type: ToastType, input: string | ToastInput) => {
    const data = typeof input === "string" ? { message: input } : input;
    if (type === "error") {
      setErrorModal(data); // a newer error replaces the one on screen
      setErrorOpen(true);
      return;
    }
    setToasts((list) => {
      // The same message twice in a row (a repeated mistake) refreshes the old toast instead of stacking.
      const rest = list.filter((item) => !(item.type === type && item.message === data.message));
      return [...rest, { ...data, id: nextId.current++, type, closing: false }].slice(-MAX_VISIBLE);
    });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      error: (input) => push("error", input),
      success: (input) => push("success", input),
      info: (input) => push("info", input),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ErrorModal error={errorModal} open={errorOpen} onClose={() => setErrorOpen(false)} />
      {/* One live region for all toasts, so screen readers announce each new one. */}
      <div
        role="region"
        aria-label="Notifikasi"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onClose={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ErrorModal({ error, open, onClose }: { error: ToastInput | null; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="error-modal-title" describedBy="error-modal-message" role="alertdialog" className="max-w-[420px] text-center">
      {error && (
        <>
          {/* The ring pulses once and the icon pops in, then wiggles, so the eye lands here first. */}
          <div className="relative mx-auto flex size-12 items-center justify-center text-danger">
            <span className="modal__ring absolute inset-0 rounded-full border-2 border-danger" aria-hidden="true" />
            <AlertCircle size={48} strokeWidth={1.75} className="modal__icon" aria-hidden="true" />
          </div>
          <h2 id="error-modal-title" className="mt-4 text-h2 font-semibold text-ink">
            {error.title ?? STYLE.error.title}
          </h2>
          <p id="error-modal-message" className="mt-2 text-body text-muted">
            {error.message}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            {error.action && (
              <Link
                href={error.action.href}
                onClick={onClose}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-body font-semibold text-ink transition-colors duration-150 ease-out hover:bg-primary-tint"
              >
                {error.action.label}
              </Link>
            )}
            <Button onClick={onClose} autoFocus>
              Mengerti
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const [paused, setPaused] = useState(false);
  const { Icon, tone, title } = STYLE[item.type];
  const duration = item.duration ?? DEFAULT_DURATION[item.type];

  // The timer stops while the pointer or keyboard focus is on the toast, so it is never taken away mid-read.
  useEffect(() => {
    if (paused || item.closing) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [paused, item.closing, duration, onClose]);

  return (
    <div
      role={item.type === "error" ? "alert" : "status"}
      data-closing={item.closing || undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="toast pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-[var(--shadow-overlay)]"
    >
      <Icon size={20} strokeWidth={1.75} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-small font-semibold text-ink">{item.title ?? title}</p>
        <p className="mt-0.5 text-small text-muted">{item.message}</p>
        {item.action && (
          <Link href={item.action.href} onClick={onClose} className="mt-2 inline-block text-small font-semibold text-primary underline">
            {item.action.label}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup notifikasi"
        className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:text-ink"
      >
        <X size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

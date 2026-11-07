"use client";

import { Bell, Check, Clock, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface NotificationItem {
  id: string;
  title: string;
  time: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    title: "Kuis Logika Pemrograman selesai dikumpulkan oleh 32 siswa",
    time: "10 menit yang lalu",
    read: false,
  },
  {
    id: "2",
    title: "Presensi kelas X RPL 1 telah disimpan otomatis ke rekap",
    time: "1 jam yang lalu",
    read: false,
  },
  {
    id: "3",
    title: "Materi baru Struktur Data telah selesai diproses oleh AI",
    time: "Kemarin",
    read: true,
  },
];

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const popoverRef = useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((i) => !i.read).length;

  const markAllAsRead = () => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifikasi (${unreadCount} belum dibaca)`}
        aria-expanded={open}
        className="relative flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Bell size={20} strokeWidth={1.85} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 flex size-2 rounded-full bg-primary ring-2 ring-surface" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-border/80 bg-surface p-3 shadow-xl animate-in fade-in-50 zoom-in-95 duration-150 sm:w-88">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5 px-2">
            <span className="font-heading text-small font-bold text-ink">Notifikasi</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-caption font-semibold text-primary hover:text-primary-hover"
              >
                Tandai dibaca
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-col gap-1 max-h-72 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex flex-col rounded-xl p-2.5 transition-colors ${
                  item.read ? "text-muted hover:bg-bg/60" : "bg-primary-tint/40 text-ink font-medium"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-caption leading-relaxed">{item.title}</p>
                  {!item.read && (
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  )}
                </div>
                <span className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                  <Clock size={11} />
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

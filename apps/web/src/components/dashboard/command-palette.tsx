"use client";

import {
  BookOpen,
  Calendar,
  FilePlus,
  GraduationCap,
  History,
  LayoutDashboard,
  Puzzle,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface ActionItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  icon: typeof LayoutDashboard;
  category: "Navigasi" | "Aksi Cepat";
}

const ITEMS: ActionItem[] = [
  {
    id: "nav-dash",
    title: "Dashboard Utama",
    subtitle: "Ringkasan kelas, kehadiran, dan statistik kuis",
    href: "/teacher",
    icon: LayoutDashboard,
    category: "Navigasi",
  },
  {
    id: "nav-classes",
    title: "Kelola Kelas",
    subtitle: "Daftar kelas siswa dan riwayat kehadiran",
    href: "/teacher/classes",
    icon: GraduationCap,
    category: "Navigasi",
  },
  {
    id: "nav-sessions",
    title: "Sesi & Analisis Kelas",
    subtitle: "Absensi, hasil kuis, soal tersulit, dan umpan balik AI per kelas",
    href: "/teacher/sessions",
    icon: History,
    category: "Navigasi",
  },
  {
    id: "nav-materials",
    title: "Materi Pembelajaran",
    subtitle: "Modul ajar AI, ringkasan, dan peta konsep visual",
    href: "/teacher/materials",
    icon: BookOpen,
    category: "Navigasi",
  },
  {
    id: "action-new-material",
    title: "Buat Materi Baru",
    subtitle: "Unggah dokumen PDF/PPTX untuk dianalisis AI",
    href: "/teacher/materials/new",
    icon: FilePlus,
    category: "Aksi Cepat",
  },
  {
    id: "nav-problems",
    title: "Bank Soal Blok & Kode",
    subtitle: "Tantangan logika pemrograman interaktif",
    href: "/teacher/problems",
    icon: Puzzle,
    category: "Navigasi",
  },
  {
    id: "nav-history",
    title: "Riwayat Sesi Kelas",
    subtitle: "Catatan sesi interaktif dan laporan presensi",
    href: "/teacher/history",
    icon: History,
    category: "Navigasi",
  },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q),
    );
  }, [query]);

  // Handle keyboard shortcut navigation
  useEffect(() => {
    if (!open) return;
    setSelectedIndex(0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          router.push(filtered[selectedIndex].href);
          onClose();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, selectedIndex, router, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:p-6 sm:pt-24">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pencarian cepat navigasi"
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3.5 sm:px-5">
          <Search size={18} strokeWidth={2} className="text-primary" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik tujuan navigasi atau aksi cepat..."
            className="w-full bg-transparent text-small text-ink outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pencarian"
            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-small text-muted">
              Tidak ada hasil yang sesuai dengan &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((item, idx) => {
                const Icon = item.icon;
                const isSelected = idx === selectedIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      router.push(item.href);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-primary-tint/80 text-ink" : "text-ink hover:bg-bg"
                    }`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                        isSelected ? "bg-primary text-white" : "bg-bg text-muted"
                      }`}
                    >
                      <Icon size={18} strokeWidth={1.85} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-small">{item.title}</p>
                      <p className="truncate text-caption text-muted">{item.subtitle}</p>
                    </div>

                    <span className="shrink-0 text-caption font-medium text-muted">
                      {item.category}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="flex items-center justify-between border-t border-border/60 bg-bg/50 px-4 py-2.5 text-caption text-muted">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigasi</span>
            <span>↵ Buka</span>
          </div>
          <span>ESC Tutup</span>
        </div>
      </div>
    </div>
  );
}

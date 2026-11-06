"use client";

import { Plus, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CreateSessionForm } from "@/components/session/create-session-form";
import { Modal } from "@/components/ui/modal";
import type { ChatView, ClassView, LiveSession } from "@/lib/api/types";

/** Sidebar button that opens the start-session form in a dialog. Starting a session navigates away, which closes it. */
export function NewSessionDialog({
  classes,
  materials,
  liveSessions = [],
}: {
  classes: ClassView[];
  materials: ChatView[];
  liveSessions?: LiveSession[];
}) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpenOn(pathname)}
        title="Buat sesi baru"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-body font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-hover"
      >
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className="group-data-[collapsed=true]:sr-only">Buat sesi baru</span>
      </button>

      <Modal open={open} onClose={() => setOpenOn(null)} labelledBy="new-session-title" className="max-w-[520px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-2.5 py-0.5 text-caption font-semibold text-primary">
              <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
              Sesi kelas langsung
            </span>
            <h2 id="new-session-title" className="mt-1 text-h2 font-semibold text-ink">
              Buat sesi baru
            </h2>
            <p className="text-small text-muted">Pilih kelas dan materi ajar, lalu bagikan PIN 6 angka ke siswa.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpenOn(null)}
            aria-label="Tutup"
            className="-mr-2 -mt-1 flex size-10 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-ink"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4">
          <CreateSessionForm classes={classes} materials={materials} liveSessions={liveSessions} onNavigate={() => setOpenOn(null)} />
        </div>
      </Modal>
    </>
  );
}

"use client";

import { Plus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CreateSessionForm } from "@/components/session/create-session-form";
import { Modal } from "@/components/ui/modal";
import type { ClassView } from "@/lib/api/types";

/** Sidebar button that opens the start-session form in a dialog. Starting a session navigates away, which closes it. */
export function NewSessionDialog({ classes }: { classes: ClassView[] }) {
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

      <Modal open={open} onClose={() => setOpenOn(null)} labelledBy="new-session-title">
        <div className="flex items-center justify-between">
          <h2 id="new-session-title" className="text-h2 font-semibold text-ink">
            Buat sesi baru
          </h2>
          <button
            type="button"
            onClick={() => setOpenOn(null)}
            aria-label="Tutup"
            className="-mr-2 flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:text-ink"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <p className="text-small text-muted">Pilih kelas, lalu bagikan PIN ke siswa.</p>
        <div className="mt-4">
          <CreateSessionForm classes={classes} />
        </div>
      </Modal>
    </>
  );
}

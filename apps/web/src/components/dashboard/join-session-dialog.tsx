"use client";

import { LogIn, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { JoinForm } from "@/components/session/join-form";
import { Modal } from "@/components/ui/modal";

/** Sidebar button that opens the PIN form in a dialog. Joining navigates to the waiting room, which closes it. */
export function JoinSessionDialog() {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenOn(pathname)}
        title="Masuk sesi"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-body font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-hover"
      >
        <LogIn size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className="group-data-[collapsed=true]:sr-only">Masuk sesi</span>
      </button>

      <Modal open={open} onClose={() => setOpenOn(null)} labelledBy="join-session-title" className="text-center">
        <div className="flex items-start justify-between text-left">
          <div>
            <h2 id="join-session-title" className="text-h2 font-semibold text-ink">
              Masuk sesi
            </h2>
            <p className="text-small text-muted">Masukkan PIN 6 angka dari layar guru.</p>
          </div>
          <button
            type="button"
            onClick={() => setOpenOn(null)}
            aria-label="Tutup"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:text-ink"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-6">
          <JoinForm />
        </div>
      </Modal>
    </>
  );
}

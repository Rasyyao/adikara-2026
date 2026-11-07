"use client";

import { LogIn, Sparkles } from "lucide-react";
import { JoinForm } from "@/components/session/join-form";

export function StudentJoinHero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary-tint/60 via-surface to-surface p-6 shadow-xs sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-md">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-3 py-1 text-caption font-semibold text-primary">
            <Sparkles size={13} strokeWidth={2.2} aria-hidden="true" />
            Sesi Kelas Interaktif
          </span>
          <h2 className="mt-2 font-heading text-h2 font-bold tracking-tight text-ink sm:text-h1">
            Siap untuk Belajar Hari Ini?
          </h2>
          <p className="mt-2 text-small text-muted">
            Masukkan PIN 6-angka yang dibagikan oleh guru di layar untuk langsung masuk ke sesi papan tulis dan kuis interaktif.
          </p>
        </div>

        <div className="w-full max-w-sm rounded-xl border border-border/80 bg-surface p-5 shadow-sm">
          <JoinForm />
        </div>
      </div>
    </div>
  );
}

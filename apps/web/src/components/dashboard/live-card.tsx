"use client";

import { ArrowRight, Check, Copy, Radio, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LiveTimer } from "@/components/dashboard/live-timer";
import { useToast } from "@/components/ui/toast";
import type { LiveSession } from "@/lib/api/types";

function CopyPinButton({ pin }: { pin: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(pin);
      setCopied(true);
      toast.success(`PIN ${pin} berhasil disalin ke clipboard!`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Salin PIN ke clipboard"
      aria-label={`Salin PIN ${pin}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-0.5 text-caption font-mono font-bold tracking-wider text-ink transition-colors hover:border-primary hover:bg-primary-tint hover:text-primary"
    >
      <span>{pin}</span>
      {copied ? (
        <Check size={13} className="text-success" aria-hidden="true" />
      ) : (
        <Copy size={13} className="text-muted" aria-hidden="true" />
      )}
    </button>
  );
}

export function LiveCard({ live }: { live: LiveSession }) {
  const { session, class_name, joined_count } = live;
  const running = session.status === "ACTIVE";
  const since = (running ? session.started_at : null) ?? session.created_at;

  return (
    <section
      aria-label={`Sesi ${class_name} sedang berjalan`}
      className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary-tint/50 via-surface to-surface p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left Side: Live Indicator + Title & Class info */}
        <div className="flex items-start gap-4">
          <div className="relative mt-1 flex size-3 shrink-0" aria-hidden="true">
            <span
              className={`absolute inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping ${
                running ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <span
              className={`relative inline-flex size-3 rounded-full ${
                running ? "bg-emerald-600" : "bg-amber-600"
              }`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-semibold ${
                  running ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                <Radio size={12} strokeWidth={2.5} className="motion-safe:animate-pulse" aria-hidden="true" />
                {running ? "Kelas Sedang Berlangsung" : "Sesi Terbuka di Ruang Tunggu"}
              </span>

              {session.join_code && (
                <div className="flex items-center gap-1.5">
                  <span className="text-caption text-muted">PIN Siswa:</span>
                  <CopyPinButton pin={session.join_code} />
                </div>
              )}
            </div>

            <h2 className="mt-1 font-heading text-h2 font-bold tracking-tight text-ink">
              {class_name}
            </h2>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-muted">
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <Users size={16} strokeWidth={1.85} className="text-primary" aria-hidden="true" />
                {joined_count} siswa bergabung
              </span>
              <span>·</span>
              <div className="inline-flex items-center gap-1.5">
                <span>{running ? "Durasi:" : "Terbuka sejak:"}</span>
                <span className="font-medium text-ink">
                  <LiveTimer since={since} />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Action Button */}
        <div className="flex shrink-0 items-center">
          <Link
            href={`/teacher/sessions/${session.id}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-small font-semibold text-white shadow-xs transition-all duration-150 ease-out hover:bg-primary-hover hover:shadow-sm"
          >
            <span>Buka Papan Tulis</span>
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LiveTimer } from "@/components/dashboard/live-timer";
import { teacherSessionsApi } from "@/lib/api/endpoints";
import type { LiveSession } from "@/lib/api/types";
import { requireViewer } from "@/lib/auth/dal";

function LiveCard({ live }: { live: LiveSession }) {
  const { session, class_name, joined_count } = live;
  const running = session.status === "ACTIVE";
  const since = (running ? session.started_at : null) ?? session.created_at;

  return (
    <section aria-label={`Sesi ${class_name} sedang berjalan`} className="flex flex-col gap-4 rounded-lg bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <span className="relative flex size-3 shrink-0" aria-hidden="true">
          <span className={`absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping ${running ? "bg-success" : "bg-warning"}`} />
          <span className={`relative inline-flex size-3 rounded-full ${running ? "bg-success" : "bg-warning"}`} />
        </span>
        <div>
          <p className="text-small font-semibold text-muted">{running ? "Kelas sedang berjalan" : "Sesi dibuka, menunggu dimulai"}</p>
          <p className="text-h2 font-semibold text-ink">{class_name}</p>
          <p className="text-small text-muted">
            {joined_count} siswa di dalam{session.join_code ? ` · PIN ${session.join_code}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-6 sm:justify-end">
        <div>
          <p className="text-caption text-muted">{running ? "Sudah berjalan" : "Sudah dibuka"}</p>
          <LiveTimer since={since} />
        </div>
        <Link
          href={`/teacher/sessions/${session.id}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-body font-semibold text-white transition-colors duration-150 ease-out hover:bg-primary-hover"
        >
          Buka sesi
          <ArrowRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/** One card per session the teacher has not ended yet. Renders nothing when there is none, or the API cannot be reached. */
export async function LiveSessionBanner() {
  const { token } = await requireViewer("staff");
  const live = await teacherSessionsApi.listLive(token).catch(() => ({ items: [] }));
  if (live.items.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {live.items.map((item) => (
        <LiveCard key={item.session.id} live={item} />
      ))}
    </div>
  );
}

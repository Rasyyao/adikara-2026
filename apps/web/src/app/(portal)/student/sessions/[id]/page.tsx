import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StudentWaitingRoom } from "@/components/session/student-waiting-room";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";

export const metadata = { title: "Sesi kelas" };

async function Room({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireViewer("student");
  return (
    <div className="w-full max-w-[440px] rounded-lg border border-border bg-surface p-8">
      <StudentWaitingRoom sessionId={id} />
    </div>
  );
}

export default function SiswaSessionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex min-h-[calc(100dvh-160px)] w-full items-center justify-center">
      <Suspense fallback={<p className="text-body text-muted">Memuat sesi…</p>}>
        <Room params={params} />
      </Suspense>
    </div>
  );
}

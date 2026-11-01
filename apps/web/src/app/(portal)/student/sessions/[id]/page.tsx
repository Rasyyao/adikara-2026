import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CenteredLoader } from "@/components/ui/loaders";
import { StudentWaitingRoom } from "@/components/session/student-waiting-room";
import { requireViewer } from "@/lib/auth/dal";
import { isUuid } from "@/lib/validation/auth";

export const metadata = { title: "Sesi kelas" };

async function Room({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireViewer("student");
  return <StudentWaitingRoom sessionId={id} />;
}

export default function SiswaSessionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="w-full">
      <Suspense fallback={<CenteredLoader label="Membuka sesi…" />}>
        <Room params={params} />
      </Suspense>
    </div>
  );
}

import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CenteredLoader } from "@/components/ui/loaders";
import { getViewer, homeFor } from "@/lib/auth/dal";

async function Dispatch(): Promise<never> {
  const viewer = await getViewer();
  redirect(viewer ? homeFor(viewer.user.role) : "/session-expired");
}

/** After login, and for anyone who already has a cookie: send each role to its own area. */
export default function Beranda() {
  return (
    <Suspense fallback={<CenteredLoader label="Mengalihkan…" />}>
      <Dispatch />
    </Suspense>
  );
}

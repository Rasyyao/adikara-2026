import { LiveCard } from "@/components/dashboard/live-card";
import { teacherSessionsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";

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

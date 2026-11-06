import { Plus } from "lucide-react";
import { NewSessionDialog } from "@/components/dashboard/new-session-dialog";
import { classesApi, teacherChatsApi, teacherSessionsApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";

/** Loads the teacher's classes, prepared materials, and any live sessions on the server, then hands them to the client dialog. */
export async function NewSessionSlot() {
  const { token } = await requireViewer("staff");
  const [{ items }, chats, live] = await Promise.all([
    classesApi.list(token),
    teacherChatsApi.list(token).catch(() => ({ items: [] })), // the materials are optional: a failure must not block starting a session
    teacherSessionsApi.listLive(token).catch(() => ({ items: [] })),
  ]);
  return <NewSessionDialog classes={items} materials={chats.items} liveSessions={live.items} />;
}

export function NewSessionFallback() {
  return (
    <div aria-hidden="true" className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary/60 text-body font-semibold text-white">
      <Plus size={20} strokeWidth={1.75} />
    </div>
  );
}

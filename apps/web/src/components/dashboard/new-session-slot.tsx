import { Plus } from "lucide-react";
import { NewSessionDialog } from "@/components/dashboard/new-session-dialog";
import { classesApi } from "@/lib/api/endpoints";
import { requireViewer } from "@/lib/auth/dal";

/** Loads the teacher's classes on the server, then hands them to the client dialog. */
export async function NewSessionSlot() {
  const { token } = await requireViewer("staff");
  const { items } = await classesApi.list(token);
  return <NewSessionDialog classes={items} />;
}

export function NewSessionFallback() {
  return (
    <div aria-hidden="true" className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary/60 text-body font-semibold text-white">
      <Plus size={20} strokeWidth={1.75} />
    </div>
  );
}

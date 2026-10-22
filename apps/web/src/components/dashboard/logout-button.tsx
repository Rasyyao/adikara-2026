import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

/** Sits at the bottom of the sidebar. The label hides when the sidebar is collapsed. */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        title="Keluar"
        className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-body font-medium text-muted transition-colors duration-150 ease-out hover:bg-danger/10 hover:text-danger group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:px-0"
      >
        <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className="group-data-[collapsed=true]:sr-only">Keluar</span>
      </button>
    </form>
  );
}

import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { getViewer } from "@/lib/auth/dal";

const ROLE_LABEL = { ADMIN: "Admin", TEACHER: "Guru", USER: "Siswa" } as const;

async function UserMenu() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const { name, role } = viewer.user;
  const initial = (name ?? ROLE_LABEL[role]).trim().charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary-tint font-heading text-small font-semibold text-primary"
        >
          {initial}
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="text-small font-semibold text-ink">{name ?? "Pengguna"}</p>
          <p className="text-caption text-muted">{ROLE_LABEL[role]}</p>
        </div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-small font-semibold text-muted transition-colors duration-150 ease-out hover:bg-primary-tint hover:text-ink"
        >
          <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
          Keluar
        </button>
      </form>
    </div>
  );
}

export default function PortalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Logo />
          <Suspense fallback={null}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

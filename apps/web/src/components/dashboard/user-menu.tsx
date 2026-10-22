import { getViewer } from "@/lib/auth/dal";

const ROLE_LABEL = { ADMIN: "Admin", TEACHER: "Guru", USER: "Siswa" } as const;

export async function UserMenu() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const { name, role } = viewer.user;
  const initial = (name ?? ROLE_LABEL[role]).trim().charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-primary-tint font-heading text-small font-semibold text-primary">
          {initial}
        </span>
        <div className="hidden leading-tight sm:block">
          <p className="text-small font-semibold text-ink">{name ?? "Pengguna"}</p>
          <p className="text-caption text-muted">{ROLE_LABEL[role]}</p>
        </div>
      </div>
    </div>
  );
}

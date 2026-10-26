import { Suspense } from "react";
import { DashboardShell, type NavItem } from "@/components/dashboard/dashboard-shell";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { NewSessionFallback, NewSessionSlot } from "@/components/dashboard/new-session-slot";
import { UserMenu } from "@/components/dashboard/user-menu";

const NAV: NavItem[] = [
  { href: "/teacher", label: "Dashboard", icon: "dashboard" },
  { href: "/teacher/classes", label: "Kelas", icon: "classes", alsoActiveOn: ["/teacher/sessions"] },
  { href: "/teacher/materials", label: "Materi", icon: "materials" },
  { href: "/teacher/history", label: "Riwayat sesi", icon: "history", badge: 7 },
];

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <DashboardShell
      items={NAV}
      sidebarTop={
        <Suspense fallback={<NewSessionFallback />}>
          <NewSessionSlot />
        </Suspense>
      }
      sidebarBottom={<LogoutButton />}
      userMenu={
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      }
    >
      {children}
    </DashboardShell>
  );
}

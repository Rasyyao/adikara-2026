import { Suspense } from "react";
import { DashboardShell, type NavItem } from "@/components/dashboard/dashboard-shell";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { NewSessionFallback, NewSessionSlot } from "@/components/dashboard/new-session-slot";
import { UserMenu } from "@/components/dashboard/user-menu";

const NAV: NavItem[] = [
  { href: "/teacher", label: "Dashboard", icon: "dashboard" },
  { href: "/teacher/classes", label: "Kelas", icon: "classes" },
  { href: "/teacher/students", label: "Siswa", icon: "students" },
  { href: "/teacher/sessions", label: "Sesi", icon: "sessions" },
  { href: "/teacher/materials", label: "Materi", icon: "materials" },
  { href: "/teacher/problems", label: "Soal blok", icon: "problems" },
  { href: "/teacher/history", label: "Riwayat sesi", icon: "history" },
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

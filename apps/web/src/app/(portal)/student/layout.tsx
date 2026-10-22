import { Suspense } from "react";
import { DashboardShell, type NavItem } from "@/components/dashboard/dashboard-shell";
import { JoinSessionDialog } from "@/components/dashboard/join-session-dialog";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { UserMenu } from "@/components/dashboard/user-menu";

const NAV: NavItem[] = [
  { href: "/student", label: "Beranda", icon: "dashboard" },
  { href: "/student/history", label: "Riwayat kehadiran", icon: "history" },
];

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <DashboardShell
      items={NAV}
      sidebarTop={
        <Suspense fallback={<div aria-hidden="true" className="min-h-11 rounded-md bg-primary/60" />}>
          <JoinSessionDialog />
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

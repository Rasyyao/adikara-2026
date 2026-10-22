import { Suspense } from "react";
import { DashboardShell, type NavItem } from "@/components/dashboard/dashboard-shell";
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

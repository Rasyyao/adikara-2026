"use client";

import {
  BarChart3,
  BookOpen,
  GraduationCap,
  History,
  LayoutDashboard,
  Menu,
  PanelLeft,
  Puzzle,
  Search,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { NotificationsPopover } from "@/components/dashboard/notifications-popover";
import { Logo } from "@/components/logo";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  classes: Users,
  students: GraduationCap,
  materials: BookOpen,
  history: History,
  problems: Puzzle,
  sessions: BarChart3,
  join: BookOpen,
};

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Other path prefixes that keep this item highlighted, for example the live session page under Kelas. */
  alsoActiveOn?: string[];
  /** Small count shown at the end of the row, like unread or pending items. */
  badge?: number;
}

/** Menu links. Reads the pathname, so callers wrap it in <Suspense> to keep the rest of the page prerenderable. */
function NavLinks({
  items,
  onNavigate,
  collapsed = false,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  // The first item is the dashboard home, so it only matches its own path; every other item matches its subtree.
  const isActive = (item: NavItem, index: number) =>
    index === 0 ? pathname === item.href : [item.href, ...(item.alsoActiveOn ?? [])].some((prefix) => pathname.startsWith(prefix));

  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-1.5">
      <p className={`px-3 pb-1 font-heading text-caption font-semibold uppercase tracking-wider text-muted ${collapsed ? "sr-only" : ""}`}>
        Menu Utama
      </p>
      {items.map((item, index) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item, index);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-small font-medium transition-all duration-150 ease-out ${
              active
                ? "bg-primary-tint font-semibold text-primary shadow-2xs"
                : "text-muted hover:bg-bg hover:text-ink"
            } ${collapsed ? "justify-center px-0" : ""}`}
          >
            {/* Active left indicator line */}
            {active && !collapsed && (
              <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-primary" aria-hidden="true" />
            )}

            <Icon
              size={19}
              strokeWidth={active ? 2.2 : 1.85}
              className={`shrink-0 transition-transform duration-150 group-hover:scale-105 ${active ? "text-primary" : "text-muted group-hover:text-ink"}`}
              aria-hidden="true"
            />
            <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
            {item.badge !== undefined && !collapsed && (
              <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar + top bar shared by the teacher and student areas. The user menu is passed in as a slot so it can stream. */
export function DashboardShell({
  items,
  userMenu,
  sidebarTop,
  sidebarBottom,
  children,
}: {
  items: NavItem[];
  userMenu: ReactNode;
  /** Shown above the menu, for the main action. Hide its label with `group-data-[collapsed=true]:sr-only`. */
  sidebarTop?: ReactNode;
  /** Pinned to the bottom of the sidebar, for example logout. */
  sidebarBottom?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  // Global shortcut for Cmd+K / Ctrl+K
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (event.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const nav = (onNavigate?: () => void, compact = false) => (
    <Suspense fallback={null}>
      <NavLinks items={items} onNavigate={onNavigate} collapsed={compact} />
    </Suspense>
  );

  return (
    <div className="flex min-h-dvh flex-1 bg-bg">
      {/* Desktop Sidebar */}
      <aside
        data-collapsed={collapsed}
        className={`group sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 border-r border-border/80 bg-surface p-4 transition-[width] duration-200 ease-out lg:flex ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
      >
        <div className={`flex h-12 items-center ${collapsed ? "justify-center" : "justify-between pl-2"}`}>
          {!collapsed && <Logo />}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            aria-pressed={collapsed}
            className="flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <PanelLeft size={19} strokeWidth={1.85} aria-hidden="true" />
          </button>
        </div>

        {sidebarTop}
        {nav(undefined, collapsed)}
        <div className="mt-auto border-t border-border/60 pt-4">{sidebarBottom}</div>
      </aside>

      {/* Mobile Drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside
            id="mobile-menu"
            className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 bg-surface p-5 shadow-2xl animate-in slide-in-from-left duration-200"
          >
            <div className="flex h-12 items-center justify-between pl-2">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-bg hover:text-ink"
              >
                <X size={20} strokeWidth={1.85} aria-hidden="true" />
              </button>
            </div>
            {sidebarTop}
            {nav(() => setOpen(false))}
            <div className="mt-auto border-t border-border/60 pt-4">{sidebarBottom}</div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border/70 bg-surface/95 px-4 backdrop-blur-xs sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Buka menu navigasi"
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="-ml-2 flex size-10 items-center justify-center rounded-xl text-ink hover:bg-bg"
            >
              <Menu size={20} strokeWidth={1.85} aria-hidden="true" />
            </button>
            <Logo />
          </div>

          {/* Functional Quick Search trigger */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="hidden h-10 w-full max-w-[340px] items-center gap-2.5 rounded-xl border border-border/80 bg-bg px-3.5 text-muted transition-colors hover:border-primary/40 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex"
          >
            <Search size={16} strokeWidth={2} aria-hidden="true" />
            <span className="text-small text-muted">Cari kelas, materi, aksi...</span>
            <kbd className="ml-auto rounded-md border border-border/80 bg-surface px-1.5 py-0.5 font-mono text-caption font-semibold text-muted shadow-2xs">
              ⌘K
            </kbd>
          </button>

          {/* Right Controls: Notifications & User Profile */}
          <div className="ml-auto flex items-center gap-3">
            <NotificationsPopover />
            {userMenu}
          </div>
        </header>

        {/* Page Body: Full width utilization with clean padding */}
        <main className="min-w-0 flex-1 w-full px-4 py-6 sm:px-6">{children}</main>
      </div>

      {/* Interactive Command Palette Modal */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

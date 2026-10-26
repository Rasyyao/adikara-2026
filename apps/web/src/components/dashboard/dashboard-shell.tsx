"use client";

import { Bell, BookOpen, History, LayoutDashboard, Menu, PanelLeft, Search, Users, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  classes: Users,
  materials: BookOpen,
  history: History,
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
function NavLinks({ items, onNavigate, collapsed = false }: { items: NavItem[]; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  // The first item is the dashboard home, so it only matches its own path; every other item matches its subtree.
  const isActive = (item: NavItem, index: number) =>
    index === 0 ? pathname === item.href : [item.href, ...(item.alsoActiveOn ?? [])].some((prefix) => pathname.startsWith(prefix));

  return (
    <nav aria-label="Menu utama" className="flex flex-col gap-2">
      <p className={`px-3 pb-1 text-small font-medium uppercase tracking-wide text-muted ${collapsed ? "sr-only" : ""}`}>Umum</p>
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
            className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-body font-medium transition-colors duration-150 ease-out ${
              active ? "bg-primary-tint text-primary" : "text-muted hover:bg-bg hover:text-ink"
            } ${collapsed ? "justify-center px-0" : ""}`}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
            {item.badge !== undefined && !collapsed && (
              <span className="ml-auto rounded-sm bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">{item.badge}</span>
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

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
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
      <aside
        data-collapsed={collapsed}
        className={`group sticky top-0 hidden h-dvh shrink-0 flex-col gap-6 bg-surface p-4 transition-[width] duration-200 ease-out lg:flex ${collapsed ? "w-[76px]" : "w-60"}`}
      >
        <div className={`flex h-12 items-center ${collapsed ? "justify-center" : "justify-between pl-3"}`}>
          {!collapsed && <Logo />}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            aria-pressed={collapsed}
            className="flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-ink"
          >
            <PanelLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {sidebarTop}
        {nav(undefined, collapsed)}
        <div className="mt-auto pt-4">{sidebarBottom}</div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside id="mobile-menu" className="absolute inset-y-0 left-0 flex w-64 flex-col gap-6 bg-surface p-4 shadow-[var(--shadow-overlay)]">
            <div className="flex h-12 items-center justify-between pl-3">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup menu"
                className="flex size-11 items-center justify-center rounded-md text-muted hover:text-ink"
              >
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            {sidebarTop}
            {nav(() => setOpen(false))}
            <div className="mt-auto pt-4">{sidebarBottom}</div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 bg-surface px-4 sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Buka menu"
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="-ml-2 flex size-11 items-center justify-center rounded-md text-ink hover:bg-bg"
            >
              <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <Logo />
          </div>
          <label className="hidden h-11 w-full max-w-[320px] items-center gap-2 rounded-md border border-border bg-bg px-3 text-muted focus-within:border-primary md:flex">
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Cari</span>
            <input type="search" placeholder="Cari kelas atau sesi…" className="min-w-0 flex-1 bg-transparent text-small text-ink focus-bare outline-none placeholder:text-muted" />
            <kbd className="rounded-sm border border-border bg-surface px-1.5 text-caption font-medium">⌘K</kbd>
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="Notifikasi"
              className="relative flex size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 ease-out hover:bg-bg hover:text-ink"
            >
              <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="absolute right-3 top-3 size-2 rounded-full bg-primary" aria-hidden="true" />
            </button>
            {userMenu}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

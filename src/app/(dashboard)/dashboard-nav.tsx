"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FiUsers,
  FiDatabase,
  FiCpu,
  FiFileText,
  FiCheckSquare,
  FiSettings,
  FiMessageSquare,
  FiMenu,
  FiX,
} from "react-icons/fi";
import type { IconType } from "react-icons";

const ICONS: Record<string, IconType> = {
  FiUsers,
  FiDatabase,
  FiCpu,
  FiFileText,
  FiCheckSquare,
  FiMessageSquare,
};

export type NavItem = { href: string; label: string; icon: string };

function NavContent({ navItems, email }: { navItems: NavItem[]; email: string }) {
  return (
    <>
      <div className="px-5 py-5 text-center">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          teamcp
        </Link>
      </div>

      <nav className="space-y-1 rounded-3xl border border-border/60 bg-card/60 p-3 shadow-sm backdrop-blur-xl">
        {navItems.map((item) => {
          const Icon = ICONS[item.icon] ?? FiDatabase;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent/80 hover:text-accent-foreground"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <Icon className="h-4 w-4" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/chat"
        title="Internal chat (for testing)"
        className="mt-auto flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <FiMessageSquare className="h-4 w-4" />
        Chat
      </Link>

      <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card/60 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {(email?.[0] ?? "?").toUpperCase()}
        </div>
        <p className="flex-1 truncate text-xs text-muted-foreground">{email}</p>
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <FiSettings className="h-4 w-4" />
        </Link>
      </div>
    </>
  );
}

export function DashboardNav({ navItems, email }: { navItems: NavItem[]; email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  // Prevent body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-64 flex-col gap-3 md:flex">
        <NavContent navItems={navItems} email={email} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl md:hidden">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          teamcp
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <FiMenu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile full-screen menu */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-2xl duration-200 animate-in fade-in md:hidden">
          <header className="flex items-center justify-between px-4 py-3">
            <span className="text-base font-semibold tracking-tight">TeamRouter</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <FiX className="h-5 w-5" />
            </button>
          </header>

          <nav className="flex flex-1 flex-col justify-center gap-1 px-6">
            {navItems.map((item, i) => {
              const Icon = ICONS[item.icon] ?? FiDatabase;
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={cn(
                    "flex items-center gap-4 rounded-2xl px-3 py-3 text-2xl font-semibold tracking-tight transition-colors fill-mode-both animate-in fade-in slide-in-from-bottom-3",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6 shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <footer className="flex items-center gap-3 border-t border-border/60 px-6 py-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {(email?.[0] ?? "?").toUpperCase()}
            </div>
            <p className="flex-1 truncate text-sm text-muted-foreground">{email}</p>
            <Link
              href="/chat"
              aria-label="Chat"
              title="Internal chat (for testing)"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <FiMessageSquare className="h-5 w-5" />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <FiSettings className="h-5 w-5" />
            </Link>
          </footer>
        </div>
      )}
    </>
  );
}

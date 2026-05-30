import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FiUsers,
  FiDatabase,
  FiCpu,
  FiFileText,
  FiCheckSquare,
  FiSettings,
  FiMessageSquare,
} from "react-icons/fi";
import { auth } from "@/auth";
import { prisma } from "@/db";

const navItems = [
  { href: "/connectors", label: "Connectors", icon: FiDatabase },
  { href: "/models", label: "AI Models", icon: FiCpu },
  { href: "/members", label: "Members", icon: FiUsers },
  { href: "/channels", label: "Channels", icon: FiMessageSquare },
  { href: "/logs", label: "Audit Logs", icon: FiFileText },
  { href: "/approvals", label: "Approvals", icon: FiCheckSquare },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as any;
  if (!user.activeOrgId || !user.activeMembershipId) redirect("/signup");

  const [pendingApprovals, auditLogCount] = await Promise.all([
    prisma.approvalRequest.count({
      where: { organizationId: user.activeOrgId, status: "PENDING" },
    }),
    prisma.auditLog.count({
      where: { organizationId: user.activeOrgId },
    }),
  ]);
  const visibleNavItems = navItems.filter((item) => {
    if (item.href === "/approvals") return pendingApprovals > 0;
    if (item.href === "/logs") return auditLogCount > 0;
    return true;
  });

  return (
    <div className="relative min-h-screen">
      <div className="flex min-h-screen gap-4 p-4 pr-0 pb-0">
        <aside className="sticky top-4 flex h-[calc(100vh-2rem)] w-64 flex-col gap-3">
          <div className="px-5 py-5 text-center">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight"
            >
              TeamRouter
            </Link>
          </div>

          <nav className="space-y-1 rounded-3xl border border-border/60 bg-card/60 p-3 shadow-sm backdrop-blur-xl">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
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
              {(user.email?.[0] ?? "?").toUpperCase()}
            </div>
            <p className="flex-1 truncate text-xs text-muted-foreground">
              {user.email}
            </p>
            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <FiSettings className="h-4 w-4" />
            </Link>
          </div>
        </aside>

        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}

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
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-border bg-card">
        <div className="p-4">
          <Link href="/dashboard" className="text-lg font-bold">
            TeamRouter
          </Link>
        </div>
        <nav className="mt-4 space-y-1 px-2">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 pb-2">
          <Link
            href="/chat"
            title="Internal chat (for testing)"
            className="flex items-center justify-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <FiMessageSquare className="h-4 w-4" />
            Chat
          </Link>
        </div>
        <div className="flex items-center gap-2 px-4 py-3">
          <p className="flex-1 truncate text-xs text-muted-foreground">
            {user.email}
          </p>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <FiSettings className="h-4 w-4" />
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FiHome,
  FiLink,
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
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: FiHome },
  { href: "/connection", label: "Connection", icon: FiLink },
  { href: "/members", label: "Members", icon: FiUsers },
  { href: "/connectors", label: "Connectors", icon: FiDatabase },
  { href: "/channels", label: "Channels", icon: FiMessageSquare },
  { href: "/chat", label: "Chat", icon: FiMessageSquare },
  { href: "/models", label: "AI Models", icon: FiCpu },
  { href: "/logs", label: "Audit Logs", icon: FiFileText },
  { href: "/approvals", label: "Approvals", icon: FiCheckSquare },
  { href: "/settings", label: "Settings", icon: FiSettings },
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

  const pendingApprovals = await prisma.approvalRequest.count({
    where: { organizationId: user.activeOrgId, status: "PENDING" },
  });
  const visibleNavItems = navItems.filter(
    (item) => item.href !== "/approvals" || pendingApprovals > 0,
  );

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
        <div className="mt-auto border-t border-border p-4">
          <p className="mb-2 truncate text-xs text-muted-foreground">
            {user.email}
          </p>
          <div className="flex items-center justify-between">
            <LogoutButton />
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

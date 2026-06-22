import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/db";
import { DashboardNav, type NavItem } from "./dashboard-nav";

const navItems: NavItem[] = [
  { href: "/connectors", label: "Connectors", icon: "FiDatabase" },
  { href: "/models", label: "AI Models", icon: "FiCpu" },
  { href: "/members", label: "Members", icon: "FiUsers" },
  { href: "/channels", label: "Channels", icon: "FiMessageSquare" },
  { href: "/logs", label: "Audit Logs", icon: "FiFileText" },
  { href: "/approvals", label: "Approvals", icon: "FiCheckSquare" },
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
      <div className="flex min-h-screen flex-col gap-4 p-0 md:flex-row md:p-4 md:pr-0 md:pb-0">
        <DashboardNav navItems={visibleNavItems} email={user.email ?? ""} />

        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

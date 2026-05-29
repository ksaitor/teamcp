import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted behind a custom Node server (server.ts), so trust the host
  // header instead of relying on platform auto-detection (e.g. Vercel).
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/login",
  },
  events: {
    // Activate INVITED memberships when a new user is created by the adapter
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.orgMembership.updateMany({
        where: { userId: user.id, status: "INVITED" },
        data: { status: "ACTIVE" },
      });
    },
    // Also activate on subsequent sign-ins (e.g., if invited after first account creation)
    async linkAccount({ user }) {
      if (!user.id) return;
      await prisma.orgMembership.updateMany({
        where: { userId: user.id, status: "INVITED" },
        data: { status: "ACTIVE" },
      });
    },
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      // For returning users, activate any new INVITED memberships
      if (user.id) {
        await prisma.orgMembership.updateMany({
          where: { userId: user.id, status: "INVITED" },
          data: { status: "ACTIVE" },
        });
      }

      return true;
    },

    async session({ session, user }) {
      // Find active memberships for this user
      const memberships = await prisma.orgMembership.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { organization: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: "asc" },
      });

      const activeMembership = memberships[0] ?? null;

      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          activeOrgId: activeMembership?.organizationId ?? null,
          activeMembershipId: activeMembership?.id ?? null,
          role: activeMembership?.role ?? null,
          memberships: memberships.map((m) => ({
            id: m.id,
            organizationId: m.organizationId,
            orgName: m.organization.name,
            orgSlug: m.organization.slug,
            role: m.role,
          })),
        },
      };
    },
  },
});

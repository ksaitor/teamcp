import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  let userCount: number;
  try {
    userCount = await prisma.user.count();
  } catch {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold text-destructive">
          Can&apos;t connect to the database
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The app started but couldn&apos;t reach its database. Make sure the
          database is running and that the <code>DATABASE_URL</code> environment
          variable is set correctly, then reload this page.
        </p>
      </div>
    );
  }

  if (userCount === 0) redirect("/signup");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">TeamMCP</h1>
      <p className="mt-2 text-muted-foreground">Team MCP Access Gateway</p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-primary px-6 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg border border-input px-6 py-2 hover:bg-accent hover:text-accent-foreground"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { signupWithOrg } from "@/lib/auth";

const createOrgSchema = z.object({
  orgName: z.string().min(1),
});

/**
 * POST /api/auth/signup — Create an organization for the authenticated user.
 * User must already be signed in via NextAuth (Google/GitHub/Email).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const data = createOrgSchema.parse(body);

    const { org, membership } = await signupWithOrg({
      userId: session.user.id,
      orgName: data.orgName,
    });

    return NextResponse.json({
      organization: { id: org.id, name: org.name, slug: org.slug },
      membership: { id: membership.id, role: membership.role },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || "Signup failed" },
      { status: error.statusCode || 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { isRateLimited, clientIp } from "@/lib/rate-limit";
import { assertUserMayBeProvisioned } from "@/lib/provisioning";

const schema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

// A 6-digit code has 900k combinations; cap guesses well below anything useful.
const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code } = schema.parse(body);

    if (isRateLimited(`verify-code:${clientIp(req)}:${email}`, 10, 10 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many attempts. Please request a new code." },
        { status: 429 }
      );
    }

    // Single-org tenancy gate (OSS default): block strangers before provisioning.
    await assertUserMayBeProvisioned(email);

    // Look up the active token for this email (send-code keeps at most one)
    const token = await prisma.verificationToken.findFirst({
      where: {
        identifier: email,
        expires: { gt: new Date() },
      },
    });

    if (!token || token.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Invalid or expired code" },
        { status: 400 }
      );
    }

    if (token.token !== code) {
      // Burn an attempt; once the budget is exhausted the token is useless
      // (and removed), so the code can't be brute-forced.
      if (token.attempts + 1 >= MAX_ATTEMPTS) {
        await prisma.verificationToken.deleteMany({
          where: { identifier: email },
        });
      } else {
        await prisma.verificationToken.updateMany({
          where: { identifier: email },
          data: { attempts: { increment: 1 } },
        });
      }
      return NextResponse.json(
        { error: "Invalid or expired code" },
        { status: 400 }
      );
    }

    // Delete the used token
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: email,
          token: code,
        },
      },
    });

    // Find or create the user
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          emailVerified: new Date(),
        },
      });
    } else if (!user.emailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    }

    // Activate any INVITED memberships
    await prisma.orgMembership.updateMany({
      where: { userId: user.id, status: "INVITED" },
      data: { status: "ACTIVE" },
    });

    // Create a database session manually
    const sessionToken = randomUUID();
    const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires: sessionExpiry,
      },
    });

    // Set the session cookie (NextAuth v5 uses "authjs.session-token")
    const cookieStore = await cookies();
    const isSecure = process.env.NODE_ENV === "production";
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    cookieStore.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      expires: sessionExpiry,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || "Verification failed" },
      { status: error.statusCode || 500 }
    );
  }
}

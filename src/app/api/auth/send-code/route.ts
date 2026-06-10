import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "crypto";
import { prisma } from "@/db";
import { sendVerificationCode } from "@/lib/email";
import { isRateLimited, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = schema.parse(body);

    // Rate limit per IP so one client can't spray codes at many addresses
    if (isRateLimited(`send-code:${clientIp(req)}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // Rate limit: max 1 code per email per 60 seconds
    const recentToken = await prisma.verificationToken.findFirst({
      where: {
        identifier: email,
        expires: { gt: new Date(Date.now() + 9 * 60 * 1000) }, // created less than 60s ago (expires > now + 9min means it was created < 1min ago since expiry = now + 10min)
      },
    });

    if (recentToken) {
      return NextResponse.json(
        { error: "Please wait before requesting another code" },
        { status: 429 }
      );
    }

    // Delete any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    });

    // Generate 6-digit code (CSPRNG — Math.random is predictable)
    const code = String(randomInt(100000, 1000000));

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token: code,
        expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    await sendVerificationCode(email, code);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || "Failed to send code" },
      { status: 500 }
    );
  }
}

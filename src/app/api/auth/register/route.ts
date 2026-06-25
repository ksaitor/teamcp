import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/db";
import { isRateLimited, clientIp } from "@/lib/rate-limit";
import { assertUserMayBeProvisioned } from "@/lib/provisioning";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = registerSchema.parse(body);

    if (isRateLimited(`register:${clientIp(req)}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many sign-up attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Single-org tenancy gate (OSS default): only the bootstrap admin or a
    // pre-invited email may create an account.
    await assertUserMayBeProvisioned(email);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerified: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || "Registration failed" },
      { status: error.statusCode || 500 }
    );
  }
}

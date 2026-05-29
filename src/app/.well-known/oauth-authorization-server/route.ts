import { NextResponse } from "next/server";
import { authServerMetadata } from "@/lib/oauth/metadata";

export async function GET() {
  return NextResponse.json(authServerMetadata());
}

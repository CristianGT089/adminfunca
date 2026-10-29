import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/prisma";

/** Liveness + database check for the container HEALTHCHECK and the reverse proxy. No data. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

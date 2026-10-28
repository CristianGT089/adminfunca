import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/core/auth";
import { audit } from "@/lib/core/audit";

export async function POST() {
  const session = await getSession();
  await destroySession();
  if (session) await audit("auth.logout", { userId: session.sub });
  return NextResponse.json({ ok: true });
}

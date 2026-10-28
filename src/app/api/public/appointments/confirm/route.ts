import { NextResponse } from "next/server";
import { z } from "zod";
import { readBody, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { clientIp } from "@/lib/core/auth";
import { allow } from "@/lib/core/rateLimit";
import { confirmEmail } from "@/lib/modules/psychology/service";

/** Email confirmation (POST: email antivirus scanners open links with GET). */
export async function POST(req: Request) {
  if (!allow(`appointments:confirm:${(await clientIp()) ?? "?"}`, 20, 60 * 60 * 1000)) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });
  const { data, error } = await readBody(req, z.object({ token: z.string().min(20).max(100) }));
  if (error) return error;
  try {
    const r = await confirmEmail(data.token);
    await audit("psychology.confirmEmail", { entity: "ConsultationRequest", entityId: r.id, details: { number: r.number } });
    return NextResponse.json({ number: r.number, firstNames: r.firstNames });
  } catch (e) {
    return errorResponse(e);
  }
}

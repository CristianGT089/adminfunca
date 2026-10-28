import { NextResponse } from "next/server";
import { readBody, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { clientIp } from "@/lib/core/auth";
import { allow } from "@/lib/core/rateLimit";
import { normalizeCode } from "@/lib/core/crypto";
import { MailError, baseUrl } from "@/lib/core/mail";
import { prisma } from "@/lib/core/prisma";
import { requestSchema } from "@/lib/modules/psychology/schemas";
import { createRequest, sendConfirmation } from "@/lib/modules/psychology/service";

const tooMany = () => NextResponse.json({ error: "Demasiadas solicitudes seguidas. Intente de nuevo más tarde." }, { status: 429 });

/**
 * Public link: the student (or permanent staff) requests an appointment with Psychology. No
 * session, so it is limited by IP and by document, an institutional email is required and the
 * request only reaches psychology when the link sent to that email is confirmed.
 */
export async function POST(req: Request) {
  const ip = (await clientIp()) ?? "unknown";
  if (!allow(`appointments:ip:${ip}`, 5, 60 * 60 * 1000)) return tooMany();
  const { data, error } = await readBody(req, requestSchema);
  if (error) return error;
  if (!allow(`appointments:doc:${normalizeCode(data.document)}`, 5, 24 * 60 * 60 * 1000)) return tooMany();
  try {
    const { request, token, blocked } = await createRequest(data, { origin: "PUBLIC" });
    // Same answer as a success, without the request number: see createRequest.
    const maskedEmail = () => {
      const [localPart, domain] = data.email.split("@");
      return `${localPart.slice(0, 2)}•••@${domain}`;
    };
    if (!request) {
      await audit("psychology.requestBlocked", { details: { reason: blocked } });
      return NextResponse.json({ email: maskedEmail() }, { status: 201 });
    }
    try {
      await sendConfirmation(request, `${baseUrl(req)}/solicitar-cita/confirmar?token=${token}`);
    } catch (e) {
      // Without the email the request is useless: it is deleted so the person can try again.
      await prisma.consultationRequest.delete({ where: { id: request.id } });
      if (e instanceof MailError) return NextResponse.json({ error: "No pudimos enviar el correo de confirmación. Intente más tarde o acuda a la oficina de bienestar." }, { status: 503 });
      throw e;
    }
    await audit("psychology.request", { entity: "ConsultationRequest", entityId: request.id, details: { number: request.number, origin: "PUBLIC" } });
    return NextResponse.json({ email: maskedEmail() }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

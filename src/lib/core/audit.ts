import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { clientIp } from "./auth";

/**
 * Writes an entry to the audit log. Never put sensitive data in `details` (no documents or
 * phones in clear text): use ids or the last digits.
 */
export async function audit(action: string, options: { userId?: string | null; entity?: string; entityId?: string; details?: Prisma.InputJsonValue } = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: options.userId ?? null,
        entity: options.entity,
        entityId: options.entityId,
        details: options.details,
        ip: await clientIp(),
      },
    });
  } catch (e) {
    // The audit log must not break the main operation, but it must leave a trace in the log.
    console.error("Could not write audit log", action, e);
  }
}

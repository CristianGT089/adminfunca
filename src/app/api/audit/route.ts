import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/prisma";
import { withPermission, queryLimit } from "@/lib/core/http";

export const GET = withPermission("audit.view", async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? undefined;
  const limit = queryLimit(url, 200, 500);
  const logs = await prisma.auditLog.findMany({
    where: action ? { action: { startsWith: action } } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, username: true } } },
  });
  return NextResponse.json({ logs });
});

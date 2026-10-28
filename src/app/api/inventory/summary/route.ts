import { NextResponse } from "next/server";
import { withPermission } from "@/lib/core/http";
import { listLoans, toPublicLoan, inventorySummary } from "@/lib/modules/inventory/service";

export const GET = withPermission("inventory.view", async (_req, user) => {
  const [summary, recent] = await Promise.all([inventorySummary(), listLoans({ limit: 8 })]);
  return NextResponse.json({ summary, recent: recent.map((p) => toPublicLoan(p, user)) });
});

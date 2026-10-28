import { NextResponse } from "next/server";
import { requireUser } from "@/lib/core/auth";
import { ROLE_NAME, permissionsOf } from "@/lib/core/permissions";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      roleName: ROLE_NAME[user.role],
      mustChangePassword: user.mustChangePassword,
      permissions: permissionsOf(user.role),
    },
  });
}

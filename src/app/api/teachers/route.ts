import { NextResponse } from "next/server";
import { readBody, withPermission, errorResponse } from "@/lib/core/http";
import { audit } from "@/lib/core/audit";
import { teacherSchema } from "@/lib/modules/academic/schemas";
import { createTeacher, listTeachers, toPublicTeacher } from "@/lib/modules/academic/service";

export const GET = withPermission("teachers.view", async (req, user) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const teachers = await listTeachers(q);
  return NextResponse.json({ teachers: teachers.map((t) => toPublicTeacher(t, user)) });
});

export const POST = withPermission("teachers.manage", async (req, user) => {
  const { data, error } = await readBody(req, teacherSchema);
  if (error) return error;
  try {
    const teacher = await createTeacher(data);
    await audit("teachers.create", { userId: user.id, entity: "Person", entityId: teacher.id, details: { modules: data.moduleIds.length } });
    return NextResponse.json({ teacher: toPublicTeacher(teacher, user) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
});

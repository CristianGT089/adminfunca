import type { User } from "@prisma/client";
import { prisma } from "@/lib/core/prisma";
import type { ProjectionInput } from "./schemas";

// A single configuration for the whole platform (row with id 1).
const ID = 1;

export async function getProjection() {
  return prisma.projection.findUnique({ where: { id: ID } });
}

export async function saveProjection(input: ProjectionInput, user: Pick<User, "name">) {
  const values = { links: input.links, shuffle: input.shuffle, updatedBy: user.name };
  return prisma.projection.upsert({ where: { id: ID }, create: { id: ID, ...values }, update: values });
}

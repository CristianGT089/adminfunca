/**
 * Which entry types each user can create or edit in the schedule. Used on the server
 * (endpoints) and on the client (type buttons in the form).
 */
import type { Role } from "@prisma/client";
import { hasPermission } from "@/lib/core/permissions";
import { EVENT_TYPES, type EventType } from "./schemas";

/** Types a role with "My schedule" can record under their own name. */
const OWN_TYPES: Partial<Record<Role, EventType[]>> = {
  // Individual sessions come through requests; here, workshops or group sessions.
  PSYCHOLOGY: ["PSYCHOLOGY_SESSION"],
  INTERNSHIP_COORDINATION: ["FIELD_TRIP"],
};

/** Types the role manages in the general schedule (for any person in charge). */
export function managedTypes(role: Role): EventType[] {
  if (hasPermission(role, "schedule.manage")) return [...EVENT_TYPES];
  if (hasPermission(role, "schedule.fieldTrips")) return ["FIELD_TRIP"];
  return [];
}

/** Types the role records under their own name from "My schedule". */
export function ownTypes(role: Role): EventType[] {
  return hasPermission(role, "schedule.own") ? (OWN_TYPES[role] ?? []) : [];
}

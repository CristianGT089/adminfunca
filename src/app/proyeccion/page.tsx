import type { Metadata } from "next";
import { Stage } from "@/components/projection/Stage";

export const metadata: Metadata = { title: "FUNCA · Noche de Muertos" };

// Full screen for the projector, outside the panel (no sidebar). The session and the
// permission are checked by /api/projection: without a session it redirects to login.
export default function ProjectionPage() {
  return <Stage />;
}

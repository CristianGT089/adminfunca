import type { Metadata } from "next";
import { connection } from "next/server";
import PublicPage from "@/components/public/PublicPage";
import { institutionalDomains } from "@/lib/core/mail";
import RequestAppointment from "./RequestAppointment";

export const metadata: Metadata = { title: "Solicitar cita con Psicología · FUNCA" };

export default async function RequestAppointmentPage() {
  // The email domains come from the server environment, not from build time.
  await connection();
  return (
    <PublicPage
      eyebrow="Bienestar · Psicología"
      title="Solicitar una cita"
      text="Deje sus datos y una psicóloga de FUNCA se comunicará con usted para acordar el día y la hora. Es para estudiantes, docentes y personal de planta."
    >
      <RequestAppointment domains={institutionalDomains()} />
    </PublicPage>
  );
}

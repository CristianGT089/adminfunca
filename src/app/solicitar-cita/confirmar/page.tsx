import type { Metadata } from "next";
import PublicPage from "@/components/public/PublicPage";
import ConfirmRequest from "./ConfirmRequest";

export const metadata: Metadata = { title: "Confirmar solicitud · FUNCA" };

export default async function ConfirmRequestPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { token } = await searchParams;
  return (
    <PublicPage eyebrow="Bienestar · Psicología" title="Confirmar solicitud">
      <ConfirmRequest token={typeof token === "string" ? token : ""} />
    </PublicPage>
  );
}

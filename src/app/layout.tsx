import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUNCA Administrativo",
  description: "Plataforma administrativa de FUNCA: inventario, personas y gestión interna",
  icons: { icon: "/funca-logo.png" },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page is rendered per request: the CSP nonce from src/proxy.ts only reaches
  // Next.js' scripts when rendering on demand (a static page has no nonce and would not run).
  await connection();
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

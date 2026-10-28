import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUNCA Administrativo",
  description: "Plataforma administrativa de FUNCA: inventario, personas y gestión interna",
  icons: { icon: "/funca-logo.png" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

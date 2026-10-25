import type { Metadata } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "PMD Gold Passport",
  description: "Traceability of artisanal gold in Peru: identity checks, chain of custody and payments.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import { platformMetadata } from "@/lib/platform";
import "./globals.css";
import "./student-polish.css";
import "./ux-polish.css";
import "./design.css";
import { RussianValidation } from "./russian-validation";

export const metadata: Metadata = platformMetadata;
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await headers(); // Per-request CSP nonce must never be statically cached.
  return (
    <html lang="ru">
      <body>
        <RussianValidation />
        {children}
      </body>
    </html>
  );
}

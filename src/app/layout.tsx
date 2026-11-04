import { headers } from "next/headers";
import type { Metadata } from "next";
import { platformMetadata } from "@/lib/platform";
import "./globals.css";

export const metadata: Metadata = platformMetadata;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await headers(); // Per-request CSP nonce must never be statically cached.
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

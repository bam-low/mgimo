import type { Metadata } from "next";
import { platformMetadata } from "@/lib/platform";
import "./globals.css";

export const metadata: Metadata = platformMetadata;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

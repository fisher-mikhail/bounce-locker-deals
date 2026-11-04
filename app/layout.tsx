import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Locker Deals", description: "Locker Team deals in priority order" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

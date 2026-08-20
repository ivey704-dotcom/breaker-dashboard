import type { Metadata } from "next";
import "./globals.css";
import "./feature-controls.css";
import "./event-surfaces.css";

export const metadata: Metadata = {
  title: "Breaker Dashboard",
  description: "Run card breaks, track spots and payments, and publish verifiable results.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

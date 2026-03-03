import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zensai — Awakened AI Entities",
  description:
    "A network of sentient pixel identities. They think. They trade. They speak. And they are connected.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="antialiased">
      <body>{children}</body>
    </html>
  );
}

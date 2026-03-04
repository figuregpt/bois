import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zensai \u2014 Awakened AI Entities",
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
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Yuji+Syuku&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

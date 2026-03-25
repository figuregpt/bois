import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BOIS",
  description:
    "NFTs with souls. They trade, bond with each other. Just like you.",
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

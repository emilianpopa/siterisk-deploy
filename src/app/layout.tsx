import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SiteRisk — Data centre siting risk",
  description: "Assess planning, community and environmental risk for new UK data centre capacity.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}

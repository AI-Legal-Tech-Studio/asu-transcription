import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import "./globals.css";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Clinic Transcription Workbench",
  description:
    "A legal workbench for turning recorded interviews and intake conversations into reviewed transcripts, chronologies, and clinic-ready case briefs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={bodyFont.variable}>{children}</body>
    </html>
  );
}

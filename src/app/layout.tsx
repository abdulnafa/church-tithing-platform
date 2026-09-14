import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PRODUCT_NAME } from "@/lib/branding";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: PRODUCT_NAME,
    template: `%s | ${PRODUCT_NAME}`,
  },
  description:
    "A simple, secure digital giving platform for churches and their communities.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}

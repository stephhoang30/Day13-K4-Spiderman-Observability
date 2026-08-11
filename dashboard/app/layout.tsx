import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Day 13 AI Observability — Nhóm Spiderman K4",
  description:
    "Dashboard 6 panel đọc trực tiếp từ data/logs.jsonl theo contract config/dashboard.yaml.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}

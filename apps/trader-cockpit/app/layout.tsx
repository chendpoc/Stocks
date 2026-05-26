import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trader Agent Cockpit",
  description: "Trader Agent Cockpit Phase 0 中文优先前端基础版。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "UP-Care AgentOps · 智能服务运营",
  description:
    "Independent Concept Demo · 非官方概念演示。可追踪的咨询、知识检索、服务质检与人工审核。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

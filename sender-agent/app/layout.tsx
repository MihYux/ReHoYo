import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { WorkspaceShell } from "@/components/workspace-shell";

export const metadata: Metadata = {
  title: "ReHoYo · 全球发行智能工作台",
  description: "从版本理解、区域判断到发行方案的全球发行工作台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="desktop-notice">
          <strong>请使用桌面浏览器</strong>
          <span>ReHoYo 工作台针对 1180px 以上屏幕设计。</span>
        </div>
        <div className="desktop-app">
          <WorkspaceProvider>
            <WorkspaceShell>{children}</WorkspaceShell>
          </WorkspaceProvider>
        </div>
      </body>
    </html>
  );
}

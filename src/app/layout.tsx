import type { Metadata, Viewport } from "next";
import { PwaProvider } from "@/components/pwa-provider";
import "./globals.css";
export const metadata: Metadata = {
  title: "EnglishPilot · 每一天，都更近一步",
  description:
    "本地优先的个人英语学习工作台。120 分钟均衡学习，基于真实练习每周调整。",
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "EnglishPilot",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#183d4b",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}

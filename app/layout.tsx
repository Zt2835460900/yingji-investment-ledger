import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const rawHost =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const host = /^[a-z0-9.:-]+$/i.test(rawHost) ? rawHost : "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "盈迹 · 个人投资收益账本",
    description: "专业记录基金、股票与 ETF 的真实收益、资金回报、资产配置与风险。",
    icons: { icon: "/og.png", shortcut: "/og.png" },
    openGraph: {
      title: "盈迹 · 个人投资收益账本",
      description: "把现金流与投资表现分开看。",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: "盈迹 · 个人投资收益账本",
      description: "把现金流与投资表现分开看。",
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aivora",
  description: "Aivora AI workspace",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

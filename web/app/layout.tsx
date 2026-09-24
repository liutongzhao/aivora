import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aivora",
  description: "Aivora AI workspace",
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


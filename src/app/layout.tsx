import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Étoile Beauty — セルフ脱毛サロン予約",
  description: "無人セルフ脱毛サロン 予約・入退室管理システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AuthWrapper from "@/components/AuthWrapper";
import PWARegister from "@/components/PWARegister";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const SYSTEM_TITLE = process.env.NEXT_PUBLIC_SYSTEM_TITLE || "Trungnam E&C";

// Metadata render lúc build (server) nên không đọc được tenant_config trong DB —
// khách deploy riêng đặt 2 biến môi trường này (script provisioning sẽ set),
// thiếu thì fallback giá trị TNEC như cũ.
export const metadata: Metadata = {
  title: SYSTEM_TITLE,
  description: process.env.NEXT_PUBLIC_SYSTEM_DESCRIPTION || "Phần mềm Quản lý Hành chính Nhân sự - Trung Nam E&C",
  // PWA: cho phép "Thêm vào MH chính" trên iPhone chạy full màn hình như app.
  applicationName: SYSTEM_TITLE,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SYSTEM_TITLE,
    statusBarStyle: "default",
  },
  // Next 16 chỉ phát `mobile-web-app-capable`; thêm meta cũ để iOS < 16.4 vẫn
  // chạy full màn hình khi "Thêm vào MH chính".
  other: { "apple-mobile-web-app-capable": "yes" },
};

// Thanh trạng thái theo màu thương hiệu; viewport-fit=cover để nội dung phủ hết
// cạnh máy có "tai thỏ"/thanh Home (kết hợp safe-area trong globals.css).
export const viewport: Viewport = {
  themeColor: "#005BAC",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-gradient-to-br from-white to-[#e6effd] min-h-screen antialiased">
        <PWARegister />
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}

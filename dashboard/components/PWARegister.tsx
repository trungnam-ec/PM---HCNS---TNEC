"use client";

import { useEffect } from "react";

// Đăng ký service worker để web đạt chuẩn PWA (cài được, có fallback offline).
// Chỉ chạy trên production build — dev mode để yên cho HMR khỏi vướng cache.
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Đăng ký lỗi thì bỏ qua — web vẫn chạy bình thường, chỉ mất phần offline.
      });
    };

    // Đợi trang tải xong mới đăng ký để không tranh băng thông lúc khởi động.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}

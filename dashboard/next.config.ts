import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Khai báo các native/server-only packages để Next.js không bundle bằng webpack
  // Các package này sẽ được require trực tiếp trong Node.js runtime
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "@napi-rs/canvas",
    "pdfjs-dist",
  ],
};

export default nextConfig;

"use client";

import { useState } from "react";
import { useTenantConfig } from "@/lib/tenantConfig";

/**
 * Ô LOGO CÔNG TY — dùng chung cho màn hình đăng nhập, Sidebar và trang góp ý.
 *
 * Có `logo_url` trong tenant_config thì hiện ẢNH, không có thì hiện 2 chữ cái
 * `logo_text` trên nền gradient y như trước. Ảnh tải lỗi cũng rơi về chữ —
 * khách tự gắn logo mà sai đường dẫn thì giao diện vẫn lành, không vỡ ô trống.
 */
export default function BrandLogo({
  className,
  tileClassName,
  textClassName,
}: {
  /** Kích thước + bo góc của ô, ví dụ "w-16 h-16 rounded-2xl" */
  className: string;
  /** Nền gradient + đổ bóng, chỉ dùng khi KHÔNG có ảnh */
  tileClassName: string;
  /** Cỡ chữ của 2 ký tự, chỉ dùng khi KHÔNG có ảnh */
  textClassName: string;
}) {
  const tenant = useTenantConfig();
  const [imgFailed, setImgFailed] = useState(false);
  // Nền ô ghi bằng mã màu trực tiếp, KHÔNG dùng class bg-white: globals.css có luật
  // html.dark .bg-white đổi nền trắng thành nền tối, logo sẽ mất nền ở chế độ tối.
  const url = (tenant.logo_url || "").trim();

  if (url && !imgFailed) {
    return (
      <div className={`${className} bg-[#FFFFFF] flex items-center justify-center overflow-hidden p-1.5 shadow-md`}>
        {/* Ảnh do khách tự cấu hình nên không dùng next/image (không biết trước domain) */}
        <img
          src={url}
          alt={tenant.company_name}
          className="w-full h-full object-contain"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`${className} ${tileClassName} flex items-center justify-center font-heading font-extrabold text-white ${textClassName}`}>
      {tenant.logo_text}
    </div>
  );
}

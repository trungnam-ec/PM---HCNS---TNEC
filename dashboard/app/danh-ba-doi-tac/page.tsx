"use client";

// ============================================================
// Danh bạ đối tác — Nhà thầu phụ / Nhà cung cấp / Tổ đội (migration 150)
// Gói Enterprise + cờ Xem/Sửa. Quyền đọc từ CSDL (partner_dir_my_access); RLS mới
// là chốt chặn thật, giao diện chỉ ẩn/hiện nút.
// ============================================================

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import PartnerDirectory from "@/components/partners/PartnerDirectory";
import { fetchPartnerAccess, type PartnerAccess } from "@/lib/partnerDirectory";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Loader2, Lock } from "lucide-react";

export default function PartnerDirectoryPage() {
  const user = useCurrentUser();
  const [access, setAccess] = useState<PartnerAccess | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPartnerAccess().then((a) => alive && setAccess(a));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Danh bạ đối tác" subtitle="Nhà thầu phụ · Nhà cung cấp · Tổ đội thi công" />
        <main className="flex-1 p-4 sm:p-6 w-full">
          {!access || user.loading ? (
            <div className="flex items-center gap-2 py-10 justify-center text-slate-400 text-xs font-semibold">
              <Loader2 size={16} className="animate-spin" /> Đang tải quyền…
            </div>
          ) : !access.viewer ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center max-w-md mx-auto">
              <Lock size={28} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">Bạn chưa được cấp quyền xem Danh bạ đối tác</p>
              <p className="text-xs text-slate-400 mt-1">Liên hệ Admin để được cấp cờ quyền.</p>
            </div>
          ) : (
            <PartnerDirectory access={access} who={user.email} />
          )}
        </main>
      </div>
    </div>
  );
}

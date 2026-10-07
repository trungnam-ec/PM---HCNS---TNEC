"use client";

// ============================================================
// /ho-so-trinh-ky — Module Hồ sơ trình ký (gói Basic từ 22/09/2026)
//
// MỘT TRANG, HAI MỨC QUYỀN KHÁC HẲN NHAU — đừng gộp lại:
//
//  A. PHIẾU TRÌNH KÝ (mặc định) — MỌI tài khoản đăng nhập đều vào được. Ai cũng
//     phải lập được phiếu trình ký / tờ trình / đề nghị chuyển tiền, nên module
//     nằm ở gói Basic và KHÔNG đòi cờ. Ai thấy phiếu nào thì do RLS
//     `signing_select` (migration 074) quyết định, không do gói:
//       · người lập      -> thấy phiếu của chính mình
//       · Trưởng/Phó phòng -> thấy cả phòng mình (theo ô "Phòng ban" trên phiếu)
//       · PGĐ / Kế toán  -> thấy phiếu đi qua chặng của họ
//       · Admin / Ban lãnh đạo -> thấy tất cả
//     Ẩn/hiện ở giao diện KHÔNG phải cơ chế bảo vệ — chốt chặn là RLS.
//
//  B. DANH MỤC ĐỐI TÁC — từ 07/10/2026 MỌI tài khoản đều xem và thêm/sửa được
//     (migration 135), vì ai lập phiếu chuyển tiền / tạm ứng cũng cần chọn đối
//     tác và số tài khoản. Xoá đối tác vẫn chỉ Admin.
//
//  C. KẾ HOẠCH THU CHI — số liệu tài chính toàn công ty, CHỈ Admin hoặc người
//     có cờ `can_view_reports`. Ẩn ở giao diện chỉ để khỏi hiện tab trống; chốt
//     chặn thật là RLS của finance_plans (058/065).
//     (Tab Sản lượng / Doanh thu đã gỡ 06/10/2026.)
// ============================================================

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import FinancePartnerCatalog from "@/components/FinancePartnerCatalog";
import FinancePlanPanel from "@/components/FinancePlanPanel";
import SigningPanel from "@/components/SigningPanel";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Loader2 } from "lucide-react";

// Tab "Kế hoạch thu chi" đã gánh 2 việc khác hẳn nhau: danh mục đối tác (dữ liệu
// nền, sửa thưa) và phiếu trình ký (việc hằng ngày, có luồng duyệt). Tách tab con
// thay vì dồn một trang — dồn lại thì mỗi lần vào phải cuộn qua thứ không cần.
type ThuChiTab = "doi-tac" | "trinh-ky" | "ke-hoach";

const THU_CHI_TABS: { id: ThuChiTab; label: string; desc: string }[] = [
  { id: "trinh-ky", label: "Phiếu trình ký", desc: "Lập phiếu, trình duyệt 4 cấp, xuất Word" },
  { id: "ke-hoach", label: "Kế hoạch thu chi", desc: "Kế hoạch tài chính tháng — thu / chi theo tuần, theo dự án" },
  { id: "doi-tac", label: "Danh mục đối tác", desc: "Nhà thầu, số tài khoản, hợp đồng theo dự án" },
];

export default function BaoCaoPage() {
  const user = useCurrentUser();
  const [thuChiTab, setThuChiTab] = useState<ThuChiTab>("trinh-ky");

  // Đang tra danh tính: KHÔNG hiện gì thuộc về nội dung báo cáo. Nếu render sẵn
  // rồi mới ẩn thì có một nhịp dữ liệu loé ra trước khi quyền kịp tính xong.
  if (user.loading) {
    return (
      <div className="flex min-h-screen bg-[#F7F9FC]">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Header title="Hồ sơ trình ký" />
          <main className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2.5 text-slate-400 text-xs font-bold">
              <Loader2 size={16} className="animate-spin" />
              Đang kiểm tra quyền truy cập…
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Cờ mở tab KẾ HOẠCH THU CHI. KHÔNG dùng user.can("reports"):
  // từ 22/09/2026 module đã ở gói Basic nên hàm đó trả true cho mọi người —
  // đúng cho việc vào trang, sai cho việc mở số liệu tài chính.
  const canFinance = user.isAdmin || user.perms.canViewReports;

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Hồ sơ trình ký" />

        <main className="flex-1 min-w-0 p-3 sm:p-5 xl:p-8 overflow-y-auto space-y-5">
          {/* ─── Nội dung báo cáo ───
              Kế hoạch thu chi: bước 1 là DANH MỤC ĐỐI TÁC (migration 048). Màn
              hình nhập kế hoạch tháng và xuất Excel làm ở bước sau — chốt danh
              mục trước thì lúc đó chỉ việc chọn, không phải gõ lại.

              Tab này render THẲNG ra nền trang, KHÔNG bọc trong khung `.glass`
              như hai tab kia: nội dung của nó đã là các thẻ KPI + lưới card, bọc
              thêm một lớp card nữa thành card-lồng-card, viền chồng viền. */}
          {(() => {
            // Tab "Kế hoạch thu chi" đọc từ bảng mà RLS chỉ mở cho Admin / cờ
            // báo cáo — người khác không thấy tab đó. Hai tab còn lại ai cũng có.
            const tabs = THU_CHI_TABS.filter((t) => t.id !== "ke-hoach" || canFinance);
            const tab = tabs.some((t) => t.id === thuChiTab) ? thuChiTab : "trinh-ky";
            return (
            <div className="space-y-5 w-full">
              {/* Tab con */}
              <div className="flex flex-wrap bg-slate-100/70 rounded-xl p-1 gap-1 w-fit max-w-full">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThuChiTab(t.id)}
                    title={t.desc}
                    className={`px-4 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      tab === t.id
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "trinh-ky" ? (
                <SigningPanel />
              ) : tab === "ke-hoach" ? (
                <FinancePlanPanel />
              ) : (
                <FinancePartnerCatalog />
              )}
            </div>
            );
          })()}
        </main>
      </div>
    </div>
  );
}

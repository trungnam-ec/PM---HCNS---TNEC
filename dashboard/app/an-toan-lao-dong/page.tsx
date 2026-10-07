"use client";

// ============================================================
// P. An toàn lao động — Kho BHLĐ (migration 116)
//
// Đợt P0: Tổng kho ATLĐ (Mã SP + Tên SP + Size SP, tìm 1 dòng, tồn theo tháng,
// cảnh báo tồn tối thiểu) + Danh mục đối tác (NCC / nhà thầu nhận hàng).
// Phiếu nhập/xuất, duyệt, báo cáo Xuất–Nhập–Tồn làm ở các đợt sau.
//
// Ai đăng nhập cũng XEM được (user chốt: đơn giá ai cũng thấy). Nút ghi chỉ hiện
// với Thủ kho / Admin — quyền đọc từ CSDL (atld_my_access), RLS mới là chốt chặn.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import AtldItemCatalog from "@/components/atld/AtldItemCatalog";
import AtldPriceTab from "@/components/atld/AtldPriceTab";
import AtldIssueTab from "@/components/atld/AtldIssueTab";
import AtldPenaltyTab from "@/components/atld/AtldPenaltyTab";
import { fetchAtldAccess } from "@/lib/atldStock";
import { fetchPenaltyAccess, NO_PENALTY_ACCESS } from "@/lib/atldPenalties";
import { Boxes, ReceiptText, Truck, Gavel, Loader2 } from "lucide-react";

// Tab "Đối tác" bỏ theo yêu cầu user 02/10/2026 (component AtldPartnerCatalog giữ
// trong code, dữ liệu NCC còn nguyên). Lập + duyệt phiếu xuất ở tab "issues".
type Tab = "items" | "prices" | "issues" | "penalties";

const TABS: { key: Tab; label: string; icon: typeof Boxes }[] = [
  { key: "items", label: "Tổng Danh mục kho ATLĐ", icon: Boxes },
  { key: "prices", label: "Danh sách Quản lý Xuất-Nhập kho", icon: ReceiptText },
  { key: "issues", label: "Xuất kho cho BĐH/Đối tác", icon: Truck },
  { key: "penalties", label: "Khấu trừ xử phạt", icon: Gavel },
];

export default function SafetyWarehousePage() {
  const [tab, setTab] = useState<Tab>("items");
  const [access, setAccess] = useState({ keeper: false, approver: false });
  // Tab Khấu trừ xử phạt (139): nhân sự KHĐT chỉ có cờ xử phạt -> không thấy 3 tab kho.
  const [pen, setPen] = useState(NO_PENALTY_ACCESS);
  const [ready, setReady] = useState(false);

  const loadAccess = useCallback(async () => {
    const [a, p] = await Promise.all([fetchAtldAccess(), fetchPenaltyAccess()]);
    setAccess(a);
    setPen(p);
    setReady(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAccess();
  }, [loadAccess]);

  // Link từ chuông / email phiếu xuất: /an-toan-lao-dong?tab=prices -> mở thẳng tab.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t === "prices" || t === "issues" || t === "items" || t === "penalties") setTab(t);
  }, []);

  // Chỉ thấy tab mình có quyền. Trước khi chạy migration 139 thì hàm quyền xử phạt
  // chưa có -> pen.stock = false; khi đó vẫn hiện 3 tab kho như cũ.
  const showStock = pen.stock || !pen.view;
  const tabs = TABS.filter((t) => (t.key === "penalties" ? pen.view : showStock));
  const current: Tab = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key ?? "items";

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="P. An toàn lao động" subtitle="Kho BHLĐ — danh mục, tồn kho, nhập / xuất" />
        {/* Dàn trải toàn màn hình (user yêu cầu 02/10): bảng nhiều cột, giới hạn
            max-w-7xl làm cột cuối bị cắt. */}
        <main className="flex-1 p-4 sm:p-6 space-y-4 w-full">
          <div className="inline-flex flex-wrap gap-1 p-1 bg-white border border-slate-200 rounded-xl">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = current === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    active ? "bg-[#005BAC] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>

          {!ready && (
            <div className="flex items-center gap-2 py-10 justify-center text-slate-400 text-xs font-semibold">
              <Loader2 size={16} className="animate-spin" /> Đang tải quyền…
            </div>
          )}
          {ready && current === "items" && <AtldItemCatalog canEdit={access.keeper} canApprove={access.approver} />}
          {ready && current === "prices" && (
            <AtldPriceTab
              canEdit={access.keeper}
              canEditRow={access.keeper || access.approver}
              canDelete={access.approver}
              onOpenIssues={() => setTab("issues")}
            />
          )}
          {ready && current === "issues" && <AtldIssueTab canEdit={access.keeper} canApprove={access.approver} />}
          {ready && current === "penalties" && <AtldPenaltyTab canInput={pen.input} canProcess={pen.process} />}
        </main>
      </div>
    </div>
  );
}

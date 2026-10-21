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

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import AtldItemCatalog from "@/components/atld/AtldItemCatalog";
import AtldPriceTab from "@/components/atld/AtldPriceTab";
import AtldIssueTab from "@/components/atld/AtldIssueTab";
import AtldPenaltyTab from "@/components/atld/AtldPenaltyTab";
import AtldPenaltyRateTab from "@/components/atld/AtldPenaltyRateTab";
import AtldDeleteRequestModal from "@/components/atld/AtldDeleteRequestModal";
import { fetchAtldAccess } from "@/lib/atldStock";
import { fetchPenaltyAccess, NO_PENALTY_ACCESS } from "@/lib/atldPenalties";
import { Loader2 } from "lucide-react";

// Tab "Đối tác" bỏ theo yêu cầu user 02/10/2026 (component AtldPartnerCatalog giữ
// trong code, dữ liệu NCC còn nguyên). Lập + duyệt phiếu xuất ở tab "issues".
type Tab = "items" | "prices" | "issues" | "penalties" | "ppe" | "rates";

// 6 tab nay là 6 mục con của nhóm "P. An toàn lao động" ở sidebar (?tab=...);
// trang không còn thanh tab riêng.
// Phụ lục 01 "Mức xử phạt" (143) — cùng nhóm quyền với Khấu trừ xử phạt.
const TABS: { key: Tab; title: string; subtitle: string }[] = [
  { key: "items", title: "Tổng Danh mục kho ATLĐ", subtitle: "Kho BHLĐ — danh mục, tồn kho theo tháng" },
  { key: "prices", title: "Quản lý Xuất-Nhập kho", subtitle: "Kho BHLĐ — phiếu nhập / xuất, đơn giá" },
  { key: "issues", title: "Xuất kho cho BĐH/Đối tác", subtitle: "Kho BHLĐ — lập và duyệt phiếu xuất" },
  { key: "penalties", title: "Khấu trừ xử phạt", subtitle: "P. An toàn lao động — xử phạt khấu trừ" },
  { key: "ppe", title: "Khấu trừ PPE", subtitle: "P. An toàn lao động — khấu trừ cấp phát PPE thu hồi chi phí" },
  { key: "rates", title: "Định mức xử phạt", subtitle: "P. An toàn lao động — mức xử phạt theo phụ lục" },
];

function SafetyWarehouseContent() {
  const router = useRouter();
  const param = useSearchParams().get("tab");
  const tab: Tab = TABS.some((t) => t.key === param) ? (param as Tab) : "items";
  const setTab = (t: Tab) => router.push(`/an-toan-lao-dong?tab=${t}`);
  const [access, setAccess] = useState({ keeper: false, approver: false });
  // Tab Khấu trừ xử phạt (139): nhân sự KHĐT chỉ có cờ xử phạt -> không thấy 3 tab kho.
  const [pen, setPen] = useState(NO_PENALTY_ACCESS);
  const [ready, setReady] = useState(false);
  // Yêu cầu xoá chờ TP/PP duyệt (142): chuông mở ?delReq=<id>. reloadKey dựng lại
  // tab đang xem sau khi xoá để bảng không còn dòng đã xoá.
  const [delReq, setDelReq] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  // Link từ chuông / email: ?delReq=<id> mở popup duyệt yêu cầu xoá; ?tab= do sidebar/URL điều khiển.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDelReq(new URLSearchParams(window.location.search).get("delReq"));
  }, []);

  const closeDelReq = () => {
    setDelReq(null);
    const u = new URL(window.location.href);
    u.searchParams.delete("delReq");
    window.history.replaceState(null, "", u.toString());
  };

  // Chỉ thấy tab mình có quyền. Trước khi chạy migration 139 thì hàm quyền xử phạt
  // chưa có -> pen.stock = false; khi đó vẫn hiện 3 tab kho như cũ.
  const showStock = pen.stock || !pen.view;
  const tabs = TABS.filter((t) => (t.key === "penalties" || t.key === "ppe" || t.key === "rates" ? pen.view : showStock));
  const current: Tab = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key ?? "items";

  const head = TABS.find((t) => t.key === current) ?? TABS[0];

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title={head.title} subtitle={head.subtitle} />
        {/* Dàn trải toàn màn hình (user yêu cầu 02/10): bảng nhiều cột, giới hạn
            max-w-7xl làm cột cuối bị cắt. */}
        <main className="flex-1 p-4 sm:p-6 space-y-4 w-full">
          {!ready && (
            <div className="flex items-center gap-2 py-10 justify-center text-slate-400 text-xs font-semibold">
              <Loader2 size={16} className="animate-spin" /> Đang tải quyền…
            </div>
          )}
          {ready && current === "items" && <AtldItemCatalog key={reloadKey} canEdit={access.keeper} canApprove={access.approver} />}
          {ready && current === "prices" && (
            <AtldPriceTab
              key={reloadKey}
              canEdit={access.keeper}
              canEditRow={access.keeper || access.approver}
              canDelete={access.approver}
              onOpenIssues={() => setTab("issues")}
            />
          )}
          {ready && current === "issues" && <AtldIssueTab key={reloadKey} canEdit={access.keeper} canApprove={access.approver} />}
          {ready && current === "penalties" && <AtldPenaltyTab key={reloadKey} canInput={pen.input} canProcess={pen.process} canApprove={access.approver} />}
          {ready && current === "ppe" && <AtldPenaltyTab key={reloadKey} kind="ppe" canInput={pen.input} canProcess={pen.process} canApprove={access.approver} />}
          {ready && current === "rates" && <AtldPenaltyRateTab key={reloadKey} canInput={pen.input} canApprove={access.approver} />}
          {ready && delReq && (
            <AtldDeleteRequestModal
              id={delReq}
              canApprove={access.approver}
              onClose={closeDelReq}
              onDone={() => {
                closeDelReq();
                setReloadKey((k) => k + 1);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function SafetyWarehousePage() {
  return (
    <Suspense fallback={null}>
      <SafetyWarehouseContent />
    </Suspense>
  );
}

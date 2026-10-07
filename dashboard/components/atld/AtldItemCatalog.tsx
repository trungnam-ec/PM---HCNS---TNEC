"use client";

// ============================================================
// Kho BHLĐ > Tổng kho ATLĐ (danh mục sản phẩm + tồn theo kỳ)
//
// Mỗi dòng = Mã SP + Tên SP + Size SP (PPE003 và PPE003.1 là hai dòng riêng —
// user chốt 02/10/2026, đuôi .1/.2 là size khác). Một ô tìm duy nhất: gõ
// "giay 42", "ao ky su xl", "ppe003" đều ra — xem matchesQuery trong lib.
// Tồn theo THÁNG (migration 119): Tồn đầu kỳ – Nhập SP – Xuất SP – Tồn cuối kỳ,
// tính thẳng từ sổ kho nên tồn cuối tháng trước luôn = tồn đầu tháng sau.
// Hết hàng / Dưới mức / Giá trị tồn xét theo TỒN CUỐI KỲ của tháng đang xem.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirmBox } from "@/components/ConfirmDialog";
import AtldItemImport from "@/components/atld/AtldItemImport";
import ColorTag from "@/components/atld/ColorTag";
import { BTN_OUTLINE, BTN_PRIMARY, CONTROL_BOX } from "@/components/atld/ui";
import * as XLSX from "xlsx";
import {
  type AtldItem,
  type ItemInput,
  type StockLevel,
  fetchItems,
  fetchStockPeriod,
  currentMonthVN,
  monthRange,
  shiftMonth,
  EMPTY_PERIOD_STOCK,
  type PeriodStock,
  createItem,
  updateItem,
  receiveItemStock,
  setOpeningStock,
  setMonthReceipt,
  setItemActive,
  deleteItem,
  itemSearchText,
  matchesQuery,
  stockLevel,
  STOCK_LEVEL_META,
  suggestNextCode,
  UNIT_SUGGESTIONS,
  COLOR_OPTIONS,
  formatQty,
  formatMoney,
} from "@/lib/atldStock";
import { deleteInactiveItem } from "@/lib/atldVouchers";
import { Search, Plus, Pencil, Trash2, Loader2, AlertCircle, X, Boxes, PackageX, TriangleAlert, Wallet, EyeOff, Eye, ChevronLeft, ChevronRight, CalendarDays, FileDown, Check } from "lucide-react";

// Bộ lọc trạng thái: 3 mức tồn xét theo TỒN CUỐI KỲ của tháng đang xem; "Tất cả"
// và 3 mức chỉ tính mã đang dùng, "Ngừng dùng" là nhóm riêng.
type Filter = "all" | "ok" | "low" | "out" | "inactive";

type Row = AtldItem & PeriodStock & { level: StockLevel; haystack: string };

// "Tải về": xuất ĐÚNG các dòng đang hiện (tháng đang xem + bộ lọc trạng thái + ô tìm).
// Thay nút "Tồn đầu kỳ từ Excel" (user chốt 02/10/2026 — phiếu tồn đầu kỳ đã ghi sổ
// xong; component AtldOpeningImport giữ lại trong code, chỉ không hiện nữa).
function exportStockExcel(rows: Row[], month: string) {
  const [y, m] = month.split("-");
  const header = ["Mã SP", "Tên SP", "Size", "Màu", "ĐVT", "Tồn đầu kỳ", "Nhập SP", "Xuất SP", "Tồn cuối kỳ", "Tồn tối thiểu", "Trạng thái", "Giá trị tồn cuối kỳ (đ)"];
  const body = rows.map((r) => [
    r.code,
    r.name,
    r.size || "",
    r.color || "",
    r.unit || "",
    r.tonDau,
    r.nhap,
    r.xuat,
    r.tonCuoi,
    r.min_stock || "",
    r.active ? STOCK_LEVEL_META[r.level].label : "Ngừng dùng",
    Math.round(r.giaTriCuoi),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([[`TỔNG KHO ATLĐ — THÁNG ${m}/${y}`], [`Tồn đầu kỳ = tồn cuối kỳ tháng trước. Xuất lúc ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`], [], header, ...body]);
  ws["!cols"] = [11, 30, 10, 9, 7, 11, 10, 10, 12, 12, 12, 18].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Tong kho T${m}-${y}`);
  XLSX.writeFile(wb, `Tong_kho_ATLD_T${m}_${y}.xlsx`);
}

// canApprove (Admin + cờ Duyệt xuất): xoá HẲN mã Ngừng dùng kể cả mã đã có phiếu (129).
// Ngày phiếu khi chỉnh Nhập SP tăng: hôm nay nếu đang trong tháng xem, không thì ngày cuối tháng.
function receiptDateFor(month: string): string {
  const { from, to } = monthRange(month);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  return today >= from && today <= to ? today : to;
}

export default function AtldItemCatalog({ canEdit, canApprove }: { canEdit: boolean; canApprove: boolean }) {
  const [items, setItems] = useState<AtldItem[]>([]);
  const [stock, setStock] = useState<Map<string, PeriodStock>>(new Map());
  const [month, setMonth] = useState<string>(() => currentMonthVN());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<AtldItem | "new" | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  // Sửa nhanh Tồn đầu kỳ ngay tại ô của bảng.
  const [quick, setQuick] = useState<{ id: string; field: "open" | "nhap"; text: string; busy: boolean } | null>(null);
  const { ask, confirmNode } = useConfirmBox();

  const load = useCallback(async () => {
    const { from, to } = monthRange(month);
    const [res, st] = await Promise.all([fetchItems(), fetchStockPeriod(from, to)]);
    setItems(res.items);
    setError(res.error || st.error);
    setStock(st.map);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function saveQuick(r: Row) {
    if (!quick || quick.busy) return;
    const n = Number(quick.text.replace(/\./g, "").replace(",", "."));
    if (quick.text.trim() === "" || !Number.isFinite(n) || n < 0) return setRowErr("Số lượng phải là số không âm.");
    const cur = quick.field === "open" ? r.tonDau : r.nhap;
    if (n === cur) return setQuick(null);
    setQuick({ ...quick, busy: true });
    setRowErr(null);
    const { from, to } = monthRange(month);
    const er = quick.field === "open" ? await setOpeningStock(r.id, from, n) : await setMonthReceipt(r.id, from, to, n, receiptDateFor(month));
    if (er) {
      setRowErr(`${r.code}: ${er}`);
      return setQuick({ ...quick, busy: false });
    }
    setQuick(null);
    load();
  }

  const rows: Row[] = useMemo(
    () =>
      items.map((it) => {
        const s = stock.get(it.id) || EMPTY_PERIOD_STOCK;
        return { ...it, ...s, level: stockLevel(s.tonCuoi, it.min_stock), haystack: itemSearchText(it) };
      }),
    [items, stock]
  );

  const activeRows = rows.filter((r) => r.active);
  const counts = {
    all: activeRows.length,
    ok: activeRows.filter((r) => r.level === "ok").length,
    out: activeRows.filter((r) => r.level === "out").length,
    low: activeRows.filter((r) => r.level === "low").length,
    inactive: rows.length - activeRows.length,
  };
  const totalValue = activeRows.reduce((s, r) => s + r.giaTriCuoi, 0);
  const [mY, mM] = month.split("-");
  const isCurrentMonth = month === currentMonthVN();

  const filtered = useMemo(() => {
    const base =
      filter === "inactive"
        ? rows.filter((r) => !r.active)
        : rows.filter((r) => r.active && (filter === "all" || r.level === filter));
    return query.trim() ? base.filter((r) => matchesQuery(r.haystack, query)) : base;
  }, [rows, filter, query]);

  const toggleActive = async (r: Row) => {
    setRowErr(null);
    const err = await setItemActive(r.id, !r.active);
    if (err) return setRowErr(err);
    load();
  };

  const removeInactive = (r: Row) =>
    ask({
      title: `Xoá hẳn mã ${r.code}?`,
      message:
        "Xoá luôn mọi phiếu nhập / xuất CHỈ chứa mã này, sổ kho và lịch sử giá của mã — tồn kho của mã mất theo, không hoàn tác được. Mã nằm chung phiếu với mã khác (VD phiếu tồn đầu kỳ) thì hệ thống sẽ chặn.",
      onConfirm: async () => {
        setRowErr(null);
        const err = await deleteInactiveItem(r.id);
        if (err) return setRowErr(err);
        load();
      },
    });

  const remove = (r: Row) =>
    ask({
      title: `Xoá mã ${r.code}?`,
      message: "Chỉ xoá được mã CHƯA từng có trong phiếu kho. Mã đã dùng thì chuyển sang \"Ngừng dùng\".",
      onConfirm: async () => {
        setRowErr(null);
        const err = await deleteItem(r.id);
        if (err) return setRowErr(err);
        load();
      },
    });

  const FILTERS: { key: Filter; label: string; count: number; dot: string }[] = [
    { key: "all", label: "Tất cả", count: counts.all, dot: "bg-slate-400" },
    { key: "ok", label: "Đủ", count: counts.ok, dot: "bg-emerald-500" },
    { key: "low", label: "Dưới mức", count: counts.low, dot: "bg-amber-500" },
    { key: "out", label: "Hết hàng", count: counts.out, dot: "bg-rose-500" },
    { key: "inactive", label: "Ngừng dùng", count: counts.inactive, dot: "bg-slate-300" },
  ];
  const shownOf = filter === "inactive" ? counts.inactive : counts.all;

  return (
    <div className="space-y-4">
      {/* ── Chọn kỳ (tháng) ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
          <CalendarDays size={14} /> Kỳ báo cáo
        </span>
        <div className={`${CONTROL_BOX} gap-0.5 px-1`}>
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label="Tháng trước">
            <ChevronLeft size={14} />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="h-7 bg-transparent text-xs font-bold text-slate-700 px-1 focus:outline-none"
            aria-label="Chọn tháng"
          />
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label="Tháng sau">
            <ChevronRight size={14} />
          </button>
        </div>
        {!isCurrentMonth && (
          <button type="button" onClick={() => setMonth(currentMonthVN())} className="h-9 text-[11px] font-bold text-[#005BAC] hover:underline cursor-pointer">
            Về tháng này
          </button>
        )}
        <span className="text-[11px] text-slate-400">
          Tồn đầu kỳ tháng {mM}/{mY} = tồn cuối kỳ tháng trước.
        </span>
      </div>

      {/* ── Thẻ tổng ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Boxes} label="Mã đang dùng" value={formatQty(counts.all)} tone="blue" />
        <StatCard icon={PackageX} label={`Hết hàng cuối T${Number(mM)}`} value={formatQty(counts.out)} tone="rose" onClick={() => setFilter("out")} />
        <StatCard icon={TriangleAlert} label="Dưới tồn tối thiểu" value={formatQty(counts.low)} tone="amber" onClick={() => setFilter("low")} />
        <StatCard icon={Wallet} label={`Giá trị tồn cuối T${Number(mM)} (đồng)`} value={formatMoney(totalValue)} tone="emerald" />
      </div>

      {/* ── Thanh công cụ: hàng 1 = ô tìm + nút thao tác, hàng 2 = lọc trạng thái ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className={`${CONTROL_BOX} gap-2 px-3 flex-1 min-w-[240px] focus-within:border-[#00AEEF]`}>
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã, tên, size, màu… VD: giay 42, non vang, ppe003"
              className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Xoá ô tìm">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => exportStockExcel(filtered, month)} disabled={filtered.length === 0} className={BTN_OUTLINE}>
              <FileDown size={14} /> Tải về
            </button>
            {canEdit && (
              <>
                <AtldItemImport existingCodes={items.map((i) => i.code)} onDone={load} />
                <button type="button" onClick={() => setEditing("new")} className={BTN_PRIMARY}>
                  <Plus size={14} /> Tạo danh mục
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] font-bold text-slate-500">Trạng thái</span>
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl" role="tablist" aria-label="Lọc theo trạng thái">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.key)}
                  className={`h-7 inline-flex items-center gap-1.5 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    active ? "bg-[#005BAC] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : f.dot}`} />
                  {f.label}
                  <span className={`tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{f.count}</span>
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-[11px] text-slate-400">
            Đang hiện <b className="text-slate-600">{filtered.length}</b> / {shownOf} mã
          </span>
        </div>
      </div>

      {(error || rowErr) && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error || rowErr}
        </div>
      )}

      {/* ── Bảng ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#005BAC]" size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <Boxes size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">
            {items.length === 0 ? "Danh mục còn trống" : "Không có mã nào khớp"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {items.length === 0
              ? canEdit
                ? "Bấm \"Nhập từ Excel\" để đưa cả danh mục lên một lần, hoặc \"Tạo danh mục\" để thêm từng mã."
                : "Thủ kho ATLĐ chưa tạo sản phẩm nào."
              : "Thử bỏ bớt từ khoá hoặc chọn bộ lọc khác."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[1080px]">
            <thead>
              {/* Thanh tiêu đề xanh dương — cùng kiểu bảng Hồ sơ trình ký (SigningPanel):
                  màu đặc nên hiện đúng cả nền sáng lẫn nền tối. */}
              <tr className="bg-gradient-to-r from-[#005BAC] to-blue-500 text-[10px] font-extrabold uppercase tracking-wider text-white text-left whitespace-nowrap">
                <th className="px-4 py-3">Mã SP</th>
                <th className="px-4 py-3">Tên SP</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Màu</th>
                <th className="px-4 py-3">ĐVT</th>
                <th className="px-3 py-3 text-right">Tồn đầu kỳ</th>
                <th className="px-3 py-3 text-right">Nhập SP</th>
                <th className="px-3 py-3 text-right">Xuất SP</th>
                <th className="px-3 py-3 text-right">Tồn cuối kỳ</th>
                <th className="px-4 py-3 text-right">Tối thiểu</th>
                <th className="px-4 py-3">Trạng thái</th>
                {(canEdit || canApprove) && <th className="px-4 py-3 w-28" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const meta = STOCK_LEVEL_META[r.level];
                return (
                  <tr key={r.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 ${r.active ? "" : "opacity-55"}`}>
                    <td className="px-4 py-2.5 font-mono font-bold text-[#005BAC] whitespace-nowrap">{r.code}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">
                      {r.name}
                      {r.note && <span className="block text-[10px] font-medium text-slate-400">{r.note}</span>}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap">{r.size || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><ColorTag color={r.color} /></td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{r.unit || "—"}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      {quick?.id === r.id && quick.field === "open" ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={quick.text}
                            disabled={quick.busy}
                            onChange={(e) => setQuick({ ...quick, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveQuick(r);
                              if (e.key === "Escape") setQuick(null);
                            }}
                            className="w-20 text-xs font-bold text-right bg-white border border-[#00AEEF] rounded-md px-2 py-1 focus:outline-none"
                          />
                          <IconBtn title="Lưu tồn đầu kỳ (Enter)" onClick={() => saveQuick(r)}>
                            {quick.busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </IconBtn>
                          <IconBtn title="Bỏ (Esc)" onClick={() => setQuick(null)}><X size={13} /></IconBtn>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 group/od">
                          {formatQty(r.tonDau)}
                          {canEdit && (
                            <button
                              type="button"
                              title="Sửa nhanh tồn đầu kỳ"
                              onClick={() => setQuick({ id: r.id, field: "open", text: String(r.tonDau), busy: false })}
                              className="text-slate-300 hover:text-[#005BAC] cursor-pointer"
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                      {quick?.id === r.id && quick.field === "nhap" ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            inputMode="decimal"
                            value={quick.text}
                            disabled={quick.busy}
                            onChange={(e) => setQuick({ ...quick, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveQuick(r);
                              if (e.key === "Escape") setQuick(null);
                            }}
                            className="w-20 text-xs font-bold text-right bg-white border border-[#00AEEF] rounded-md px-2 py-1 focus:outline-none"
                          />
                          <IconBtn title="Lưu Nhập SP (Enter)" onClick={() => saveQuick(r)}>
                            {quick.busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </IconBtn>
                          <IconBtn title="Bỏ (Esc)" onClick={() => setQuick(null)}><X size={13} /></IconBtn>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {r.nhap ? formatQty(r.nhap) : <span className="text-slate-300">0</span>}
                          {canEdit && (
                            <button
                              type="button"
                              title="Sửa nhanh số Nhập SP của tháng"
                              onClick={() => setQuick({ id: r.id, field: "nhap", text: String(r.nhap), busy: false })}
                              className="text-slate-300 hover:text-[#005BAC] cursor-pointer"
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-rose-600">{r.xuat ? formatQty(r.xuat) : <span className="text-slate-300">0</span>}</td>
                    <td className="px-3 py-2.5 text-right font-extrabold text-slate-800 tabular-nums">{formatQty(r.tonCuoi)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{r.min_stock > 0 ? formatQty(r.min_stock) : "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.active ? (
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
                      ) : (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">Ngừng dùng</span>
                      )}
                    </td>
                    {(canEdit || canApprove) && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <>
                              <IconBtn title="Sửa" onClick={() => setEditing(r)}><Pencil size={13} /></IconBtn>
                              <IconBtn title={r.active ? "Ngừng dùng" : "Dùng lại"} onClick={() => toggleActive(r)}>
                                {r.active ? <EyeOff size={13} /> : <Eye size={13} />}
                              </IconBtn>
                            </>
                          )}
                          {!r.active && canApprove ? (
                            <IconBtn title="Xoá hẳn (kèm phiếu + sổ kho của mã)" danger onClick={() => removeInactive(r)}><Trash2 size={13} /></IconBtn>
                          ) : (
                            canEdit && <IconBtn title="Xoá" danger onClick={() => remove(r)}><Trash2 size={13} /></IconBtn>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          allItems={items}
          month={month}
          onReload={load}
          tonDau={editing === "new" ? 0 : (stock.get(editing.id) || EMPTY_PERIOD_STOCK).tonDau}
          nhapKy={editing === "new" ? 0 : (stock.get(editing.id) || EMPTY_PERIOD_STOCK).nhap}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  tone: "blue" | "rose" | "amber" | "emerald";
  onClick?: () => void;
}) {
  const toneCls = {
    blue: "bg-blue-50 text-[#005BAC]",
    rose: "bg-rose-50 text-rose-500",
    amber: "bg-amber-50 text-amber-500",
    emerald: "bg-emerald-50 text-emerald-600",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 text-left enabled:hover:border-slate-200 enabled:cursor-pointer disabled:cursor-default"
    >
      {/* Màn hẹp ẩn biểu tượng để số tiền tồn kho không bị cắt. */}
      <span className={`w-9 h-9 rounded-xl hidden sm:flex items-center justify-center shrink-0 ${toneCls}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">{label}</span>
        <span className="block text-base sm:text-lg font-extrabold text-slate-800 tabular-nums">{value}</span>
      </span>
    </button>
  );
}

function IconBtn({
  title,
  danger,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg text-slate-400 transition-all cursor-pointer ${
        danger ? "hover:text-rose-600 hover:bg-rose-50" : "hover:text-[#005BAC] hover:bg-blue-50"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Form tạo / sửa danh mục ───
// Ô tiền: chỉ giữ chữ số, hiện có dấu chấm ngăn nghìn; để trống = chưa có giá.
const parseMoney = (t: string): number | null => {
  const d = t.replace(/\D/g, "");
  return d === "" ? null : Number(d);
};
const moneyText = (n: number | null) => (n == null ? "" : formatMoney(n));

// Tên SP, Size, ĐVT dùng <datalist>: trình duyệt tự gợi ý từ dữ liệu đã có (không
// qua state React nên bộ gõ tiếng Việt không làm lệch), gõ giá trị mới vẫn được.
// Dùng ở tab Tổng Danh mục kho ATLĐ (nút "Tạo danh mục" + sửa mã).
function ItemModal({
  item,
  allItems,
  month,
  tonDau,
  nhapKy,
  onReload,
  onClose,
  onSaved,
}: {
  item: AtldItem | null;
  allItems: AtldItem[];
  month: string;
  tonDau: number;
  nhapKy: number;
  onReload: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<ItemInput>({
    code: item?.code ?? suggestNextCode(allItems),
    name: item?.name ?? "",
    size: item?.size ?? "",
    color: item?.color ?? "",
    unit: item?.unit ?? "",
    min_stock: item?.min_stock ?? 0,
    gia_nhap: item?.gia_nhap ?? null,
    gia_ban: item?.gia_ban ?? null,
    ncc: item?.ncc ?? "",
    note: item?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const savingRef = useRef(false);
  // Số lượng nhập kho kèm theo (tạo mới: nhập lần đầu; sửa: nhập thêm) — lập phiếu
  // nhập + ghi sổ, KHÔNG sửa tồn trực tiếp.
  const [qtyText, setQtyText] = useState("");
  const [ngayNhap, setNgayNhap] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()));
  // Mã đã tạo nhưng ghi sổ nhập kho lỗi -> bấm Lưu lần nữa chỉ sửa mã + thử nhập lại.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const selfId = item?.id ?? createdId;
  const qty = Number(qtyText.replace(/\./g, "").replace(",", ".")) || 0;
  // Tồn đầu kỳ của tháng đang xem (chỉ khi sửa mã đã có). Để trống = không đổi.
  const [openText, setOpenText] = useState(() => (item ? String(tonDau) : ""));
  const openVal = openText.trim() === "" ? null : Number(openText.replace(/\./g, "").replace(",", "."));
  const [nhapText, setNhapText] = useState(() => (item ? String(nhapKy) : ""));
  const nhapVal = nhapText.trim() === "" ? null : Number(nhapText.replace(/\./g, "").replace(",", "."));
  const nhapChanged = !!item && nhapVal != null && Number.isFinite(nhapVal) && nhapVal !== nhapKy;
  const openChanged = !!item && openVal != null && Number.isFinite(openVal) && openVal !== tonDau;

  const names = useMemo(() => Array.from(new Set(allItems.map((i) => i.name))).sort((a, b) => a.localeCompare(b, "vi")), [allItems]);
  const sizes = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.size).filter((s): s is string => !!s))).sort((a, b) => a.localeCompare(b, "vi", { numeric: true })),
    [allItems]
  );
  const units = useMemo(() => Array.from(new Set([...UNIT_SUGGESTIONS, ...allItems.map((i) => i.unit).filter((u): u is string => !!u)])), [allItems]);

  // Báo trùng ngay khi gõ (CSDL vẫn chặn lần cuối bằng unique index).
  const codeTaken = allItems.some((i) => i.id !== selfId && i.code.trim().toLowerCase() === v.code.trim().toLowerCase());
  const sameNameSize = allItems.find(
    (i) =>
      i.id !== selfId &&
      v.name.trim() &&
      i.name.trim().toLowerCase() === v.name.trim().toLowerCase() &&
      (i.size || "").trim().toLowerCase() === v.size.trim().toLowerCase() &&
      (i.color || "") === v.color.trim()
  );

  const set = <K extends keyof ItemInput>(k: K, val: ItemInput[K]) => setV((p) => ({ ...p, [k]: val }));

  async function save() {
    if (savingRef.current) return;
    if (!v.code.trim()) return setErr("Nhập Mã SP.");
    if (!v.name.trim()) return setErr("Nhập Tên SP.");
    if (codeTaken) return setErr("Mã SP này đã có trong danh mục.");
    if (!item && qtyText.trim() && !(qty > 0)) return setErr("Số lượng nhập phải lớn hơn 0.");
    if (!item && qty > 0 && v.gia_nhap == null) return setErr("Nhập Giá nhập để ghi sổ nhập kho.");
    if (!item && qty > 0 && !ngayNhap) return setErr("Chọn Ngày nhập.");
    if (item && openText.trim() !== "" && !(openVal != null && Number.isFinite(openVal) && openVal >= 0)) return setErr("Tồn đầu kỳ phải là số không âm.");
    if (item && nhapText.trim() !== "" && !(nhapVal != null && Number.isFinite(nhapVal) && nhapVal >= 0)) return setErr("Nhập SP phải là số không âm.");
    savingRef.current = true;
    setSaving(true);
    setErr("");
    setMsg("");
    let id = selfId;
    let e: string | null;
    if (id) {
      e = await updateItem(id, v);
    } else {
      const r = await createItem(v);
      e = r.error;
      id = r.id;
      if (id) setCreatedId(id);
    }
    // Sửa mã đã có: nút Lưu CHỈ lưu thông tin + tồn đầu kỳ; nhập kho đi nút "Nhập thêm" riêng
    // (tránh bấm Lưu nhiều lần là lập nhiều phiếu nhập).
    if (!e && id && !item && qty > 0) {
      const er = await receiveItemStock(id, qty, v.gia_nhap ?? 0, ngayNhap, "Nhập kho khi tạo mã SP", v.ncc);
      if (er) e = `Đã lưu mã SP nhưng CHƯA nhập kho được: ${er} — bấm Lưu để thử nhập lại.`;
    }
    // Chỉnh tồn đầu kỳ làm SAU phiếu nhập thêm: hàm tự tính chênh lệch với sổ kho lúc đó
    // nên tồn đầu kỳ cuối cùng luôn đúng bằng số đã gõ.
    if (!e && id && openChanged && openVal != null) {
      const er = await setOpeningStock(id, monthRange(month).from, openVal);
      if (er) e = `Đã lưu mã SP nhưng CHƯA chỉnh được tồn đầu kỳ: ${er}`;
      else setOpenText(String(openVal));
    }
    if (!e && id && nhapChanged && nhapVal != null) {
      const { from, to } = monthRange(month);
      const er = await setMonthReceipt(id, from, to, nhapVal, receiptDateFor(month));
      if (er) e = `Đã lưu mã SP nhưng CHƯA chỉnh được Nhập SP: ${er}`;
      else setNhapText(String(nhapVal));
    }
    savingRef.current = false;
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  // Nút "Nhập thêm" (chỉ khi sửa mã đã có): lập đúng 1 phiếu nhập, xong thì xoá ô số lượng.
  async function receiveMore() {
    if (savingRef.current || !item) return;
    if (!(qty > 0)) return setErr("Nhập số lượng nhập thêm lớn hơn 0.");
    if (v.gia_nhap == null) return setErr("Nhập Giá nhập để ghi sổ nhập kho.");
    if (!ngayNhap) return setErr("Chọn Ngày nhập.");
    savingRef.current = true;
    setSaving(true);
    setErr("");
    setMsg("");
    const er = await receiveItemStock(item.id, qty, v.gia_nhap, ngayNhap, "Nhập thêm từ danh mục SP", v.ncc);
    savingRef.current = false;
    setSaving(false);
    if (er) return setErr(er);
    setMsg(`Đã nhập kho ${formatQty(qty)} ${v.unit || "đơn vị"} (1 phiếu nhập, ghi sổ ngay).`);
    setQtyText("");
    onReload();
  }

  const inputCls =
    "w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:border-[#00AEEF]";

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        // Không gán Enter = Lưu: Enter còn dùng để chọn gợi ý của datalist.
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">
            {item ? `Sửa danh mục — ${item.code}` : "Tạo danh mục sản phẩm"}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Mã SP *</span>
            <input autoFocus value={v.code} onChange={(e) => set("code", e.target.value)} className={`${inputCls} font-mono`} />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-[10px] font-bold text-slate-500">Tên SP *</span>
            <input
              list="atld-item-names"
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="VD: Quần áo CN (Mẫu mới)"
              className={inputCls}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Size SP</span>
            <input list="atld-item-sizes" value={v.size} onChange={(e) => set("size", e.target.value)} placeholder="M, L, XL, 42…" className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Màu sắc</span>
            <select value={v.color} onChange={(e) => set("color", e.target.value)} className={inputCls}>
              <option value="">— Không có —</option>
              {COLOR_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              {/* Màu cũ ngoài danh sách (VD nhập từ Excel) vẫn giữ được khi sửa */}
              {v.color && !COLOR_OPTIONS.includes(v.color) && <option value={v.color}>{v.color}</option>}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Đơn vị tính</span>
            <input list="atld-item-units" value={v.unit} onChange={(e) => set("unit", e.target.value)} placeholder="Bộ, Cái, Đôi…" className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Tồn tối thiểu</span>
            <input
              type="number"
              min={0}
              value={v.min_stock || ""}
              onChange={(e) => set("min_stock", Number(e.target.value) || 0)}
              placeholder="0 = không cảnh báo"
              className={`${inputCls} tabular-nums`}
            />
          </label>
          {/* Giá nhập / giá bán (migration 125): hiện bằng nhau nhưng tách sẵn hai ô
              để sau này đổi chính sách giá bán không phải làm lại. */}
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Giá nhập (đ)</span>
            <input inputMode="numeric" value={moneyText(v.gia_nhap)} onChange={(e) => set("gia_nhap", parseMoney(e.target.value))} placeholder="0" className={`${inputCls} tabular-nums text-right`} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Giá bán (đ)</span>
            <input inputMode="numeric" value={moneyText(v.gia_ban)} onChange={(e) => set("gia_ban", parseMoney(e.target.value))} placeholder="0" className={`${inputCls} tabular-nums text-right`} />
          </label>
          {item && (
            <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-slate-500">
                  Tồn đầu kỳ tháng {Number(month.slice(5))}/{month.slice(0, 4)}
                </span>
                <input inputMode="decimal" value={openText} onChange={(e) => setOpenText(e.target.value)} className={`${inputCls} tabular-nums text-right`} />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-slate-500">
                  Nhập SP trong tháng {Number(month.slice(5))}/{month.slice(0, 4)}
                </span>
                <input inputMode="decimal" value={nhapText} onChange={(e) => setNhapText(e.target.value)} className={`${inputCls} tabular-nums text-right`} />
              </label>
              {openChanged && openVal != null && (
                <span className="sm:col-span-2 block text-[11px] text-amber-600">
                  Tồn đầu kỳ {formatQty(tonDau)} → {formatQty(openVal)}: ghi 1 phiếu {openVal > tonDau ? "nhập" : "xuất"} điều chỉnh {formatQty(Math.abs(openVal - tonDau))} ngày cuối tháng trước; tồn cuối kỳ các tháng sau đổi theo.
                </span>
              )}
              {nhapChanged && nhapVal != null && (
                <span className="sm:col-span-2 block text-[11px] text-amber-600">
                  Nhập SP {formatQty(nhapKy)} → {formatQty(nhapVal)}:{" "}
                  {nhapVal > nhapKy
                    ? `lập thêm 1 phiếu nhập ${formatQty(nhapVal - nhapKy)} ghi sổ ngay.`
                    : `trừ bớt ${formatQty(nhapKy - nhapVal)} khỏi các phiếu nhập gần nhất trong tháng (không xoá phiếu, có dòng đảo trong sổ).`}
                </span>
              )}
            </div>
          )}
          <div className={item ? "sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3" : "contents"}>
            {item && <p className="sm:col-span-3 text-[11px] font-extrabold text-slate-600">Nhập thêm hàng vào kho (mỗi lần bấm = 1 phiếu nhập)</p>}
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">{item ? "Số lượng nhập thêm" : "Số lượng nhập"}</span>
            <input inputMode="decimal" value={qtyText} onChange={(e) => setQtyText(e.target.value)} placeholder="0 = chưa nhập kho" className={`${inputCls} tabular-nums text-right`} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Ngày nhập</span>
            <input type="date" value={ngayNhap} onChange={(e) => setNgayNhap(e.target.value)} className={`${inputCls} tabular-nums`} />
          </label>
          <div className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Thành tiền nhập (đ)</span>
            <div className={`${inputCls} tabular-nums text-right bg-slate-100`}>{qty > 0 && v.gia_nhap != null ? formatMoney(qty * v.gia_nhap) : "—"}</div>
          </div>
          {qty > 0 && (
            <p className="sm:col-span-3 text-[11px] text-slate-500 -mt-1">
              {item ? "Bấm Nhập thêm" : "Lưu xong"} sẽ lập <b>phiếu nhập kho</b> {formatQty(qty)} {v.unit || "đơn vị"} và ghi sổ ngay — cộng vào cột Nhập SP của Tổng Danh mục kho ATLĐ.
              {item && " Tồn hiện có không bị ghi đè, chỉ cộng thêm."}
            </p>
          )}
            {item && (
              <div className="sm:col-span-3 flex items-center justify-end gap-3">
                {msg && <span className="mr-auto text-[11px] font-semibold text-emerald-600">{msg}</span>}
                <button
                  type="button"
                  onClick={receiveMore}
                  disabled={saving || !(qty > 0)}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold px-4 py-2 rounded-lg cursor-pointer"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />} Nhập thêm
                </button>
              </div>
            )}
          </div>
          <label className="block space-y-1 sm:col-span-3">
            <span className="text-[10px] font-bold text-slate-500">NCC/PVT</span>
            <input value={v.ncc} onChange={(e) => set("ncc", e.target.value)} placeholder="Nhà cung cấp / Phòng Vật tư — gõ tay" className={inputCls} />
          </label>
          <label className="block space-y-1 sm:col-span-3">
            <span className="text-[10px] font-bold text-slate-500">Ghi chú</span>
            <input value={v.note} onChange={(e) => set("note", e.target.value)} className={inputCls} />
          </label>
        </div>

        <datalist id="atld-item-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        <datalist id="atld-item-sizes">{sizes.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="atld-item-units">{units.map((u) => <option key={u} value={u} />)}</datalist>

        {codeTaken && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> Mã SP này đã có trong danh mục.
          </p>
        )}
        {!codeTaken && sameNameSize && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-600">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" />
            Đã có mã {sameNameSize.code} cùng tên, size và màu. Vẫn lưu được nếu đây thật sự là mặt hàng khác.
          </p>
        )}
        {err && !codeTaken && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
            Huỷ
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || codeTaken}
            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold px-4 py-2 rounded-lg cursor-pointer"
          >
            {saving && <Loader2 size={13} className="animate-spin" />} {item ? "Lưu" : "Tạo danh mục"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

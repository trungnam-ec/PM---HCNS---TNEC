"use client";

// ============================================================
// Kho BHLĐ > Giá nhập kho — GIÁ NHẬP VÀO + GIÁ XUẤT BÁN RA (migration 120)
//
// Như sheet Chi Tiet: mỗi dòng một lần Nhập hoặc Xuất — Ngày · Loại · Mã SP · SL ·
// Đơn giá · Khách hàng · Báo giá/HĐ. Gộp lịch sử nhập/xuất của Excel cũ + phiếu đã ghi
// sổ trong hệ thống. "So lần trước" so đơn giá với lần CÙNG LOẠI liền trước của
// cùng mã (nhập so nhập, xuất so xuất).
// CHỈ ĐỂ TRA GIÁ — bảng này không cộng vào tồn kho.
// Dòng "Excel cũ" sửa tay được (Thủ kho / TP-PP / Admin) và xoá được (CHỈ TP/PP có
// cờ duyệt xuất + Admin) — migration 121. Dòng sinh từ PHIẾU thì không: phiếu đã
// ghi sổ chỉ huỷ bằng dòng đảo.
//
// Phiếu xuất kho (migration 123) hiện trong danh sách từ lúc lưu nháp, kèm cột
// Trạng thái. LẬP + DUYỆT phiếu đã chuyển sang tab "Xuất kho cho BĐH/Đối tác"
// (user yêu cầu 02/10/2026) — ở đây dòng phiếu chỉ có nút mở sang tab đó.
// Thẻ tổng + "So lần trước" chỉ tính dòng ĐÃ CHỐT (Excel cũ + phiếu đã duyệt).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import {
  type AtldItem,
  type TradePrice,
  fetchItems,
  fetchTradePrices,
  insertPriceHistory,
  updatePriceHistory,
  deletePriceHistory,
  itemSearchText,
  matchesQuery,
  formatMoney,
  formatQty,
} from "@/lib/atldStock";
import { parseTradeSheets, fold, type TradeRow } from "@/lib/atldItemImport";
import { normalizeName } from "@/lib/approvers";
import ColorTag from "@/components/atld/ColorTag";
import { useConfirmBox } from "@/components/ConfirmDialog";
import AtldPartnerPicker from "@/components/atld/AtldPartnerPicker";
import AtldRowDetail, { isRowClick } from "@/components/atld/AtldRowDetail";
import {
  ISSUE_STATUS_META,
  type IssueStatus,
  fetchSharedPartners,
  type SharedPartner,
} from "@/lib/atldVouchers";
import { BTN_OUTLINE, BTN_PRIMARY, BTN_SUCCESS, CONTROL_BOX } from "@/components/atld/ui";
import { Search, X, Loader2, AlertCircle, ReceiptText, ArrowUpRight, ArrowDownRight, FileDown, FileUp, CheckCircle2, Ban, AlertTriangle, Pencil, Trash2, Lock, ExternalLink } from "lucide-react";

type Row = TradePrice & { item: AtldItem | null; prevPrice: number | null; haystack: string };
type LoaiFilter = "all" | "nhap" | "xuat";

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

// Dòng đã CHỐT giá: Excel cũ hoặc phiếu đã duyệt. Phiếu nháp / chờ duyệt / bị trả
// lại / đã huỷ hiện trong danh sách nhưng không tính vào tổng tiền và "So lần trước".
const isFinal = (r: { nguon: string; status: string | null }) => r.nguon === "excel" || r.status === "posted";

function LoaiBadge({ loai }: { loai: "nhap" | "xuat" }) {
  return loai === "nhap" ? (
    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Nhập</span>
  ) : (
    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Xuất</span>
  );
}

// "Tải về": xuất ĐÚNG các dòng đang hiện (theo bộ lọc) ra Excel. Tên cột giữ giống
// sheet Chi Tiet (Ngày / Loại / Mã SP / Số lượng / Đơn giá / Khách hàng / Báo giá / HĐ)
// nên sửa trong Excel xong "Upload Excel" ngược lại được — dòng giống hệt tự bỏ qua.
function exportTradeExcel(rows: Row[]) {
  const header = ["Ngày", "Loại", "Mã SP", "Tên SP", "Size", "Màu", "ĐVT", "Số lượng", "Đơn giá", "Thành tiền", "Khách hàng", "Báo giá / HĐ", "Nguồn", "Trạng thái"];
  const body = rows.map((r) => {
    const [y, m, d] = r.ngay.split("-").map(Number);
    return [
      new Date(y, m - 1, d),
      r.loai === "nhap" ? "Nhập" : "Xuất",
      r.item?.code || "",
      r.item?.name || "",
      r.item?.size || "",
      r.item?.color || "",
      r.item?.unit || "",
      r.qty,
      r.unit_price ?? "",
      r.unit_price == null ? "" : r.qty * r.unit_price,
      r.doi_tac || "",
      r.chung_tu || "",
      r.nguon === "phieu" ? r.so_phieu || "Phiếu" : "Excel cũ",
      r.status ? ISSUE_STATUS_META[r.status as IssueStatus]?.label || r.status : "",
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...body], { cellDates: true, dateNF: "dd/mm/yyyy" });
  ws["!cols"] = [12, 7, 11, 30, 10, 9, 7, 10, 12, 14, 32, 22, 24, 12].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gia nhap xuat");
  const t = new Date();
  const stamp = `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}${String(t.getDate()).padStart(2, "0")}`;
  XLSX.writeFile(wb, `Gia_nhap_xuat_kho_ATLD_${stamp}.xlsx`);
}

export default function AtldPriceTab({
  canEdit,
  canEditRow,
  canDelete,
  onOpenIssues,
}: {
  canEdit: boolean;     // Thủ kho: upload Excel, tạo / sửa / gửi duyệt phiếu xuất
  canEditRow: boolean;  // Thủ kho / TP-PP / Admin: sửa tay dòng Excel cũ
  canDelete: boolean;   // CHỈ TP/PP có cờ duyệt xuất + Admin: xoá dòng Excel cũ
  onOpenIssues: () => void; // mở tab "Xuất kho cho BĐH/Đối tác" (lập / duyệt phiếu ở đó)
}) {
  const [items, setItems] = useState<AtldItem[]>([]);
  const [prices, setPrices] = useState<TradePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loai, setLoai] = useState<LoaiFilter>("all");
  const [doiTac, setDoiTac] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  // Bấm vào dòng -> popup xem đủ thông tin (màn hình nhỏ không phải cuộn ngang).
  const [viewing, setViewing] = useState<Row | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const { ask, confirmNode } = useConfirmBox();
  const showActions = true; // dòng phiếu luôn có nút mở sang tab Xuất kho

  const load = useCallback(async () => {
    const [it, pr] = await Promise.all([fetchItems(), fetchTradePrices()]);
    setItems(it.items);
    setPrices(pr.rows);
    setError(it.error || pr.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Giá lần trước: xếp theo ngày tăng dần, tách theo (mã, loại); bỏ qua dòng thiếu giá.
  const rows: Row[] = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const asc = [...prices].sort((a, b) => (a.ngay === b.ngay ? 0 : a.ngay < b.ngay ? -1 : 1));
    const last = new Map<string, number>();
    const prev = new Map<string, number | null>();
    for (const p of asc) {
      const key = `${p.item_id}|${p.loai}`;
      prev.set(`${p.nguon}-${p.id}`, last.has(key) ? (last.get(key) as number) : null);
      if (p.unit_price != null && isFinal(p)) last.set(key, p.unit_price);
    }
    return prices.map((p) => {
      const item = byId.get(p.item_id) || null;
      return {
        ...p,
        item,
        prevPrice: prev.get(`${p.nguon}-${p.id}`) ?? null,
        haystack: normalizeName(`${item ? itemSearchText(item) : ""} ${p.doi_tac || ""} ${p.chung_tu || ""} ${p.so_phieu || ""}`),
      };
    });
  }, [prices, items]);

  const partners = useMemo(
    () =>
      Array.from(new Set(prices.filter((p) => loai === "all" || p.loai === loai).map((p) => p.doi_tac).filter((s): s is string => !!s))).sort((a, b) =>
        a.localeCompare(b, "vi")
      ),
    [prices, loai]
  );

  const base = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!doiTac || r.doi_tac === doiTac) &&
          (!from || r.ngay >= from) &&
          (!to || r.ngay <= to) &&
          (!query.trim() || matchesQuery(r.haystack, query))
      ),
    [rows, doiTac, from, to, query]
  );
  const filtered = useMemo(
    () =>
      base
        .filter((r) => loai === "all" || r.loai === loai)
        // Mới nhất lên đầu; cùng ngày thì phiếu (mới) trước dòng Excel cũ.
        .sort((a, b) => (a.ngay === b.ngay ? (a.nguon === b.nguon ? 0 : a.nguon === "phieu" ? -1 : 1) : a.ngay < b.ngay ? 1 : -1)),
    [base, loai]
  );

  const pendingCount = base.filter((r) => r.nguon === "phieu" && r.status !== "posted" && r.status !== "cancelled").length;

  const sum = (l: "nhap" | "xuat") => {
    const rs = base.filter((r) => r.loai === l && isFinal(r));
    return { n: rs.length, value: rs.reduce((s, r) => s + r.qty * (r.unit_price ?? 0), 0), noPrice: rs.filter((r) => r.unit_price == null).length };
  };
  const sNhap = sum("nhap");
  const sXuat = sum("xuat");
  const filtering = !!(query || doiTac || from || to || loai !== "all");

  const remove = (r: Row) =>
    ask({
      title: `Xoá dòng ${r.loai === "nhap" ? "nhập" : "xuất"} ${r.item?.code || ""} ngày ${fmtDate(r.ngay)}?`,
      message: "Chỉ xoá dòng lịch sử giá (tra cứu) — không ảnh hưởng tồn kho. Không hoàn tác được.",
      onConfirm: async () => {
        setRowErr(null);
        const e = await deletePriceHistory(r.id);
        if (e) return setRowErr(e);
        load();
      },
    });

  const LOAI: { key: LoaiFilter; label: string; count: number; dot: string }[] = [
    { key: "all", label: "Tất cả", count: base.length, dot: "bg-slate-400" },
    { key: "nhap", label: "Nhập", count: base.filter((r) => r.loai === "nhap").length, dot: "bg-emerald-500" },
    { key: "xuat", label: "Xuất", count: base.filter((r) => r.loai === "xuat").length, dot: "bg-rose-500" },
  ];

  return (
    <div className="space-y-4">
      {/* ── Thẻ tổng: tiền nhập / tiền xuất theo bộ lọc đang chọn ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Giá trị nhập vào ({sNhap.n} lần)</span>
          <span className="block text-lg font-extrabold text-emerald-600 tabular-nums">{formatMoney(sNhap.value)} đ</span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Giá trị xuất bán ra ({sXuat.n} lần)</span>
          <span className="block text-lg font-extrabold text-rose-600 tabular-nums">{formatMoney(sXuat.value)} đ</span>
          {sXuat.noPrice > 0 && <span className="block text-[10px] font-semibold text-amber-600">{sXuat.noPrice} lần xuất chưa có đơn giá — chưa tính vào tổng</span>}
          {pendingCount > 0 && <span className="block text-[10px] font-semibold text-slate-400">{pendingCount} dòng phiếu chưa duyệt — chưa tính vào tổng</span>}
        </div>
      </div>

      {/* ── Hàng 1: tìm + nút ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`${CONTROL_BOX} gap-2 px-3 flex-1 min-w-[240px] focus-within:border-[#00AEEF]`}>
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã, tên, size, khách hàng, chứng từ… VD: giay 42, ba lai 8"
            className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Xoá ô tìm">
              <X size={13} />
            </button>
          )}
        </div>
        <button type="button" onClick={() => exportTradeExcel(filtered)} disabled={filtered.length === 0} className={BTN_OUTLINE}>
          <FileDown size={14} /> Tải danh sách
        </button>
        {canEdit && items.length > 0 && <TradeHistoryImport items={items} existing={prices} onDone={load} />}
      </div>

      {/* ── Hàng 2: loại · khách hàng · khoảng ngày ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[11px] font-bold text-slate-500">Loại</span>
        <div className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl" role="tablist" aria-label="Lọc theo loại">
          {LOAI.map((f) => {
            const active = loai === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setLoai(f.key);
                  setDoiTac("");
                }}
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
        <span className="text-[11px] font-bold text-slate-500 sm:ml-2">Khách hàng</span>
        <select
          value={doiTac}
          onChange={(e) => setDoiTac(e.target.value)}
          className={`${CONTROL_BOX} px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#00AEEF] min-w-[170px] max-w-[260px]`}
        >
          <option value="">Tất cả</option>
          {partners.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-[11px] font-bold text-slate-500 sm:ml-2">Ngày</span>
        <div className={`${CONTROL_BOX} gap-1 px-2`}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 bg-transparent text-xs font-semibold text-slate-700 focus:outline-none" aria-label="Từ ngày" />
          <span className="text-slate-300">–</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 bg-transparent text-xs font-semibold text-slate-700 focus:outline-none" aria-label="Đến ngày" />
        </div>
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setLoai("all");
              setDoiTac("");
              setFrom("");
              setTo("");
            }}
            className="h-9 text-[11px] font-bold text-[#005BAC] hover:underline cursor-pointer"
          >
            Bỏ lọc
          </button>
        )}
        <span className="ml-auto text-[11px] text-slate-400">
          Đang hiện <b className="text-slate-600">{filtered.length}</b> dòng
        </span>
      </div>

      {(error || rowErr) && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error || rowErr}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#005BAC]" size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <ReceiptText size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">{prices.length === 0 ? "Chưa có lịch sử giá nhập – xuất" : "Không có dòng nào khớp"}</p>
          <p className="text-xs text-slate-400 mt-1">
            {prices.length === 0
              ? canEdit
                ? "Bấm \"Upload Excel\" để đưa các dòng nhập – xuất trong sheet Chi Tiet lên. Phiếu mới sẽ tự hiện ở đây."
                : "Phiếu nhập / xuất kho sẽ tự hiện ở đây sau khi được ghi sổ."
              : "Thử bỏ bớt bộ lọc."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[1520px]">
            <thead>
              {/* Thanh tiêu đề xanh dương — cùng kiểu Tổng kho ATLĐ / Hồ sơ trình ký. */}
              <tr className="bg-gradient-to-r from-[#005BAC] to-blue-500 text-[10px] font-extrabold uppercase tracking-wider text-white text-left whitespace-nowrap">
                <th className="px-4 py-3">Ngày</th>
                <th className="px-3 py-3">Loại</th>
                <th className="px-4 py-3">Mã SP</th>
                <th className="px-4 py-3">Tên SP</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Màu</th>
                <th className="px-3 py-3">ĐVT</th>
                <th className="px-3 py-3 text-right">Số lượng</th>
                <th className="px-3 py-3 text-right">Đơn giá</th>
                <th className="px-3 py-3 text-right">So lần trước</th>
                <th className="px-3 py-3 text-right">Thành tiền</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Báo giá / HĐ</th>
                <th className="px-4 py-3">Nguồn</th>
                <th className="px-3 py-3">Trạng thái</th>
                {showActions && <th className="px-3 py-3 w-28" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const diff =
                  r.unit_price != null && r.prevPrice != null && r.prevPrice > 0 ? ((r.unit_price - r.prevPrice) / r.prevPrice) * 100 : null;
                return (
                  <tr
                    key={`${r.nguon}-${r.id}`}
                    onClick={(e) => isRowClick(e) && setViewing(r)}
                    title="Bấm để xem đầy đủ thông tin"
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-semibold text-slate-600 whitespace-nowrap tabular-nums">{fmtDate(r.ngay)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><LoaiBadge loai={r.loai} /></td>
                    <td className="px-4 py-2.5 font-mono font-bold text-[#005BAC] whitespace-nowrap">{r.item?.code || "—"}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700 min-w-[190px]">{r.item?.name || "(mã đã xoá)"}</td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{r.item?.size || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><ColorTag color={r.item?.color} /></td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.item?.unit || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700 whitespace-nowrap">{formatQty(r.qty)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-slate-800 whitespace-nowrap">
                      {r.unit_price == null ? <span className="text-[11px] font-semibold text-amber-600">Chưa có giá</span> : formatMoney(r.unit_price)}
                      {r.vat_percent ? <span className="block text-[10px] font-semibold text-slate-400">+VAT {r.vat_percent}%</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {diff == null ? (
                        <span className="text-slate-300">—</span>
                      ) : Math.abs(diff) < 0.05 ? (
                        <span className="text-[11px] font-semibold text-slate-400">Như cũ</span>
                      ) : diff > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-rose-600">
                          <ArrowUpRight size={12} /> {diff.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-600">
                          <ArrowDownRight size={12} /> {Math.abs(diff).toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 whitespace-nowrap">
                      {r.unit_price == null ? "—" : formatMoney(r.qty * r.unit_price)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700 min-w-[160px]">
                      {r.doi_tac || (r.nguon === "phieu" ? "" : "—")}
                      {r.nguon === "phieu" && (r.nguoi_nhan || r.bdh_name) && (
                        <span className="block text-[10px] font-medium text-slate-400">{[r.nguoi_nhan, r.bdh_name].filter(Boolean).join(" · ")}</span>
                      )}
                      {r.nguon === "phieu" && !r.doi_tac && !r.nguoi_nhan && !r.bdh_name && "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 min-w-[140px]">{r.chung_tu || "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {r.nguon === "phieu" ? (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-[#005BAC]">{r.so_phieu}</span>
                      ) : (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Excel cũ</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.status ? (
                        <>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${ISSUE_STATUS_META[r.status as IssueStatus]?.cls || ""}`}>
                            {ISSUE_STATUS_META[r.status as IssueStatus]?.label || r.status}
                          </span>
                          {r.ly_do_tra_huy && <span className="block max-w-[180px] truncate text-[10px] text-slate-400 mt-0.5" title={r.ly_do_tra_huy}>{r.ly_do_tra_huy}</span>}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {showActions && (
                      <td className="px-3 py-2.5">
                        {r.nguon === "phieu" && r.loai === "xuat" ? (
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              title="Mở phiếu ở tab Xuất kho cho BĐH/Đối tác"
                              aria-label="Mở phiếu ở tab Xuất kho"
                              onClick={onOpenIssues}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 cursor-pointer"
                            >
                              <ExternalLink size={13} />
                            </button>
                          </div>
                        ) : r.nguon === "excel" ? (
                          <div className="flex items-center justify-end gap-1">
                            {canEditRow && (
                              <button type="button" title="Sửa" aria-label="Sửa" onClick={() => setEditing(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 cursor-pointer">
                                <Pencil size={13} />
                              </button>
                            )}
                            {canDelete && (
                              <button type="button" title="Xoá" aria-label="Xoá" onClick={() => remove(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="flex justify-end text-slate-300" title="Dòng từ phiếu đã ghi sổ — sửa bằng cách huỷ phiếu">
                            <Lock size={13} />
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <AtldRowDetail
          title={
            <>
              {viewing.loai === "nhap" ? "Nhập kho" : "Xuất kho"} · <span className="font-mono text-[#005BAC]">{viewing.item?.code || "—"}</span>
            </>
          }
          badges={
            <>
              <LoaiBadge loai={viewing.loai} />
              {viewing.nguon === "phieu" ? (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-[#005BAC]">{viewing.so_phieu}</span>
              ) : (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Excel cũ</span>
              )}
              {viewing.status && (
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${ISSUE_STATUS_META[viewing.status as IssueStatus]?.cls || ""}`}>
                  {ISSUE_STATUS_META[viewing.status as IssueStatus]?.label || viewing.status}
                </span>
              )}
            </>
          }
          stats={[
            { label: "Số lượng", value: `${formatQty(viewing.qty)} ${viewing.item?.unit || ""}`.trim() },
            { label: "Đơn giá", value: viewing.unit_price == null ? "Chưa có giá" : `${formatMoney(viewing.unit_price)} đ` },
            { label: "Thành tiền", value: viewing.unit_price == null ? "—" : `${formatMoney(viewing.qty * viewing.unit_price)} đ`, tone: "blue" },
          ]}
          sections={[
            {
              title: "Sản phẩm",
              tone: "blue",
              fields: [
                { label: "Mã SP", value: viewing.item?.code },
                { label: "Tên SP", value: viewing.item?.name || "(mã đã xoá)", strong: true },
                { label: "Size", value: viewing.item?.size },
                { label: "Màu", value: viewing.item?.color ? <ColorTag color={viewing.item.color} /> : null },
                { label: "ĐVT", value: viewing.item?.unit },
                { label: "VAT", value: viewing.vat_percent ? `${viewing.vat_percent}%` : null },
              ],
            },
            {
              title: "Giao dịch",
              fields: [
                { label: "Ngày", value: fmtDate(viewing.ngay) },
                { label: "Khách hàng", value: viewing.doi_tac, strong: true },
                { label: "BĐH", value: viewing.bdh_name },
                { label: "Người nhận", value: viewing.nguoi_nhan },
                { label: "Báo giá / HĐ", value: viewing.chung_tu },
                { label: "Giá lần trước", value: viewing.prevPrice == null ? null : `${formatMoney(viewing.prevPrice)} đ` },
                { label: "Nội dung", value: viewing.ly_do, wide: true },
                { label: "Lý do trả lại / huỷ", value: viewing.ly_do_tra_huy, wide: true },
                { label: "Người lập", value: viewing.created_by_name || viewing.created_by },
              ],
            },
          ]}
          actions={
            viewing.nguon === "phieu" && viewing.loai === "xuat" ? (
              <button
                type="button"
                onClick={() => {
                  setViewing(null);
                  onOpenIssues();
                }}
                className={BTN_OUTLINE}
              >
                <ExternalLink size={13} /> Mở ở tab Xuất kho
              </button>
            ) : viewing.nguon === "excel" ? (
              <>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = viewing;
                      setViewing(null);
                      remove(r);
                    }}
                    className={`${BTN_OUTLINE} !text-rose-600 mr-auto`}
                  >
                    <Trash2 size={13} /> Xoá
                  </button>
                )}
                {canEditRow && (
                  <button
                    type="button"
                    onClick={() => {
                      const r = viewing;
                      setViewing(null);
                      setEditing(r);
                    }}
                    className={BTN_PRIMARY}
                  >
                    <Pencil size={13} /> Sửa
                  </button>
                )}
              </>
            ) : null
          }
          onClose={() => setViewing(null)}
        />
      )}
      {editing && (
        <EditRowModal
          row={editing}
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

// ─── Sửa tay một dòng "Excel cũ" ───
// Không đổi Mã SP (trigger 121 khoá cột item_id): nhầm mã thì xoá dòng.
function toNum(v: string): number {
  return Number(v.replace(/[.\s]/g, "").replace(",", "."));
}

function EditRowModal({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [loai, setLoai] = useState<"nhap" | "xuat">(row.loai);
  const [ngay, setNgay] = useState(row.ngay);
  const [qty, setQty] = useState(String(row.qty));
  const [price, setPrice] = useState(row.unit_price == null ? "" : String(row.unit_price));
  const [doiTac, setDoiTac] = useState(row.doi_tac || "");
  const [chungTu, setChungTu] = useState(row.chung_tu || "");
  const [partners, setPartners] = useState<SharedPartner[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const savingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchSharedPartners().then((p) => alive && setPartners(p));
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    if (savingRef.current) return;
    const q = toNum(qty);
    const p = price.trim() === "" ? null : toNum(price);
    if (!ngay) return setErr("Chọn ngày.");
    if (!Number.isFinite(q) || q <= 0) return setErr("Số lượng phải lớn hơn 0.");
    if (p != null && (!Number.isFinite(p) || p < 0)) return setErr("Đơn giá không hợp lệ.");
    savingRef.current = true;
    setSaving(true);
    setErr("");
    const e = await updatePriceHistory(row.id, { loai, ngay, qty: q, unit_price: p, doi_tac: doiTac.trim() || null, chung_tu: chungTu.trim() || null });
    savingRef.current = false;
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  const inputCls =
    "w-full h-9 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 focus:bg-white focus:outline-none focus:border-[#00AEEF]";

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">
            Sửa dòng — {row.item?.code} {row.item?.name}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Loại</span>
            <select value={loai} onChange={(e) => setLoai(e.target.value as "nhap" | "xuat")} className={inputCls}>
              <option value="nhap">Nhập</option>
              <option value="xuat">Xuất</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Ngày</span>
            <input type="date" value={ngay} onChange={(e) => setNgay(e.target.value)} className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Số lượng ({row.item?.unit || "ĐVT"})</span>
            <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} tabular-nums`} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold text-slate-500">Đơn giá (đồng) — trống nếu chưa có</span>
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="VD: 228000" className={`${inputCls} tabular-nums`} />
          </label>
          <div className="space-y-1 col-span-2">
            <span className="text-[10px] font-bold text-slate-500">Khách hàng</span>
            <AtldPartnerPicker partners={partners} value={doiTac} onChange={setDoiTac} />
          </div>
          <label className="block space-y-1 col-span-2">
            <span className="text-[10px] font-bold text-slate-500">Báo giá / HĐ</span>
            <input value={chungTu} onChange={(e) => setChungTu(e.target.value)} className={inputCls} />
          </label>
        </div>
        {err && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
            Huỷ
          </button>
          <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
            {saving && <Loader2 size={13} className="animate-spin" />} Lưu
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Upload Excel: đưa dòng nhập – xuất lên (sheet Chi Tiet cũ HOẶC file "Tải về") ───
// Upload được NHIỀU LẦN. Dòng giống hệt một dòng đã có trong bảng (cùng loại, ngày,
// mã, số lượng, đơn giá, khách hàng) tự bỏ qua — so theo SỐ LẦN xuất hiện, nên hai
// dòng thật sự giống nhau trong cùng một file vẫn vào đủ khi bảng chưa có.
type ImportRow = TradeRow & { itemId: string | null; name: string; ok: boolean; dup: boolean; note: string };

const tradeKey = (loai: string, ngay: string, itemId: string, qty: number, price: number | null, doiTac: string | null) =>
  [loai, ngay, itemId, Number(qty), price == null ? "" : Number(price), fold(doiTac || "")].join("|");

function TradeHistoryImport({ items, existing, onDone }: { items: AtldItem[]; existing: TradePrice[]; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [meta, setMeta] = useState({ fileName: "", sheetName: "" });
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function readFile(file: File) {
    setErr(null);
    setReading(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheets = wb.SheetNames.map(
        (n) => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: null, raw: true })] as [string, unknown[][]]
      );
      const res = parseTradeSheets(sheets);
      if (!res) {
        setRows(null);
        setErr("Không thấy dòng nhập – xuất nào. Cần sheet có các cột “Ngày”, “Mã SP”, “Loại”, “Số Lượng”, “Đơn Giá” — như sheet “Chi Tiet” của file Excel cũ.");
        return;
      }
      const byCode = new Map(items.map((i) => [fold(i.code), i]));
      // Số lần mỗi "dòng giống hệt" đã có trong bảng (cả dòng Excel cũ lẫn dòng từ phiếu).
      const have = new Map<string, number>();
      for (const p of existing) {
        const k = tradeKey(p.loai, p.ngay, p.item_id, p.qty, p.unit_price, p.doi_tac);
        have.set(k, (have.get(k) || 0) + 1);
      }
      setMeta({ fileName: file.name, sheetName: res.sheetName });
      setRows(
        res.rows.map((r) => {
          const it = byCode.get(fold(r.code));
          const skip = !it ? "Mã chưa có trong Tổng kho — bỏ qua" : !r.ngay ? "Thiếu ngày — bỏ qua" : "";
          let dup = false;
          if (!skip && it && r.ngay) {
            const k = tradeKey(r.loai, r.ngay, it.id, r.qty, r.unitPrice, r.doiTac);
            const n = have.get(k) || 0;
            if (n > 0) {
              dup = true;
              have.set(k, n - 1);
            }
          }
          const warn = !skip && !dup && r.unitPrice == null ? "Excel bỏ trống đơn giá — vẫn đưa lên, giá để trống" : "";
          return {
            ...r,
            itemId: it?.id ?? null,
            name: it?.name ?? "",
            ok: !skip && !dup,
            dup,
            note: skip || (dup ? "Đã có trong bảng — bỏ qua" : warn),
          };
        })
      );
    } catch (e) {
      setRows(null);
      setErr(e instanceof Error ? `Không đọc được file: ${e.message}` : "Không đọc được file.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function commit() {
    if (!rows || savingRef.current) return;
    const ok = rows.filter((r) => r.ok);
    if (!ok.length) return setErr("Không có dòng mới để đưa lên.");
    savingRef.current = true;
    setSaving(true);
    setErr(null);
    const res = await insertPriceHistory(
      ok.map((r) => ({
        loai: r.loai,
        ngay: r.ngay as string,
        item_id: r.itemId as string,
        qty: r.qty,
        unit_price: r.unitPrice,
        doi_tac: r.doiTac || null,
        chung_tu: r.chungTu || null,
      }))
    );
    savingRef.current = false;
    setSaving(false);
    if (res.error) {
      setErr(res.error + (res.added ? ` (Đã đưa lên ${res.added} dòng trước khi lỗi.)` : ""));
      if (res.added) onDone();
      return;
    }
    setRows(null);
    onDone();
  }

  const okRows = (rows || []).filter((r) => r.ok);
  const nNhap = okRows.filter((r) => r.loai === "nhap").length;
  const nXuat = okRows.length - nNhap;
  const noPrice = okRows.filter((r) => r.unitPrice == null).length;
  const dupCount = (rows || []).filter((r) => r.dup).length;
  const skipCount = (rows || []).length - okRows.length - dupCount;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFile(f);
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={reading} className={BTN_SUCCESS}>
        {reading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Upload Excel
      </button>
      {!rows && err && (
        <div className="basis-full flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {rows &&
        createPortal(
          <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setRows(null)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
            >
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1 truncate">
                  Upload giá nhập – xuất từ “{meta.fileName}” — sheet {meta.sheetName}
                </h2>
                <button type="button" onClick={() => setRows(null)} disabled={saving} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
                  <X size={18} />
                </button>
              </div>

              <p className="text-[11px] text-slate-500">
                Lấy mọi dòng <b>Nhập</b> và <b>Xuất</b>: ngày, số lượng, đơn giá, khách hàng, chứng từ. Dòng <b>giống hệt</b> dòng đã có trong bảng tự bỏ
                qua — upload lại file cũ không bị trùng. Bảng này <b>chỉ để tra giá</b>, không cộng vào tồn kho.
              </p>

              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                  <CheckCircle2 size={12} /> {nNhap} dòng nhập
                </span>
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700">
                  <CheckCircle2 size={12} /> {nXuat} dòng xuất
                </span>
                {noPrice > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                    <AlertTriangle size={12} /> {noPrice} dòng Excel bỏ trống giá
                  </span>
                )}
                {dupCount > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                    <Ban size={12} /> {dupCount} dòng đã có — bỏ qua
                  </span>
                )}
                {skipCount > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600">
                    <Ban size={12} /> {skipCount} dòng lỗi — bỏ qua
                  </span>
                )}
              </div>

              <div className="overflow-auto border border-slate-100 rounded-xl flex-1 min-h-0">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0">
                    <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left whitespace-nowrap bg-slate-50">
                      <th className="py-2 px-2">Dòng</th>
                      <th className="py-2 px-2">Ngày</th>
                      <th className="py-2 px-2">Loại</th>
                      <th className="py-2 px-2">Mã SP</th>
                      <th className="py-2 px-2">Tên SP</th>
                      <th className="py-2 px-2 text-right">SL</th>
                      <th className="py-2 px-2 text-right">Đơn giá</th>
                      <th className="py-2 px-2">Khách hàng</th>
                      <th className="py-2 px-2">Báo giá / HĐ</th>
                      <th className="py-2 px-2">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line} className={`border-t border-slate-100 ${r.ok ? "" : "opacity-50"}`}>
                        <td className="py-1.5 px-2 text-slate-400">{r.line}</td>
                        <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap tabular-nums">{r.ngay ? fmtDate(r.ngay) : "—"}</td>
                        <td className="py-1.5 px-2"><LoaiBadge loai={r.loai} /></td>
                        <td className="py-1.5 px-2 font-mono font-bold text-[#005BAC] whitespace-nowrap">{r.code}</td>
                        <td className="py-1.5 px-2 font-semibold text-slate-700">{r.name || "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{formatQty(r.qty)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-bold">{r.unitPrice == null ? "—" : formatMoney(r.unitPrice)}</td>
                        <td className="py-1.5 px-2">{r.doiTac || "—"}</td>
                        <td className="py-1.5 px-2 text-slate-500">{r.chungTu || "—"}</td>
                        <td className={`py-1.5 px-2 ${r.ok ? "text-amber-700" : "text-slate-500"}`}>{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {err && (
                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRows(null)} disabled={saving} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
                  Huỷ
                </button>
                <button type="button" onClick={commit} disabled={saving || okRows.length === 0} className={BTN_PRIMARY}>
                  {saving && <Loader2 size={13} className="animate-spin" />} Đưa lên {okRows.length} dòng mới
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

"use client";

// ============================================================
// Kho BHLĐ > "Xuất kho cho BĐH/Đối tác" (user yêu cầu 02/10/2026: bỏ tab Đối tác,
// gom việc LẬP + DUYỆT phiếu xuất về một tab riêng).
//
// Mỗi phiếu một dòng: Số phiếu · Ngày · Khách hàng · BĐH · Người nhận · Nội dung (lý do) · Số SP ·
// Tổng tiền (giá bán + VAT + vận chuyển) · Trạng thái. Bấm dòng để xem các dòng hàng.
// Thao tác theo bước (hàm SQL atld_* là chốt chặn thật):
//   Thủ kho  : Tạo phiếu, Sửa / Gửi duyệt / Xoá phiếu Nháp – Bị trả lại.
//   TP/PP    : Duyệt (lúc này mới trừ kho -> cột Xuất SP Tổng kho) / Trả lại / Huỷ /
//              Xoá mọi trạng thái trừ Đã duyệt (cùng Admin, migration 128).
// Chuông + email: lib/atldVouchers.notifyIssue.
// ============================================================

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfirmBox } from "@/components/ConfirmDialog";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { type AtldItem, fetchItems, fetchTradePrices, matchesQuery, formatMoney, formatQty } from "@/lib/atldStock";
import { normalizeName } from "@/lib/approvers";
import {
  type IssueRow,
  type IssueStatus,
  type IssueEmailEvent,
  ISSUE_STATUS_META,
  fetchIssueRows,
  submitIssue,
  approveIssue,
  returnIssue,
  cancelIssue,
  deleteIssueDraft,
  deleteIssueAsApprover,
  removeIssueOriginalFile,
  notifyIssue,
  issuePrintData,
} from "@/lib/atldVouchers";
import AtldIssueModal from "@/components/atld/AtldIssueModal";
import AtldIssuePreview from "@/components/atld/AtldIssuePreview";
import AtldIssueOriginal from "@/components/atld/AtldIssueOriginal";
import ColorTag from "@/components/atld/ColorTag";
import { IconAct, ReasonModal } from "@/components/atld/AtldIssueActions";
import { BTN_PRIMARY, CONTROL_BOX } from "@/components/atld/ui";
import { Search, X, Loader2, AlertCircle, Truck, FilePlus2, Pencil, Send, Trash2, Check, Undo2, XCircle, Lock, ChevronDown, ChevronRight, Eye, Upload } from "lucide-react";

type StatusFilter = "all" | IssueStatus;

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

export default function AtldIssueTab({ canEdit, canApprove }: { canEdit: boolean; canApprove: boolean }) {
  const me = useCurrentUser();
  const [items, setItems] = useState<AtldItem[]>([]);
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [lastSalePrice, setLastSalePrice] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [issueModal, setIssueModal] = useState<{ id: string | null } | null>(null);
  const [reasonBox, setReasonBox] = useState<{ mode: "return" | "cancel"; row: IssueRow } | null>(null);
  const [previewRow, setPreviewRow] = useState<IssueRow | null>(null);
  const [originalRow, setOriginalRow] = useState<IssueRow | null>(null);
  const actingRef = useRef(false);
  const { ask, confirmNode } = useConfirmBox();

  const load = useCallback(async () => {
    const [it, iss, tp] = await Promise.all([fetchItems(), fetchIssueRows(), fetchTradePrices()]);
    setItems(it.items);
    setRows(iss.rows);
    // Giá xuất gần nhất ĐÃ CHỐT (Excel cũ / phiếu đã duyệt) — gợi ý ô đơn giá khi lập phiếu.
    const m = new Map<string, { ngay: string; price: number }>();
    for (const p of tp.rows) {
      if (p.loai !== "xuat" || p.unit_price == null || !(p.nguon === "excel" || p.status === "posted")) continue;
      const cur = m.get(p.item_id);
      if (!cur || p.ngay >= cur.ngay) m.set(p.item_id, { ngay: p.ngay, price: p.unit_price });
    }
    setLastSalePrice(new Map([...m.entries()].map(([k, v]) => [k, v.price])));
    setError(it.error || iss.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const base = useMemo(
    () =>
      rows.filter((r) => {
        if (from && r.ngay < from) return false;
        if (to && r.ngay > to) return false;
        if (!query.trim()) return true;
        const codes = r.lines.map((l) => byId.get(l.item_id)?.code || "").join(" ");
        return matchesQuery(
          normalizeName(`${r.so_phieu} ${r.contractor_name || ""} ${r.bdh_name || ""} ${r.nguoi_nhan || ""} ${r.ly_do || ""} ${r.chung_tu || ""} ${codes}`),
          query
        );
      }),
    [rows, from, to, query, byId]
  );
  const filtered = useMemo(() => base.filter((r) => status === "all" || r.status === status), [base, status]);

  const count = (s: IssueStatus) => base.filter((r) => r.status === s).length;
  const FILTERS: { key: StatusFilter; label: string; count: number }[] = [
    { key: "all", label: "Tất cả", count: base.length },
    { key: "pending", label: "Chờ duyệt", count: count("pending") },
    { key: "draft", label: "Nháp", count: count("draft") },
    { key: "returned", label: "Bị trả lại", count: count("returned") },
    { key: "posted", label: "Đã duyệt", count: count("posted") },
    { key: "cancelled", label: "Đã huỷ", count: count("cancelled") },
  ];
  const tongDaDuyet = base.filter((r) => r.status === "posted").reduce((s, r) => s + r.tongCong, 0);
  const filtering = !!(query || from || to || status !== "all");

  // ─── Thao tác ───
  const info = (r: IssueRow) => ({
    soPhieu: r.so_phieu,
    ngay: r.ngay,
    khachHang: r.contractor_name || "",
    bdh: r.bdh_name || "",
    nguoiNhan: r.nguoi_nhan || "",
    tongTien: r.tongCong,
    soDong: r.lines.length,
    creatorEmail: r.created_by,
    actorName: me.name || me.email,
  });

  const act = async (r: IssueRow, run: () => Promise<string | null>, event?: IssueEmailEvent, lyDo?: string) => {
    if (actingRef.current) return;
    actingRef.current = true;
    setRowErr(null);
    const e = await run();
    actingRef.current = false;
    if (e) return setRowErr(e);
    if (event) notifyIssue(event, { ...info(r), lyDo });
    load();
  };

  const askApprove = (r: IssueRow) =>
    ask({
      title: `Duyệt phiếu ${r.so_phieu}?`,
      message: "Duyệt xong kho bị trừ ngay theo số lượng trên phiếu (lô nhập trước xuất trước) và hiện ở cột Xuất SP của Tổng Danh mục kho ATLĐ.",
      confirmLabel: "Duyệt",
      tone: "normal",
      onConfirm: () => act(r, () => approveIssue(r.id), "duyet"),
    });

  // Thủ kho xoá Nháp / Bị trả lại qua RLS; Admin + cờ Duyệt xuất xoá mọi trạng
  // thái trừ Đã duyệt qua hàm atld_delete_issue (128). Tệp chứng từ gốc xoá SAU
  // khi CSDL đã xoá xong phiếu.
  const askDelete = (r: IssueRow, asApprover: boolean) =>
    ask({
      title: `Xoá phiếu ${r.so_phieu}?`,
      message:
        r.status === "cancelled"
          ? "Phiếu đã huỷ — kho đã được cộng lại từ lúc huỷ nên xoá không làm đổi tồn. Xoá hẳn phiếu (mọi dòng hàng, chứng từ gốc), không hoàn tác được."
          : "Phiếu chưa được duyệt nên chưa đụng tồn kho. Xoá cả phiếu (mọi dòng hàng, chứng từ gốc), không hoàn tác được.",
      onConfirm: () =>
        act(r, async () => {
          const e = asApprover ? await deleteIssueAsApprover(r.id) : await deleteIssueDraft(r.id);
          if (!e && r.goc_file_path) await removeIssueOriginalFile(r.goc_file_path);
          return e;
        }),
    });

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      {/* ── Hàng 1: tìm + tạo phiếu ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`${CONTROL_BOX} gap-2 px-3 flex-1 min-w-[240px] focus-within:border-[#00AEEF]`}>
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm số phiếu, khách hàng, BĐH, người nhận, mã SP…"
            className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Xoá ô tìm">
              <X size={13} />
            </button>
          )}
        </div>
        {canEdit && items.length > 0 && (
          <button type="button" onClick={() => setIssueModal({ id: null })} className={BTN_PRIMARY}>
            <FilePlus2 size={14} /> Tạo phiếu xuất kho
          </button>
        )}
      </div>

      {/* ── Hàng 2: trạng thái + ngày ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[11px] font-bold text-slate-500">Trạng thái</span>
        <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl" role="tablist" aria-label="Lọc theo trạng thái">
          {FILTERS.map((f) => {
            const active = status === f.key;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(f.key)}
                className={`h-7 inline-flex items-center gap-1.5 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  active ? "bg-[#005BAC] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                {f.label}
                <span className={`tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{f.count}</span>
              </button>
            );
          })}
        </div>
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
              setStatus("all");
              setFrom("");
              setTo("");
            }}
            className="h-9 text-[11px] font-bold text-[#005BAC] hover:underline cursor-pointer"
          >
            Bỏ lọc
          </button>
        )}
        <span className="ml-auto text-[11px] text-slate-400">
          <b className="text-slate-600">{filtered.length}</b> phiếu · đã duyệt <b className="text-slate-600">{formatMoney(tongDaDuyet)}</b> đ
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
          <Truck size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">{rows.length === 0 ? "Chưa có phiếu xuất kho nào" : "Không có phiếu nào khớp"}</p>
          <p className="text-xs text-slate-400 mt-1">
            {rows.length === 0 ? (canEdit ? "Bấm \"Tạo phiếu xuất kho\" để lập phiếu đầu tiên." : "Thủ kho ATLĐ chưa lập phiếu xuất nào.") : "Thử bỏ bớt bộ lọc."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[1200px]">
            <thead>
              <tr className="bg-gradient-to-r from-[#005BAC] to-blue-500 text-[10px] font-extrabold uppercase tracking-wider text-white text-left whitespace-nowrap">
                <th className="px-3 py-3 w-8" />
                <th className="px-3 py-3">Số phiếu</th>
                <th className="px-3 py-3">Ngày xuất</th>
                <th className="px-3 py-3">Khách hàng</th>
                <th className="px-3 py-3">BĐH</th>
                <th className="px-3 py-3">Người nhận</th>
                <th className="px-3 py-3">Nội dung</th>
                <th className="px-3 py-3 text-right">Số SP</th>
                <th className="px-3 py-3 text-right">Tổng tiền</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Người lập</th>
                <th className="px-3 py-3 w-44" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const open = expanded.has(r.id);
                const meta = ISSUE_STATUS_META[r.status];
                const canKeeper = canEdit && (r.status === "draft" || r.status === "returned");
                const canApprover = canApprove;
                const reason = r.status === "returned" ? r.return_reason : r.status === "cancelled" ? r.cancel_reason : null;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer" onClick={() => toggle(r.id)}>
                      <td className="px-3 py-2.5 text-slate-400">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-[#005BAC] whitespace-nowrap">{r.so_phieu}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap tabular-nums">{fmtDate(r.ngay)}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-700 min-w-[180px]">{r.contractor_name || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.bdh_name || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600 min-w-[140px]">{r.nguoi_nhan || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600 min-w-[200px] max-w-[280px]">
                        <span className="line-clamp-2" title={r.ly_do || undefined}>{r.ly_do || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700 whitespace-nowrap">
                        {formatQty(r.tongSL)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-extrabold text-slate-800 whitespace-nowrap">
                        {formatMoney(r.tongCong)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                        {reason && (
                          <span className="block max-w-[200px] truncate text-[10px] text-slate-400 mt-0.5" title={reason}>
                            {reason}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.created_by_name || r.created_by || "—"}</td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <IconAct title="Xem trước phiếu" onClick={() => setPreviewRow(r)}><Eye size={13} /></IconAct>
                          {(canEdit || canApprove || r.goc_file_path || r.goc_link) && (
                            <IconAct
                              title={r.goc_file_path || r.goc_link ? "Chứng từ gốc (đã có)" : "Tải lên chứng từ gốc"}
                              tone={r.goc_file_path || r.goc_link ? "ok" : undefined}
                              onClick={() => setOriginalRow(r)}
                            >
                              <Upload size={13} />
                            </IconAct>
                          )}
                          {canKeeper && (
                            <>
                              <IconAct title="Sửa phiếu" onClick={() => setIssueModal({ id: r.id })}><Pencil size={13} /></IconAct>
                              <IconAct title="Gửi duyệt" onClick={() => act(r, () => submitIssue(r.id), "trinh")}><Send size={13} /></IconAct>
                              <IconAct title="Xoá phiếu" danger onClick={() => askDelete(r, false)}><Trash2 size={13} /></IconAct>
                            </>
                          )}
                          {canApprove && r.status === "pending" && (
                            <>
                              <IconAct title="Duyệt (trừ kho)" tone="ok" onClick={() => askApprove(r)}><Check size={14} /></IconAct>
                              <IconAct title="Trả lại" danger onClick={() => setReasonBox({ mode: "return", row: r })}><Undo2 size={13} /></IconAct>
                            </>
                          )}
                          {canApprove && r.status === "posted" && (
                            <IconAct title="Huỷ phiếu (cộng lại kho)" danger onClick={() => setReasonBox({ mode: "cancel", row: r })}><XCircle size={13} /></IconAct>
                          )}
                          {canApprove && r.status !== "posted" && !canKeeper && (
                            <IconAct title="Xoá phiếu" danger onClick={() => askDelete(r, true)}><Trash2 size={13} /></IconAct>
                          )}
                          {!canKeeper && !canApprover && (
                            <span className="text-slate-300" title="Không có thao tác cho bạn ở bước này"><Lock size={13} /></span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/60 border-b border-slate-100">
                        <td />
                        <td colSpan={11} className="px-3 py-3">
                          {(r.dia_chi || r.chung_tu) && (
                            <p className="text-[11px] text-slate-500 mb-2">
                              {[r.dia_chi && `Địa chỉ: ${r.dia_chi}`, r.chung_tu && `Báo giá/HĐ: ${r.chung_tu}`].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left">
                                <th className="py-1 pr-3">Mã SP</th>
                                <th className="py-1 pr-3">Tên SP</th>
                                <th className="py-1 pr-3">Size</th>
                                <th className="py-1 pr-3">Màu</th>
                                <th className="py-1 pr-3">ĐVT</th>
                                <th className="py-1 pr-3 text-right">Số lượng</th>
                                <th className="py-1 pr-3 text-right">Đơn giá bán</th>
                                <th className="py-1 pr-3 text-right">Thành tiền</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.lines.map((l) => {
                                const it = byId.get(l.item_id);
                                const price = l.sale_price ?? l.cost;
                                return (
                                  <tr key={l.id} className="border-t border-slate-100">
                                    <td className="py-1.5 pr-3 font-mono font-bold text-[#005BAC]">{it?.code || "—"}</td>
                                    <td className="py-1.5 pr-3 font-semibold text-slate-700">{it?.name || "(mã đã xoá)"}</td>
                                    <td className="py-1.5 pr-3 text-slate-600">{it?.size || "—"}</td>
                                    <td className="py-1.5 pr-3"><ColorTag color={it?.color} /></td>
                                    <td className="py-1.5 pr-3 text-slate-500">{it?.unit || "—"}</td>
                                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{formatQty(l.qty)}</td>
                                    <td className="py-1.5 pr-3 text-right tabular-nums">{price == null ? "—" : formatMoney(price)}</td>
                                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold">{price == null ? "—" : formatMoney(l.qty * price)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {issueModal && (
        <AtldIssueModal
          items={items}
          lastSalePrice={lastSalePrice}
          voucherId={issueModal.id}
          actorName={me.name || me.email}
          onClose={() => setIssueModal(null)}
          onSaved={() => {
            setIssueModal(null);
            load();
          }}
        />
      )}
      {previewRow && <AtldIssuePreview data={issuePrintData(previewRow, byId)} status={previewRow.status} onClose={() => setPreviewRow(null)} />}
      {originalRow && (
        <AtldIssueOriginal row={originalRow} canManage={canEdit || canApprove} onClose={() => setOriginalRow(null)} onSaved={load} />
      )}
      {reasonBox && (
        <ReasonModal
          title={reasonBox.mode === "return" ? `Trả lại phiếu ${reasonBox.row.so_phieu}` : `Huỷ phiếu ${reasonBox.row.so_phieu}`}
          hint={reasonBox.mode === "return" ? "Thủ kho sẽ sửa rồi gửi duyệt lại. Kho chưa bị trừ." : "Kho được cộng lại đúng số đã xuất (sinh dòng đảo trong sổ kho)."}
          confirmLabel={reasonBox.mode === "return" ? "Trả lại" : "Huỷ phiếu"}
          onClose={() => setReasonBox(null)}
          onConfirm={async (reason) => {
            const r = reasonBox.row;
            const mode = reasonBox.mode;
            setReasonBox(null);
            await act(r, () => (mode === "return" ? returnIssue(r.id, reason) : cancelIssue(r.id, reason)), mode === "return" ? "tra_lai" : "huy", reason);
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}

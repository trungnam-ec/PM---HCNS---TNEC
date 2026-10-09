"use client";

// ============================================================
// Kho BHLĐ > Giá nhập kho > "Tạo phiếu xuất kho" (+ sửa phiếu Nháp / Bị trả lại)
//
// Thông tin phiếu: Ngày · Khách hàng (Danh mục đối tác chung — gõ tên ngoài danh
// mục vẫn được) · BĐH · Người nhận · Địa chỉ · Lý do · Báo giá/HĐ · VAT % · Phí vận
// chuyển. Nhiều dòng hàng: ô chọn Mã SP (AtldItemPicker — gõ mã / tên / size, có
// tồn từng mã), hiện TỒN HIỆN TẠI, cảnh báo đỏ khi xuất vượt tồn.
// Đơn giá = GIÁ BÁN (gợi ý sẵn giá xuất gần nhất của mã). Kho CHỈ bị trừ khi TP/PP
// duyệt — "Lưu nháp" và "Gửi duyệt" đều chưa đụng tồn.
//
// approverEdit (migration 145): TP/PP có cờ Duyệt xuất + Admin sửa nội dung ghi nhầm
// ở mọi trạng thái trừ Đã huỷ — thông tin phiếu + đơn giá bán. Ngày, mã SP, số
// lượng khoá (gắn với sổ kho): muốn đổi thì Huỷ phiếu rồi lập lại.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDepartments } from "@/lib/departments";
import { type AtldItem, fetchStock, formatMoney, formatQty } from "@/lib/atldStock";
import { fold } from "@/lib/atldItemImport";
import {
  type IssueInput,
  type IssueVoucher,
  type SharedPartner,
  fetchIssueVoucher,
  fetchSharedPartners,
  saveIssueVoucher,
  editIssueAsApprover,
  submitIssue,
  notifyIssue,
} from "@/lib/atldVouchers";
import { BTN_OUTLINE, BTN_PRIMARY } from "@/components/atld/ui";
import AtldPartnerPicker from "@/components/atld/AtldPartnerPicker";
import AtldItemPicker from "@/components/atld/AtldItemPicker";
import AtldPersonPicker from "@/components/atld/AtldPersonPicker";
import { X, Plus, Trash2, Loader2, AlertCircle, AlertTriangle, Send, Save } from "lucide-react";

type LineDraft = { key: number; code: string; qty: string; price: string; lineNo?: number };

const todayVN = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const toNum = (v: string) => Number(String(v).replace(/[.\s]/g, "").replace(",", "."));

export default function AtldIssueModal({
  items,
  lastSalePrice,
  voucherId,
  actorName,
  approverEdit = false,
  onClose,
  onSaved,
}: {
  items: AtldItem[];
  lastSalePrice: Map<string, number>; // item_id -> đơn giá tự điền (Giá bán của mã > giá xuất > giá nhập gần nhất)
  voucherId: string | null;           // null = tạo mới
  actorName: string;
  approverEdit?: boolean;             // người duyệt sửa nội dung (145)
  onClose: () => void;
  onSaved: () => void;
}) {
  const deps = useDepartments();
  const [loading, setLoading] = useState(!!voucherId);
  const [orig, setOrig] = useState<IssueVoucher | null>(null);
  const [partners, setPartners] = useState<SharedPartner[]>([]);
  const [stock, setStock] = useState<Map<string, number>>(new Map());
  const [ngay, setNgay] = useState(todayVN());
  const [khach, setKhach] = useState("");
  const [bdh, setBdh] = useState("");
  const [nguoiNhan, setNguoiNhan] = useState("");
  const [diaChi, setDiaChi] = useState("");
  const [lyDo, setLyDo] = useState("");
  const [chungTu, setChungTu] = useState("");
  const [vat, setVat] = useState("0");
  const [ship, setShip] = useState("0");
  const [ghiChu, setGhiChu] = useState("");
  const [nguoiLap, setNguoiLap] = useState(""); // chỉ sửa ở chế độ approverEdit (146)
  const [lines, setLines] = useState<LineDraft[]>([{ key: 1, code: "", qty: "", price: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const busyRef = useRef(false);
  const nextKey = useRef(2);

  const activeItems = useMemo(() => items.filter((i) => i.active), [items]);
  const byCode = useMemo(() => new Map(items.map((i) => [fold(i.code), i])), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, st] = await Promise.all([fetchSharedPartners(), fetchStock()]);
      if (!alive) return;
      setPartners(p);
      setStock(new Map([...st.entries()].map(([k, v]) => [k, v.ton])));
      if (voucherId) {
        const { voucher, error } = await fetchIssueVoucher(voucherId);
        if (!alive) return;
        if (error || !voucher) {
          setErr(error || "Không mở được phiếu.");
        } else {
          setOrig(voucher);
          setNgay(voucher.ngay);
          setKhach(voucher.contractor_name);
          setBdh(voucher.bdh_name);
          setNguoiNhan(voucher.nguoi_nhan);
          setDiaChi(voucher.dia_chi);
          setLyDo(voucher.ly_do);
          setChungTu(voucher.chung_tu);
          setVat(String(voucher.vat_percent || 0));
          setShip(String(voucher.phi_van_chuyen || 0));
          setGhiChu(voucher.ghi_chu);
          setNguoiLap(voucher.created_by_name);
          setLines(
            voucher.lines.map((l, i) => ({
              key: i + 1,
              code: byId.get(l.item_id)?.code || "",
              qty: String(l.qty),
              price: l.sale_price == null ? "" : String(l.sale_price),
              lineNo: l.line_no,
            }))
          );
          nextKey.current = voucher.lines.length + 1;
        }
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [voucherId, byId]);

  // Dòng đã quy ra mã hàng thật + số tiền.
  const resolved = lines.map((l) => {
    const item = byCode.get(fold(l.code.trim())) || null;
    const qty = toNum(l.qty);
    const price = l.price.trim() === "" ? null : toNum(l.price);
    const ton = item ? stock.get(item.id) ?? 0 : 0;
    return { ...l, item, qty, price, ton };
  });
  // Cùng một mã xuất ở nhiều dòng -> cộng lại mới so với tồn.
  const needByItem = new Map<string, number>();
  resolved.forEach((r) => r.item && Number.isFinite(r.qty) && needByItem.set(r.item.id, (needByItem.get(r.item.id) || 0) + r.qty));

  const tienHang = resolved.reduce((s, r) => s + (Number.isFinite(r.qty) && r.price != null && Number.isFinite(r.price) ? r.qty * r.price : 0), 0);
  const vatNum = Math.max(0, toNum(vat) || 0);
  const shipNum = Math.max(0, toNum(ship) || 0);
  const tienVat = Math.round((tienHang * vatNum) / 100);
  const tongCong = tienHang + tienVat + shipNum;

  const setLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Chọn mã -> tự điền đơn giá của mã đó (user yêu cầu 09/10/2026), vẫn sửa tay
        // được. Đổi sang mã KHÁC thì giá đổi theo; mã chưa có giá thì để trống.
        if (patch.code !== undefined) {
          const it = byCode.get(fold(patch.code.trim()));
          const prev = byCode.get(fold(l.code.trim()));
          if (it && it.id !== prev?.id) {
            const p = lastSalePrice.get(it.id);
            next.price = p != null ? String(p) : "";
          }
        }
        return next;
      })
    );

  function buildInput(): IssueInput | string {
    if (!ngay) return "Chọn ngày xuất.";
    const used = resolved.filter((r) => r.code.trim() || r.qty || r.price);
    if (!used.length) return "Thêm ít nhất một dòng hàng.";
    for (const r of used) {
      if (!r.item) return `Không tìm thấy mã "${r.code}" trong Tổng kho — chọn từ danh sách gợi ý.`;
      if (!Number.isFinite(r.qty) || r.qty <= 0) return `Mã ${r.item.code}: số lượng phải lớn hơn 0.`;
      if (r.price != null && (!Number.isFinite(r.price) || r.price < 0)) return `Mã ${r.item.code}: đơn giá không hợp lệ.`;
    }
    const partner = partners.find((p) => fold(p.name) === fold(khach.trim()));
    return {
      ngay,
      contractor_id: partner?.id || null,
      contractor_name: khach,
      bdh_name: bdh,
      nguoi_nhan: nguoiNhan,
      dia_chi: diaChi,
      ly_do: lyDo,
      chung_tu: chungTu,
      vat_percent: vatNum,
      phi_van_chuyen: shipNum,
      ghi_chu: ghiChu,
      lines: used.map((r) => ({ item_id: (r.item as AtldItem).id, qty: r.qty, sale_price: r.price, line_no: r.lineNo })),
    };
  }

  async function save(andSubmit: boolean) {
    if (busyRef.current) return;
    const input = buildInput();
    if (typeof input === "string") return setErr(input);
    if (andSubmit && !khach.trim() && !bdh.trim() && !nguoiNhan.trim()) return setErr("Ghi Khách hàng, BĐH hoặc Người nhận trước khi gửi duyệt.");
    busyRef.current = true;
    setBusy(true);
    setErr("");
    if (approverEdit && voucherId) {
      const e = await editIssueAsApprover(voucherId, input, nguoiLap);
      busyRef.current = false;
      setBusy(false);
      if (e) return setErr(e);
      return onSaved();
    }
    const { id, error } = await saveIssueVoucher(input, voucherId || undefined);
    if (error || !id) {
      busyRef.current = false;
      setBusy(false);
      return setErr(error || "Không lưu được phiếu.");
    }
    if (andSubmit) {
      const e = await submitIssue(id);
      if (e) {
        busyRef.current = false;
        setBusy(false);
        onSaved(); // phiếu đã lưu nháp — danh sách phải thấy nó
        return setErr(`Đã lưu nháp nhưng chưa gửi duyệt được: ${e}`);
      }
      const { voucher } = await fetchIssueVoucher(id);
      notifyIssue("trinh", {
        soPhieu: voucher?.so_phieu || "",
        ngay,
        khachHang: khach,
        bdh,
        nguoiNhan,
        tongTien: tongCong,
        soDong: input.lines.length,
        creatorEmail: null,
        actorName,
      });
    }
    busyRef.current = false;
    setBusy(false);
    onSaved();
  }

  const inputCls =
    "w-full h-9 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 focus:bg-white focus:outline-none focus:border-[#00AEEF]";
  const label = "text-[10px] font-bold text-slate-500";

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
        }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[94vh] flex flex-col"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">
            {approverEdit
              ? `Sửa nội dung phiếu ${orig?.so_phieu || ""}`
              : voucherId ? `Sửa phiếu xuất kho ${orig?.so_phieu || ""}` : "Tạo phiếu xuất kho"}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-[#005BAC]" size={26} />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1">
            {orig?.status === "returned" && orig.return_reason && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold px-4 py-2.5 rounded-xl">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Bị trả lại: {orig.return_reason}
              </div>
            )}

            {/* ── Thông tin phiếu ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className={label}>Ngày xuất *</span>
                <input
                  type="date"
                  value={ngay}
                  onChange={(e) => setNgay(e.target.value)}
                  disabled={approverEdit}
                  title={approverEdit ? "Ngày nằm trong số phiếu và sổ kho — muốn đổi thì Huỷ phiếu rồi lập lại" : undefined}
                  className={`${inputCls} disabled:opacity-60`}
                />
              </label>
              <div className="space-y-1 col-span-2 lg:col-span-3">
                <span className={label}>Khách hàng</span>
                <AtldPartnerPicker partners={partners} value={khach} onChange={setKhach} />
              </div>
              <label className="block space-y-1">
                <span className={label}>Ban điều hành</span>
                <select value={bdh} onChange={(e) => setBdh(e.target.value)} className={inputCls}>
                  <option value="">— Không —</option>
                  {deps.bdh.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                  {bdh && !deps.bdh.includes(bdh) && <option value={bdh}>{bdh}</option>}
                </select>
              </label>
              <div className="space-y-1">
                <span className={label}>Người nhận</span>
                <AtldPersonPicker bdh={bdh} value={nguoiNhan} onChange={setNguoiNhan} />
              </div>
              <label className="block space-y-1 col-span-2">
                <span className={label}>Địa chỉ</span>
                <input value={diaChi} onChange={(e) => setDiaChi(e.target.value)} className={inputCls} />
              </label>
              <label className="block space-y-1 col-span-2">
                <span className={label}>Lý do / nội dung xuất</span>
                <input value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="VD: Cấp phát BHLĐ cho NTP" className={inputCls} />
              </label>
              <label className="block space-y-1 col-span-2">
                <span className={label}>Báo giá / HĐ</span>
                <input value={chungTu} onChange={(e) => setChungTu(e.target.value)} className={inputCls} />
              </label>
              {approverEdit && (
                <div className="space-y-1 col-span-2">
                  <span className={label}>Người lập</span>
                  <AtldPersonPicker bdh="" value={nguoiLap} onChange={setNguoiLap} allowFree={false} />
                </div>
              )}
            </div>

            {/* ── Dòng hàng ── */}
            <div className="border border-slate-100 rounded-xl overflow-x-auto">
              <table className="w-full text-[11px] min-w-[860px]">
                <thead>
                  <tr className="bg-gradient-to-r from-[#005BAC] to-blue-500 text-[10px] font-extrabold uppercase tracking-wider text-white text-left whitespace-nowrap">
                    <th className="py-2 px-2 w-8">#</th>
                    <th className="py-2 px-2 w-44">Mã SP</th>
                    <th className="py-2 px-2">Tên SP · Size · ĐVT</th>
                    <th className="py-2 px-2 text-right w-20">Tồn hiện tại</th>
                    <th className="py-2 px-2 text-right w-24">Số lượng</th>
                    <th className="py-2 px-2 text-right w-32">Đơn giá bán</th>
                    <th className="py-2 px-2 text-right w-32">Thành tiền</th>
                    <th className="py-2 px-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {resolved.map((r, i) => {
                    const over = r.item ? (needByItem.get(r.item.id) || 0) > r.ton : false;
                    return (
                      <tr key={r.key} className="border-t border-slate-100 align-middle">
                        <td className="py-1.5 px-2 text-slate-400">{i + 1}</td>
                        <td className="py-1.5 px-2">
                          {approverEdit ? (
                            <span className="font-bold text-[#005BAC]">{r.code}</span>
                          ) : (
                            <AtldItemPicker items={activeItems} stock={stock} value={r.code} onChange={(code) => setLine(r.key, { code })} />
                          )}
                        </td>
                        <td className="py-1.5 px-2 font-semibold text-slate-700">
                          {r.item ? (
                            <>
                              {r.item.name}
                              <span className="text-slate-400 font-medium">
                                {r.item.size ? ` · ${r.item.size}` : ""}
                                {r.item.color ? ` · ${r.item.color}` : ""}
                                {r.item.unit ? ` · ${r.item.unit}` : ""}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${over ? "text-rose-600" : "text-slate-600"}`}>
                          {r.item ? formatQty(r.ton) : "—"}
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            inputMode="decimal"
                            value={lines[i].qty}
                            onChange={(e) => setLine(r.key, { qty: e.target.value })}
                            disabled={approverEdit}
                            className={`${inputCls} text-right tabular-nums disabled:opacity-60 ${over && !approverEdit ? "border-rose-300" : ""}`}
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            inputMode="numeric"
                            value={lines[i].price}
                            onChange={(e) => setLine(r.key, { price: e.target.value })}
                            placeholder="Giá bán"
                            className={`${inputCls} text-right tabular-nums`}
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-slate-700">
                          {Number.isFinite(r.qty) && r.price != null && Number.isFinite(r.price) && r.qty > 0 ? formatMoney(r.qty * r.price) : "—"}
                        </td>
                        <td className="py-1.5 px-2">
                          {!approverEdit && <button
                            type="button"
                            onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== r.key) : ls))}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            aria-label="Xoá dòng"
                          >
                            <Trash2 size={13} />
                          </button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!approverEdit && <div className="px-2 py-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLines((ls) => [...ls, { key: nextKey.current++, code: "", qty: "", price: "" }])}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#005BAC] hover:underline cursor-pointer"
                >
                  <Plus size={13} /> Thêm dòng hàng
                </button>
              </div>}
            </div>

            {!approverEdit && [...needByItem.entries()].some(([id, q]) => q > (stock.get(id) ?? 0)) && (
              <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-600">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Có mã xuất vượt tồn hiện tại (số đỏ) — lưu nháp được nhưng sẽ không gửi duyệt được.
              </p>
            )}

            {/* ── VAT, vận chuyển, tổng ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              <div className="grid grid-cols-2 gap-3 content-start">
                <label className="block space-y-1">
                  <span className={label}>Thuế GTGT (VAT) %</span>
                  <input inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} className={`${inputCls} tabular-nums`} />
                </label>
                <label className="block space-y-1">
                  <span className={label}>Chi phí vận chuyển (đồng)</span>
                  <input inputMode="numeric" value={ship} onChange={(e) => setShip(e.target.value)} className={`${inputCls} tabular-nums`} />
                </label>
                <label className="block space-y-1 col-span-2">
                  <span className={label}>Ghi chú</span>
                  <input value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} className={inputCls} />
                </label>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-1.5 text-xs">
                <Sum label="Tổng (chưa VAT)" value={tienHang} />
                <Sum label={`Thuế GTGT ${vatNum ? `${vatNum}%` : ""}`} value={tienVat} />
                <Sum label="Vận chuyển" value={shipNum} />
                <div className="border-t border-slate-200 pt-1.5">
                  <Sum label="TỔNG CỘNG" value={tongCong} strong />
                </div>
              </div>
            </div>
          </div>
        )}

        {err && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[11px] text-slate-400">
            {approverEdit
              ? "Ngày, mã SP, số lượng không đổi được — muốn đổi thì Huỷ phiếu rồi lập lại."
              : "Kho chỉ bị trừ khi TP/PP ATLĐ duyệt phiếu."}
          </span>
          <button type="button" onClick={onClose} disabled={busy} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
            Huỷ
          </button>
          {approverEdit ? (
            <button type="button" onClick={() => save(false)} disabled={busy || loading} className={BTN_PRIMARY}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Lưu thay đổi
            </button>
          ) : (
            <>
              <button type="button" onClick={() => save(false)} disabled={busy || loading} className={BTN_OUTLINE}>
                <Save size={14} /> Lưu nháp
              </button>
              <button type="button" onClick={() => save(true)} disabled={busy || loading} className={BTN_PRIMARY}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Lưu &amp; gửi duyệt
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Sum({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-extrabold text-slate-800" : "font-semibold text-slate-500"}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-extrabold text-[#005BAC] text-sm" : "font-bold text-slate-700"}`}>{formatMoney(value)} đ</span>
    </div>
  );
}

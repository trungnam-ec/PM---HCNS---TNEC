"use client";

// ============================================================
// Kho BHLĐ > Tổng kho ATLĐ > "Tồn đầu kỳ từ Excel"
//
// Đọc sheet "Chi Tiet" của file Excel cũ, TÍNH tồn từng mã = Σ Nhập − Σ Xuất
// (đúng công thức Excel đang dùng — user chốt 02/10/2026), rồi tạo MỘT phiếu nhập
// "Tồn đầu kỳ" đã ghi sổ tại ngày chốt. Từ đó mọi phiếu nhập/xuất mới tự cấn trừ
// qua sổ kho; tồn cuối tháng chốt = tồn đầu tháng sau (migration 119).
//   • Đơn giá = giá NHẬP gần nhất của mã trong Chi Tiet (không cộng VAT).
//   • Tồn âm (lỗi nhập liệu Excel) -> 0, liệt kê để kiểm kê lại.
//   • Chỉ cho tạo MỘT lần: đã có phiếu đánh dấu OPENING_MARK đã ghi sổ thì chặn.
// Ghi bằng đúng các bước của phiếu nhập thường (RLS + hàm atld_post_receipt),
// không có đường tắt nào vào sổ kho.
// ============================================================

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { atldErrorMessage, formatMoney, formatQty, type AtldItem } from "@/lib/atldStock";
import { parseLedgerSheets, buildOpeningRows, OPENING_MARK, type OpeningRow, type OpeningKind } from "@/lib/atldItemImport";
import { BTN_OUTLINE_SUCCESS } from "@/components/atld/ui";
import { FileSpreadsheet, CheckCircle2, AlertTriangle, Ban, Loader2, X, AlertCircle, MinusCircle } from "lucide-react";

const KIND_NOTE: Record<OpeningKind, string> = {
  ok: "",
  zero: "Tồn = 0 — không đưa vào phiếu",
  negative: "Tồn âm trong Excel — đưa vào 0, cần kiểm kê lại",
  no_item: "Mã chưa có trong Tổng kho — bỏ qua",
  no_price: "Không có giá nhập trong Chi Tiet — bỏ qua",
};

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AtldOpeningImport({ items, onDone }: { items: AtldItem[]; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<OpeningRow[] | null>(null);
  const [meta, setMeta] = useState({ fileName: "", sheetName: "" });
  const [ngay, setNgay] = useState("2026-09-30");
  const [existing, setExisting] = useState<{ so_phieu: string; ngay: string } | null>(null);
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
      const res = parseLedgerSheets(sheets);
      if (!res) {
        setRows(null);
        setErr("Không thấy sheet chi tiết nhập – xuất. Cần các cột “Mã SP”, “Loại” (Nhập/Xuất), “Số Lượng” — như sheet “Chi Tiet” của file Excel cũ.");
        return;
      }
      // Chặn tạo lần hai: phiếu tồn đầu kỳ đã ghi sổ thì chỉ cho xem.
      const { data: prev } = await supabase
        .from("atld_vouchers")
        .select("so_phieu, ngay")
        .eq("ly_do", OPENING_MARK)
        .eq("status", "posted")
        .limit(1);
      setExisting(prev && prev.length ? (prev[0] as { so_phieu: string; ngay: string }) : null);
      if (res.lastDate) setNgay(toInputDate(res.lastDate));
      setMeta({ fileName: file.name, sheetName: res.sheetName });
      setRows(buildOpeningRows(res.aggs, items));
    } catch (e) {
      setRows(null);
      setErr(e instanceof Error ? `Không đọc được file: ${e.message}` : "Không đọc được file.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function commit() {
    if (!rows || savingRef.current || existing) return;
    const lines = rows.filter((r) => r.kind === "ok" && r.itemId && r.qty > 0);
    if (!lines.length) return setErr("Không có mã nào còn tồn để đưa vào.");
    if (!ngay) return setErr("Chọn ngày chốt tồn.");
    savingRef.current = true;
    setSaving(true);
    setErr(null);
    const fail = async (msg: string, voucherId?: string) => {
      // Phiếu nháp dở dang thì xoá luôn (dòng phiếu xoá theo) để bấm lại được.
      if (voucherId) await supabase.from("atld_vouchers").delete().eq("id", voucherId).eq("status", "draft");
      savingRef.current = false;
      setSaving(false);
      setErr(msg);
    };

    const { data: v, error: e1 } = await supabase
      .from("atld_vouchers")
      .insert({
        loai: "nhap",
        ngay,
        ly_do: OPENING_MARK,
        ghi_chu: `Tồn = Nhập − Xuất theo sheet "${meta.sheetName}" của file ${meta.fileName}`,
        vat_percent: 0,
        phi_van_chuyen: 0,
      })
      .select("id")
      .single();
    if (e1 || !v) return fail(atldErrorMessage(e1));

    const { error: e2 } = await supabase.from("atld_voucher_lines").insert(
      lines.map((r, i) => ({ voucher_id: v.id, line_no: i + 1, item_id: r.itemId, qty: r.qty, unit_price: r.lastPrice }))
    );
    if (e2) return fail(atldErrorMessage(e2), v.id);

    const { error: e3 } = await supabase.rpc("atld_post_receipt", { p_voucher: v.id });
    if (e3) return fail(atldErrorMessage(e3), v.id);

    savingRef.current = false;
    setSaving(false);
    setRows(null);
    onDone();
  }

  const count = (k: OpeningKind) => (rows || []).filter((r) => r.kind === k).length;
  const okRows = (rows || []).filter((r) => r.kind === "ok");
  const totalQty = okRows.reduce((s, r) => s + r.qty, 0);
  const totalValue = okRows.reduce((s, r) => s + r.qty * (r.lastPrice || 0), 0);
  const [y, m] = ngay.split("-");
  const nextMonth = Number(m) === 12 ? `01/${Number(y) + 1}` : `${String(Number(m) + 1).padStart(2, "0")}/${y}`;

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
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={reading}
        className={BTN_OUTLINE_SUCCESS}
      >
        {reading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Tồn đầu kỳ từ Excel
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
                  Tồn đầu kỳ từ “{meta.fileName}” — sheet {meta.sheetName}
                </h2>
                <button type="button" onClick={() => setRows(null)} disabled={saving} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
                  <X size={18} />
                </button>
              </div>

              {existing ? (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold px-4 py-3 rounded-xl">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  Đã có phiếu tồn đầu kỳ {existing.so_phieu} (ngày {existing.ngay.split("-").reverse().join("/")}). Chỉ tạo được một lần —
                  muốn làm lại thì nhờ TP/PP ATLĐ huỷ phiếu đó trước.
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Tồn từng mã = <b>Tổng Nhập − Tổng Xuất</b> trong sheet Chi Tiet (đúng công thức của Excel). Hệ thống tạo <b>một phiếu nhập
                  “Tồn đầu kỳ”</b> đã ghi sổ tại ngày chốt — tồn cuối kỳ tháng đó sẽ là tồn đầu kỳ tháng {nextMonth}, sau đó phiếu nhập / xuất mới tự
                  cộng trừ tiếp. Đơn giá = giá nhập gần nhất của mã.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <Chip cls="bg-emerald-50 text-emerald-700" icon={CheckCircle2}>{count("ok")} mã còn tồn · {formatQty(totalQty)} SP · {formatMoney(totalValue)} đ</Chip>
                {count("negative") > 0 && <Chip cls="bg-amber-50 text-amber-700" icon={AlertTriangle}>{count("negative")} mã tồn âm → 0</Chip>}
                {count("zero") > 0 && <Chip cls="bg-slate-100 text-slate-500" icon={MinusCircle}>{count("zero")} mã tồn = 0</Chip>}
                {count("no_item") + count("no_price") > 0 && (
                  <Chip cls="bg-rose-50 text-rose-600" icon={Ban}>{count("no_item") + count("no_price")} mã bỏ qua</Chip>
                )}
                <label className="ml-auto flex items-center gap-2 text-slate-600">
                  Ngày chốt tồn
                  <input
                    type="date"
                    value={ngay}
                    onChange={(e) => setNgay(e.target.value)}
                    disabled={!!existing}
                    className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#00AEEF]"
                  />
                </label>
              </div>

              <div className="overflow-auto border border-slate-100 rounded-xl flex-1 min-h-0">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0">
                    <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left whitespace-nowrap bg-slate-50">
                      <th className="py-2 px-2">Mã SP</th>
                      <th className="py-2 px-2">Tên SP</th>
                      <th className="py-2 px-2">Size</th>
                      <th className="py-2 px-2 text-right">Tổng nhập</th>
                      <th className="py-2 px-2 text-right">Tổng xuất</th>
                      <th className="py-2 px-2 text-right">Tồn (N − X)</th>
                      <th className="py-2 px-2 text-right">Đưa vào</th>
                      <th className="py-2 px-2 text-right">Đơn giá</th>
                      <th className="py-2 px-2 text-right">Thành tiền</th>
                      <th className="py-2 px-2">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code} className={`border-t border-slate-100 ${r.kind === "ok" || r.kind === "negative" ? "" : "opacity-50"}`}>
                        <td className="py-1.5 px-2 font-mono font-bold text-[#005BAC] whitespace-nowrap">{r.code}</td>
                        <td className="py-1.5 px-2 font-semibold text-slate-700">{r.name || "—"}</td>
                        <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{r.size || "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-emerald-600">{formatQty(r.nhap)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-rose-600">{formatQty(r.xuat)}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${r.ton < 0 ? "text-amber-600" : "text-slate-700"}`}>{formatQty(r.ton)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-extrabold text-slate-800">{formatQty(r.qty)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{r.lastPrice ? formatMoney(r.lastPrice) : "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{r.qty ? formatMoney(r.qty * (r.lastPrice || 0)) : "—"}</td>
                        <td className={`py-1.5 px-2 min-w-[170px] ${r.kind === "negative" ? "text-amber-700" : r.kind === "ok" ? "" : "text-slate-500"}`}>
                          {KIND_NOTE[r.kind]}
                        </td>
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
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setRows(null)} disabled={saving} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
                  {existing ? "Đóng" : "Huỷ"}
                </button>
                {!existing && (
                  <button
                    type="button"
                    onClick={commit}
                    disabled={saving || count("ok") === 0}
                    className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold px-4 py-2 rounded-lg cursor-pointer"
                  >
                    {saving && <Loader2 size={13} className="animate-spin" />} Ghi sổ tồn đầu kỳ ({count("ok")} mã)
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Chip({ cls, icon: Icon, children }: { cls: string; icon: typeof CheckCircle2; children: React.ReactNode }) {
  return (
    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full ${cls}`}>
      <Icon size={12} /> {children}
    </span>
  );
}

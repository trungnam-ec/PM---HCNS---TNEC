"use client";

// ============================================================
// Kho BHLĐ > Tổng kho ATLĐ > "Nhập từ Excel" (nút "File mẫu" bỏ theo yêu cầu user 02/10/2026)
//
// Đọc file ngay trên trình duyệt (không AI, không gửi file đi đâu) -> bảng XEM
// TRƯỚC: dòng mới / mã đã có (bỏ qua) / trùng trong file / lỗi -> bấm "Thêm N mã".
// Mã đã có KHÔNG bị ghi đè — dữ liệu đang dùng trong phiếu kho giữ nguyên.
// Cách dò cột: xem lib/atldItemImport.ts (nhận cả file Excel cũ sheet "Quan Ly").
// ============================================================

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { atldErrorMessage, COLOR_OPTIONS } from "@/lib/atldStock";
import {
  parseItemSheets,
  reviewRows,
  type ParsedItemRow,
  type ReviewedRow,
  type ReviewKind,
} from "@/lib/atldItemImport";
import ColorTag from "@/components/atld/ColorTag";
import { BTN_SUCCESS } from "@/components/atld/ui";
import { FileUp, CheckCircle2, AlertTriangle, Ban, XCircle, Loader2, X, AlertCircle } from "lucide-react";

const CHUNK = 200;

export default function AtldItemImport({ existingCodes, onDone }: { existingCodes: string[]; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // parsed = dữ liệu đọc từ file (size sửa được ngay trên bảng xem trước);
  // rows = parsed đã đối chiếu, tính lại mỗi lần sửa size -> cảnh báo vàng tự tắt.
  const [parsed, setParsed] = useState<ParsedItemRow[] | null>(null);
  const [origSize, setOrigSize] = useState<Record<number, string>>({});
  const rows: ReviewedRow[] | null = useMemo(() => (parsed ? reviewRows(parsed, existingCodes) : null), [parsed, existingCodes]);
  const editRow = (line: number, patch: Partial<ParsedItemRow>) =>
    setParsed((p) => (p ? p.map((r) => (r.line === line ? { ...r, ...patch } : r)) : p));
  const [meta, setMeta] = useState({ fileName: "", sheetName: "", sizeFromNote: false });
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function readFile(file: File) {
    setErr(null);
    setReading(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets = wb.SheetNames.map(
        (n) => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: null, raw: false })] as [string, unknown[][]]
      );
      const res = parseItemSheets(sheets);
      if (!res) {
        setParsed(null);
        setErr("Không tìm thấy hàng tên cột trong file. Cần ít nhất cột “Mã SP” và “Tên SP” (có thể thêm Size SP, Màu sắc, Đơn vị tính, Tồn tối thiểu, Ghi chú).");
        return;
      }
      setMeta({ fileName: file.name, sheetName: res.sheetName, sizeFromNote: res.sizeFromNote });
      setOrigSize(Object.fromEntries(res.rows.map((r) => [r.line, r.size])));
      setParsed(res.rows);
    } catch (e) {
      setParsed(null);
      setErr(e instanceof Error ? `Không đọc được file: ${e.message}` : "Không đọc được file.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function commit() {
    if (!rows || savingRef.current) return;
    const ok = rows.filter((r) => r.kind === "new");
    if (!ok.length) return setErr("Không có mã mới để thêm.");
    savingRef.current = true;
    setSaving(true);
    setErr(null);
    let added = 0;
    for (let i = 0; i < ok.length; i += CHUNK) {
      const part = ok.slice(i, i + CHUNK).map((r) => ({
        code: r.code,
        name: r.name,
        size: r.size.trim() || null,
        color: r.color.trim() || null,
        unit: r.unit || null,
        min_stock: r.min_stock,
        note: r.note || null,
      }));
      const { data, error } = await supabase.from("atld_items").insert(part).select("id");
      if (error || !data || data.length === 0) {
        savingRef.current = false;
        setSaving(false);
        setErr(
          (error ? atldErrorMessage(error) : "Không thêm được — tài khoản chưa có quyền Thủ kho ATLĐ.") +
            (added ? ` (Đã thêm ${added} mã trước khi lỗi — mở lại file để thêm phần còn lại.)` : "")
        );
        if (added) onDone();
        return;
      }
      added += data.length;
    }
    savingRef.current = false;
    setSaving(false);
    setParsed(null);
    onDone();
  }

  const count = (k: ReviewKind) => (rows || []).filter((r) => r.kind === k).length;
  const addable = count("new");
  const warned = (rows || []).filter((r) => r.kind === "new" && r.message).length;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
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
        className={BTN_SUCCESS}
      >
        {reading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Nhập từ Excel
      </button>
      {!rows && err && (
        <div className="basis-full flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {rows &&
        createPortal(
          <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setParsed(null)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
            >
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1 truncate">
                  Nhập danh mục từ “{meta.fileName}” — sheet {meta.sheetName}
                </h2>
                <button type="button" onClick={() => setParsed(null)} disabled={saving} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
                  <X size={18} />
                </button>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                <Chip cls="bg-emerald-50 text-emerald-700" icon={CheckCircle2}>{addable} mã mới</Chip>
                {warned > 0 && <Chip cls="bg-amber-50 text-amber-700" icon={AlertTriangle}>{warned} mã cần xem lại size</Chip>}
                {count("exists") > 0 && <Chip cls="bg-slate-100 text-slate-500" icon={Ban}>{count("exists")} đã có — bỏ qua</Chip>}
                {count("dup_in_file") > 0 && <Chip cls="bg-slate-100 text-slate-500" icon={Ban}>{count("dup_in_file")} trùng trong file — bỏ qua</Chip>}
                {count("error") > 0 && <Chip cls="bg-rose-50 text-rose-600" icon={XCircle}>{count("error")} dòng lỗi</Chip>}
              </div>
              {meta.sizeFromNote && (
                <p className="text-[11px] text-slate-500">
                  File không có cột “Size” nên cột <b>“Ghi chú”</b> được lấy làm Size (đúng kiểu file Excel cũ của kho).
                </p>
              )}
              {warned > 0 && (
                <p className="text-[11px] text-amber-700">
                  Gõ size đúng vào cột <b>“Size (sửa được)”</b> của các dòng vàng — cảnh báo tự tắt khi size không còn trùng. Size lưu theo cột này.
                </p>
              )}

              <div className="overflow-auto border border-slate-100 rounded-xl flex-1 min-h-0">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0">
                    <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left whitespace-nowrap bg-slate-50">
                      <th className="py-2 px-2">Dòng</th>
                      <th className="py-2 px-2">Mã SP</th>
                      <th className="py-2 px-2">Tên SP</th>
                      <th className="py-2 px-2">Size trong file</th>
                      <th className="py-2 px-2">ĐVT</th>
                      <th className="py-2 px-2 text-right">Tối thiểu</th>
                      <th className="py-2 px-2 text-[#005BAC]">Size (sửa được)</th>
                      <th className="py-2 px-2 text-[#005BAC]">Màu sắc</th>
                      <th className="py-2 px-2">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.line} className={`border-t border-slate-100 ${r.kind === "new" ? "" : "opacity-50"}`}>
                        <td className="py-1.5 px-2 text-slate-400">{r.line}</td>
                        <td className="py-1.5 px-2 font-mono font-bold text-[#005BAC] whitespace-nowrap">{r.code || "—"}</td>
                        <td className="py-1.5 px-2 font-semibold text-slate-700">{r.name || "—"}</td>
                        <td className="py-1.5 px-2 text-slate-400 whitespace-nowrap">{origSize[r.line] || "—"}</td>
                        <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{r.unit || "—"}</td>
                        <td className="py-1.5 px-2 text-slate-600 text-right tabular-nums">{r.min_stock || "—"}</td>
                        <td className="py-1 px-2">
                          {r.kind === "new" ? (
                            <input
                              value={r.size}
                              onChange={(e) => editRow(r.line, { size: e.target.value })}
                              placeholder="Nhập size"
                              aria-label={`Size của ${r.code}`}
                              className={`w-24 text-[11px] font-semibold text-slate-700 bg-slate-50 border rounded-md px-2 py-1 focus:bg-white focus:outline-none focus:border-[#00AEEF] ${
                                r.message ? "border-amber-300" : r.size !== origSize[r.line] ? "border-emerald-300" : "border-slate-200"
                              }`}
                            />
                          ) : (
                            <span className="text-slate-500">{r.size || "—"}</span>
                          )}
                        </td>
                        <td className="py-1 px-2">
                          {r.kind === "new" ? (
                            <select
                              value={r.color}
                              onChange={(e) => editRow(r.line, { color: e.target.value })}
                              aria-label={`Màu của ${r.code}`}
                              className="w-24 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-1 focus:bg-white focus:outline-none focus:border-[#00AEEF]"
                            >
                              <option value="">—</option>
                              {COLOR_OPTIONS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                              {r.color && !COLOR_OPTIONS.includes(r.color) && <option value={r.color}>{r.color}</option>}
                            </select>
                          ) : (
                            <ColorTag color={r.color} />
                          )}
                        </td>
                        <td
                          className={`py-1.5 px-2 min-w-[180px] ${
                            r.kind === "error" ? "text-rose-600" : r.kind === "new" ? "text-amber-700" : "text-slate-500"
                          }`}
                        >
                          {r.message || r.note}
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
                <span className="mr-auto text-[11px] text-slate-400">Mã đã có không bị ghi đè. Sửa tên / size sau trong bảng danh mục.</span>
                <button type="button" onClick={() => setParsed(null)} disabled={saving} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={commit}
                  disabled={saving || addable === 0}
                  className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold px-4 py-2 rounded-lg cursor-pointer"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />} Thêm {addable} mã
                </button>
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

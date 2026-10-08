"use client";

// ============================================================
// Tab "Định mức xử phạt" (migration 143) — Phụ lục 01 "Mức xử phạt" QĐ ATLD/QD/005
// lưu thành bảng 3 tầng để tra cứu khi xử lý vi phạm.
//   canInput  : cờ Khấu trừ xử phạt — P.ATLĐ nhập / Admin -> thêm, sửa, upload Excel.
//   canApprove: cờ Duyệt xuất kho ATLĐ / Admin -> xoá thẳng; không có thì Xoá chỉ
//               gửi yêu cầu chờ TP/PP duyệt (142).
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { Search, X, Plus, Pencil, Trash2, Loader2, AlertCircle, FileDown, FileUp, ChevronDown, ChevronRight, CheckCircle2, Ban, AlertTriangle, Scale } from "lucide-react";
import { BTN_OUTLINE, BTN_PRIMARY, BTN_SUCCESS, CONTROL_BOX } from "@/components/atld/ui";
import { useConfirmBox, useNoticeBox } from "@/components/ConfirmDialog";
import { requestDelete, DELETE_REQUEST_SENT } from "@/lib/atldDeleteRequests";
import {
  EXTRA_MEASURE_OPTIONS, UNIT_OPTIONS, compareCode, deleteRate, exportRates, fetchRates, insertRates, normalizeCode, parseRateDocx, parseRateWorkbook, rateLevel, saveRate, unitLabel, upsertRates,
  type ImportRate, type PenaltyRate, type PenaltyRateInput, type RateUnit,
} from "@/lib/atldPenaltyRates";

const fmtMoney = (n: number | null) => (n == null ? "" : n.toLocaleString("vi-VN"));
const parseMoneyText = (s: string) => {
  const d = s.replace(/[^\d]/g, "");
  return d ? Number(d) : null;
};
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const parentOf = (code: string) => code.split(".").slice(0, -1).join(".");

// STT gợi ý cho mục con tiếp theo của `parent` ("" = danh mục lớn tiếp theo).
function nextChildCode(rows: PenaltyRate[], parent: string): string {
  const lvl = parent ? rateLevel(parent) + 1 : 1;
  const last = rows
    .filter((r) => rateLevel(r.code) === lvl && parentOf(r.code) === parent)
    .reduce((m, r) => Math.max(m, Number(r.code.split(".").pop())), 0);
  return parent ? `${parent}.${last + 1}` : String(last + 1);
}

function MoneyCell({ v, unit }: { v: number | null; unit: RateUnit | null }) {
  if (v == null) return <span className="text-slate-300">—</span>;
  return (
    <span className="whitespace-nowrap">
      <b className="tabular-nums text-slate-800">{fmtMoney(v)}</b>
      {unit && <span className="text-slate-400 font-semibold"> {unitLabel(unit)}</span>}
    </span>
  );
}

// Dropdown chọn sẵn + "Khác…" để tự ghi. Giá trị ngoài danh sách vẫn giữ và hiện ô gõ.
const OTHER = "__khac__";
function ChoiceOrText({ value, options, onChange, empty, className }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  empty?: string; // nhãn của lựa chọn rỗng; không truyền = bắt buộc chọn
  className: string;
}) {
  const [typing, setTyping] = useState(() => !!value && !options.includes(value));
  return (
    <div className="space-y-1">
      <select
        title={value}
        value={typing ? OTHER : value}
        onChange={(e) => {
          const v = e.target.value;
          setTyping(v === OTHER);
          onChange(v === OTHER ? "" : v);
        }}
        className={className}
      >
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        <option value={OTHER}>Khác (tự ghi)…</option>
      </select>
      {typing && <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder="Gõ nội dung…" className={className} />}
    </div>
  );
}

export default function AtldPenaltyRateTab({ canInput, canApprove }: { canInput: boolean; canApprove: boolean }) {
  const [rows, setRows] = useState<PenaltyRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<PenaltyRate | { code: string } | null>(null);
  const { ask, confirmNode } = useConfirmBox();
  const { notify, noticeNode } = useNoticeBox();

  const load = useCallback(async () => {
    const res = await fetchRates();
    setRows(res.rows);
    setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const childCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const p = parentOf(r.code);
      if (p) m.set(p, (m.get(p) || 0) + 1);
    }
    return m;
  }, [rows]);

  const itemCount = rows.filter((r) => rateLevel(r.code) === 3).length;

  // Tìm: hiện dòng khớp + các tiêu đề cha của nó. Không tìm: ẩn con của nhóm đang gập.
  const shown = useMemo(() => {
    const q = fold(query.trim());
    if (q) {
      const keep = new Set<string>();
      for (const r of rows) {
        if (fold(`${r.code} ${r.noi_dung} ${r.ghi_chu || ""}`).includes(q)) {
          const parts = r.code.split(".");
          for (let i = 1; i <= parts.length; i++) keep.add(parts.slice(0, i).join("."));
        }
      }
      return rows.filter((r) => keep.has(r.code));
    }
    return rows.filter((r) => {
      const parts = r.code.split(".");
      for (let i = 1; i < parts.length; i++) if (collapsed.has(parts.slice(0, i).join("."))) return false;
      return true;
    });
  }, [rows, query, collapsed]);

  const toggle = (code: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  const remove = (r: PenaltyRate) => {
    if (childCount.get(r.code)) return setRowErr(`Mục ${r.code} còn mục con bên trong — xoá các mục con trước.`);
    if (!canApprove) {
      return ask({
        title: `Gửi yêu cầu xoá mục ${r.code}?`,
        message: "Chờ Trưởng/Phó phòng xác nhận xoá.",
        confirmLabel: "Gửi yêu cầu xoá",
        onConfirm: async () => {
          setRowErr(null);
          const e = await requestDelete("rate", r.id);
          return e ? setRowErr(e) : notify(DELETE_REQUEST_SENT, "success");
        },
      });
    }
    ask({
      title: `Xoá mục ${r.code}?`,
      message: `"${r.noi_dung}" — xoá khỏi bảng định mức, không hoàn tác được.`,
      onConfirm: async () => {
        setRowErr(null);
        const e = await deleteRate(r.id);
        if (e) return setRowErr(e);
        load();
      },
    });
  };

  const th = "px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className={`${CONTROL_BOX} flex-1 min-w-[220px] gap-2 px-3 focus-within:border-[#00AEEF]`}>
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm STT hoặc nội dung vi phạm…"
              className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500 cursor-pointer" aria-label="Xoá tìm kiếm">
                <X size={13} />
              </button>
            )}
          </div>
          <button type="button" onClick={() => exportRates(rows)} className={BTN_OUTLINE} title="Tải bảng ra Excel — cũng là file mẫu để upload">
            <FileDown size={14} /> {rows.length ? "Tải về" : "Tải file mẫu"}
          </button>
          {canInput && <RateImport existing={rows} onDone={load} />}
          {canInput && (
            <button type="button" onClick={() => setEditing({ code: nextChildCode(rows, "") })} className={BTN_PRIMARY}>
              <Plus size={14} /> Thêm danh mục
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400">
            <b className="text-slate-600">{itemCount}</b> hạng mục vi phạm
          </span>
        </div>
      </div>

      {(error || rowErr) && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error || rowErr}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-xs font-semibold">
            <Loader2 size={16} className="animate-spin" /> Đang tải định mức…
          </div>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-xs font-semibold text-slate-400">
            {rows.length === 0
              ? canInput
                ? "Chưa có định mức — bấm “Tải file mẫu”, điền theo Phụ lục 01 rồi “Upload file” (Excel hoặc Word), hoặc “Thêm danh mục”."
                : "Chưa có định mức xử phạt."
              : "Không có mục khớp ô tìm."}
          </p>
        ) : (
          <table className="w-full text-xs min-w-[1200px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className={`${th} w-24`}>STT</th>
                <th className={th}>Nội dung xử phạt</th>
                <th className={`${th} text-right`}>Lần 1</th>
                <th className={`${th} text-right`}>Lần 2</th>
                <th className={`${th} text-right`}>Lần 3</th>
                <th className={th}>Hình thức xử lý bổ sung</th>
                <th className={th}>Ghi chú</th>
                {canInput && <th className={`${th} w-28`} />}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const lvl = rateLevel(r.code);
                // Tiêu đề nhóm = có mục con, hoặc tầng 1–2 chưa có giá. Dòng có giá hiện như hạng mục.
                const hasMoney = r.muc_1 != null || r.muc_2 != null || r.muc_3 != null;
                const isGroup = (childCount.get(r.code) || 0) > 0 || (lvl < 3 && !hasMoney);
                const open = !collapsed.has(r.code) || !!query.trim();
                return (
                  <tr
                    key={r.id}
                    onClick={isGroup && !query.trim() ? () => toggle(r.code) : undefined}
                    className={`border-t border-slate-100 ${
                      !isGroup ? "hover:bg-slate-50/60" : lvl === 1 ? "bg-blue-50/70 cursor-pointer" : "bg-slate-50 cursor-pointer"
                    }`}
                  >
                    <td className={`px-3 py-2.5 align-top whitespace-nowrap font-bold ${isGroup && lvl === 1 ? "text-[#005BAC]" : "text-slate-600"}`}>
                      <span className="inline-flex items-center gap-1">
                        {isGroup && (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
                        {r.code}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 align-top whitespace-pre-line ${
                      !isGroup ? "font-semibold text-slate-700 pl-6" : lvl === 1 ? "font-extrabold uppercase text-[#005BAC]" : "font-extrabold text-slate-700"
                    }`}>
                      {r.noi_dung}
                      {isGroup && <span className="ml-2 text-[10px] font-semibold normal-case text-slate-400">({childCount.get(r.code) || 0} mục)</span>}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right"><MoneyCell v={r.muc_1} unit={r.don_vi} /></td>
                    <td className="px-3 py-2.5 align-top text-right"><MoneyCell v={r.muc_2} unit={r.don_vi} /></td>
                    <td className="px-3 py-2.5 align-top text-right"><MoneyCell v={r.muc_3} unit={r.don_vi} /></td>
                    <td className="px-3 py-2.5 align-top font-semibold text-rose-600 min-w-[200px]">{r.hinh_thuc_bo_sung}</td>
                    <td className="px-3 py-2.5 align-top text-slate-500 whitespace-pre-line">{r.ghi_chu}</td>
                    {canInput && (
                      <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {lvl < 3 && (
                            <IconBtn title="Thêm mục con" onClick={() => setEditing({ code: nextChildCode(rows, r.code) })}>
                              <Plus size={13} />
                            </IconBtn>
                          )}
                          <IconBtn title="Sửa" onClick={() => setEditing(r)}><Pencil size={13} /></IconBtn>
                          <IconBtn title="Xoá" danger onClick={() => remove(r)}><Trash2 size={13} /></IconBtn>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <RateForm
          row={"id" in editing ? editing : null}
          defaultCode={editing.code}
          existing={rows}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {confirmNode}
      {noticeNode}
    </div>
  );
}

function IconBtn({ title, danger, onClick, children }: { title: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg cursor-pointer transition-colors ${danger ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50" : "text-slate-400 hover:text-[#005BAC] hover:bg-blue-50"}`}
    >
      {children}
    </button>
  );
}

// ─── Form thêm / sửa ───
// Thêm mới: dòng đầu là mục chính (STT sửa được), nút + trên mỗi dòng thêm mục con
// ngay trong form (2 → 2.1 → 2.1.1), lưu một lần. STT mục con tự đánh theo thứ tự.
// Sửa: chỉ một dòng. Giá tiền ở dòng nào cũng nhập được, không bắt buộc.
type Line = {
  key: number;
  parent: number | null;  // key dòng cha trong form; null = mục chính
  noiDung: string;
  donVi: RateUnit;
  m: [string, string, string];
  touched: [boolean, boolean]; // Lần 2/3 đã tự gõ thì Lần 1 không ghi đè nữa
  hinhThuc: string;            // Hình thức xử lý bổ sung — chọn dropdown hoặc tự ghi
  ghiChu: string;
};

function RateForm({ row, defaultCode, existing, onClose, onSaved }: {
  row: PenaltyRate | null;
  defaultCode: string;
  existing: PenaltyRate[]; // lấy thêm đơn vị / hình thức đã dùng vào dropdown
  onClose: () => void;
  onSaved: () => void;
}) {
  const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter((x): x is string => !!x)));
  const unitOptions = uniq([...UNIT_OPTIONS, ...existing.map((r) => r.don_vi)]);
  const measureOptions = uniq([...EXTRA_MEASURE_OPTIONS, ...existing.map((r) => r.hinh_thuc_bo_sung)]);
  const [rootCode, setRootCode] = useState(row?.code ?? defaultCode);
  const nextKey = useRef(1);
  const [lines, setLines] = useState<Line[]>([
    {
      key: 0,
      parent: null,
      noiDung: row?.noi_dung ?? "",
      donVi: row?.don_vi ?? "lần",
      m: [fmtMoney(row?.muc_1 ?? null), fmtMoney(row?.muc_2 ?? null), fmtMoney(row?.muc_3 ?? null)],
      touched: [!!row, !!row],
      hinhThuc: row?.hinh_thuc_bo_sung ?? "",
      ghiChu: row?.ghi_chu ?? "",
    },
  ]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Thứ tự hiển thị (cha rồi tới con) + STT tính từ STT mục chính.
  const ordered = useMemo(() => {
    const root = normalizeCode(rootCode) || rootCode.trim();
    const out: { line: Line; code: string; depth: number }[] = [];
    const walk = (parent: number | null, code: string, depth: number) => {
      lines.filter((l) => l.parent === parent).forEach((l, i) => {
        const c = parent === null ? code : `${code}.${i + 1}`;
        out.push({ line: l, code: c, depth });
        walk(l.key, c, depth + 1);
      });
    };
    walk(null, root, 0);
    return out;
  }, [lines, rootCode]);

  const update = (key: number, f: (l: Line) => Line) => setLines((ls) => ls.map((l) => (l.key === key ? f(l) : l)));

  const setMoney = (key: number, i: 0 | 1 | 2, text: string) =>
    update(key, (l) => {
      const v = parseMoneyText(text);
      const m: [string, string, string] = [...l.m];
      const touched: [boolean, boolean] = [...l.touched];
      m[i] = fmtMoney(v);
      if (i === 0) {
        if (!touched[0]) m[1] = fmtMoney(v == null ? null : v * 2);
        if (!touched[1]) m[2] = fmtMoney(v == null ? null : v * 4);
      } else touched[i - 1] = true;
      return { ...l, m, touched };
    });

  const addChild = (parent: number) =>
    setLines((ls) => [...ls, { key: nextKey.current++, parent, noiDung: "", donVi: "lần", m: ["", "", ""], touched: [false, false], hinhThuc: "", ghiChu: "" }]);

  // Xoá dòng kéo theo các dòng con của nó.
  const removeLine = (key: number) =>
    setLines((ls) => {
      const drop = new Set([key]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const l of ls) {
          if (l.parent !== null && drop.has(l.parent) && !drop.has(l.key)) {
            drop.add(l.key);
            grew = true;
          }
        }
      }
      return ls.filter((l) => !drop.has(l.key));
    });

  async function save() {
    if (savingRef.current) return;
    if (!normalizeCode(rootCode)) return setErr("STT sai dạng — chỉ 1, 1.1 hoặc 1.1.1 (tối đa 3 tầng).");
    const inputs: PenaltyRateInput[] = [];
    for (const { line: l, code } of ordered) {
      if (rateLevel(code) > 3) return setErr(`Mục ${code} vượt quá 3 tầng.`);
      if (!l.noiDung.trim()) return setErr(`Nhập nội dung cho mục ${code}.`);
      const [m1, m2, m3] = l.m.map(parseMoneyText);
      const hasMoney = m1 != null || m2 != null || m3 != null;
      inputs.push({
        code,
        noi_dung: l.noiDung.trim(),
        don_vi: hasMoney ? l.donVi.trim() || "lần" : null,
        muc_1: m1,
        muc_2: m2,
        muc_3: m3,
        hinh_thuc_bo_sung: l.hinhThuc.trim() || null,
        ghi_chu: l.ghiChu.trim() || null,
      });
    }
    savingRef.current = true;
    setSaving(true);
    setErr(null);
    const e = row ? await saveRate(row.id, inputs[0]) : await insertRates(inputs);
    savingRef.current = false;
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#00AEEF]";
  const label = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
  const levelName = (code: string) => (rateLevel(code) === 1 ? "Danh mục" : rateLevel(code) === 2 ? "Mục con" : "Mục con cấp 2");

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        <div className="flex items-center gap-2">
          <Scale size={16} className="text-[#005BAC]" />
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">{row ? `Sửa mục ${row.code}` : "Thêm danh mục"}</h2>
          <button type="button" onClick={onClose} disabled={saving} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {/* Mỗi mục một thẻ 3 hàng (bảng 8 cột cũ quá hẹp, cắt chữ): STT + Nội dung ·
            Đơn vị + Lần 1/2/3 · Hình thức bổ sung + Ghi chú. Mục con thụt vào. */}
        <div className="overflow-y-auto flex-1 min-h-0 space-y-3 pr-1">
          {ordered.map(({ line: l, code, depth }) => (
            <div
              key={l.key}
              className={`rounded-xl border p-3 space-y-2.5 ${depth === 0 ? "border-blue-100 bg-blue-50/40" : "border-slate-100 bg-slate-50"}`}
              style={{ marginLeft: depth * 24 }}
            >
              <div className="grid grid-cols-[110px_1fr_auto] gap-3 items-start">
                <div>
                  <p className={label}>STT · {levelName(code)}</p>
                  {l.parent === null ? (
                    <input value={rootCode} onChange={(e) => setRootCode(e.target.value)} placeholder="1" className={`${inputCls} font-bold mt-1`} />
                  ) : (
                    <p className="mt-1 px-2.5 py-1.5 font-bold text-slate-700">{code}</p>
                  )}
                </div>
                <div>
                  <p className={label}>Nội dung</p>
                  <textarea
                    rows={2}
                    value={l.noiDung}
                    onChange={(e) => update(l.key, (x) => ({ ...x, noiDung: e.target.value }))}
                    placeholder={depth === 0 ? "VD: Nhóm BHLĐ" : "VD: Nón, giày"}
                    className={`${inputCls} mt-1 resize-y`}
                  />
                </div>
                <div className="flex items-center gap-0.5 pt-5">
                  {!row && rateLevel(code) < 3 && (
                    <IconBtn title={`Thêm mục con ${code}.x`} onClick={() => addChild(l.key)}><Plus size={15} /></IconBtn>
                  )}
                  {l.parent !== null && (
                    <IconBtn title="Bỏ mục này" danger onClick={() => removeLine(l.key)}><X size={15} /></IconBtn>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className={label}>Đơn vị (đồng/…)</p>
                  <div className="mt-1">
                    <ChoiceOrText value={l.donVi} options={unitOptions} onChange={(v) => update(l.key, (x) => ({ ...x, donVi: v }))} className={inputCls} />
                  </div>
                </div>
                {([0, 1, 2] as const).map((i) => (
                  <div key={i}>
                    <p className={label}>Lần {i + 1}</p>
                    <input
                      inputMode="numeric"
                      value={l.m[i]}
                      onChange={(e) => setMoney(l.key, i, e.target.value)}
                      placeholder="—"
                      className={`${inputCls} mt-1 tabular-nums text-right`}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                <div>
                  <p className={label}>Hình thức xử lý bổ sung</p>
                  <div className="mt-1">
                    <ChoiceOrText
                      value={l.hinhThuc}
                      options={measureOptions}
                      empty="— Không —"
                      onChange={(v) => update(l.key, (x) => ({ ...x, hinhThuc: v }))}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <p className={label}>Ghi chú</p>
                  <input value={l.ghiChu} onChange={(e) => update(l.key, (x) => ({ ...x, ghiChu: e.target.value }))} className={`${inputCls} mt-1`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {err && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-600">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
            Huỷ
          </button>
          <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
            {saving && <Loader2 size={13} className="animate-spin" />} Lưu{!row && ordered.length > 1 ? ` ${ordered.length} mục` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ─── Upload file Excel / Word: xem trước rồi mới lưu. Trùng STT với bảng = SỬA ĐÈ. ───
function RateImport({ existing, onDone }: { existing: PenaltyRate[]; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ImportRate[] | null>(null);
  const [meta, setMeta] = useState({ fileName: "", sheet: "" });
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const byCode = useMemo(() => new Map(existing.map((r) => [r.code, r])), [existing]);

  async function readFile(file: File) {
    setErr(null);
    setReading(true);
    try {
      const buf = await file.arrayBuffer();
      // Word (.docx) đọc các bảng trong văn bản; Excel đọc từng sheet.
      const isWord = /\.docx$/i.test(file.name);
      if (/\.doc$/i.test(file.name)) {
        setRows(null);
        setErr("File Word đời cũ (.doc) chưa đọc được — mở bằng Word rồi Lưu thành .docx, hoặc dùng Excel.");
        return;
      }
      const res = isWord
        ? (() => {
            const r = parseRateDocx(buf);
            return r ? { sheet: "bảng trong văn bản", rows: r } : null;
          })()
        : parseRateWorkbook(XLSX.read(buf, { type: "array" }));
      if (!res || res.rows.length === 0) {
        setRows(null);
        setErr("Không thấy bảng định mức. Bảng cần các cột “STT”, “Nội dung xử phạt”, “Lần 1” (Lần 2, Lần 3, Đơn vị, Ghi chú nếu có) — bấm “Tải về” để lấy file mẫu Excel.");
        return;
      }
      setMeta({ fileName: file.name, sheet: isWord ? "" : `sheet ${res.sheet}` });
      setRows(res.rows.sort((a, b) => (a.error || b.error ? 0 : compareCode(a.code, b.code))));
    } catch (e) {
      setRows(null);
      setErr(e instanceof Error ? `Không đọc được file: ${e.message}` : "Không đọc được file.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const okRows = (rows || []).filter((r) => !r.error);
  const sameAs = (r: ImportRate) => {
    const o = byCode.get(r.code);
    return !!o && o.noi_dung === r.noi_dung && o.don_vi === r.don_vi && o.muc_1 === r.muc_1 && o.muc_2 === r.muc_2 && o.muc_3 === r.muc_3 && (o.hinh_thuc_bo_sung || null) === r.hinh_thuc_bo_sung && (o.ghi_chu || null) === r.ghi_chu;
  };
  const toSave = okRows.filter((r) => !sameAs(r));
  const nNew = toSave.filter((r) => !byCode.has(r.code)).length;
  const nUpd = toSave.length - nNew;
  const nSame = okRows.length - toSave.length;
  const nErr = (rows || []).length - okRows.length;
  // Hạng mục có cha chưa có trong bảng lẫn trong file -> nhắc, vẫn cho lưu.
  const codes = new Set([...byCode.keys(), ...okRows.map((r) => r.code)]);
  const orphan = (r: ImportRate) => !r.error && rateLevel(r.code) > 1 && !codes.has(parentOf(r.code));

  async function commit() {
    if (savingRef.current || toSave.length === 0) return;
    savingRef.current = true;
    setSaving(true);
    setErr(null);
    const e = await upsertRates(
      toSave.map(({ code, noi_dung, don_vi, muc_1, muc_2, muc_3, hinh_thuc_bo_sung, ghi_chu }) => ({ code, noi_dung, don_vi, muc_1, muc_2, muc_3, hinh_thuc_bo_sung, ghi_chu }))
    );
    savingRef.current = false;
    setSaving(false);
    if (e) return setErr(e);
    setRows(null);
    onDone();
  }

  const status = (r: ImportRate) =>
    r.error ? { text: r.error, cls: "text-rose-600" }
    : sameAs(r) ? { text: "Giống bảng — bỏ qua", cls: "text-slate-400" }
    : orphan(r) ? { text: `Chưa có mục cha ${parentOf(r.code)}`, cls: "text-amber-700" }
    : r.warn ? { text: r.warn, cls: "text-amber-700" }
    : byCode.has(r.code) ? { text: "Cập nhật (sửa đè)", cls: "text-[#005BAC]" }
    : { text: "Mới", cls: "text-emerald-700" };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.docx,.doc"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFile(f);
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={reading} className={BTN_SUCCESS}>
        {reading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Upload file
      </button>
      {!rows && err && (
        <div className="basis-full flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
        </div>
      )}

      {rows &&
        createPortal(
          <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setRows(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1 truncate">
                  Upload định mức xử phạt từ “{meta.fileName}”{meta.sheet && ` — ${meta.sheet}`}
                </h2>
                <button type="button" onClick={() => setRows(null)} disabled={saving} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
                  <X size={18} />
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                STT đã có trong bảng thì <b>sửa đè</b> theo file, STT mới thì thêm vào. Mục có trong bảng mà không có trong file vẫn giữ nguyên.
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={12} /> {nNew} mục mới</span>
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-[#005BAC]"><CheckCircle2 size={12} /> {nUpd} mục cập nhật</span>
                {nSame > 0 && <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500"><Ban size={12} /> {nSame} giống bảng — bỏ qua</span>}
                {nErr > 0 && <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-600"><AlertTriangle size={12} /> {nErr} dòng lỗi — bỏ qua</span>}
              </div>
              <div className="overflow-auto border border-slate-100 rounded-xl flex-1 min-h-0">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0">
                    <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left whitespace-nowrap bg-slate-50">
                      <th className="py-2 px-2">Dòng</th>
                      <th className="py-2 px-2">STT</th>
                      <th className="py-2 px-2">Nội dung</th>
                      <th className="py-2 px-2 text-right">Lần 1</th>
                      <th className="py-2 px-2 text-right">Lần 2</th>
                      <th className="py-2 px-2 text-right">Lần 3</th>
                      <th className="py-2 px-2">Đơn vị</th>
                      <th className="py-2 px-2">Hình thức bổ sung</th>
                      <th className="py-2 px-2">Tình trạng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const s = status(r);
                      const lvl = r.error ? 3 : rateLevel(r.code);
                      return (
                        <tr key={r.line} className={`border-t border-slate-100 ${r.error ? "opacity-60" : ""}`}>
                          <td className="py-1.5 px-2 text-slate-400">{r.line}</td>
                          <td className="py-1.5 px-2 font-bold text-slate-600 whitespace-nowrap">{r.code}</td>
                          <td className={`py-1.5 px-2 ${lvl < 3 ? "font-extrabold text-slate-800" : "font-semibold text-slate-700"}`}>{r.noi_dung || "—"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmtMoney(r.muc_1)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmtMoney(r.muc_2)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmtMoney(r.muc_3)}</td>
                          <td className="py-1.5 px-2 whitespace-nowrap">{r.don_vi ? unitLabel(r.don_vi) : ""}</td>
                          <td className="py-1.5 px-2 text-rose-600 font-semibold min-w-[160px]">{r.hinh_thuc_bo_sung}</td>
                          <td className={`py-1.5 px-2 font-semibold ${s.cls}`}>{s.text}</td>
                        </tr>
                      );
                    })}
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
                <button type="button" onClick={commit} disabled={saving || toSave.length === 0} className={BTN_PRIMARY}>
                  {saving && <Loader2 size={13} className="animate-spin" />} Lưu {toSave.length} mục
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

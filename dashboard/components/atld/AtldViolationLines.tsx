"use client";

// ============================================================
// Ô "Nội dung vi phạm" của form hồ sơ khấu trừ / xử phạt (migration 147).
// User yêu cầu 09/10/2026: chọn nhanh hạng mục từ tab Định mức xử phạt -> tự điền
// nội dung + số tiền; vi phạm chưa có trong định mức thì gõ tay; một hồ sơ nhiều
// vi phạm; mỗi dòng chọn Lần 1/2/3 + Số lượng (đơn vị người / thiết bị / xe…).
// Thành tiền từng dòng tự tính nhưng SỬA TAY được (vi phạm phát sinh).
// Đổi hạng mục / Lần / Số lượng thì tính lại; sửa tay thành tiền sau cùng thì giữ.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Plus, PenLine } from "lucide-react";
import { type PenaltyRate, fetchRates, unitLabel } from "@/lib/atldPenaltyRates";
import { type ViolationLine, lineAmount, perUnit } from "@/lib/atldPenalties";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const fmt = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("vi-VN"));
const parseMoney = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

export const EMPTY_LINE: ViolationLine = { rate_id: null, code: null, noi_dung: "", muc: [], don_vi: null, hinh_thuc: null, lan: 1, so_luong: 1, thanh_tien: 0 };

// Chỉ hạng mục có tiền (bỏ dòng tiêu đề nhóm).
let cache: Promise<PenaltyRate[]> | null = null;
function loadRates(): Promise<PenaltyRate[]> {
  if (!cache) {
    cache = fetchRates().then((r) => {
      const list = r.rows.filter((x) => x.muc_1 != null || x.muc_2 != null || x.muc_3 != null);
      if (!list.length) cache = null;
      return list;
    });
  }
  return cache;
}

export default function AtldViolationLines({
  lines, onChange, disabled, inputCls,
}: {
  lines: ViolationLine[];
  onChange: (lines: ViolationLine[]) => void;
  disabled: boolean;
  inputCls: string;
}) {
  const [rates, setRates] = useState<PenaltyRate[]>([]);
  useEffect(() => {
    let alive = true;
    loadRates().then((r) => alive && setRates(r));
    return () => {
      alive = false;
    };
  }, []);

  const set = (i: number, patch: Partial<ViolationLine>, recalc = true) =>
    onChange(
      lines.map((l, k) => {
        if (k !== i) return l;
        const next = { ...l, ...patch };
        return recalc && next.rate_id ? { ...next, thanh_tien: lineAmount(next) } : next;
      })
    );

  const pickRate = (i: number, r: PenaltyRate) =>
    set(i, {
      rate_id: r.id,
      code: r.code,
      noi_dung: r.noi_dung,
      muc: [r.muc_1, r.muc_2, r.muc_3],
      don_vi: r.don_vi,
      hinh_thuc: r.hinh_thuc_bo_sung,
      lan: 1,
      so_luong: 1,
    });

  if (disabled) {
    return (
      <div className={`${inputCls} bg-slate-100 whitespace-pre-line`}>
        {lines.filter((l) => l.noi_dung.trim()).length
          ? lines.filter((l) => l.noi_dung.trim()).map((l, i) => <p key={i}>• {l.code ? `${l.code} — ` : ""}{l.noi_dung}</p>)
          : "—"}
      </div>
    );
  }

  const lbl = "text-[10px] font-bold text-slate-500";
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        // Dòng chưa chọn vi phạm: chỉ ô tìm, không khung / số thứ tự (giống ô Nhà thầu phụ).
        <div key={i} className={l.noi_dung ? "rounded-xl border border-slate-200 bg-white p-3 space-y-2" : ""}>
          <div className="flex items-start gap-2">
            {l.noi_dung && <span className="text-[11px] font-extrabold text-slate-400 pt-2 w-4 shrink-0">{i + 1}</span>}
            <div className="flex-1 min-w-0">
              {l.noi_dung ? (
                <div className="min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-xl flex items-start gap-2 bg-slate-50">
                  <span className="flex-1 min-w-0 text-xs">
                    {l.rate_id ? (
                      <>
                        <b className="text-[#005BAC]">{l.code}</b> <span className="font-semibold text-slate-700">{l.noi_dung}</span>
                      </>
                    ) : (
                      <textarea
                        rows={2}
                        value={l.noi_dung}
                        onChange={(e) => set(i, { noi_dung: e.target.value }, false)}
                        className="w-full bg-transparent font-semibold text-slate-700 focus:outline-none resize-y"
                      />
                    )}
                    {l.hinh_thuc && <span className="block text-[11px] font-semibold text-rose-600 mt-0.5">+ {l.hinh_thuc}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => set(i, { ...EMPTY_LINE }, false)}
                    title="Chọn nội dung khác"
                    aria-label="Chọn nội dung khác"
                    className="p-1 text-slate-300 hover:text-rose-500 rounded-lg cursor-pointer shrink-0"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <RatePicker rates={rates} onPick={(r) => pickRate(i, r)} onFree={(text) => set(i, { ...EMPTY_LINE, noi_dung: text }, false)} />
              )}
            </div>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(lines.filter((_, k) => k !== i))}
                title="Bỏ vi phạm này"
                aria-label="Bỏ vi phạm này"
                className="p-1.5 mt-1 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {l.noi_dung && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-6">
              {l.rate_id && (
                <label className="block space-y-1">
                  <span className={lbl}>Lần vi phạm</span>
                  <select value={l.lan} onChange={(e) => set(i, { lan: Number(e.target.value) as 1 | 2 | 3 })} className={inputCls}>
                    {[1, 2, 3].map((n) => (
                      <option key={n} value={n}>Lần {n}</option>
                    ))}
                  </select>
                </label>
              )}
              {perUnit(l) && (
                <label className="block space-y-1">
                  <span className={lbl}>Số lượng ({l.don_vi})</span>
                  <input
                    inputMode="numeric"
                    value={l.so_luong || ""}
                    onChange={(e) => set(i, { so_luong: Math.max(0, Number(e.target.value.replace(/[^\d]/g, "")) || 0) })}
                    className={`${inputCls} tabular-nums text-right`}
                  />
                </label>
              )}
              {l.rate_id && (
                <div className="space-y-1">
                  <span className={lbl}>Mức phạt</span>
                  <p className="px-1 py-2 text-xs font-bold text-slate-600 tabular-nums">
                    {fmt(l.muc[l.lan - 1])} <span className="font-semibold text-slate-400">{l.don_vi ? unitLabel(l.don_vi) : "đ"}</span>
                  </p>
                </div>
              )}
              <label className="block space-y-1">
                <span className={lbl}>Thành tiền (đ){l.rate_id ? " — sửa được" : ""}</span>
                <input
                  inputMode="numeric"
                  value={fmt(l.thanh_tien)}
                  onChange={(e) => set(i, { thanh_tien: parseMoney(e.target.value) }, false)}
                  placeholder="0"
                  className={`${inputCls} tabular-nums text-right`}
                />
              </label>
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lines, { ...EMPTY_LINE }])}
        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#005BAC] hover:underline cursor-pointer"
      >
        <Plus size={13} /> Thêm vi phạm
      </button>
    </div>
  );
}

// Ô tìm nhanh hạng mục định mức (gõ STT hoặc vài chữ) — chưa có thì dùng nội dung gõ tay.
function RatePicker({ rates, onPick, onFree }: { rates: PenaltyRate[]; onPick: (r: PenaltyRate) => void; onFree: (text: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const hits = useMemo(() => {
    const q = fold(search.trim());
    const list = q ? rates.filter((r) => fold(`${r.code} ${r.noi_dung}`).includes(q)) : rates;
    return list.slice(0, 40);
  }, [rates, search]);

  return (
    <div className="relative" ref={boxRef}>
      <div className="w-full min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-xl flex items-center gap-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400">
        <Search size={12} className="text-slate-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={rates.length ? "Tìm vi phạm theo STT hoặc nội dung, hoặc gõ nội dung mới…" : "Gõ nội dung vi phạm…"}
          className="flex-1 min-w-0 py-0.5 outline-none text-xs font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 bg-transparent"
        />
      </div>
      {open && (hits.length > 0 || search.trim()) && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-30 max-h-72 overflow-y-auto">
          {hits.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onPick(r);
                setSearch("");
                setOpen(false);
              }}
              className="w-full flex items-start gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer border-b border-slate-50"
            >
              <span className="text-[11px] font-extrabold text-[#005BAC] tabular-nums shrink-0 w-14">{r.code}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-semibold text-slate-700 line-clamp-2">{r.noi_dung}</span>
                <span className="block text-[10px] font-semibold text-slate-400 tabular-nums">
                  Lần 1: {fmt(r.muc_1)}{r.don_vi ? ` ${unitLabel(r.don_vi)}` : ""}
                  {r.hinh_thuc_bo_sung && <span className="text-rose-500"> · + {r.hinh_thuc_bo_sung}</span>}
                </span>
              </span>
            </button>
          ))}
          {search.trim() && (
            <button
              type="button"
              onClick={() => {
                onFree(search.trim());
                setSearch("");
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-blue-50 transition-colors text-left cursor-pointer"
            >
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                <PenLine size={12} />
              </span>
              <span className="text-xs font-semibold text-slate-600 truncate">Dùng nội dung gõ tay: “{search.trim()}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

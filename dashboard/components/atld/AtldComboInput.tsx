"use client";

// ============================================================
// Ô nhập + danh sách thả xuống tự vẽ, cùng giao diện AtldPartnerPicker — thay
// <datalist> / <select> gốc của trình duyệt (user chê xấu, 21/10/2026).
//   freeText (mặc định): gõ tự do, danh sách lọc theo chữ đang gõ (không dấu).
//   freeText=false: chỉ chọn từ danh sách (thay <select>); emptyLabel = dòng "bỏ chọn".
// Giá trị luôn do cha giữ (controlled) — gõ gì cha nhận đó, kể cả khi bộ gõ tiếng
// Việt làm danh sách lọc lệch thì người dùng vẫn gõ xong được.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { foldVi } from "@/lib/financePartners";

export default function AtldComboInput({
  value, onChange, options, placeholder, inputCls, freeText = true, emptyLabel, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  inputCls: string;
  freeText?: boolean;
  emptyLabel?: string;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // chỉ lọc sau khi người dùng gõ; mới mở thì hiện đủ danh sách
  const [hi, setHi] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const list = useMemo(() => {
    const q = freeText && typed ? foldVi(value) : "";
    return options.filter((o) => !q || foldVi(o).includes(q)).slice(0, 60);
  }, [options, value, freeText, typed]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setTyped(false);
    setHi(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      const n = list.length + (emptyLabel ? 1 : 0);
      if (n) setHi((h) => (e.key === "ArrowDown" ? (h + 1) % n : (h - 1 + n) % n));
    } else if (e.key === "Enter" && open && hi >= 0) {
      e.preventDefault();
      const idx = emptyLabel ? hi - 1 : hi;
      pick(idx < 0 ? "" : list[idx] ?? value);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation(); // chỉ đóng danh sách, không đóng cả popup cha
      setOpen(false);
    }
  };

  const row = "w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold cursor-pointer transition-colors";

  return (
    <div className="relative" ref={boxRef}>
      <input
        autoFocus={autoFocus}
        value={value}
        readOnly={!freeText}
        placeholder={emptyLabel && !value ? emptyLabel : placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
          setHi(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`${inputCls} pr-8 ${freeText ? "" : "cursor-pointer"}`}
      />
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />

      {open && (list.length > 0 || emptyLabel) && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-30 max-h-56 overflow-y-auto py-1">
          {emptyLabel && (
            <button type="button" onClick={() => pick("")} className={`${row} text-slate-400 ${hi === 0 ? "bg-slate-50" : "hover:bg-slate-50"}`}>
              {emptyLabel}
            </button>
          )}
          {list.map((o, i) => {
            const active = (emptyLabel ? i + 1 : i) === hi;
            return (
              <button
                key={o}
                type="button"
                onClick={() => pick(o)}
                className={`${row} text-slate-700 ${active ? "bg-slate-50" : "hover:bg-slate-50"}`}
              >
                <span className="flex-1 min-w-0 truncate">{o}</span>
                {o === value && <Check size={13} className="text-[#005BAC] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

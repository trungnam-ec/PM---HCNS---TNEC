"use client";

// ============================================================
// PersonSearchCell — ô chọn người/bộ phận NẰM TRONG Ô BẢNG.
//
// Vì sao phải tách riêng thay vì bê thẳng picker của "Người dự":
// bảng phân công nằm trong khối `overflow-x-auto` (để bảng rộng cuộn ngang
// được). Một dropdown `absolute` đặt trong khối đó bị CẮT CỤT ngay mép bảng.
// Nên danh sách gợi ý ở đây phải portal xuống document.body và định vị bằng
// `fixed` theo toạ độ thật của ô — cùng cái bẫy backdrop-filter đã gặp ở modal.
//
// Vẫn cho gõ tự do qua dòng "Dùng nguyên chữ": nhiều đầu việc giao cho bộ phận
// hoặc nhà thầu ngoài, không phải lúc nào cũng là người trong danh bạ.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

export type PersonOption = {
  id: string;
  name: string;
  /** Dòng phụ: "Phòng ban • Chức danh". Bỏ trống với các lựa chọn kiểu bộ phận. */
  sub?: string;
  initials?: string;
};

export default function PersonSearchCell({
  value,
  options,
  onChange,
  disabled,
  placeholder = "Tìm tên hoặc bộ phận…",
}: {
  value: string;
  options: PersonOption[];
  onChange: (name: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Đo lại vị trí ô để đặt danh sách ngay bên dưới. */
  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 220) });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    // Bảng cuộn ngang/dọc thì ô di chuyển theo — phải bám vị trí, không thì danh
    // sách đứng yên một chỗ trong khi ô đã trôi đi.
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? options.filter(o => o.name.toLowerCase().includes(q) || (o.sub || "").toLowerCase().includes(q))
    : options;
  const exact = options.some(o => o.name.toLowerCase() === q);

  const pick = (name: string) => {
    onChange(name);
    setQuery("");
    setOpen(false);
  };

  return (
    <>
      <div ref={wrapRef}>
        <input
          type="text"
          disabled={disabled}
          value={open ? query : value}
          placeholder={open && value ? value : placeholder}
          onFocus={() => { setQuery(""); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (query.trim()) pick(query.trim());
              else setOpen(false);
            }
          }}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:bg-white focus:border-blue-500 text-slate-800 text-xs disabled:opacity-60"
        />
      </div>

      {open && !disabled && box && createPortal(
        <div
          ref={listRef}
          style={{ position: "fixed", left: box.left, top: box.top, width: box.width, zIndex: 95 }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto animate-in fade-in duration-150"
        >
          {query.trim() && !exact && (
            <button
              type="button"
              onClick={() => pick(query.trim())}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100"
            >
              <span className="block text-[11px] font-bold text-[#005BAC] truncate">Dùng nguyên chữ: &quot;{query.trim()}&quot;</span>
            </button>
          )}

          {value && (
            <button
              type="button"
              onClick={() => pick("")}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100"
            >
              <span className="block text-[11px] font-semibold text-slate-400">Bỏ trống ô này</span>
            </button>
          )}

          {matches.length === 0 ? (
            <p className="text-center text-slate-400 text-[11px] italic py-4">Không tìm thấy.</p>
          ) : (
            matches.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => pick(opt.name)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
              >
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
                  {opt.initials || opt.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-bold text-slate-700 truncate">{opt.name}</span>
                  {opt.sub && <span className="block text-[10px] text-slate-400 font-semibold truncate">{opt.sub}</span>}
                </span>
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </>
  );
}

"use client";

// ============================================================
// Ô chọn "Mã SP" trong form phiếu xuất kho — cùng kiểu với AtldPartnerPicker /
// ô đối tác của form phiếu trình ký (thay <datalist> của trình duyệt, user chê
// xấu 02/10/2026). Chưa chọn: ô tìm, gõ mã / tên / size / màu (bỏ dấu, "giay 42");
// đã chọn: thẻ mã SP + nút X. Danh sách hiện tồn hiện tại từng mã.
//
// Dòng hàng nằm trong bảng có overflow-x-auto -> danh sách thả xuống vẽ bằng
// portal + position: fixed theo toạ độ ô nhập, nếu không sẽ bị bảng cắt mất.
// ============================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type AtldItem, itemSearchText, matchesQuery, formatQty } from "@/lib/atldStock";
import { fold } from "@/lib/atldItemImport";
import { Search, X } from "lucide-react";

export default function AtldItemPicker({
  items,
  stock,
  value,
  onChange,
}: {
  items: AtldItem[];          // chỉ mã đang dùng
  stock: Map<string, number>; // item_id -> tồn hiện tại
  value: string;              // mã SP đang chọn ("" = chưa chọn)
  onChange: (code: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => items.find((i) => fold(i.code) === fold(value)) || null, [items, value]);
  const results = useMemo(() => {
    const q = search.trim();
    return (q ? items.filter((i) => matchesQuery(itemSearchText(i), q)) : items).slice(0, 40);
  }, [items, search]);

  const place = useCallback(() => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 380);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos({ top: r.bottom + 4, left: Math.max(8, left), width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    // Đo toạ độ ô nhập để đặt danh sách — đúng việc của layout effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    place();
    // Cuộn trong modal / bảng hoặc đổi cỡ cửa sổ -> dời danh sách theo ô nhập.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (code: string) => {
    onChange(code);
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={boxRef}>
      {selected ? (
        <div className="w-full h-9 px-2.5 border border-slate-200 rounded-lg flex items-center gap-2 bg-white">
          <span className="flex-1 min-w-0 font-mono text-xs font-bold text-[#005BAC] truncate">{selected.code}</span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSearch("");
              setOpen(true);
            }}
            title="Chọn mã khác"
            aria-label="Chọn mã khác"
            className="p-0.5 text-slate-300 hover:text-rose-500 rounded transition-colors cursor-pointer shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="w-full h-9 px-2.5 border border-slate-200 rounded-lg flex items-center gap-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            // Enter = chọn dòng đầu của danh sách đang lọc (gõ đúng mã rồi Enter là xong).
            onKeyDown={(e) => {
              if (e.key === "Enter" && results.length) {
                e.preventDefault();
                pick(results[0].code);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Mã / tên / size"
            className="flex-1 min-w-0 outline-none text-xs font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 bg-transparent"
          />
        </div>
      )}

      {open &&
        !selected &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="bg-white border border-slate-200 rounded-xl shadow-premium z-[95] max-h-64 overflow-y-auto"
          >
            {results.length === 0 ? (
              <p className="px-4 py-3 text-[11px] font-semibold text-slate-400">Không có mã nào khớp “{search}”.</p>
            ) : (
              results.map((i) => {
                const ton = stock.get(i.id) ?? 0;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => pick(i.code)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                  >
                    <span className="w-20 shrink-0 font-mono text-xs font-bold text-[#005BAC] truncate">{i.code}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold text-slate-700 truncate">{i.name}</span>
                      <span className="block text-[10px] text-slate-400 font-semibold truncate">
                        {[i.size, i.color, i.unit].filter(Boolean).join(" • ") || "—"}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[11px] font-bold tabular-nums ${ton > 0 ? "text-slate-600" : "text-rose-500"}`}>
                      tồn {formatQty(ton)}
                    </span>
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

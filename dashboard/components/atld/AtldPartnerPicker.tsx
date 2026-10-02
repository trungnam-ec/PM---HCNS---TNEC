"use client";

// ============================================================
// Ô chọn "Khách hàng" từ Danh mục đối tác CHUNG (Hồ sơ trình ký) — cùng giao diện
// ô "Đơn vị / Đối tác" của form phiếu trình ký (SigningFormModal): chưa chọn thì
// là ô tìm + danh sách thả xuống (chấm tên viết tắt, tên, loại đối tác); đã chọn
// thì thành thẻ, bấm X để chọn lại. Tên ngoài danh mục: dòng "Dùng tên gõ tay".
// Thay <datalist> của trình duyệt (user chê xấu, 02/10/2026).
// Dữ liệu qua RPC atld_shared_partner_list (migration 122/123) — chỉ tên, tên gọi
// tắt, loại; không kèm số tài khoản / MST.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { PARTY_TYPE_LABELS, foldVi } from "@/lib/financePartners";
import type { SharedPartner } from "@/lib/atldVouchers";
import { Search, X, Plus } from "lucide-react";

const initials = (s: string) =>
  s.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default function AtldPartnerPicker({
  partners,
  value,
  onChange,
  placeholder = "Tìm khách hàng trong danh mục đối tác hoặc gõ tên…",
}: {
  partners: SharedPartner[];
  value: string;                       // tên khách hàng đang chọn ("" = chưa chọn)
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài thì đóng danh sách (cùng cách SigningFormModal).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const selected = useMemo(() => partners.find((p) => foldVi(p.name) === foldVi(value)) || null, [partners, value]);
  const results = useMemo(() => {
    const q = foldVi(search);
    return partners.filter((p) => !q || foldVi(p.name).includes(q) || foldVi(p.short_name || "").includes(q)).slice(0, 30);
  }, [partners, search]);

  const pick = (name: string) => {
    onChange(name);
    setSearch("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      {value ? (
        <div className="w-full min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-xl flex items-center gap-2 bg-white">
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
            {initials(value)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-slate-800 truncate">{value}</span>
            <span className="block text-[10px] font-semibold text-slate-400 truncate">
              {selected
                ? [PARTY_TYPE_LABELS[selected.party_type as keyof typeof PARTY_TYPE_LABELS] || selected.party_type, selected.short_name].filter(Boolean).join(" • ")
                : "Tên gõ tay — chưa có trong danh mục đối tác"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSearch("");
              setOpen(true);
            }}
            title="Chọn khách hàng khác"
            aria-label="Chọn khách hàng khác"
            className="p-1 text-slate-300 hover:text-rose-500 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
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
            placeholder={placeholder}
            className="flex-1 min-w-0 py-0.5 outline-none text-xs font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 bg-transparent"
          />
        </div>
      )}

      {open && !value && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-30 max-h-56 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.name)}
              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
            >
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                {initials(p.name)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-slate-700 truncate">{p.name}</span>
                <span className="block text-[10px] text-slate-400 font-semibold truncate">
                  {PARTY_TYPE_LABELS[p.party_type as keyof typeof PARTY_TYPE_LABELS] || p.party_type}
                  {p.short_name ? ` • ${p.short_name}` : ""}
                </span>
              </span>
            </button>
          ))}

          {/* Vẫn nhận tên NGOÀI danh mục (người nhận cũ trong Excel, khách lẻ). */}
          {search.trim() && !results.some((p) => foldVi(p.name) === foldVi(search)) && (
            <button
              type="button"
              onClick={() => pick(search.trim())}
              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-blue-50 border-t border-slate-100 transition-colors text-left cursor-pointer"
            >
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
                <Plus size={13} />
              </span>
              <span className="text-xs font-semibold text-slate-600 truncate">Dùng tên gõ tay: “{search.trim()}”</span>
            </button>
          )}

          {results.length === 0 && !search.trim() && (
            <p className="px-4 py-3 text-[11px] font-semibold text-slate-400">Danh mục đối tác đang rỗng — thêm ở Hồ sơ trình ký › Danh mục đối tác.</p>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

// ============================================================
// Ô chọn "Người nhận" trong form phiếu xuất kho — cùng kiểu AtldPartnerPicker.
// Nguồn: danh bạ nhân viên (view employees_directory), BỎ người đã nghỉ việc.
//   • Đã chọn Ban điều hành -> danh sách ưu tiên nhân viên THUỘC BĐH đó (user
//     yêu cầu 02/10/2026); gõ tên thì vẫn tìm thêm được người phòng khác.
//   • Chưa chọn BĐH -> tìm trong toàn công ty.
//   • Tên ngoài danh bạ (công nhân thời vụ, người của nhà thầu): "Dùng tên gõ tay".
// Giá trị lưu là TÊN (cột atld_vouchers.nguoi_nhan, text).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isResignedRow } from "@/lib/resigned";
import { foldVi } from "@/lib/financePartners";
import { Search, X, Plus } from "lucide-react";

type Person = { name: string; role: string; department: string };

let cache: Promise<Person[]> | null = null;
function loadPeople(): Promise<Person[]> {
  if (!cache) {
    cache = (async () => {
      // select("*") để không vỡ khi tenant chưa có cột is_resigned (xem lib/resigned.ts).
      const { data } = await supabase.from("employees_directory").select("*").order("name");
      const list = ((data as Record<string, unknown>[]) || [])
        .filter((e) => String(e.name || "").trim() && !isResignedRow(e))
        .map((e) => ({ name: String(e.name).trim(), role: String(e.role || ""), department: String(e.department || "") }));
      if (!list.length) cache = null;
      return list;
    })();
  }
  return cache;
}

const initials = (s: string) =>
  s.split(" ").filter(Boolean).slice(-2).map((w) => w[0]).join("").toUpperCase();

export default function AtldPersonPicker({
  bdh,
  value,
  onChange,
  allowFree = true,
}: {
  bdh: string;                       // Ban điều hành đang chọn trên phiếu ("" = chưa chọn)
  value: string;
  onChange: (name: string) => void;
  allowFree?: boolean;               // false = CHỈ chọn trong danh bạ nhân viên (ô Người lập)
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadPeople().then((p) => alive && setPeople(p));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const bdhKey = foldVi(bdh);
  const selected = useMemo(() => people.find((p) => foldVi(p.name) === foldVi(value)) || null, [people, value]);

  // Nhân viên thuộc BĐH đứng trước; gõ tên thì thêm người phòng khác ở nhóm sau.
  const { inBdh, others } = useMemo(() => {
    const q = foldVi(search);
    const hit = (p: Person) => !q || foldVi(p.name).includes(q) || foldVi(p.role).includes(q);
    const mine = bdhKey ? people.filter((p) => foldVi(p.department) === bdhKey && hit(p)) : [];
    const rest = !bdhKey || q ? people.filter((p) => (!bdhKey || foldVi(p.department) !== bdhKey) && hit(p)) : [];
    return { inBdh: mine.slice(0, 40), others: rest.slice(0, bdhKey ? 15 : 40) };
  }, [people, search, bdhKey]);

  const pick = (name: string) => {
    onChange(name);
    setSearch("");
    setOpen(false);
  };

  const row = (p: Person) => (
    <button
      key={`${p.name}|${p.department}`}
      type="button"
      onClick={() => pick(p.name)}
      className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
    >
      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
        {initials(p.name)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-bold text-slate-700 truncate">{p.name}</span>
        <span className="block text-[10px] text-slate-400 font-semibold truncate">{[p.role, p.department].filter(Boolean).join(" • ") || "—"}</span>
      </span>
    </button>
  );

  return (
    <div className="relative" ref={boxRef}>
      {value ? (
        <div className="w-full min-h-[38px] px-3 py-1.5 border border-slate-200 rounded-xl flex items-center gap-2 bg-white">
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
            {initials(value)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-slate-800 truncate">{value}</span>
            <span className="block text-[10px] font-semibold text-slate-400 truncate">
              {selected
                ? [selected.role, selected.department].filter(Boolean).join(" • ")
                : allowFree
                  ? "Tên gõ tay — không có trong danh bạ nhân viên"
                  : "Không có trong danh bạ nhân viên — bấm × để chọn lại"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSearch("");
              setOpen(true);
            }}
            title="Chọn người khác"
            aria-label="Chọn người khác"
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
            placeholder={!allowFree ? "Tìm nhân viên…" : bdh ? `Tìm nhân viên ${bdh} hoặc gõ tên…` : "Tìm nhân viên hoặc gõ tên…"}
            className="flex-1 min-w-0 py-0.5 outline-none text-xs font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-400 bg-transparent"
          />
        </div>
      )}

      {open && !value && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-30 max-h-64 overflow-y-auto min-w-[260px]">
          {bdh && (
            <p className="px-4 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Nhân viên {bdh}</p>
          )}
          {bdh && inBdh.length === 0 && (
            <p className="px-4 pb-2 text-[11px] font-semibold text-slate-400">
              {search.trim() ? "Không có ai khớp trong BĐH này." : "BĐH này chưa có nhân viên trong danh bạ."}
            </p>
          )}
          {inBdh.map(row)}

          {others.length > 0 && (
            <>
              {bdh && <p className="px-4 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 border-t border-slate-100">Phòng ban khác</p>}
              {others.map(row)}
            </>
          )}

          {allowFree && search.trim() && ![...inBdh, ...others].some((p) => foldVi(p.name) === foldVi(search)) && (
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
        </div>
      )}
    </div>
  );
}

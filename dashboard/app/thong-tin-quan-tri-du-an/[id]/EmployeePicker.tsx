"use client";

// Ô chọn nhân sự dùng chung cho hồ sơ dự án (tab Thành viên, người phụ trách
// mục pháp lý…): ô tìm không dấu + danh sách có ảnh tròn chữ viết tắt, tên đậm,
// dòng dưới "Phòng ban • Chức danh". Nhân sự của chính BĐH xếp lên đầu.
// Cùng kiểu ô chọn người nói ở Biên bản họp.
//
// freeText:
//   "email" -> gõ đúng 1 email ngoài danh bạ thì cho dùng thẳng (gán vai trò)
//   "name"  -> gõ tên bất kỳ thì cho dùng nguyên chữ (người ngoài, nhà thầu…)

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { splitEmails } from "@/lib/emailMatch";
import { Search, X } from "lucide-react";

export type PickedEmployee = { name: string; email: string; department: string; role: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Bỏ dấu để gõ "son" vẫn ra "Sơn".
function fold(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}

function initials(name: string): string {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// Danh bạ chỉ nạp 1 lần cho cả trang (nhiều ô chọn dùng chung).
let cache: Promise<PickedEmployee[]> | null = null;
function loadDirectory(): Promise<PickedEmployee[]> {
  if (!cache) {
    cache = (async () => {
      const { data } = await supabase.from("employees_directory").select("name, email, department, role").order("name");
      const list: PickedEmployee[] = [];
      ((data as { name: string; email: string | null; department: string | null; role: string | null }[]) || []).forEach((e) => {
        // Bỏ hồ sơ không có email thật (ô ghi "n/a"…).
        const first = splitEmails(e.email).find((x) => EMAIL_RE.test(x));
        if (first) list.push({ name: e.name, email: first, department: e.department || "", role: e.role || "" });
      });
      // Rỗng (phiên đăng nhập chưa sẵn / lỗi mạng) thì không giữ, lần sau nạp lại.
      if (!list.length) cache = null;
      return list;
    })();
  }
  return cache;
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
      {initials(name)}
    </span>
  );
}

export default function EmployeePicker({
  value,
  onChange,
  bdhName,
  freeText,
  placeholder = "Tìm tên, email hoặc phòng ban…",
}: {
  value: PickedEmployee | null;
  onChange: (v: PickedEmployee | null) => void;
  bdhName?: string;
  freeText?: "email" | "name";
  placeholder?: string;
}) {
  const [emps, setEmps] = useState<PickedEmployee[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    loadDirectory().then((list) => {
      if (!alive) return;
      const sorted = bdhName
        ? [...list].sort((a, b) => Number(b.department === bdhName) - Number(a.department === bdhName))
        : list;
      setEmps(sorted);
    });
    return () => {
      alive = false;
    };
  }, [bdhName]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const options = useMemo(() => {
    const q = fold(search.trim());
    const list = q ? emps.filter((e) => fold(`${e.name} ${e.email} ${e.department} ${e.role}`).includes(q)) : emps;
    return list.slice(0, 60);
  }, [emps, search]);

  const typed = search.trim();
  let custom: PickedEmployee | null = null;
  if (freeText === "email" && EMAIL_RE.test(typed) && !emps.some((e) => e.email === typed.toLowerCase())) {
    custom = { name: typed.toLowerCase(), email: typed.toLowerCase(), department: "Ngoài danh bạ", role: "" };
  } else if (freeText === "name" && typed && !emps.some((e) => e.name.toLowerCase() === typed.toLowerCase())) {
    custom = { name: typed, email: "", department: "Ngoài danh bạ", role: "" };
  }

  const pick = (e: PickedEmployee) => {
    onChange(e);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className="relative" ref={ref}>
      {value ? (
        <div className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
          <Avatar name={value.name} />
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] font-bold text-slate-700 truncate">{value.name}</span>
            <span className="block text-[10px] text-slate-400 font-semibold truncate">
              {value.department || "Chưa xếp phòng"}
              {value.role ? ` • ${value.role}` : ""}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(true);
            }}
            title="Chọn người khác"
            className="text-slate-400 hover:text-rose-500 shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <div className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40">
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
            className="flex-1 min-w-0 outline-none text-[11px] font-semibold placeholder:font-normal bg-transparent text-slate-800"
          />
        </div>
      )}

      {open && !value && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-64 overflow-y-auto animate-in fade-in duration-150">
          {custom && (
            <button
              type="button"
              onClick={() => pick(custom!)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100"
            >
              <span className="block text-[11px] font-bold text-[#005BAC] truncate">
                {freeText === "email" ? `Dùng email: ${custom.email}` : `Dùng nguyên tên: "${custom.name}"`}
              </span>
              <span className="block text-[10px] text-slate-400 font-semibold">Không có trong danh bạ nhân sự</span>
            </button>
          )}
          {options.length === 0 ? (
            !custom && <p className="text-center text-slate-400 text-[11px] italic py-4">Không tìm thấy nhân sự phù hợp.</p>
          ) : (
            options.map((e) => (
              <button
                key={e.email}
                type="button"
                onClick={() => pick(e)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left"
              >
                <Avatar name={e.name} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-bold text-slate-700 truncate">{e.name}</span>
                  <span className="block text-[10px] text-slate-400 font-semibold truncate">
                    {e.department || "Chưa xếp phòng"}
                    {e.role ? ` • ${e.role}` : ""}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Tìm hồ sơ theo tên đã lưu (mục pháp lý chỉ lưu tên) để hiện lại thẻ có phòng ban.
export async function findEmployeeByName(name: string): Promise<PickedEmployee | null> {
  if (!name.trim()) return null;
  const list = await loadDirectory();
  return (
    list.find((e) => e.name.toLowerCase() === name.trim().toLowerCase()) || {
      name: name.trim(),
      email: "",
      department: "Ngoài danh bạ",
      role: "",
    }
  );
}

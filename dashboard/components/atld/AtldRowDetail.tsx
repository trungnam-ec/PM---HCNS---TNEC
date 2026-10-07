"use client";

// ============================================================
// Popup "xem toàn bộ thông tin một dòng" dùng chung cho các bảng của module
// P. An toàn lao động (user yêu cầu 07/10/2026): bảng nhiều cột, màn hình nhỏ phải
// cuộn ngang mới đọc hết -> bấm vào dòng là hiện đủ thông tin giữa màn hình.
// Cùng khuôn với popup chi tiết của tab Khấu trừ xử phạt.
// Màu nền chỉ dùng các lớp đã có bản dark mode trong globals.css.
// ============================================================

import type { MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type DetailField = { label: string; value: ReactNode; wide?: boolean; strong?: boolean };
export type DetailSection = { title?: string; tone?: "blue" | "orange" | "slate"; fields: DetailField[] };
export type DetailStat = { label: string; value: ReactNode; tone?: "slate" | "rose" | "emerald" | "blue" };

// Bấm vào nút / ô nhập / link trong dòng thì KHÔNG mở popup.
export function isRowClick(e: MouseEvent): boolean {
  return !(e.target as HTMLElement).closest("button, a, input, select, textarea, label");
}

const SECTION_CLS = {
  blue: { box: "border-blue-100 bg-blue-50/70", title: "text-[#005BAC]" },
  orange: { box: "border-orange-100 bg-orange-50/40", title: "text-orange-700" },
  slate: { box: "border-slate-100 bg-slate-50", title: "text-slate-500" },
};

const STAT_CLS = {
  slate: { box: "bg-slate-50 border-slate-100", val: "text-slate-800" },
  rose: { box: "bg-rose-50 border-rose-100", val: "text-rose-600" },
  emerald: { box: "bg-emerald-50 border-emerald-100", val: "text-emerald-600" },
  blue: { box: "bg-blue-50 border-blue-100", val: "text-[#005BAC]" },
};

export default function AtldRowDetail({
  title, badges, stats, sections, children, actions, onClose,
}: {
  title: ReactNode;
  children?: ReactNode; // khối thêm sau các mục (VD danh sách dòng hàng của phiếu)
  badges?: ReactNode;
  stats?: DetailStat[];
  sections: DetailSection[];
  actions?: ReactNode;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-extrabold text-sm text-slate-800">{title}</h2>
            {badges && <div className="flex flex-wrap items-center gap-1.5 mt-1.5">{badges}</div>}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {stats && stats.length > 0 && (
          <div className={`grid gap-2 ${stats.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : stats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {stats.map((s) => {
              const c = STAT_CLS[s.tone || "slate"];
              return (
                <div key={s.label} className={`rounded-xl border px-3 py-2 ${c.box}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</p>
                  <p className={`text-sm font-extrabold tabular-nums ${c.val}`}>{s.value}</p>
                </div>
              );
            })}
          </div>
        )}

        {sections.map((sec, i) => {
          const c = SECTION_CLS[sec.tone || "slate"];
          return (
            <section key={sec.title || i} className={`rounded-xl border p-4 space-y-3 ${c.box}`}>
              {sec.title && <p className={`text-[11px] font-extrabold uppercase tracking-wider ${c.title}`}>{sec.title}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sec.fields.map((f) => (
                  <div key={f.label} className={f.wide ? "sm:col-span-2" : ""}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{f.label}</p>
                    <div className={`text-xs mt-0.5 whitespace-pre-line break-words ${f.strong ? "font-extrabold text-slate-800" : "font-semibold text-slate-700"}`}>
                      {f.value === null || f.value === undefined || f.value === "" ? <span className="text-slate-300">—</span> : f.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {children}

        <div className="flex flex-wrap justify-end gap-2">
          {actions}
          <button type="button" onClick={onClose} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

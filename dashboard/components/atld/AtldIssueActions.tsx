"use client";

// Nút thao tác nhỏ + hộp nhập lý do dùng chung cho phiếu xuất kho (tab "Xuất kho cho
// BĐH/Đối tác"). Tách ra từ AtldPriceTab ngày 02/10/2026 khi chuyển thao tác phiếu
// sang tab riêng.

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function IconAct({ title, danger, tone, onClick, children }: { title: string; danger?: boolean; tone?: "ok"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
        tone === "ok"
          ? "text-emerald-600 hover:bg-emerald-50"
          : danger
          ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50"
          : "text-slate-400 hover:text-[#005BAC] hover:bg-blue-50"
      }`}
    >
      {children}
    </button>
  );
}

// Hộp nhập lý do (trả lại / huỷ phiếu) — thay window.prompt.
export function ReasonModal({
  title,
  hint,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  hint: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return createPortal(
    <div className="fixed inset-0 z-[85] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <p className="text-[11px] text-slate-500">{hint}</p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Nhập lý do (bắt buộc)…"
          className="w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:border-[#00AEEF]"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
            Đóng
          </button>
          <button
            type="button"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="h-9 inline-flex items-center px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


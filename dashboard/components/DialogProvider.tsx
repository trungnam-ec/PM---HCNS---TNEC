"use client";

// ============================================================
// DialogProvider — hộp thoại giữa màn hình thay alert()/confirm() của trình duyệt.
//
// VÌ SAO KHÔNG DÙNG useConfirmBox (components/ConfirmDialog.tsx):
// Hộp kia theo lối callback, KHÔNG dừng luồng chạy. Trang Biên bản họp có chuỗi
// xử lý dài (upload -> gỡ băng từng đoạn -> phân tích -> xuất Word), nhiều chỗ
// phải hỏi giữa chừng rồi mới chạy tiếp. Viết theo lối callback thì phải bẻ cả
// pipeline thành hàng chục hàm con. Hộp này trả về Promise nên giữ nguyên được
// mạch `await` — đổi lại phải thêm `await` trước mỗi lời gọi.
//
// Giao diện bê nguyên mẫu của ConfirmDialog cho đồng bộ toàn hệ thống.
//
// CÁCH DÙNG:
//   const dialog = useDialog();
//   await dialog.alert("Đã lưu.", { title: "Xong", tone: "success" });
//   const ok = await dialog.confirm("Xoá hẳn?", { tone: "danger", confirmText: "Xoá" });
//
// LƯU Ý KHI DỰNG TRANG: phải tách làm 2 component — một hàm bọc <DialogProvider>,
// một hàm chứa nội dung gọi useDialog(). Component KHÔNG dùng được context do
// chính nó tạo ra.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Trash2 } from "lucide-react";

export type DialogTone = "info" | "success" | "warning" | "danger";

type DialogOptions = {
  title?: string;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
};

type DialogRequest = DialogOptions & {
  message: string;
  kind: "alert" | "confirm";
  resolve: (value: boolean) => void;
};

type DialogApi = {
  alert: (message: string, options?: DialogOptions) => Promise<void>;
  confirm: (message: string, options?: DialogOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogApi | null>(null);

const TONE_STYLE: Record<DialogTone, { ring: string; btn: string; Icon: typeof Info; title: string }> = {
  info:    { ring: "bg-blue-50 text-[#005BAC] ring-blue-500/10",     btn: "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20",      Icon: Info,          title: "Thông báo" },
  success: { ring: "bg-emerald-50 text-emerald-500 ring-emerald-500/10", btn: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20", Icon: CheckCircle2, title: "Thành công" },
  warning: { ring: "bg-amber-50 text-amber-500 ring-amber-500/10",   btn: "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20",      Icon: AlertTriangle, title: "Lưu ý" },
  danger:  { ring: "bg-rose-50 text-rose-500 ring-rose-500/10",      btn: "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20",       Icon: Trash2,        title: "Cảnh báo" },
};

function DialogBox({ box, onDone }: { box: DialogRequest; onDone: (value: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(false);
      if (e.key === "Enter" && box.kind === "alert") onDone(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [box.kind, onDone]);

  const tone = box.tone ?? "info";
  const s = TONE_STYLE[tone];
  const { Icon } = s;

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[95] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => onDone(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-md p-7 shadow-2xl border border-slate-100 text-center space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
      >
        <div className="flex justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ring-8 ${s.ring}`}>
            <Icon size={32} strokeWidth={2.2} />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-heading font-extrabold text-sm text-slate-800">{box.title || s.title}</h3>
          {/* whitespace-pre-line: giữ nguyên xuống dòng của thông báo nhiều đoạn,
              thứ alert() gốc không làm được. max-h + overflow cho thông báo dài. */}
          <p className="text-[11px] font-semibold text-slate-500 leading-relaxed whitespace-pre-line text-left max-h-[50vh] overflow-y-auto">
            {box.message}
          </p>
        </div>

        {box.kind === "confirm" ? (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onDone(false)}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
            >
              {box.cancelText || "Huỷ bỏ"}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => onDone(true)}
              className={`flex-1 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer ${s.btn}`}
            >
              {box.confirmText || "Đồng ý"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            autoFocus
            onClick={() => onDone(true)}
            className={`w-full text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer ${s.btn}`}
          >
            {box.confirmText || "OK"}
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}

export function DialogProvider({ children }: { children: ReactNode }) {
  // Hàng đợi: pipeline có thể bắn 2 thông báo sát nhau, hộp sau không được nuốt hộp trước.
  const [queue, setQueue] = useState<DialogRequest[]>([]);

  const push = useCallback((req: Omit<DialogRequest, "resolve">) => {
    return new Promise<boolean>(resolve => {
      setQueue(prev => [...prev, { ...req, resolve } as DialogRequest]);
    });
  }, []);

  const api: DialogApi = {
    alert: useCallback(async (message: string, options?: DialogOptions) => {
      await push({ ...options, message, kind: "alert" });
    }, [push]),
    confirm: useCallback((message: string, options?: DialogOptions) => {
      return push({ ...options, message, kind: "confirm" });
    }, [push]),
  };

  const current = queue[0];
  const done = useCallback((value: boolean) => {
    setQueue(prev => {
      const [first, ...rest] = prev;
      first?.resolve(value);
      return rest;
    });
  }, []);

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && <DialogBox box={current} onDone={done} />}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog phải nằm trong <DialogProvider>. Nhớ tách trang làm 2 component: hàm ngoài bọc Provider, hàm trong gọi useDialog().");
  }
  return ctx;
}

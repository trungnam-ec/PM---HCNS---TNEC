"use client";

// ============================================================
// ConfirmDialog — hộp hỏi "có chắc không" căn GIỮA màn hình.
//
// Thay cho window.confirm(): hộp của trình duyệt luôn dính mép trên, hiện tên
// miền "www.nhansutrungnamec.com cho biết" và không theo được giao diện chung.
// Mẫu thiết kế bê từ hộp đã dùng ở trang Lịch (app/calendar) cho đồng bộ.
//
// createPortal xuống document.body: các panel của /bao-cao nằm trong thẻ có
// backdrop-filter, mà phần tử `fixed` bên trong khối đó bị nhốt lại chứ không
// căn theo màn hình nữa.
//
// z-[90]: phải nổi trên CẢ modal sửa đối tác / xem hồ sơ (z-50, z-[60]) vì nút
// xoá nằm ngay trong mấy modal đó.
//
// CÁCH DÙNG:
//   const { ask, confirmNode } = useConfirmBox();
//   ...
//   ask({ title: "Xoá phiếu ABC?", message: "...", onConfirm: () => doDelete() });
//   ...
//   return (<>...{confirmNode}</>);
//
// Khác window.confirm ở một điểm PHẢI nhớ: hàm này KHÔNG dừng luồng chạy. Việc
// cần làm đặt hết trong onConfirm, đừng viết tiếp ở dòng dưới ask().
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, AlertTriangle, CheckCircle2, XCircle, Info, MessageSquareText } from "lucide-react";

export type ConfirmRequest = {
  title: string;
  message?: string;
  /** Chữ trên nút xác nhận. Mặc định "Xoá". */
  confirmLabel?: string;
  /** "danger" (mặc định) = nút đỏ + biểu tượng thùng rác. */
  tone?: "danger" | "normal";
  onConfirm: () => void;
};

export function ConfirmDialog({ box, onClose }: { box: ConfirmRequest; onClose: () => void }) {
  // Esc để thoát — hộp này che cả màn hình, không nên bắt buộc phải rê chuột.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Không cần chốt "đã mount": hộp chỉ dựng lên sau một cú bấm của người dùng,
  // lúc đó chắc chắn đang ở trình duyệt (cùng lối với ModalShell trong repo).
  const danger = (box.tone ?? "danger") === "danger";

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm p-7 shadow-2xl border border-slate-100 text-center space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
      >
        <div className="flex justify-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center ring-8 ${
              danger
                ? "bg-rose-50 text-rose-500 ring-rose-500/10"
                : "bg-amber-50 text-amber-500 ring-amber-500/10"
            }`}
          >
            {danger
              ? <Trash2 size={32} strokeWidth={2.2} />
              : <AlertTriangle size={32} strokeWidth={2.2} />}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-heading font-extrabold text-sm text-slate-800">{box.title}</h3>
          {box.message && (
            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed whitespace-pre-line">
              {box.message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            Huỷ bỏ
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => { const run = box.onConfirm; onClose(); run(); }}
            className={`flex-1 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer ${
              danger
                ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
                : "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20"
            }`}
          >
            {box.confirmLabel || "Xoá"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Gói sẵn state cho component dùng: trả về hàm hỏi + phần tử cần render. */
export function useConfirmBox() {
  const [box, setBox] = useState<ConfirmRequest | null>(null);
  const ask = useCallback((req: ConfirmRequest) => setBox(req), []);
  const close = useCallback(() => setBox(null), []);
  return {
    ask,
    confirmNode: box ? <ConfirmDialog box={box} onClose={close} /> : null,
  };
}

// ============================================================
// NoticeDialog — hộp THÔNG BÁO một nút "OK" căn GIỮA màn hình.
//
// Thay cho window.alert(): hộp của trình duyệt dính mép trên, hiện tên miền
// "www.nhansutrungnamec.com cho biết" và không theo giao diện chung. Dùng chung
// một mẫu với ConfirmDialog cho đồng bộ.
//
// CÁCH DÙNG:
//   const { notify, noticeNode } = useNoticeBox();
//   ...
//   notify("Đã lưu nhóm.", "success");
//   ...
//   return (<>...{noticeNode}</>);
// ============================================================

export type NoticeTone = "success" | "error" | "warn" | "info";

export type NoticeRequest = {
  message: string;
  tone?: NoticeTone;
  /** Chữ trên nút. Mặc định "OK". */
  okLabel?: string;
};

const NOTICE_STYLE: Record<
  NoticeTone,
  { title: string; ring: string; btn: string; Icon: typeof Info }
> = {
  success: { title: "Thành công", ring: "bg-emerald-50 text-emerald-500 ring-emerald-500/10", btn: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20", Icon: CheckCircle2 },
  error: { title: "Có lỗi", ring: "bg-rose-50 text-rose-500 ring-rose-500/10", btn: "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20", Icon: XCircle },
  warn: { title: "Lưu ý", ring: "bg-amber-50 text-amber-500 ring-amber-500/10", btn: "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20", Icon: AlertTriangle },
  info: { title: "Thông báo", ring: "bg-blue-50 text-[#005BAC] ring-blue-500/10", btn: "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20", Icon: Info },
};

export function NoticeDialog({ box, onClose }: { box: NoticeRequest; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = NOTICE_STYLE[box.tone ?? "info"];
  const { Icon } = s;

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm p-7 shadow-2xl border border-slate-100 text-center space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
      >
        <div className="flex justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ring-8 ${s.ring}`}>
            <Icon size={32} strokeWidth={2.2} />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-heading font-extrabold text-sm text-slate-800">{s.title}</h3>
          <p className="text-[11px] font-semibold text-slate-500 leading-relaxed whitespace-pre-line">
            {box.message}
          </p>
        </div>

        <button
          type="button"
          autoFocus
          onClick={onClose}
          className={`w-full text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer ${s.btn}`}
        >
          {box.okLabel || "OK"}
        </button>
      </div>
    </div>,
    document.body
  );
}

/** Gói sẵn state cho component dùng: trả về hàm thông báo + phần tử cần render. */
export function useNoticeBox() {
  const [box, setBox] = useState<NoticeRequest | null>(null);
  const notify = useCallback((message: string, tone: NoticeTone = "info", okLabel?: string) => {
    setBox({ message, tone, okLabel });
  }, []);
  const close = useCallback(() => setBox(null), []);
  return {
    notify,
    noticeNode: box ? <NoticeDialog box={box} onClose={close} /> : null,
  };
}

// ============================================================
// PromptDialog — hộp NHẬP MỘT ĐOẠN VĂN BẢN căn GIỮA màn hình.
//
// Thay cho window.prompt() (dính mép trên, hiện tên miền, không theo giao diện
// chung). Dùng cho các luồng cần lý do: "Nhập lý do từ chối...".
//
// CÁCH DÙNG:
//   const { askText, promptNode } = usePromptBox();
//   ...
//   askText({ title: "Từ chối yêu cầu", message: "Nhập lý do...",
//             confirmLabel: "Gửi từ chối", onSubmit: (reason) => doReject(reason) });
//   ...
//   return (<>...{promptNode}</>);
//
// Giống ConfirmDialog: KHÔNG dừng luồng chạy. Việc cần làm đặt trong onSubmit.
// ============================================================

export type PromptRequest = {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  /** Chữ trên nút gửi. Mặc định "Xác nhận". */
  confirmLabel?: string;
  /** Bắt buộc nhập (không cho gửi khi rỗng). Mặc định true. */
  required?: boolean;
  /** "danger" (mặc định) = nút đỏ (dùng cho từ chối). */
  tone?: "danger" | "normal";
  onSubmit: (value: string) => void;
};

export function PromptDialog({ box, onClose }: { box: PromptRequest; onClose: () => void }) {
  const [value, setValue] = useState(box.defaultValue ?? "");
  const required = box.required ?? true;
  const danger = (box.tone ?? "danger") === "danger";
  const canSubmit = !required || value.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const run = box.onSubmit;
    onClose();
    run(value.trim());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[90] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm p-7 shadow-2xl border border-slate-100 text-center space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
      >
        <div className="flex justify-center">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center ring-8 ${
              danger
                ? "bg-rose-50 text-rose-500 ring-rose-500/10"
                : "bg-blue-50 text-[#005BAC] ring-blue-500/10"
            }`}
          >
            <MessageSquareText size={30} strokeWidth={2.2} />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-heading font-extrabold text-sm text-slate-800">{box.title}</h3>
          {box.message && (
            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed whitespace-pre-line">
              {box.message}
            </p>
          )}
        </div>

        <textarea
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={box.placeholder || "Nhập nội dung..."}
          rows={3}
          className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none resize-none focus:border-[#005BAC] focus:bg-white transition-all placeholder:text-slate-400 placeholder:font-normal"
        />

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            Huỷ bỏ
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={`flex-1 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm transition-all active:scale-95 ${
              !canSubmit
                ? "bg-slate-300 cursor-not-allowed"
                : danger
                  ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20 cursor-pointer"
                  : "bg-[#005BAC] hover:bg-blue-700 shadow-blue-500/20 cursor-pointer"
            }`}
          >
            {box.confirmLabel || "Xác nhận"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Gói sẵn state cho component dùng: trả về hàm hỏi văn bản + phần tử cần render. */
export function usePromptBox() {
  const [box, setBox] = useState<PromptRequest | null>(null);
  const askText = useCallback((req: PromptRequest) => setBox(req), []);
  const close = useCallback(() => setBox(null), []);
  return {
    askText,
    promptNode: box ? <PromptDialog box={box} onClose={close} /> : null,
  };
}

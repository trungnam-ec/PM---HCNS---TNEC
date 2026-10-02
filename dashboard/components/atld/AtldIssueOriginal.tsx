"use client";

// Chứng từ gốc của phiếu xuất kho (migration 124, user yêu cầu 02/10/2026):
// 1 tệp ảnh / PDF ≤ 2MB, tệp lớn hơn thì dán link (Drive...). Thủ kho / người
// duyệt xuất sửa được ở MỌI trạng thái phiếu; người khác chỉ xem.

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Loader2, AlertCircle, FileText, ExternalLink, Trash2, Link2 } from "lucide-react";
import {
  type IssueRow,
  uploadIssueOriginal,
  setIssueOriginal,
  removeIssueOriginalFile,
  resolveIssueOriginalUrl,
} from "@/lib/atldVouchers";
import { BTN_OUTLINE, BTN_PRIMARY } from "@/components/atld/ui";

export default function AtldIssueOriginal({ row, canManage, onClose, onSaved }: { row: IssueRow; canManage: boolean; onClose: () => void; onSaved: () => void }) {
  const [filePath, setFilePath] = useState(row.goc_file_path);
  const [fileName, setFileName] = useState(row.goc_file_name);
  const [savedLink, setSavedLink] = useState(row.goc_link || "");
  const [link, setLink] = useState(row.goc_link || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Tải tệp mới -> ghi CSDL -> mới xoá tệp cũ (ghi CSDL hỏng thì tệp cũ còn nguyên).
  const pickFile = (file: File) =>
    run(async () => {
      const up = await uploadIssueOriginal(row.id, file);
      const e = await setIssueOriginal(row.id, up.path, up.name, savedLink || null);
      if (e) {
        await removeIssueOriginalFile(up.path);
        throw new Error(e);
      }
      if (filePath) await removeIssueOriginalFile(filePath);
      setFilePath(up.path);
      setFileName(up.name);
      onSaved();
    });

  const removeFile = () =>
    run(async () => {
      if (!filePath) return;
      const e = await setIssueOriginal(row.id, null, null, savedLink || null);
      if (e) throw new Error(e);
      await removeIssueOriginalFile(filePath);
      setFilePath(null);
      setFileName(null);
      onSaved();
    });

  const saveLink = () =>
    run(async () => {
      const v = link.trim();
      if (v && !/^https?:\/\//i.test(v)) throw new Error("Link phải bắt đầu bằng http:// hoặc https://");
      const e = await setIssueOriginal(row.id, filePath, fileName, v || null);
      if (e) throw new Error(e);
      setSavedLink(v);
      onSaved();
    });

  const openFile = () =>
    run(async () => {
      if (!filePath) return;
      // Mở tab TRƯỚC khi chờ ký link — trình duyệt chặn window.open sau await.
      const w = window.open("", "_blank");
      const url = await resolveIssueOriginalUrl(filePath);
      if (!url) {
        w?.close();
        throw new Error("Không mở được tệp — tệp đã bị xoá hoặc tài khoản không có quyền xem.");
      }
      if (w) w.location.href = url;
      else window.location.href = url;
    });

  return createPortal(
    <div className="fixed inset-0 z-[85] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">
            Chứng từ gốc · <span className="font-mono text-[#005BAC]">{row.so_phieu}</span>
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {err && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-3 py-2.5 rounded-xl">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {err}
          </div>
        )}

        {/* ── Tệp ── */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-500">Tệp gốc (ảnh hoặc PDF, tối đa 2MB)</p>
          {filePath ? (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <FileText size={15} className="text-[#005BAC] shrink-0" />
              <button type="button" onClick={openFile} className="flex-1 min-w-0 text-left text-xs font-semibold text-[#005BAC] hover:underline truncate cursor-pointer" title="Mở tệp">
                {fileName || filePath.split("/").pop()}
              </button>
              {canManage && (
                <button type="button" onClick={removeFile} disabled={busy} title="Gỡ tệp" aria-label="Gỡ tệp" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Chưa có tệp.</p>
          )}
          {canManage && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) pickFile(f);
                }}
              />
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={BTN_OUTLINE}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {filePath ? "Thay tệp khác" : "Chọn tệp tải lên"}
              </button>
            </>
          )}
        </div>

        {/* ── Link ── */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <p className="text-[11px] font-bold text-slate-500 pt-3">Link tệp (khi tệp lớn hơn 2MB — Google Drive, OneDrive…)</p>
          {canManage ? (
            <div className="flex items-center gap-2">
              <div className="h-9 flex-1 flex items-center gap-2 px-3 rounded-xl bg-white border border-slate-200 focus-within:border-[#00AEEF]">
                <Link2 size={14} className="text-slate-400 shrink-0" />
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://drive.google.com/…"
                  className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
              <button type="button" onClick={saveLink} disabled={busy || link.trim() === savedLink} className={BTN_PRIMARY}>
                Lưu link
              </button>
            </div>
          ) : null}
          {savedLink ? (
            <a href={savedLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#005BAC] hover:underline break-all">
              <ExternalLink size={13} className="shrink-0" /> Mở link
            </a>
          ) : (
            !canManage && <p className="text-xs text-slate-400">Chưa có link.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

"use client";

// ============================================================
// Popup duyệt yêu cầu xoá (migration 142) — mở từ chuông:
// /an-toan-lao-dong?delReq=<id>. TP/PP xem nội dung mục bị đề nghị xoá rồi bấm
// "Xác nhận xoá" (hệ thống mới xoá thật) hoặc "Không xoá".
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Ban, AlertCircle } from "lucide-react";
import AtldRowDetail from "./AtldRowDetail";
import { DELETE_KIND_LABEL, decideDeleteRequest, fetchDeleteRequest, type DeleteRequest } from "@/lib/atldDeleteRequests";

const fmtTime = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })
    : "";

export default function AtldDeleteRequestModal({
  id, canApprove, onClose, onDone,
}: {
  id: string;
  canApprove: boolean;
  onClose: () => void;
  onDone: () => void; // đã xoá / đã từ chối -> trang tải lại dữ liệu
}) {
  const [row, setRow] = useState<DeleteRequest | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    fetchDeleteRequest(id).then((r) => {
      setRow(r.row);
      setErr(r.error);
      setLoading(false);
    });
  }, [id]);

  async function decide(approve: boolean) {
    if (busyRef.current || !row) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    const e = await decideDeleteRequest(row.id, approve);
    busyRef.current = false;
    setBusy(false);
    if (e) return setErr(e);
    onDone();
  }

  const pending = row?.status === "pending";
  const statusBadge = row && (
    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
      row.status === "pending" ? "bg-amber-50 text-amber-700" : row.status === "approved" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"
    }`}>
      {row.status === "pending" ? "Chờ duyệt xoá" : row.status === "approved" ? "Đã xoá" : "Không xoá"}
    </span>
  );

  return (
    <AtldRowDetail
      title={row ? `Yêu cầu xoá: ${row.title}` : "Yêu cầu xoá"}
      badges={row && (
        <>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">{DELETE_KIND_LABEL[row.kind]}</span>
          {statusBadge}
        </>
      )}
      sections={row ? [
        {
          title: "Người đề nghị",
          tone: "orange",
          fields: [
            { label: "Người gửi", value: row.requested_by_name || row.requested_by, strong: true },
            { label: "Thời điểm gửi", value: fmtTime(row.requested_at) },
            ...(!pending ? [
              { label: "Người xử lý", value: row.decided_by },
              { label: "Thời điểm xử lý", value: fmtTime(row.decided_at) },
            ] : []),
          ],
        },
        {
          title: "Nội dung đề nghị xoá",
          tone: "slate",
          fields: row.detail.map((d) => ({ label: d.label, value: d.value, wide: d.wide })),
        },
      ] : []}
      onClose={onClose}
      actions={pending && canApprove && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            <Ban size={13} /> Không xoá
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-white px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Xác nhận xoá
          </button>
        </>
      )}
    >
      {loading && (
        <div className="flex items-center gap-2 py-6 justify-center text-slate-400 text-xs font-semibold">
          <Loader2 size={16} className="animate-spin" /> Đang tải…
        </div>
      )}
      {pending && !canApprove && (
        <p className="text-[11px] font-semibold text-slate-500">Đang chờ TP/PP có cờ &quot;Duyệt xuất kho ATLĐ&quot; xác nhận.</p>
      )}
      {pending && canApprove && (
        <p className="text-[11px] font-semibold text-rose-600">Xác nhận xoá là xoá hẳn, không hoàn tác được.</p>
      )}
      {err && (
        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-600">
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {err}
        </p>
      )}
    </AtldRowDetail>
  );
}

"use client";

// Danh sách phiếu BÁO CÁO NGÀY (tab Báo cáo > Báo cáo ngày): ngày mới nhất lên đầu,
// mỗi dòng gọn 1 hàng; bấm vào mới bung bản đầy đủ theo mẫu (DailyReportView).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useConfirmBox } from "@/components/ConfirmDialog";
import { removeLogPhotos } from "@/lib/projectLogPhotos";
import { addDays, formatDate, pcErrorMessage, todayVN, type PcAccess, type PcProject } from "@/lib/projectControl";
import { sumRecord, type DailyUnit } from "@/lib/projectDailyReport";
import DailyReportView from "./DailyReportView";
import DailyReportModal from "./DailyReportModal";
import { ErrorLine } from "./ui";
import { Loader2, ChevronDown, ChevronRight, Users, Truck, CloudRain, Copy, Trash2 } from "lucide-react";

type Row = {
  report_date: string;
  weather_am: string | null;
  weather_pm: string | null;
  units: DailyUnit[];
  reporter_name: string | null;
  updated_by: string | null;
  updated_at: string;
};

const PAGE = 30;
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Nút "Lập báo cáo ngày" nằm trên thanh công cụ của ReportTab (cùng hàng nút In) nên
// trạng thái mở form do ReportTab giữ và truyền xuống.
export default function DailyReportList({
  project,
  access,
  creating,
  setCreating,
}: {
  project: PcProject;
  access: PcAccess;
  creating: boolean;
  setCreating: (v: boolean) => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { ask, confirmNode } = useConfirmBox();

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("pc_daily_reports")
      .select("report_date, weather_am, weather_pm, units, reporter_name, updated_by, updated_at")
      .eq("project_id", project.id)
      .order("report_date", { ascending: false })
      .limit(limit + 1);
    setErr(error ? pcErrorMessage(error) : null);
    setRows(((data as Row[]) || []).map((r) => ({ ...r, units: Array.isArray(r.units) ? r.units : [] })));
  }, [project.id, limit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (!rows)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#005BAC]" size={26} />
      </div>
    );

  const shown = rows.slice(0, limit);

  // Xoá phiếu: RLS cho người duyệt nhật ký (QS/GĐDA/BLĐ) hoặc chính người lập.
  // Ghi CSDL trước, xoá ảnh sau (ảnh chỉ người duyệt xoá được khỏi kho — lỗi thì bỏ qua).
  function removeReport(r: Row) {
    ask({
      title: `Xoá báo cáo ngày ${formatDate(r.report_date)}?`,
      message: "Xoá hẳn phiếu và ảnh hiện trường kèm theo. Nhật ký sản lượng không bị ảnh hưởng.",
      onConfirm: async () => {
        const { data, error } = await supabase
          .from("pc_daily_reports")
          .delete()
          .eq("project_id", project.id)
          .eq("report_date", r.report_date)
          .select("id");
        if (error) return setErr(pcErrorMessage(error));
        if (!data?.length) return setErr("Không xoá được — chỉ người lập phiếu hoặc QS / GĐDA / Ban lãnh đạo được xoá.");
        removeLogPhotos(r.units.flatMap((u) => (Array.isArray(u.photos) ? u.photos.map((p) => p.path) : [])));
        if (open === r.report_date) setOpen(null);
        load();
      },
    });
  }
  const weekday = (d: string) => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];

  return (
    <div className="space-y-3">
      {!rows.length && <p className="text-[11px] text-slate-500 print:hidden">Chưa có phiếu báo cáo ngày nào.</p>}
      <ErrorLine msg={err} />

      <div className="space-y-2">
        {shown.map((r) => {
          const isOpen = open === r.report_date;
          const mp = r.units.reduce((a, u) => a + sumRecord(u.manpower), 0);
          const eq = r.units.reduce((a, u) => a + sumRecord(u.equipment), 0);
          const weather = [r.weather_am, r.weather_pm].filter(Boolean);
          return (
            <div
              key={r.report_date}
              className={`bg-white rounded-2xl border shadow-sm ${isOpen ? "border-blue-200" : "border-slate-100"} ${open && !isOpen ? "print:hidden" : ""}`}
            >
              {/* Cả dòng bấm để bung/thu; nút Nhân đôi nằm ngay sau thông tin người lập. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(isOpen ? null : r.report_date)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(isOpen ? null : r.report_date))}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 cursor-pointer hover:bg-slate-50 rounded-2xl print:hidden"
              >
                {isOpen ? <ChevronDown size={15} className="text-[#005BAC]" /> : <ChevronRight size={15} className="text-slate-400" />}
                <span className="font-extrabold text-xs text-slate-800 w-28">
                  {weekday(r.report_date)}, {formatDate(r.report_date)}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-600 w-40">
                  <CloudRain size={12} className="text-slate-400" />
                  {weather.length ? `Sáng ${r.weather_am || "—"} · Chiều ${r.weather_pm || "—"}` : "—"}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-600 w-24">
                  <Users size={12} className="text-slate-400" /> {mp} người
                </span>
                <span className="flex items-center gap-1 text-[11px] text-slate-600 w-20">
                  <Truck size={12} className="text-slate-400" /> {eq} máy
                </span>
                <span className="text-[11px] text-slate-500 truncate">
                  {r.reporter_name ? `Người lập: ${r.reporter_name}` : ""}
                  {r.updated_by ? ` · cập nhật bởi ${r.updated_by.split("@")[0]}` : ""}
                </span>
                {access.can_log && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCopyFrom(r.report_date);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-[#005BAC] bg-blue-50 hover:bg-blue-100 p-1.5 rounded-lg"
                    title="Nhân đôi — chép phiếu này sang ngày khác để sửa nhanh"
                    aria-label="Nhân đôi phiếu"
                  >
                    <Copy size={13} />
                  </button>
                )}
                {access.can_log && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeReport(r);
                    }}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg"
                    title="Xoá phiếu báo cáo ngày này"
                  >
                    <Trash2 size={12} /> Xoá
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="px-4 pb-4 print:p-0">
                  <DailyReportView project={project} access={access} date={r.report_date} onSaved={load} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rows.length > limit && (
        <div className="flex justify-center print:hidden">
          <button onClick={() => setLimit((n) => n + PAGE)} className="text-[11px] font-bold text-[#005BAC] hover:underline">
            Xem thêm phiếu cũ hơn
          </button>
        </div>
      )}

      {(creating || copyFrom) && (
        <DailyReportModal
          projectId={project.id}
          copyFrom={copyFrom || undefined}
          // Nhân đôi: mặc định sang ngày kế tiếp của phiếu nguồn, không quá hôm nay.
          initialDate={copyFrom ? (addDays(copyFrom, 1) > todayVN() ? todayVN() : addDays(copyFrom, 1)) : undefined}
          onClose={() => {
            setCreating(false);
            setCopyFrom(null);
          }}
          onSaved={(d) => {
            setCreating(false);
            setCopyFrom(null);
            setOpen(d);
            load();
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}

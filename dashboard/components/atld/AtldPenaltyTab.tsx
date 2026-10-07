"use client";

// ============================================================
// Tab "Khấu trừ xử phạt" (migration 139) — thay bảng Excel theo dõi hồ sơ khấu
// trừ / xử phạt vi phạm an toàn. Một dòng = một hồ sơ, hai phòng cùng điền:
//   P.ATLĐ (xanh dương) nhập đầu vào · P.KHĐT (cam) nhập đầu ra ·
//   cột xanh lá tự tính: Còn lại = Phải trừ − Đã trừ, Trạng thái, Số ngày, Cảnh báo.
// Màu dòng: 20–30 ngày cam · trên 30 ngày đỏ · đã khấu trừ xanh lá.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import {
  Search, Plus, Pencil, Trash2, Loader2, AlertCircle, X, FileDown, FileText, Upload, Link2, ExternalLink,
  ClipboardList, Wallet, CircleCheck, Siren,
} from "lucide-react";
import {
  type Penalty, type PenaltyInput, type PenaltyOutput, type PenaltyStatus, type PenaltyAlert,
  PENALTY_TYPES, PENALTY_STATUS_META, fetchPenalties, createPenalty, updatePenalty, deletePenalty,
  uploadPenaltyFile, setPenaltyFile, removePenaltyFile, penaltyFileUrl,
  penaltyStatus, trackingDays, penaltyAlert, todayVN,
} from "@/lib/atldPenalties";
import { fetchSharedPartners, type SharedPartner } from "@/lib/atldVouchers";
import { fetchProjectCatalog, type Project } from "@/lib/projectCatalog";
import { formatMoney, matchesQuery } from "@/lib/atldStock";
import { foldVi } from "@/lib/financePartners";
import AtldPartnerPicker from "@/components/atld/AtldPartnerPicker";
import AtldPersonPicker from "@/components/atld/AtldPersonPicker";
import { BTN_OUTLINE, BTN_PRIMARY, CONTROL_BOX } from "@/components/atld/ui";
import { useConfirmBox } from "@/components/ConfirmDialog";
import { normalizeName } from "@/lib/approvers";

type Row = Penalty & { status: PenaltyStatus; days: number | null; alert: PenaltyAlert; haystack: string };
type Filter = "all" | "open" | "qua_han" | "sap_qua_han" | "da";

const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
const money = (n: number) => `${formatMoney(n)} đ`;

const ROW_BG: Record<Exclude<PenaltyAlert, null>, string> = {
  qua_han: "bg-rose-50/80 hover:bg-rose-100/70",
  sap_qua_han: "bg-orange-50/80 hover:bg-orange-100/70",
  da: "bg-emerald-50/50 hover:bg-emerald-50",
};

export default function AtldPenaltyTab({ canInput, canProcess }: { canInput: boolean; canProcess: boolean }) {
  const [items, setItems] = useState<Penalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [project, setProject] = useState("");
  const [editing, setEditing] = useState<Penalty | "new" | null>(null);
  const { ask, confirmNode } = useConfirmBox();

  const load = useCallback(async () => {
    const r = await fetchPenalties();
    setItems(r.rows);
    setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const today = todayVN();
  const rows: Row[] = useMemo(
    () =>
      items.map((p) => {
        const status = penaltyStatus(p);
        const days = trackingDays(p, today);
        return {
          ...p,
          status,
          days,
          alert: penaltyAlert(status, days),
          haystack: normalizeName(
            [p.ma_ho_so, p.loai_ho_so, p.so_quyet_dinh, p.project_code, p.project_name, p.contractor_name, p.noi_dung, p.nguoi_lap, p.dot_thanh_toan, p.so_chung_tu, p.nguoi_nhap]
              .filter(Boolean)
              .join(" ")
          ),
        };
      }),
    [items, today]
  );

  const projects = useMemo(
    () => Array.from(new Set(rows.map((r) => r.project_name || r.project_code || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")),
    [rows]
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (project && (r.project_name || r.project_code) !== project) return false;
        if (filter === "open" && r.status === "da") return false;
        if (filter === "da" && r.status !== "da") return false;
        if ((filter === "qua_han" || filter === "sap_qua_han") && r.alert !== filter) return false;
        return matchesQuery(r.haystack, query);
      }),
    [rows, filter, project, query]
  );

  const sum = useMemo(() => {
    const s = { phai: 0, da: 0, con: 0, quaHan: 0, sapQuaHan: 0, done: 0, open: 0 };
    for (const r of rows) {
      s.phai += r.gia_tri_phai_tru;
      s.da += r.gia_tri_da_tru;
      s.con += r.gia_tri_con_lai;
      if (r.alert === "qua_han") s.quaHan++;
      if (r.alert === "sap_qua_han") s.sapQuaHan++;
      if (r.status === "da") s.done++;
      else s.open++;
    }
    return s;
  }, [rows]);

  function remove(r: Row) {
    ask({
      title: `Xoá hồ sơ ${r.ma_ho_so}?`,
      message: "Xoá hẳn hồ sơ và tệp quyết định đính kèm, không hoàn tác được.",
      confirmLabel: "Xoá hồ sơ",
      onConfirm: async () => {
        setRowErr(null);
        const e = await deletePenalty(r.id);
        if (e) return setRowErr(`${r.ma_ho_so}: ${e}`);
        if (r.qd_file_path) await removePenaltyFile(r.qd_file_path);
        load();
      },
    });
  }

  const FILTERS: { key: Filter; label: string; count: number; dot: string }[] = [
    { key: "all", label: "Tất cả", count: rows.length, dot: "bg-slate-400" },
    { key: "open", label: "Chưa xong", count: sum.open, dot: "bg-amber-500" },
    { key: "sap_qua_han", label: "20–30 ngày", count: sum.sapQuaHan, dot: "bg-orange-500" },
    { key: "qua_han", label: "Quá hạn", count: sum.quaHan, dot: "bg-rose-500" },
    { key: "da", label: "Đã khấu trừ", count: sum.done, dot: "bg-emerald-500" },
  ];

  const th = "px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap";
  const td = "px-3 py-2.5 align-top";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={ClipboardList} tone="blue" label="Hồ sơ" value={`${rows.length}`} sub={`${sum.open} chưa xong`} />
        <Stat icon={Wallet} tone="slate" label="Phải khấu trừ" value={money(sum.phai)} sub={`Đã trừ ${money(sum.da)}`} />
        <Stat icon={CircleCheck} tone={sum.con > 0 ? "amber" : "emerald"} label="Còn lại phải trừ" value={money(sum.con)} />
        <Stat icon={Siren} tone="rose" label="Quá hạn (> 30 ngày)" value={`${sum.quaHan}`} sub={`${sum.sapQuaHan} hồ sơ 20–30 ngày`} onClick={() => setFilter("qua_han")} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className={`${CONTROL_BOX} flex-1 min-w-[220px] gap-2 px-3 focus-within:border-[#00AEEF]`}>
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm mã hồ sơ, số QĐ, nhà thầu, dự án, nội dung…"
              className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500 cursor-pointer" aria-label="Xoá tìm kiếm">
                <X size={13} />
              </button>
            )}
          </div>
          <select value={project} onChange={(e) => setProject(e.target.value)} className={`${CONTROL_BOX} px-3 text-xs font-semibold text-slate-600 max-w-[240px]`}>
            <option value="">Tất cả dự án</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button type="button" onClick={() => exportExcel(filtered)} disabled={filtered.length === 0} className={BTN_OUTLINE}>
            <FileDown size={14} /> Tải về
          </button>
          {canInput && (
            <button type="button" onClick={() => setEditing("new")} className={BTN_PRIMARY}>
              <Plus size={14} /> Tạo hồ sơ xử phạt
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="inline-flex flex-wrap gap-1 p-1 bg-slate-50 border border-slate-100 rounded-xl">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.key)}
                  className={`h-7 inline-flex items-center gap-1.5 px-3 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    active ? "bg-[#005BAC] text-white shadow-sm" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : f.dot}`} />
                  {f.label}
                  <span className={`tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{f.count}</span>
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-[11px] text-slate-400">
            Đang hiện <b className="text-slate-600">{filtered.length}</b> / {rows.length} hồ sơ
          </span>
        </div>
      </div>

      {(error || rowErr) && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error || rowErr}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-xs font-semibold">
            <Loader2 size={16} className="animate-spin" /> Đang tải hồ sơ…
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-xs font-semibold text-slate-400">
            {rows.length === 0 ? (canInput ? "Chưa có hồ sơ nào — bấm “Tạo hồ sơ xử phạt” để bắt đầu." : "Chưa có hồ sơ nào.") : "Không có hồ sơ khớp bộ lọc."}
          </p>
        ) : (
          <table className="w-full text-xs min-w-[1900px]">
            <thead>
              <tr className="text-white text-[10px] font-extrabold uppercase tracking-wider">
                <th colSpan={10} className="px-3 py-1.5 bg-[#005BAC] text-left">P.ATLĐ nhập — thông tin đầu vào</th>
                <th colSpan={6} className="px-3 py-1.5 bg-orange-500 text-left">P.KHĐT nhập — thông tin đầu ra</th>
                <th colSpan={4} className="px-3 py-1.5 bg-emerald-600 text-left">Tự tính — không sửa tay</th>
                <th rowSpan={2} className="px-3 py-1.5 bg-slate-500" />
              </tr>
              <tr className="text-left">
                {["Mã hồ sơ", "Loại hồ sơ", "Số QĐ / Phiếu cấp phát", "Ngày ban hành", "Dự án", "Nhà thầu phụ", "Nội dung"].map((h) => (
                  <th key={h} className={`${th} bg-blue-50 text-[#005BAC]`}>{h}</th>
                ))}
                <th className={`${th} bg-blue-50 text-[#005BAC] text-right`}>Giá trị phải khấu trừ</th>
                <th className={`${th} bg-blue-50 text-[#005BAC]`}>Người lập</th>
                <th className={`${th} bg-blue-50 text-[#005BAC]`}>Ngày gửi KHĐT</th>
                <th className={`${th} bg-orange-50 text-orange-700`}>Ngày tiếp nhận</th>
                <th className={`${th} bg-orange-50 text-orange-700`}>Đợt thanh toán</th>
                <th className={`${th} bg-orange-50 text-orange-700 text-right`}>Giá trị đã khấu trừ</th>
                <th className={`${th} bg-orange-50 text-orange-700`}>Ngày khấu trừ</th>
                <th className={`${th} bg-orange-50 text-orange-700`}>Số chứng từ</th>
                <th className={`${th} bg-orange-50 text-orange-700`}>Người nhập</th>
                <th className={`${th} bg-emerald-50 text-emerald-700 text-right`}>Giá trị còn lại</th>
                <th className={`${th} bg-emerald-50 text-emerald-700`}>Trạng thái</th>
                <th className={`${th} bg-emerald-50 text-emerald-700 text-right`}>Số ngày theo dõi</th>
                <th className={`${th} bg-emerald-50 text-emerald-700`}>Cảnh báo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-slate-100 last:border-0 ${r.alert ? ROW_BG[r.alert] : "hover:bg-slate-50/60"}`}>
                  <td className={`${td} font-mono font-bold text-[#005BAC] whitespace-nowrap`}>{r.ma_ho_so}</td>
                  <td className={`${td} text-slate-600 whitespace-nowrap`}>{r.loai_ho_so}</td>
                  <td className={`${td} whitespace-nowrap`}><QdCell row={r} /></td>
                  <td className={`${td} tabular-nums text-slate-600 whitespace-nowrap`}>{fmtDate(r.ngay_ban_hanh)}</td>
                  <td className={`${td} text-slate-700`}>
                    {r.project_name || "—"}
                    {r.project_code && <span className="block text-[10px] font-mono text-slate-400">{r.project_code}</span>}
                  </td>
                  <td className={`${td} font-semibold text-slate-700 min-w-[200px]`}>{r.contractor_name}</td>
                  <td className={`${td} text-slate-600 min-w-[220px] whitespace-pre-line`}>{r.noi_dung || "—"}</td>
                  <td className={`${td} text-right tabular-nums font-bold text-slate-800 whitespace-nowrap`}>{money(r.gia_tri_phai_tru)}</td>
                  <td className={`${td} text-slate-600 whitespace-nowrap`}>{r.nguoi_lap || "—"}</td>
                  <td className={`${td} tabular-nums text-slate-600 whitespace-nowrap`}>{fmtDate(r.ngay_gui_khdt) || "—"}</td>
                  <td className={`${td} tabular-nums text-slate-600 whitespace-nowrap`}>{fmtDate(r.ngay_tiep_nhan)}</td>
                  <td className={`${td} text-slate-600 whitespace-nowrap`}>{r.dot_thanh_toan}</td>
                  <td className={`${td} text-right tabular-nums font-semibold text-slate-700 whitespace-nowrap`}>{r.gia_tri_da_tru ? money(r.gia_tri_da_tru) : ""}</td>
                  <td className={`${td} tabular-nums text-slate-600 whitespace-nowrap`}>{fmtDate(r.ngay_khau_tru)}</td>
                  <td className={`${td} text-slate-600 whitespace-nowrap`}>{r.so_chung_tu}</td>
                  <td className={`${td} text-slate-600 whitespace-nowrap`}>{r.nguoi_nhap}</td>
                  <td className={`${td} text-right tabular-nums font-extrabold whitespace-nowrap ${r.gia_tri_con_lai > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(r.gia_tri_con_lai)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${PENALTY_STATUS_META[r.status].cls}`}>{PENALTY_STATUS_META[r.status].label}</span>
                  </td>
                  <td className={`${td} text-right tabular-nums font-bold text-slate-700`}>{r.days ?? ""}</td>
                  <td className={`${td} whitespace-nowrap`}><AlertBadge alert={r.alert} /></td>
                  <td className={`${td} whitespace-nowrap`}>
                    <div className="flex items-center justify-end gap-1">
                      {(canInput || canProcess) && (
                        <IconBtn title="Sửa hồ sơ" onClick={() => setEditing(r)}><Pencil size={13} /></IconBtn>
                      )}
                      {canInput && r.gia_tri_da_tru === 0 && (
                        <IconBtn title="Xoá hồ sơ" danger onClick={() => remove(r)}><Trash2 size={13} /></IconBtn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <PenaltyModal
          item={editing === "new" ? null : editing}
          canInput={canInput}
          canProcess={canProcess}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onChanged={load}
        />
      )}
      {confirmNode}
    </div>
  );
}

function exportExcel(rows: Row[]) {
  const header = [
    "Mã Hồ Sơ", "Loại Hồ Sơ", "Số Quyết Định / Phiếu Cấp Phát", "Ngày Ban Hành", "Mã Dự Án", "Dự Án", "Nhà Thầu Phụ", "Nội Dung",
    "Giá Trị Phải Khấu Trừ", "Người Lập", "Ngày Gửi Thông Tin Cho KHĐT",
    "Ngày Tiếp Nhận", "Đợt Thanh Toán", "Giá Trị Đã Khấu Trừ", "Ngày Khấu Trừ", "Số Chứng Từ", "Người Nhập",
    "Giá Trị Còn Lại", "Trạng Thái Xử Lý", "Số Ngày Theo Dõi", "Cảnh Báo Quá Hạn", "Ghi Chú (KHĐT)",
  ];
  const alertText: Record<Exclude<PenaltyAlert, null>, string> = { qua_han: "QUÁ HẠN", sap_qua_han: "Sắp quá hạn", da: "" };
  const body = rows.map((r) => [
    r.ma_ho_so, r.loai_ho_so, r.so_quyet_dinh || "", fmtDate(r.ngay_ban_hanh), r.project_code || "", r.project_name || "", r.contractor_name, r.noi_dung || "",
    r.gia_tri_phai_tru, r.nguoi_lap || "", fmtDate(r.ngay_gui_khdt),
    fmtDate(r.ngay_tiep_nhan), r.dot_thanh_toan || "", r.gia_tri_da_tru || "", fmtDate(r.ngay_khau_tru), r.so_chung_tu || "", r.nguoi_nhap || "",
    r.gia_tri_con_lai, PENALTY_STATUS_META[r.status].label, r.days ?? "", r.alert ? alertText[r.alert] : "", r.ghi_chu || "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([
    ["BẢNG THEO DÕI HỒ SƠ KHẤU TRỪ - XỬ PHẠT VI PHẠM AN TOÀN (ATLĐ & KHĐT)"],
    [`Xuất lúc ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`],
    [],
    header,
    ...body,
  ]);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Khau tru xu phat");
  XLSX.writeFile(wb, `Khau_tru_xu_phat_${todayVN()}.xlsx`);
}

function AlertBadge({ alert }: { alert: PenaltyAlert }) {
  if (alert === "qua_han") return <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-600 text-white">QUÁ HẠN</span>;
  if (alert === "sap_qua_han") return <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-orange-500 text-white">Sắp quá hạn</span>;
  return null;
}

function QdCell({ row }: { row: Penalty }) {
  const [busy, setBusy] = useState(false);
  const label = row.so_quyet_dinh || (row.qd_file_path || row.qd_link ? "Xem tệp" : "—");
  if (!row.qd_file_path && !row.qd_link) return <span className="text-slate-600">{label}</span>;
  const open = async () => {
    if (row.qd_link && !row.qd_file_path) {
      window.open(row.qd_link, "_blank", "noopener,noreferrer");
      return;
    }
    // Mở tab TRƯỚC khi chờ ký link — trình duyệt chặn window.open sau await.
    const w = window.open("", "_blank");
    setBusy(true);
    const url = await penaltyFileUrl(row.qd_file_path!);
    setBusy(false);
    if (!url) {
      w?.close();
      alert("Không mở được tệp — tệp đã bị xoá hoặc tài khoản không có quyền xem.");
      return;
    }
    if (w) w.location.href = url;
    else window.location.href = url;
  };
  return (
    <button type="button" onClick={open} className="inline-flex items-center gap-1 font-semibold text-[#005BAC] hover:underline cursor-pointer" title="Mở quyết định">
      {busy ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} {label}
    </button>
  );
}

function Stat({
  icon: Icon, label, value, sub, tone, onClick,
}: {
  icon: typeof Wallet; label: string; value: string; sub?: string; tone: "blue" | "slate" | "amber" | "emerald" | "rose"; onClick?: () => void;
}) {
  const toneCls = {
    blue: "bg-blue-50 text-[#005BAC]",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-500",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-500",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 text-left enabled:hover:border-slate-200 enabled:cursor-pointer disabled:cursor-default"
    >
      <span className={`w-9 h-9 rounded-xl hidden sm:flex items-center justify-center shrink-0 ${toneCls}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">{label}</span>
        <span className="block text-base sm:text-lg font-extrabold text-slate-800 tabular-nums truncate">{value}</span>
        {sub && <span className="block text-[10px] font-semibold text-slate-400 truncate">{sub}</span>}
      </span>
    </button>
  );
}

function IconBtn({ title, danger, onClick, children }: { title: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg text-slate-400 transition-all cursor-pointer ${danger ? "hover:text-rose-600 hover:bg-rose-50" : "hover:text-[#005BAC] hover:bg-blue-50"}`}
    >
      {children}
    </button>
  );
}

// ─── Form tạo / sửa hồ sơ ───
const parseMoney = (t: string): number => Number(t.replace(/\D/g, "")) || 0;
const moneyText = (n: number) => (n ? formatMoney(n) : "");

function PenaltyModal({
  item, canInput, canProcess, onClose, onSaved, onChanged,
}: {
  item: Penalty | null;
  canInput: boolean;
  canProcess: boolean;
  onClose: () => void;
  onSaved: () => void;
  onChanged: () => void;
}) {
  const [inp, setInp] = useState<PenaltyInput>({
    loai_ho_so: item?.loai_ho_so ?? PENALTY_TYPES[0],
    so_quyet_dinh: item?.so_quyet_dinh ?? "",
    qd_link: item?.qd_link ?? "",
    ngay_ban_hanh: item?.ngay_ban_hanh ?? "",
    project_code: item?.project_code ?? "",
    project_name: item?.project_name ?? "",
    contractor_id: item?.contractor_id ?? null,
    contractor_name: item?.contractor_name ?? "",
    noi_dung: item?.noi_dung ?? "",
    gia_tri_phai_tru: item?.gia_tri_phai_tru ?? 0,
    nguoi_lap: item?.nguoi_lap ?? "",
    ngay_gui_khdt: item?.ngay_gui_khdt ?? "",
  });
  const [out, setOut] = useState<PenaltyOutput>({
    ngay_tiep_nhan: item?.ngay_tiep_nhan ?? "",
    dot_thanh_toan: item?.dot_thanh_toan ?? "",
    gia_tri_da_tru: item?.gia_tri_da_tru ?? 0,
    ngay_khau_tru: item?.ngay_khau_tru ?? "",
    so_chung_tu: item?.so_chung_tu ?? "",
    nguoi_nhap: item?.nguoi_nhap ?? "",
    ghi_chu: item?.ghi_chu ?? "",
  });
  const [file, setFile] = useState<{ path: string | null; name: string | null }>({ path: item?.qd_file_path ?? null, name: item?.qd_file_name ?? null });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [partners, setPartners] = useState<SharedPartner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const savingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    fetchSharedPartners().then((p) => {
      if (!alive) return;
      // Ưu tiên nhà thầu phụ; danh mục chưa phân loại thì hiện hết.
      const ntp = p.filter((x) => x.party_type === "nha_thau_phu");
      setPartners(ntp.length ? ntp : p);
    });
    fetchProjectCatalog().then((c) => alive && setProjects(c.projects));
    return () => {
      alive = false;
    };
  }, []);

  const setI = <K extends keyof PenaltyInput>(k: K, v: PenaltyInput[K]) => setInp((p) => ({ ...p, [k]: v }));
  const setO = <K extends keyof PenaltyOutput>(k: K, v: PenaltyOutput[K]) => setOut((p) => ({ ...p, [k]: v }));
  const conLai = inp.gia_tri_phai_tru - out.gia_tri_da_tru;
  const status = penaltyStatus({ gia_tri_con_lai: conLai, gia_tri_da_tru: out.gia_tri_da_tru });

  async function save() {
    if (savingRef.current) return;
    if (canInput) {
      if (!inp.contractor_name.trim()) return setErr("Chọn Nhà thầu phụ.");
      if (!(inp.gia_tri_phai_tru > 0)) return setErr("Nhập Giá trị phải khấu trừ.");
      if (inp.qd_link?.trim() && !/^https?:\/\//i.test(inp.qd_link.trim())) return setErr("Link quyết định phải bắt đầu bằng http:// hoặc https://");
    }
    if (canProcess && out.gia_tri_da_tru > inp.gia_tri_phai_tru) return setErr("Giá trị đã khấu trừ không được lớn hơn giá trị phải khấu trừ.");
    savingRef.current = true;
    setSaving(true);
    setErr("");
    let id = item?.id ?? null;
    let e: string | null;
    if (id) {
      e = await updatePenalty(id, canInput ? inp : null, canProcess ? out : null);
    } else {
      const r = await createPenalty(inp, canProcess ? out : null);
      e = r.error;
      id = r.id;
    }
    // Tệp chọn sẵn: tải lên SAU khi có id hồ sơ -> ghi CSDL -> xoá tệp cũ.
    if (!e && id && pendingFile) {
      try {
        const up = await uploadPenaltyFile(id, pendingFile);
        const er = await setPenaltyFile(id, up.path, up.name);
        if (er) {
          await removePenaltyFile(up.path);
          e = `Đã lưu hồ sơ nhưng chưa gắn được tệp: ${er}`;
        } else {
          if (file.path) await removePenaltyFile(file.path);
          setFile({ path: up.path, name: up.name });
          setPendingFile(null);
        }
      } catch (x) {
        e = `Đã lưu hồ sơ nhưng chưa tải được tệp: ${x instanceof Error ? x.message : String(x)}`;
      }
    }
    savingRef.current = false;
    setSaving(false);
    if (e) {
      if (id && !item) onChanged();
      return setErr(e);
    }
    onSaved();
  }

  async function removeFile() {
    if (!item || !file.path || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const e = await setPenaltyFile(item.id, null, null);
    if (!e) {
      await removePenaltyFile(file.path);
      setFile({ path: null, name: null });
      onChanged();
    } else setErr(e);
    savingRef.current = false;
    setSaving(false);
  }

  const inputCls =
    "w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:border-[#00AEEF] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed";
  const lbl = "text-[10px] font-bold text-slate-500";
  const projectValue = inp.project_code || "";
  const projectKnown = projects.some((p) => p.code === projectValue);

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">
            {item ? <>Hồ sơ <span className="font-mono text-[#005BAC]">{item.ma_ho_so}</span></> : "Tạo hồ sơ khấu trừ / xử phạt"}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        {/* ── P.ATLĐ ── */}
        <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
          <p className="text-[11px] font-extrabold text-[#005BAC] uppercase tracking-wider">
            P.ATLĐ nhập — thông tin đầu vào {!canInput && <span className="normal-case font-semibold text-slate-400">(chỉ xem)</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className={lbl}>Loại hồ sơ</span>
              <select value={inp.loai_ho_so} disabled={!canInput} onChange={(e) => setI("loai_ho_so", e.target.value)} className={inputCls}>
                {PENALTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                {!PENALTY_TYPES.includes(inp.loai_ho_so) && <option value={inp.loai_ho_so}>{inp.loai_ho_so}</option>}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Số quyết định / Phiếu cấp phát</span>
              <input value={inp.so_quyet_dinh ?? ""} disabled={!canInput} onChange={(e) => setI("so_quyet_dinh", e.target.value)} placeholder="VD 52/026/QĐ/TNE&C" className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Ngày ban hành</span>
              <input type="date" value={inp.ngay_ban_hanh ?? ""} disabled={!canInput} onChange={(e) => setI("ngay_ban_hanh", e.target.value)} className={`${inputCls} tabular-nums`} />
            </label>

            <div className="sm:col-span-3 space-y-1">
              <span className={lbl}>Tệp quyết định (ảnh / PDF ≤ 2MB) hoặc link</span>
              <div className="flex flex-wrap items-center gap-2">
                {file.path && (
                  <span className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#005BAC] max-w-[260px]">
                    <FileText size={12} className="shrink-0" /> <span className="truncate">{file.name || "Tệp quyết định"}</span>
                    {canInput && (
                      <button type="button" onClick={removeFile} disabled={saving} className="text-slate-300 hover:text-rose-500 cursor-pointer" aria-label="Gỡ tệp">
                        <X size={12} />
                      </button>
                    )}
                  </span>
                )}
                {pendingFile && (
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 max-w-[260px]">
                    <Upload size={12} className="shrink-0" /> <span className="truncate">{pendingFile.name}</span> (lưu mới tải lên)
                    <button type="button" onClick={() => setPendingFile(null)} className="text-amber-400 hover:text-rose-500 cursor-pointer" aria-label="Bỏ tệp">
                      <X size={12} />
                    </button>
                  </span>
                )}
                {canInput && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        if (f.size > 2 * 1024 * 1024) return setErr(`"${f.name}" vượt 2MB — tải lên Drive rồi dán link.`);
                        setErr("");
                        setPendingFile(f);
                      }}
                    />
                    <button type="button" onClick={() => fileRef.current?.click()} className={BTN_OUTLINE}>
                      <Upload size={13} /> {file.path ? "Thay tệp" : "Chọn tệp"}
                    </button>
                  </>
                )}
                <div className="flex-1 min-w-[220px] flex items-center gap-2 px-3 h-9 rounded-xl bg-white border border-slate-200 focus-within:border-[#00AEEF]">
                  <Link2 size={13} className="text-slate-400 shrink-0" />
                  <input
                    value={inp.qd_link ?? ""}
                    disabled={!canInput}
                    onChange={(e) => setI("qd_link", e.target.value)}
                    placeholder="https://drive.google.com/…"
                    className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:text-slate-500"
                  />
                  {inp.qd_link && /^https?:\/\//i.test(inp.qd_link) && (
                    <a href={inp.qd_link} target="_blank" rel="noopener noreferrer" className="text-[#005BAC]" title="Mở link">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <label className="block space-y-1 sm:col-span-3">
              <span className={lbl}>Dự án (danh mục dự án — Cài đặt hệ thống)</span>
              <select
                value={projectValue}
                disabled={!canInput}
                onChange={(e) => {
                  const p = projects.find((x) => x.code === e.target.value);
                  setInp((s) => ({ ...s, project_code: p?.code ?? "", project_name: p?.name ?? "" }));
                }}
                className={inputCls}
              >
                <option value="">— Chọn dự án —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.code}>{p.code} — {p.name}</option>
                ))}
                {projectValue && !projectKnown && <option value={projectValue}>{projectValue} — {inp.project_name}</option>}
              </select>
              {projects.length === 0 && <span className="block text-[10px] text-amber-600">Danh mục dự án đang trống — Admin thêm ở Cài đặt › Danh mục công việc.</span>}
            </label>

            <div className="sm:col-span-3 space-y-1">
              <span className={lbl}>Nhà thầu phụ * (danh mục đối tác — Hồ sơ trình ký)</span>
              {canInput ? (
                <AtldPartnerPicker
                  partners={partners}
                  value={inp.contractor_name}
                  onChange={(name) => {
                    const p = partners.find((x) => foldVi(x.name) === foldVi(name));
                    setInp((s) => ({ ...s, contractor_name: name, contractor_id: p?.id ?? null }));
                  }}
                  placeholder="Tìm nhà thầu phụ hoặc gõ tên…"
                />
              ) : (
                <div className={inputCls + " bg-slate-100"}>{inp.contractor_name || "—"}</div>
              )}
            </div>

            <label className="block space-y-1 sm:col-span-3">
              <span className={lbl}>Nội dung vi phạm</span>
              <textarea rows={2} value={inp.noi_dung ?? ""} disabled={!canInput} onChange={(e) => setI("noi_dung", e.target.value)} placeholder="VD: Không chấp hành PPE và bố trí biển báo" className={inputCls} />
            </label>

            <label className="block space-y-1">
              <span className={lbl}>Giá trị phải khấu trừ (đ) *</span>
              <input inputMode="numeric" value={moneyText(inp.gia_tri_phai_tru)} disabled={!canInput} onChange={(e) => setI("gia_tri_phai_tru", parseMoney(e.target.value))} placeholder="0" className={`${inputCls} tabular-nums text-right`} />
            </label>
            <div className="space-y-1">
              <span className={lbl}>Người lập</span>
              {canInput ? (
                <AtldPersonPicker bdh="" value={inp.nguoi_lap ?? ""} onChange={(n) => setI("nguoi_lap", n)} />
              ) : (
                <div className={inputCls + " bg-slate-100"}>{inp.nguoi_lap || "—"}</div>
              )}
            </div>
            <label className="block space-y-1">
              <span className={lbl}>Ngày gửi thông tin cho KHĐT</span>
              <input type="date" value={inp.ngay_gui_khdt ?? ""} disabled={!canInput} onChange={(e) => setI("ngay_gui_khdt", e.target.value)} className={`${inputCls} tabular-nums`} />
            </label>
          </div>
        </section>

        {/* ── P.KHĐT ── */}
        <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-4 space-y-3">
          <p className="text-[11px] font-extrabold text-orange-700 uppercase tracking-wider">
            P.KHĐT nhập — thông tin đầu ra {!canProcess && <span className="normal-case font-semibold text-slate-400">(chỉ xem)</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className={lbl}>Ngày tiếp nhận</span>
              <input type="date" value={out.ngay_tiep_nhan ?? ""} disabled={!canProcess} onChange={(e) => setO("ngay_tiep_nhan", e.target.value)} className={`${inputCls} tabular-nums`} />
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Đợt thanh toán</span>
              <input value={out.dot_thanh_toan ?? ""} disabled={!canProcess} onChange={(e) => setO("dot_thanh_toan", e.target.value)} placeholder="VD HSTT Đợt 2" className={inputCls} />
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Giá trị đã khấu trừ (đ)</span>
              <input inputMode="numeric" value={moneyText(out.gia_tri_da_tru)} disabled={!canProcess} onChange={(e) => setO("gia_tri_da_tru", parseMoney(e.target.value))} placeholder="0" className={`${inputCls} tabular-nums text-right`} />
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Ngày khấu trừ</span>
              <input type="date" value={out.ngay_khau_tru ?? ""} disabled={!canProcess} onChange={(e) => setO("ngay_khau_tru", e.target.value)} className={`${inputCls} tabular-nums`} />
            </label>
            <label className="block space-y-1">
              <span className={lbl}>Số chứng từ</span>
              <input value={out.so_chung_tu ?? ""} disabled={!canProcess} onChange={(e) => setO("so_chung_tu", e.target.value)} className={inputCls} />
            </label>
            <div className="space-y-1">
              <span className={lbl}>Người nhập</span>
              {canProcess ? (
                <AtldPersonPicker bdh="" value={out.nguoi_nhap ?? ""} onChange={(n) => setO("nguoi_nhap", n)} />
              ) : (
                <div className={inputCls + " bg-slate-100"}>{out.nguoi_nhap || "—"}</div>
              )}
            </div>
            <label className="block space-y-1 sm:col-span-3">
              <span className={lbl}>Ghi chú (KHĐT)</span>
              <input value={out.ghi_chu ?? ""} disabled={!canProcess} onChange={(e) => setO("ghi_chu", e.target.value)} className={inputCls} />
            </label>
          </div>
        </section>

        {/* ── Tự tính ── */}
        <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider">Tự tính</span>
          <span>
            Giá trị còn lại: <b className={`tabular-nums ${conLai > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(Math.max(0, conLai))}</b>
          </span>
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${PENALTY_STATUS_META[status].cls}`}>{PENALTY_STATUS_META[status].label}</span>
        </section>

        {err && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
            Huỷ
          </button>
          {(canInput || canProcess) && (
            <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
              {saving && <Loader2 size={13} className="animate-spin" />} {item ? "Lưu" : "Tạo hồ sơ"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

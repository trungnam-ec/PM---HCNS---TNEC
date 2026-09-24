"use client";

// Tab Bình đồ (M2 — màn hình chính BĐH): giữ bố cục file Excel "Bình đồ quản trị".
// Trục ngang = lý trình (mỗi lý trình 1 cột, sắp theo Km). Các hàng:
//   Lý trình · Nhà thầu chính · Nhà thầu phụ · A. GPMB · A. Hạng mục (tỷ trọng) ·
//   A. Huy động (theo nhóm) · A. Phát sinh TK · B. Pháp lý · C. Sản lượng & tiến độ
// Ô tô màu theo mức sẵn sàng 0 → 1. Bấm tiêu đề cột -> mở Khối A của lý trình đó.
// Hàng C: % hoàn thành theo tỷ trọng (ai cũng thấy); SL thực tế / %KH / %TT /
// đánh giá tiến độ chỉ hiện với người có quyền tài chính.
// P4: hàng Trạng thái / Điểm rủi ro (snapshot hôm nay) + ô "Xem tại ngày": chọn ngày
// quá khứ thì hiện bình đồ tóm tắt dựng lại từ snapshot đã lưu hôm đó.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  MOB_CATEGORIES,
  SEGMENT_TYPES,
  formatKm,
  gpmbPercent,
  heatCls,
  legalScore,
  pct,
  pcErrorMessage,
  readiness,
  currentPlan,
  formatMoneyShort,
  planCumAt,
  progressLabel,
  todayVN,
  weightedCompletion,
  addDays,
  formatDate,
  refreshRisk,
  RISK_STATUS,
  type PcRiskSnapshot,
  type PcPlanEntry,
  type PcValueRow,
  type PcContract,
  type PcDesignChange,
  type PcLandClearance,
  type PcLegalItem,
  type PcMobilization,
  type PcScope,
  type PcSegment,
  type PcSegmentWbs,
  type PcWbsItem,
  fetchAllRows,
} from "@/lib/projectControl";
import { ErrorLine } from "./ui";
import { Loader2 } from "lucide-react";

type Data = {
  segments: PcSegment[];
  catalog: PcWbsItem[];
  wbs: PcSegmentWbs[];
  contracts: PcContract[];
  scopes: PcScope[];
  gpmb: PcLandClearance[];
  mob: PcMobilization[];
  dcs: PcDesignChange[];
  legal: PcLegalItem[];
  values: PcValueRow[];
  plan: PcPlanEntry[];
  swValue: Map<string, number>; // giá trị HĐ A-B từng hạng mục-lý trình (chỉ người có quyền tiền)
};

export default function BinhDoTab({
  projectId,
  canFin,
  onOpenSegment,
}: {
  projectId: string;
  canFin: boolean;
  onOpenSegment: (segmentId: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(todayVN());
  const [snaps, setSnaps] = useState<PcRiskSnapshot[]>([]);

  // Snapshot mới nhất ≤ ngày xem của từng lý trình (hôm nay: tính lại trước).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (asOf === todayVN()) await refreshRisk(projectId);
      const { data: sn } = await supabase
        .from("pc_risk_snapshots")
        .select("*")
        .eq("project_id", projectId)
        .lte("snap_date", asOf)
        .gte("snap_date", addDays(asOf, -90))
        .order("snap_date", { ascending: false });
      if (alive) setSnaps((sn as PcRiskSnapshot[]) || []);
    })();
    return () => {
      alive = false;
    };
  }, [projectId, asOf]);

  useEffect(() => {
    (async () => {
      const [s, c, co, g, m, d, l, v, pl] = await Promise.all([
        supabase.from("pc_segments").select("*").eq("project_id", projectId).order("km_start_m"),
        supabase.from("pc_wbs_items").select("*").order("sort_order"),
        supabase.from("pc_contracts").select("*").eq("project_id", projectId),
        supabase.from("pc_land_clearance").select("*").eq("project_id", projectId),
        supabase.from("pc_mobilization").select("*").eq("project_id", projectId),
        supabase.from("pc_design_changes").select("*").eq("project_id", projectId),
        supabase.from("pc_legal_items").select("*").eq("project_id", projectId),
        fetchAllRows<PcValueRow>((a, b) => supabase.from("pc_v_progress_value").select("*").eq("project_id", projectId).order("id").range(a, b)),
        canFin ? supabase.from("pc_plan_entries").select("*").eq("project_id", projectId) : Promise.resolve({ data: [] }),
      ]);
      const firstErr = [s, g, m, d, l].find((r) => r.error)?.error;
      if (firstErr) setErr(pcErrorMessage(firstErr));
      const segments = (s.data as PcSegment[]) || [];
      const contracts = (co.data as PcContract[]) || [];
      const [w, sc] = await Promise.all([
        segments.length
          ? supabase.from("pc_segment_wbs").select("*").in("segment_id", segments.map((x) => x.id))
          : Promise.resolve({ data: [] }),
        contracts.length
          ? supabase.from("pc_contract_scopes").select("*").in("contract_id", contracts.map((x) => x.id))
          : Promise.resolve({ data: [] }),
      ]);
      const wbsRows = (w.data as PcSegmentWbs[]) || [];
      const swValue = new Map<string, number>();
      if (canFin && wbsRows.length) {
        const { data: f } = await supabase
          .from("pc_segment_wbs_finance")
          .select("segment_wbs_id, budget_value")
          .in("segment_wbs_id", wbsRows.map((x) => x.id));
        ((f as { segment_wbs_id: string; budget_value: number | null }[]) || []).forEach((x) =>
          swValue.set(x.segment_wbs_id, Number(x.budget_value || 0))
        );
      }
      setData({
        segments,
        catalog: (c.data as PcWbsItem[]) || [],
        wbs: wbsRows,
        contracts,
        scopes: (sc.data as PcScope[]) || [],
        gpmb: (g.data as PcLandClearance[]) || [],
        mob: (m.data as PcMobilization[]) || [],
        dcs: (d.data as PcDesignChange[]) || [],
        legal: (l.data as PcLegalItem[]) || [],
        values: (v.data as PcValueRow[]) || [],
        plan: currentPlan((pl.data as PcPlanEntry[]) || []),
        swValue,
      });
    })();
  }, [projectId, canFin]);

  // Hạng mục có mặt trong ÍT NHẤT một lý trình -> mỗi hạng mục 1 hàng.
  const usedItems = useMemo(() => {
    if (!data) return [];
    const ids = new Set(data.wbs.map((w) => w.wbs_item_id));
    return data.catalog.filter((c) => ids.has(c.id));
  }, [data]);

  if (!data)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#005BAC]" size={26} />
      </div>
    );

  const { segments } = data;
  if (segments.length === 0)
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-xs text-slate-400">
        <ErrorLine msg={err} />
        Chưa có lý trình. Thêm ở tab Lý trình &amp; Hạng mục để dựng bình đồ.
      </div>
    );

  const contractors = (segId: string, role: "MAIN" | "SUB") => {
    const ids = new Set(data.scopes.filter((s) => s.segment_id === segId).map((s) => s.contract_id));
    return data.contracts
      .filter((c) => c.contract_type === "B_B1" && c.contractor_role === role && ids.has(c.id))
      .map((c) => c.partner_name || "?");
  };

  // Mục cấp dự án (segment_id null) áp cho mọi lý trình.
  const mobFor = (segId: string, cat: string) =>
    data.mob.filter((m) => m.category === cat && (m.segment_id === segId || m.segment_id === null));
  const legalFor = (segId: string) => data.legal.filter((l) => l.segment_id === segId || l.segment_id === null);
  const dcFor = (segId: string) => data.dcs.filter((d) => d.segment_id === segId);

  const t = todayVN();
  const qtyBySw = new Map<string, number>();
  data.values.forEach((r) => qtyBySw.set(r.segment_wbs_id, (qtyBySw.get(r.segment_wbs_id) || 0) + Number(r.qty)));
  const segFin = (segId: string) => {
    const gt = data.wbs
      .filter((w) => w.segment_id === segId && w.applicable)
      .reduce((a, w) => a + (data.swValue.get(w.id) || 0), 0);
    const segPlan = data.plan.filter((p) => p.segment_id === segId);
    const kh = planCumAt(segPlan, t);
    const actual = data.values
      .filter((r) => r.segment_id === segId && r.log_date <= t)
      .reduce((a, r) => a + Number(r.value_a || 0), 0);
    return { gt, kh, actual, hasPlan: segPlan.length > 0 };
  };

  const snapOf = (segId: string) => snaps.find((x) => x.segment_id === segId) || null;
  const isPast = asOf !== t;

  const colW = "min-w-[132px] w-[132px]";
  const labelCls = "sticky left-0 z-10 bg-white text-[10px] font-bold text-slate-500 px-3 py-2 border-r border-slate-100 min-w-[170px] w-[170px]";
  const groupRow = (title: string) => (
    <tr>
      <td colSpan={segments.length + 1} className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-[#005BAC] px-3 py-1.5">
        {title}
      </td>
    </tr>
  );

  return (
    <div className="space-y-3">
      <ErrorLine msg={err} />
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500">Xem bình đồ tại ngày</span>
        <input
          type="date"
          value={asOf}
          max={t}
          onChange={(e) => e.target.value && setAsOf(e.target.value)}
          className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5"
        />
        {isPast && (
          <button onClick={() => setAsOf(t)} className="text-[11px] font-bold text-[#005BAC]">
            Về hôm nay
          </button>
        )}
      </div>
      {isPast && (
        <PastBinhDo segments={segments} snapOf={snapOf} asOf={asOf} />
      )}
      {!isPast && (
      <>
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
        <span>Chú giải:</span>
        <span className={`px-2 py-0.5 rounded ${heatCls(0)}`}>0 – Chưa</span>
        <span className={`px-2 py-0.5 rounded ${heatCls(0.3)}`}>&lt; 50%</span>
        <span className={`px-2 py-0.5 rounded ${heatCls(0.6)}`}>≥ 50%</span>
        <span className={`px-2 py-0.5 rounded ${heatCls(1)}`}>100% – Sẵn sàng</span>
        <span className={`px-2 py-0.5 rounded ${heatCls(null)}`}>— Chưa có dữ liệu</span>
        <span className="ml-auto text-slate-400">Bấm tên lý trình để mở chi tiết Khối A</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="text-[11px] border-collapse">
          <thead>
            <tr>
              <th className={`${labelCls} text-left align-bottom`}>Lý trình</th>
              {segments.map((s) => (
                <th key={s.id} className={`${colW} px-2 py-2 border-r border-slate-100 text-left align-top`}>
                  <button onClick={() => onOpenSegment(s.id)} className="text-left group w-full">
                    <span className="block text-xs font-extrabold text-[#005BAC] group-hover:underline">{s.code}</span>
                    <span className="block font-mono text-[10px] text-slate-500">
                      {formatKm(s.km_start_m)}–{formatKm(s.km_end_m)}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {(Number(s.km_end_m) - Number(s.km_start_m)).toLocaleString("vi-VN")} m ·{" "}
                      {SEGMENT_TYPES.find((t) => t.value === s.segment_type)?.label}
                    </span>
                    {s.structure_name && <span className="block text-[10px] font-semibold text-slate-600 truncate">{s.structure_name}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupRow("Tình trạng")}
            <tr className="border-t border-slate-100">
              <td className={labelCls}>Trạng thái / điểm rủi ro</td>
              {segments.map((s) => {
                const sn = snapOf(s.id);
                const st = sn ? RISK_STATUS[sn.status] : null;
                return (
                  <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-bold text-[10px] ${st ? st.cls : "text-slate-300"}`}>
                    {st ? st.label : "—"}
                    {sn?.score != null && <span className="block font-mono text-[10px] opacity-80">Điểm {Math.round(Number(sn.score))}</span>}
                  </td>
                );
              })}
            </tr>

            {groupRow("Nhà thầu")}
            {(["MAIN", "SUB"] as const).map((role) => (
              <tr key={role} className="border-t border-slate-100">
                <td className={labelCls}>{role === "MAIN" ? "Nhà thầu chính" : "Nhà thầu phụ"}</td>
                {segments.map((s) => {
                  const names = contractors(s.id, role);
                  return (
                    <td
                      key={s.id}
                      className={`${colW} px-2 py-1.5 border-r border-slate-100 align-top ${
                        role === "MAIN" && names.length === 0 ? "bg-amber-50 text-amber-700" : "text-slate-700"
                      }`}
                    >
                      {names.length ? names.join(", ") : role === "MAIN" ? "Chưa có thông tin" : ""}
                    </td>
                  );
                })}
              </tr>
            ))}

            {groupRow("A. Giải phóng mặt bằng")}
            <tr className="border-t border-slate-100">
              <td className={labelCls}>% GPMB</td>
              {segments.map((s) => {
                const rows = data.gpmb.filter((g) => g.segment_id === s.id);
                const v = rows.length ? gpmbPercent(s, rows) : null;
                const obstructed = rows.some((r) => r.status === "OBSTRUCTED");
                return (
                  <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-bold ${heatCls(v)}`}>
                    {pct(v)}
                    {obstructed && <span className="block text-[9px] font-extrabold text-rose-600">Có vướng mắc</span>}
                  </td>
                );
              })}
            </tr>

            {usedItems.length > 0 && groupRow("A. Hạng mục (% tỷ trọng)")}
            {usedItems.map((it) => (
              <tr key={it.id} className="border-t border-slate-100">
                <td className={labelCls} title={it.name}>
                  <span className="text-slate-700">{it.code}</span> <span className="font-medium truncate">{it.name}</span>
                </td>
                {segments.map((s) => {
                  const w = data.wbs.find((x) => x.segment_id === s.id && x.wbs_item_id === it.id);
                  return (
                    <td
                      key={s.id}
                      className={`${colW} px-2 py-1.5 border-r border-slate-100 ${
                        !w ? "text-slate-300" : !w.applicable ? "text-slate-400 italic" : "font-semibold text-slate-700"
                      }`}
                    >
                      {!w ? "" : !w.applicable ? "Không có" : `${Number(w.weight_pct).toLocaleString("vi-VN")}%`}
                    </td>
                  );
                })}
              </tr>
            ))}

            {groupRow("A. Huy động")}
            {MOB_CATEGORIES.map((cat) => (
              <tr key={cat.value} className="border-t border-slate-100">
                <td className={labelCls}>{cat.label}</td>
                {segments.map((s) => {
                  const rows = mobFor(s.id, cat.value);
                  const v = readiness(rows.map((r) => Number(r.status)));
                  return (
                    <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-semibold ${heatCls(v)}`}>
                      {v === null ? "—" : `${pct(v)} · ${rows.length} mục`}
                    </td>
                  );
                })}
              </tr>
            ))}

            {groupRow("A. Phát sinh thiết kế")}
            <tr className="border-t border-slate-100">
              <td className={labelCls}>Hồ sơ → TVGS → CĐT</td>
              {segments.map((s) => {
                const rows = dcFor(s.id);
                const approved = rows.filter((d) => Number(d.owner_status) === 1).length;
                const v = rows.length ? approved / rows.length : null;
                return (
                  <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-semibold ${rows.length ? heatCls(v) : "text-slate-300"}`}>
                    {rows.length ? `${approved}/${rows.length} CĐT duyệt` : ""}
                  </td>
                );
              })}
            </tr>

            {groupRow("B. Pháp lý phục vụ thi công")}
            <tr className="border-t border-slate-100">
              <td className={labelCls}>% sẵn sàng pháp lý</td>
              {segments.map((s) => {
                const v = readiness(legalFor(s.id).map(legalScore));
                return (
                  <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-bold ${heatCls(v)}`}>
                    {pct(v)}
                  </td>
                );
              })}
            </tr>
            <tr className="border-t border-slate-100">
              <td className={labelCls}>Nhân sự hiện diện</td>
              {segments.map((s) => {
                const staff = legalFor(s.id).filter((l) => l.on_site !== null);
                const here = staff.filter((l) => l.on_site).length;
                const v = staff.length ? here / staff.length : null;
                return (
                  <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-semibold ${heatCls(v)}`}>
                    {staff.length ? `${here}/${staff.length}` : "—"}
                  </td>
                );
              })}
            </tr>

            {groupRow("C. Sản lượng & tiến độ")}
            <tr className="border-t border-slate-100">
              <td className={labelCls}>% hoàn thành (tỷ trọng)</td>
              {segments.map((s) => {
                const v = weightedCompletion(data.wbs.filter((w) => w.segment_id === s.id), qtyBySw);
                return (
                  <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-bold ${heatCls(v)}`}>
                    {pct(v)}
                  </td>
                );
              })}
            </tr>
            {canFin && (
              <>
                <tr className="border-t border-slate-100">
                  <td className={labelCls}>SL thực tế / GT HĐ</td>
                  {segments.map((s) => {
                    const f = segFin(s.id);
                    return (
                      <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-mono text-slate-700`}>
                        {formatMoneyShort(f.actual)}
                        <span className="block text-[10px] text-slate-400">/ {f.gt ? formatMoneyShort(f.gt) : "chưa có đơn giá"}</span>
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className={labelCls}>%KH → %TT</td>
                  {segments.map((s) => {
                    const f = segFin(s.id);
                    return (
                      <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 text-slate-700`}>
                        {f.gt ? `${pct(f.kh / f.gt)} → ${pct(f.actual / f.gt)}` : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-t border-slate-100">
                  <td className={labelCls}>Đánh giá tiến độ</td>
                  {segments.map((s) => {
                    const f = segFin(s.id);
                    const lb = progressLabel(f.gt && f.hasPlan ? f.actual / f.gt - f.kh / f.gt : null);
                    return (
                      <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-bold text-[10px] ${lb.cls}`}>
                        {lb.label}
                      </td>
                    );
                  })}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
}

// Bình đồ tóm tắt tại một ngày quá khứ — dựng lại từ snapshot rủi ro đã lưu.
function PastBinhDo({
  segments,
  snapOf,
  asOf,
}: {
  segments: PcSegment[];
  snapOf: (segId: string) => PcRiskSnapshot | null;
  asOf: string;
}) {
  const rows: { label: string; get: (s: PcRiskSnapshot) => number | null }[] = [
    { label: "% hoàn thành (tỷ trọng)", get: (s) => s.completion },
    { label: "% GPMB", get: (s) => s.gpmb },
    { label: "% sẵn sàng pháp lý", get: (s) => s.legal },
    { label: "% sẵn sàng huy động", get: (s) => s.mobilization },
  ];
  const colW = "min-w-[132px] w-[132px]";
  const labelCls = "sticky left-0 z-10 bg-white text-[10px] font-bold text-slate-500 px-3 py-2 border-r border-slate-100 min-w-[170px] w-[170px]";
  const anyData = segments.some((s) => snapOf(s.id));
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
      <p className="px-3 py-2 text-[11px] font-bold text-amber-700 bg-amber-50 border-b border-amber-100">
        Bình đồ tại ngày {formatDate(asOf)} — dựng lại từ số liệu hệ thống đã lưu (mỗi lý trình lấy bản gần nhất trước ngày này).
        {!anyData && " Chưa có số liệu lưu cho giai đoạn này."}
      </p>
      <table className="text-[11px] border-collapse">
        <thead>
          <tr>
            <th className={`${labelCls} text-left`}>Lý trình</th>
            {segments.map((s) => {
              const sn = snapOf(s.id);
              return (
                <th key={s.id} className={`${colW} px-2 py-2 border-r border-slate-100 text-left`}>
                  <span className="block text-xs font-extrabold text-[#005BAC]">{s.code}</span>
                  <span className="block text-[10px] text-slate-400">{sn ? `số liệu ${formatDate(sn.snap_date)}` : "chưa có"}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-slate-100">
            <td className={labelCls}>Trạng thái / điểm</td>
            {segments.map((s) => {
              const sn = snapOf(s.id);
              const st = sn ? RISK_STATUS[sn.status] : null;
              return (
                <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-bold text-[10px] ${st ? st.cls : "text-slate-300"}`}>
                  {st ? st.label : "—"}
                  {sn?.score != null && <span className="block font-mono">Điểm {Math.round(Number(sn.score))}</span>}
                </td>
              );
            })}
          </tr>
          <tr className="border-t border-slate-100">
            <td className={labelCls}>ΔP tiến độ</td>
            {segments.map((s) => {
              const sn = snapOf(s.id);
              const lb = progressLabel(sn?.dp ?? null);
              return (
                <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-bold text-[10px] ${lb.cls}`}>
                  {lb.label}
                </td>
              );
            })}
          </tr>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-100">
              <td className={labelCls}>{r.label}</td>
              {segments.map((s) => {
                const sn = snapOf(s.id);
                const v = sn ? r.get(sn) : null;
                return (
                  <td key={s.id} className={`${colW} px-2 py-1.5 border-r border-slate-100 font-bold ${heatCls(v == null ? null : Number(v))}`}>
                    {pct(v == null ? null : Number(v))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

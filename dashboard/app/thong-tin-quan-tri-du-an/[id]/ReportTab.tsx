"use client";

// Tab Báo cáo (M8, P4) — báo cáo TUẦN (T2 → CN) / THÁNG (dương lịch), in bằng
// trình duyệt (Ctrl+P / nút In). Mọi số tính từ nhật ký ĐÃ DUYỆT + snapshot rủi ro;
// phần tiền chỉ có khi người xem có quyền tài chính.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  RISK_STATUS,
  SEVERITY,
  addDays,
  formatDate,
  formatMoneyShort,
  pct,
  pcErrorMessage,
  todayVN,
  weekEnd,
  weekStart,
  weightedCompletion,
  type PcAccess,
  type PcAlert,
  type PcPayment,
  type PcProgressLog,
  type PcProject,
  type PcRiskSnapshot,
  type PcSegment,
  type PcSegmentWbs,
  type PcValueRow,
  type PcWbsItem,
  fetchAllRows,
} from "@/lib/projectControl";
import { ErrorLine } from "./ui";
import { Loader2, Printer } from "lucide-react";

type Kind = "week" | "month";

function monthRange(d: string): [string, string] {
  const [y, m] = d.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${d.slice(0, 7)}-01`, `${d.slice(0, 7)}-${String(last).padStart(2, "0")}`];
}

export default function ReportTab({ project, access }: { project: PcProject; access: PcAccess }) {
  const canFin = access.can_view_finance;
  const [kind, setKind] = useState<Kind>("week");
  const [anchor, setAnchor] = useState(todayVN());
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<{
    segments: PcSegment[];
    wbs: PcSegmentWbs[];
    catalog: PcWbsItem[];
    values: PcValueRow[];
    logs: PcProgressLog[];
    snaps: PcRiskSnapshot[];
    alerts: PcAlert[];
    payments: PcPayment[];
  } | null>(null);

  const [from, to] = kind === "week" ? [weekStart(anchor), weekEnd(anchor)] : monthRange(anchor);

  const load = useCallback(async () => {
    const pid = project.id;
    const [s, c, v, l, sn, al, pa] = await Promise.all([
      supabase.from("pc_segments").select("*").eq("project_id", pid).order("km_start_m"),
      supabase.from("pc_wbs_items").select("*").order("sort_order"),
      fetchAllRows<PcValueRow>((a, b) => supabase.from("pc_v_progress_value").select("*").eq("project_id", pid).lte("log_date", to).order("id").range(a, b)),
      supabase.from("pc_progress_logs").select("*").eq("project_id", pid).gte("log_date", from).lte("log_date", to),
      supabase.from("pc_risk_snapshots").select("*").eq("project_id", pid).lte("snap_date", to).gte("snap_date", addDays(from, -31)),
      supabase.from("pc_alerts").select("*").eq("project_id", pid),
      canFin ? supabase.from("pc_payments").select("*").eq("project_id", pid) : Promise.resolve({ data: [], error: null }),
    ]);
    const firstErr = [s, v, l].find((r) => r.error)?.error;
    setErr(firstErr ? pcErrorMessage(firstErr) : null);
    const segments = (s.data as PcSegment[]) || [];
    const { data: w } = segments.length
      ? await supabase.from("pc_segment_wbs").select("*").in("segment_id", segments.map((x) => x.id))
      : { data: [] };
    setData({
      segments,
      wbs: (w as PcSegmentWbs[]) || [],
      catalog: (c.data as PcWbsItem[]) || [],
      values: (v.data as PcValueRow[]) || [],
      logs: (l.data as PcProgressLog[]) || [],
      snaps: (sn.data as PcRiskSnapshot[]) || [],
      alerts: (al.data as PcAlert[]) || [],
      payments: (pa.data as PcPayment[]) || [],
    });
  }, [project.id, from, to, canFin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const calc = useMemo(() => {
    if (!data) return null;
    const qtyUpTo = (d: string) => {
      const m = new Map<string, number>();
      data.values.filter((r) => r.log_date <= d).forEach((r) => m.set(r.segment_wbs_id, (m.get(r.segment_wbs_id) || 0) + Number(r.qty)));
      return m;
    };
    const before = qtyUpTo(addDays(from, -1));
    const after = qtyUpTo(to);
    const inPeriod = data.values.filter((r) => r.log_date >= from && r.log_date <= to);
    const snapAt = (segId: string) =>
      data.snaps.filter((s) => s.segment_id === segId).sort((a, b) => (a.snap_date < b.snap_date ? 1 : -1))[0] || null;
    const paidIn = (fromD: string, toD: string, dir: "IN" | "OUT") =>
      data.payments
        .filter((p) => p.direction === dir && p.status === "PAID" && p.paid_date && p.paid_date >= fromD && p.paid_date <= toD)
        .reduce((a, p) => a + (p.payment_type === "ADVANCE_RECOVERY" ? -1 : 1) * Number(p.paid_value || 0), 0);
    return { before, after, inPeriod, snapAt, paidIn };
  }, [data, from, to]);

  if (!data || !calc)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#005BAC]" size={26} />
      </div>
    );

  const itemById = new Map(data.catalog.map((c) => [c.id, c]));
  const logDays = new Set(data.logs.filter((l) => l.status !== "REJECTED").map((l) => l.log_date)).size;
  const manpower = data.logs.filter((l) => l.manpower != null);
  const avgMan = manpower.length ? Math.round(manpower.reduce((a, l) => a + Number(l.manpower), 0) / manpower.length) : null;
  const rainDays = new Set(data.logs.filter((l) => (l.weather || "").startsWith("Mưa")).map((l) => l.log_date)).size;
  const openAlerts = data.alerts.filter((a) => a.status !== "RESOLVED");
  const newAlerts = data.alerts.filter((a) => a.first_seen.slice(0, 10) >= from && a.first_seen.slice(0, 10) <= to);
  const sumA = (rows: PcValueRow[]) => rows.reduce((a, r) => a + Number(r.value_a || 0), 0);
  const sumB = (rows: PcValueRow[]) => rows.reduce((a, r) => a + Number(r.value_b || 0), 0);

  const title = kind === "week" ? `BÁO CÁO TUẦN ${formatDate(from)} – ${formatDate(to)}` : `BÁO CÁO THÁNG ${to.slice(5, 7)}/${to.slice(0, 4)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {(["week", "month"] as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-full border ${
              kind === k ? "bg-[#005BAC] text-white border-transparent" : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            {k === "week" ? "Báo cáo tuần" : "Báo cáo tháng"}
          </button>
        ))}
        <input
          type="date"
          value={anchor}
          onChange={(e) => e.target.value && setAnchor(e.target.value)}
          className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5"
        />
        <span className="text-[11px] text-slate-500">
          Kỳ: {formatDate(from)} – {formatDate(to)}
        </span>
        <div className="flex-1" />
        <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-[11px] font-bold px-3.5 py-2 rounded-lg">
          <Printer size={13} /> In báo cáo
        </button>
      </div>
      <ErrorLine msg={err} />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5 print:border-0 print:shadow-none print:p-0 text-slate-800">
        <div className="text-center space-y-1">
          <p className="text-[11px] font-bold text-slate-500 uppercase">{project.bdh_name}</p>
          <h2 className="font-heading font-extrabold text-base">{title}</h2>
          <p className="text-xs font-semibold">{project.name}</p>
          <p className="text-[11px] text-slate-500">
            {[project.package_name, project.owner_name ? `CĐT: ${project.owner_name}` : ""].filter(Boolean).join(" · ")}
          </p>
          <p className="text-[10px] text-slate-400">Lập ngày {formatDate(todayVN())} · số liệu từ nhật ký đã được QS duyệt</p>
        </div>

        <Section title="1. Tình hình chung">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Kpi label="Ngày có nhật ký" value={`${logDays}`} />
            <Kpi label="Nhân lực bình quân" value={avgMan != null ? `${avgMan} người` : "—"} />
            <Kpi label="Ngày mưa" value={`${rainDays}`} />
            <Kpi label="Cảnh báo đang mở" value={`${openAlerts.length}`} />
            {canFin && <Kpi label="Sản lượng kỳ (A-B)" value={formatMoneyShort(sumA(calc.inPeriod))} />}
            {canFin && <Kpi label="Sản lượng lũy kế" value={formatMoneyShort(sumA(data.values))} />}
            {canFin && <Kpi label="CĐT thanh toán trong kỳ" value={formatMoneyShort(calc.paidIn(from, to, "IN"))} />}
            {canFin && <Kpi label="Trả nhà thầu trong kỳ" value={formatMoneyShort(calc.paidIn(from, to, "OUT"))} />}
          </div>
        </Section>

        <Section title="2. Tiến độ theo lý trình">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[10px] font-extrabold uppercase text-slate-500 text-left border-b border-slate-200">
                <th className="py-1">Lý trình</th>
                <th className="px-2">Trạng thái</th>
                <th className="px-2 text-right">Điểm rủi ro</th>
                <th className="px-2 text-right">%HT đầu kỳ</th>
                <th className="px-2 text-right">%HT cuối kỳ</th>
                <th className="px-2 text-right">Tăng</th>
                {canFin && <th className="px-2 text-right">SL kỳ</th>}
              </tr>
            </thead>
            <tbody>
              {data.segments.map((s) => {
                const items = data.wbs.filter((w) => w.segment_id === s.id);
                const a = weightedCompletion(items, calc.before);
                const b = weightedCompletion(items, calc.after);
                const snap = calc.snapAt(s.id);
                const st = snap ? RISK_STATUS[snap.status] : null;
                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-1 font-bold">{s.code}</td>
                    <td className="px-2">{st ? st.label : "—"}</td>
                    <td className="px-2 text-right">{snap?.score != null ? Math.round(Number(snap.score)) : "—"}</td>
                    <td className="px-2 text-right">{pct(a)}</td>
                    <td className="px-2 text-right font-semibold">{pct(b)}</td>
                    <td className="px-2 text-right">{a != null && b != null ? `+${Math.round((b - a) * 1000) / 10}%` : "—"}</td>
                    {canFin && <td className="px-2 text-right font-mono">{formatMoneyShort(sumA(calc.inPeriod.filter((r) => r.segment_id === s.id)))}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title="3. Khối lượng thực hiện trong kỳ">
          {calc.inPeriod.length === 0 ? (
            <p className="text-[11px] italic text-slate-400">Không có khối lượng được duyệt trong kỳ.</p>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[10px] font-extrabold uppercase text-slate-500 text-left border-b border-slate-200">
                  <th className="py-1">Lý trình</th>
                  <th className="px-2">Hạng mục</th>
                  <th className="px-2 text-right">KL kỳ</th>
                  <th className="px-2 text-right">Lũy kế</th>
                  <th className="px-2 text-right">KL HĐ</th>
                  <th className="px-2 text-right">% HT</th>
                  {canFin && <th className="px-2 text-right">GT kỳ (A-B)</th>}
                  {canFin && <th className="px-2 text-right">GT kỳ (B-B&apos;)</th>}
                </tr>
              </thead>
              <tbody>
                {[...new Set(calc.inPeriod.map((r) => r.segment_wbs_id))].map((swId) => {
                  const w = data.wbs.find((x) => x.id === swId);
                  const seg = data.segments.find((x) => x.id === w?.segment_id);
                  const it = w ? itemById.get(w.wbs_item_id) : null;
                  const rows = calc.inPeriod.filter((r) => r.segment_wbs_id === swId);
                  const q = rows.reduce((a, r) => a + Number(r.qty), 0);
                  const cum = calc.after.get(swId) || 0;
                  const b = Number(w?.budget_qty || 0);
                  return (
                    <tr key={swId} className="border-b border-slate-100">
                      <td className="py-1 font-bold">{seg?.code}</td>
                      <td className="px-2">
                        {it?.code} {it?.name}
                      </td>
                      <td className="px-2 text-right font-mono">
                        {q.toLocaleString("vi-VN")} {w?.unit || ""}
                      </td>
                      <td className="px-2 text-right font-mono">{cum.toLocaleString("vi-VN")}</td>
                      <td className="px-2 text-right font-mono">{b ? b.toLocaleString("vi-VN") : "—"}</td>
                      <td className="px-2 text-right">{b ? pct(Math.min(1, cum / b)) : "—"}</td>
                      {canFin && <td className="px-2 text-right font-mono">{formatMoneyShort(sumA(rows))}</td>}
                      {canFin && <td className="px-2 text-right font-mono">{formatMoneyShort(sumB(rows))}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="4. Cảnh báo">
          {openAlerts.length === 0 ? (
            <p className="text-[11px] italic text-slate-400">Không có cảnh báo đang mở.</p>
          ) : (
            <ul className="space-y-1 text-[11px]">
              {openAlerts.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${SEVERITY[a.severity].cls}`}>{SEVERITY[a.severity].label}</span>
                  <span>
                    {a.message}
                    {a.note ? ` — ${a.note}` : ""}
                    {newAlerts.some((n) => n.id === a.id) ? " (mới trong kỳ)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[11px] font-bold">
          <div>
            Người lập
            <div className="h-16" />
          </div>
          <div>
            Chỉ huy trưởng / QS
            <div className="h-16" />
          </div>
          <div>
            Giám đốc dự án
            <div className="h-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 break-inside-avoid">
      <h3 className="text-xs font-extrabold text-[#005BAC] uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg px-3 py-2">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className="text-sm font-extrabold font-mono">{value}</p>
    </div>
  );
}

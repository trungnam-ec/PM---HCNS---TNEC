"use client";

// ============================================================
// Quản lý dự án > Dashboard dự án (M8, P4) — màn hình Ban lãnh đạo.
// Mở trang -> pc_refresh_all() tính lại điểm + cảnh báo mọi dự án người xem được.
// • Thẻ tổng: số dự án, dự án chậm / nguy cơ, cảnh báo đỏ đang mở.
// • Bảng dự án: trạng thái xấu nhất, điểm rủi ro TB, %HT, số lý trình chậm,
//   cảnh báo; người có quyền tài chính thấy thêm GT HĐ + sản lượng lũy kế.
// • Cảnh báo đỏ / vàng mới nhất toàn công ty.
// Ban lãnh đạo thấy mọi dự án; người khác chỉ thấy dự án mình được xem (RLS).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  RISK_STATUS,
  SEVERITY,
  formatDate,
  formatMoneyShort,
  pct,
  pcErrorMessage,
  statusMeta,
  todayVN,
  worstStatus,
  type PcAlert,
  type PcProject,
  type PcProjectFinance,
  type PcRiskSnapshot,
  type PcSegment,
  type RiskStatus,
} from "@/lib/projectControl";
import { Loader2, RefreshCw, AlertTriangle, FolderKanban, Siren, TrendingDown, ChevronRight } from "lucide-react";

type Row = {
  p: PcProject;
  status: RiskStatus | null;
  score: number | null;
  completion: number | null;
  delayed: number;
  segs: number;
  high: number;
  medium: number;
  gt: number | null;
  actual: number | null;
};

export default function ProjectDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [alerts, setAlerts] = useState<(PcAlert & { projectName: string })[]>([]);
  const [hasFinance, setHasFinance] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const load = useCallback(async (recompute: boolean) => {
    // Dashboard chỉ dành cho BLĐ / TC-KT / cờ xem toàn bộ / GĐDA (migration 103).
    const { data: nav, error: navErr } = await supabase.rpc("pc_nav_access");
    const ok = navErr ? true : !!(nav as { can_dashboard?: boolean } | null)?.can_dashboard;
    setAllowed(ok);
    if (!ok) {
      setLoading(false);
      return;
    }
    if (recompute) {
      setRefreshing(true);
      const { error } = await supabase.rpc("pc_refresh_all");
      if (error) setErr(pcErrorMessage(error));
      setRefreshing(false);
    }
    const today = todayVN();
    const [p, s, sn, al, f] = await Promise.all([
      supabase.from("pc_projects").select("*").order("bdh_name"),
      supabase.from("pc_segments").select("id, project_id, km_start_m, km_end_m"),
      supabase.from("pc_risk_snapshots").select("*").eq("snap_date", today),
      supabase.from("pc_alerts").select("*").neq("status", "RESOLVED").order("last_seen", { ascending: false }).limit(500),
      supabase.from("pc_project_finance").select("*"),
    ]);
    if (p.error) setErr(pcErrorMessage(p.error));
    const projects = (p.data as PcProject[]) || [];
    const segs = (s.data as Pick<PcSegment, "id" | "project_id" | "km_start_m" | "km_end_m">[]) || [];
    const snaps = (sn.data as PcRiskSnapshot[]) || [];
    const als = (al.data as PcAlert[]) || [];
    const fins = (f.data as PcProjectFinance[]) || [];
    setHasFinance(fins.length > 0);

    // Sản lượng lũy kế theo dự án (view trả value NULL nếu không có quyền tiền).
    const actualBy = new Map<string, number>();
    if (fins.length) {
      // View cộng sẵn theo dự án (tránh giới hạn 1.000 dòng của Supabase).
      const { data: v } = await supabase.from("pc_v_project_actual").select("project_id, value_a");
      ((v as { project_id: string; value_a: number | null }[]) || []).forEach((r) => actualBy.set(r.project_id, Number(r.value_a || 0)));
    }

    const out: Row[] = projects.map((pr) => {
      const ps = snaps.filter((x) => x.project_id === pr.id);
      const segLen = new Map(segs.filter((x) => x.project_id === pr.id).map((x) => [x.id, Number(x.km_end_m) - Number(x.km_start_m)]));
      let wsum = 0;
      let acc = 0;
      ps.forEach((x) => {
        if (x.completion == null) return;
        const len = segLen.get(x.segment_id) || 0;
        wsum += len;
        acc += Number(x.completion) * len;
      });
      const scored = ps.filter((x) => x.score != null);
      const fin = fins.find((x) => x.project_id === pr.id);
      const pa = als.filter((a) => a.project_id === pr.id);
      return {
        p: pr,
        status: worstStatus(ps.map((x) => x.status)),
        score: scored.length ? scored.reduce((a, x) => a + Number(x.score), 0) / scored.length : null,
        completion: wsum > 0 ? acc / wsum : null,
        delayed: ps.filter((x) => x.status === "DELAYED").length,
        segs: segLen.size,
        high: pa.filter((a) => a.severity === "HIGH").length,
        medium: pa.filter((a) => a.severity === "MEDIUM").length,
        gt: fin?.contract_value_pre_vat != null ? Number(fin.contract_value_pre_vat) : null,
        actual: fin ? actualBy.get(pr.id) || 0 : null,
      };
    });
    // Xấu nhất lên đầu.
    const order = ["DELAYED", "AT_RISK", "CONTROLLED", "GOOD", "NOT_STARTED"];
    out.sort((a, b) => order.indexOf(a.status || "NOT_STARTED") - order.indexOf(b.status || "NOT_STARTED") || (b.score || 0) - (a.score || 0));
    setRows(out);
    const nameOf = new Map(projects.map((x) => [x.id, x.name]));
    setAlerts(
      als
        .filter((a) => a.severity !== "LOW")
        .sort((a, b) => (a.severity === b.severity ? (a.last_seen < b.last_seen ? 1 : -1) : a.severity === "HIGH" ? -1 : 1))
        .slice(0, 30)
        .map((a) => ({ ...a, projectName: nameOf.get(a.project_id) || "" }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(true);
  }, [load]);

  const totals = useMemo(
    () => ({
      projects: rows.length,
      delayed: rows.filter((r) => r.status === "DELAYED").length,
      atRisk: rows.filter((r) => r.status === "AT_RISK").length,
      high: rows.reduce((a, r) => a + r.high, 0),
    }),
    [rows]
  );

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Dashboard dự án" subtitle="Quản lý dự án" />
        <main className="flex-1 p-6 space-y-4 max-w-[1440px] w-full">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500">Số liệu ngày {formatDate(todayVN())}</span>
            {err && <span className="text-[11px] font-semibold text-rose-500">{err}</span>}
            <div className="flex-1" />
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 border border-slate-200 bg-white rounded-lg px-3 py-1.5 hover:bg-slate-50"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Tính lại
            </button>
          </div>

          {allowed === false ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
              <FolderKanban size={28} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">Dashboard dự án dành cho Ban lãnh đạo, TC-KT, người được cấp cờ xem toàn bộ và Giám đốc dự án.</p>
              <p className="text-xs text-slate-400 mt-1">Bạn vẫn xem được dự án của mình ở mục Thông tin quản trị dự án.</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="animate-spin text-[#005BAC]" size={28} />
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
              <FolderKanban size={28} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">Chưa có dự án nào bạn được xem.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi icon={<FolderKanban size={16} />} label="Dự án theo dõi" value={totals.projects} tone="text-[#005BAC]" />
                <Kpi icon={<TrendingDown size={16} />} label="Chậm tiến độ" value={totals.delayed} tone="text-rose-600" />
                <Kpi icon={<AlertTriangle size={16} />} label="Nguy cơ chậm" value={totals.atRisk} tone="text-amber-600" />
                <Kpi icon={<Siren size={16} />} label="Cảnh báo đỏ đang mở" value={totals.high} tone="text-rose-600" />
              </div>

              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                <table className="w-full min-w-[1100px] text-[11px]">
                  <thead>
                    <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left border-b border-slate-100">
                      <th className="px-4 py-3">Dự án</th>
                      <th className="px-2">Vòng đời</th>
                      <th className="px-2">Tình trạng</th>
                      <th className="px-2 text-right">Điểm rủi ro TB</th>
                      <th className="px-2 text-right">%HT</th>
                      <th className="px-2 text-right">Lý trình chậm</th>
                      <th className="px-2 text-center">Cảnh báo</th>
                      {hasFinance && <th className="px-2 text-right">GT HĐ</th>}
                      {hasFinance && <th className="px-2 text-right">SL lũy kế</th>}
                      <th className="px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const st = r.status ? RISK_STATUS[r.status] : null;
                      const lc = statusMeta(r.p.status);
                      return (
                        <tr key={r.p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                          <td className="px-4 py-2.5">
                            <span className="block text-xs font-bold text-slate-800">{r.p.name}</span>
                            <span className="text-[10px] text-slate-400">{r.p.bdh_name}</span>
                          </td>
                          <td className="px-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${lc.cls}`}>{lc.label}</span>
                          </td>
                          <td className="px-2">
                            {st ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-2 text-right font-mono font-bold">{r.score != null ? Math.round(r.score) : "—"}</td>
                          <td className="px-2 text-right font-semibold">{pct(r.completion)}</td>
                          <td className="px-2 text-right">{r.segs ? `${r.delayed}/${r.segs}` : "—"}</td>
                          <td className="px-2 text-center">
                            {r.high > 0 && <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500 text-white mr-1">{r.high}</span>}
                            {r.medium > 0 && <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-400 text-white">{r.medium}</span>}
                            {!r.high && !r.medium && <span className="text-slate-300">—</span>}
                          </td>
                          {hasFinance && <td className="px-2 text-right font-mono">{r.gt != null ? formatMoneyShort(r.gt) : "—"}</td>}
                          {hasFinance && (
                            <td className="px-2 text-right font-mono">
                              {r.actual != null ? formatMoneyShort(r.actual) : "—"}
                              {r.gt && r.actual != null ? <span className="block text-[10px] text-slate-400">{pct(r.actual / r.gt)}</span> : null}
                            </td>
                          )}
                          <td className="px-2 text-right">
                            <Link href={`/thong-tin-quan-tri-du-an/${r.p.id}`} className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#005BAC]">
                              Mở <ChevronRight size={12} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>

              <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100">
                  <h3 className="font-heading font-extrabold text-xs text-slate-800">Cảnh báo đỏ / vàng đang mở</h3>
                </div>
                <div className="p-5 space-y-1.5">
                  {alerts.length === 0 ? (
                    <p className="text-xs italic text-slate-400 text-center py-4">Không có cảnh báo đỏ / vàng nào.</p>
                  ) : (
                    alerts.map((a) => (
                      <Link
                        key={a.id}
                        href={`/thong-tin-quan-tri-du-an/${a.project_id}`}
                        className="flex items-start gap-2.5 py-1.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 rounded"
                      >
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${SEVERITY[a.severity].cls}`}>{SEVERITY[a.severity].label}</span>
                        <span className="text-[10px] font-bold text-slate-400 w-40 shrink-0 truncate mt-0.5">{a.projectName}</span>
                        <span className="text-xs font-semibold text-slate-700 flex-1">{a.message}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">từ {formatDate(a.first_seen.slice(0, 10))}</span>
                      </Link>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
      <span className={`w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center ${tone}`}>{icon}</span>
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`text-xl font-extrabold font-mono ${tone}`}>{value}</p>
      </div>
    </div>
  );
}

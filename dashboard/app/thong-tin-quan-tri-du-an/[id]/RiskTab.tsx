"use client";

// Tab Cảnh báo & Rủi ro (M8, P4):
// • Mở tab -> gọi pc_refresh_risk (SQL tính điểm + sinh / đóng cảnh báo).
// • Điểm rủi ro từng lý trình + 5 yếu tố, xu hướng 60 ngày (từ snapshot hằng ngày).
// • Danh sách cảnh báo: Mới / Đang xử lý / Đã hết; ghi chú xử lý.
// • Cấu hình trọng số + ngưỡng (GĐDA / BLĐ sửa) — không gõ cứng trong code.
// • Khoá kỳ: nhật ký / nghiệm thu / thanh toán đến ngày khoá không sửa được nữa.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ALERT_STATUS,
  RISK_STATUS,
  SEVERITY,
  addDays,
  formatDate,
  pct,
  pcDelete,
  pcErrorMessage,
  pcUpdate,
  pcUpsert,
  refreshRisk,
  todayVN,
  type PcAccess,
  type PcAlert,
  type PcPeriodLock,
  type PcRiskConfig,
  type PcRiskSnapshot,
  type PcSegment,
} from "@/lib/projectControl";
import { Card, Field, TextInput, PrimaryButton, ErrorLine, Modal } from "./ui";
import { Loader2, RefreshCw, Lock, Unlock, CheckCircle2, RotateCcw } from "lucide-react";

const FACTORS: { key: keyof PcRiskSnapshot; label: string; w: keyof PcRiskConfig }[] = [
  { key: "r_progress", label: "Tiến độ", w: "w_progress" },
  { key: "r_gpmb", label: "GPMB", w: "w_gpmb" },
  { key: "r_legal", label: "Pháp lý", w: "w_legal" },
  { key: "r_mobilization", label: "Huy động", w: "w_mobilization" },
  { key: "r_payment", label: "Tiền B-B'", w: "w_payment" },
  { key: "r_material", label: "Vật tư", w: "w_material" },
];

const SEG_COLORS = ["#005BAC", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#ec4899", "#64748b", "#f97316", "#14b8a6"];

export default function RiskTab({ projectId, access }: { projectId: string; access: PcAccess }) {
  const canManage = access.can_manage_members; // GĐDA / BLĐ
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [segments, setSegments] = useState<PcSegment[]>([]);
  const [snaps, setSnaps] = useState<PcRiskSnapshot[]>([]);
  const [alerts, setAlerts] = useState<PcAlert[]>([]);
  const [cfg, setCfg] = useState<PcRiskConfig | null>(null);
  const [lock, setLock] = useState<PcPeriodLock | null>(null);
  const [alertFilter, setAlertFilter] = useState<"ACTIVE" | "RESOLVED">("ACTIVE");
  const [noteFor, setNoteFor] = useState<PcAlert | null>(null);

  const load = useCallback(async () => {
    const since = addDays(todayVN(), -60);
    const [s, sn, al, c, lk] = await Promise.all([
      supabase.from("pc_segments").select("*").eq("project_id", projectId).order("km_start_m"),
      supabase.from("pc_risk_snapshots").select("*").eq("project_id", projectId).gte("snap_date", since).order("snap_date"),
      supabase.from("pc_alerts").select("*").eq("project_id", projectId).order("last_seen", { ascending: false }).limit(300),
      supabase.from("pc_risk_config").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("pc_period_locks").select("*").eq("project_id", projectId).maybeSingle(),
    ]);
    const firstErr = [sn, al].find((r) => r.error)?.error;
    if (firstErr) setErr(pcErrorMessage(firstErr));
    setSegments((s.data as PcSegment[]) || []);
    setSnaps((sn.data as PcRiskSnapshot[]) || []);
    setAlerts((al.data as PcAlert[]) || []);
    setCfg((c.data as PcRiskConfig) || null);
    setLock((lk.data as PcPeriodLock) || null);
    setLoading(false);
  }, [projectId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const e = await refreshRisk(projectId);
    if (e) setErr(e);
    await load();
    setRefreshing(false);
  }, [projectId, load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const today = todayVN();
  const latest = useMemo(() => {
    const m = new Map<string, PcRiskSnapshot>();
    snaps.forEach((s) => {
      const cur = m.get(s.segment_id);
      if (!cur || s.snap_date > cur.snap_date) m.set(s.segment_id, s);
    });
    return m;
  }, [snaps]);

  // Xu hướng: mỗi ngày 1 điểm, mỗi lý trình 1 đường.
  const trend = useMemo(() => {
    const dates = [...new Set(snaps.map((s) => s.snap_date))].sort();
    return dates.map((d) => {
      const row: Record<string, string | number | null> = { date: formatDate(d).slice(0, 5) };
      segments.forEach((sg) => {
        const s = snaps.find((x) => x.segment_id === sg.id && x.snap_date === d);
        row[sg.code] = s?.score ?? null;
      });
      return row;
    });
  }, [snaps, segments]);

  const segCode = (id: string | null) => (id ? segments.find((s) => s.id === id)?.code || "?" : "Dự án");
  const shownAlerts = alerts.filter((a) => (alertFilter === "ACTIVE" ? a.status !== "RESOLVED" : a.status === "RESOLVED"));
  const activeCount = alerts.filter((a) => a.status !== "RESOLVED").length;
  const canHandle = access.can_edit_site || access.can_view_finance;

  async function setAlertStatus(a: PcAlert, status: "OPEN" | "ACK", note?: string) {
    const e = await pcUpdate("pc_alerts", { id: a.id }, { status, ...(note !== undefined ? { note: note || null } : {}) });
    if (e) setErr(e);
    load();
  }

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#005BAC]" size={26} />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ErrorLine msg={err} />
        <div className="flex-1" />
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 border border-slate-200 bg-white rounded-lg px-3 py-1.5 hover:bg-slate-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Tính lại
        </button>
      </div>

      {/* ─── Điểm rủi ro theo lý trình ─── */}
      <Card title={`Điểm rủi ro theo lý trình — ${formatDate(today)}`}>
        {segments.length === 0 ? (
          <p className="text-xs italic text-slate-400">Chưa có lý trình.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] table-fixed text-[11px]">
              <colgroup>
                <col className="w-[80px]" />
                <col className="w-[130px]" />
                <col className="w-[170px]" />
                {FACTORS.map((f) => (
                  <col key={f.key} />
                ))}
                <col className="w-[90px]" />
              </colgroup>
              <thead>
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left">
                  <th className="py-1.5">Lý trình</th>
                  <th className="px-2">Trạng thái</th>
                  <th className="px-2">Điểm rủi ro</th>
                  {FACTORS.map((f) => (
                    <th key={f.key} className="px-2 text-center">
                      {f.label}
                      {cfg && <span className="block text-[9px] font-bold text-slate-300 normal-case">trọng số {Number(cfg[f.w])}</span>}
                    </th>
                  ))}
                  <th className="px-2 text-right">%HT</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((sg) => {
                  const s = latest.get(sg.id);
                  const st = s ? RISK_STATUS[s.status] : null;
                  return (
                    <tr key={sg.id} className="border-t border-slate-100">
                      <td className="py-2 font-extrabold text-slate-800">{sg.code}</td>
                      <td className="px-2">{st && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>}</td>
                      <td className="px-2">
                        {s?.score != null ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full ${Number(s.score) >= 60 ? "bg-rose-500" : Number(s.score) >= 40 ? "bg-amber-400" : Number(s.score) >= 20 ? "bg-sky-500" : "bg-emerald-500"}`}
                                style={{ width: `${Number(s.score)}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-slate-700 w-9 text-right">{Math.round(Number(s.score))}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      {FACTORS.map((f) => {
                        const v = s ? (s[f.key] as number | null) : null;
                        return (
                          <td key={f.key} className="px-2 text-center">
                            {v == null ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <span
                                className={`inline-block min-w-[44px] text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  Number(v) >= 0.6 ? "bg-rose-100 text-rose-700" : Number(v) >= 0.3 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {Math.round(Number(v) * 100)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 text-right font-semibold text-slate-700">{pct(s?.completion ?? null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-2">
          Mỗi yếu tố tính từ 0 (an toàn) đến 100 (rủi ro cao); điểm lý trình là trung bình có trọng số của các yếu tố có dữ liệu (dấu — = chưa có dữ
          liệu, không tính).
        </p>
      </Card>

      {/* ─── Xu hướng ─── */}
      <Card title="Xu hướng điểm rủi ro (60 ngày)">
        {trend.length < 2 ? (
          <p className="text-xs italic text-slate-400">Cần ít nhất 2 ngày dữ liệu — điểm được lưu mỗi ngày có người mở tab này hoặc dashboard.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {segments.map((sg, i) => (
                  <Line key={sg.id} type="monotone" dataKey={sg.code} stroke={SEG_COLORS[i % SEG_COLORS.length]} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ─── Cảnh báo ─── */}
      <Card
        title={`Cảnh báo (${activeCount} đang mở)`}
        action={
          <div className="flex gap-1">
            {(["ACTIVE", "RESOLVED"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setAlertFilter(k)}
                className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                  alertFilter === k ? "bg-[#005BAC] text-white border-transparent" : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                {k === "ACTIVE" ? "Đang mở" : "Đã hết"}
              </button>
            ))}
          </div>
        }
      >
        {shownAlerts.length === 0 ? (
          <p className="text-xs italic text-slate-400 text-center py-4">{alertFilter === "ACTIVE" ? "Không có cảnh báo nào đang mở." : "Chưa có cảnh báo nào đã hết."}</p>
        ) : (
          <div className="space-y-1.5">
            {shownAlerts.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 py-1.5 border-b border-slate-100 last:border-0">
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${SEVERITY[a.severity].cls}`}>{SEVERITY[a.severity].label}</span>
                <span className="text-[10px] font-bold text-slate-400 w-12 shrink-0 mt-0.5">{segCode(a.segment_id)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700">{a.message}</p>
                  <p className="text-[10px] text-slate-400">
                    Từ {formatDate(a.first_seen.slice(0, 10))}
                    {a.resolved_at ? ` · hết ${formatDate(a.resolved_at.slice(0, 10))}` : ""}
                    {a.note ? ` · Ghi chú: ${a.note}` : ""}
                    {a.handled_by ? ` (${a.handled_by.split("@")[0]})` : ""}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${ALERT_STATUS[a.status].cls}`}>{ALERT_STATUS[a.status].label}</span>
                {canHandle && a.status === "OPEN" && (
                  <button
                    onClick={() => setNoteFor(a)}
                    className="flex items-center gap-1 text-[10px] font-bold text-[#005BAC] bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md shrink-0"
                  >
                    <CheckCircle2 size={11} /> Nhận xử lý
                  </button>
                )}
                {canHandle && a.status === "ACK" && (
                  <button onClick={() => setAlertStatus(a, "OPEN")} className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-[#005BAC] shrink-0" title="Mở lại">
                    <RotateCcw size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cfg && <ConfigCard cfg={cfg} canEdit={canManage} onSaved={refresh} />}
        <LockCard projectId={projectId} lock={lock} canEdit={canManage} onSaved={load} />
      </div>

      {noteFor && (
        <NoteModal
          alert={noteFor}
          onClose={() => setNoteFor(null)}
          onSave={async (note) => {
            const a = noteFor;
            setNoteFor(null);
            await setAlertStatus(a, "ACK", note);
          }}
        />
      )}
    </div>
  );
}

function NoteModal({ alert, onClose, onSave }: { alert: PcAlert; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState(alert.note || "");
  return (
    <Modal title="Nhận xử lý cảnh báo" onClose={onClose}>
      <p className="text-xs font-semibold text-slate-700">{alert.message}</p>
      <Field label="Hướng xử lý / ghi chú">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Đã làm việc với địa phương, dự kiến bàn giao 30/09…" autoFocus />
      </Field>
      <div className="flex justify-end">
        <PrimaryButton onClick={() => onSave(note.trim())}>Lưu</PrimaryButton>
      </div>
    </Modal>
  );
}

function ConfigCard({ cfg, canEdit, onSaved }: { cfg: PcRiskConfig; canEdit: boolean; onSaved: () => void }) {
  const [f, setF] = useState(() => ({
    w_progress: String(Number(cfg.w_progress)),
    w_gpmb: String(Number(cfg.w_gpmb)),
    w_legal: String(Number(cfg.w_legal)),
    w_mobilization: String(Number(cfg.w_mobilization)),
    w_payment: String(Number(cfg.w_payment)),
    dp_warn: String(Math.round(Number(cfg.dp_warn) * 1000) / 10),
    dp_full: String(Math.round(Number(cfg.dp_full) * 1000) / 10),
    band_good: String(cfg.band_good),
    band_control: String(cfg.band_control),
    band_risk: String(cfg.band_risk),
    log_gap_days: String(cfg.log_gap_days),
    w_material: String(Number(cfg.w_material ?? 10)),
    mat_days_warn: String(cfg.mat_days_warn ?? 7),
    mat_waste_warn: String(Math.round(Number(cfg.mat_waste_warn ?? 0.05) * 1000) / 10),
    mat_price_warn: String(Math.round(Number(cfg.mat_price_warn ?? 0.1) * 1000) / 10),
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = (s: string) => parseFloat(s.replace(",", "."));

  async function save() {
    const vals = Object.values(f).map(n);
    if (vals.some((v) => !Number.isFinite(v) || v < 0)) return setErr("Có ô không hợp lệ.");
    if (!(n(f.band_good) < n(f.band_control) && n(f.band_control) < n(f.band_risk))) return setErr("Ngưỡng điểm phải tăng dần: Tốt < Kiểm soát < Nguy cơ.");
    setSaving(true);
    setErr(null);
    const e = await pcUpsert(
      "pc_risk_config",
      {
        project_id: cfg.project_id,
        w_progress: n(f.w_progress),
        w_gpmb: n(f.w_gpmb),
        w_legal: n(f.w_legal),
        w_mobilization: n(f.w_mobilization),
        w_payment: n(f.w_payment),
        dp_warn: n(f.dp_warn) / 100,
        dp_full: n(f.dp_full) / 100,
        band_good: Math.round(n(f.band_good)),
        band_control: Math.round(n(f.band_control)),
        band_risk: Math.round(n(f.band_risk)),
        log_gap_days: Math.round(n(f.log_gap_days)),
        w_material: n(f.w_material),
        mat_days_warn: Math.round(n(f.mat_days_warn)),
        mat_waste_warn: n(f.mat_waste_warn) / 100,
        mat_price_warn: n(f.mat_price_warn) / 100,
      },
      "project_id"
    );
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  const box = (k: keyof typeof f, label: string, suffix = "") => (
    <Field label={label}>
      <div className="relative">
        <TextInput value={f[k]} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} className="pr-7 text-right" />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{suffix}</span>}
      </div>
    </Field>
  );

  return (
    <Card
      title="Cấu hình chấm điểm"
      action={canEdit ? <PrimaryButton onClick={save} busy={saving}>Lưu & tính lại</PrimaryButton> : <span className="text-[10px] font-bold text-slate-400">Chỉ GĐDA / BLĐ sửa</span>}
    >
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Trọng số yếu tố</p>
      <div className="grid grid-cols-6 gap-2">
        {box("w_progress", "Tiến độ")}
        {box("w_gpmb", "GPMB")}
        {box("w_legal", "Pháp lý")}
        {box("w_mobilization", "Huy động")}
        {box("w_payment", "Tiền B-B'")}
        {box("w_material", "Vật tư")}
      </div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mt-3 mb-2">Ngưỡng</p>
      <div className="grid grid-cols-3 gap-2">
        {box("dp_warn", "Chậm khi ΔP dưới −", "%")}
        {box("dp_full", "Rủi ro tiến độ tối đa khi ΔP −", "%")}
        {box("log_gap_days", "Báo thiếu nhật ký sau", "ng")}
        {box("band_good", "Tốt nếu điểm <")}
        {box("band_control", "Kiểm soát nếu <")}
        {box("band_risk", "Nguy cơ nếu <")}
        {box("mat_days_warn", "Vật tư sắp hết trong", "ng")}
        {box("mat_waste_warn", "Hao hụt vượt", "%")}
        {box("mat_price_warn", "Trượt giá vượt", "%")}
      </div>
      <ErrorLine msg={err} />
    </Card>
  );
}

function LockCard({ projectId, lock, canEdit, onSaved }: { projectId: string; lock: PcPeriodLock | null; canEdit: boolean; onSaved: () => void }) {
  const [date, setDate] = useState(lock?.locked_until || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!date) return setErr("Chọn ngày khoá.");
    if (date > todayVN()) return setErr("Không khoá kỳ tương lai.");
    setSaving(true);
    setErr(null);
    const email = (await supabase.auth.getUser()).data.user?.email || null;
    const e = await pcUpsert(
      "pc_period_locks",
      { project_id: projectId, locked_until: date, locked_by: email, locked_at: new Date().toISOString() },
      "project_id"
    );
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  async function unlock() {
    setSaving(true);
    const e = await pcDelete("pc_period_locks", { project_id: projectId });
    setSaving(false);
    if (e) return setErr(e);
    setDate("");
    onSaved();
  }

  return (
    <Card title="Khoá kỳ số liệu">
      {lock ? (
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-3">
          <Lock size={13} className="text-rose-500" /> Đã khoá đến hết ngày <b>{formatDate(lock.locked_until)}</b>
          <span className="text-[10px] text-slate-400 font-normal">
            ({(lock.locked_by || "").split("@")[0]}, {formatDate(lock.locked_at.slice(0, 10))})
          </span>
        </p>
      ) : (
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-3">
          <Unlock size={13} /> Chưa khoá kỳ nào.
        </p>
      )}
      <p className="text-[11px] text-slate-500 mb-3">
        Nhật ký sản lượng, nghiệm thu, thanh toán có ngày ≤ mốc khoá sẽ không thêm / sửa / xoá được — số liệu báo cáo tháng giữ nguyên.
      </p>
      {canEdit ? (
        <div className="flex items-end gap-2">
          <Field label="Khoá đến hết ngày" className="flex-1">
            <TextInput type="date" value={date} max={todayVN()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <PrimaryButton onClick={save} busy={saving}>
            <Lock size={12} /> Khoá
          </PrimaryButton>
          {lock && (
            <button onClick={unlock} disabled={saving} className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
              Mở khoá
            </button>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400">Chỉ GĐDA / Ban lãnh đạo khoá hoặc mở khoá.</p>
      )}
      <ErrorLine msg={err} />
    </Card>
  );
}

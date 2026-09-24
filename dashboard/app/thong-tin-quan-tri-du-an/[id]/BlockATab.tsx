"use client";

// Tab A. Kế hoạch triển khai thi công (M4, P2):
// • GPMB: từng đoạn bàn giao (từ – đến, trái/phải) -> % GPMB lý trình tự tính.
// • Huy động: XMTB, vật tư, nhân công, điện nước, lán trại, đường công vụ, VTTB
//   đặc biệt — trạng thái 0 / 0.5 / 1 bấm đổi ngay trên dòng.
// • Phát sinh thiết kế: 3 bước Hồ sơ → TVGS → CĐT; giá trị dự kiến / duyệt chỉ
//   người có quyền tài chính thấy (pc_design_change_finance).
// Kế hoạch sản lượng theo tháng (baseline) thuộc P3 cùng nhật ký sản lượng.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useConfirmBox } from "@/components/ConfirmDialog";
import {
  GPMB_STATUS,
  MOB_CATEGORIES,
  SCALE_INTERNAL,
  SCALE_MOBILIZE,
  SCALE_SUPERVISOR,
  SIDE_LABEL,
  formatDate,
  formatKm,
  formatMoneyShort,
  formatVnd,
  gpmbPercent,
  heatCls,
  parseKm,
  parseVnd,
  pct,
  pcDelete,
  pcErrorMessage,
  pcUpdate,
  pcUpsert,
  readiness,
  type PcAccess,
  type PcDesignChange,
  type PcLandClearance,
  type PcMobilization,
  type PcSegment,
  type PcWbsItem,
} from "@/lib/projectControl";
import { Card, Field, TextInput, Select, MoneyInput, PrimaryButton, ErrorLine, Modal, TriToggle, StatusBar } from "./ui";
import { Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";

type DcMoney = { est_value: number | null; approved_value: number | null };

export default function BlockATab({
  projectId,
  access,
  focusSegment,
  setFocusSegment,
}: {
  projectId: string;
  access: PcAccess;
  focusSegment: string | null;
  setFocusSegment: (id: string | null) => void;
}) {
  const canEdit = access.can_edit_site;
  const canFin = access.can_view_finance;
  const { ask, confirmNode } = useConfirmBox();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [segments, setSegments] = useState<PcSegment[]>([]);
  const [catalog, setCatalog] = useState<PcWbsItem[]>([]);
  const [gpmb, setGpmb] = useState<PcLandClearance[]>([]);
  const [mob, setMob] = useState<PcMobilization[]>([]);
  const [dcs, setDcs] = useState<PcDesignChange[]>([]);
  const [dcMoney, setDcMoney] = useState<Record<string, DcMoney>>({});
  const [gpmbEdit, setGpmbEdit] = useState<PcLandClearance | "new" | null>(null);
  const [mobEdit, setMobEdit] = useState<PcMobilization | "new" | null>(null);
  const [dcEdit, setDcEdit] = useState<PcDesignChange | "new" | null>(null);

  const load = useCallback(async () => {
    const [s, c, g, m, d] = await Promise.all([
      supabase.from("pc_segments").select("*").eq("project_id", projectId).order("km_start_m"),
      supabase.from("pc_wbs_items").select("*").order("sort_order"),
      supabase.from("pc_land_clearance").select("*").eq("project_id", projectId).order("from_m"),
      supabase.from("pc_mobilization").select("*").eq("project_id", projectId).order("planned_date", { nullsFirst: false }),
      supabase.from("pc_design_changes").select("*").eq("project_id", projectId).order("created_at"),
    ]);
    const firstErr = [s, g, m, d].find((r) => r.error)?.error;
    setErr(firstErr ? pcErrorMessage(firstErr) : null);
    setSegments((s.data as PcSegment[]) || []);
    setCatalog((c.data as PcWbsItem[]) || []);
    setGpmb((g.data as PcLandClearance[]) || []);
    setMob((m.data as PcMobilization[]) || []);
    const dlist = (d.data as PcDesignChange[]) || [];
    setDcs(dlist);
    if (canFin && dlist.length) {
      const { data } = await supabase.from("pc_design_change_finance").select("*").in("design_change_id", dlist.map((x) => x.id));
      const map: Record<string, DcMoney> = {};
      ((data as ({ design_change_id: string } & DcMoney)[]) || []).forEach((r) => (map[r.design_change_id] = r));
      setDcMoney(map);
    }
    setLoading(false);
  }, [projectId, canFin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const segById = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);
  const itemById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const shownSegs = focusSegment ? segments.filter((s) => s.id === focusSegment) : segments;
  // Mục cấp dự án (segment_id null) luôn hiện kèm.
  const inFocus = (segId: string | null) => !focusSegment || segId === focusSegment || segId === null;

  function confirmDelete(title: string, table: string, id: string) {
    ask({
      title,
      onConfirm: async () => {
        const e = await pcDelete(table, { id });
        if (e) setErr(e);
        load();
      },
    });
  }

  // Đổi trạng thái ngay trên dòng: cập nhật tạm trên giao diện, lỗi thì nạp lại.
  async function quickSet(table: string, id: string, patch: Record<string, unknown>, apply: () => void) {
    apply();
    const e = await pcUpdate(table, { id }, patch);
    if (e) {
      setErr(e);
      load();
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#005BAC]" size={26} />
      </div>
    );

  const segLabel = (id: string | null) => (id ? segById.get(id)?.code || "?" : "Cả dự án");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <SegChip active={!focusSegment} onClick={() => setFocusSegment(null)}>
          Tất cả lý trình
        </SegChip>
        {segments.map((s) => (
          <SegChip key={s.id} active={focusSegment === s.id} onClick={() => setFocusSegment(s.id)}>
            {s.code}
          </SegChip>
        ))}
      </div>
      <ErrorLine msg={err} />

      {/* ─── GPMB ─── */}
      <Card
        title="Giải phóng mặt bằng"
        action={
          canEdit && segments.length > 0 ? (
            <PrimaryButton onClick={() => setGpmbEdit("new")}>
              <Plus size={13} /> Thêm đoạn bàn giao
            </PrimaryButton>
          ) : null
        }
      >
        {segments.length === 0 ? (
          <p className="text-xs italic text-slate-400">Chưa có lý trình.</p>
        ) : (
          <div className="space-y-3">
            {shownSegs.map((s) => {
              const rows = gpmb.filter((g) => g.segment_id === s.id);
              const v = rows.length ? gpmbPercent(s, rows) : 0;
              return (
                <div key={s.id} className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-extrabold text-slate-800 w-14">{s.code}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${v * 100}%` }} />
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${heatCls(rows.length ? v : null)}`}>{pct(rows.length ? v : null)}</span>
                    <span className="text-[10px] text-slate-400 w-40 text-right">
                      {(Number(s.km_end_m) - Number(s.km_start_m)).toLocaleString("vi-VN")} m × {s.sides} bên
                    </span>
                  </div>
                  {rows.map((r) => {
                    const st = GPMB_STATUS[r.status];
                    return (
                      <div key={r.id} className="flex items-center gap-2 text-[11px] pl-16">
                        <span className="font-mono text-slate-600 w-44 shrink-0">
                          {formatKm(r.from_m)} – {formatKm(r.to_m)}
                        </span>
                        <span className="text-slate-400 w-16 shrink-0">{(Number(r.to_m) - Number(r.from_m)).toLocaleString("vi-VN")} m</span>
                        <span className="text-slate-500 w-20 shrink-0">{SIDE_LABEL[r.side]}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
                        <span className="text-slate-400 shrink-0">{formatDate(r.handover_date)}</span>
                        <span className="text-slate-500 flex-1 min-w-0 truncate" title={r.obstruction_note || r.note || ""}>
                          {r.obstruction_note ? `⚠ ${r.obstruction_note}` : r.note}
                        </span>
                        {canEdit && (
                          <>
                            <button onClick={() => setGpmbEdit(r)} className="text-slate-300 hover:text-[#005BAC]">
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => confirmDelete("Xoá đoạn bàn giao này?", "pc_land_clearance", r.id)} className="text-slate-300 hover:text-rose-500">
                              <Trash2 size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── HUY ĐỘNG ─── */}
      <Card
        title={`Huy động — sẵn sàng ${pct(readiness(mob.filter((m) => inFocus(m.segment_id)).map((m) => Number(m.status))))}`}
        action={
          canEdit ? (
            <PrimaryButton onClick={() => setMobEdit("new")}>
              <Plus size={13} /> Thêm mục huy động
            </PrimaryButton>
          ) : null
        }
      >
        {mob.filter((m) => inFocus(m.segment_id)).length === 0 ? (
          <p className="text-xs italic text-slate-400">Chưa có mục huy động.</p>
        ) : (
          <div className="space-y-3">
            {MOB_CATEGORIES.map((cat) => {
              const rows = mob.filter((m) => m.category === cat.value && inFocus(m.segment_id));
              if (!rows.length) return null;
              return (
                <div key={cat.value}>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                    {cat.label} · {pct(readiness(rows.map((r) => Number(r.status))))}
                  </p>
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-[11px] py-1">
                      <span className="font-semibold text-slate-700 flex-1 min-w-0 truncate">{r.item_name}</span>
                      <span className="text-slate-400 w-16 shrink-0">{segLabel(r.segment_id)}</span>
                      <span className="text-slate-400 w-20 shrink-0">{formatDate(r.planned_date)}</span>
                      <span className="text-slate-500 w-28 shrink-0 text-right">
                        {r.actual_qty ?? 0}/{r.planned_qty ?? "?"} {r.unit || ""}
                      </span>
                      <StatusBar
                        compact
                        widthCls="w-72"
                        scale={SCALE_MOBILIZE}
                        value={Number(r.status)}
                        disabled={!canEdit}
                        onChange={(v) =>
                          quickSet("pc_mobilization", r.id, { status: v }, () =>
                            setMob((xs) => xs.map((x) => (x.id === r.id ? { ...x, status: v as 0 | 0.5 | 1 } : x)))
                          )
                        }
                      />
                      {canEdit && (
                        <>
                          <button onClick={() => setMobEdit(r)} className="text-slate-300 hover:text-[#005BAC]">
                            <Pencil size={11} />
                          </button>
                          <button onClick={() => confirmDelete(`Xoá "${r.item_name}"?`, "pc_mobilization", r.id)} className="text-slate-300 hover:text-rose-500">
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── PHÁT SINH THIẾT KẾ ─── */}
      <Card
        title="Phát sinh thiết kế"
        action={
          canEdit ? (
            <PrimaryButton onClick={() => setDcEdit("new")}>
              <Plus size={13} /> Thêm phát sinh
            </PrimaryButton>
          ) : null
        }
      >
        {dcs.filter((d) => inFocus(d.segment_id)).length === 0 ? (
          <p className="text-xs italic text-slate-400">Chưa có phát sinh thiết kế.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left">
                  <th className="py-1.5 pr-2">Phát sinh</th>
                  <th className="px-1">Lý trình</th>
                  <th className="px-1">Hồ sơ</th>
                  <th className="px-1">TVGS</th>
                  <th className="px-1">CĐT</th>
                  <th className="px-1">Ảnh hưởng</th>
                  <th className="px-1">Hạn</th>
                  {canFin && <th className="px-1 text-right">Dự kiến / Duyệt</th>}
                  {canEdit && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {dcs
                  .filter((d) => inFocus(d.segment_id))
                  .map((d) => {
                    const it = d.wbs_item_id ? itemById.get(d.wbs_item_id) : null;
                    const money = dcMoney[d.id];
                    const set = (k: "internal_status" | "supervisor_status" | "owner_status") => (v: number) =>
                      quickSet("pc_design_changes", d.id, { [k]: v }, () =>
                        setDcs((xs) => xs.map((x) => (x.id === d.id ? { ...x, [k]: v } : x)))
                      );
                    return (
                      <tr key={d.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-2">
                          <span className="font-semibold text-slate-700">{d.name}</span>
                          {it && <span className="block text-[10px] text-slate-400">{it.code} {it.name}</span>}
                        </td>
                        <td className="px-1 text-slate-500">{segLabel(d.segment_id)}</td>
                        <td className="px-1">
                          <TriToggle value={Number(d.internal_status)} scale={SCALE_INTERNAL} disabled={!canEdit} onChange={set("internal_status")} />
                        </td>
                        <td className="px-1">
                          <TriToggle value={Number(d.supervisor_status)} scale={SCALE_SUPERVISOR} disabled={!canEdit} onChange={set("supervisor_status")} />
                        </td>
                        <td className="px-1">
                          <TriToggle value={Number(d.owner_status)} scale={SCALE_SUPERVISOR} disabled={!canEdit} onChange={set("owner_status")} />
                        </td>
                        <td className="px-1 text-slate-500">{d.impact_days != null ? `${d.impact_days} ngày` : ""}</td>
                        <td className="px-1 text-slate-500">{formatDate(d.due_date)}</td>
                        {canFin && (
                          <td className="px-1 text-right font-mono text-slate-600">
                            {money ? `${formatMoneyShort(money.est_value)} / ${formatMoneyShort(money.approved_value)}` : "—"}
                          </td>
                        )}
                        {canEdit && (
                          <td className="text-right whitespace-nowrap">
                            <button onClick={() => setDcEdit(d)} className="text-slate-300 hover:text-[#005BAC] mr-1.5">
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => confirmDelete(`Xoá phát sinh "${d.name}"?`, "pc_design_changes", d.id)} className="text-slate-300 hover:text-rose-500">
                              <Trash2 size={11} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {gpmbEdit && (
        <GpmbModal
          projectId={projectId}
          row={gpmbEdit === "new" ? null : gpmbEdit}
          segments={segments}
          defaultSegment={focusSegment}
          onClose={() => setGpmbEdit(null)}
          onSaved={() => {
            setGpmbEdit(null);
            load();
          }}
        />
      )}
      {mobEdit && (
        <MobModal
          projectId={projectId}
          row={mobEdit === "new" ? null : mobEdit}
          segments={segments}
          defaultSegment={focusSegment}
          onClose={() => setMobEdit(null)}
          onSaved={() => {
            setMobEdit(null);
            load();
          }}
        />
      )}
      {dcEdit && (
        <DcModal
          projectId={projectId}
          row={dcEdit === "new" ? null : dcEdit}
          money={dcEdit === "new" ? null : dcMoney[dcEdit.id] || null}
          segments={segments}
          catalog={catalog}
          defaultSegment={focusSegment}
          canEditFin={access.can_edit_finance}
          onClose={() => setDcEdit(null)}
          onSaved={() => {
            setDcEdit(null);
            load();
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}

function SegChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${
        active ? "bg-[#005BAC] text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function SegmentSelect({
  segments,
  value,
  onChange,
  allowProject,
}: {
  segments: PcSegment[];
  value: string;
  onChange: (v: string) => void;
  allowProject?: boolean;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowProject ? <option value="">Cả dự án</option> : <option value="">— Chọn lý trình —</option>}
      {segments.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code} ({formatKm(s.km_start_m)} – {formatKm(s.km_end_m)})
        </option>
      ))}
    </Select>
  );
}

function GpmbModal({
  projectId,
  row,
  segments,
  defaultSegment,
  onClose,
  onSaved,
}: {
  projectId: string;
  row: PcLandClearance | null;
  segments: PcSegment[];
  defaultSegment: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [segId, setSegId] = useState(row?.segment_id || defaultSegment || "");
  const seg = segments.find((s) => s.id === segId);
  const [from, setFrom] = useState(row ? formatKm(row.from_m) : "");
  const [to, setTo] = useState(row ? formatKm(row.to_m) : "");
  const [side, setSide] = useState<string>(row?.side || "BOTH");
  const [status, setStatus] = useState<string>(row?.status || "HANDED_OVER");
  const [date, setDate] = useState(row?.handover_date || "");
  const [obs, setObs] = useState(row?.obstruction_note || "");
  const [note, setNote] = useState(row?.note || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!seg) return setErr("Chọn lý trình.");
    const a = parseKm(from);
    const b = parseKm(to);
    if (a === null || b === null) return setErr("Km không hợp lệ. Gõ dạng Km0+100 hoặc số mét.");
    if (b <= a) return setErr("Km đến phải lớn hơn Km từ.");
    if (a < Number(seg.km_start_m) || b > Number(seg.km_end_m))
      return setErr(`Đoạn phải nằm trong lý trình ${seg.code}: ${formatKm(seg.km_start_m)} – ${formatKm(seg.km_end_m)}.`);
    setSaving(true);
    setErr(null);
    const payload = {
      segment_id: seg.id,
      from_m: a,
      to_m: b,
      side,
      status,
      handover_date: date || null,
      obstruction_note: obs.trim() || null,
      note: note.trim() || null,
    };
    let e: string | null = null;
    if (row) e = await pcUpdate("pc_land_clearance", { id: row.id }, payload);
    else {
      const { error } = await supabase.from("pc_land_clearance").insert({ ...payload, project_id: projectId });
      if (error) e = pcErrorMessage(error);
    }
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  return (
    <Modal title={row ? "Sửa đoạn GPMB" : "Thêm đoạn bàn giao GPMB"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lý trình" className="col-span-2">
          <SegmentSelect segments={segments} value={segId} onChange={setSegId} />
        </Field>
        <Field label="Từ Km">
          <TextInput value={from} onChange={(e) => setFrom(e.target.value)} placeholder={seg ? formatKm(seg.km_start_m) : "Km0+000"} />
        </Field>
        <Field label="Đến Km">
          <TextInput value={to} onChange={(e) => setTo(e.target.value)} placeholder={seg ? formatKm(seg.km_end_m) : "Km0+100"} />
        </Field>
        <Field label="Bên tuyến">
          <Select value={side} onChange={(e) => setSide(e.target.value)}>
            {Object.entries(SIDE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Trạng thái">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(GPMB_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ngày bàn giao">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div />
        <Field label="Vướng mắc (hộ dân, điện, nước, cáp…)" className="col-span-2">
          <TextInput value={obs} onChange={(e) => setObs(e.target.value)} />
        </Field>
        <Field label="Ghi chú" className="col-span-2">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {status === "OBSTRUCTED" && !obs.trim() && (
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600">
          <AlertTriangle size={12} /> Nên ghi rõ vướng mắc để Ban lãnh đạo nắm.
        </p>
      )}
      <ErrorLine msg={err} />
      <div className="flex justify-end">
        <PrimaryButton onClick={save} busy={saving}>
          Lưu
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function MobModal({
  projectId,
  row,
  segments,
  defaultSegment,
  onClose,
  onSaved,
}: {
  projectId: string;
  row: PcMobilization | null;
  segments: PcSegment[];
  defaultSegment: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(() => ({
    segment_id: row ? row.segment_id || "" : defaultSegment || "",
    category: row?.category || "EQUIPMENT",
    item_name: row?.item_name || "",
    planned_date: row?.planned_date || "",
    planned_qty: row?.planned_qty != null ? String(row.planned_qty) : "",
    actual_qty: row?.actual_qty != null ? String(row.actual_qty) : "",
    unit: row?.unit || "",
    status: Number(row?.status ?? 0),
    note: row?.note || "",
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const num = (s: string) => {
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  async function save() {
    if (!f.item_name.trim()) return setErr("Nhập tên thiết bị / vật tư / hạng mục huy động.");
    setSaving(true);
    setErr(null);
    const payload = {
      segment_id: f.segment_id || null,
      category: f.category,
      item_name: f.item_name.trim(),
      planned_date: f.planned_date || null,
      planned_qty: num(f.planned_qty),
      actual_qty: num(f.actual_qty),
      unit: f.unit.trim() || null,
      status: f.status,
      note: f.note.trim() || null,
    };
    let e: string | null = null;
    if (row) e = await pcUpdate("pc_mobilization", { id: row.id }, payload);
    else {
      const { error } = await supabase.from("pc_mobilization").insert({ ...payload, project_id: projectId });
      if (error) e = pcErrorMessage(error);
    }
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  return (
    <Modal title={row ? "Sửa mục huy động" : "Thêm mục huy động"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nhóm">
          <Select value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>
            {MOB_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lý trình">
          <SegmentSelect segments={segments} value={f.segment_id} onChange={(v) => setF((x) => ({ ...x, segment_id: v }))} allowProject />
        </Field>
        <Field label="Tên (máy, vật tư, tổ đội…)" className="col-span-2">
          <TextInput value={f.item_name} onChange={(e) => setF((x) => ({ ...x, item_name: e.target.value }))} placeholder="Máy đào 1,2m³ / Tổ cốt thép / Trạm trộn…" />
        </Field>
        <Field label="Ngày KH">
          <TextInput type="date" value={f.planned_date} onChange={(e) => setF((x) => ({ ...x, planned_date: e.target.value }))} />
        </Field>
        <Field label="Đơn vị">
          <TextInput value={f.unit} onChange={(e) => setF((x) => ({ ...x, unit: e.target.value }))} placeholder="chiếc, người, tấn…" />
        </Field>
        <Field label="SL kế hoạch">
          <TextInput value={f.planned_qty} onChange={(e) => setF((x) => ({ ...x, planned_qty: e.target.value }))} />
        </Field>
        <Field label="SL thực tế">
          <TextInput value={f.actual_qty} onChange={(e) => setF((x) => ({ ...x, actual_qty: e.target.value }))} />
        </Field>
        <div className="col-span-2 space-y-1">
          <span className="block text-[10px] font-bold text-slate-500">Trạng thái</span>
          <StatusBar value={f.status} scale={SCALE_MOBILIZE} onChange={(v) => setF((x) => ({ ...x, status: v }))} />
        </div>
        <Field label="Ghi chú" className="col-span-2">
          <TextInput value={f.note} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
        </Field>
      </div>
      <ErrorLine msg={err} />
      <div className="flex justify-end">
        <PrimaryButton onClick={save} busy={saving}>
          Lưu
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function DcModal({
  projectId,
  row,
  money,
  segments,
  catalog,
  defaultSegment,
  canEditFin,
  onClose,
  onSaved,
}: {
  projectId: string;
  row: PcDesignChange | null;
  money: DcMoney | null;
  segments: PcSegment[];
  catalog: PcWbsItem[];
  defaultSegment: string | null;
  canEditFin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(() => ({
    name: row?.name || "",
    segment_id: row ? row.segment_id || "" : defaultSegment || "",
    wbs_item_id: row?.wbs_item_id || "",
    impact_days: row?.impact_days != null ? String(row.impact_days) : "",
    submitted_date: row?.submitted_date || "",
    approved_date: row?.approved_date || "",
    due_date: row?.due_date || "",
    note: row?.note || "",
    est: money?.est_value != null ? formatVnd(money.est_value) : "",
    approved: money?.approved_value != null ? formatVnd(money.approved_value) : "",
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) return setErr("Nhập tên phát sinh.");
    const days = f.impact_days.trim() ? parseInt(f.impact_days, 10) : null;
    setSaving(true);
    setErr(null);
    const payload = {
      name: f.name.trim(),
      segment_id: f.segment_id || null,
      wbs_item_id: f.wbs_item_id || null,
      impact_days: days !== null && Number.isFinite(days) ? days : null,
      submitted_date: f.submitted_date || null,
      approved_date: f.approved_date || null,
      due_date: f.due_date || null,
      note: f.note.trim() || null,
    };
    let id = row?.id || null;
    if (row) {
      const e = await pcUpdate("pc_design_changes", { id: row.id }, payload);
      if (e) {
        setSaving(false);
        return setErr(e);
      }
    } else {
      const { data, error } = await supabase
        .from("pc_design_changes")
        .insert({ ...payload, project_id: projectId })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        return setErr(pcErrorMessage(error));
      }
      id = data.id;
    }
    if (canEditFin && id && (f.est || f.approved || money)) {
      const e = await pcUpsert(
        "pc_design_change_finance",
        { design_change_id: id, est_value: parseVnd(f.est), approved_value: parseVnd(f.approved) },
        "design_change_id"
      );
      if (e) {
        setSaving(false);
        return setErr(`Đã lưu phát sinh nhưng chưa lưu được giá trị: ${e}`);
      }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <Modal title={row ? "Sửa phát sinh thiết kế" : "Thêm phát sinh thiết kế"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên phát sinh" className="col-span-2">
          <TextInput value={f.name} onChange={set("name")} placeholder="Bổ sung cống hộp Km1+250…" />
        </Field>
        <Field label="Lý trình">
          <SegmentSelect segments={segments} value={f.segment_id} onChange={(v) => setF((x) => ({ ...x, segment_id: v }))} allowProject />
        </Field>
        <Field label="Hạng mục">
          <Select value={f.wbs_item_id} onChange={set("wbs_item_id")}>
            <option value="">—</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ngày nộp">
          <TextInput type="date" value={f.submitted_date} onChange={set("submitted_date")} />
        </Field>
        <Field label="Ngày duyệt">
          <TextInput type="date" value={f.approved_date} onChange={set("approved_date")} />
        </Field>
        <Field label="Hạn xử lý">
          <TextInput type="date" value={f.due_date} onChange={set("due_date")} />
        </Field>
        <Field label="Ảnh hưởng tiến độ (ngày)">
          <TextInput value={f.impact_days} onChange={set("impact_days")} inputMode="numeric" />
        </Field>
        {canEditFin && (
          <>
            <Field label="Giá trị dự kiến">
              <MoneyInput value={f.est} onChange={(v) => setF((x) => ({ ...x, est: v }))} />
            </Field>
            <Field label="Giá trị được duyệt">
              <MoneyInput value={f.approved} onChange={(v) => setF((x) => ({ ...x, approved: v }))} />
            </Field>
          </>
        )}
        <Field label="Ghi chú" className="col-span-2">
          <TextInput value={f.note} onChange={set("note")} />
        </Field>
      </div>
      <p className="text-[10px] text-slate-400">Trạng thái Hồ sơ / TVGS / CĐT bấm đổi trực tiếp trên bảng.</p>
      <ErrorLine msg={err} />
      <div className="flex justify-end">
        <PrimaryButton onClick={save} busy={saving}>
          Lưu
        </PrimaryButton>
      </div>
    </Modal>
  );
}

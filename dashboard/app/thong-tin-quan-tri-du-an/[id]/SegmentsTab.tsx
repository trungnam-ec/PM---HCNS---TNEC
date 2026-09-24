"use client";

// Tab Lý trình & Hạng mục (M2 + WBS của M4):
// • Lý trình: nhập Km dạng "Km0+880" hoặc số mét; CSDL chặn chồng lấn
//   (exclude constraint), giao diện cảnh báo thêm các khoảng HỞ giữa lý trình.
// • Hạng mục mỗi lý trình: chọn từ danh mục mẫu T/K/C, % tỷ trọng (tổng phải
//   = 100%), khối lượng HĐ, thời gian KH. Đơn giá / giá trị chỉ hiện với người
//   có quyền tài chính (bảng pc_segment_wbs_finance).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useConfirmBox } from "@/components/ConfirmDialog";
import {
  SEGMENT_TYPES,
  WBS_GROUPS,
  formatKm,
  parseKm,
  formatVnd,
  formatMoneyShort,
  parseVnd,
  formatDate,
  pcErrorMessage,
  pcUpdate,
  pcDelete,
  pcUpsert,
  type PcAccess,
  type PcSegment,
  type PcSegmentWbs,
  type PcWbsItem,
} from "@/lib/projectControl";
import { Card, Field, TextInput, Select, MoneyInput, PrimaryButton, GhostButton, ErrorLine, Modal, inputCls } from "./ui";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, AlertTriangle, Loader2, Check } from "lucide-react";

type SegForm = {
  code: string;
  kmStart: string;
  kmEnd: string;
  segment_type: string;
  structure_name: string;
  locality: string;
  sides: string;
  planned_start: string;
  planned_finish: string;
  note: string;
};

const EMPTY_SEG: SegForm = {
  code: "",
  kmStart: "",
  kmEnd: "",
  segment_type: "ROAD",
  structure_name: "",
  locality: "",
  sides: "2",
  planned_start: "",
  planned_finish: "",
  note: "",
};

type WbsDraft = {
  applicable: boolean;
  weight: string;
  qty: string;
  unit: string;
  planned_start: string;
  planned_finish: string;
  unitPrice: string; // chỉ khi có quyền tài chính
};

export default function SegmentsTab({ projectId, access }: { projectId: string; access: PcAccess }) {
  const canEdit = access.can_edit_structure;
  const { ask, confirmNode } = useConfirmBox();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [segments, setSegments] = useState<PcSegment[]>([]);
  const [catalog, setCatalog] = useState<PcWbsItem[]>([]);
  const [wbs, setWbs] = useState<PcSegmentWbs[]>([]);
  const [prices, setPrices] = useState<Record<string, { unit_price: number | null; budget_value: number | null }>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<PcSegment | "new" | null>(null);

  const load = useCallback(async () => {
    const [sRes, cRes] = await Promise.all([
      supabase.from("pc_segments").select("*").eq("project_id", projectId).order("km_start_m"),
      supabase.from("pc_wbs_items").select("*").eq("active", true).order("sort_order"),
    ]);
    if (sRes.error) setErr(pcErrorMessage(sRes.error));
    const segs = (sRes.data as PcSegment[]) || [];
    setSegments(segs);
    setCatalog((cRes.data as PcWbsItem[]) || []);
    if (segs.length) {
      const { data } = await supabase
        .from("pc_segment_wbs")
        .select("*")
        .in("segment_id", segs.map((s) => s.id));
      const rows = (data as PcSegmentWbs[]) || [];
      setWbs(rows);
      if (access.can_view_finance && rows.length) {
        const { data: fin } = await supabase
          .from("pc_segment_wbs_finance")
          .select("*")
          .in("segment_wbs_id", rows.map((r) => r.id));
        const map: Record<string, { unit_price: number | null; budget_value: number | null }> = {};
        ((fin as { segment_wbs_id: string; unit_price: number | null; budget_value: number | null }[]) || []).forEach(
          (f) => (map[f.segment_wbs_id] = { unit_price: f.unit_price, budget_value: f.budget_value })
        );
        setPrices(map);
      }
    } else {
      setWbs([]);
    }
    setLoading(false);
  }, [projectId, access.can_view_finance]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Khoảng hở giữa các lý trình liền kề (đã sắp theo Km đầu).
  const gaps = useMemo(() => {
    const out: string[] = [];
    for (let i = 1; i < segments.length; i++) {
      const prev = segments[i - 1];
      const cur = segments[i];
      if (Number(cur.km_start_m) > Number(prev.km_end_m)) {
        out.push(`${prev.code} → ${cur.code}: hở ${formatKm(prev.km_end_m)} – ${formatKm(cur.km_start_m)}`);
      }
    }
    return out;
  }, [segments]);

  const totalLength = segments.reduce((a, s) => a + (Number(s.km_end_m) - Number(s.km_start_m)), 0);

  function removeSegment(s: PcSegment) {
    ask({
      title: `Xoá lý trình ${s.code}?`,
      message: "Toàn bộ hạng mục và phạm vi hợp đồng gắn với lý trình này cũng bị xoá.",
      onConfirm: async () => {
        const e = await pcDelete("pc_segments", { id: s.id });
        if (e) setErr(e);
        load();
      },
    });
  }

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-[#005BAC]" size={26} />
      </div>
    );

  return (
    <div className="space-y-4">
      <Card
        title={`Lý trình (${segments.length}) — tổng ${totalLength.toLocaleString("vi-VN")} m`}
        action={
          canEdit ? (
            <PrimaryButton onClick={() => setEditing("new")}>
              <Plus size={13} /> Thêm lý trình
            </PrimaryButton>
          ) : null
        }
      >
        <ErrorLine msg={err} />
        {gaps.length > 0 && (
          <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold px-3 py-2 rounded-lg">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              Có khoảng hở giữa các lý trình: {gaps.join("; ")}. Nếu đúng thực tế (đoạn không thuộc gói thầu) thì bỏ qua.
            </span>
          </div>
        )}
        {segments.length === 0 ? (
          <p className="text-xs italic text-slate-400 text-center py-6">Chưa có lý trình nào.</p>
        ) : (
          <div className="space-y-2">
            {segments.map((s) => {
              const rows = wbs.filter((w) => w.segment_id === s.id);
              const weightSum = rows.filter((r) => r.applicable).reduce((a, r) => a + Number(r.weight_pct || 0), 0);
              const isOpen = !!open[s.id];
              const typeLabel = SEGMENT_TYPES.find((t) => t.value === s.segment_type)?.label || s.segment_type;
              return (
                <div key={s.id} className="border border-slate-100 rounded-xl">
                  <div className="flex items-center gap-3 px-3.5 py-2.5">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                      <span className="text-xs font-extrabold text-slate-800 w-14 shrink-0">{s.code}</span>
                      <span className="text-[11px] font-mono font-semibold text-slate-600 shrink-0">
                        {formatKm(s.km_start_m)} – {formatKm(s.km_end_m)}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {(Number(s.km_end_m) - Number(s.km_start_m)).toLocaleString("vi-VN")} m
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">{typeLabel}</span>
                      {s.structure_name && <span className="text-[11px] text-slate-500 truncate">{s.structure_name}</span>}
                    </button>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        rows.length === 0
                          ? "bg-slate-100 text-slate-400"
                          : Math.abs(weightSum - 100) < 0.01
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                      title="Tổng % tỷ trọng các hạng mục áp dụng"
                    >
                      {rows.length} HM · {weightSum.toLocaleString("vi-VN")}%
                    </span>
                    {canEdit && (
                      <>
                        <GhostButton onClick={() => setEditing(s)}>
                          <Pencil size={12} />
                        </GhostButton>
                        <GhostButton danger onClick={() => removeSegment(s)}>
                          <Trash2 size={12} />
                        </GhostButton>
                      </>
                    )}
                  </div>
                  {isOpen && (
                    <SegmentWbsPanel
                      segment={s}
                      rows={rows}
                      catalog={catalog}
                      prices={prices}
                      access={access}
                      onChanged={load}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {editing && (
        <SegmentModal
          projectId={projectId}
          segment={editing === "new" ? null : editing}
          nextStart={segments.length ? Number(segments[segments.length - 1].km_end_m) : 0}
          nextCode={`LT${String(segments.length + 1).padStart(2, "0")}`}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}

function SegmentModal({
  projectId,
  segment,
  nextStart,
  nextCode,
  onClose,
  onSaved,
}: {
  projectId: string;
  segment: PcSegment | null;
  nextStart: number;
  nextCode: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<SegForm>(() =>
    segment
      ? {
          code: segment.code,
          kmStart: formatKm(segment.km_start_m),
          kmEnd: formatKm(segment.km_end_m),
          segment_type: segment.segment_type,
          structure_name: segment.structure_name || "",
          locality: segment.locality || "",
          sides: String(segment.sides),
          planned_start: segment.planned_start || "",
          planned_finish: segment.planned_finish || "",
          note: segment.note || "",
        }
      : { ...EMPTY_SEG, code: nextCode, kmStart: formatKm(nextStart) }
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof SegForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const start = parseKm(f.kmStart);
  const end = parseKm(f.kmEnd);

  async function save() {
    if (!f.code.trim()) return setErr("Nhập mã lý trình.");
    if (start === null || end === null) return setErr("Km không hợp lệ. Gõ dạng Km0+880 hoặc số mét (880).");
    if (end <= start) return setErr("Km cuối phải lớn hơn Km đầu.");
    setSaving(true);
    setErr(null);
    const row = {
      code: f.code.trim(),
      km_start_m: start,
      km_end_m: end,
      segment_type: f.segment_type,
      structure_name: f.structure_name.trim() || null,
      locality: f.locality.trim() || null,
      sides: Number(f.sides) === 1 ? 1 : 2,
      sort_order: Math.round(start),
      planned_start: f.planned_start || null,
      planned_finish: f.planned_finish || null,
      note: f.note.trim() || null,
    };
    let e: string | null = null;
    if (segment) {
      e = await pcUpdate("pc_segments", { id: segment.id }, row);
    } else {
      const { error } = await supabase.from("pc_segments").insert({ ...row, project_id: projectId });
      if (error) e = pcErrorMessage(error);
    }
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  return (
    <Modal title={segment ? `Sửa lý trình ${segment.code}` : "Thêm lý trình"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mã lý trình">
          <TextInput value={f.code} onChange={set("code")} placeholder="LT01" />
        </Field>
        <Field label="Loại đoạn">
          <Select value={f.segment_type} onChange={set("segment_type")}>
            {SEGMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Km đầu">
          <TextInput value={f.kmStart} onChange={set("kmStart")} placeholder="Km0+000" />
        </Field>
        <Field label="Km cuối">
          <TextInput value={f.kmEnd} onChange={set("kmEnd")} placeholder="Km0+880" />
        </Field>
        <p className="col-span-2 text-[11px] text-slate-500 -mt-1">
          {start !== null && end !== null && end > start
            ? `Chiều dài: ${(end - start).toLocaleString("vi-VN")} m (${formatKm(start)} – ${formatKm(end)})`
            : "Gõ Km0+880 hoặc số mét (880)."}
        </p>
        <Field label="Tên công trình (cầu, tường chắn…)">
          <TextInput value={f.structure_name} onChange={set("structure_name")} placeholder="Cầu Cái Hảo" />
        </Field>
        <Field label="Địa phận">
          <TextInput value={f.locality} onChange={set("locality")} />
        </Field>
        <Field label="Số bên tuyến (tính % GPMB)">
          <Select value={f.sides} onChange={set("sides")}>
            <option value="2">2 bên (trái + phải)</option>
            <option value="1">1 bên</option>
          </Select>
        </Field>
        <div />
        <Field label="Bắt đầu theo KH">
          <TextInput type="date" value={f.planned_start} onChange={set("planned_start")} />
        </Field>
        <Field label="Kết thúc theo KH">
          <TextInput type="date" value={f.planned_finish} onChange={set("planned_finish")} />
        </Field>
        <Field label="Ghi chú" className="col-span-2">
          <TextInput value={f.note} onChange={set("note")} />
        </Field>
      </div>
      <ErrorLine msg={err} />
      <div className="flex justify-end">
        <PrimaryButton onClick={save} busy={saving}>
          {segment ? "Lưu lý trình" : "Thêm lý trình"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function SegmentWbsPanel({
  segment,
  rows,
  catalog,
  prices,
  access,
  onChanged,
}: {
  segment: PcSegment;
  rows: PcSegmentWbs[];
  catalog: PcWbsItem[];
  prices: Record<string, { unit_price: number | null; budget_value: number | null }>;
  access: PcAccess;
  onChanged: () => void;
}) {
  const canEdit = access.can_edit_structure;
  const canFin = access.can_view_finance;
  const canEditFin = access.can_edit_finance;
  const itemById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (itemById.get(a.wbs_item_id)?.sort_order ?? 0) - (itemById.get(b.wbs_item_id)?.sort_order ?? 0)),
    [rows, itemById]
  );
  const [drafts, setDrafts] = useState<Record<string, WbsDraft>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState("");

  const draftOf = (r: PcSegmentWbs): WbsDraft =>
    drafts[r.id] ?? {
      applicable: r.applicable,
      weight: r.weight_pct != null ? String(Number(r.weight_pct)) : "",
      qty: r.budget_qty != null ? String(Number(r.budget_qty)) : "",
      unit: r.unit || itemById.get(r.wbs_item_id)?.unit || "",
      planned_start: r.planned_start || "",
      planned_finish: r.planned_finish || "",
      unitPrice: prices[r.id]?.unit_price != null ? formatVnd(prices[r.id].unit_price) : "",
    };
  const patch = (r: PcSegmentWbs, p: Partial<WbsDraft>) => setDrafts((d) => ({ ...d, [r.id]: { ...draftOf(r), ...p } }));

  const weightSum = sorted.reduce((a, r) => {
    const d = draftOf(r);
    return d.applicable ? a + (parseFloat(d.weight.replace(",", ".")) || 0) : a;
  }, 0);

  const unused = catalog.filter((c) => !rows.some((r) => r.wbs_item_id === c.id));

  async function addItems(ids: string[]) {
    if (!ids.length) return;
    setErr(null);
    const { error } = await supabase.from("pc_segment_wbs").insert(
      ids.map((id) => ({ segment_id: segment.id, wbs_item_id: id, unit: itemById.get(id)?.unit || null }))
    );
    if (error) return setErr(pcErrorMessage(error));
    setAdding("");
    onChanged();
  }

  async function removeRow(r: PcSegmentWbs) {
    const e = await pcDelete("pc_segment_wbs", { id: r.id });
    if (e) return setErr(e);
    onChanged();
  }

  async function saveAll() {
    const changed = sorted.filter((r) => drafts[r.id]);
    if (!changed.length) return;
    setSaving(true);
    setErr(null);
    for (const r of changed) {
      const d = drafts[r.id];
      const weight = parseFloat(d.weight.replace(",", ".")) || 0;
      if (weight < 0 || weight > 100) {
        setSaving(false);
        return setErr(`${itemById.get(r.wbs_item_id)?.code}: % tỷ trọng phải từ 0 đến 100.`);
      }
      const qty = d.qty.trim() ? parseFloat(d.qty.replace(",", ".")) : null;
      // TC-KT chỉ có quyền tiền: không ghi phần khung (RLS sẽ chặn, báo lỗi vô ích).
      if (canEdit) {
        const e = await pcUpdate("pc_segment_wbs", { id: r.id }, {
          applicable: d.applicable,
          weight_pct: weight,
          budget_qty: qty != null && Number.isFinite(qty) ? qty : null,
          unit: d.unit.trim() || null,
          planned_start: d.planned_start || null,
          planned_finish: d.planned_finish || null,
        });
        if (e) {
          setSaving(false);
          return setErr(e);
        }
      }
      if (canEditFin) {
        const price = parseVnd(d.unitPrice);
        const oldPrice = prices[r.id]?.unit_price ?? null;
        if (price !== oldPrice || qty !== (r.budget_qty != null ? Number(r.budget_qty) : null)) {
          const fe = await pcUpsert(
            "pc_segment_wbs_finance",
            {
              segment_wbs_id: r.id,
              unit_price: price,
              budget_value: price != null && qty != null ? Math.round(price * qty) : null,
            },
            "segment_wbs_id"
          );
          if (fe) {
            setSaving(false);
            return setErr(fe);
          }
        }
      }
    }
    setSaving(false);
    setDrafts({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onChanged();
  }

  const totalValue = canFin
    ? sorted.reduce((a, r) => {
        const d = draftOf(r);
        const q = parseFloat(d.qty.replace(",", ".")) || 0;
        const p = parseVnd(d.unitPrice) || 0;
        return d.applicable ? a + q * p : a;
      }, 0)
    : 0;

  return (
    <div className="border-t border-slate-100 bg-slate-50/40 px-3.5 py-3 space-y-3">
      {sorted.length === 0 ? (
        <p className="text-[11px] italic text-slate-400">Chưa gán hạng mục cho lý trình này.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left">
                <th className="py-1.5 pr-2">Hạng mục</th>
                <th className="py-1.5 px-1 w-12 text-center">Áp dụng</th>
                <th className="py-1.5 px-1 w-20">% tỷ trọng</th>
                <th className="py-1.5 px-1 w-24">KL HĐ</th>
                <th className="py-1.5 px-1 w-16">ĐVT</th>
                <th className="py-1.5 px-1 w-32">Bắt đầu KH</th>
                <th className="py-1.5 px-1 w-32">Kết thúc KH</th>
                {canFin && <th className="py-1.5 px-1 w-32">Đơn giá</th>}
                {canFin && <th className="py-1.5 px-1 w-28 text-right">Giá trị</th>}
                {canEdit && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const item = itemById.get(r.wbs_item_id);
                const d = draftOf(r);
                const q = parseFloat(d.qty.replace(",", ".")) || 0;
                const p = parseVnd(d.unitPrice);
                const cell = `${inputCls} !py-1 !px-2 !text-[11px]`;
                return (
                  <tr key={r.id} className={`border-t border-slate-100 ${d.applicable ? "" : "opacity-50"}`}>
                    <td className="py-1.5 pr-2">
                      <span className="font-bold text-slate-700">{item?.code}</span>{" "}
                      <span className="text-slate-500">{item?.name}</span>
                    </td>
                    <td className="px-1 text-center">
                      <input
                        type="checkbox"
                        checked={d.applicable}
                        disabled={!canEdit}
                        onChange={(e) => patch(r, { applicable: e.target.checked })}
                      />
                    </td>
                    <td className="px-1">
                      <input className={cell} value={d.weight} disabled={!canEdit} onChange={(e) => patch(r, { weight: e.target.value })} />
                    </td>
                    <td className="px-1">
                      <input className={cell} value={d.qty} disabled={!canEdit} onChange={(e) => patch(r, { qty: e.target.value })} />
                    </td>
                    <td className="px-1">
                      <input className={cell} value={d.unit} disabled={!canEdit} onChange={(e) => patch(r, { unit: e.target.value })} />
                    </td>
                    <td className="px-1">
                      <input type="date" className={cell} value={d.planned_start} disabled={!canEdit} onChange={(e) => patch(r, { planned_start: e.target.value })} />
                    </td>
                    <td className="px-1">
                      <input type="date" className={cell} value={d.planned_finish} disabled={!canEdit} onChange={(e) => patch(r, { planned_finish: e.target.value })} />
                    </td>
                    {canFin && (
                      <td className="px-1">
                        <MoneyInput value={d.unitPrice} disabled={!canEditFin} onChange={(v) => patch(r, { unitPrice: v })} />
                      </td>
                    )}
                    {canFin && (
                      <td className="px-1 text-right font-mono font-semibold text-slate-600">
                        {p != null && q ? formatMoneyShort(p * q) : "—"}
                      </td>
                    )}
                    {canEdit && (
                      <td className="text-right">
                        <button onClick={() => removeRow(r)} className="text-slate-300 hover:text-rose-500" title="Bỏ hạng mục">
                          <Trash2 size={12} />
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

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-[11px] font-bold ${
            sorted.length === 0 ? "text-slate-400" : Math.abs(weightSum - 100) < 0.01 ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          Tổng tỷ trọng: {weightSum.toLocaleString("vi-VN")}% {sorted.length > 0 && Math.abs(weightSum - 100) >= 0.01 && "(phải = 100%)"}
        </span>
        {canFin && totalValue > 0 && (
          <span className="text-[11px] font-bold text-slate-500">· Giá trị lý trình: {formatMoneyShort(totalValue)}</span>
        )}
        {segment.planned_start && (
          <span className="text-[11px] text-slate-400">
            · KH lý trình {formatDate(segment.planned_start)} – {formatDate(segment.planned_finish)}
          </span>
        )}
        <div className="flex-1" />
        {canEdit && unused.length > 0 && (
          <>
            <select value={adding} onChange={(e) => setAdding(e.target.value)} className={`${inputCls} !w-auto !py-1.5`}>
              <option value="">+ Thêm hạng mục…</option>
              {(["T", "K", "C"] as const).map((g) => (
                <optgroup key={g} label={WBS_GROUPS[g]}>
                  {unused
                    .filter((c) => c.group_code === g)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} {c.name}
                      </option>
                    ))}
                  {unused.some((c) => c.group_code === g) && <option value={`group:${g}`}>➕ Thêm cả nhóm {WBS_GROUPS[g]}</option>}
                </optgroup>
              ))}
            </select>
            <GhostButton
              onClick={() => {
                if (!adding) return;
                if (adding.startsWith("group:")) {
                  const g = adding.slice(6);
                  addItems(unused.filter((c) => c.group_code === g).map((c) => c.id));
                } else addItems([adding]);
              }}
            >
              <Plus size={12} /> Thêm
            </GhostButton>
          </>
        )}
        {(canEdit || canEditFin) && sorted.length > 0 && (
          <PrimaryButton onClick={saveAll} busy={saving} disabled={Object.keys(drafts).length === 0}>
            {saved ? <><Check size={13} /> Đã lưu</> : "Lưu hạng mục"}
          </PrimaryButton>
        )}
      </div>
      <ErrorLine msg={err} />
    </div>
  );
}

"use client";

// Tab B. Pháp lý phục vụ thi công (M5, P2):
// • Checklist theo nhóm: nhân sự & văn phòng BĐH, P.TN, VTĐV, BPTC, hợp đồng, khác.
// • Mỗi mục 3 trạng thái: Đầu vào NCC (0/1) · Nội bộ (0/½/1) · TVGS/CĐT (0/½/1),
//   bấm đổi ngay trên dòng. Mục nhân sự có thêm ô "hiện diện công trường":
//   chưa có người phụ trách thì ẩn ô; gán tên thì tự tích sẵn (vẫn bỏ tích được).
// • % sẵn sàng 1 mục = (nội bộ + TVGS/CĐT) / 2; % nhóm = trung bình các mục.
// • Dự án chưa có checklist -> nút "Tạo checklist mẫu" (đặc tả 7.5).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useConfirmBox } from "@/components/ConfirmDialog";
import {
  LEGAL_GROUPS,
  LEGAL_TEMPLATE,
  SCALE_INTERNAL,
  SCALE_SUPERVISOR,
  SCALE_VENDOR,
  formatDate,
  formatKm,
  heatCls,
  legalScore,
  pct,
  pcDelete,
  pcErrorMessage,
  pcUpdate,
  readiness,
  type PcAccess,
  type PcLegalItem,
  type PcSegment,
} from "@/lib/projectControl";
import { Card, Field, TextInput, Select, PrimaryButton, ErrorLine, Modal, StatusBar } from "./ui";
import EmployeePicker, { findEmployeeByName, type PickedEmployee } from "./EmployeePicker";
import { Plus, Pencil, Trash2, Loader2, ListChecks } from "lucide-react";

export default function BlockBTab({ projectId, bdhName, access }: { projectId: string; bdhName: string; access: PcAccess }) {
  const canEdit = access.can_edit_site;
  const { ask, confirmNode } = useConfirmBox();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<PcLegalItem[]>([]);
  const [segments, setSegments] = useState<PcSegment[]>([]);
  const [edit, setEdit] = useState<PcLegalItem | { group: string } | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([
      supabase.from("pc_legal_items").select("*").eq("project_id", projectId).order("sort_order"),
      supabase.from("pc_segments").select("*").eq("project_id", projectId).order("km_start_m"),
    ]);
    setErr(l.error ? pcErrorMessage(l.error) : null);
    setItems((l.data as PcLegalItem[]) || []);
    setSegments((s.data as PcSegment[]) || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function seedTemplate() {
    setSeeding(true);
    const { error } = await supabase.from("pc_legal_items").insert(
      LEGAL_TEMPLATE.map((t, i) => ({
        project_id: projectId,
        item_group: t.group,
        item_name: t.name,
        on_site: t.staff ? false : null,
        sort_order: (i + 1) * 10,
      }))
    );
    setSeeding(false);
    if (error) return setErr(pcErrorMessage(error));
    load();
  }

  async function quickSet(id: string, patch: Partial<PcLegalItem>) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const e = await pcUpdate("pc_legal_items", { id }, patch as Record<string, unknown>);
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

  const overall = readiness(items.map(legalScore));
  const staff = items.filter((i) => i.on_site !== null);
  const here = staff.filter((i) => i.on_site && hasPerson(i)).length;
  const segCode = (id: string | null) => (id ? segments.find((s) => s.id === id)?.code || "?" : "");

  return (
    <div className="space-y-4">
      <ErrorLine msg={err} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sẵn sàng pháp lý" value={pct(overall)} cls={heatCls(overall)} />
        <Stat label="Nhân sự hiện diện" value={staff.length ? `${here}/${staff.length}` : "—"} cls={heatCls(staff.length ? here / staff.length : null)} />
        <Stat
          label="Đã có HS từ NCC"
          value={items.length ? `${items.filter((i) => Number(i.vendor_input_status) === 1).length}/${items.length}` : "—"}
          cls=""
        />
        <Stat label="TVGS/CĐT đã duyệt" value={items.length ? `${items.filter((i) => Number(i.supervisor_status) === 1).length}/${items.length}` : "—"} cls="" />
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center space-y-3">
          <ListChecks size={28} className="mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-600">Dự án chưa có checklist pháp lý</p>
          {canEdit && (
            <div className="flex justify-center">
              <PrimaryButton onClick={seedTemplate} busy={seeding}>
                Tạo checklist mẫu ({LEGAL_TEMPLATE.length} mục)
              </PrimaryButton>
            </div>
          )}
        </div>
      ) : (
        LEGAL_GROUPS.map((g) => {
          const rows = items.filter((i) => i.item_group === g.value);
          if (!rows.length && !canEdit) return null;
          const v = readiness(rows.map(legalScore));
          return (
            <Card
              key={g.value}
              title={`${g.label}${rows.length ? ` — ${pct(v)}` : ""}`}
              action={
                canEdit ? (
                  <button onClick={() => setEdit({ group: g.value })} className="text-[11px] font-bold text-[#005BAC] hover:text-blue-700 flex items-center gap-1">
                    <Plus size={12} /> Thêm mục
                  </button>
                ) : null
              }
            >
              {rows.length === 0 ? (
                <p className="text-[11px] italic text-slate-400">Chưa có mục.</p>
              ) : (
                <div className="overflow-x-auto">
                  {/* Bề rộng cột CỐ ĐỊNH (table-fixed + colgroup) để mọi nhóm thẳng hàng
                      từ trên xuống; cột Hiện diện luôn có, nhóm không phải nhân sự để trống. */}
                  <table className="w-full min-w-[1280px] table-fixed text-[11px]">
                    {/* Chia theo % để giãn đều theo bề ngang màn hình (mọi nhóm cùng tỷ lệ
                        nên vẫn thẳng hàng trên dưới); dưới 1280px thì cuộn ngang. */}
                    <colgroup>
                      <col style={{ width: "19%" }} />
                      <col style={{ width: "13%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "19%" }} />
                      <col style={{ width: "19%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: canEdit ? "6%" : "9%" }} />
                      {canEdit && <col style={{ width: "3%" }} />}
                    </colgroup>
                    <thead>
                      <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left">
                        <th className="py-1.5 pr-2">Chức danh</th>
                        <th className="px-2">Người phụ trách</th>
                        <th className="px-4">Đầu vào NCC</th>
                        <th className="px-4">Nội bộ</th>
                        <th className="px-4">TVGS / CĐT</th>
                        <th className="px-2 text-center">Hiện diện</th>
                        <th className="px-2">Hạn</th>
                        {canEdit && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="py-1.5 pr-2">
                            <span className="font-semibold text-slate-700">{r.item_name}</span>
                            {r.segment_id && <span className="ml-1.5 text-[10px] font-bold text-slate-400">{segCode(r.segment_id)}</span>}
                            {r.note && <span className="block text-[10px] text-slate-400 truncate">{r.note}</span>}
                          </td>
                          <td className="px-2 text-slate-600 truncate" title={r.person_name || ""}>{r.person_name}</td>
                          <td className="px-4">
                            <StatusBar
                              compact
                              widthCls="w-full"
                              value={Number(r.vendor_input_status)}
                              scale={SCALE_VENDOR}
                              disabled={!canEdit}
                              onChange={(v) => quickSet(r.id, { vendor_input_status: v as 0 | 1 })}
                            />
                          </td>
                          <td className="px-4">
                            <StatusBar
                              compact
                              widthCls="w-full"
                              value={Number(r.internal_status)}
                              scale={SCALE_INTERNAL}
                              disabled={!canEdit}
                              onChange={(v) => quickSet(r.id, { internal_status: v as 0 | 0.5 | 1 })}
                            />
                          </td>
                          <td className="px-4">
                            <StatusBar
                              compact
                              widthCls="w-full"
                              value={Number(r.supervisor_status)}
                              scale={SCALE_SUPERVISOR}
                              disabled={!canEdit}
                              onChange={(v) => quickSet(r.id, { supervisor_status: v as 0 | 0.5 | 1 })}
                            />
                          </td>
                          <td className="px-2 text-center">
                            {r.on_site !== null && hasPerson(r) && (
                              <input
                                type="checkbox"
                                checked={!!r.on_site}
                                disabled={!canEdit}
                                onChange={(e) => quickSet(r.id, { on_site: e.target.checked })}
                              />
                            )}
                          </td>
                          <td className="px-2 text-slate-500">{formatDate(r.due_date)}</td>
                          {canEdit && (
                            <td className="text-right whitespace-nowrap">
                              <button onClick={() => setEdit(r)} className="text-slate-300 hover:text-[#005BAC] mr-1.5">
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={() =>
                                  ask({
                                    title: `Xoá mục "${r.item_name}"?`,
                                    onConfirm: async () => {
                                      const e = await pcDelete("pc_legal_items", { id: r.id });
                                      if (e) setErr(e);
                                      load();
                                    },
                                  })
                                }
                                className="text-slate-300 hover:text-rose-500"
                              >
                                <Trash2 size={11} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })
      )}

      {edit && (
        <LegalModal
          projectId={projectId}
          row={"id" in edit ? edit : null}
          bdhName={bdhName}
          group={"id" in edit ? edit.item_group : edit.group}
          segments={segments}
          nextOrder={(items.reduce((a, i) => Math.max(a, i.sort_order), 0) || 0) + 10}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}

// Mục có người phụ trách (tên khác rỗng) mới được tính / hiện ô hiện diện.
function hasPerson(i: PcLegalItem): boolean {
  return !!i.person_name?.trim();
}

function Stat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`inline-block text-base font-extrabold font-mono mt-1 px-1.5 rounded ${cls || "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function LegalModal({
  projectId,
  bdhName,
  row,
  group,
  segments,
  nextOrder,
  onClose,
  onSaved,
}: {
  projectId: string;
  bdhName: string;
  row: PcLegalItem | null;
  group: string;
  segments: PcSegment[];
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(() => ({
    item_group: row?.item_group || group,
    item_name: row?.item_name || "",
    segment_id: row?.segment_id || "",
    due_date: row?.due_date || "",
    note: row?.note || "",
    is_staff: row ? row.on_site !== null : group === "SITE_OFFICE_STAFF",
  }));
  // Mục pháp lý chỉ lưu TÊN; mở form thì tra lại danh bạ để hiện đủ phòng ban.
  const [person, setPerson] = useState<PickedEmployee | null>(
    row?.person_name ? { name: row.person_name, email: "", department: "", role: "" } : null
  );
  useEffect(() => {
    if (!row?.person_name) return;
    let alive = true;
    findEmployeeByName(row.person_name).then((e) => alive && e && setPerson(e));
    return () => {
      alive = false;
    };
  }, [row?.person_name]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: "item_group" | "item_name" | "segment_id" | "due_date" | "note") => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    if (!f.item_name.trim()) return setErr("Nhập chức danh.");
    setSaving(true);
    setErr(null);
    const name = person?.name.trim() || null;
    const payload = {
      item_group: f.item_group,
      item_name: f.item_name.trim(),
      person_name: name,
      segment_id: f.segment_id || null,
      due_date: f.due_date || null,
      note: f.note.trim() || null,
      // Hiện diện: chưa có tên -> chưa tích; vừa gán tên -> tự tích; đã có tên từ
      // trước -> giữ nguyên lựa chọn cũ. Tắt theo dõi -> null.
      on_site: !f.is_staff ? null : !name ? false : row?.person_name?.trim() ? (row.on_site ?? true) : true,
    };
    let e: string | null = null;
    if (row) e = await pcUpdate("pc_legal_items", { id: row.id }, payload);
    else {
      const { error } = await supabase.from("pc_legal_items").insert({ ...payload, project_id: projectId, sort_order: nextOrder });
      if (error) e = pcErrorMessage(error);
    }
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  return (
    <Modal title={row ? "Sửa mục pháp lý" : "Thêm mục pháp lý"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nhóm">
          <Select value={f.item_group} onChange={set("item_group")}>
            {LEGAL_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Áp dụng cho">
          <Select value={f.segment_id} onChange={set("segment_id")}>
            <option value="">Cả dự án</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} ({formatKm(s.km_start_m)} – {formatKm(s.km_end_m)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chức danh" className="col-span-2">
          <TextInput value={f.item_name} onChange={set("item_name")} placeholder="Chỉ huy trưởng / Phòng thí nghiệm / BPTC cầu…" />
        </Field>
        <div className="space-y-1">
          <span className="block text-[10px] font-bold text-slate-500">Người phụ trách / tên nhân sự</span>
          <EmployeePicker value={person} onChange={setPerson} bdhName={bdhName} freeText="name" placeholder="Tìm tên nhân sự…" />
        </div>
        <Field label="Hạn hoàn thành">
          <TextInput type="date" value={f.due_date} onChange={set("due_date")} />
        </Field>
        <Field label="Ghi chú" className="col-span-2">
          <TextInput value={f.note} onChange={set("note")} />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
          <input type="checkbox" checked={f.is_staff} onChange={(e) => setF((x) => ({ ...x, is_staff: e.target.checked }))} />
          Là nhân sự — theo dõi hiện diện tại công trường
        </label>
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

"use client";

// Tab Vòng đời (P6 — đặc tả mục 4):
// • Thanh tiến trình 7 giai đoạn + nhánh Tạm dừng.
// • Chuyển giai đoạn qua RPC pc_change_status: xem gate (pc_check_gates) trước khi
//   chuyển; gate chưa đạt thì chỉ Ban lãnh đạo "chuyển bắt buộc" kèm lý do.
// • Lịch sử chuyển giai đoạn.
// • Hồ sơ hoàn công (checklist) · Quyết toán A-B / B-B' (tiền) · Bảo hành + sự cố.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useConfirmBox } from "@/components/ConfirmDialog";
import {
  ACCEPTANCE_STATUS,
  CLOSEOUT_TEMPLATE,
  LIFECYCLE_STEPS,
  SCALE_INTERNAL,
  SCALE_SUPERVISOR,
  SEVERITY,
  TRANSITIONS,
  WARRANTY_ISSUE_STATUS,
  formatDate,
  formatMoneyShort,
  formatVnd,
  parseVnd,
  pcDelete,
  pcErrorMessage,
  pcUpdate,
  pcUpsert,
  statusMeta,
  todayVN,
  warrantyEnd,
  type GateCheck,
  type PcAccess,
  type PcCloseoutItem,
  type PcContract,
  type PcLifecycleEvent,
  type PcProject,
  type PcProjectFinance,
  type PcProjectStatus,
  type PcSegment,
  type PcSettlement,
  type PcWarranty,
  type PcWarrantyIssue,
} from "@/lib/projectControl";
import { Card, Field, TextInput, Select, MoneyInput, PrimaryButton, ErrorLine, Modal, StatusBar } from "./ui";
import { Check, X, Loader2, Plus, Pencil, Trash2, ArrowRight, PauseCircle, Undo2, ShieldAlert, ListChecks } from "lucide-react";

export default function LifecycleTab({
  project,
  finance,
  access,
  onChanged,
}: {
  project: PcProject;
  finance: PcProjectFinance | null;
  access: PcAccess;
  onChanged: () => void;
}) {
  const [events, setEvents] = useState<PcLifecycleEvent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState<PcProjectStatus | null>(null);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from("pc_lifecycle_events").select("*").eq("project_id", project.id).order("changed_at", { ascending: false });
    if (error) setErr(pcErrorMessage(error));
    setEvents((data as PcLifecycleEvent[]) || []);
  }, [project.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEvents();
  }, [loadEvents, project.status]);

  const cur = project.status;
  const curIdx = LIFECYCLE_STEPS.indexOf(cur === "SUSPENDED" ? "EXECUTING" : cur);
  const options = TRANSITIONS.filter((t) => t.from === cur);

  return (
    <div className="space-y-4">
      <ErrorLine msg={err} />

      {/* ─── Thanh tiến trình ─── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-5 overflow-x-auto">
        <div className="flex items-center min-w-[860px]">
          {LIFECYCLE_STEPS.map((s, i) => {
            const done = i < curIdx;
            const active = i === curIdx;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 w-24">
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold border-2 ${
                      active
                        ? cur === "SUSPENDED"
                          ? "bg-amber-400 border-amber-400 text-white"
                          : "bg-[#005BAC] border-[#005BAC] text-white"
                        : done
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-slate-200 text-slate-400"
                    }`}
                  >
                    {done ? <Check size={14} /> : i + 1}
                  </span>
                  <span className={`text-[10px] font-bold text-center ${active ? "text-[#005BAC]" : done ? "text-emerald-600" : "text-slate-400"}`}>
                    {statusMeta(s).label}
                    {active && cur === "SUSPENDED" && <span className="block text-amber-600">(Tạm dừng)</span>}
                  </span>
                </div>
                {i < LIFECYCLE_STEPS.length - 1 && <div className={`flex-1 h-0.5 mb-5 ${i < curIdx ? "bg-emerald-400" : "bg-slate-200"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Chuyển giai đoạn ─── */}
      <Card title={`Giai đoạn hiện tại: ${statusMeta(cur).label}`}>
        {options.length === 0 ? (
          <p className="text-xs text-slate-500">Dự án đã đóng — không còn bước chuyển.</p>
        ) : !access.can_manage_members ? (
          <p className="text-xs text-slate-500">Chỉ Giám đốc dự án hoặc Ban lãnh đạo được chuyển giai đoạn.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.to}
                onClick={() => setTarget(o.to)}
                className={`flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-lg border ${
                  o.kind === "FORWARD"
                    ? "bg-[#005BAC] text-white border-transparent hover:bg-blue-700"
                    : o.kind === "SUSPEND"
                    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {o.kind === "FORWARD" ? <ArrowRight size={13} /> : o.kind === "SUSPEND" ? <PauseCircle size={13} /> : <Undo2 size={13} />}
                {o.kind === "SUSPEND"
                  ? o.to === "SUSPENDED"
                    ? "Tạm dừng thi công"
                    : "Tiếp tục thi công"
                  : `${o.kind === "FORWARD" ? "Chuyển sang" : "Lùi về"} ${statusMeta(o.to).label}`}
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <CloseoutCard projectId={project.id} canEdit={access.can_edit_site} />
        <HistoryCard events={events} />
      </div>

      {access.can_view_finance && <SettlementCard projectId={project.id} canEdit={access.can_edit_finance} />}
      <WarrantyCard project={project} finance={finance} access={access} onSavedFinance={onChanged} />

      {target && (
        <TransitionModal
          project={project}
          target={target}
          kind={TRANSITIONS.find((t) => t.from === cur && t.to === target)!.kind}
          isLeadership={access.is_leadership}
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null);
            onChanged();
            loadEvents();
          }}
        />
      )}
    </div>
  );
}

// ─── Hộp chuyển giai đoạn: hiện gate, lý do, chuyển / chuyển bắt buộc ───
function TransitionModal({
  project,
  target,
  kind,
  isLeadership,
  onClose,
  onDone,
}: {
  project: PcProject;
  target: PcProjectStatus;
  kind: "FORWARD" | "SUSPEND" | "BACK";
  isLeadership: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [gates, setGates] = useState<GateCheck[] | null>(kind === "FORWARD" ? null : []);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "FORWARD") return;
    (async () => {
      const { data, error } = await supabase.rpc("pc_check_gates", { p_project: project.id, p_target: target });
      if (error) setErr(pcErrorMessage(error));
      setGates((data as GateCheck[]) || []);
    })();
  }, [kind, project.id, target]);

  const failed = (gates || []).filter((g) => !g.ok).length;
  const needReason = kind !== "FORWARD" || failed > 0;

  async function go(force: boolean) {
    if (needReason && !reason.trim()) return setErr("Ghi lý do trước khi chuyển.");
    setSaving(true);
    setErr(null);
    const { error } = await supabase.rpc("pc_change_status", { p_project: project.id, p_target: target, p_reason: reason.trim() || null, p_force: force });
    setSaving(false);
    if (error) return setErr(pcErrorMessage(error));
    onDone();
  }

  return (
    <Modal title={`${statusMeta(project.status).label} → ${statusMeta(target).label}`} onClose={onClose} wide>
      {kind === "FORWARD" && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Điều kiện chuyển giai đoạn (gate)</p>
          {!gates ? (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-[#005BAC]" size={22} />
            </div>
          ) : (
            gates.map((g) => (
              <div key={g.key} className="flex items-start gap-2.5 py-1.5 border-b border-slate-100 last:border-0">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${g.ok ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                  {g.ok ? <Check size={11} /> : <X size={11} />}
                </span>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-slate-700">{g.label}</p>
                  <p className={`text-[11px] ${g.ok ? "text-slate-400" : "text-rose-600"}`}>{g.detail}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {kind === "BACK" && <p className="text-xs text-slate-600">Lùi giai đoạn không kiểm tra gate nhưng bắt buộc ghi lý do; lần chuyển được lưu vào lịch sử.</p>}
      {kind === "SUSPEND" && (
        <p className="text-xs text-slate-600">{target === "SUSPENDED" ? "Tạm dừng thi công (sự cố, vướng GPMB kéo dài…)." : "Tiếp tục thi công."} Bắt buộc ghi lý do.</p>
      )}

      {(needReason || kind === "FORWARD") && (
        <Field label={needReason ? "Lý do (bắt buộc)" : "Ghi chú (tuỳ chọn)"}>
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      <ErrorLine msg={err} />
      <div className="flex justify-end gap-2">
        {kind === "FORWARD" && failed > 0 && isLeadership && (
          <button
            onClick={() => go(true)}
            disabled={saving}
            className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-lg px-3.5 py-2"
          >
            <ShieldAlert size={13} /> Chuyển bắt buộc (Ban lãnh đạo)
          </button>
        )}
        <PrimaryButton onClick={() => go(false)} busy={saving} disabled={gates === null || (kind === "FORWARD" && failed > 0)}>
          Xác nhận chuyển
        </PrimaryButton>
      </div>
      {kind === "FORWARD" && failed > 0 && !isLeadership && (
        <p className="text-[11px] text-slate-500 text-right">Còn {failed} điều kiện chưa đạt — hoàn thiện rồi chuyển, hoặc nhờ Ban lãnh đạo chuyển bắt buộc.</p>
      )}
    </Modal>
  );
}

function HistoryCard({ events }: { events: PcLifecycleEvent[] }) {
  return (
    <Card title="Lịch sử chuyển giai đoạn">
      {events.length === 0 ? (
        <p className="text-xs italic text-slate-400">Chưa chuyển giai đoạn lần nào.</p>
      ) : (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} className="text-[11px] border-b border-slate-100 last:border-0 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-700">
                  {e.from_status ? statusMeta(e.from_status).label : "—"} → {statusMeta(e.to_status).label}
                </span>
                {e.forced && <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500 text-white">BẮT BUỘC</span>}
                <span className="text-slate-400 ml-auto">
                  {formatDate(e.changed_at.slice(0, 10))} · {(e.changed_by || "").split("@")[0]}
                </span>
              </div>
              {e.reason && <p className="text-slate-500 mt-0.5">Lý do: {e.reason}</p>}
              {e.forced && e.gate_result && (
                <p className="text-rose-500 mt-0.5">
                  Gate chưa đạt: {e.gate_result.filter((g) => !g.ok).map((g) => g.label).join("; ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Hồ sơ hoàn công ───
function CloseoutCard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { ask, confirmNode } = useConfirmBox();
  const [items, setItems] = useState<PcCloseoutItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("pc_closeout_items").select("*").eq("project_id", projectId).order("sort_order");
    if (error) setErr(pcErrorMessage(error));
    setItems((data as PcCloseoutItem[]) || []);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function seed() {
    const { error } = await supabase
      .from("pc_closeout_items")
      .insert(CLOSEOUT_TEMPLATE.map((n, i) => ({ project_id: projectId, item_name: n, sort_order: (i + 1) * 10 })));
    if (error) return setErr(pcErrorMessage(error));
    load();
  }

  async function add() {
    if (!name.trim()) return;
    const max = (items || []).reduce((m, i) => Math.max(m, i.sort_order), 0);
    const { error } = await supabase.from("pc_closeout_items").insert({ project_id: projectId, item_name: name.trim(), sort_order: max + 10 });
    if (error) return setErr(pcErrorMessage(error));
    setName("");
    setAdding(false);
    load();
  }

  async function quick(id: string, patch: Partial<PcCloseoutItem>) {
    setItems((xs) => (xs || []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const e = await pcUpdate("pc_closeout_items", { id }, patch as Record<string, unknown>);
    if (e) {
      setErr(e);
      load();
    }
  }

  const done = (items || []).filter((i) => Number(i.internal_status) === 1 && Number(i.supervisor_status) === 1).length;

  return (
    <Card
      title={`Hồ sơ hoàn công${items && items.length ? ` — ${done}/${items.length} đạt` : ""}`}
      action={
        canEdit && items && items.length > 0 ? (
          <button onClick={() => setAdding((a) => !a)} className="text-[11px] font-bold text-[#005BAC] flex items-center gap-1">
            <Plus size={12} /> Thêm mục
          </button>
        ) : null
      }
    >
      <ErrorLine msg={err} />
      {!items ? (
        <Loader2 className="animate-spin text-[#005BAC] mx-auto" size={20} />
      ) : items.length === 0 ? (
        <div className="text-center py-4 space-y-2">
          <ListChecks size={22} className="mx-auto text-slate-300" />
          <p className="text-xs text-slate-500">Chưa có checklist hoàn công (cần cho gate &quot;Hoàn thành&quot;).</p>
          {canEdit && (
            <div className="flex justify-center">
              <PrimaryButton onClick={seed}>Tạo checklist mẫu ({CLOSEOUT_TEMPLATE.length} mục)</PrimaryButton>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {adding && (
            <div className="flex gap-2">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hồ sơ" />
              <PrimaryButton onClick={add}>Thêm</PrimaryButton>
            </div>
          )}
          <div className="grid grid-cols-[1fr_260px_260px_20px] gap-x-6 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            <span>Hồ sơ</span>
            <span>Nội bộ</span>
            <span>TVGS / CĐT</span>
            <span />
          </div>
          {items.map((i) => (
            <div key={i.id} className="grid grid-cols-[1fr_260px_260px_20px] gap-x-6 items-center text-[11px]">
              <span className="font-semibold text-slate-700 truncate" title={i.item_name}>
                {i.item_name}
              </span>
              <StatusBar compact widthCls="w-full" value={Number(i.internal_status)} scale={SCALE_INTERNAL} disabled={!canEdit} onChange={(v) => quick(i.id, { internal_status: v as 0 | 0.5 | 1 })} />
              <StatusBar compact widthCls="w-full" value={Number(i.supervisor_status)} scale={SCALE_SUPERVISOR} disabled={!canEdit} onChange={(v) => quick(i.id, { supervisor_status: v as 0 | 0.5 | 1 })} />
              {canEdit ? (
                <button
                  onClick={() =>
                    ask({
                      title: `Xoá "${i.item_name}"?`,
                      onConfirm: async () => {
                        const e = await pcDelete("pc_closeout_items", { id: i.id });
                        if (e) setErr(e);
                        load();
                      },
                    })
                  }
                  className="text-slate-300 hover:text-rose-500"
                >
                  <Trash2 size={11} />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
      {confirmNode}
    </Card>
  );
}

// ─── Quyết toán A-B / B-B' (tiền) ───
function SettlementCard({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { ask, confirmNode } = useConfirmBox();
  const [contracts, setContracts] = useState<PcContract[]>([]);
  const [rows, setRows] = useState<PcSettlement[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ contract: PcContract; row: PcSettlement | null } | null>(null);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from("pc_contracts").select("*").eq("project_id", projectId).order("contract_type").order("created_at"),
      supabase.from("pc_settlements").select("*").eq("project_id", projectId),
    ]);
    if (s.error) setErr(pcErrorMessage(s.error));
    setContracts((c.data as PcContract[]) || []);
    setRows((s.data as PcSettlement[]) || []);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <Card title="Quyết toán hợp đồng (chỉ BLĐ / GĐDA / TC-KT)">
      <ErrorLine msg={err} />
      {contracts.length === 0 ? (
        <p className="text-xs italic text-slate-400">Chưa có hợp đồng.</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left">
              <th className="py-1.5">HĐ</th>
              <th className="px-2">Đơn vị</th>
              <th className="px-2 text-right">Giá trị quyết toán</th>
              <th className="px-2">Số hồ sơ</th>
              <th className="px-2">Ngày duyệt</th>
              <th className="px-2">Trạng thái</th>
              {canEdit && <th className="w-16" />}
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => {
              const r = rows.find((x) => x.contract_id === c.id) || null;
              const st = r ? ACCEPTANCE_STATUS[r.status] : null;
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-1.5 font-bold text-slate-600">{c.contract_type === "A_B" ? "A-B" : "B-B'"}</td>
                  <td className="px-2 font-semibold text-slate-700">{c.partner_name}</td>
                  <td className="px-2 text-right font-mono">{r?.settlement_value != null ? formatMoneyShort(r.settlement_value) : "—"}</td>
                  <td className="px-2 text-slate-500">{r?.doc_no}</td>
                  <td className="px-2 text-slate-500">{formatDate(r?.approved_date)}</td>
                  <td className="px-2">{st ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span> : <span className="text-slate-300">Chưa lập</span>}</td>
                  {canEdit && (
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => setEdit({ contract: c, row: r })} className="text-slate-300 hover:text-[#005BAC] mr-1.5">
                        {r ? <Pencil size={11} /> : <Plus size={12} />}
                      </button>
                      {r && (
                        <button
                          onClick={() =>
                            ask({
                              title: "Xoá hồ sơ quyết toán này?",
                              onConfirm: async () => {
                                const e = await pcDelete("pc_settlements", { id: r.id });
                                if (e) setErr(e);
                                load();
                              },
                            })
                          }
                          className="text-slate-300 hover:text-rose-500"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {edit && (
        <SettlementModal
          projectId={projectId}
          contract={edit.contract}
          row={edit.row}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
      {confirmNode}
    </Card>
  );
}

function SettlementModal({
  projectId,
  contract,
  row,
  onClose,
  onSaved,
}: {
  projectId: string;
  contract: PcContract;
  row: PcSettlement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(() => ({
    value: row?.settlement_value != null ? formatVnd(row.settlement_value) : "",
    doc_no: row?.doc_no || "",
    submitted_date: row?.submitted_date || "",
    approved_date: row?.approved_date || "",
    status: row?.status || "DRAFT",
    note: row?.note || "",
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    if (f.status === "APPROVED" && !f.approved_date) return setErr("Đã duyệt thì phải có ngày duyệt.");
    setSaving(true);
    const payload = {
      settlement_value: parseVnd(f.value),
      doc_no: f.doc_no.trim() || null,
      submitted_date: f.submitted_date || null,
      approved_date: f.approved_date || null,
      status: f.status,
      note: f.note.trim() || null,
    };
    let e: string | null = null;
    if (row) e = await pcUpdate("pc_settlements", { id: row.id }, payload);
    else {
      const { error } = await supabase.from("pc_settlements").insert({ ...payload, project_id: projectId, contract_id: contract.id });
      if (error) e = pcErrorMessage(error);
    }
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  return (
    <Modal title={`Quyết toán ${contract.contract_type === "A_B" ? "A-B" : "B-B'"} — ${contract.partner_name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Giá trị quyết toán" className="col-span-2">
          <MoneyInput value={f.value} onChange={(v) => setF((x) => ({ ...x, value: v }))} />
        </Field>
        <Field label="Số hồ sơ / quyết định">
          <TextInput value={f.doc_no} onChange={set("doc_no")} />
        </Field>
        <Field label="Trạng thái">
          <Select value={f.status} onChange={set("status")}>
            {Object.entries(ACCEPTANCE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ngày trình">
          <TextInput type="date" value={f.submitted_date} onChange={set("submitted_date")} />
        </Field>
        <Field label="Ngày duyệt">
          <TextInput type="date" value={f.approved_date} onChange={set("approved_date")} />
        </Field>
        <Field label="Ghi chú" className="col-span-2">
          <TextInput value={f.note} onChange={set("note")} />
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

// ─── Bảo hành + sự cố ───
function WarrantyCard({
  project,
  finance,
  access,
  onSavedFinance,
}: {
  project: PcProject;
  finance: PcProjectFinance | null;
  access: PcAccess;
  onSavedFinance: () => void;
}) {
  const { ask, confirmNode } = useConfirmBox();
  const canEditInfo = access.can_manage_members || access.can_edit_finance;
  const canEditIssues = access.can_edit_site;
  const [w, setW] = useState<PcWarranty | null>(null);
  const [issues, setIssues] = useState<PcWarrantyIssue[]>([]);
  const [segments, setSegments] = useState<PcSegment[]>([]);
  const [contracts, setContracts] = useState<PcContract[]>([]);
  const [f, setF] = useState({ start: "", months: "", gno: "", gbank: "", gexp: "", released: false, note: "", gvalue: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [issueEdit, setIssueEdit] = useState<PcWarrantyIssue | "new" | null>(null);
  const guaranteeValue = finance?.warranty_guarantee_value ?? null;

  const load = useCallback(async () => {
    const [wr, is, sg, co] = await Promise.all([
      supabase.from("pc_warranty").select("*").eq("project_id", project.id).maybeSingle(),
      supabase.from("pc_warranty_issues").select("*").eq("project_id", project.id).order("reported_date", { ascending: false }),
      supabase.from("pc_segments").select("*").eq("project_id", project.id).order("km_start_m"),
      supabase.from("pc_contracts").select("*").eq("project_id", project.id).eq("contract_type", "B_B1"),
    ]);
    if (wr.error) setErr(pcErrorMessage(wr.error));
    const row = (wr.data as PcWarranty) || null;
    setW(row);
    setF({
      start: row?.warranty_start || "",
      months: row?.warranty_months != null ? String(row.warranty_months) : "",
      gno: row?.guarantee_no || "",
      gbank: row?.guarantee_bank || "",
      gexp: row?.guarantee_expiry || "",
      released: !!row?.guarantee_released,
      note: row?.note || "",
      gvalue: guaranteeValue != null ? formatVnd(guaranteeValue) : "",
    });
    setIssues((is.data as PcWarrantyIssue[]) || []);
    setSegments((sg.data as PcSegment[]) || []);
    setContracts((co.data as PcContract[]) || []);
  }, [project.id, guaranteeValue]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const end = warrantyEnd({ warranty_start: f.start || null, warranty_months: f.months ? parseInt(f.months, 10) : null });

  async function save() {
    const months = f.months.trim() ? parseInt(f.months, 10) : null;
    if (months !== null && (!Number.isFinite(months) || months <= 0)) return setErr("Số tháng bảo hành không hợp lệ.");
    setSaving(true);
    setErr(null);
    const e = await pcUpsert(
      "pc_warranty",
      {
        project_id: project.id,
        warranty_start: f.start || null,
        warranty_months: months,
        guarantee_no: f.gno.trim() || null,
        guarantee_bank: f.gbank.trim() || null,
        guarantee_expiry: f.gexp || null,
        guarantee_released: f.released,
        note: f.note.trim() || null,
      },
      "project_id"
    );
    if (e) {
      setSaving(false);
      return setErr(e);
    }
    if (access.can_edit_finance) {
      const v = parseVnd(f.gvalue);
      if (v !== (finance?.warranty_guarantee_value ?? null)) {
        const fe = await pcUpsert(
          "pc_project_finance",
          { project_id: project.id, warranty_guarantee_value: v, vat_rate: finance?.vat_rate ?? 0.08, payment_threshold: finance?.payment_threshold ?? 4000000000 },
          "project_id"
        );
        if (fe) {
          setSaving(false);
          return setErr(`Đã lưu bảo hành nhưng chưa lưu được giá trị bảo lãnh: ${fe}`);
        }
        onSavedFinance();
      }
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  const segCode = (id: string | null) => (id ? segments.find((s) => s.id === id)?.code || "?" : "—");

  async function setIssueStatus(i: PcWarrantyIssue, status: string) {
    const e = await pcUpdate("pc_warranty_issues", { id: i.id }, { status, fixed_date: status === "DONE" ? i.fixed_date || todayVN() : null });
    if (e) setErr(e);
    load();
  }

  return (
    <Card
      title={`Bảo hành${end ? ` — hết hạn ${formatDate(end)}` : ""}`}
      action={canEditInfo ? <PrimaryButton onClick={save} busy={saving}>{saved ? <><Check size={13} /> Đã lưu</> : "Lưu bảo hành"}</PrimaryButton> : null}
    >
      <ErrorLine msg={err} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Ngày bắt đầu bảo hành">
          <TextInput type="date" value={f.start} disabled={!canEditInfo} onChange={(e) => setF((x) => ({ ...x, start: e.target.value }))} />
        </Field>
        <Field label="Thời hạn (tháng)">
          <TextInput value={f.months} disabled={!canEditInfo} inputMode="numeric" onChange={(e) => setF((x) => ({ ...x, months: e.target.value }))} />
        </Field>
        <Field label="Hết hạn (tự tính)">
          <div className="text-xs font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{end ? formatDate(end) : "—"}</div>
        </Field>
        <Field label="Số bảo lãnh bảo hành">
          <TextInput value={f.gno} disabled={!canEditInfo} onChange={(e) => setF((x) => ({ ...x, gno: e.target.value }))} />
        </Field>
        <Field label="Ngân hàng bảo lãnh">
          <TextInput value={f.gbank} disabled={!canEditInfo} onChange={(e) => setF((x) => ({ ...x, gbank: e.target.value }))} />
        </Field>
        <Field label="Bảo lãnh hết hiệu lực">
          <TextInput type="date" value={f.gexp} disabled={!canEditInfo} onChange={(e) => setF((x) => ({ ...x, gexp: e.target.value }))} />
        </Field>
        {access.can_view_finance && (
          <Field label="Giá trị bảo lãnh">
            <MoneyInput value={f.gvalue} disabled={!access.can_edit_finance} onChange={(v) => setF((x) => ({ ...x, gvalue: v }))} />
          </Field>
        )}
        <label className="flex items-end gap-2 text-[11px] font-semibold text-slate-600 pb-2">
          <input type="checkbox" checked={f.released} disabled={!canEditInfo} onChange={(e) => setF((x) => ({ ...x, released: e.target.checked }))} /> Bảo lãnh đã giải toả
        </label>
        <Field label="Ghi chú" className="col-span-2 md:col-span-4">
          <TextInput value={f.note} disabled={!canEditInfo} onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
        </Field>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex-1">
            Sự cố bảo hành ({issues.filter((i) => i.status !== "DONE").length} chưa xong)
          </p>
          {canEditIssues && (
            <button onClick={() => setIssueEdit("new")} className="text-[11px] font-bold text-[#005BAC] flex items-center gap-1">
              <Plus size={12} /> Báo sự cố
            </button>
          )}
        </div>
        {issues.length === 0 ? (
          <p className="text-[11px] italic text-slate-400">Chưa có sự cố bảo hành.</p>
        ) : (
          issues.map((i) => {
            const st = WARRANTY_ISSUE_STATUS[i.status];
            return (
              <div key={i.id} className="flex items-start gap-2.5 py-1.5 border-b border-slate-100 last:border-0 text-[11px]">
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${SEVERITY[i.severity].cls}`}>{SEVERITY[i.severity].label}</span>
                <span className="font-bold text-slate-500 w-12 shrink-0">{segCode(i.segment_id)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-700">{i.description}</p>
                  <p className="text-[10px] text-slate-400">
                    Báo {formatDate(i.reported_date)}
                    {i.due_date ? ` · hạn ${formatDate(i.due_date)}` : ""}
                    {i.fixed_date ? ` · xong ${formatDate(i.fixed_date)}` : ""}
                    {i.contract_id ? ` · ${contracts.find((c) => c.id === i.contract_id)?.partner_name || ""}` : ""}
                  </p>
                </div>
                {canEditIssues ? (
                  <select
                    value={i.status}
                    onChange={(e) => setIssueStatus(i, e.target.value)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-full border-0 ${st.cls}`}
                  >
                    {Object.entries(WARRANTY_ISSUE_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                )}
                {canEditIssues && (
                  <>
                    <button onClick={() => setIssueEdit(i)} className="text-slate-300 hover:text-[#005BAC]">
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() =>
                        ask({
                          title: "Xoá sự cố này?",
                          onConfirm: async () => {
                            const e = await pcDelete("pc_warranty_issues", { id: i.id });
                            if (e) setErr(e);
                            load();
                          },
                        })
                      }
                      className="text-slate-300 hover:text-rose-500"
                    >
                      <Trash2 size={11} />
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {w === null && !canEditInfo && <p className="text-[10px] text-slate-400 mt-2">Chưa nhập thông tin bảo hành.</p>}

      {issueEdit && (
        <IssueModal
          projectId={project.id}
          row={issueEdit === "new" ? null : issueEdit}
          segments={segments}
          contracts={contracts}
          onClose={() => setIssueEdit(null)}
          onSaved={() => {
            setIssueEdit(null);
            load();
          }}
        />
      )}
      {confirmNode}
    </Card>
  );
}

function IssueModal({
  projectId,
  row,
  segments,
  contracts,
  onClose,
  onSaved,
}: {
  projectId: string;
  row: PcWarrantyIssue | null;
  segments: PcSegment[];
  contracts: PcContract[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState(() => ({
    reported_date: row?.reported_date || todayVN(),
    description: row?.description || "",
    severity: row?.severity || "MEDIUM",
    segment_id: row?.segment_id || "",
    contract_id: row?.contract_id || "",
    due_date: row?.due_date || "",
    note: row?.note || "",
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    if (!f.description.trim()) return setErr("Mô tả sự cố.");
    setSaving(true);
    const payload = {
      reported_date: f.reported_date,
      description: f.description.trim(),
      severity: f.severity,
      segment_id: f.segment_id || null,
      contract_id: f.contract_id || null,
      due_date: f.due_date || null,
      note: f.note.trim() || null,
    };
    let e: string | null = null;
    if (row) e = await pcUpdate("pc_warranty_issues", { id: row.id }, payload);
    else {
      const { error } = await supabase.from("pc_warranty_issues").insert({ ...payload, project_id: projectId });
      if (error) e = pcErrorMessage(error);
    }
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  return (
    <Modal title={row ? "Sửa sự cố bảo hành" : "Báo sự cố bảo hành"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mô tả sự cố" className="col-span-2">
          <TextInput value={f.description} onChange={set("description")} placeholder="Lún nứt mặt đường Km2+150 phải tuyến…" />
        </Field>
        <Field label="Ngày báo">
          <TextInput type="date" value={f.reported_date} onChange={set("reported_date")} />
        </Field>
        <Field label="Mức độ">
          <Select value={f.severity} onChange={set("severity")}>
            <option value="HIGH">Nghiêm trọng</option>
            <option value="MEDIUM">Trung bình</option>
            <option value="LOW">Nhẹ</option>
          </Select>
        </Field>
        <Field label="Lý trình">
          <Select value={f.segment_id} onChange={set("segment_id")}>
            <option value="">—</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nhà thầu chịu trách nhiệm">
          <Select value={f.contract_id} onChange={set("contract_id")}>
            <option value="">—</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.partner_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hạn khắc phục">
          <TextInput type="date" value={f.due_date} onChange={set("due_date")} />
        </Field>
        <Field label="Ghi chú">
          <TextInput value={f.note} onChange={set("note")} />
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

"use client";

// Tab Tổng quan: thông tin chung dự án (M1) + giá trị HĐ A-B cấp dự án (chỉ người
// có quyền tài chính thấy) + vài con số tổng hợp từ lý trình / hợp đồng.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  statusMeta,
  PROJECT_STATUS,
  pcErrorMessage,
  type GateCheck,
  type PcProjectStatus,
  formatMoneyShort,
  formatVnd,
  parseVnd,
  pctToRate,
  rateToPct,
  pcUpdate,
  pcUpsert,
  type PcAccess,
  type PcProject,
  type PcProjectFinance,
} from "@/lib/projectControl";
import { Card, Field, TextInput, Select, MoneyInput, PrimaryButton, ErrorLine, LockedMoney, Modal, inputCls } from "./ui";
import { Check, X, Loader2 } from "lucide-react";

type InfoForm = {
  name: string;
  code: string;
  package_name: string;
  owner_name: string;
  supervisor_name: string;
  location: string;
  start_date: string;
  finish_date: string;
  status: string;
  note: string;
};

export default function OverviewTab({
  project,
  finance,
  access,
  onSaved,
}: {
  project: PcProject;
  finance: PcProjectFinance | null;
  access: PcAccess;
  onSaved: () => void;
}) {
  const canEdit = access.can_edit_structure;
  const [f, setF] = useState<InfoForm>(() => ({
    name: project.name || "",
    code: project.code || "",
    package_name: project.package_name || "",
    owner_name: project.owner_name || "",
    supervisor_name: project.supervisor_name || "",
    location: project.location || "",
    start_date: project.start_date || "",
    finish_date: project.finish_date || "",
    status: project.status,
    note: project.note || "",
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [fin, setFin] = useState(() => ({
    value: finance?.contract_value_pre_vat != null ? formatVnd(finance.contract_value_pre_vat) : "",
    vat: rateToPct(finance?.vat_rate ?? 0.08),
    contingency: finance?.contingency_value != null ? formatVnd(finance.contingency_value) : "",
    threshold: formatVnd(finance?.payment_threshold ?? 4000000000),
  }));
  const [finSaving, setFinSaving] = useState(false);
  const [finSaved, setFinSaved] = useState(false);
  const [finErr, setFinErr] = useState<string | null>(null);

  const [statusTarget, setStatusTarget] = useState<PcProjectStatus | null>(null);
  const [stats, setStats] = useState<{ segments: number; length: number; contractsAB: number; contractsBB: number } | null>(null);

  useEffect(() => {
    (async () => {
      const [sRes, cRes] = await Promise.all([
        supabase.from("pc_segments").select("km_start_m, km_end_m").eq("project_id", project.id),
        supabase.from("pc_contracts").select("contract_type").eq("project_id", project.id),
      ]);
      const segs = (sRes.data as { km_start_m: number; km_end_m: number }[]) || [];
      const cons = (cRes.data as { contract_type: string }[]) || [];
      setStats({
        segments: segs.length,
        length: segs.reduce((a, s) => a + (Number(s.km_end_m) - Number(s.km_start_m)), 0),
        contractsAB: cons.filter((c) => c.contract_type === "A_B").length,
        contractsBB: cons.filter((c) => c.contract_type === "B_B1").length,
      });
    })();
  }, [project.id]);

  async function saveInfo() {
    if (!f.name.trim()) return setErr("Tên dự án không được để trống.");
    if (f.start_date && f.finish_date && f.finish_date < f.start_date)
      return setErr("Ngày hoàn thành phải sau ngày khởi công.");
    setSaving(true);
    setErr(null);
    const e = await pcUpdate("pc_projects", { id: project.id }, {
      name: f.name.trim(),
      code: f.code.trim() || null,
      package_name: f.package_name.trim() || null,
      owner_name: f.owner_name.trim() || null,
      supervisor_name: f.supervisor_name.trim() || null,
      location: f.location.trim() || null,
      start_date: f.start_date || null,
      finish_date: f.finish_date || null,
      note: f.note.trim() || null,
    });
    setSaving(false);
    if (e) return setErr(e);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  }

  async function saveFinance() {
    const vat = pctToRate(fin.vat);
    if (vat === null || vat < 0 || vat > 1) return setFinErr("Thuế VAT không hợp lệ.");
    setFinSaving(true);
    setFinErr(null);
    const e = await pcUpsert(
      "pc_project_finance",
      {
        project_id: project.id,
        contract_value_pre_vat: parseVnd(fin.value),
        vat_rate: vat,
        contingency_value: parseVnd(fin.contingency),
        payment_threshold: parseVnd(fin.threshold) ?? 4000000000,
      },
      "project_id"
    );
    setFinSaving(false);
    if (e) return setFinErr(e);
    setFinSaved(true);
    setTimeout(() => setFinSaved(false), 2000);
    onSaved();
  }

  const preVat = parseVnd(fin.value);
  const vatRate = pctToRate(fin.vat) ?? 0;
  const postVat = preVat != null ? Math.round(preVat * (1 + vatRate)) : null;

  const set = (k: keyof InfoForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Số lý trình" value={stats ? String(stats.segments) : "…"} />
        <Stat label="Tổng chiều dài" value={stats ? `${stats.length.toLocaleString("vi-VN")} m` : "…"} />
        <Stat label="HĐ A-B / B-B'" value={stats ? `${stats.contractsAB} / ${stats.contractsBB}` : "…"} />
        <Stat
          label="GT HĐ A-B sau VAT"
          value={access.can_view_finance ? formatMoneyShort(finance?.contract_value_pre_vat != null ? Math.round(finance.contract_value_pre_vat * (1 + Number(finance.vat_rate))) : null) : "🔒"}
        />
      </div>

      <Card
        title="Thông tin dự án"
        action={
          canEdit ? (
            <PrimaryButton onClick={saveInfo} busy={saving}>
              {saved ? <><Check size={13} /> Đã lưu</> : "Lưu thông tin"}
            </PrimaryButton>
          ) : (
            <span className="text-[10px] font-bold text-slate-400">Chỉ xem</span>
          )
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Tên dự án đầy đủ" className="md:col-span-2">
            <TextInput value={f.name} onChange={set("name")} disabled={!canEdit} />
          </Field>
          <Field label="Mã dự án">
            <TextInput value={f.code} onChange={set("code")} disabled={!canEdit} placeholder="DT769-XL15" />
          </Field>
          <Field label="Trạng thái vòng đời">
            {/* Ban lãnh đạo / Admin: dropdown đổi thẳng (migration 104, vẫn kiểm gate + lý do).
                Người khác: chỉ xem, đổi từng bước ở tab Vòng đời. */}
            {access.is_leadership ? (
              <Select value={project.status} onChange={(e) => setStatusTarget(e.target.value as PcProjectStatus)}>
                {PROJECT_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            ) : (
              <div className={`${inputCls} flex items-center justify-between`}>
                <span>{statusMeta(project.status).label}</span>
                <span className="text-[10px] font-normal text-slate-400">đổi ở tab Vòng đời</span>
              </div>
            )}
          </Field>
          <Field label="Gói thầu" className="md:col-span-2">
            <TextInput value={f.package_name} onChange={set("package_name")} disabled={!canEdit} />
          </Field>
          <Field label="Chủ đầu tư">
            <TextInput value={f.owner_name} onChange={set("owner_name")} disabled={!canEdit} />
          </Field>
          <Field label="Tư vấn giám sát">
            <TextInput value={f.supervisor_name} onChange={set("supervisor_name")} disabled={!canEdit} />
          </Field>
          <Field label="Địa điểm" className="md:col-span-2">
            <TextInput value={f.location} onChange={set("location")} disabled={!canEdit} />
          </Field>
          <Field label="Ngày khởi công">
            <TextInput type="date" value={f.start_date} onChange={set("start_date")} disabled={!canEdit} />
          </Field>
          <Field label="Ngày hoàn thành theo HĐ">
            <TextInput type="date" value={f.finish_date} onChange={set("finish_date")} disabled={!canEdit} />
          </Field>
          <Field label="Ghi chú" className="md:col-span-2">
            <TextInput value={f.note} onChange={set("note")} disabled={!canEdit} />
          </Field>
        </div>
        <div className="mt-3">
          <ErrorLine msg={err} />
        </div>
      </Card>

      <Card
        title="Giá trị hợp đồng A-B (cấp dự án)"
        action={
          access.can_edit_finance ? (
            <PrimaryButton onClick={saveFinance} busy={finSaving}>
              {finSaved ? <><Check size={13} /> Đã lưu</> : "Lưu giá trị"}
            </PrimaryButton>
          ) : null
        }
      >
        {!access.can_view_finance ? (
          <LockedMoney />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="GT HĐ trước thuế">
                <MoneyInput value={fin.value} onChange={(v) => setFin((x) => ({ ...x, value: v }))} disabled={!access.can_edit_finance} />
              </Field>
              <Field label="Thuế VAT (%)">
                <TextInput value={fin.vat} onChange={(e) => setFin((x) => ({ ...x, vat: e.target.value }))} disabled={!access.can_edit_finance} />
              </Field>
              <Field label="GT HĐ sau VAT (tự tính)">
                <div className="text-xs font-mono font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-right">
                  {postVat != null ? `${formatVnd(postVat)} đ` : "—"}
                </div>
              </Field>
              <Field label="Chi phí dự phòng">
                <MoneyInput value={fin.contingency} onChange={(v) => setFin((x) => ({ ...x, contingency: v }))} disabled={!access.can_edit_finance} />
              </Field>
              <Field label="Ngưỡng cảnh báo SL chưa thanh toán B-B'">
                <MoneyInput value={fin.threshold} onChange={(v) => setFin((x) => ({ ...x, threshold: v }))} disabled={!access.can_edit_finance} />
              </Field>
            </div>
            <div className="mt-3">
              <ErrorLine msg={finErr} />
            </div>
          </>
        )}
      </Card>

      {stats && stats.segments > 0 && (
        <p className="text-[11px] text-slate-400">
          Tổng chiều dài tính tự động từ tab Lý trình & Hạng mục. Giá trị HĐ theo từng nhà thầu nhập ở tab Nhà thầu & Hợp đồng.
        </p>
      )}
      {statusTarget && statusTarget !== project.status && (
        <StatusChangeModal
          project={project}
          target={statusTarget}
          onClose={() => setStatusTarget(null)}
          onDone={() => {
            setStatusTarget(null);
            onSaved();
          }}
        />
      )}
    </div>
  );
}

// Ban lãnh đạo / Admin đổi thẳng trạng thái: xem gate của giai đoạn đích, ghi lý do,
// lưu lịch sử (bắt buộc nếu nhảy cóc / lùi / gate chưa đạt).
function StatusChangeModal({
  project,
  target,
  onClose,
  onDone,
}: {
  project: PcProject;
  target: PcProjectStatus;
  onClose: () => void;
  onDone: () => void;
}) {
  const [gates, setGates] = useState<GateCheck[] | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("pc_check_gates", { p_project: project.id, p_target: target });
      if (error) setErr(pcErrorMessage(error));
      setGates((data as GateCheck[]) || []);
    })();
  }, [project.id, target]);

  const failed = (gates || []).filter((g) => !g.ok).length;

  async function go() {
    if (!reason.trim()) return setErr("Ghi lý do đổi trạng thái.");
    setSaving(true);
    setErr(null);
    const { error } = await supabase.rpc("pc_set_status_admin", { p_project: project.id, p_target: target, p_reason: reason.trim() });
    setSaving(false);
    if (error) return setErr(pcErrorMessage(error));
    onDone();
  }

  return (
    <Modal title={`Đổi trạng thái: ${statusMeta(project.status).label} → ${statusMeta(target).label}`} onClose={onClose}>
      {!gates ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-[#005BAC]" size={22} />
        </div>
      ) : gates.length === 0 ? (
        <p className="text-xs text-slate-500">Giai đoạn này không có điều kiện (gate) cần kiểm.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Điều kiện của giai đoạn {statusMeta(target).label}</p>
          {gates.map((g) => (
            <div key={g.key} className="flex items-start gap-2.5 py-1 border-b border-slate-100 last:border-0">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${g.ok ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                {g.ok ? <Check size={11} /> : <X size={11} />}
              </span>
              <div>
                <p className="text-xs font-semibold text-slate-700">{g.label}</p>
                <p className={`text-[11px] ${g.ok ? "text-slate-400" : "text-rose-600"}`}>{g.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {failed > 0 && (
        <p className="text-[11px] font-semibold text-rose-600">Còn {failed} điều kiện chưa đạt — lần đổi này sẽ ghi vào lịch sử là &quot;bắt buộc&quot;.</p>
      )}
      <Field label="Lý do (bắt buộc)">
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập dự án đang thi công dở vào hệ thống…" autoFocus />
      </Field>
      <ErrorLine msg={err} />
      <div className="flex justify-end">
        <PrimaryButton onClick={go} busy={saving} disabled={gates === null}>
          Xác nhận đổi trạng thái
        </PrimaryButton>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-3">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-base font-extrabold text-slate-800 mt-1 font-mono">{value}</p>
    </div>
  );
}

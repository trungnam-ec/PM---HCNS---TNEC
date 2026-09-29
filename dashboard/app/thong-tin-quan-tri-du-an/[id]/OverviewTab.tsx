"use client";

// Tab Tổng quan: thông tin chung dự án (M1) + giá trị HĐ A-B cấp dự án (chỉ người
// có quyền tài chính thấy) + vài con số tổng hợp từ lý trình / hợp đồng.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  statusMeta,
  PROJECT_STATUS,
  CONTRACT_KINDS,
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

  // Các số chép từ Điều 9 HĐ (đã gồm VAT). Dữ liệu trước migration 109 chỉ có số
  // trước thuế → suy ngược ra số sau VAT.
  const [fin, setFin] = useState(() => {
    const cv = contractValueOf(finance);
    return {
      kind: finance?.contract_kind || "",
      packageTotal: finance?.package_total_value != null ? formatVnd(finance.package_total_value) : "",
      packageConstruction: finance?.package_construction_cost != null ? formatVnd(finance.package_construction_cost) : "",
      value: cv != null ? formatVnd(cv) : "",
      construction: finance?.construction_cost != null ? formatVnd(finance.construction_cost) : "",
      vat: rateToPct(finance?.vat_rate ?? 0.08),
      threshold: formatVnd(finance?.payment_threshold ?? 4000000000),
    };
  });
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
    const value = parseVnd(fin.value);
    const construction = parseVnd(fin.construction);
    if (value != null && construction != null && construction > value)
      return setFinErr("Chi phí xây dựng không được lớn hơn giá trị đảm nhận.");
    const packageTotal = parseVnd(fin.packageTotal);
    if (value != null && packageTotal != null && value > packageTotal)
      return setFinErr("Giá trị đảm nhận không được lớn hơn giá HĐ toàn gói.");
    const packageConstruction = parseVnd(fin.packageConstruction);
    if (packageTotal != null && packageConstruction != null && packageConstruction > packageTotal)
      return setFinErr("Chi phí xây dựng của liên danh không được lớn hơn giá HĐ toàn gói.");
    setFinSaving(true);
    setFinErr(null);
    const e = await pcUpsert(
      "pc_project_finance",
      {
        project_id: project.id,
        contract_kind: fin.kind || null,
        package_total_value: packageTotal,
        package_construction_cost: packageConstruction,
        package_contingency: packageTotal != null && packageConstruction != null ? packageTotal - packageConstruction : null,
        contract_value: value,
        construction_cost: construction,
        vat_rate: vat,
        // 2 cột cũ ghi lại số tính sẵn — Dashboard dự án / tab Tài chính vẫn đọc chúng.
        contract_value_pre_vat: value != null ? Math.round(value / (1 + vat)) : null,
        contingency_value: value != null && construction != null ? value - construction : null,
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

  const value = parseVnd(fin.value);
  const vatRate = pctToRate(fin.vat) ?? 0;
  const preVat = value != null ? Math.round(value / (1 + vatRate)) : null;
  const packageTotal = parseVnd(fin.packageTotal);
  const sharePct = value != null && packageTotal ? (value / packageTotal) * 100 : null;
  const packageConstruction = parseVnd(fin.packageConstruction);
  const packageContingency = packageTotal != null && packageConstruction != null ? packageTotal - packageConstruction : null;
  const packageContingencyPct = packageContingency != null && packageConstruction ? (packageContingency / packageConstruction) * 100 : null;
  const construction = parseVnd(fin.construction);
  const contingency = value != null && construction != null ? value - construction : null;
  const contingencyPct = contingency != null && construction ? (contingency / construction) * 100 : null;

  const set = (k: keyof InfoForm) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Số lý trình" value={stats ? String(stats.segments) : "…"} />
        <Stat label="Tổng chiều dài" value={stats ? `${stats.length.toLocaleString("vi-VN")} m` : "…"} />
        <Stat label="HĐ A-B / B-B'" value={stats ? `${stats.contractsAB} / ${stats.contractsBB}` : "…"} />
        <Stat
          label="GT HĐ A-B sau VAT"
          value={access.can_view_finance ? formatMoneyShort(contractValueOf(finance)) : "🔒"}
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
              <Field label="Loại hợp đồng">
                <Select value={fin.kind} onChange={(e) => setFin((x) => ({ ...x, kind: e.target.value }))} disabled={!access.can_edit_finance}>
                  <option value="">— Chọn loại HĐ —</option>
                  {CONTRACT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tỷ lệ đảm nhận (tự tính)">
                <Computed text={sharePct != null ? `${formatPct(sharePct)} tổng giá trị HĐ` : "—"} />
              </Field>
              <Field label="Giá HĐ toàn gói (liên danh, đã gồm VAT)">
                <MoneyInput value={fin.packageTotal} onChange={(v) => setFin((x) => ({ ...x, packageTotal: v }))} disabled={!access.can_edit_finance} placeholder="Để trống nếu không liên danh" />
              </Field>
              <Field label="Giá trị theo khối lượng đảm nhận (đã gồm VAT)">
                <MoneyInput value={fin.value} onChange={(v) => setFin((x) => ({ ...x, value: v }))} disabled={!access.can_edit_finance} />
              </Field>
              <Field label="Chi phí xây dựng của liên danh">
                <MoneyInput value={fin.packageConstruction} onChange={(v) => setFin((x) => ({ ...x, packageConstruction: v }))} disabled={!access.can_edit_finance} placeholder="Để trống nếu không liên danh" />
              </Field>
              <Field label="Chi phí xây dựng">
                <MoneyInput value={fin.construction} onChange={(v) => setFin((x) => ({ ...x, construction: v }))} disabled={!access.can_edit_finance} />
              </Field>
              <Field label="Chi phí dự phòng của liên danh (tự tính = toàn gói − CPXD liên danh)">
                <Computed
                  text={packageContingency != null ? `${formatVnd(packageContingency)} đ` : "—"}
                  hint={packageContingencyPct != null ? `${formatPct(packageContingencyPct)} CPXD` : undefined}
                />
              </Field>
              <Field label="Chi phí dự phòng (tự tính = đảm nhận − chi phí xây dựng)">
                <Computed
                  text={contingency != null ? `${formatVnd(contingency)} đ` : "—"}
                  hint={contingencyPct != null ? `${formatPct(contingencyPct)} CPXD` : undefined}
                />
              </Field>
              <Field label="Thuế VAT (%)">
                <TextInput value={fin.vat} onChange={(e) => setFin((x) => ({ ...x, vat: e.target.value }))} disabled={!access.can_edit_finance} />
              </Field>
              <Field label="GT đảm nhận trước thuế (tự tính)">
                <Computed text={preVat != null ? `${formatVnd(preVat)} đ` : "—"} />
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

// GT đảm nhận đã gồm VAT; dòng cũ (trước migration 109) suy từ số trước thuế.
function contractValueOf(finance: PcProjectFinance | null): number | null {
  if (!finance) return null;
  if (finance.contract_value != null) return Number(finance.contract_value);
  if (finance.contract_value_pre_vat != null) return Math.round(Number(finance.contract_value_pre_vat) * (1 + Number(finance.vat_rate)));
  return null;
}

function formatPct(v: number) {
  return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}%`;
}

function Computed({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="text-xs font-mono font-bold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
      <span className="text-[10px] font-sans font-semibold text-slate-400">{hint || ""}</span>
      <span className="text-right">{text}</span>
    </div>
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

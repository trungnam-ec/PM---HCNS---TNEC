"use client";

// Tab Thành viên (P0): gán vai trò trong dự án — quyết định ai sửa được gì và ai
// thấy tiền. Ban lãnh đạo hoặc GĐDA của dự án mới gán được (RLS pc_members_write).
// Nhân sự thuộc đúng BĐH đã tự XEM được dự án, chỉ cần gán khi muốn cho quyền sửa.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ROLES, roleLabel, pcErrorMessage, pcDelete, type PcAccess, type PcMember, type PcProject, type PcRole } from "@/lib/projectControl";
import { Card, Field, Select, PrimaryButton, ErrorLine } from "./ui";
import EmployeePicker, { type PickedEmployee } from "./EmployeePicker";
import { Trash2, Loader2, UserPlus } from "lucide-react";

export default function MembersTab({ project, access }: { project: PcProject; access: PcAccess }) {
  const canManage = access.can_manage_members;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [members, setMembers] = useState<PcMember[]>([]);
  const [picked, setPicked] = useState<PickedEmployee | null>(null);
  const [role, setRole] = useState<PcRole>("KY_SU");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("pc_project_members").select("*").eq("project_id", project.id).order("role");
    if (error) setErr(pcErrorMessage(error));
    setMembers((data as PcMember[]) || []);
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function add() {
    const emp = picked;
    const email = (emp?.email || "").toLowerCase();
    if (!email) return setErr("Chọn nhân sự trong danh sách.");
    setSaving(true);
    setErr(null);
    const { error } = await supabase
      .from("pc_project_members")
      .insert({ project_id: project.id, email, name: emp?.name || null, role });
    setSaving(false);
    if (error) return setErr(pcErrorMessage(error));
    setPicked(null);
    load();
  }

  async function remove(m: PcMember) {
    const e = await pcDelete("pc_project_members", { id: m.id });
    if (e) return setErr(e);
    load();
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <Card title="Thêm thành viên">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3 items-end">
            <div className="space-y-1">
              <span className="block text-[10px] font-bold text-slate-500">Nhân sự</span>
              <EmployeePicker value={picked} onChange={setPicked} bdhName={project.bdh_name} freeText="email" />
            </div>
            <Field label="Vai trò">
              <Select value={role} onChange={(e) => setRole(e.target.value as PcRole)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <PrimaryButton onClick={add} busy={saving}>
              <UserPlus size={13} /> Thêm
            </PrimaryButton>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">{ROLES.find((r) => r.value === role)?.desc}</p>
        </Card>
      )}

      <Card title={`Thành viên dự án (${members.length})`}>
        <ErrorLine msg={err} />
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin text-[#005BAC]" size={22} />
          </div>
        ) : members.length === 0 ? (
          <p className="text-xs italic text-slate-400 text-center py-4">Chưa gán ai. Nên gán Giám đốc dự án trước.</p>
        ) : (
          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#005BAC] w-36 text-center shrink-0">
                  {roleLabel(m.role)}
                </span>
                <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0 truncate">
                  {m.name || m.email}
                </span>
                {canManage && (
                  <button onClick={() => remove(m)} className="text-slate-300 hover:text-rose-500" title="Gỡ vai trò">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

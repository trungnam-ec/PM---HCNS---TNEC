"use client";

// Tab Thành viên: danh sách nhân sự dự án (migration 111) + "Quyền hệ thống" trong
// dự án — quyết định ai sửa được gì và ai thấy tiền. Cờ quyền toàn công ty vẫn
// được ưu tiên (Ban lãnh đạo… không cần gán ở đây).
// Chỉ người gán được thành viên mới THẤY tab và đọc được bảng (migration 112):
// Ban lãnh đạo / Admin / GĐDA gán tay / người có cờ "GĐDA/Chỉ huy trưởng" đúng BĐH.
// Nhân sự thuộc đúng BĐH đã tự XEM được dự án, chỉ cần gán khi muốn cho quyền sửa.
//
// Mã/Tên dự án: lấy từ danh mục dự án (Cài đặt > Danh mục công việc) khớp theo
// Mã dự án ở tab Tổng quan — mỗi BĐH trỏ đúng 1 dự án.
// Phòng ban, chức danh, SĐT, email: chụp từ danh bạ nhân sự lúc thêm.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchProjectCatalog } from "@/lib/projectCatalog";
import {
  ROLES,
  MEMBER_STATUSES,
  roleLabel,
  pcErrorMessage,
  pcDelete,
  pcUpdate,
  type PcAccess,
  type PcMember,
  type PcMemberStatus,
  type PcProject,
  type PcRole,
} from "@/lib/projectControl";
import { Card, Field, Select, TextInput, PrimaryButton, ErrorLine, inputCls } from "./ui";
import EmployeePicker, { findEmployeeByEmail, listDirectoryDepartments, type PickedEmployee } from "./EmployeePicker";
import { Trash2, Loader2, UserPlus } from "lucide-react";

type Draft = {
  unit_group: string;
  department: string;
  role: PcRole;
  project_role: string;
  duty: string;
  reports_to: string;
  status: PcMemberStatus;
};

type TextKey = "unit_group" | "project_role" | "duty" | "reports_to";

export default function MembersTab({ project, access }: { project: PcProject; access: PcAccess }) {
  const canManage = access.can_manage_members;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [members, setMembers] = useState<PcMember[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<{ code: string; name: string } | null>(null);
  const [picked, setPicked] = useState<PickedEmployee | null>(null);
  const [draft, setDraft] = useState<Draft>(() => ({
    unit_group: "",
    department: project.bdh_name || "",
    role: "KY_SU",
    project_role: "",
    duty: "",
    reports_to: "",
    status: "JOINED",
  }));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("pc_project_members")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at");
    if (error) setErr(pcErrorMessage(error));
    const rows = (data as PcMember[]) || [];
    // Dòng thêm trước migration 111 chưa chụp phòng ban/chức danh → tra danh bạ để hiện.
    const filled = await Promise.all(
      rows.map(async (m) => {
        if (m.department || m.title || m.phone || m.contact_email) return m;
        const e = await findEmployeeByEmail(m.email);
        return e ? { ...m, department: e.department, title: e.role, phone: e.phone, contact_email: e.workEmail } : m;
      })
    );
    setMembers(filled);
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    listDirectoryDepartments().then(setDepartments);
    fetchProjectCatalog().then((c) => {
      const code = (project.code || "").trim().toLowerCase();
      const hit = code ? c.projects.find((p) => p.code.trim().toLowerCase() === code) : undefined;
      setCatalog(hit ? { code: hit.code, name: hit.name } : null);
    });
  }, [project.code]);

  const projectCode = catalog?.code || project.code || "—";
  const projectName = catalog?.name || project.name;

  async function add() {
    const emp = picked;
    const email = (emp?.email || "").toLowerCase();
    if (!email) return setErr("Chọn nhân sự trong danh sách.");
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("pc_project_members").insert({
      project_id: project.id,
      email,
      name: emp?.name || null,
      role: draft.role,
      unit_group: draft.unit_group.trim() || null,
      department: emp?.department && emp.department !== "Ngoài danh bạ" ? emp.department : draft.department || null,
      title: emp?.role || null,
      phone: emp?.phone || null,
      contact_email: emp?.workEmail || email,
      project_role: draft.project_role.trim() || null,
      duty: draft.duty.trim() || null,
      reports_to: draft.reports_to.trim() || null,
      status: draft.status,
    });
    setSaving(false);
    if (error) return setErr(pcErrorMessage(error));
    setPicked(null);
    setDraft((d) => ({ ...d, project_role: "", duty: "", reports_to: "" }));
    load();
  }

  async function patch(m: PcMember, change: Partial<PcMember>) {
    setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, ...change } : x)));
    const e = await pcUpdate("pc_project_members", { id: m.id }, change);
    if (e) {
      setErr(e);
      load();
    }
  }

  async function remove(m: PcMember) {
    const e = await pcDelete("pc_project_members", { id: m.id });
    if (e) return setErr(e);
    load();
  }

  const setD = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const cell = `${inputCls} !py-1 !px-2 !text-[11px] min-w-[120px]`;

  // Ô gõ tay trong bảng: sửa tại chỗ, lưu khi rời ô.
  const textCell = (m: PcMember, k: TextKey) =>
    canManage ? (
      <input
        key={`${m.id}-${k}-${m[k] ?? ""}`}
        defaultValue={m[k] || ""}
        className={cell}
        onBlur={(e) => {
          const v = e.target.value.trim() || null;
          if (v !== (m[k] || null)) patch(m, { [k]: v });
        }}
      />
    ) : (
      <span className="text-slate-600">{m[k] || "—"}</span>
    );

  return (
    <div className="space-y-4">
      {canManage && (
        <Card title="Thêm thành viên">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <Field label="Nhóm đơn vị">
              <TextInput value={draft.unit_group} onChange={setD("unit_group")} placeholder="VD: Ban điều hành" />
            </Field>
            <Field label="Phòng ban/Bộ phận">
              <Select
                value={draft.department}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, department: e.target.value }));
                  setPicked(null);
                }}
              >
                <option value="">— Tất cả phòng ban —</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="space-y-1 md:col-span-2">
              <span className="block text-[10px] font-bold text-slate-500">Họ và tên</span>
              <EmployeePicker
                value={picked}
                onChange={setPicked}
                bdhName={project.bdh_name}
                department={draft.department || undefined}
                freeText="email"
              />
            </div>
            <Field label="Chức danh (tự điền)">
              <div className={`${inputCls} bg-slate-50 truncate`}>{picked?.role || "—"}</div>
            </Field>
            <Field label="SĐT (tự điền)">
              <div className={`${inputCls} bg-slate-50 truncate`}>{picked?.phone || "—"}</div>
            </Field>
            <Field label="Email (tự điền, ưu tiên mail công ty)" className="md:col-span-2">
              <div className={`${inputCls} bg-slate-50 truncate`}>{picked?.workEmail || picked?.email || "—"}</div>
            </Field>
            <Field label="Vai trò">
              <TextInput value={draft.project_role} onChange={setD("project_role")} />
            </Field>
            <Field label="Nhiệm vụ">
              <TextInput value={draft.duty} onChange={setD("duty")} />
            </Field>
            <Field label="Quản lý/Báo cáo">
              <TextInput value={draft.reports_to} onChange={setD("reports_to")} />
            </Field>
            <Field label="Trạng thái">
              <Select value={draft.status} onChange={setD("status")}>
                {MEMBER_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quyền hệ thống" className="md:col-span-3">
              <Select value={draft.role} onChange={setD("role")}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.desc}
                  </option>
                ))}
              </Select>
            </Field>
            <PrimaryButton onClick={add} busy={saving}>
              <UserPlus size={13} /> Thêm
            </PrimaryButton>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Quyền hệ thống chỉ cấp thêm quyền sửa trong dự án này; người có cờ quyền (Ban lãnh đạo, GĐDA/Chỉ huy trưởng…) luôn được ưu tiên, không cần gán ở đây. &quot;Giám đốc dự án&quot; chỉ cần gán tay khi người đó không thuộc BĐH này. Trạng thái chỉ để hiển thị, không tắt quyền.
          </p>
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
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left whitespace-nowrap">
                  <th className="py-1.5 pr-2 w-8 text-center">STT</th>
                  <th className="py-1.5 px-1">Mã dự án</th>
                  <th className="py-1.5 px-1">Tên dự án</th>
                  <th className="py-1.5 px-1">Nhóm đơn vị</th>
                  <th className="py-1.5 px-1">Phòng ban/Bộ phận</th>
                  <th className="py-1.5 px-1">Họ và tên</th>
                  <th className="py-1.5 px-1">Chức danh</th>
                  <th className="py-1.5 px-1">Vai trò</th>
                  <th className="py-1.5 px-1">Nhiệm vụ</th>
                  <th className="py-1.5 px-1">Quản lý/Báo cáo</th>
                  <th className="py-1.5 px-1">SĐT</th>
                  <th className="py-1.5 px-1">Email</th>
                  <th className="py-1.5 px-1">Trạng thái</th>
                  <th className="py-1.5 px-1">Quyền hệ thống</th>
                  {canManage && <th className="w-8" />}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => {
                  const st = MEMBER_STATUSES.find((s) => s.value === (m.status || "JOINED")) || MEMBER_STATUSES[1];
                  return (
                    <tr key={m.id} className="border-t border-slate-100 align-middle">
                      <td className="py-1.5 pr-2 text-center font-bold text-slate-500">{i + 1}</td>
                      <td className="px-1 font-bold text-slate-700 whitespace-nowrap">{projectCode}</td>
                      <td className="px-1 text-slate-600 min-w-[160px]">{projectName}</td>
                      <td className="px-1">{textCell(m, "unit_group")}</td>
                      <td className="px-1 text-slate-600 whitespace-nowrap">{m.department || "—"}</td>
                      <td className="px-1 font-semibold text-slate-700 whitespace-nowrap">{m.name || m.email}</td>
                      <td className="px-1 text-slate-600 whitespace-nowrap">{m.title || "—"}</td>
                      <td className="px-1">{textCell(m, "project_role")}</td>
                      <td className="px-1">{textCell(m, "duty")}</td>
                      <td className="px-1">{textCell(m, "reports_to")}</td>
                      <td className="px-1 text-slate-600 whitespace-nowrap font-mono">{m.phone || "—"}</td>
                      <td className="px-1 text-slate-600 whitespace-nowrap">{m.contact_email || m.email}</td>
                      <td className="px-1">
                        {canManage ? (
                          <select
                            value={m.status || "JOINED"}
                            onChange={(e) => patch(m, { status: e.target.value as PcMemberStatus })}
                            className={`${inputCls} !py-1 !px-2 !text-[11px] min-w-[150px]`}
                          >
                            {MEMBER_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                        )}
                      </td>
                      <td className="px-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#005BAC] whitespace-nowrap">
                          {roleLabel(m.role)}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-1 text-center">
                          <button onClick={() => remove(m)} className="text-slate-300 hover:text-rose-500" title="Gỡ thành viên">
                            <Trash2 size={13} />
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
    </div>
  );
}

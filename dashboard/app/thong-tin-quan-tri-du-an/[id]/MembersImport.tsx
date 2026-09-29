"use client";

// Nhập danh sách thành viên dự án từ file Excel (tab Thành viên > "Nhập từ Excel").
// Không dùng AI: đọc thẳng các cột. Hàng tên cột được DÒ (file mẫu công ty có dòng
// tiêu đề + "Mục tiêu" phía trên; file "Tải Excel" của hệ thống có 3 dòng phía trên),
// cột nhận theo tên gần đúng ("Người báo cáo/Quản lý trực tiếp" -> Quản lý/Báo cáo).
// Mỗi dòng đối chiếu danh bạ nhân viên (email trước, tên sau): khớp thì lấy phòng
// ban / chức danh / SĐT / email từ hồ sơ; không khớp vẫn thêm bằng dữ liệu trong file.
// Người được nhập luôn là "Quyền xem" — nhập file KHÔNG tự cấp quyền sửa cho ai.

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { splitEmails } from "@/lib/emailMatch";
import { pcErrorMessage, type PcMember, type PcMemberStatus, type PcProject } from "@/lib/projectControl";
import { Modal, PrimaryButton, ErrorLine } from "./ui";
import { loadDirectoryList, type PickedEmployee } from "./EmployeePicker";
import { FileUp, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { findHeader, fold, statusOf, type ImportField } from "./membersImportParse";

type Field = ImportField;

type ImportRow = {
  line: number;
  name: string;
  unit_group: string;
  department: string;
  title: string;
  project_role: string;
  duty: string;
  reports_to: string;
  phone: string;
  loginEmail: string | null; // khớp quyền (email đầu tiên trong hồ sơ)
  contactEmail: string; // hiển thị (ưu tiên mail công ty)
  status: PcMemberStatus;
  kind: "matched" | "unmatched" | "duplicate";
  note: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MembersImport({
  project,
  members,
  onDone,
}: {
  project: PcProject;
  members: PcMember[];
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function readFile(file: File) {
    setErr(null);
    setReading(true);
    setFileName(file.name);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
      const found = findHeader(aoa);
      if (!found) {
        setRows(null);
        setErr("Không tìm thấy hàng tên cột. File cần có cột “Họ và tên” và vài cột như Chức danh, Vai trò, Nhiệm vụ, SĐT, Email.");
        return;
      }
      const { cols, headerLine } = found;
      const dir = await loadDirectoryList();
      const byEmail = new Map<string, PickedEmployee>();
      const byName = new Map<string, PickedEmployee[]>();
      dir.forEach((e) => {
        [e.email, e.workEmail].forEach((m) => m && byEmail.set(m.toLowerCase(), e));
        const k = fold(e.name);
        byName.set(k, [...(byName.get(k) || []), e]);
      });
      const taken = new Set<string>();
      members.forEach((m) => {
        if (m.email) taken.add(`e:${m.email.toLowerCase()}`);
        if (m.name) taken.add(`n:${fold(m.name)}`);
      });

      const get = (r: unknown[], f: Field) => {
        const i = cols[f];
        return i === undefined || r[i] == null ? "" : String(r[i]).replace(/\r/g, "").trim();
      };
      const out: ImportRow[] = [];
      aoa.slice(headerLine + 1).forEach((r, k) => {
        const name = get(r || [], "name");
        if (!name) return; // dòng trống / dòng ghi chú
        const fileEmails = splitEmails(get(r, "email")).filter((x) => EMAIL_RE.test(x));
        // Đối chiếu danh bạ: email trước; không có thì tên (chỉ nhận khi tên là DUY NHẤT).
        let emp: PickedEmployee | undefined = fileEmails.map((x) => byEmail.get(x)).find(Boolean);
        let note = "";
        if (!emp) {
          const same = byName.get(fold(name)) || [];
          const inBdh = same.filter((e) => e.department === project.bdh_name);
          if (same.length === 1) emp = same[0];
          else if (inBdh.length === 1) emp = inBdh[0];
          else if (same.length > 1) note = `Trùng tên ${same.length} người trong danh bạ — dùng thông tin trong file`;
        }
        const loginEmail = emp ? emp.email || null : fileEmails[0] || null;
        // Trùng: có email thì so email; chưa có email thì so tên. Ghi cả 2 khoá để bắt
        // dòng lặp ngay trong file.
        const nameKey = `n:${fold(emp?.name || name)}`;
        const emailKey = loginEmail ? `e:${loginEmail.toLowerCase()}` : null;
        const duplicate = emailKey ? taken.has(emailKey) : taken.has(nameKey);
        if (emailKey) taken.add(emailKey);
        taken.add(nameKey);
        out.push({
          line: headerLine + k + 2,
          name: emp?.name || name,
          unit_group: get(r, "unit_group"),
          department: emp?.department || get(r, "department"),
          title: emp?.role || get(r, "title"),
          project_role: get(r, "project_role"),
          duty: get(r, "duty"),
          reports_to: get(r, "reports_to"),
          phone: emp?.phone || get(r, "phone"),
          loginEmail,
          contactEmail: emp?.workEmail || fileEmails[0] || "",
          status: statusOf(get(r, "status")),
          kind: duplicate ? "duplicate" : emp ? "matched" : "unmatched",
          note: duplicate ? "Đã có trong danh sách thành viên — bỏ qua" : note || (emp ? "" : "Không có trong danh bạ — dùng thông tin trong file"),
        });
      });
      if (!out.length) {
        setRows(null);
        setErr("File không có dòng nhân sự nào dưới hàng tên cột.");
        return;
      }
      setRows(out);
    } catch (e) {
      setRows(null);
      setErr(e instanceof Error ? `Không đọc được file: ${e.message}` : "Không đọc được file.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function commit() {
    if (!rows) return;
    const ok = rows.filter((r) => r.kind !== "duplicate");
    if (!ok.length) return setErr("Không có người mới để thêm.");
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from("pc_project_members").insert(
      ok.map((r) => ({
        project_id: project.id,
        email: r.loginEmail ? r.loginEmail.toLowerCase() : null,
        name: r.name,
        role: "VIEW",
        unit_group: r.unit_group || null,
        department: r.department || null,
        title: r.title || null,
        phone: r.phone || null,
        contact_email: r.contactEmail || null,
        project_role: r.project_role || null,
        duty: r.duty || null,
        reports_to: r.reports_to || null,
        status: r.status,
      }))
    );
    setSaving(false);
    if (error) return setErr(pcErrorMessage(error));
    setRows(null);
    onDone();
  }

  const count = (k: ImportRow["kind"]) => (rows || []).filter((r) => r.kind === k).length;
  const addable = rows ? rows.length - count("duplicate") : 0;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFile(f);
        }}
      />
      <PrimaryButton busy={reading} onClick={() => inputRef.current?.click()}>
        <FileUp size={13} /> Nhập từ Excel
      </PrimaryButton>
      {!rows && err && (
        <div className="basis-full">
          <ErrorLine msg={err} />
        </div>
      )}

      {rows && (
        <Modal title={`Nhập thành viên từ “${fileName}”`} onClose={() => setRows(null)} xwide>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={12} /> {count("matched")} khớp danh bạ
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
              <AlertTriangle size={12} /> {count("unmatched")} không có trong danh bạ
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
              <Ban size={12} /> {count("duplicate")} đã có — bỏ qua
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Người khớp danh bạ lấy phòng ban, chức danh, SĐT, email theo hồ sơ nhân viên. Tất cả được thêm với <b>Quyền xem</b> — ai cần sửa thì đổi
            sau trong bảng.
          </p>
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left whitespace-nowrap bg-slate-50">
                  <th className="py-2 px-2">Dòng</th>
                  <th className="py-2 px-2">Họ và tên</th>
                  <th className="py-2 px-2">Phòng ban</th>
                  <th className="py-2 px-2">Chức danh</th>
                  <th className="py-2 px-2">Vai trò</th>
                  <th className="py-2 px-2">Nhiệm vụ</th>
                  <th className="py-2 px-2">SĐT</th>
                  <th className="py-2 px-2">Email</th>
                  <th className="py-2 px-2">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={`border-t border-slate-100 align-top ${r.kind === "duplicate" ? "opacity-45" : ""}`}>
                    <td className="py-1.5 px-2 text-slate-400">{r.line}</td>
                    <td className="py-1.5 px-2 font-semibold text-slate-700 whitespace-nowrap">
                      {r.kind === "matched" && <CheckCircle2 size={11} className="inline text-emerald-500 mr-1 -mt-0.5" />}
                      {r.kind === "unmatched" && <AlertTriangle size={11} className="inline text-amber-500 mr-1 -mt-0.5" />}
                      {r.kind === "duplicate" && <Ban size={11} className="inline text-slate-400 mr-1 -mt-0.5" />}
                      {r.name}
                    </td>
                    <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{r.department || "—"}</td>
                    <td className="py-1.5 px-2 text-slate-600">{r.title || "—"}</td>
                    <td className="py-1.5 px-2 text-slate-600 min-w-[160px]">{r.project_role || "—"}</td>
                    <td className="py-1.5 px-2 text-slate-600 min-w-[200px]">{r.duty || "—"}</td>
                    <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{r.phone || "—"}</td>
                    <td className="py-1.5 px-2 text-slate-600 whitespace-nowrap">{r.contactEmail || "Chưa có"}</td>
                    <td className={`py-1.5 px-2 min-w-[160px] ${r.kind === "matched" ? "text-slate-400" : "text-amber-700"}`}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ErrorLine msg={err} />
          <div className="flex justify-end gap-2">
            <PrimaryButton onClick={commit} busy={saving} disabled={addable === 0}>
              Thêm {addable} người
            </PrimaryButton>
          </div>
        </Modal>
      )}
    </>
  );
}

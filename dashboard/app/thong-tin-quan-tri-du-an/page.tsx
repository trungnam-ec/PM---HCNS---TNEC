"use client";

// ============================================================
// Quản lý dự án > Thông tin quản trị dự án — DANH SÁCH DỰ ÁN
//
// 1 Ban điều hành (departments type='bdh') = 1 dự án (chốt 24/09/2026).
// • Ban lãnh đạo (Admin / cờ can_view_all_projects): thấy đủ mọi BĐH, BĐH chưa có
//   hồ sơ hiện nút "Lập hồ sơ".
// • Người khác: chỉ thấy dự án RLS cho xem (thành viên dự án / nhân sự đúng BĐH /
//   cờ TC-KT).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { fetchDepartments } from "@/lib/departments";
import { useCurrentUser } from "@/lib/useCurrentUser";
import {
  fetchIsLeadership,
  pcErrorMessage,
  statusMeta,
  formatDate,
  type PcProject,
} from "@/lib/projectControl";
import { FolderKanban, Loader2, Plus, Search, AlertCircle, ChevronRight, Building2, X } from "lucide-react";

type Row = { bdhName: string; project: PcProject | null };

export default function ProjectControlListPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [isLeader, setIsLeader] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<string | null>(null); // bdh đang mở form lập hồ sơ

  const load = useCallback(async () => {
    const [depts, projRes, leader] = await Promise.all([
      fetchDepartments(),
      supabase.from("pc_projects").select("*").order("bdh_name"),
      fetchIsLeadership(),
    ]);
    if (projRes.error) setError(pcErrorMessage(projRes.error));
    const projects = (projRes.data as PcProject[]) || [];
    const byBdh = new Map(projects.map((p) => [p.bdh_name, p]));

    let list: Row[];
    if (leader) {
      list = depts.bdh.map((b) => ({ bdhName: b, project: byBdh.get(b) || null }));
      // Hồ sơ gắn với BĐH đã đổi tên / ngừng hoạt động vẫn phải hiện.
      projects.forEach((p) => {
        if (!depts.bdh.includes(p.bdh_name)) list.push({ bdhName: p.bdh_name, project: p });
      });
    } else {
      list = projects.map((p) => ({ bdhName: p.bdh_name, project: p }));
    }
    setIsLeader(leader);
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.bdhName.toLowerCase().includes(q) ||
        (r.project?.name || "").toLowerCase().includes(q) ||
        (r.project?.code || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const createdCount = rows.filter((r) => r.project).length;

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Thông tin quản trị dự án" subtitle="Quản lý dự án" />
        <main className="flex-1 p-6 space-y-4 max-w-6xl w-full">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 flex-1 min-w-[220px] max-w-md">
              <Search size={14} className="text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo BĐH, tên hoặc mã dự án..."
                className="flex-1 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            {isLeader && !loading && (
              <span className="text-[11px] font-bold text-slate-500">
                Đã lập hồ sơ {createdCount}/{rows.length} Ban điều hành
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {loading || user.loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="animate-spin text-[#005BAC]" size={28} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
              <FolderKanban size={28} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">Chưa có dự án nào bạn được xem</p>
              <p className="text-xs text-slate-400 mt-1">
                Hồ sơ dự án do Ban lãnh đạo lập. Bạn sẽ thấy dự án khi thuộc Ban điều hành đó hoặc được gán
                vai trò trong dự án.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="grid grid-cols-[1.2fr_2fr_1fr_1fr_auto] gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                <span>Ban điều hành</span>
                <span>Dự án</span>
                <span>Trạng thái</span>
                <span>Khởi công – Hoàn thành</span>
                <span className="w-24" />
              </div>
              {filtered.map((r) => {
                const p = r.project;
                const st = p ? statusMeta(p.status) : null;
                return (
                  <div
                    key={r.bdhName}
                    className="grid grid-cols-[1.2fr_2fr_1fr_1fr_auto] gap-3 px-5 py-3.5 border-b border-slate-50 last:border-0 items-center hover:bg-slate-50/50"
                  >
                    <span className="flex items-center gap-2 text-xs font-bold text-slate-700 min-w-0">
                      <Building2 size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{r.bdhName}</span>
                    </span>
                    <span className="min-w-0">
                      {p ? (
                        <>
                          <span className="block text-xs font-semibold text-slate-700 truncate" title={p.name}>
                            {p.name}
                          </span>
                          {p.code && <span className="text-[10px] font-mono text-slate-400">{p.code}</span>}
                        </>
                      ) : (
                        <span className="text-xs italic text-slate-400">Chưa lập hồ sơ</span>
                      )}
                    </span>
                    <span>
                      {st && (
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${st.cls}`}>
                          {st.label}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {p && (p.start_date || p.finish_date)
                        ? `${formatDate(p.start_date) || "?"} – ${formatDate(p.finish_date) || "?"}`
                        : ""}
                    </span>
                    <span className="w-24 flex justify-end">
                      {p ? (
                        <Link
                          href={`/thong-tin-quan-tri-du-an/${p.id}`}
                          className="flex items-center gap-1 text-[11px] font-bold text-[#005BAC] hover:text-blue-700"
                        >
                          Mở hồ sơ <ChevronRight size={13} />
                        </Link>
                      ) : isLeader ? (
                        <button
                          onClick={() => setCreating(r.bdhName)}
                          className="flex items-center gap-1 text-[11px] font-bold text-white bg-[#005BAC] hover:bg-blue-700 px-2.5 py-1.5 rounded-lg"
                        >
                          <Plus size={12} /> Lập hồ sơ
                        </button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {creating && (
        <CreateProjectModal
          bdhName={creating}
          email={user.email}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            setCreating(null);
            router.push(`/thong-tin-quan-tri-du-an/${id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateProjectModal({
  bdhName,
  email,
  onClose,
  onCreated,
}: {
  bdhName: string;
  email: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState(bdhName.replace(/^BĐH\s*/i, "Dự án "));
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) return setErr("Nhập tên dự án.");
    setSaving(true);
    setErr("");
    const { data, error } = await supabase
      .from("pc_projects")
      .insert({ bdh_name: bdhName, name: name.trim(), code: code.trim() || null, created_by: email })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) return setErr(pcErrorMessage(error));
    onCreated(data.id);
  }

  return (
    <div className="fixed inset-0 z-[900] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">Lập hồ sơ dự án — {bdhName}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-rose-500">
            <X size={18} />
          </button>
        </div>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold text-slate-500">Tên dự án đầy đủ</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF]"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold text-slate-500">Mã dự án (tuỳ chọn) — VD: DT769-XL15</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#00AEEF]"
          />
        </label>
        <p className="text-[11px] text-slate-400">
          Các thông tin còn lại (CĐT, TVGS, giá trị HĐ, lý trình…) nhập tiếp trong hồ sơ.
        </p>
        {err && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100">
            Huỷ
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold px-4 py-2 rounded-lg"
          >
            {saving && <Loader2 size={13} className="animate-spin" />} Lập hồ sơ
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

// ============================================================
// Hồ sơ 1 dự án — Quản trị dự án: Tổng quan · Bình đồ · Lý trình & Hạng mục ·
// Nhà thầu & Hợp đồng · A. Kế hoạch · B. Pháp lý · Thành viên.
// P1 = khung dự án; P2 = Bình đồ + Khối A + Khối B; P3 = Khối C (sản lượng, tài chính).
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCurrentUser } from "@/lib/useCurrentUser";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  fetchMyAccess,
  pcErrorMessage,
  statusMeta,
  roleLabel,
  NO_ACCESS,
  type PcAccess,
  type PcProject,
  type PcProjectFinance,
} from "@/lib/projectControl";
import { ArrowLeft, Loader2, LayoutDashboard, Route, Handshake, Users, Lock, Grid3x3, HardHat, ScrollText, ClipboardList, Wallet, Siren, FileBarChart, Boxes, Milestone } from "lucide-react";
import OverviewTab from "./OverviewTab";
import SegmentsTab from "./SegmentsTab";
import ContractsTab from "./ContractsTab";
import MembersTab from "./MembersTab";
import BinhDoTab from "./BinhDoTab";
import BlockATab from "./BlockATab";
import BlockBTab from "./BlockBTab";
import ProductionTab from "./ProductionTab";
import FinanceTab from "./FinanceTab";
import RiskTab from "./RiskTab";
import ReportTab from "./ReportTab";
import MaterialTab from "./MaterialTab";
import LifecycleTab from "./LifecycleTab";

type TabKey = "overview" | "lifecycle" | "binhdo" | "segments" | "contracts" | "blockA" | "blockB" | "production" | "finance" | "material" | "risk" | "report" | "members";

const TABS: { key: TabKey; label: string; icon: typeof Route }[] = [
  { key: "overview", label: "Tổng quan", icon: LayoutDashboard },
  { key: "lifecycle", label: "Vòng đời", icon: Milestone },
  { key: "binhdo", label: "Bình đồ", icon: Grid3x3 },
  { key: "segments", label: "Lý trình & Hạng mục", icon: Route },
  { key: "contracts", label: "Nhà thầu & Hợp đồng", icon: Handshake },
  { key: "blockA", label: "A. Kế hoạch", icon: HardHat },
  { key: "blockB", label: "B. Pháp lý", icon: ScrollText },
  { key: "production", label: "C. Sản lượng", icon: ClipboardList },
  { key: "finance", label: "D. Tài chính", icon: Wallet },
  { key: "material", label: "E. Vật tư", icon: Boxes },
  { key: "risk", label: "Cảnh báo & Rủi ro", icon: Siren },
  { key: "report", label: "Báo cáo", icon: FileBarChart },
  { key: "members", label: "Thành viên", icon: Users },
];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const user = useCurrentUser();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<PcProject | null>(null);
  const [finance, setFinance] = useState<PcProjectFinance | null>(null);
  const [access, setAccess] = useState<PcAccess>(NO_ACCESS);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  // Lý trình đang xem ở Khối A — bấm cột trên Bình đồ sẽ đặt giá trị này.
  const [focusSegment, setFocusSegment] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [pRes, acc] = await Promise.all([
      supabase.from("pc_projects").select("*").eq("id", id).maybeSingle(),
      fetchMyAccess(id),
    ]);
    if (pRes.error) setError(pcErrorMessage(pRes.error));
    setProject((pRes.data as PcProject) || null);
    setAccess(acc);
    if (acc.can_view_finance) {
      const { data } = await supabase.from("pc_project_finance").select("*").eq("project_id", id).maybeSingle();
      setFinance((data as PcProjectFinance) || null);
    } else {
      setFinance(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const st = project ? statusMeta(project.status) : null;

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <div className="ml-60 print:ml-0 flex-1 flex flex-col min-w-0">
        <div className="print:hidden">
          <Header title={project?.name || "Hồ sơ dự án"} subtitle={project?.bdh_name || "Quản lý dự án"} />
        </div>
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <Link
            href="/thong-tin-quan-tri-du-an"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-[#005BAC] print:hidden"
          >
            <ArrowLeft size={13} /> Danh sách dự án
          </Link>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-[#005BAC]" size={28} />
            </div>
          ) : !project ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
              <Lock size={26} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-600">{error || "Không tìm thấy dự án hoặc bạn không có quyền xem."}</p>
            </div>
          ) : (
            <>
              {/* Khung tên dự án: nền xanh gradient cùng màu tab đang chọn. */}
              <div className="bg-gradient-to-r from-[#005BAC] to-[#00AEEF] rounded-2xl shadow-md shadow-blue-500/15 px-5 py-4 flex flex-wrap items-center gap-3 print:hidden">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-heading font-extrabold text-base !text-white">{project.name}</h2>
                    {st && (
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 !text-white">
                        {st.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] !text-white/80 font-semibold mt-0.5">
                    {project.bdh_name}
                    {project.code ? ` · ${project.code}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {access.is_leadership && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/20 !text-white">Ban lãnh đạo</span>
                  )}
                  {access.roles.map((r) => (
                    <span key={r} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/20 !text-white">
                      {roleLabel(r)}
                    </span>
                  ))}
                  {!access.can_view_finance && (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/20 !text-white flex items-center gap-1">
                      <Lock size={10} /> Ẩn số tiền
                    </span>
                  )}
                </div>
              </div>

              {/* Một hàng duy nhất; màn hẹp thì cuộn ngang thay vì xuống dòng. */}
              <div className="flex flex-nowrap gap-1 overflow-x-auto pb-1 print:hidden">
                {TABS.filter((t) => t.key !== "finance" || access.can_view_finance).map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold border transition-all whitespace-nowrap shrink-0 ${
                        active
                          ? "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] text-white border-transparent shadow-md shadow-blue-500/15"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <Icon size={13} /> {t.label}
                    </button>
                  );
                })}
              </div>

              {tab === "overview" && (
                <OverviewTab project={project} finance={finance} access={access} onSaved={load} />
              )}
              {tab === "lifecycle" && <LifecycleTab project={project} finance={finance} access={access} onChanged={load} />}
              {tab === "binhdo" && (
                <BinhDoTab
                  projectId={project.id}
                  canFin={access.can_view_finance}
                  onOpenSegment={(segId) => {
                    setFocusSegment(segId);
                    setTab("blockA");
                  }}
                />
              )}
              {tab === "segments" && <SegmentsTab projectId={project.id} access={access} />}
              {tab === "contracts" && <ContractsTab projectId={project.id} access={access} />}
              {tab === "blockA" && (
                <BlockATab projectId={project.id} access={access} focusSegment={focusSegment} setFocusSegment={setFocusSegment} />
              )}
              {tab === "blockB" && <BlockBTab projectId={project.id} bdhName={project.bdh_name} access={access} />}
              {tab === "production" && <ProductionTab projectId={project.id} email={user.email} access={access} />}
              {tab === "finance" && <FinanceTab project={project} finance={finance} access={access} />}
              {tab === "material" && <MaterialTab projectId={project.id} access={access} />}
              {tab === "risk" && <RiskTab projectId={project.id} access={access} />}
              {tab === "report" && <ReportTab project={project} access={access} />}
              {tab === "members" && <MembersTab project={project} access={access} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

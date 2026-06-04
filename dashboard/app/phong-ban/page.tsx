"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { fetchStats, fetchCandidates, type Stats, type Candidate } from "@/lib/api";
import {
    Users, TrendingUp, Building2, Wrench, FolderKanban,
    ClipboardList, Package, ShieldAlert, UserCheck,
    UserCog, Calculator, RefreshCw, ChevronRight, Lock
} from "lucide-react";

const DEPT_CONFIG = [
    {
        id: "hanh-chinh-nhan-su",
        label: "Hành Chính Nhân Sự",
        icon: UserCheck,
        color: "from-cyan-500/20 to-blue-500/10",
        accent: "#06b6d4",
        border: "border-cyan-400/30",
        hasData: true,
        subLabel: "Tuyển dụng • Hành chính • Nhân sự",
    },
    { id: "ky-thuat", label: "Kỹ Thuật", icon: Wrench, color: "from-orange-500/20 to-red-500/10", accent: "#f97316", border: "border-orange-400/30", hasData: false, subLabel: "Thiết kế kỹ thuật • Bảo trì" },
    { id: "du-an", label: "Dự Án", icon: FolderKanban, color: "from-violet-500/20 to-purple-500/10", accent: "#8b5cf6", border: "border-violet-400/30", hasData: false, subLabel: "Quản lý dự án • Tiến độ" },
    { id: "ke-hoach", label: "Kế Hoạch", icon: ClipboardList, color: "from-green-500/20 to-emerald-500/10", accent: "#10b981", border: "border-green-400/30", hasData: false, subLabel: "Lập kế hoạch • Phân tích" },
    { id: "vat-tu-thiet-bi", label: "Vật Tư Thiết Bị", icon: Package, color: "from-yellow-500/20 to-amber-500/10", accent: "#f59e0b", border: "border-yellow-400/30", hasData: false, subLabel: "Quản lý kho • Thiết bị" },
    { id: "atld", label: "ATLĐ", icon: ShieldAlert, color: "from-red-500/20 to-rose-500/10", accent: "#ef4444", border: "border-red-400/30", hasData: false, subLabel: "An toàn lao động" },
    { id: "qlcc", label: "QLCC", icon: Building2, color: "from-sky-500/20 to-blue-500/10", accent: "#0ea5e9", border: "border-sky-400/30", hasData: false, subLabel: "Quản lý công trình" },
    { id: "tro-ly", label: "Trợ Lý", icon: UserCog, color: "from-pink-500/20 to-rose-500/10", accent: "#ec4899", border: "border-pink-400/30", hasData: false, subLabel: "Trợ lý ban giám đốc" },
    { id: "ke-toan", label: "Kế Toán", icon: Calculator, color: "from-teal-500/20 to-green-500/10", accent: "#14b8a6", border: "border-teal-400/30", hasData: false, subLabel: "Tài chính • Kế toán" },
];

export default function PhongBanPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [s, c] = await Promise.all([fetchStats(), fetchCandidates()]);
            setStats(s);
            setCandidates(c);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Tính số UV cho từng phòng (HCNS = toàn bộ dữ liệu hiện tại)
    const hcnsTotal = candidates.length;
    const hcnsPass = candidates.filter(c => String(c["Trạng thái"]).toUpperCase() === "PASS CV").length;
    const hcnsPassRate = hcnsTotal > 0 ? Math.round((hcnsPass / hcnsTotal) * 100) : 0;

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <div className="ml-60 flex-1 flex flex-col">
                <Header title="Quản Lý Phòng Ban" subtitle="Tổng quan 9 phòng ban toàn công ty" />
                <main className="flex-1 p-8 space-y-8">

                    {/* Stats Summary */}
                    <div className="grid grid-cols-3 gap-5">
                        <div className="glass rounded-2xl p-5 flex items-center gap-4">
                            <div className="w-11 h-11 rounded-xl bg-[#005088] flex items-center justify-center">
                                <Building2 size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="text-slate-500 text-sm">Tổng số phòng</p>
                                <p className="text-[#005088] font-heading font-bold text-2xl">9</p>
                            </div>
                        </div>
                        <div className="glass rounded-2xl p-5 flex items-center gap-4">
                            <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center">
                                <TrendingUp size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="text-slate-500 text-sm">Đang tuyển dụng</p>
                                <p className="text-emerald-600 font-heading font-bold text-2xl">1 phòng</p>
                                <p className="text-slate-400 text-xs">8 phòng sẽ kết nối sau</p>
                            </div>
                        </div>
                        <div className="glass rounded-2xl p-5 flex items-center gap-4">
                            <div className="w-11 h-11 rounded-xl bg-cyan-500 flex items-center justify-center">
                                <Users size={20} className="text-white" />
                            </div>
                            <div>
                                <p className="text-slate-500 text-sm">Tổng ứng viên</p>
                                <p className="text-cyan-600 font-heading font-bold text-2xl">{loading ? "–" : hcnsTotal}</p>
                            </div>
                        </div>
                    </div>

                    {/* 9 Department Cards */}
                    <div>
                        <h2 className="font-heading font-semibold text-[#005088] mb-5 flex items-center gap-2">
                            Chi Tiết Phòng Ban
                            {loading && <RefreshCw size={14} className="animate-spin text-slate-400" />}
                        </h2>
                        <div className="grid grid-cols-3 gap-5">
                            {DEPT_CONFIG.map((dept) => {
                                const Icon = dept.icon;
                                return (
                                    <div
                                        key={dept.id}
                                        className={`glass rounded-2xl p-5 border ${dept.border} bg-gradient-to-br ${dept.color} flex flex-col gap-4 relative overflow-hidden transition-all
                      ${dept.hasData ? "hover:shadow-lg hover:scale-[1.01] cursor-pointer" : "opacity-60"}`}
                                    >
                                        {/* Header */}
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                                                    style={{ background: `${dept.accent}22` }}>
                                                    <Icon size={20} style={{ color: dept.accent }} />
                                                </div>
                                                <div>
                                                    <p className="font-heading font-semibold text-slate-700 text-sm leading-tight">{dept.label}</p>
                                                    <p className="text-slate-400 text-[10px]">{dept.subLabel}</p>
                                                </div>
                                            </div>
                                            {dept.hasData ? (
                                                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                    ● Đang tuyển
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                                    <Lock size={9} /> Chưa kết nối
                                                </span>
                                            )}
                                        </div>

                                        {/* Stats */}
                                        {dept.hasData ? (
                                            <>
                                                <div className="grid grid-cols-3 gap-2 text-center">
                                                    <div className="bg-white/60 rounded-xl py-2">
                                                        <p className="font-heading font-bold text-slate-800 text-lg">{loading ? "–" : hcnsTotal}</p>
                                                        <p className="text-slate-400 text-[9px] uppercase">Ứng Viên</p>
                                                    </div>
                                                    <div className="bg-white/60 rounded-xl py-2">
                                                        <p className="font-heading font-bold text-emerald-600 text-lg">{loading ? "–" : `${hcnsPassRate}%`}</p>
                                                        <p className="text-slate-400 text-[9px] uppercase">Tỉ lệ duyệt</p>
                                                    </div>
                                                    <div className="bg-white/60 rounded-xl py-2">
                                                        <p className="font-heading font-bold text-violet-600 text-lg">{loading ? "–" : stats?.vong1_count ?? 0}</p>
                                                        <p className="text-slate-400 text-[9px] uppercase">Vòng 1</p>
                                                    </div>
                                                </div>

                                                {/* Pipeline mini */}
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                                                        <span>Quy trình tuyển dụng</span>
                                                        <span>{hcnsTotal} → {stats?.vong1_count ?? 0} → {stats?.vong2_count ?? 0} → {stats?.thuviec_count ?? 0}</span>
                                                    </div>
                                                    <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden bg-slate-200">
                                                        <div className="bg-cyan-400 rounded-full" style={{ width: "100%" }}></div>
                                                    </div>
                                                </div>

                                                <Link href="/tong-hop"
                                                    className="flex items-center justify-end gap-1 text-xs font-semibold hover:underline"
                                                    style={{ color: dept.accent }}>
                                                    Xem chi tiết <ChevronRight size={13} />
                                                </Link>
                                            </>
                                        ) : (
                                            <div className="flex-1 flex flex-col items-center justify-center py-4 gap-2">
                                                <Lock size={24} className="text-slate-300" />
                                                <p className="text-slate-400 text-xs text-center">
                                                    Chưa kết nối dữ liệu.<br />Sẽ bổ sung trong tương lai.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

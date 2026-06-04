"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { fetchCandidates, updateCandidate, type Candidate } from "@/lib/api";
import { Briefcase, FileText, Search, RefreshCw, Eye } from "lucide-react";

export default function ThuViecPage() {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchCandidates("Thử việc");
            setCandidates(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = candidates.filter(c => {
        const name = String(c["Tên ứng viên"] || "").toLowerCase();
        return !search || name.includes(search.toLowerCase());
    });

    const updateField = async (stt: number, field: string, val: string) => {
        await updateCandidate(stt, { [field]: val }, "Thử việc");
        load();
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <div className="ml-60 flex-1 flex flex-col">
                <Header title="Quản lý Thử Việc" subtitle="Theo dõi ứng viên trong giai đoạn thử việc" />

                <main className="p-8 space-y-6">
                    <div className="glass p-5 rounded-2xl flex items-center gap-4 w-fit">
                        <div className="w-12 h-12 rounded-full bg-[#005088] flex items-center justify-center text-white font-bold">{filtered.length}</div>
                        <p className="font-heading font-semibold text-[#005088]">Ứng viên đang thử việc</p>
                    </div>

                    <div className="glass rounded-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/40 flex items-center justify-between">
                            <div className="relative w-64">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm ứng viên..." className="w-full pl-8 pr-4 py-2 text-sm bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                            </div>
                            <button onClick={load}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
                        </div>

                        <table className="w-full text-sm text-left">
                            <thead className="bg-[#005088]/5 text-[#005088]">
                                <tr>
                                    <th className="px-5 py-4">STT</th>
                                    <th className="px-5 py-4">Ứng viên</th>
                                    <th className="px-5 py-4">Phòng Ban</th>
                                    <th className="px-5 py-4">Kinh nghiệm</th>
                                    <th className="px-5 py-4">Kết quả V2</th>
                                    <th className="px-5 py-4">Kết quả nhận việc</th>
                                    <th className="px-5 py-4">HĐ Chính thức</th>
                                    <th className="px-5 py-4 text-center">Chi tiết</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? <tr><td colSpan={8} className="py-10 text-center text-slate-400">Đang tải...</td></tr> : filtered.map((c, i) => (
                                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/30">
                                        <td className="px-5 py-4 text-slate-400">{c.STT}</td>
                                        <td className="px-5 py-4 font-bold text-[#005088]">{c["Tên ứng viên"]}</td>
                                        <td className="px-5 py-4 text-slate-600 font-medium">{c["Phòng Ban"]}</td>
                                        <td className="px-5 py-4 text-slate-600">{c["Kinh nghiệm"]}</td>
                                        <td className="px-5 py-4"><span className="badge-pass px-2 py-0.5 rounded text-[10px] font-bold">ĐẠT V2</span></td>
                                        <td className="px-5 py-4">
                                            <select value={String(c["Kết quả nhận việc"] || "Chờ nhận việc")} onChange={e => updateField(Number(c.STT), "Kết quả nhận việc", e.target.value)}
                                                className={`text-xs font-bold px-2 py-1 rounded-lg border-none cursor-pointer ${c["Kết quả nhận việc"] === "Đạt" ? "badge-pass" : "badge-wait"}`}>
                                                <option value="Chờ nhận việc">Chờ nhận việc</option>
                                                <option value="Đạt">Nhận việc ✓</option>
                                                <option value="Hủy">Bỏ việc ✗</option>
                                            </select>
                                        </td>
                                        <td className="px-5 py-4 italic text-slate-400 text-xs">HR điền tay tại Sheet</td>
                                        <td className="px-5 py-4 text-center"><button className="text-blue-400"><Eye size={16} /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </main>
            </div>
        </div>
    );
}

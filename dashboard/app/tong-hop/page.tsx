"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { fetchCandidates, deleteCandidate, type Candidate } from "@/lib/api";
import { List, Search, RefreshCw, Trash2, Pencil, CheckCircle, XCircle } from "lucide-react";

export default function TongHopPage() {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchCandidates("Tổng Hợp");
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
        const sdt = String(c["SĐT"] || "").toLowerCase();
        return !search || name.includes(search.toLowerCase()) || sdt.includes(search.toLowerCase());
    });

    const handleDelete = async (stt: number) => {
        if (!confirm("Bạn có chắc chắn muốn xóa hồ sơ này?")) return;
        await deleteCandidate(stt, "Tổng Hợp");
        load();
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <div className="ml-60 flex-1 flex flex-col">
                <Header title="Danh sách Tổng Hợp" subtitle="Toàn bộ ứng viên đã được AI chấm điểm" />

                <main className="p-8 space-y-6">
                    <div className="glass rounded-2xl overflow-hidden shadow-xl border border-white/20">
                        <div className="p-5 border-b border-white/40 flex items-center justify-between bg-blue-50/20">
                            <div className="relative w-80">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc số điện thoại..." className="w-full pl-9 pr-4 py-2.5 text-sm bg-white/80 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
                            </div>
                            <button onClick={load} className="flex items-center gap-2 text-sm font-semibold text-[#005088] glass px-4 py-2 rounded-xl transition-all">
                                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Làm mới
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="bg-[#005088] text-white">
                                    <tr>
                                        {["STT", "Ngày", "Ứng viên", "SĐT", "Phòng Ban", "Vị trí", "Trạng thái", "Nguồn", "Hành động"].map(h => (
                                            <th key={h} className="px-5 py-4 font-heading font-medium text-[11px] uppercase tracking-wider">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? <tr><td colSpan={9} className="py-20 text-center"><div className="flex flex-col items-center gap-3"><RefreshCw size={24} className="animate-spin text-blue-500" /><p className="text-slate-400 italic">Đang tải dữ liệu từ Google Sheets...</p></div></td></tr> : filtered.map((c, i) => (
                                        <tr key={i} className={`border-b border-slate-100 transition-colors ${i % 2 === 0 ? "bg-white/40" : "bg-blue-50/10"} hover:bg-blue-100/20`}>
                                            <td className="px-5 py-4 text-slate-500 font-mono">{c.STT}</td>
                                            <td className="px-5 py-4 text-slate-600 whitespace-nowrap">{c["Ngày"]}</td>
                                            <td className="px-5 py-4">
                                                <div className="font-bold text-[#005088]">{c["Tên ứng viên"]}</div>
                                                <div className="text-[10px] text-slate-400">{c.Email}</div>
                                            </td>
                                            <td className="px-5 py-4 text-slate-600">{c["SĐT"]}</td>
                                            <td className="px-5 py-4 text-slate-500 whitespace-nowrap">{c["Phòng Ban"]}</td>
                                            <td className="px-5 py-4 text-slate-600 font-medium whitespace-nowrap">{c["Vị trí"]}</td>
                                            <td className="px-5 py-4">
                                                {String(c["Trạng thái"]).toUpperCase() === "PASS CV" ? (
                                                    <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs"><CheckCircle size={12} /> PASS CV</span>
                                                ) : String(c["Trạng thái"]).toUpperCase() === "LƯU CV" ? (
                                                    <span className="flex items-center gap-1 text-amber-500 font-bold text-xs"><CheckCircle size={12} className="text-amber-500" /> LƯU CV</span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-red-400 font-bold text-xs"><XCircle size={12} /> FAIL</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-slate-400 text-xs italic">{c["Nguồn"]}</td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <button className="text-blue-500 hover:scale-110 transition-transform"><Pencil size={15} /></button>
                                                    <button onClick={() => handleDelete(Number(c.STT))} className="text-red-400 hover:scale-110 transition-transform"><Trash2 size={15} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

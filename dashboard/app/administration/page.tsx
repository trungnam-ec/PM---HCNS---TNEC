"use client";

import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  Package,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  Plus,
  Search,
  Filter
} from "lucide-react";
import { useState } from "react";

const SUPPLIES_DATA = [
  { name: "Giấy A4 Double A 70gsm", cat: "Giấy in", unit: "Ram", stock: 150, allocated: 320, alert: "Bình thường" },
  { name: "Bút bi Thiên Long xanh", cat: "Bút viết", unit: "Hộp", stock: 12, allocated: 45, alert: "Cảnh báo" },
  { name: "Kẹp bướm 25mm", cat: "Dụng cụ lưu trữ", unit: "Hộp", stock: 45, allocated: 15, alert: "Bình thường" }
];

export default function AdministrationPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredSupplies = SUPPLIES_DATA.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.cat.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header 
          title="Hành chính & Văn phòng phẩm" 
          subtitle="Quản lý kho vật tư và cấp phát văn phòng phẩm – Trung Nam E&C" 
        />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* KPI Cards for Supplies */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="glass bg-white rounded-2xl p-5 flex flex-col gap-3 border border-slate-200/40 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Tổng vật tư lưu kho</span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Package size={16} />
                </div>
              </div>
              <div className="font-heading font-bold text-2xl text-[#005BAC]">207 <span className="text-xs text-slate-400 font-semibold">đơn vị</span></div>
              <p className="text-[10px] text-slate-400 font-semibold">Tồn kho khả dụng thực tế</p>
            </div>

            <div className="glass bg-white rounded-2xl p-5 flex flex-col gap-3 border border-slate-200/40 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Đã cấp phát Q2</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <CheckCircle size={16} />
                </div>
              </div>
              <div className="font-heading font-bold text-2xl text-emerald-600">380 <span className="text-xs text-slate-400 font-semibold">đơn vị</span></div>
              <p className="text-[10px] text-slate-400 font-semibold">Đã chuyển giao cho các phòng ban</p>
            </div>

            <div className="glass bg-white rounded-2xl p-5 flex flex-col gap-3 border border-slate-200/40 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Cảnh báo tồn kho</span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <AlertTriangle size={16} />
                </div>
              </div>
              <div className="font-heading font-bold text-2xl text-amber-600">1 <span className="text-xs text-slate-400 font-semibold">vật tư</span></div>
              <p className="text-[10px] text-amber-500 font-bold">Cần bổ sung thêm Bút bi xanh</p>
            </div>
          </div>

          {/* Action & Filter Row */}
          <div className="flex justify-between items-center gap-4">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm vật tư, danh mục văn phòng phẩm..."
                className="w-full pl-9 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm font-medium"
              />
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold px-4 py-2.5 rounded-xl transition-all bg-white shadow-sm">
                <Filter size={14} /> Lọc danh mục
              </button>
              <button className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md">
                <Plus size={14} /> Cấp phát mới
              </button>
            </div>
          </div>

          {/* Main Supplies List */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <h3 className="font-heading font-bold text-slate-800 text-sm">Quản lý và cấp phát Văn phòng phẩm (Q2)</h3>
              <button className="text-[10px] font-bold text-[#005BAC] hover:underline flex items-center gap-1">
                <FileSpreadsheet size={12} /> Xuất file Excel (BC)
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-150 text-slate-400 font-bold uppercase tracking-wider text-[10px] pb-3">
                    <th className="pb-3">Vật tư văn phòng</th>
                    <th className="pb-3">Danh mục</th>
                    <th className="pb-3">Đơn vị</th>
                    <th className="pb-3">Số lượng tồn kho</th>
                    <th className="pb-3">Đã cấp phát</th>
                    <th className="pb-3">Trạng thái tồn kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                  {filteredSupplies.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400 italic">
                        Không tìm thấy vật tư văn phòng phẩm nào phù hợp.
                      </td>
                    </tr>
                  ) : (
                    filteredSupplies.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 font-bold text-slate-800">{item.name}</td>
                        <td className="py-4 text-slate-500">{item.cat}</td>
                        <td className="py-4 font-mono text-slate-500">{item.unit}</td>
                        <td className="py-4 text-slate-800 font-bold">{item.stock}</td>
                        <td className="py-4 text-slate-400">{item.allocated}</td>
                        <td className="py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                            item.alert === "Bình thường" 
                              ? "bg-emerald-100 text-emerald-700" 
                              : "bg-amber-100 text-amber-700 animate-pulse"
                          }`}>
                            {item.alert}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

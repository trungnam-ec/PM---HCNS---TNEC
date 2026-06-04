"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  Calendar,
  DollarSign,
  FileCheck,
  TrendingUp,
  Award,
  Users,
  Search,
  ChevronRight,
  Clock
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from "recharts";

// --- MOCK DATA ---
const CHARTS_DATA = [
  { name: "Jan", "Quỹ lương (Tỷ)": 1.2, "Bảo hiểm (Triệu)": 120 },
  { name: "Feb", "Quỹ lương (Tỷ)": 1.25, "Bảo hiểm (Triệu)": 125 },
  { name: "Mar", "Quỹ lương (Tỷ)": 1.3, "Bảo hiểm (Triệu)": 130 },
  { name: "Apr", "Quỹ lương (Tỷ)": 1.32, "Bảo hiểm (Triệu)": 132 },
  { name: "May", "Quỹ lương (Tỷ)": 1.35, "Bảo hiểm (Triệu)": 135 },
  { name: "Jun", "Quỹ lương (Tỷ)": 1.4, "Bảo hiểm (Triệu)": 140 }
];

const CONTRACTS_EXPIRING = [
  { name: "Bùi Quốc Vương", type: "Hợp đồng thử việc", end: "2025-07-01", daysLeft: 27, status: "Khẩn cấp" },
  { name: "Nguyễn Văn Đấu", type: "Hợp đồng thử việc", end: "2025-07-15", daysLeft: 41, status: "Cảnh báo" },
  { name: "Phạm Minh Tâm", type: "HĐ xác định thời hạn (3 năm)", end: "2025-08-15", daysLeft: 72, status: "Bình thường" }
];

export default function CBPage() {
  const [activeTab, setActiveTab] = useState("attendance"); // attendance, payroll, contracts, benefits

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Lương & Phúc lợi (C&B)" subtitle="Báo cáo phân tích lương, ngày công, hợp đồng và phúc lợi nhân sự" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Top Tabs Navigator */}
          <div className="flex border-b border-slate-200">
            {[
              { id: "attendance", label: "Chấm công", icon: Clock },
              { id: "payroll", label: "Quỹ lương & Thuế", icon: DollarSign },
              { id: "contracts", label: "Hợp đồng lao động", icon: FileCheck },
              { id: "benefits", label: "Phúc lợi & BHXH", icon: Award },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* C&B Content Panels */}
          {activeTab === "attendance" && (
            <div className="space-y-6">
              {/* Analytics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                {[
                  { label: "Đi làm đúng giờ", value: "94.5%", change: "+1.2% so với tháng trước", color: "text-emerald-500" },
                  { label: "Đi muộn / Về sớm", value: "14 lượt", change: "-3 lượt so với tháng trước", color: "text-amber-500" },
                  { label: "Nghỉ phép năm", value: "32 ngày phép", change: "Trung bình 0.5 ngày/nhân viên", color: "text-blue-500" },
                  { label: "Nghỉ không lương / Không lý do", value: "2 lượt", change: "Bằng tháng trước", color: "text-rose-500" }
                ].map((item) => (
                  <div key={item.label} className="glass bg-white rounded-2xl p-5 hover-elevate shadow-sm">
                    <p className="text-slate-500 text-xs font-semibold">{item.label}</p>
                    <p className={`font-heading font-extrabold text-2xl mt-1 ${item.color}`}>{item.value}</p>
                    <p className="text-slate-400 text-[10px] font-semibold mt-2">{item.change}</p>
                  </div>
                ))}
              </div>

              {/* Attendance Table */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h3 className="font-heading font-bold text-slate-800 text-sm mb-4">Danh sách vắng mặt / Nghỉ phép gần đây</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                        <th className="pb-3">Nhân viên</th>
                        <th className="pb-3">Lý do nghỉ</th>
                        <th className="pb-3">Từ ngày</th>
                        <th className="pb-3">Đến ngày</th>
                        <th className="pb-3">Tổng số ngày</th>
                        <th className="pb-3">Trạng thái duyệt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
                      {[
                        { name: "Trần Thị Mai", reason: "Nghỉ phép năm (Du lịch)", from: "2025-06-03", to: "2025-06-05", total: 3, approval: "Đã phê duyệt" },
                        { name: "Lê Thành Đạt", reason: "Nghỉ việc riêng", from: "2025-06-08", to: "2025-06-08", total: 1, approval: "Chờ phê duyệt" },
                        { name: "Phạm Minh Tâm", reason: "Nghỉ ốm (Có BHXH)", from: "2025-05-28", to: "2025-05-29", total: 2, approval: "Đã phê duyệt" }
                      ].map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-3 font-bold text-slate-800">{item.name}</td>
                          <td className="py-3">{item.reason}</td>
                          <td className="py-3">{item.from}</td>
                          <td className="py-3">{item.to}</td>
                          <td className="py-3 text-blue-600">{item.total} ngày</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${item.approval === "Đã phê duyệt" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {item.approval}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "payroll" && (
            <div className="space-y-6">
              {/* Financial KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  { label: "Tổng quỹ lương tháng 5", value: "1.38 Tỷ VNĐ", change: "+4.2% so với tháng trước", color: "text-blue-600" },
                  { label: "Thuế TNCN đã khấu trừ", value: "85.4 Triệu VNĐ", change: "Khai báo Thuế điện tử", color: "text-indigo-600" },
                  { label: "Chi trả tiền lương", value: "Đã chuyển khoản ngày 05/05", change: "Ngân hàng VCB", color: "text-emerald-600" }
                ].map((item) => (
                  <div key={item.label} className="glass bg-white rounded-2xl p-5 hover-elevate shadow-sm">
                    <p className="text-slate-500 text-xs font-semibold">{item.label}</p>
                    <p className={`font-heading font-extrabold text-xl mt-1.5 ${item.color}`}>{item.value}</p>
                    <p className="text-slate-400 text-[10px] font-semibold mt-2">{item.change}</p>
                  </div>
                ))}
              </div>

              {/* Payroll Chart */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h3 className="font-heading font-bold text-slate-800 text-sm mb-5">Biến động Quỹ lương & Trích đóng Bảo hiểm</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={CHARTS_DATA}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Quỹ lương (Tỷ)" fill="#005BAC" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === "contracts" && (
            <div className="space-y-6">
              {/* Expiring Contracts Alerts */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-bold text-slate-800 text-sm">Cảnh báo hết hạn hợp đồng</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {CONTRACTS_EXPIRING.map((c) => (
                    <div
                      key={c.name}
                      className={`glass bg-white rounded-2xl p-5 border-t-4 hover-elevate ${
                        c.status === "Khấn cấp" ? "border-t-rose-500" :
                        c.status === "Cảnh báo" ? "border-t-amber-500" : "border-t-blue-500"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          c.status === "Khấn cấp" ? "bg-rose-100 text-rose-700" :
                          c.status === "Cảnh báo" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {c.status}
                        </span>
                        <span className="text-slate-400 text-[10px] font-bold">Còn {c.daysLeft} ngày</span>
                      </div>
                      <h4 className="font-heading font-bold text-slate-800 text-sm">{c.name}</h4>
                      <p className="text-slate-400 text-xs font-semibold mt-0.5">{c.type}</p>
                      <p className="text-slate-500 text-[10px] font-semibold mt-3">Ngày kết thúc: {c.end}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "benefits" && (
            <div className="space-y-6">
              {/* Benefits Info */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h3 className="font-heading font-bold text-slate-800 text-sm mb-4">Các chế độ phúc lợi đang áp dụng</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { title: "Bảo hiểm sức khỏe TNEC Care", desc: "Bảo hiểm y tế bổ sung cho nhân viên trên 2 năm kinh nghiệm.", quota: "Áp dụng cho 145 nhân viên" },
                    { title: "Hỗ trợ xăng xe & Điện thoại", desc: "Trợ cấp di chuyển và thiết bị phục vụ công trường kỹ sư.", quota: "Áp dụng theo cấp bậc công việc" },
                    { title: "Khám sức khỏe định kỳ", desc: "Tổ chức khám sức khỏe tổng quát định kỳ hàng năm vào tháng 7.", quota: "Toàn thể cán bộ công nhân viên" },
                    { title: "Quỹ Công đoàn & Quà tặng", desc: "Hỗ trợ hiếu hỷ, sinh nhật, quà tặng Tết thiếu nhi cho con em.", quota: "Tất cả thành viên công đoàn" }
                  ].map((item) => (
                    <div key={item.title} className="p-4 bg-slate-50 rounded-xl space-y-1">
                      <h4 className="font-heading font-bold text-slate-800 text-xs">{item.title}</h4>
                      <p className="text-slate-500 text-[11px] font-medium leading-relaxed">{item.desc}</p>
                      <p className="text-blue-600 text-[10px] font-bold pt-1">{item.quota}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  TrendingUp,
  Award,
  Users,
  Search,
  ChevronRight,
  PieChart as PieIcon,
  BarChart2,
  Calendar,
  Layers,
  ArrowRight
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell
} from "recharts";

// --- MOCK DATA ---
const RECRUIT_CHART = [
  { month: "Jan", "Hồ sơ nhận": 45, "PASS CV": 15, "Nhận việc": 8 },
  { month: "Feb", "Hồ sơ nhận": 60, "PASS CV": 24, "Nhận việc": 12 },
  { month: "Mar", "Hồ sơ nhận": 85, "PASS CV": 35, "Nhận việc": 18 },
  { month: "Apr", "Hồ sơ nhận": 110, "PASS CV": 50, "Nhận việc": 22 },
  { month: "May", "Hồ sơ nhận": 95, "PASS CV": 42, "Nhận việc": 19 },
  { month: "Jun", "Hồ sơ nhận": 130, "PASS CV": 65, "Nhận việc": 30 }
];

const DEPT_DISTRIBUTION = [
  { name: "Kỹ Thuật", value: 180, color: "#005BAC" },
  { name: "Dự Án", value: 245, color: "#00AEEF" },
  { name: "Hành chính", value: 85, color: "#6366F1" },
  { name: "Kế Hoạch", value: 65, color: "#F59E0B" },
  { name: "Vật Tư", value: 70, color: "#22C55E" }
];

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState("recruitment"); // recruitment, human_resources, tasks

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Báo cáo & Phân tích" subtitle="Trung tâm phân tích báo cáo nhân sự, tuyển dụng và năng suất" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-slate-200">
            {[
              { id: "recruitment", label: "Báo cáo Tuyển dụng", icon: BarChart2 },
              { id: "human_resources", label: "Cơ cấu Nhân sự", icon: PieIcon },
              { id: "tasks", label: "Năng suất & Công việc", icon: TrendingUp },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveReport(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                    activeReport === tab.id
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

          {/* Reports Content Panels */}
          {activeReport === "recruitment" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Chart */}
              <div className="lg:col-span-2 glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h3 className="font-heading font-bold text-slate-800 text-sm mb-5">Biến động Phễu Tuyển dụng (6 tháng qua)</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={RECRUIT_CHART}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Hồ sơ nhận" stroke="#64748B" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="PASS CV" stroke="#00AEEF" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Nhận việc" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Conversion Statistics */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm flex flex-col justify-between h-[348px]">
                <h3 className="font-heading font-bold text-slate-800 text-sm mb-4">Chỉ số chuyển đổi Tuyển dụng</h3>
                
                <div className="space-y-4 flex-1">
                  {[
                    { label: "Tỉ lệ lọc CV đạt", val: "48.2%", desc: "Tăng 2% so với Q1" },
                    { label: "Tỉ lệ phỏng vấn đạt", val: "62.5%", desc: "Duy trì ổn định" },
                    { label: "Tỉ lệ nhận việc", val: "88.5%", desc: "Rất cao so với ngành xây dựng" }
                  ].map((stat, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="text-slate-500 text-[10px] font-semibold">{stat.label}</p>
                        <p className="text-slate-400 text-[9px] mt-0.5">{stat.desc}</p>
                      </div>
                      <span className="font-heading font-extrabold text-slate-800 text-base">{stat.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeReport === "human_resources" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Pie Chart */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium flex flex-col items-center">
                <h3 className="font-heading font-bold text-slate-800 text-sm w-full mb-5 text-left">Cơ cấu nhân sự theo Phòng ban</h3>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={DEPT_DISTRIBUTION}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {DEPT_DISTRIBUTION.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Legends & Details */}
              <div className="lg:col-span-2 glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm">
                <h3 className="font-heading font-bold text-slate-800 text-sm mb-4">Chi tiết phân bổ nhân sự</h3>
                <div className="space-y-4">
                  {DEPT_DISTRIBUTION.map((dept) => (
                    <div key={dept.name} className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: dept.color }} />
                        <span className="text-slate-700 text-xs font-semibold">{dept.name}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-slate-500 text-xs font-medium">{dept.value} nhân viên</span>
                        <span className="font-heading font-bold text-slate-800 text-xs w-12 text-right">
                          {((dept.value / 645) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeReport === "tasks" && (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
              <h3 className="font-heading font-bold text-slate-800 text-sm mb-4">Thống kê năng suất công việc</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { title: "Đúng hạn", desc: "Số lượng công việc hoàn thành trước hạn chót.", val: "88%" },
                  { title: "Trung bình thời gian giải quyết", desc: "Thời gian trung bình xử lý xong 1 tờ trình.", val: "1.5 ngày" },
                  { title: "Tỉ lệ sửa đổi văn bản", desc: "Tỉ lệ văn bản bị yêu cầu chỉnh sửa ở bộ phận Văn thư.", val: "6.5%" }
                ].map((stat) => (
                  <div key={stat.title} className="p-5 bg-slate-50 rounded-2xl border border-slate-150 flex flex-col justify-between h-36">
                    <div>
                      <h4 className="font-heading font-bold text-slate-800 text-xs">{stat.title}</h4>
                      <p className="text-slate-500 text-[10px] leading-relaxed font-medium mt-1">{stat.desc}</p>
                    </div>
                    <span className="font-heading font-extrabold text-blue-600 text-2xl mt-3">{stat.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

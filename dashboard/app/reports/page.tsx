"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  Calendar,
  Layers,
  Building2,
  FileText,
  Users,
  Calculator,
  Megaphone,
  TrendingUp,
  ArrowRight,
  Award,
  DollarSign,
  Briefcase
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell
} from "recharts";

// ─── MOCK DATA FOR MONTHLY & QUARTERLY REPORTS ──────────────────────────────

// 1. Hành chính (Administration)
const ADMIN_MONTHLY_DATA = [
  { name: "Tuần 1", "Chi phí hành chính": 12000000, "VPP cấp phát": 3200000 },
  { name: "Tuần 2", "Chi phí hành chính": 15000000, "VPP cấp phát": 4500000 },
  { name: "Tuần 3", "Chi phí hành chính": 14200000, "VPP cấp phát": 2800000 },
  { name: "Tuần 4", "Chi phí hành chính": 13000000, "VPP cấp phát": 3500000 }
];
const ADMIN_QUARTERLY_DATA = [
  { name: "Quý 1", "Chi phí hành chính": 145000000, "VPP cấp phát": 38000000 },
  { name: "Quý 2", "Chi phí hành chính": 162000000, "VPP cấp phát": 42000000 },
  { name: "Quý 3", "Chi phí hành chính": 150000000, "VPP cấp phát": 35000000 },
  { name: "Quý 4", "Chi phí hành chính": 175000000, "VPP cấp phát": 48000000 }
];

// 2. Văn thư (Clerical)
const DOC_MONTHLY_DATA = [
  { name: "Tuần 1", "Công văn đến": 35, "Công văn đi": 22 },
  { name: "Tuần 2", "Công văn đến": 42, "Công văn đi": 30 },
  { name: "Tuần 3", "Công văn đến": 28, "Công văn đi": 25 },
  { name: "Tuần 4", "Công văn đến": 38, "Công văn đi": 28 }
];
const DOC_QUARTERLY_DATA = [
  { name: "Quý 1", "Công văn đến": 450, "Công văn đi": 310 },
  { name: "Quý 2", "Công văn đến": 520, "Công văn đi": 380 },
  { name: "Quý 3", "Công văn đến": 480, "Công văn đi": 340 },
  { name: "Quý 4", "Công văn đến": 580, "Công văn đi": 420 }
];

// 3. Tuyển dụng (Recruitment)
const RECRUIT_MONTHLY_DATA = [
  { name: "Tháng 1", "Hồ sơ nhận": 45, "Đạt phỏng vấn": 15, "Nhận việc": 8 },
  { name: "Tháng 2", "Hồ sơ nhận": 60, "Đạt phỏng vấn": 24, "Nhận việc": 12 },
  { name: "Tháng 3", "Hồ sơ nhận": 85, "Đạt phỏng vấn": 35, "Nhận việc": 18 },
  { name: "Tháng 4", "Hồ sơ nhận": 110, "Đạt phỏng vấn": 50, "Nhận việc": 22 },
  { name: "Tháng 5", "Hồ sơ nhận": 95, "Đạt phỏng vấn": 42, "Nhận việc": 19 },
  { name: "Tháng 6", "Hồ sơ nhận": 130, "Đạt phỏng vấn": 65, "Nhận việc": 30 }
];
const RECRUIT_QUARTERLY_DATA = [
  { name: "Quý 1", "Hồ sơ nhận": 190, "Đạt phỏng vấn": 74, "Nhận việc": 38 },
  { name: "Quý 2", "Hồ sơ nhận": 335, "Đạt phỏng vấn": 157, "Nhận việc": 71 },
  { name: "Quý 3", "Hồ sơ nhận": 280, "Đạt phỏng vấn": 122, "Nhận việc": 58 },
  { name: "Quý 4", "Hồ sơ nhận": 410, "Đạt phỏng vấn": 195, "Nhận việc": 92 }
];

// 4. C&B (Payroll & Benefits)
const CB_MONTHLY_DATA = [
  { name: "Tháng 1", "Tổng quỹ lương (tr triệu)": 1100, "Thuế TNCN": 55 },
  { name: "Tháng 2", "Tổng quỹ lương (tr triệu)": 1150, "Thuế TNCN": 58 },
  { name: "Tháng 3", "Tổng quỹ lương (tr triệu)": 1250, "Thuế TNCN": 62 },
  { name: "Tháng 4", "Tổng quỹ lương (tr triệu)": 1200, "Thuế TNCN": 60 },
  { name: "Tháng 5", "Tổng quỹ lương (tr triệu)": 1220, "Thuế TNCN": 61 },
  { name: "Tháng 6", "Tổng quỹ lương (tr triệu)": 1300, "Thuế TNCN": 68 }
];
const CB_QUARTERLY_DATA = [
  { name: "Quý 1", "Tổng quỹ lương (tr triệu)": 3500, "Thuế TNCN": 175 },
  { name: "Quý 2", "Tổng quỹ lương (tr triệu)": 3720, "Thuế TNCN": 181 },
  { name: "Quý 3", "Tổng quỹ lương (tr triệu)": 3650, "Thuế TNCN": 178 },
  { name: "Quý 4", "Tổng quỹ lương (tr triệu)": 4200, "Thuế TNCN": 210 }
];

// 5. Marketing (Employer Branding)
const MKT_MONTHLY_DATA = [
  { name: "Tháng 1", "Tiếp cận Fanpage": 8000, "Lượt ứng tuyển": 45 },
  { name: "Tháng 2", "Tiếp cận Fanpage": 9500, "Lượt ứng tuyển": 60 },
  { name: "Tháng 3", "Tiếp cận Fanpage": 12000, "Lượt ứng tuyển": 85 },
  { name: "Tháng 4", "Tiếp cận Fanpage": 15000, "Lượt ứng tuyển": 110 },
  { name: "Tháng 5", "Tiếp cận Fanpage": 14000, "Lượt ứng tuyển": 95 },
  { name: "Tháng 6", "Tiếp cận Fanpage": 18500, "Lượt ứng tuyển": 130 }
];
const MKT_QUARTERLY_DATA = [
  { name: "Quý 1", "Tiếp cận Fanpage": 29500, "Lượt ứng tuyển": 190 },
  { name: "Quý 2", "Tiếp cận Fanpage": 47500, "Lượt ứng tuyển": 335 },
  { name: "Quý 3", "Tiếp cận Fanpage": 38000, "Lượt ứng tuyển": 280 },
  { name: "Quý 4", "Tiếp cận Fanpage": 55000, "Lượt ứng tuyển": 410 }
];

// Pie Chart data for general view
const PIE_COLORS = ["#005BAC", "#00AEEF", "#6366F1", "#F59E0B", "#22C55E"];

export default function ReportsPage() {
  const [mainTab, setMainTab] = useState<"monthly" | "quarterly">("monthly");
  const [subTab, setSubTab] = useState<"administration" | "document_control" | "recruitment" | "cb" | "marketing">("administration");

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Báo cáo & Phân tích" subtitle="Trung tâm phân tích báo cáo phòng Hành chính Nhân sự Trung Nam E&C" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Main Navigation Tabs */}
          <div className="flex border-b border-slate-200 gap-4 mb-4">
            {[
              { id: "monthly", label: "Báo cáo tháng", icon: Calendar },
              { id: "quarterly", label: "Báo cáo quý", icon: Layers }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = mainTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setMainTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    isActive
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

          {/* Sub Navigation Tabs (Departments) */}
          <div className="flex gap-2.5 p-1 bg-slate-100/80 rounded-xl max-w-fit mb-6">
            {[
              { id: "administration", label: "Hành chính", icon: Building2 },
              { id: "document_control", label: "Văn thư", icon: FileText },
              { id: "recruitment", label: "Tuyển dụng", icon: Users },
              { id: "cb", label: "C&B", icon: Calculator },
              { id: "marketing", label: "Marketing", icon: Megaphone }
            ].map((sub) => {
              const Icon = sub.icon;
              const isActive = subTab === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => setSubTab(sub.id as any)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                  }`}
                >
                  <Icon size={12} />
                  {sub.label}
                </button>
              );
            })}
          </div>

          {/* ─── RENDER CONTENT PANELS ──────────────────────────────────────── */}

          {/* 1. HÀNH CHÍNH (Administration) */}
          {subTab === "administration" && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    title: mainTab === "monthly" ? "Chi phí Hành chính (Tháng)" : "Chi phí Hành chính (Quý)",
                    val: mainTab === "monthly" ? "54,200,000 đ" : "632,000,000 đ",
                    desc: mainTab === "monthly" ? "Giảm 5.2% so với tháng trước" : "Tăng 2.8% so với quý trước"
                  },
                  {
                    title: "Tỷ lệ cấp phát VPP đúng hạn",
                    val: "96.5%",
                    desc: "Đạt mục tiêu SLA cam kết phòng ban"
                  },
                  {
                    title: "Công việc định kỳ hoàn thành",
                    val: mainTab === "monthly" ? "42/45 đầu việc" : "126/130 đầu việc",
                    desc: "Tỷ lệ hoàn thành công việc định kỳ rất cao"
                  }
                ].map((stat, idx) => (
                  <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm flex flex-col justify-between h-32">
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{stat.title}</p>
                      <p className="font-heading font-bold text-xl text-[#005BAC] mt-1.5">{stat.val}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold">{stat.desc}</p>
                  </div>
                ))}
              </div>

              {/* Chart & Detail Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                  <h3 className="font-heading font-bold text-slate-800 text-xs mb-5">
                    {mainTab === "monthly" ? "Thống kê chi phí Hành chính theo Tuần" : "Thống kê chi phí Hành chính theo Quý"}
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mainTab === "monthly" ? ADMIN_MONTHLY_DATA : ADMIN_QUARTERLY_DATA}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value) => `${Number(value).toLocaleString("vi-VN")} đ`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="Chi phí hành chính" fill="#005BAC" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="VPP cấp phát" fill="#00AEEF" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm">
                  <h3 className="font-heading font-bold text-slate-800 text-xs mb-4">Chi tiết phân bổ chi tiêu</h3>
                  <div className="space-y-4 font-semibold text-slate-600 text-[11px]">
                    {[
                      { label: "Văn phòng phẩm", pct: "32%", amount: "17,344,000 đ" },
                      { label: "Nước uống, trà, cafe tiếp khách", pct: "18%", amount: "9,756,000 đ" },
                      { label: "Chi phí chuyển phát, ship hàng", pct: "15%", amount: "8,130,000 đ" },
                      { label: "Sửa chữa trang thiết bị", pct: "20%", amount: "10,840,000 đ" },
                      { label: "Khác", pct: "15%", amount: "8,130,000 đ" }
                    ].map((item, idx) => (
                      <div key={idx} className="flex justify-between border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                        <span className="text-slate-500">{item.label}</span>
                        <div className="flex gap-4">
                          <span className="text-slate-400">{item.pct}</span>
                          <span className="text-slate-800 font-bold font-mono">{item.amount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. VĂN THƯ (Clerical/Document Control) */}
          {subTab === "document_control" && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    title: mainTab === "monthly" ? "Tổng công văn xử lý (Tháng)" : "Tổng công văn xử lý (Quý)",
                    val: mainTab === "monthly" ? "248 văn bản" : "3,130 văn bản",
                    desc: "Tất cả công văn đều được phân loại đúng"
                  },
                  {
                    title: "Tỷ lệ số hóa văn bản",
                    val: "100%",
                    desc: "Tải bản Scan PDF lên Supabase đầy đủ"
                  },
                  {
                    title: "Thời gian xử lý trung bình",
                    val: "1.2 giờ",
                    desc: "Kể từ lúc nhận đến khi hoàn thành phân phối"
                  }
                ].map((stat, idx) => (
                  <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm flex flex-col justify-between h-32">
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{stat.title}</p>
                      <p className="font-heading font-bold text-xl text-[#00AEEF] mt-1.5">{stat.val}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold">{stat.desc}</p>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h3 className="font-heading font-bold text-slate-800 text-xs mb-5">
                  {mainTab === "monthly" ? "Tần suất giao nhận Công văn theo Tuần" : "Tần suất giao nhận Công văn theo Quý"}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mainTab === "monthly" ? DOC_MONTHLY_DATA : DOC_QUARTERLY_DATA}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Công văn đến" stroke="#6366F1" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Công văn đi" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* 3. TUYỂN DỤNG (Recruitment) */}
          {subTab === "recruitment" && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    title: mainTab === "monthly" ? "Số hồ sơ nhận mới" : "Số hồ sơ nhận mới (Quý)",
                    val: mainTab === "monthly" ? "130 hồ sơ" : "1,215 hồ sơ",
                    desc: "Tăng trưởng CV đầu vào tốt"
                  },
                  {
                    title: "Tỷ lệ phỏng vấn đạt",
                    val: "62.5%",
                    desc: "Duy trì chất lượng ứng viên lọc đầu vào"
                  },
                  {
                    title: mainTab === "monthly" ? "Nhân viên mới nhận việc" : "Nhân viên mới nhận việc (Quý)",
                    val: mainTab === "monthly" ? "30 nhân sự" : "259 nhân sự",
                    desc: "Đạt 95% chỉ tiêu tuyển dụng các phòng"
                  }
                ].map((stat, idx) => (
                  <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm flex flex-col justify-between h-32">
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{stat.title}</p>
                      <p className="font-heading font-bold text-xl text-emerald-600 mt-1.5">{stat.val}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold">{stat.desc}</p>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                  <h3 className="font-heading font-bold text-slate-800 text-xs mb-5">
                    {mainTab === "monthly" ? "Thống kê Phễu Tuyển dụng (6 tháng qua)" : "Thống kê Phễu Tuyển dụng theo Quý"}
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mainTab === "monthly" ? RECRUIT_MONTHLY_DATA : RECRUIT_QUARTERLY_DATA}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="Hồ sơ nhận" stroke="#64748B" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Đạt phỏng vấn" stroke="#00AEEF" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="Nhận việc" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm flex flex-col justify-between h-[348px]">
                  <h3 className="font-heading font-bold text-slate-800 text-xs mb-4">Các vị trí Hot đang tuyển</h3>
                  <div className="space-y-3.5 flex-1 font-semibold text-slate-600 text-[11px]">
                    {[
                      { label: "Kỹ sư Giám sát Hiện trường", val: "15 chỉ tiêu", desc: "Dự án điện gió miền Tây" },
                      { label: "Chuyên viên Quản lý Chi phí (QS)", val: "5 chỉ tiêu", desc: "Văn phòng TPHCM" },
                      { label: "Trưởng phòng Đấu thầu", val: "1 chỉ tiêu", desc: "Văn phòng TPHCM" },
                      { label: "Lập trình viên ERP", val: "3 chỉ tiêu", desc: "Trung tâm IT" }
                    ].map((stat, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between">
                        <div>
                          <p className="text-slate-700 text-[10px] font-bold">{stat.label}</p>
                          <p className="text-slate-400 text-[9px] font-semibold mt-0.5">{stat.desc}</p>
                        </div>
                        <span className="font-heading font-extrabold text-blue-600 text-[11px] whitespace-nowrap">{stat.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. C&B (Payroll & Benefits) */}
          {subTab === "cb" && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    title: mainTab === "monthly" ? "Tổng Quỹ lương chi trả (Tháng)" : "Tổng Quỹ lương chi trả (Quý)",
                    val: mainTab === "monthly" ? "1.3 tỷ đ" : "15.1 tỷ đ",
                    desc: "Đã hoàn thành chi trả lương đúng hạn"
                  },
                  {
                    title: "Tỷ lệ hoàn thành Chấm công",
                    val: "100%",
                    desc: "Không phát sinh sai sót dữ liệu vân tay"
                  },
                  {
                    title: "Giải quyết khiếu nại lương",
                    val: "0 ca khiếu nại",
                    desc: "Tối ưu hóa các thắc mắc về phúc lợi"
                  }
                ].map((stat, idx) => (
                  <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm flex flex-col justify-between h-32">
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{stat.title}</p>
                      <p className="font-heading font-bold text-xl text-indigo-600 mt-1.5">{stat.val}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold">{stat.desc}</p>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h3 className="font-heading font-bold text-slate-800 text-xs mb-5">
                  {mainTab === "monthly" ? "Quỹ lương và Thuế TNCN phát sinh qua các tháng" : "Quỹ lương và Thuế TNCN phát sinh theo Quý"}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mainTab === "monthly" ? CB_MONTHLY_DATA : CB_QUARTERLY_DATA}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => `${value} triệu đ`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Tổng quỹ lương (tr triệu)" fill="#6366F1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Thuế TNCN" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* 5. MARKETING (Employer Branding) */}
          {subTab === "marketing" && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    title: mainTab === "monthly" ? "Lượt tiếp cận mạng tuyển dụng" : "Lượt tiếp cận mạng tuyển dụng (Quý)",
                    val: mainTab === "monthly" ? "18,500 lượt" : "170,000 lượt",
                    desc: "Tăng trưởng 15% tương tác thương hiệu"
                  },
                  {
                    title: "Ngân sách Ads chi tiêu",
                    val: mainTab === "monthly" ? "15,000,000 đ" : "48,500,000 đ",
                    desc: "Sử dụng hiệu quả ngân sách được duyệt"
                  },
                  {
                    title: "Số lead ứng tuyển chất lượng",
                    val: mainTab === "monthly" ? "130 lead" : "1,215 lead",
                    desc: "Lượt gửi thông tin CV trực tuyến"
                  }
                ].map((stat, idx) => (
                  <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm flex flex-col justify-between h-32">
                    <div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{stat.title}</p>
                      <p className="font-heading font-bold text-xl text-amber-600 mt-1.5">{stat.val}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-semibold">{stat.desc}</p>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h3 className="font-heading font-bold text-slate-800 text-xs mb-5">
                  {mainTab === "monthly" ? "Biến động truyền thông và Lượt ứng tuyển theo Tháng" : "Biến động truyền thông và Lượt ứng tuyển theo Quý"}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mainTab === "monthly" ? MKT_MONTHLY_DATA : MKT_QUARTERLY_DATA}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line yAxisId="left" type="monotone" dataKey="Tiếp cận Fanpage" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line yAxisId="right" type="monotone" dataKey="Lượt ứng tuyển" stroke="#22C55E" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

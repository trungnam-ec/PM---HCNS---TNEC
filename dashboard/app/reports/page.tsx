"use client";

import { useState, useEffect } from "react";
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
  Briefcase,
  Clock,
  Download,
  Loader2,
  Settings,
  Key,
  Brain
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
  PieChart, Pie, Cell
} from "recharts";

// ─── MOCK DATA FOR WEEKLY, MONTHLY & QUARTERLY REPORTS ──────────────────────

// 0. Weekly Mock Data for all departments
const ADMIN_WEEKLY_DATA = [
  { name: "Thứ 2", "Chi phí hành chính": 1200000, "VPP cấp phát": 300000 },
  { name: "Thứ 3", "Chi phí hành chính": 1500000, "VPP cấp phát": 450000 },
  { name: "Thứ 4", "Chi phí hành chính": 800000, "VPP cấp phát": 200000 },
  { name: "Thứ 5", "Chi phí hành chính": 2100000, "VPP cấp phát": 600000 },
  { name: "Thứ 6", "Chi phí hành chính": 1700000, "VPP cấp phát": 400000 },
  { name: "Thứ 7", "Chi phí hành chính": 900000, "VPP cấp phát": 150000 }
];

const DOC_WEEKLY_DATA = [
  { name: "Thứ 2", "Công văn đến": 5, "Công văn đi": 3 },
  { name: "Thứ 3", "Công văn đến": 8, "Công văn đi": 4 },
  { name: "Thứ 4", "Công văn đến": 6, "Công văn đi": 2 },
  { name: "Thứ 5", "Công văn đến": 7, "Công văn đi": 5 },
  { name: "Thứ 6", "Công văn đến": 9, "Công văn đi": 6 },
  { name: "Thứ 7", "Công văn đến": 3, "Công văn đi": 2 }
];

const RECRUIT_WEEKLY_DATA = [
  { name: "Tuần 1", "Hồ sơ nhận": 25, "Đạt phỏng vấn": 12, "Nhận việc": 5 },
  { name: "Tuần 2", "Hồ sơ nhận": 32, "Đạt phỏng vấn": 18, "Nhận việc": 8 },
  { name: "Tuần 3", "Hồ sơ nhận": 28, "Đạt phỏng vấn": 14, "Nhận việc": 6 },
  { name: "Tuần 4", "Hồ sơ nhận": 45, "Đạt phỏng vấn": 21, "Nhận việc": 11 }
];

const RECRUIT_DAILY_DATA = [
  { name: "Thứ 2", "Hồ sơ nhận": 5, "Đạt phỏng vấn": 2, "Nhận việc": 1 },
  { name: "Thứ 3", "Hồ sơ nhận": 8, "Đạt phỏng vấn": 4, "Nhận việc": 2 },
  { name: "Thứ 4", "Hồ sơ nhận": 6, "Đạt phỏng vấn": 3, "Nhận việc": 1 },
  { name: "Thứ 5", "Hồ sơ nhận": 7, "Đạt phỏng vấn": 4, "Nhận việc": 2 },
  { name: "Thứ 6", "Hồ sơ nhận": 9, "Đạt phỏng vấn": 5, "Nhận việc": 3 },
  { name: "Thứ 7", "Hồ sơ nhận": 6, "Đạt phỏng vấn": 2, "Nhận việc": 1 },
  { name: "Chủ Nhật", "Hồ sơ nhận": 4, "Đạt phỏng vấn": 1, "Nhận việc": 1 }
];

const RECRUIT_2MONTHS_DATA = [
  { name: "Tuần 1", "Hồ sơ nhận": 25, "Đạt phỏng vấn": 12, "Nhận việc": 5 },
  { name: "Tuần 2", "Hồ sơ nhận": 32, "Đạt phỏng vấn": 18, "Nhận việc": 8 },
  { name: "Tuần 3", "Hồ sơ nhận": 28, "Đạt phỏng vấn": 14, "Nhận việc": 6 },
  { name: "Tuần 4", "Hồ sơ nhận": 45, "Đạt phỏng vấn": 21, "Nhận việc": 11 },
  { name: "Tuần 5", "Hồ sơ nhận": 30, "Đạt phỏng vấn": 15, "Nhận việc": 7 },
  { name: "Tuần 6", "Hồ sơ nhận": 38, "Đạt phỏng vấn": 20, "Nhận việc": 9 },
  { name: "Tuần 7", "Hồ sơ nhận": 35, "Đạt phỏng vấn": 17, "Nhận việc": 8 },
  { name: "Tuần 8", "Hồ sơ nhận": 52, "Đạt phỏng vấn": 28, "Nhận việc": 14 }
];

const CB_WEEKLY_DATA = [
  { name: "Tuần 1", "Tạm ứng lương": 45, "Chi bảo hiểm": 12 },
  { name: "Tuần 2", "Tạm ứng lương": 35, "Chi bảo hiểm": 8 },
  { name: "Tuần 3", "Tạm ứng lương": 50, "Chi bảo hiểm": 15 },
  { name: "Tuần 4", "Tạm ứng lương": 40, "Chi bảo hiểm": 10 }
];

const MKT_WEEKLY_DATA = [
  { name: "Tuần 1", "Tiếp cận Fanpage": 1800, "Lượt ứng tuyển": 12 },
  { name: "Tuần 2", "Tiếp cận Fanpage": 2200, "Lượt ứng tuyển": 18 },
  { name: "Tuần 3", "Tiếp cận Fanpage": 2000, "Lượt ứng tuyển": 15 },
  { name: "Tuần 4", "Tiếp cận Fanpage": 3500, "Lượt ứng tuyển": 25 }
];

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
  const [mainTab, setMainTab] = useState<"weekly" | "monthly" | "quarterly">("weekly");
  const [subTab, setSubTab] = useState<"administration" | "document_control" | "recruitment" | "cb" | "marketing">("administration");

  // States for Recruitment Redesign
  const [recruitmentTimeRange, setRecruitmentTimeRange] = useState<"week" | "1month" | "2months" | "custom">("week");
  const [customStartDate, setCustomStartDate] = useState("2026-06-01");
  const [customEndDate, setCustomEndDate] = useState("2026-06-08");
  const [exporting, setExporting] = useState(false);

  // States for AI Brain Settings (for recruitment report generator)
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key") || "");
      setModel(localStorage.getItem("openai_model") || "gpt-4o");
    }
  }, []);

  const handleSaveSettings = (e: any) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key", apiKey.trim());
      localStorage.setItem("openai_model", model);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    }
  };

  const getCustomRecruitData = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const data = [];
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const daysCount = Math.min(15, Math.max(1, diffDays));
    
    for (let i = 0; i < daysCount; i++) {
      const curr = new Date(start);
      curr.setDate(start.getDate() + i);
      const dayStr = `${String(curr.getDate()).padStart(2, '0')}/${String(curr.getMonth() + 1).padStart(2, '0')}`;
      
      const seed = curr.getDate() + curr.getMonth();
      const hs = (seed % 10) + 5;
      const pv = Math.round(hs * 0.5);
      const nv = Math.round(pv * 0.4) || 1;
      
      data.push({
        name: dayStr,
        "Hồ sơ nhận": hs,
        "Đạt phỏng vấn": pv,
        "Nhận việc": nv
      });
    }
    return data;
  };

  const getRecruitChartData = () => {
    if (recruitmentTimeRange === "week") {
      return RECRUIT_DAILY_DATA;
    } else if (recruitmentTimeRange === "1month") {
      return RECRUIT_WEEKLY_DATA;
    } else if (recruitmentTimeRange === "2months") {
      return RECRUIT_2MONTHS_DATA;
    } else {
      return getCustomRecruitData(customStartDate, customEndDate);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const type = recruitmentTimeRange === "week" ? "weekly" : "monthly";
      const keyParam = apiKey ? `&apiKey=${encodeURIComponent(apiKey.trim())}` : "";
      const modelParam = model ? `&model=${encodeURIComponent(model)}` : "";
      const res = await fetch(`/api/export-recruitment-report?type=${type}${keyParam}${modelParam}`);
      if (!res.ok) throw new Error("Failed to export report");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = type === "weekly" ? "Bao_Cao_Tuyen_Dung_Tuan.xlsx" : "Bao_Cao_Tuyen_Dung_Thang.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Đã xảy ra lỗi khi xuất báo cáo.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Báo cáo & Phân tích" subtitle="Trung tâm phân tích báo cáo phòng Hành chính Nhân sự Trung Nam E&C" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Main Navigation Tabs & AI Settings Button */}
          <div className="flex items-center justify-between border-b border-slate-200 mb-4">
            <div className="flex gap-4">
              {[
                { id: "weekly", label: "Báo cáo tuần", icon: Clock },
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

            {/* AI Settings Trigger Button */}
            <button
              type="button"
              onClick={() => setShowAiSettings(!showAiSettings)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all cursor-pointer shadow-sm text-xs font-bold ${
                showAiSettings
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : "bg-white border-slate-200/80 text-slate-600 hover:text-slate-800 hover:bg-slate-50"
              }`}
              title="Cấu hình Bộ não AI"
            >
              <Brain size={14} className={showAiSettings ? "animate-pulse text-blue-600" : "text-slate-500"} />
              <span>Cấu hình Bộ não AI</span>
            </button>
          </div>

          {/* Collapsible AI Brain Settings Panel */}
          {showAiSettings && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-premium mb-6 animate-in fade-in duration-200 max-w-4xl">
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5 mb-3">
                  <Brain size={16} className="text-blue-600 animate-pulse" />
                  <h4 className="text-xs font-bold text-slate-800">Cấu hình Bộ não AI (Dành cho việc phân tích và xuất báo cáo)</h4>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5 font-semibold text-slate-600">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">OpenAI API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Nhập sk-proj-..."
                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 font-semibold text-slate-600">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">OpenAI Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer text-slate-600"
                    >
                      <option value="gpt-4o">gpt-4o (Độ chính xác cao nhất)</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (Tốc độ nhanh, tiết kiệm)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-[9px] text-slate-400 font-semibold">
                    Cấu hình này được lưu trong bộ nhớ trình duyệt (localStorage) để bảo mật và sử dụng khi bạn xuất báo cáo.
                  </p>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer font-bold"
                  >
                    {settingsSaved ? "✓ Đã lưu thành công" : "Lưu cấu hình"}
                  </button>
                </div>
              </form>
            </div>
          )}

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
                    title: mainTab === "weekly" ? "Chi phí Hành chính (Tuần)" : mainTab === "monthly" ? "Chi phí Hành chính (Tháng)" : "Chi phí Hành chính (Quý)",
                    val: mainTab === "weekly" ? "8,200,000 đ" : mainTab === "monthly" ? "54,200,000 đ" : "632,000,000 đ",
                    desc: mainTab === "weekly" ? "Chi tiêu trong định mức tuần" : mainTab === "monthly" ? "Giảm 5.2% so với tháng trước" : "Tăng 2.8% so với quý trước"
                  },
                  {
                    title: "Tỷ lệ cấp phát VPP đúng hạn",
                    val: "96.5%",
                    desc: "Đạt mục tiêu SLA cam kết phòng ban"
                  },
                  {
                    title: "Công việc định kỳ hoàn thành",
                    val: mainTab === "weekly" ? "10/11 đầu việc" : mainTab === "monthly" ? "42/45 đầu việc" : "126/130 đầu việc",
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
                    {mainTab === "weekly"
                      ? "Thống kê chi phí Hành chính theo Ngày (Tuần này)"
                      : mainTab === "monthly"
                      ? "Thống kê chi phí Hành chính theo Tuần"
                      : "Thống kê chi phí Hành chính theo Quý"}
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={
                        mainTab === "weekly"
                          ? ADMIN_WEEKLY_DATA
                          : mainTab === "monthly"
                          ? ADMIN_MONTHLY_DATA
                          : ADMIN_QUARTERLY_DATA
                      }>
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
                    title: mainTab === "weekly" ? "Tổng công văn xử lý (Tuần)" : mainTab === "monthly" ? "Tổng công văn xử lý (Tháng)" : "Tổng công văn xử lý (Quý)",
                    val: mainTab === "weekly" ? "58 văn bản" : mainTab === "monthly" ? "248 văn bản" : "3,130 văn bản",
                    desc: "Tất cả công văn đều được phân loại đúng"
                  },
                  {
                    title: "Tỷ lệ số hóa văn bản",
                    val: "100%",
                    desc: "Tải bản Scan PDF lên Supabase đầy đủ"
                  },
                  {
                    title: "Thời gian xử lý trung bình",
                    val: mainTab === "weekly" ? "0.8 giờ" : "1.2 giờ",
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
                  {mainTab === "weekly"
                    ? "Tần suất giao nhận Công văn theo Ngày (Tuần này)"
                    : mainTab === "monthly"
                    ? "Tần suất giao nhận Công văn theo Tuần"
                    : "Tần suất giao nhận Công văn theo Quý"}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={
                      mainTab === "weekly"
                        ? DOC_WEEKLY_DATA
                        : mainTab === "monthly"
                        ? DOC_MONTHLY_DATA
                        : DOC_QUARTERLY_DATA
                    }>
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
                    title: mainTab === "weekly" ? "Số hồ sơ nhận mới (Tuần)" : mainTab === "monthly" ? "Số hồ sơ nhận mới" : "Số hồ sơ nhận mới (Quý)",
                    val: mainTab === "weekly" ? "45 hồ sơ" : mainTab === "monthly" ? "130 hồ sơ" : "1,215 hồ sơ",
                    desc: "Tăng trưởng CV đầu vào tốt"
                  },
                  {
                    title: "Tỷ lệ phỏng vấn đạt",
                    val: mainTab === "weekly" ? "46.7%" : "62.5%",
                    desc: "Duy trì chất lượng ứng viên lọc đầu vào"
                  },
                  {
                    title: mainTab === "weekly" ? "Nhân viên mới nhận việc (Tuần)" : mainTab === "monthly" ? "Nhân viên mới nhận việc" : "Nhân viên mới nhận việc (Quý)",
                    val: mainTab === "weekly" ? "11 nhân sự" : mainTab === "monthly" ? "30 nhân sự" : "259 nhân sự",
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
                <div className="lg:col-span-2 glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium flex flex-col justify-between">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="font-heading font-extrabold text-slate-800 text-sm">
                        Thống kê Phễu Tuyển dụng
                      </h3>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        Biểu đồ phễu tuyển dụng hiển thị chi tiết số lượng hồ sơ nhận, đạt phỏng vấn và nhận việc.
                      </p>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Date Range Selector Dropdown */}
                      <div className="relative">
                        <select
                          value={recruitmentTimeRange}
                          onChange={(e) => setRecruitmentTimeRange(e.target.value as any)}
                          className="appearance-none bg-slate-50 border border-slate-200/60 hover:bg-slate-100/60 text-slate-700 px-4 py-2 pr-8 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm transition-all"
                        >
                          <option value="week">📅 Tuần này</option>
                          <option value="1month">📅 1 Tháng</option>
                          <option value="2months">📅 2 Tháng</option>
                          <option value="custom">📅 Tự chọn lịch</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                          <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                          </svg>
                        </div>
                      </div>

                      {/* Custom Date Inputs */}
                      {recruitmentTimeRange === "custom" && (
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 px-3 py-1 rounded-xl shadow-sm">
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="bg-transparent border-0 text-slate-700 text-[10px] font-bold focus:outline-none focus:ring-0 cursor-pointer"
                          />
                          <span className="text-slate-400 text-[10px] font-bold">đến</span>
                          <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="bg-transparent border-0 text-slate-700 text-[10px] font-bold focus:outline-none focus:ring-0 cursor-pointer"
                          />
                        </div>
                      )}

                      {/* Export Button */}
                      <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 cursor-pointer active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {exporting ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>Đang xuất...</span>
                          </>
                        ) : (
                          <>
                            <Download size={12} />
                            <span>Xuất báo cáo</span>
                          </>
                        )}
                      </button>

                      {/* AI Settings Toggle Button */}
                      <button
                        type="button"
                        onClick={() => setShowAiSettings(!showAiSettings)}
                        className={`flex items-center justify-center p-2.5 rounded-xl border transition-all cursor-pointer shadow-sm ${
                          showAiSettings
                            ? "bg-blue-50 border-blue-200 text-blue-700"
                            : "bg-slate-50 border-slate-200/60 text-slate-500 hover:text-slate-700 hover:bg-slate-100/60"
                        }`}
                        title="Cấu hình Bộ não AI"
                      >
                        <Brain size={14} className={showAiSettings ? "animate-pulse text-blue-600" : ""} />
                      </button>
                    </div>
                  </div>

                  <div className="h-72 w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getRecruitChartData()} margin={{ top: 15, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: "bold" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: "#94A3B8", fontWeight: "bold" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '11px', fontWeight: 'bold' }} />
                        <Legend wrapperStyle={{ fontSize: 10, fontWeight: "bold", paddingTop: 10 }} />
                        <Line
                          type="monotone"
                          dataKey="Hồ sơ nhận"
                          stroke="#64748B"
                          strokeWidth={3}
                          dot={{ r: 4, stroke: '#FFFFFF', strokeWidth: 1.5 }}
                          activeDot={{ r: 6 }}
                          label={{ fill: '#475569', fontSize: 9, dy: -10, fontWeight: 'bold' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="Đạt phỏng vấn"
                          stroke="#00AEEF"
                          strokeWidth={3}
                          dot={{ r: 4, stroke: '#FFFFFF', strokeWidth: 1.5 }}
                          activeDot={{ r: 6 }}
                          label={{ fill: '#005BAC', fontSize: 9, dy: -10, fontWeight: 'bold' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="Nhận việc"
                          stroke="#22C55E"
                          strokeWidth={3}
                          dot={{ r: 4, stroke: '#FFFFFF', strokeWidth: 1.5 }}
                          activeDot={{ r: 6 }}
                          label={{ fill: '#15803d', fontSize: 9, dy: -10, fontWeight: 'bold' }}
                        />
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
                    title: mainTab === "weekly" ? "Tổng Tạm ứng & Bảo hiểm (Tuần)" : mainTab === "monthly" ? "Tổng Quỹ lương chi trả (Tháng)" : "Tổng Quỹ lương chi trả (Quý)",
                    val: mainTab === "weekly" ? "50 triệu đ" : mainTab === "monthly" ? "1.3 tỷ đ" : "15.1 tỷ đ",
                    desc: mainTab === "weekly" ? "Đã duyệt và chi trả tạm ứng tuần" : "Đã hoàn thành chi trả lương đúng hạn"
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
                  {mainTab === "weekly"
                    ? "Tạm ứng và Bảo hiểm giải ngân theo Tuần (Tháng này)"
                    : mainTab === "monthly"
                    ? "Quỹ lương và Thuế TNCN phát sinh qua các tháng"
                    : "Quỹ lương và Thuế TNCN phát sinh theo Quý"}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={
                      mainTab === "weekly"
                        ? CB_WEEKLY_DATA
                        : mainTab === "monthly"
                        ? CB_MONTHLY_DATA
                        : CB_QUARTERLY_DATA
                    }>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(value) => `${value} triệu đ`} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey={mainTab === "weekly" ? "Tạm ứng lương" : "Tổng quỹ lương (tr triệu)"}
                        fill="#6366F1"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey={mainTab === "weekly" ? "Chi bảo hiểm" : "Thuế TNCN"}
                        fill="#F59E0B"
                        radius={[4, 4, 0, 0]}
                      />
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
                    title: mainTab === "weekly" ? "Lượt tiếp cận mạng tuyển dụng (Tuần)" : mainTab === "monthly" ? "Lượt tiếp cận mạng tuyển dụng" : "Lượt tiếp cận mạng tuyển dụng (Quý)",
                    val: mainTab === "weekly" ? "3,500 lượt" : mainTab === "monthly" ? "18,500 lượt" : "170,000 lượt",
                    desc: "Tăng trưởng 15% tương tác thương hiệu"
                  },
                  {
                    title: "Ngân sách Ads chi tiêu",
                    val: mainTab === "weekly" ? "3,200,000 đ" : mainTab === "monthly" ? "15,000,000 đ" : "48,500,000 đ",
                    desc: "Sử dụng hiệu quả ngân sách được duyệt"
                  },
                  {
                    title: "Số lead ứng tuyển chất lượng",
                    val: mainTab === "weekly" ? "25 lead" : mainTab === "monthly" ? "130 lead" : "1,215 lead",
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
                  {mainTab === "weekly"
                    ? "Biến động truyền thông và Lượt ứng tuyển theo Tuần (Tháng này)"
                    : mainTab === "monthly"
                    ? "Biến động truyền thông và Lượt ứng tuyển theo Tháng"
                    : "Biến động truyền thông và Lượt ứng tuyển theo Quý"}
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={
                      mainTab === "weekly"
                        ? MKT_WEEKLY_DATA
                        : mainTab === "monthly"
                        ? MKT_MONTHLY_DATA
                        : MKT_QUARTERLY_DATA
                    }>
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

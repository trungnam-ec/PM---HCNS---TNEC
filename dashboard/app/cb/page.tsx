"use client";

import { useState, useEffect, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  User,
  Clock,
  DollarSign,
  Award,
  Building2,
  Phone,
  Mail,
  UserCheck,
  Calendar,
  ChevronRight,
  Plus,
  Search,
  CheckCircle,
  FileText,
  Briefcase,
  Cake,
  Heart,
  TrendingUp,
  UserMinus,
  Network,
  Download,
  AlertCircle,
  Shield,
  Loader2,
  Gift,
  AlertTriangle,
  RefreshCw,
  Info,
  X
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line
} from "recharts";

// --- TYPES ---
interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: string;
  avatar: string;
  kpi: number;
  completed_tasks: number;
  pending_tasks: number;
  created_at: string;
}

interface Contract {
  id: string;
  contract_number: string;
  type: string;
  expiration_date: string;
  effective_date: string;
  status: string;
}

// --- MOCK DATA FOR C&B SUBSECTIONS ---
const MOCK_SALARY_INFO = [
  { id: "1", name: "Phạm Thành Lộc", base: 18000000, insurance: 5000000, phone: 300000, lunch: 730000, gas: 500000, total: 19530000 },
  { id: "2", name: "Nguyễn Bích Như Quỳnh", base: 15000000, insurance: 5000000, phone: 300000, lunch: 730000, gas: 500000, total: 16530000 },
  { id: "3", name: "Nguyễn Ngọc Thanh Hằng", base: 14000000, insurance: 4500000, phone: 200000, lunch: 730000, gas: 500000, total: 15430000 },
  { id: "4", name: "Trần Nghiệp Quang", base: 22000000, insurance: 6000000, phone: 500000, lunch: 730000, gas: 1000000, total: 24230000 }
];

const MOCK_PROMOTIONS = [
  { name: "Phạm Thành Lộc", oldRole: "Nhân viên Marketing", newRole: "Trưởng nhóm Marketing", oldDept: "Phòng HCNS", newDept: "Phòng HCNS", date: "2026-01-01", type: "Thăng chức" },
  { name: "Trần Nghiệp Quang", oldRole: "Kỹ sư giám sát", newRole: "Chỉ huy phó", oldDept: "Phòng Dự án", newDept: "Dự án Vàm Lẽo", date: "2026-03-15", type: "Bổ nhiệm" },
  { name: "Nguyễn Ngọc Thanh Hằng", oldRole: "Nhân viên C&B bậc 1", newRole: "Nhân viên C&B bậc 2", oldDept: "Phòng HCNS", newDept: "Phòng HCNS", date: "2026-05-01", type: "Tăng bậc" }
];

const MOCK_TERMINATIONS = [
  { name: "Trần Văn A", dept: "Phòng Kỹ thuật", date: "2026-05-31", reason: "Tìm kiếm thử thách mới", status: "Đã bàn giao", allowance: 12000000 },
  { name: "Lê Thị B", dept: "Phòng Kế toán", date: "2026-06-15", reason: "Đi du học nước ngoài", status: "Đang bàn giao (80%)", allowance: 0 }
];

const MOCK_CONCURRENTS = [
  { name: "Phạm Thành Lộc", primary: "Trưởng nhóm Marketing", concurrent: "Quản trị truyền thông nội bộ", dept: "Phòng HCNS", allowance: 2000000, date: "2026-02-01" },
  { name: "Trần Nghiệp Quang", primary: "Chỉ huy phó Vàm Lẽo", concurrent: "Giám sát ATLĐ dự án Vàm Lẽo", dept: "Khối Dự án", allowance: 3000000, date: "2026-04-01" }
];

const MOCK_ATTENDANCE_LOGS = [
  { date: "2026-06-09", name: "Phạm Thành Lộc", checkin: "07:55", checkout: "17:05", hours: 8, status: "Đúng giờ" },
  { date: "2026-06-09", name: "Nguyễn Bích Như Quỳnh", checkin: "08:02", checkout: "17:15", hours: 8, status: "Muộn (2')" },
  { date: "2026-06-09", name: "Nguyễn Ngọc Thanh Hằng", checkin: "07:45", checkout: "17:00", hours: 8, status: "Đúng giờ" },
  { date: "2026-06-09", name: "Trần Nghiệp Quang", checkin: "08:15", checkout: "17:30", hours: 8, status: "Muộn (15')" }
];

const MOCK_EXPLANATIONS = [
  { date: "2026-06-08", name: "Phạm Thành Lộc", reason: "Quên quét vân tay lúc về", propose: "Checkout 17:00", status: "Chờ duyệt" },
  { date: "2026-06-05", name: "Trần Nghiệp Quang", reason: "Đi gặp đối tác trực tiếp tại công trường", propose: "Cả ngày công tác", status: "Đã duyệt" }
];

const MOCK_LEAVES = [
  { name: "Phạm Thành Lộc", type: "Phép năm", from: "2026-06-12", to: "2026-06-12", days: 1, reason: "Giải quyết việc gia đình", status: "Đã duyệt" },
  { name: "Nguyễn Bích Như Quỳnh", type: "Phép năm", from: "2026-06-20", to: "2026-06-22", days: 3, reason: "Nghỉ mát hè cùng gia đình", status: "Chờ duyệt" }
];

const MOCK_TRAVELS = [
  { name: "Trần Nghiệp Quang", dest: "Dự án Cà Ná", from: "2026-06-10", to: "2026-06-12", purpose: "Kiểm tra kỹ thuật ATLĐ", allowance: 1500000, status: "Đã duyệt" }
];

const MOCK_REGIMES = [
  { name: "Nguyễn Thị Hoa", type: "Nghỉ thai sản (6 tháng)", from: "2026-03-01", to: "2026-09-01", insurance_claim: "Hồ sơ đã gửi BHXH", status: "Đang nghỉ" },
  { name: "Lê Minh Tuấn", type: "Ốm đau hưởng BHXH (3 ngày)", from: "2026-06-01", to: "2026-06-03", insurance_claim: "Chờ duyệt chi trả", status: "Đã đi làm lại" }
];

const MOCK_ALLOWANCES = [
  { name: "Cơm trưa văn phòng", standard: "730.000 đ/tháng", target: "Toàn bộ nhân viên chính thức", activeCount: 145 },
  { name: "Xăng xe di chuyển", standard: "500.000 đ - 1.500.000 đ/tháng", target: "Kỹ sư công trường và cấp quản lý", activeCount: 54 },
  { name: "Điện thoại liên lạc", standard: "200.000 đ - 500.000 đ/tháng", target: "Cấp chỉ huy và Nhân viên kinh doanh", activeCount: 32 }
];

const MOCK_BHXH_LOGS = [
  { name: "Phạm Thành Lộc", code: "0123456789", base: 18000000, SI: 1440000, HI: 270000, UI: 180000, company_total: 3870000, booklet: "Công ty giữ" },
  { name: "Nguyễn Bích Như Quỳnh", code: "0123456790", base: 15000000, SI: 1200000, HI: 225000, UI: 150000, company_total: 3225000, booklet: "Công ty giữ" },
  { name: "Nguyễn Ngọc Thanh Hằng", code: "0123456791", base: 14000000, SI: 1120000, HI: 210000, UI: 140000, company_total: 3010000, booklet: "Công ty giữ" },
  { name: "Trần Nghiệp Quang", code: "0123456792", base: 22000000, SI: 1760000, HI: 330000, UI: 220000, company_total: 4730000, booklet: "Công ty giữ" }
];

const MOCK_BIRTHDAYS = [
  { name: "Nguyễn Bích Như Quỳnh", dob: "1996-06-15", age: 30, dept: "Phòng HCNS", gift: "Hộp quà & 500.000đ", status: "Đã chuẩn bị" },
  { name: "Trần Nghiệp Quang", dob: "1992-06-28", age: 34, dept: "Khối Dự án", gift: "Hộp quà & 500.000đ", status: "Chờ gửi" }
];

const MOCK_FUNERALS_WEDDINGS = [
  { name: "Nguyễn Ngọc Thanh Hằng", event: "Kết hôn (Kết hôn nhân viên)", amount: 2000000, date: "2026-06-02", status: "Đã chi" },
  { name: "Phạm Thành Lộc", event: "Tứ thân phụ mẫu qua đời (Hiếu)", amount: 2000000, date: "2026-05-20", status: "Đã chi" }
];

const MOCK_HOLIDAYS = [
  { holiday: "Quốc khánh 2/9", amount: "1.000.000 đ/nhân viên", budget: "145.000.000 đ", date: "2026-09-02", status: "Kế hoạch" },
  { holiday: "Giải phóng miền Nam 30/4 & Quốc tế lao động 1/5", amount: "1.000.000 đ/nhân viên", budget: "143.000.000 đ", date: "2026-04-30", status: "Đã chi trả" },
  { holiday: "Tết Dương Lịch", amount: "1.500.000 đ/nhân viên", budget: "214.500.000 đ", date: "2026-01-01", status: "Đã chi trả" }
];

const HISTORICAL_SALARY_TREND = [
  { name: "T1", "Tổng lương (Tỷ)": 1.45, "Đóng BHXH (Triệu)": 152 },
  { name: "T2", "Tổng lương (Tỷ)": 1.46, "Đóng BHXH (Triệu)": 153 },
  { name: "T3", "Tổng lương (Tỷ)": 1.49, "Đóng BHXH (Triệu)": 158 },
  { name: "T4", "Tổng lương (Tỷ)": 1.51, "Đóng BHXH (Triệu)": 160 },
  { name: "T5", "Tổng lương (Tỷ)": 1.54, "Đóng BHXH (Triệu)": 165 },
  { name: "T6", "Tổng lương (Tỷ)": 1.58, "Đóng BHXH (Triệu)": 170 }
];

// --- ORG CHART SETUP DATA ---
const DEPARTMENTS_LIST = [
  // Khối Văn Phòng
  { name: "Phòng Hành Chính Nhân Sự", key: "hr", type: "office", desc: "Quản trị hành chính, tuyển dụng, đào tạo, C&B và các chế độ phúc lợi", color: "from-blue-600 to-indigo-600" },
  { name: "Phòng Kế Toán", key: "accounting", type: "office", desc: "Quản lý tài chính doanh nghiệp, kế toán thuế, công nợ và quyết toán thanh toán", color: "from-indigo-600 to-purple-600" },
  { name: "Phòng Kế Hoạch Đấu Thầu", key: "bidding", type: "office", desc: "Xây dựng kế hoạch đấu thầu, định giá dự án, lập hồ sơ thầu thi công", color: "from-purple-600 to-fuchsia-600" },
  { name: "Phòng Thị Trường", key: "market", type: "office", desc: "Phát triển thị trường, quan hệ đối tác, mở rộng dự án thi công xây dựng", color: "from-pink-600 to-rose-600" },
  
  // Khối Kỹ Thuật & Giám Sát
  { name: "Phòng Kỹ Thuật", key: "technical", type: "tech", desc: "Giám sát thiết kế, bóc tách khối lượng, giải pháp kỹ thuật công trình", color: "from-teal-600 to-emerald-600" },
  { name: "Phòng Vật Tư Thiết Bị", key: "materials", type: "tech", desc: "Cung ứng vật tư thiết bị, quản lý điều động máy móc công trình dự án", color: "from-cyan-600 to-blue-600" },
  { name: "Phòng An Toàn Lao Động", key: "safety", type: "tech", desc: "Đảm bảo ATLĐ, vệ sinh môi trường công trường, đào tạo HSE", color: "from-emerald-600 to-green-600" },
  { name: "Phòng Quản Lý Dự Án", key: "management", type: "tech", desc: "Quản lý tiến độ, chất lượng thi công dự án, hồ sơ thanh quyết toán", color: "from-sky-600 to-indigo-600" },

  // Khối Hiện Trường / Công Trường
  { name: "Ban Điều Hành Dự Án Vàm Lẽo", key: "project_vamleo", type: "project", desc: "Ban điều hành trực tiếp thi công, giám sát tại dự án Vàm Lẽo", color: "from-amber-600 to-orange-600" },
  { name: "Ban Điều Hành Dự Án Cà Ná", key: "project_cana", type: "project", desc: "Ban điều hành trực tiếp thi công, giám sát tại dự án Cà Ná", color: "from-orange-600 to-red-600" }
];

const BOARD_OF_DIRECTORS = [
  { name: "Nguyễn Nam Hải", role: "Tổng Giám Đốc", email: "hai.nn@trungnamec.com.vn", phone: "0918.999.888", avatar: "NH" },
  { name: "Lê Minh Tâm", role: "Phó Tổng Giám Đốc Tài Chính", email: "tam.lm@trungnamec.com.vn", phone: "0912.777.666", avatar: "MT" },
  { name: "Trần Đức Long", role: "Phó Tổng Giám Đốc Kỹ Thuật", email: "long.td@trungnamec.com.vn", phone: "0903.555.444", avatar: "DL" }
];

export default function CBPage() {
  // 5 Main Tabs: employee_profile, attendance, payroll_insurance, benefits, org_chart
  const [activeTab, setActiveTab] = useState("employee_profile");
  const [activeSubTab, setActiveSubTab] = useState("personal");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  
  // Real contract data from Supabase
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);

  // Biometric sync state
  const [isSyncingMachine, setIsSyncingMachine] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);

  // Search keyword
  const [searchQuery, setSearchQuery] = useState("");

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === "employee_profile") setActiveSubTab("personal");
    else if (tabId === "attendance") setActiveSubTab("machine");
    else if (tabId === "payroll_insurance") setActiveSubTab("calculation");
    else if (tabId === "benefits") setActiveSubTab("birthday");
    else if (tabId === "org_chart") setActiveSubTab("chart");
  };

  // Fetch employees from Supabase
  const fetchEmployees = async () => {
    try {
      setLoadingEmployees(true);
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      if (data) {
        setEmployees(data as Employee[]);
        if (data.length > 0) {
          setSelectedEmp(data[0] as Employee);
        }
      }
    } catch (err) {
      console.error("Error fetching employees in CB:", err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  // Fetch contracts from Supabase
  const fetchContracts = async () => {
    try {
      setLoadingContracts(true);
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .order("effective_date", { ascending: false });
      if (error) throw error;
      if (data) {
        setContracts(data as Contract[]);
      }
    } catch (err) {
      console.error("Error fetching contracts in CB:", err);
    } finally {
      setLoadingContracts(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchContracts();
  }, []);

  // Sync fingerprint machine mock
  const handleSyncBiometricMachine = () => {
    setIsSyncingMachine(true);
    setTimeout(() => {
      setIsSyncingMachine(false);
      setSyncedCount(145);
      alert("Đồng bộ dữ liệu từ máy chấm công vân tay thành công! Đã nạp 145 bản ghi ngày công hôm nay.");
    }, 1200);
  };

  // Group real employees by department for Org Chart
  const orgChartData = useMemo(() => {
    const groups: Record<string, Employee[]> = {};
    employees.forEach(emp => {
      const dept = emp.department || "Khối văn phòng chung";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(emp);
    });
    return Object.entries(groups).map(([name, members]) => ({
      departmentName: name,
      manager: members.find(m => m.role.toLowerCase().includes("trưởng phòng") || m.role.toLowerCase().includes("chỉ huy")) || members[0] || null,
      members: members
    }));
  }, [employees]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header 
          title="Lương & Phúc lợi (C&B)" 
          subtitle="Báo cáo phân tích lương, ngày công, hợp đồng, phúc lợi và sơ đồ nhân sự công ty" 
        />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto text-slate-800">
          
          {/* ─── 5 MAIN TABS NAVIGATOR ─── */}
          <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-sm space-x-1 shrink-0 overflow-x-auto">
            {[
              { id: "employee_profile", label: "Hồ sơ nhân viên", icon: User },
              { id: "attendance", label: "Chấm công", icon: Clock },
              { id: "payroll_insurance", label: "Bảng lương & BHXH", icon: DollarSign },
              { id: "benefits", label: "Phúc lợi", icon: Award },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-[#005BAC] text-white shadow-md shadow-blue-500/10"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ─── SUB-TABS NAVIGATOR BASED ON ACTIVE MAIN TAB ─── */}
          <div className="flex flex-wrap gap-2 text-xs font-bold bg-slate-100 p-1.5 rounded-xl shrink-0">
            {activeTab === "employee_profile" && [
              { id: "personal", label: "Thông tin cá nhân" },
              { id: "salary", label: "Thông tin lương" },
              { id: "contract", label: "Thông tin HĐ" },
              { id: "promotion", label: "Lộ trình thăng tiến" },
              { id: "termination", label: "Nghỉ việc" },
              { id: "concurrent", label: "Quản lý kiêm nhiệm" }
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTab(sub.id)}
                className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeSubTab === sub.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {sub.label}
              </button>
            ))}

            {activeTab === "attendance" && [
              { id: "machine", label: "Lấy ngày công máy chấm công" },
              { id: "explanation", label: "Thông tin giải trình" },
              { id: "leave", label: "Nghỉ phép" },
              { id: "travel", label: "Công tác" },
              { id: "regime", label: "Nghỉ chế độ" },
              { id: "allowances", label: "Phụ cấp cơm, xăng, dt..." }
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTab(sub.id)}
                className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeSubTab === sub.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {sub.label}
              </button>
            ))}

            {activeTab === "payroll_insurance" && [
              { id: "calculation", label: "Tính lương" },
              { id: "insurance", label: "Bảo hiểm xã hội (BHXH)" }
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTab(sub.id)}
                className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeSubTab === sub.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {sub.label}
              </button>
            ))}

            {activeTab === "benefits" && [
              { id: "birthday", label: "Sinh nhật" },
              { id: "funeral_wedding", label: "Hiếu hỷ" },
              { id: "holiday_bonus", label: "Tiền thưởng lễ" }
            ].map(sub => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTab(sub.id)}
                className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeSubTab === sub.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {sub.label}
              </button>
            ))}


          </div>

          {/* ─── TAB CONTENT PANELS ─── */}

          {/* ─── TAB 1: HỒ SƠ NHÂN VIÊN ─── */}
          {activeTab === "employee_profile" && (
            <div className="space-y-6">
              {activeSubTab === "personal" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left List of Employees */}
                  <div className="lg:col-span-1 glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm flex flex-col space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="font-heading font-extrabold text-slate-800 text-xs uppercase">Danh sách nhân viên ({filteredEmployees.length})</h3>
                      <button onClick={fetchEmployees} className="text-slate-400 hover:text-[#005BAC] cursor-pointer">
                        <RefreshCw size={14} className={loadingEmployees ? "animate-spin" : ""} />
                      </button>
                    </div>

                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm nhân viên, bộ phận, chức vụ..."
                        className="w-full border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs font-semibold text-slate-800 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                      />
                    </div>

                    {loadingEmployees ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                        <Loader2 className="animate-spin text-[#005BAC]" size={20} />
                        <span className="text-[10px]">Đang tải hồ sơ...</span>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                        {filteredEmployees.map(emp => (
                          <div
                            key={emp.id}
                            onClick={() => setSelectedEmp(emp)}
                            className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                              selectedEmp?.id === emp.id
                                ? "bg-blue-50/50 border-blue-200 shadow-sm"
                                : "border-transparent bg-slate-50/20 hover:bg-slate-50"
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-extrabold text-[#005BAC] text-xs">
                              {emp.avatar || emp.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-xs text-slate-800 truncate">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{emp.role} | {emp.department}</p>
                            </div>
                            <ChevronRight size={14} className="text-slate-300" />
                          </div>
                        ))}
                        {filteredEmployees.length === 0 && (
                          <p className="text-center py-10 text-slate-400 italic text-[11px]">Không tìm thấy hồ sơ phù hợp</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Detail Profile Card */}
                  <div className="lg:col-span-2 glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                    {selectedEmp ? (
                      <div className="space-y-6">
                        <div className="flex items-start justify-between border-b border-slate-100 pb-5">
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white text-xl shadow-md">
                              {selectedEmp.avatar || selectedEmp.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-heading font-black text-lg text-slate-850">{selectedEmp.name}</h3>
                              <p className="text-slate-400 text-xs font-semibold">{selectedEmp.role} — <span className="text-slate-500 font-bold">{selectedEmp.department}</span></p>
                              <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase ${
                                selectedEmp.status === "Chính thức" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>
                                {selectedEmp.status || "Chính thức"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-2 border-[#005BAC] pl-2">Thông tin liên hệ</h4>
                            <div className="space-y-2 text-xs font-semibold text-slate-600">
                              <p className="flex items-center gap-2"><Mail size={13} className="text-slate-400" /> Email: <span className="text-slate-800 font-bold">{selectedEmp.email}</span></p>
                              <p className="flex items-center gap-2"><Phone size={13} className="text-slate-400" /> Số điện thoại: <span className="text-slate-800 font-bold">{selectedEmp.phone || "Chưa nhập"}</span></p>
                              <p className="flex items-center gap-2"><Calendar size={13} className="text-slate-400" /> Ngày gia nhập: <span className="text-slate-800 font-bold">{new Date(selectedEmp.created_at).toLocaleDateString("vi-VN")}</span></p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-2 border-[#005BAC] pl-2">Thông tin công việc</h4>
                            <div className="space-y-2 text-xs font-semibold text-slate-600">
                              <p className="flex items-center gap-2"><Briefcase size={13} className="text-slate-400" /> Vị trí hiện tại: <span className="text-slate-800 font-bold">{selectedEmp.role}</span></p>
                              <p className="flex items-center gap-2"><Building2 size={13} className="text-slate-400" /> Đơn vị trực thuộc: <span className="text-slate-800 font-bold">{selectedEmp.department}</span></p>
                              <p className="flex items-center gap-2"><TrendingUp size={13} className="text-slate-400" /> Đánh giá KPI hiện tại: <span className="text-blue-600 font-black">{selectedEmp.kpi || 100} / 100</span></p>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-5 space-y-3">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ghi chú & Đánh giá năng lực</h4>
                          <div className="p-3 bg-slate-50 rounded-xl text-xs leading-relaxed text-slate-500 font-medium italic">
                            Nhân sự làm việc năng nổ, có trách nhiệm cao trong công tác được giao. Có năng lực quản lý tốt và đang trong lộ trình đào tạo phát triển kỹ năng lãnh đạo phòng ban kế cận.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                        Chọn một nhân viên bên danh sách để xem chi tiết hồ sơ cá nhân
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeSubTab === "salary" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">HỒ SƠ THÔNG TIN LƯƠNG NHÂN SỰ</h3>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 text-xs font-bold cursor-pointer">
                      <Download size={13} /> Xuất bảng lương
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Họ và Tên</th>
                          <th className="py-3 px-3">Lương Cơ Bản (Gross)</th>
                          <th className="py-3 px-3">Lương Đóng BHXH</th>
                          <th className="py-3 px-3">Phụ cấp điện thoại</th>
                          <th className="py-3 px-3">Phụ cấp cơm trưa</th>
                          <th className="py-3 px-3">Phụ cấp xăng xe</th>
                          <th className="py-3 px-3 text-right">Tổng thực lĩnh</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_SALARY_INFO.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{s.name}</td>
                            <td className="py-3.5 px-3">{s.base.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3">{s.insurance.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3">{s.phone.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3">{s.lunch.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3">{s.gas.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-right text-blue-600 font-bold">{s.total.toLocaleString("vi-VN")} đ</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "contract" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">HỒ SƠ HỢP ĐỒNG LAO ĐỘNG HỆ THỐNG</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Quản lý ngày hiệu lực và ngày hết hạn hợp đồng chính thức</span>
                  </div>
                  {loadingContracts ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                      <Loader2 className="animate-spin text-blue-600" size={24} />
                      <p className="text-xs">Đang đọc dữ liệu hợp đồng lao động...</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3">Mã hợp đồng</th>
                            <th className="py-3 px-3">Loại hợp đồng</th>
                            <th className="py-3 px-3">Ngày ký</th>
                            <th className="py-3 px-3">Ngày kết thúc</th>
                            <th className="py-3 px-3 w-32 text-center">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {contracts.map(c => (
                            <tr key={c.id} className="hover:bg-slate-50/50">
                              <td className="py-3.5 px-3 font-mono font-bold text-slate-800">{c.contract_number}</td>
                              <td className="py-3.5 px-3">{c.type || "Hợp đồng xác định thời hạn"}</td>
                              <td className="py-3.5 px-3">{c.effective_date ? new Date(c.effective_date).toLocaleDateString("vi-VN") : "Chưa xác định"}</td>
                              <td className="py-3.5 px-3">{c.expiration_date ? new Date(c.expiration_date).toLocaleDateString("vi-VN") : "HĐ Không thời hạn"}</td>
                              <td className="py-3.5 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  c.status === "Còn hạn" || !c.expiration_date ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                }`}>
                                  {c.status || "Còn hiệu lực"}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {contracts.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-slate-400 italic">Không có dữ liệu hợp đồng nào trong Supabase.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeSubTab === "promotion" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div>
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">LỘ TRÌNH THĂNG TIẾN & PHÁT TRIỂN NĂNG LỰC</h3>
                    <p className="text-slate-400 text-[10px] font-semibold mt-1">Lịch sử thăng tiến chức danh, tăng bậc lương và khen thưởng nhân sự</p>
                  </div>
                  <div className="relative border-l-2 border-slate-100 ml-4 pl-6 space-y-6">
                    {MOCK_PROMOTIONS.map((p, idx) => (
                      <div key={idx} className="relative">
                        {/* Dot */}
                        <div className="absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                        </div>
                        
                        <div className="bg-slate-50/60 rounded-xl p-4 border border-slate-100 hover:border-blue-100 hover:bg-slate-50 transition-all space-y-1">
                          <span className="text-[9px] font-black text-[#005BAC] uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-full">{p.type}</span>
                          <h4 className="font-heading font-extrabold text-slate-850 text-xs mt-1">{p.name}</h4>
                          <p className="text-[11px] text-slate-500 font-semibold">
                            Chức vụ cũ: <span className="text-slate-400">{p.oldRole} ({p.oldDept})</span> ➔ Chức vụ mới: <span className="text-slate-800 font-black">{p.newRole} ({p.newDept})</span>
                          </p>
                          <p className="text-[10px] text-slate-400 mt-2 font-bold">Ngày quyết định có hiệu lực: {new Date(p.date).toLocaleDateString("vi-VN")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSubTab === "termination" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">HỒ SƠ NHÂN SỰ NGHỈ VIỆC / THỦ TỤC THANH LÝ</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Theo dõi lộ trình nghỉ việc và tiến độ bàn giao tài sản thiết bị</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Họ và Tên</th>
                          <th className="py-3 px-3">Phòng Ban</th>
                          <th className="py-3 px-3">Ngày chấm dứt HĐ</th>
                          <th className="py-3 px-3">Lý do nghỉ việc</th>
                          <th className="py-3 px-3">Tiến độ bàn giao</th>
                          <th className="py-3 px-3 text-right">Trợ cấp thôi việc (nếu có)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_TERMINATIONS.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{t.name}</td>
                            <td className="py-3.5 px-3">{t.dept}</td>
                            <td className="py-3.5 px-3">{new Date(t.date).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-slate-500 italic">{t.reason}</td>
                            <td className="py-3.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                t.status.includes("Đã bàn giao") ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>{t.status}</span>
                            </td>
                            <td className="py-3.5 px-3 text-right text-slate-900 font-bold">{t.allowance > 0 ? `${t.allowance.toLocaleString("vi-VN")} đ` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "concurrent" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">QUẢN LÝ CHỨC DANH KIÊM NHIỆM</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Theo dõi phụ cấp kiêm nhiệm và các trách nhiệm bổ sung</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Họ và Tên</th>
                          <th className="py-3 px-3">Chức danh chính</th>
                          <th className="py-3 px-3">Chức danh kiêm nhiệm</th>
                          <th className="py-3 px-3">Khối/Phòng phụ trách</th>
                          <th className="py-3 px-3">Phụ cấp kiêm nhiệm</th>
                          <th className="py-3 px-3 text-right">Ngày bổ nhiệm</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_CONCURRENTS.map((c, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{c.name}</td>
                            <td className="py-3.5 px-3">{c.primary}</td>
                            <td className="py-3.5 px-3 text-blue-600 font-bold">{c.concurrent}</td>
                            <td className="py-3.5 px-3">{c.dept}</td>
                            <td className="py-3.5 px-3 text-emerald-600 font-bold">+{c.allowance.toLocaleString("vi-VN")} đ/tháng</td>
                            <td className="py-3.5 px-3 text-right">{new Date(c.date).toLocaleDateString("vi-VN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 2: CHẤM CÔNG ─── */}
          {activeTab === "attendance" && (
            <div className="space-y-6">
              {activeSubTab === "machine" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                    <div>
                      <h3 className="font-heading font-extrabold text-slate-800 text-sm">ĐỒNG BỘ DỮ LIỆU TỪ MÁY CHẤM CÔNG VÂN TAY / FINGERPRINT</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Kết nối mạng TCP/IP trực tiếp với máy chấm công tại văn phòng và công trường</p>
                    </div>
                    <button
                      onClick={handleSyncBiometricMachine}
                      disabled={isSyncingMachine}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow disabled:opacity-50"
                    >
                      {isSyncingMachine ? (
                        <>
                          <Loader2 size={13} className="animate-spin" /> Đang đồng bộ...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={13} /> Lấy dữ liệu công máy chấm công
                        </>
                      )}
                    </button>
                  </div>

                  {syncedCount > 0 && (
                    <div className="bg-emerald-50 border border-emerald-250 p-3 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold">
                      <CheckCircle size={15} /> Đồng bộ hoàn tất! Hệ thống đã ghi nhận {syncedCount} bản ghi chấm công từ văn phòng và các dự án trong ngày.
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bản ghi chấm công hôm nay (Mẫu)</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-2.5 px-3">Ngày</th>
                            <th className="py-2.5 px-3">Họ và tên</th>
                            <th className="py-2.5 px-3 text-center">Giờ vào (Check-in)</th>
                            <th className="py-2.5 px-3 text-center">Giờ ra (Check-out)</th>
                            <th className="py-2.5 px-3 text-center">Tổng giờ làm</th>
                            <th className="py-2.5 px-3 text-center">Trạng thái công</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {MOCK_ATTENDANCE_LOGS.map((log, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-3 px-3 font-semibold">{new Date(log.date).toLocaleDateString("vi-VN")}</td>
                              <td className="py-3 px-3 font-bold text-slate-800">{log.name}</td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600">{log.checkin}</td>
                              <td className="py-3 px-3 text-center font-mono font-bold text-[#005BAC]">{log.checkout}</td>
                              <td className="py-3 px-3 text-center">{log.hours} tiếng</td>
                              <td className="py-3 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  log.status === "Đúng giờ" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                }`}>{log.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === "explanation" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">GIẢI TRÌNH SAI LỆCH CÔNG TÁC / QUÊN QUÉT THẺ</h3>
                    <p className="text-slate-400 text-[10px] font-semibold mt-1">Nơi phê duyệt và đối soát lý do sai lệch hoặc bổ sung thời gian checkin/checkout của nhân viên</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Ngày giải trình</th>
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Lý do giải trình</th>
                          <th className="py-3 px-3">Khung giờ đề xuất</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái duyệt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_EXPLANATIONS.map((e, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 font-semibold">{new Date(e.date).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{e.name}</td>
                            <td className="py-3.5 px-3 text-slate-550 italic font-medium">{e.reason}</td>
                            <td className="py-3.5 px-3 font-mono text-[#005BAC]">{e.propose}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                e.status === "Đã duyệt" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>{e.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "leave" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">THEO DÕI NGHỈ PHÉP NĂM</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Quản lý duyệt đơn nghỉ phép năm, nghỉ việc riêng, nghỉ không lương</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Loại nghỉ phép</th>
                          <th className="py-3 px-3">Từ ngày</th>
                          <th className="py-3 px-3">Đến ngày</th>
                          <th className="py-3 px-3 text-center">Tổng số ngày nghỉ</th>
                          <th className="py-3 px-3">Lý do nghỉ</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái duyệt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_LEAVES.map((l, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{l.name}</td>
                            <td className="py-3.5 px-3 text-blue-600 font-bold">{l.type}</td>
                            <td className="py-3.5 px-3">{new Date(l.from).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3">{new Date(l.to).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-center">{l.days} ngày</td>
                            <td className="py-3.5 px-3 text-slate-500 italic font-medium">{l.reason}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                l.status === "Đã duyệt" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>{l.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "travel" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">DANH SÁCH LỊCH TRÌNH CÔNG TÁC</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Theo dõi lịch trình kiểm tra dự án công trường và trợ cấp công tác phí</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Họ và Tên</th>
                          <th className="py-3 px-3">Địa điểm công tác</th>
                          <th className="py-3 px-3">Từ ngày</th>
                          <th className="py-3 px-3">Đến ngày</th>
                          <th className="py-3 px-3">Mục đích công tác</th>
                          <th className="py-3 px-3">Trợ cấp tiền xăng/di chuyển</th>
                          <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_TRAVELS.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{t.name}</td>
                            <td className="py-3.5 px-3 text-[#005BAC] font-bold">{t.dest}</td>
                            <td className="py-3.5 px-3">{new Date(t.from).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3">{new Date(t.to).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-slate-550 font-medium">{t.purpose}</td>
                            <td className="py-3.5 px-3 text-emerald-600 font-bold">+{t.allowance.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">{t.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "regime" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">NGHỈ CHẾ ĐỘ PHÚC LỢI BHXH (ỐM ĐAU, THAI SẢN)</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Quản lý danh sách nhân viên nghỉ chế độ và tiến độ nộp hồ sơ thụ hưởng BHXH</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Họ và Tên</th>
                          <th className="py-3 px-3">Chế độ thụ hưởng</th>
                          <th className="py-3 px-3">Ngày bắt đầu</th>
                          <th className="py-3 px-3">Ngày kết thúc</th>
                          <th className="py-3 px-3">Tình trạng hồ sơ BHXH</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái nghỉ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_REGIMES.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{r.name}</td>
                            <td className="py-3.5 px-3 text-indigo-600 font-bold">{r.type}</td>
                            <td className="py-3.5 px-3">{new Date(r.from).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3">{new Date(r.to).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-slate-500 font-bold flex items-center gap-1.5"><Info size={12} className="text-slate-400" /> {r.insurance_claim}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                r.status === "Đang nghỉ" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                              }`}>{r.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "allowances" && (
                <div className="space-y-6">
                  {/* Allowance Standards Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {MOCK_ALLOWANCES.map((a, idx) => (
                      <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm hover-elevate space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="p-2 bg-blue-50 text-[#005BAC] rounded-xl"><Briefcase size={16} /></span>
                          <span className="text-[10px] text-emerald-600 font-bold">Đang áp dụng cho {a.activeCount} nhân sự</span>
                        </div>
                        <div>
                          <h4 className="font-heading font-extrabold text-slate-800 text-xs">{a.name}</h4>
                          <p className="font-heading font-black text-[#005BAC] text-sm mt-1">{a.standard}</p>
                          <p className="text-slate-400 text-[10px] font-semibold mt-2">Đối tượng: {a.target}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 3: BẢNG LƯƠNG & BHXH ─── */}
          {activeTab === "payroll_insurance" && (
            <div className="space-y-6">
              {activeSubTab === "calculation" && (
                <div className="space-y-6">
                  {/* Monthly Payroll Grid */}
                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="font-heading font-extrabold text-slate-800 text-sm">BẢNG TÍNH TOÁN TIỀN LƯƠNG THÁNG NÀY</h3>
                        <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Dữ liệu tính toán dựa trên ngày công chấm công và thang bảng lương quy định</p>
                      </div>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">Tháng 06/2026</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3">Họ và Tên</th>
                            <th className="py-3 px-3 text-center">Ngày công quy định</th>
                            <th className="py-3 px-3 text-center">Ngày công thực tế</th>
                            <th className="py-3 px-3">Lương cơ bản</th>
                            <th className="py-3 px-3">Phụ cấp</th>
                            <th className="py-3 px-3">Khấu trừ BHXH (10.5%)</th>
                            <th className="py-3 px-3">Thuế TNCN trích đóng</th>
                            <th className="py-3 px-3 text-right">Lương thực lĩnh (Net)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {MOCK_SALARY_INFO.map(s => {
                            const deductions = s.insurance * 0.105;
                            const tax = s.base * 0.05; // mock tax
                            const netPay = s.total - deductions - tax;
                            return (
                              <tr key={s.id} className="hover:bg-slate-50/50">
                                <td className="py-3.5 px-3 text-slate-850 font-bold">{s.name}</td>
                                <td className="py-3.5 px-3 text-center">24 ngày</td>
                                <td className="py-3.5 px-3 text-center text-blue-600 font-bold">24 ngày</td>
                                <td className="py-3.5 px-3">{s.base.toLocaleString("vi-VN")} đ</td>
                                <td className="py-3.5 px-3">{(s.phone + s.lunch + s.gas).toLocaleString("vi-VN")} đ</td>
                                <td className="py-3.5 px-3 text-rose-600">-{deductions.toLocaleString("vi-VN")} đ</td>
                                <td className="py-3.5 px-3 text-amber-600">-{tax.toLocaleString("vi-VN")} đ</td>
                                <td className="py-3.5 px-3 text-right text-emerald-600 font-black">{netPay.toLocaleString("vi-VN")} đ</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Salary trends chart */}
                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                    <h3 className="font-heading font-bold text-slate-800 text-sm mb-5">Biến động Quỹ lương & Trích đóng BHXH (6 tháng qua)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={HISTORICAL_SALARY_TREND}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="Tổng lương (Tỷ)" stroke="#005BAC" strokeWidth={2} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === "insurance" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">HỒ SƠ BẢO HIỂM XÃ HỘI & TRÍCH ĐÓNG BHXH</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Theo dõi mã số bảo hiểm, mức lương đóng quy định và trích nộp định kỳ</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Mã số BHXH</th>
                          <th className="py-3 px-3">Mức lương đóng BHXH</th>
                          <th className="py-3 px-3">BHXH Cá nhân (8%)</th>
                          <th className="py-3 px-3">BHYT Cá nhân (1.5%)</th>
                          <th className="py-3 px-3">BHTN Cá nhân (1%)</th>
                          <th className="py-3 px-3">Doanh nghiệp đóng thêm (21.5%)</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái Sổ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_BHXH_LOGS.map((b, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{b.name}</td>
                            <td className="py-3.5 px-3 font-mono font-bold text-slate-500">{b.code}</td>
                            <td className="py-3.5 px-3">{b.base.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-rose-600">-{b.SI.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-rose-600">-{b.HI.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-rose-600">-{b.UI.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-emerald-600">+{b.company_total.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800">{b.booklet}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 4: PHÚC LỢI ─── */}
          {activeTab === "benefits" && (
            <div className="space-y-6">
              {activeSubTab === "birthday" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span className="p-2 bg-pink-50 text-pink-600 rounded-xl"><Cake size={16} /></span>
                    <div>
                      <h3 className="font-heading font-extrabold text-slate-800 text-sm">CHÚC MỪNG SINH NHẬT NHÂN SỰ THÁNG 6</h3>
                      <p className="text-slate-400 text-[10px] font-semibold">Gửi lời chúc mừng và theo dõi phần quà tặng sinh nhật của CBNV trong tháng</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {MOCK_BIRTHDAYS.map((b, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-50/20 to-indigo-50/10 rounded-2xl border border-pink-100/50 hover-elevate transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center font-bold text-sm">
                            {b.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-heading font-extrabold text-slate-850 text-xs">{b.name}</h4>
                            <p className="text-[10px] text-slate-500 font-semibold">{b.dept} | Sinh nhật: {new Date(b.dob).toLocaleDateString("vi-VN")}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] font-black text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full flex items-center gap-1"><Gift size={10} /> {b.gift}</span>
                          <p className="text-[10px] text-slate-400 font-bold mt-1.5">{b.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSubTab === "funeral_wedding" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">DANH SÁCH CHI TRỢ CẤP HIẾU HỶ</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Quản lý quỹ hỗ trợ việc cưới hỏi, phúng viếng nhân thân và ốm đau bệnh tật</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Nội dung hiếu/hỷ</th>
                          <th className="py-3 px-3">Mức hỗ trợ quy định</th>
                          <th className="py-3 px-3">Ngày chi trả</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái quỹ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_FUNERALS_WEDDINGS.map((fw, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{fw.name}</td>
                            <td className="py-3.5 px-3 text-[#005BAC] font-bold">{fw.event}</td>
                            <td className="py-3.5 px-3 text-emerald-600 font-black">+{fw.amount.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3">{new Date(fw.date).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">{fw.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "holiday_bonus" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">TIỀN THƯỞNG LỄ QUY ĐỊNH</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Quản lý quỹ phúc lợi thưởng Tết và các ngày lễ quốc gia lớn trong năm</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Dịp lễ/Tết</th>
                          <th className="py-3 px-3">Mức thưởng tiêu chuẩn</th>
                          <th className="py-3 px-3">Tổng ngân sách chi trả</th>
                          <th className="py-3 px-3">Dự kiến chi trả</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {MOCK_HOLIDAYS.map((h, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{h.holiday}</td>
                            <td className="py-3.5 px-3 text-blue-600 font-bold">{h.amount}</td>
                            <td className="py-3.5 px-3 text-[#005BAC] font-black">{h.budget}</td>
                            <td className="py-3.5 px-3">{new Date(h.date).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                h.status === "Đã chi trả" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                              }`}>{h.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

                    


        </main>
      </div>
    </div>
  );
}

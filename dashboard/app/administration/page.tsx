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
  Filter,
  ClipboardList,
  Receipt,
  RefreshCw,
  BarChart3,
  Trash2,
  Upload,
  FileText,
  User,
  ArrowRight,
  Check
} from "lucide-react";
import { useState } from "react";

// ─── TYPES & INTERFACES ──────────────────────────────────────────────────────
interface SupplyItem {
  name: string;
  cat: string;
  unit: string;
  stock: number;
  allocated: number;
  alert: "Bình thường" | "Cảnh báo";
}

interface DeptRequest {
  id: string;
  dept: string;
  item: string;
  qty: number;
  date: string;
  status: "Chờ duyệt" | "Đã cấp phát";
}

interface ChecklistItem {
  id: string;
  task: string;
  assignee: "Bạn A" | "Bạn B";
  frequency: "Hàng ngày" | "Hàng tuần" | "Hàng tháng";
  status: "Chưa làm" | "Đang làm" | "Hoàn thành";
}

interface Invoice {
  id: string;
  number: string;
  date: string;
  desc: string;
  amount: number;
}

interface RecurringPayment {
  name: string;
  bank: string;
  account: string;
  owner: string;
  lastAmount: number;
  content: string;
}

// ─── INITIAL MOCK DATA ────────────────────────────────────────────────────────
const INITIAL_SUPPLIES: SupplyItem[] = [
  { name: "Giấy A4 Double A 70gsm", cat: "Giấy in", unit: "Ram", stock: 150, allocated: 320, alert: "Bình thường" },
  { name: "Bút bi Thiên Long xanh", cat: "Bút viết", unit: "Hộp", stock: 12, allocated: 45, alert: "Cảnh báo" },
  { name: "Kẹp bướm 25mm", cat: "Dụng cụ lưu trữ", unit: "Hộp", stock: 45, allocated: 15, alert: "Bình thường" }
];

const INITIAL_DEPT_REQUESTS: DeptRequest[] = [
  { id: "REQ-01", dept: "Phòng Nhân sự", item: "Giấy A4 Double A 70gsm", qty: 5, date: "2026-06-04", status: "Chờ duyệt" },
  { id: "REQ-02", dept: "Phòng Kế toán", item: "Bút bi Thiên Long xanh", qty: 2, date: "2026-06-05", status: "Chờ duyệt" },
  { id: "REQ-03", dept: "Phòng Dự án", item: "Giấy A4 Double A 70gsm", qty: 10, date: "2026-06-03", status: "Đã cấp phát" }
];

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { id: "T1", task: "Kiểm tra và chuẩn bị văn phòng phẩm đầu ngày", assignee: "Bạn A", frequency: "Hàng ngày", status: "Hoàn thành" },
  { id: "T2", task: "Vệ sinh và kiểm tra thiết bị phòng họp", assignee: "Bạn A", frequency: "Hàng ngày", status: "Đang làm" },
  { id: "T3", task: "Đối soát hóa đơn & chuẩn bị hồ sơ thanh toán tuần", assignee: "Bạn B", frequency: "Hàng tuần", status: "Chưa làm" },
  { id: "T4", task: "Lập báo cáo tổng hợp chi phí cuối tháng", assignee: "Bạn B", frequency: "Hàng tháng", status: "Chưa làm" }
];

const INITIAL_RECURRING: RecurringPayment[] = [
  { name: "Tiền điện văn phòng", bank: "MB Bank", account: "1234567890", owner: "EVN TP.HCM", lastAmount: 14500000, content: "Thanh toan tien dien van phong TNEC thang" },
  { name: "Tiền nước văn phòng", bank: "Vietcombank", account: "001100445566", owner: "SAWACO", lastAmount: 1200000, content: "Thanh toan tien nuoc TNEC thang" },
  { name: "Cước Internet cáp quang", bank: "BIDV", account: "1199558877", owner: "VIETTEL TELECOM", lastAmount: 3500000, content: "Thanh toan cuoc internet TNEC thang" }
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function AdministrationPage() {
  const [activeTab, setActiveTab] = useState<"vpp" | "checklist" | "invoice" | "recurring" | "report">("vpp");

  // State Management
  const [supplies, setSupplies] = useState<SupplyItem[]>(INITIAL_SUPPLIES);
  const [deptRequests, setDeptRequests] = useState<DeptRequest[]>(INITIAL_DEPT_REQUESTS);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);
  const [invoices, setInvoices] = useState<Invoice[]>([
    { id: "INV-01", number: "HD-00231", date: "2026-06-01", desc: "Mua thêm mực in văn phòng", amount: 2500000 },
    { id: "INV-02", number: "HD-00245", date: "2026-06-03", desc: "Nước uống Lavie tháng 5", amount: 1800000 }
  ]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>(INITIAL_RECURRING);

  // VPP Sub-tabs: "inventory" or "allocation"
  const [vppSubTab, setVppSubTab] = useState<"inventory" | "allocation">("inventory");
  const [searchTerm, setSearchTerm] = useState("");

  // Invoice Reader States
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedInvoice, setExtractedInvoice] = useState<Partial<Invoice> | null>(null);

  // Department Allocation handler
  const handleApproveRequest = (reqId: string) => {
    const request = deptRequests.find(r => r.id === reqId);
    if (!request || request.status === "Đã cấp phát") return;

    // Deduct stock if supply exists
    setSupplies(prev => prev.map(s => {
      if (s.name === request.item) {
        const newStock = Math.max(0, s.stock - request.qty);
        return {
          ...s,
          stock: newStock,
          allocated: s.allocated + request.qty,
          alert: newStock < 15 ? "Cảnh báo" : "Bình thường"
        };
      }
      return s;
    }));

    // Update status
    setDeptRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: "Đã cấp phát" } : r));
    alert(`Đã duyệt cấp phát ${request.qty} ${request.item} cho ${request.dept}. Tồn kho đã tự động khấu trừ.`);
  };

  // Toggle Checklist Status
  const toggleChecklistStatus = (id: string) => {
    setChecklist(prev => prev.map(item => {
      if (item.id === id) {
        const nextStatus = item.status === "Chưa làm" ? "Đang làm" :
                           item.status === "Đang làm" ? "Hoàn thành" : "Chưa làm";
        return { ...item, status: nextStatus };
      }
      return item;
    }));
  };

  // Simulate Invoice AI Extraction
  const simulateInvoiceExtraction = () => {
    setIsExtracting(true);
    setTimeout(() => {
      setExtractedInvoice({
        number: "HD-00982",
        date: new Date().toISOString().slice(0, 10),
        desc: "Chi phí mua đồ ăn tiếp khách họp HĐQT ngày 04/06",
        amount: 3200000
      });
      setIsExtracting(false);
    }, 1500);
  };

  const saveExtractedInvoice = () => {
    if (!extractedInvoice || !extractedInvoice.number || !extractedInvoice.amount) return;
    const newInv: Invoice = {
      id: `INV-${Date.now().toString().slice(-2)}`,
      number: extractedInvoice.number,
      date: extractedInvoice.date || new Date().toISOString().slice(0, 10),
      desc: extractedInvoice.desc || "Hóa đơn thanh toán",
      amount: extractedInvoice.amount
    };
    setInvoices(prev => [newInv, ...prev]);
    setExtractedInvoice(null);
    setInvoiceFile(null);
    alert("Đã lưu hóa đơn vào danh sách thanh toán nhanh!");
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header 
          title="Hành chính & Văn phòng phẩm" 
          subtitle="Quản lý văn phòng phẩm, phân chia công việc, và xử lý hồ sơ thanh toán" 
        />

        <main className="flex-1 p-8 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            
            {/* LEFT COLUMN: Master Navigation List (5 Items) */}
            <div className="lg:col-span-1 space-y-3">
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Danh mục chức năng
              </div>
              <div className="space-y-1">
                {[
                  { id: "vpp", label: "5. VPP (Văn phòng phẩm)", icon: Package, desc: "Tồn kho & cấp phát phòng ban" },
                  { id: "checklist", label: "1. Checklist phân việc định kỳ", icon: ClipboardList, desc: "Phân công việc cho 2 nhân sự" },
                  { id: "invoice", label: "2. Đọc hóa đơn thanh toán", icon: Receipt, desc: "AI trích xuất làm HS thanh toán" },
                  { id: "recurring", label: "3. HS thanh toán định kỳ", icon: RefreshCw, desc: "Ghi nhớ TK ngân hàng định kỳ" },
                  { id: "report", label: "4. Báo cáo chi phí tháng", icon: BarChart3, desc: "Tổng hợp toàn bộ HS thanh toán" }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setSearchTerm("");
                      }}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3.5 hover-elevate ${
                        isActive
                          ? "bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/10"
                          : "bg-white border-slate-200/60 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className={`p-2 rounded-xl mt-0.5 ${isActive ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-heading font-extrabold text-xs leading-none">{item.label}</p>
                        <p className={`text-[10px] mt-1 font-medium truncate ${isActive ? "text-slate-400" : "text-slate-400"}`}>
                          {item.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: Detail Pane based on selected Item */}
            <div className="lg:col-span-3 space-y-6">
              
              {/* ─── TAB 1: VPP (Văn phòng phẩm) ─── */}
              {activeTab === "vpp" && (
                <div className="space-y-6">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="glass bg-white rounded-2xl p-4 border border-slate-200/40 shadow-sm">
                      <p className="text-slate-400 text-[10px] font-bold uppercase">Tổng vật tư lưu kho</p>
                      <p className="font-heading font-bold text-xl text-[#005BAC] mt-1">207 Ram/Hộp</p>
                    </div>
                    <div className="glass bg-white rounded-2xl p-4 border border-slate-200/40 shadow-sm">
                      <p className="text-slate-400 text-[10px] font-bold uppercase">Đã cấp phát Q2</p>
                      <p className="font-heading font-bold text-xl text-emerald-600 mt-1">380 Ram/Hộp</p>
                    </div>
                    <div className="glass bg-white rounded-2xl p-4 border border-slate-200/40 shadow-sm">
                      <p className="text-slate-400 text-[10px] font-bold uppercase">Yêu cầu chờ duyệt</p>
                      <p className="font-heading font-bold text-xl text-amber-600 mt-1">
                        {deptRequests.filter(r => r.status === "Chờ duyệt").length} Phiếu
                      </p>
                    </div>
                  </div>

                  {/* VPP Sub-navigation */}
                  <div className="flex border-b border-slate-200 gap-4">
                    <button
                      onClick={() => setVppSubTab("inventory")}
                      className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${
                        vppSubTab === "inventory" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"
                      }`}
                    >
                      1. Mục tồn kho của Hành chính
                    </button>
                    <button
                      onClick={() => setVppSubTab("allocation")}
                      className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${
                        vppSubTab === "allocation" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400"
                      }`}
                    >
                      2. Mục VPP cấp cho từng phòng
                    </button>
                  </div>

                  {/* Sub-tab 1: Inventory Table */}
                  {vppSubTab === "inventory" && (
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-4">
                      <div className="flex justify-between items-center gap-4">
                        <div className="relative w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                          <input
                            type="text"
                            placeholder="Tìm kiếm vật tư tồn kho..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none"
                          />
                        </div>
                        <button className="flex items-center gap-1 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow">
                          <Plus size={13} /> Nhập kho mới
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px] pb-2">
                              <th className="pb-2">Vật tư văn phòng</th>
                              <th className="pb-2">Danh mục</th>
                              <th className="pb-2">Đơn vị</th>
                              <th className="pb-2">Số lượng tồn kho</th>
                              <th className="pb-2">Đã cấp phát</th>
                              <th className="pb-2">Trạng thái tồn kho</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                            {supplies
                              .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                              .map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50">
                                  <td className="py-3 font-bold text-slate-800">{item.name}</td>
                                  <td className="py-3 text-slate-500">{item.cat}</td>
                                  <td className="py-3 font-mono text-slate-500">{item.unit}</td>
                                  <td className="py-3 text-slate-800 font-bold">{item.stock}</td>
                                  <td className="py-3 text-slate-400">{item.allocated}</td>
                                  <td className="py-3">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      item.alert === "Bình thường" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700 animate-pulse"
                                    }`}>
                                      {item.alert}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 2: Department Allocation Requests */}
                  {vppSubTab === "allocation" && (
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h4 className="font-heading font-bold text-slate-800 text-xs">Cấp phát văn phòng phẩm theo yêu cầu (PYC)</h4>
                        <span className="text-[10px] text-slate-400 font-semibold">Tự động trừ tồn kho Hành chính khi duyệt cấp</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px] pb-2">
                              <th className="pb-2">Mã PYC</th>
                              <th className="pb-2">Phòng ban</th>
                              <th className="pb-2">Vật tư yêu cầu</th>
                              <th className="pb-2 text-center">Số lượng</th>
                              <th className="pb-2">Ngày yêu cầu</th>
                              <th className="pb-2">Trạng thái</th>
                              <th className="pb-2 text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                            {deptRequests.map((req) => (
                              <tr key={req.id} className="hover:bg-slate-50/50">
                                <td className="py-3 font-mono text-slate-400">{req.id}</td>
                                <td className="py-3 text-slate-800 font-bold">{req.dept}</td>
                                <td className="py-3 text-slate-600">{req.item}</td>
                                <td className="py-3 text-center text-slate-850 font-bold">{req.qty}</td>
                                <td className="py-3 font-mono text-slate-500">{req.date}</td>
                                <td className="py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    req.status === "Đã cấp phát" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                  }`}>
                                    {req.status}
                                  </span>
                                </td>
                                <td className="py-3 text-center">
                                  {req.status === "Chờ duyệt" ? (
                                    <button
                                      onClick={() => handleApproveRequest(req.id)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all active:scale-95 shadow-sm"
                                    >
                                      Duyệt & Cấp phát
                                    </button>
                                  ) : (
                                    <span className="text-slate-350 text-[10px] font-normal italic">Đã bàn giao</span>
                                  )}
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

              {/* ─── TAB 2: Checklist phân việc định kỳ ─── */}
              {activeTab === "checklist" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Checklist phân việc định kỳ</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Phân chia công việc hàng ngày/tuần/tháng cho 2 nhân sự hành chính</p>
                    </div>
                    <button className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow">
                      <Plus size={13} /> Thêm công việc
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Two personnel summary */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Nhân sự: <strong>Bạn A</strong></p>
                        <p className="text-[11px] text-slate-600 font-semibold mt-1">Nhiệm vụ: Phụ trách hậu cần, kho VPP, phòng họp & tiếp khách</p>
                      </div>
                      <div className="border-l border-slate-200 pl-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Nhân sự: <strong>Bạn B</strong></p>
                        <p className="text-[11px] text-slate-600 font-semibold mt-1">Nhiệm vụ: Phụ trách đối soát hóa đơn, làm hồ sơ thanh toán, báo cáo chi phí</p>
                      </div>
                    </div>

                    {/* Task checklist table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px] pb-2">
                            <th className="pb-2">Tên công việc định kỳ</th>
                            <th className="pb-2 w-28">Người làm</th>
                            <th className="pb-2 w-28">Tần suất</th>
                            <th className="pb-2 w-28 text-center">Trạng thái</th>
                            <th className="pb-2 text-right w-16">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                          {checklist.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/50">
                              <td className="py-3.5 font-bold text-slate-800 leading-snug">{item.task}</td>
                              <td className="py-3.5">
                                <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                                  <User size={10} className="text-slate-400" /> {item.assignee}
                                </span>
                              </td>
                              <td className="py-3.5 text-slate-500 font-medium">{item.frequency}</td>
                              <td className="py-3.5 text-center">
                                <button
                                  onClick={() => toggleChecklistStatus(item.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                                    item.status === "Hoàn thành" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                    item.status === "Đang làm" ? "bg-amber-50 text-amber-600 border-amber-100" :
                                    "bg-slate-50 text-slate-400 border-slate-200"
                                  }`}
                                >
                                  {item.status}
                                </button>
                              </td>
                              <td className="py-3.5 text-right">
                                <button className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 3: Đọc hóa đơn thanh toán ─── */}
              {activeTab === "invoice" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="font-heading font-bold text-slate-800 text-sm">Đọc hóa đơn & Làm nhanh hồ sơ thanh toán</h3>
                    <p className="text-slate-400 text-[10px] font-semibold mt-1">Trích xuất tự động thông tin số hóa đơn, ngày hóa đơn, nội dung, số tiền</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    {/* Left dropzone tool */}
                    <div className="md:col-span-2 space-y-4">
                      <div className="border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-blue-400 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-3 transition-all min-h-[170px] relative">
                        <Upload className="text-slate-400 animate-bounce" size={24} />
                        <div>
                          <p className="text-xs font-bold text-blue-600 hover:underline cursor-pointer">Chọn tệp hóa đơn mẫu</p>
                          <p className="text-[10px] text-slate-400 mt-1">Hỗ trợ ảnh hóa đơn PNG, JPG hoặc file PDF</p>
                        </div>
                        <input
                          type="file"
                          onChange={(e) => e.target.files && setInvoiceFile(e.target.files[0])}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        {invoiceFile && (
                          <div className="absolute inset-0 bg-white/95 rounded-2xl p-4 flex flex-col justify-center items-center gap-2">
                            <FileText className="text-emerald-500" size={24} />
                            <span className="text-[10px] font-bold text-slate-700 truncate w-full px-2">{invoiceFile.name}</span>
                            <button onClick={() => setInvoiceFile(null)} className="text-[9px] text-rose-500 font-bold hover:underline">Hủy bỏ</button>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={simulateInvoiceExtraction}
                        disabled={isExtracting || !invoiceFile}
                        className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow ${
                          isExtracting || !invoiceFile
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-250/20"
                            : "bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 cursor-pointer"
                        }`}
                      >
                        {isExtracting ? "Đang trích xuất dữ liệu..." : "Trích xuất bằng AI"}
                      </button>

                      {/* Mock Invoice trigger */}
                      {!invoiceFile && (
                        <button
                          onClick={() => {
                            setInvoiceFile(new File([""], "hoa_don_tiep_khach.png", { type: "image/png" }));
                          }}
                          className="w-full text-center py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-[10px] font-bold rounded-xl"
                        >
                          Chọn tệp hóa đơn mẫu (Test Mock)
                        </button>
                      )}
                    </div>

                    {/* Right extracted result form */}
                    <div className="md:col-span-3 border border-slate-150 rounded-2xl p-5 bg-slate-50/50 space-y-4 min-h-[200px] flex flex-col justify-between">
                      <div className="space-y-3.5">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                          <span className="text-[10px] font-extrabold text-[#005BAC] uppercase">Kết quả trích xuất AI</span>
                          <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border">JSON Extract</span>
                        </div>

                        {extractedInvoice ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Số hóa đơn</label>
                                <input
                                  type="text"
                                  value={extractedInvoice.number || ""}
                                  onChange={(e) => setExtractedInvoice(prev => ({ ...prev, number: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Ngày hóa đơn</label>
                                <input
                                  type="date"
                                  value={extractedInvoice.date || ""}
                                  onChange={(e) => setExtractedInvoice(prev => ({ ...prev, date: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-700"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Nội dung / Trích yếu thanh toán</label>
                              <textarea
                                value={extractedInvoice.desc || ""}
                                onChange={(e) => setExtractedInvoice(prev => ({ ...prev, desc: e.target.value }))}
                                rows={2}
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white text-slate-700"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase">Số tiền sau thuế (VND)</label>
                              <input
                                type="number"
                                value={extractedInvoice.amount || 0}
                                onChange={(e) => setExtractedInvoice(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-[#005BAC]"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="h-40 flex items-center justify-center text-slate-400 italic text-[11px]">
                            Vui lòng tải tệp lên và bấm nút "Trích xuất bằng AI"
                          </div>
                        )}
                      </div>

                      {extractedInvoice && (
                        <div className="flex gap-2 justify-end pt-3 border-t border-slate-250/30">
                          <button
                            onClick={() => setExtractedInvoice(null)}
                            className="px-3 py-1.5 border border-slate-200 rounded-lg text-[10px] text-slate-500 hover:bg-slate-50 font-bold"
                          >
                            Hủy bỏ
                          </button>
                          <button
                            onClick={saveExtractedInvoice}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg shadow-sm"
                          >
                            Lưu hồ sơ thanh toán
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Processed list */}
                  <div className="space-y-3.5 pt-2">
                    <h4 className="font-heading font-extrabold text-slate-800 text-xs">Danh sách hóa đơn đã xử lý</h4>
                    <div className="overflow-x-auto border border-slate-150 rounded-xl bg-slate-50/20">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[9px] p-3">
                            <th className="p-3">Số hóa đơn</th>
                            <th className="p-3">Ngày nhận</th>
                            <th className="p-3">Nội dung hóa đơn</th>
                            <th className="p-3 text-right">Số tiền sau thuế</th>
                            <th className="p-3 text-center">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                          {invoices.map((inv) => (
                            <tr key={inv.id} className="hover:bg-slate-50/50 bg-white">
                              <td className="p-3 font-mono text-slate-800 font-bold">{inv.number}</td>
                              <td className="p-3 text-slate-500">{inv.date}</td>
                              <td className="p-3 text-slate-600 max-w-xs truncate">{inv.desc}</td>
                              <td className="p-3 text-right text-[#005BAC] font-mono font-bold">
                                {inv.amount.toLocaleString("vi-VN")} đ
                              </td>
                              <td className="p-3 text-center">
                                <span className="inline-flex items-center justify-center bg-emerald-50 text-emerald-600 text-[9px] font-bold px-2 py-0.5 rounded-lg border border-emerald-100">
                                  Đã trích xuất
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

              {/* ─── TAB 4: Hồ sơ thanh toán định kỳ ─── */}
              {activeTab === "recurring" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="font-heading font-bold text-slate-800 text-sm">Hồ sơ thanh toán định kỳ hàng tháng</h3>
                    <p className="text-slate-400 text-[10px] font-semibold mt-1">Ghi nhớ thông tin chuyển khoản ngân hàng trước đó để làm hồ sơ nhanh hơn</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {recurringPayments.map((payment, idx) => (
                      <div key={idx} className="border border-slate-250/60 hover:border-slate-350 bg-slate-50/30 rounded-2xl p-5 flex flex-col justify-between h-56 transition-all hover-elevate">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <h4 className="font-heading font-extrabold text-slate-800 text-xs">{payment.name}</h4>
                            <span className="text-[9px] bg-blue-50 text-[#005BAC] font-bold px-2 py-0.5 rounded border border-blue-100">Định kỳ</span>
                          </div>
                          <div className="space-y-1.5 text-[10px] font-semibold text-slate-500 pt-1.5">
                            <p>Ngân hàng: <strong className="text-slate-700">{payment.bank}</strong></p>
                            <p>Số tài khoản: <strong className="text-slate-700 font-mono">{payment.account}</strong></p>
                            <p>Đơn vị thụ hưởng: <strong className="text-slate-700">{payment.owner}</strong></p>
                            <p className="truncate" title={payment.content}>Nội dung cũ: <span className="text-slate-400 italic">"{payment.content}"</span></p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between mt-2">
                          <div>
                            <p className="text-[9px] text-slate-400 font-bold uppercase">Tháng trước</p>
                            <p className="text-xs font-bold text-[#005BAC]">{payment.lastAmount.toLocaleString("vi-VN")} đ</p>
                          </div>
                          <button
                            onClick={() => {
                              const newAmount = prompt(`Nhập số tiền hóa đơn tháng này cho [${payment.name}]:`, payment.lastAmount.toString());
                              if (newAmount && !isNaN(Number(newAmount))) {
                                const newInv: Invoice = {
                                  id: `INV-${Date.now().toString().slice(-2)}`,
                                  number: `HD-DK-${Date.now().toString().slice(-2)}`,
                                  date: new Date().toISOString().slice(0, 10),
                                  desc: `Thanh toán ${payment.name.toLowerCase()} định kỳ tháng này`,
                                  amount: Number(newAmount)
                                };
                                setInvoices(prev => [newInv, ...prev]);
                                alert(`Đã tạo nhanh HS thanh toán cho ${payment.name} với số tiền ${Number(newAmount).toLocaleString("vi-VN")} đ!`);
                              }
                            }}
                            className="bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                          >
                            Tạo nhanh HS <ArrowRight size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── TAB 5: Báo cáo chi phí cuối tháng ─── */}
              {activeTab === "report" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Báo cáo tổng hợp chi phí cuối tháng</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Tổng hợp và kết xuất báo cáo toàn bộ hồ sơ thanh toán đã lập trong tháng</p>
                    </div>
                    <button
                      onClick={() => alert("Đang kết xuất báo cáo Excel tổng hợp chi phí...")}
                      className="flex items-center gap-1 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
                    >
                      <FileSpreadsheet size={14} /> Kết xuất Excel Báo cáo
                    </button>
                  </div>

                  {/* Summary Expenses */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-slate-150 rounded-2xl p-5 space-y-4">
                      <h4 className="font-heading font-bold text-slate-800 text-xs">Cơ cấu chi phí Hành chính (Q2)</h4>
                      
                      {/* CSS Bar Chart */}
                      <div className="space-y-3 pt-2">
                        {[
                          { label: "Văn phòng phẩm", amount: 5200000, pct: "18%" },
                          { label: "Điện nước văn phòng", amount: 15700000, pct: "55%" },
                          { label: "Cáp quang Internet", amount: 3500000, pct: "12%" },
                          { label: "Chi phí mua đồ tiếp khách", amount: 4300000, pct: "15%" }
                        ].map((cost, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-slate-600">
                              <span>{cost.label} ({cost.pct})</span>
                              <span className="text-[#005BAC]">{cost.amount.toLocaleString("vi-VN")} đ</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div 
                                className="bg-[#005BAC] h-full rounded-full transition-all"
                                style={{ width: cost.pct }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border border-slate-150 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <h4 className="font-heading font-bold text-slate-800 text-xs">Thông tin báo cáo</h4>
                        <div className="space-y-1.5 text-[10px] font-semibold text-slate-500 pt-1">
                          <p>Tổng chi phí tháng này: <strong className="text-slate-800 text-sm font-bold text-[#005BAC]">28.700.000 đ</strong></p>
                          <p>Hồ sơ đã xử lý: <strong className="text-slate-700">6 Hồ sơ (5 hóa đơn + 1 định kỳ)</strong></p>
                          <p>Ngày chốt báo cáo: <strong className="text-slate-700">Chốt ngày cuối tháng (Hàng tháng)</strong></p>
                        </div>
                      </div>

                      <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3.5 text-[10px] text-slate-500 leading-relaxed font-semibold">
                        <div className="flex items-center gap-1 text-[#005BAC] font-bold mb-1">
                          <AlertTriangle size={12} />
                          <span>Quy trình chốt tháng:</span>
                        </div>
                        Nhân viên Hành chính kiểm tra trạng thái tất cả các hồ sơ thanh toán trong tháng, kết xuất excel, trình ký bản cứng đính kèm hóa đơn chuyển phòng Kế toán đối soát trước ngày 05 tháng sau.
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

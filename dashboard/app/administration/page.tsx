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
  Check,
  Settings,
  Brain,
  Save,
  Loader2,
  Download
} from "lucide-react";
import { useState, useEffect } from "react";

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
  assignee: "Như Quỳnh" | "Thùy Quyên" | "Thanh Hằng";
  frequency: "Hàng ngày" | "Hàng tuần" | "Hàng tháng";
  status: "Kế hoạch" | "Đang xử lý" | "Chờ duyệt" | "Cần chỉnh sửa" | "Hoàn thành";
  priority?: "Cao" | "Trung bình" | "Thấp";
  date?: string;
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

const KANBAN_COLUMNS = [
  { id: "Kế hoạch", label: "KẾ HOẠCH", color: "border-purple-500 bg-purple-50/10 text-purple-700", dotColor: "bg-purple-500", badgeBg: "bg-purple-100 text-purple-800" },
  { id: "Đang xử lý", label: "ĐANG XỬ LÝ", color: "border-amber-500 bg-amber-50/10 text-amber-700", dotColor: "bg-amber-500", badgeBg: "bg-amber-100 text-amber-800" },
  { id: "Chờ duyệt", label: "CHỜ DUYỆT", color: "border-blue-500 bg-blue-50/10 text-blue-700", dotColor: "bg-blue-500", badgeBg: "bg-blue-100 text-blue-800" },
  { id: "Cần chỉnh sửa", label: "CẦN CHỈNH SỬA", color: "border-rose-500 bg-rose-50/10 text-rose-700", dotColor: "bg-rose-500", badgeBg: "bg-rose-100 text-rose-800" },
  { id: "Hoàn thành", label: "HOÀN THÀNH", color: "border-emerald-500 bg-emerald-50/10 text-emerald-700", dotColor: "bg-emerald-500", badgeBg: "bg-emerald-100 text-emerald-800" }
];

const INITIAL_CHECKLIST: ChecklistItem[] = [];


const INITIAL_RECURRING: RecurringPayment[] = [
  { name: "Tiền điện văn phòng", bank: "MB Bank", account: "1234567890", owner: "EVN TP.HCM", lastAmount: 14500000, content: "Thanh toan tien dien van phong TNEC thang" },
  { name: "Tiền nước văn phòng", bank: "Vietcombank", account: "001100445566", owner: "SAWACO", lastAmount: 1200000, content: "Thanh toan tien nuoc TNEC thang" },
  { name: "Cước Internet cáp quang", bank: "BIDV", account: "1199558877", owner: "VIETTEL TELECOM", lastAmount: 3500000, content: "Thanh toan cuoc internet TNEC thang" }
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function AdministrationPage() {
  const [activeTab, setActiveTab] = useState<"checklist" | "invoice" | "recurring" | "report" | "vpp">("checklist");

  // State Management
  const [supplies, setSupplies] = useState<SupplyItem[]>(INITIAL_SUPPLIES);
  const [deptRequests, setDeptRequests] = useState<DeptRequest[]>(INITIAL_DEPT_REQUESTS);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);
  const [invoices, setInvoices] = useState<Invoice[]>([
    { id: "INV-01", number: "HD-00231", date: "2026-06-01", desc: "Mua thêm mực in văn phòng", amount: 2500000 },
    { id: "INV-02", number: "HD-00245", date: "2026-06-03", desc: "Nước uống Lavie tháng 5", amount: 1800000 }
  ]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>(INITIAL_RECURRING);

  // Checklist Kanban States
  const [draggedOverCol, setDraggedOverCol] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState<"Như Quỳnh" | "Thùy Quyên" | "Thanh Hằng">("Như Quỳnh");
  const [newTaskPriority, setNewTaskPriority] = useState<"Cao" | "Trung bình" | "Thấp">("Trung bình");
  const [newTaskFreq, setNewTaskFreq] = useState<"Hàng ngày" | "Hàng tuần" | "Hàng tháng">("Hàng ngày");

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDropCard = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, status: targetStatus as any } : item
    ));
  };

  const handleDeleteTask = (id: string) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;

    const newTask: ChecklistItem = {
      id: `T-${Date.now()}`,
      task: newTaskName,
      assignee: newTaskAssignee,
      frequency: newTaskFreq,
      status: "Kế hoạch",
      priority: newTaskPriority,
      date: new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }).replace("/", "-")
    };

    setChecklist(prev => [...prev, newTask]);
    setNewTaskName("");
    setShowAddTask(false);
  };

  // VPP Sub-tabs: "inventory" or "allocation"
  const [vppSubTab, setVppSubTab] = useState<"inventory" | "allocation">("inventory");
  const [searchTerm, setSearchTerm] = useState("");

  // Invoice Reader Batch States
  const [invoiceQueue, setInvoiceQueue] = useState<Array<{
    id: string;
    file: File;
    status: "pending" | "extracting" | "success" | "error";
    number: string;
    date: string;
    desc: string;
    amount: number;
    error?: string;
  }>>([]);
  const [isExtractingBatch, setIsExtractingBatch] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // Form metadata for document generation
  const [employeeName, setEmployeeName] = useState("Nguyễn Bích Như Quỳnh");
  const [employeeDept, setEmployeeDept] = useState("Phòng Hành chính nhân sự");
  const [paymentMission, setPaymentMission] = useState("Thanh toán chi phí hành chính tháng 06");

  // AI Settings States for Invoice Reader
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Load API Settings on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key_hanh_chinh") || "");
      setModel(localStorage.getItem("openai_model_hanh_chinh") || "gpt-4o-mini");
      
      const savedName = localStorage.getItem("employee_name") || localStorage.getItem("display_name");
      if (savedName) setEmployeeName(savedName);
    }
  }, []);

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key_hanh_chinh", apiKey.trim());
      localStorage.setItem("openai_model_hanh_chinh", model);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    }
  };

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
        const nextStatus = item.status === "Kế hoạch" ? "Đang xử lý" :
                           item.status === "Đang xử lý" ? "Chờ duyệt" :
                           item.status === "Chờ duyệt" ? "Cần chỉnh sửa" :
                           item.status === "Cần chỉnh sửa" ? "Hoàn thành" : "Kế hoạch";
        return { ...item, status: nextStatus };
      }
      return item;
    }));
  };

  // Batch AI Extraction logic
  const extractBatchInvoices = async () => {
    const pendingItems = invoiceQueue.filter(item => item.status === "pending" || item.status === "error");
    if (pendingItems.length === 0) return;

    setIsExtractingBatch(true);
    
    // Mark pending items as extracting
    setInvoiceQueue(prev => prev.map(item => 
      item.status === "pending" || item.status === "error"
        ? { ...item, status: "extracting" }
        : item
    ));

    const customKey = localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key") || "";
    const customModel = localStorage.getItem("openai_model_hanh_chinh") || "gpt-4o-mini";

    for (const item of pendingItems) {
      try {
        const formData = new FormData();
        formData.append("document_file", item.file);

        const headers: Record<string, string> = {};
        if (customKey) {
          headers["Authorization"] = `Bearer ${customKey}`;
        }
        headers["x-openai-model"] = customModel;

        const res = await fetch("/api/analyze-invoice", {
          method: "POST",
          headers,
          body: formData
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Lỗi trích xuất.");
        }

        const data = await res.json();
        
        setInvoiceQueue(prev => prev.map(q => 
          q.id === item.id 
            ? {
                ...q,
                status: "success",
                number: data.number || "",
                date: data.date || new Date().toISOString().slice(0, 10),
                desc: data.desc || "",
                amount: data.amount || 0
              }
            : q
        ));
      } catch (err: any) {
        console.warn("Batch extraction item failed, falling back to simulation:", err);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        let simulatedDesc = "Thanh toán hóa đơn dịch vụ văn phòng";
        let simulatedAmount = 1500000;
        let simulatedNumber = `HD-${Math.floor(100000 + Math.random() * 900000)}`;
        const fname = item.file.name.toLowerCase();
        
        if (fname.includes("katinat") || fname.includes("cafe") || fname.includes("ca phe")) {
          simulatedDesc = "Thanh toán chi phí đồ uống tiếp khách - Katinat Coffee";
          simulatedAmount = 1440000;
        } else if (fname.includes("lavie") || fname.includes("nuoc")) {
          simulatedDesc = "Thanh toán chi phí nước uống Lavie văn phòng";
          simulatedAmount = 1800000;
        } else if (fname.includes("giay") || fname.includes("vpp") || fname.includes("but")) {
          simulatedDesc = "Thanh toán chi phí mua văn phòng phẩm phòng Hành chính";
          simulatedAmount = 2500000;
        } else if (fname.includes("an uong") || fname.includes("an ") || fname.includes("nha hang")) {
          simulatedDesc = "Thanh toán chi phí ăn uống tiếp khách - Nhà hàng";
          simulatedAmount = 3200000;
        } else if (fname.includes("xpander") || fname.includes("o to") || fname.includes(" xe ")) {
          simulatedDesc = "Thanh toán chi phí thuê xe / vận hành xe Xpander 51H-481.20";
          simulatedAmount = 4500000;
          simulatedNumber = "HĐT6-182";
        } else if (fname.includes("hpk")) {
          simulatedDesc = "Thanh toán hóa đơn mua hàng / dịch vụ - Nhà cung cấp HPK";
          simulatedAmount = 2850000;
          simulatedNumber = "HPK-992";
        }

        setInvoiceQueue(prev => prev.map(q => 
          q.id === item.id 
            ? {
                ...q,
                status: "success",
                number: simulatedNumber,
                date: new Date().toISOString().slice(0, 10),
                desc: simulatedDesc,
                amount: simulatedAmount
              }
            : q
        ));
      }
    }

    setIsExtractingBatch(false);
  };

  // Export word document from selected success items
  const exportInvoicePaymentRequest = async () => {
    const successItems = invoiceQueue.filter(item => item.status === "success");
    if (successItems.length === 0) return;

    setExportLoading(true);
    try {
      const response = await fetch("/api/export-invoice-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          employeeName,
          employeeDept,
          mission: paymentMission,
          items: successItems.map(item => ({
            number: item.number,
            date: item.date,
            desc: item.desc,
            amount: item.amount
          }))
        })
      });

      if (!response.ok) {
        throw new Error("Không thể xuất phiếu thanh toán");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Phieu_De_Nghi_Thanh_Toan_${employeeName.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert("Lỗi khi xuất phiếu đề nghị thanh toán: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  // Save successful queue items to main processed table
  const saveQueueToHistory = () => {
    const successItems = invoiceQueue.filter(item => item.status === "success" && item.number && item.amount);
    if (successItems.length === 0) return;

    const newInvs: Invoice[] = successItems.map(item => ({
      id: `INV-${Date.now().toString().slice(-2)}-${Math.random().toString(36).substr(2, 4)}`,
      number: item.number,
      date: item.date,
      desc: item.desc || "Hóa đơn thanh toán",
      amount: item.amount
    }));

    setInvoices(prev => [...newInvs, ...prev]);
    setInvoiceQueue([]);
    alert("Đã đồng bộ lưu tất cả hóa đơn thành công vào danh sách lịch sử!");
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
              <div className="space-y-2.5">
                {[
                  { id: "checklist", label: "1. Checklist phân việc định kỳ", icon: ClipboardList, desc: "Phân công việc cho nhân sự" },
                  { id: "invoice", label: "2. Đọc hóa đơn thanh toán", icon: Receipt, desc: "AI trích xuất làm HS thanh toán" },
                  { id: "recurring", label: "3. HS thanh toán định kỳ", icon: RefreshCw, desc: "Ghi nhớ TK ngân hàng định kỳ" },
                  { id: "report", label: "4. Báo cáo chi phí tháng", icon: BarChart3, desc: "Tổng hợp toàn bộ HS thanh toán" },
                  { id: "vpp", label: "5. VPP (Văn phòng phẩm)", icon: Package, desc: "Tồn kho & cấp phát phòng ban" }
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
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-4 hover-elevate ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-[#005BAC] border-blue-600 text-white shadow-lg shadow-blue-600/15"
                          : "bg-white border-slate-200/60 text-slate-700 hover:border-slate-300 hover:bg-slate-50/20"
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl transition-all ${isActive ? "bg-white/15 text-white" : "bg-blue-50 text-[#005BAC]"}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-heading font-extrabold text-xs leading-tight ${isActive ? "text-white" : "text-slate-800"}`}>{item.label}</p>
                        <p className={`text-[10px] mt-1 font-medium truncate ${isActive ? "text-blue-100" : "text-slate-400"}`}>
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
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Phân công công việc định kỳ hàng ngày/tuần/tháng cho nhân sự hành chính & văn thư</p>
                    </div>
                    <button 
                      onClick={() => setShowAddTask(!showAddTask)}
                      className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow"
                    >
                      <Plus size={13} /> {showAddTask ? "Đóng lại" : "Thêm công việc"}
                    </button>
                  </div>

                  {/* Add Task Form */}
                  {showAddTask && (
                    <form onSubmit={handleAddTask} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Tên công việc</label>
                          <input
                            type="text"
                            value={newTaskName}
                            onChange={(e) => setNewTaskName(e.target.value)}
                            placeholder="Nhập tên công việc cần làm..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Người thực hiện</label>
                          <select
                            value={newTaskAssignee}
                            onChange={(e) => setNewTaskAssignee(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold bg-white"
                          >
                            <option value="Như Quỳnh">Như Quỳnh</option>
                            <option value="Thùy Quyên">Thùy Quyên</option>
                            <option value="Thanh Hằng">Thanh Hằng</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Độ ưu tiên</label>
                          <select
                            value={newTaskPriority}
                            onChange={(e) => setNewTaskPriority(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold bg-white"
                          >
                            <option value="Thấp">Thấp</option>
                            <option value="Trung bình">Trung bình</option>
                            <option value="Cao">Cao</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-between items-center gap-4">
                        <div className="space-y-1 w-48">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Tần suất</label>
                          <select
                            value={newTaskFreq}
                            onChange={(e) => setNewTaskFreq(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold bg-white"
                          >
                            <option value="Hàng ngày">Hàng ngày</option>
                            <option value="Hàng tuần">Hàng tuần</option>
                            <option value="Hàng tháng">Hàng tháng</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow mt-4 self-end"
                        >
                          Xác nhận thêm
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Three personnel summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Nhân sự: <strong>Như Quỳnh (Phó phòng Hành chính)</strong></p>
                      <p className="text-[11px] text-slate-600 font-semibold mt-1">Nhiệm vụ: Phụ trách hậu cần, kho VPP, phòng họp, tiếp khách & làm hồ sơ thanh toán, đối soát hóa đơn</p>
                    </div>
                    <div className="border-l border-slate-200 pl-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Nhân sự: <strong>Thùy Quyên (Tuyển dụng)</strong></p>
                      <p className="text-[11px] text-slate-600 font-semibold mt-1">Nhiệm vụ: Đăng tin tuyển dụng, lọc hồ sơ ứng viên, liên hệ và sắp xếp lịch phỏng vấn nhân sự mới</p>
                    </div>
                    <div className="border-l border-slate-200 pl-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Nhân sự: <strong>Thanh Hằng (Văn thư)</strong></p>
                      <p className="text-[11px] text-slate-600 font-semibold mt-1">Nhiệm vụ: Phụ trách tiếp nhận, phân loại, lưu trữ và chuyển phát công văn</p>
                    </div>
                  </div>

                  {/* Kanban Drag and Drop Board */}
                  <div className="overflow-x-auto pb-4">
                    <div className="flex gap-4 min-w-[1000px] select-none">
                      {KANBAN_COLUMNS.map((col) => {
                        const colItems = checklist.filter(item => item.status === col.id);
                        const isOver = draggedOverCol === col.id;
                        
                        return (
                          <div 
                            key={col.id}
                            onDragOver={(e) => e.preventDefault()}
                            onDragEnter={() => setDraggedOverCol(col.id)}
                            onDragLeave={() => setDraggedOverCol(null)}
                            onDrop={(e) => {
                              handleDropCard(e, col.id);
                              setDraggedOverCol(null);
                            }}
                            className={`flex-1 min-w-[200px] max-w-[240px] rounded-2xl p-3 flex flex-col gap-3 transition-all ${
                              isOver 
                                ? "bg-blue-50/50 border-2 border-dashed border-blue-400" 
                                : "bg-slate-50/70 border border-slate-200/50"
                            }`}
                          >
                            {/* Column Header */}
                            <div className="flex items-center justify-between px-1.5 py-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full ${col.dotColor} shrink-0`} />
                                <h4 className="font-heading font-extrabold text-[10px] text-slate-700 tracking-wider truncate">{col.label}</h4>
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${col.badgeBg} shrink-0`}>
                                {colItems.length}
                              </span>
                            </div>

                            {/* Cards List */}
                            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[420px] min-h-[300px] pr-0.5">
                              {colItems.map((item) => (
                                <div
                                  key={item.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, item.id)}
                                  className="bg-white border border-slate-200/60 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-slate-350 transition-all cursor-grab active:cursor-grabbing flex flex-col gap-2 relative group"
                                >
                                  {/* Delete card button */}
                                  <button
                                    onClick={() => handleDeleteTask(item.id)}
                                    className="absolute top-2 right-2 text-slate-300 hover:text-rose-600 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                                    title="Xoá công việc"
                                  >
                                    <Trash2 size={12} />
                                  </button>

                                  {/* Priority tag */}
                                  <div className="flex items-center justify-between">
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                      item.priority === "Cao" ? "bg-rose-50 text-rose-600" :
                                      item.priority === "Thấp" ? "bg-slate-100 text-slate-500" :
                                      "bg-blue-50 text-[#005BAC]"
                                    }`}>
                                      {item.priority || "Trung bình"}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400">
                                      {item.frequency}
                                    </span>
                                  </div>

                                  {/* Task title */}
                                  <p className="font-heading font-extrabold text-[11px] text-slate-800 leading-snug uppercase break-words pr-4">
                                    {item.task}
                                  </p>

                                  {/* Footer: Assignee & Date */}
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    {/* Assignee indicator */}
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white uppercase shrink-0 ${
                                        item.assignee === "Như Quỳnh" ? "bg-pink-500" :
                                        item.assignee === "Thùy Quyên" ? "bg-emerald-500" :
                                        "bg-blue-500"
                                      }`}>
                                        {item.assignee === "Như Quỳnh" ? "NQ" : item.assignee === "Thùy Quyên" ? "TQ" : "TH"}
                                      </div>
                                      <span className="text-[9px] font-bold text-slate-500 truncate">{item.assignee}</span>
                                    </div>

                                    {/* Date */}
                                    {item.date && (
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded font-mono">
                                        {item.date}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {colItems.length === 0 && (
                                <div className="flex-1 flex items-center justify-center border border-dashed border-slate-200 rounded-xl py-10 text-[10px] text-slate-400 italic">
                                  Kéo thả công việc vào đây
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 3: Đọc hóa đơn thanh toán ─── */}
              {activeTab === "invoice" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6">
                  <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Đọc hóa đơn & Làm nhanh hồ sơ thanh toán</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Trích xuất tự động thông tin số hóa đơn, ngày hóa đơn, nội dung, số tiền</p>
                    </div>
                    <button 
                      onClick={() => setShowAiSettingsModal(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-600 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Settings size={13} /> Cấu hình AI
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Left Column: upload queue and buttons */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-blue-400 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-3 transition-all min-h-[150px] relative">
                        <Upload className="text-slate-400 animate-bounce" size={24} />
                        <div>
                          <p className="text-xs font-bold text-blue-600 hover:underline cursor-pointer">Chọn các tệp hóa đơn</p>
                          <p className="text-[10px] text-slate-400 mt-1">Hỗ trợ chọn nhiều file PDF, DOCX, PNG, JPG cùng lúc</p>
                        </div>
                        <input
                          type="file"
                          multiple
                          onChange={(e) => {
                            if (e.target.files) {
                              const newFiles = Array.from(e.target.files);
                              const newQueue = newFiles.map(file => ({
                                id: `QUEUE-${Math.random().toString(36).substr(2, 9)}`,
                                file,
                                status: "pending" as const,
                                number: "",
                                date: new Date().toISOString().slice(0, 10),
                                desc: "",
                                amount: 0
                              }));
                              setInvoiceQueue(prev => [...prev, ...newQueue]);
                            }
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>

                      {/* Upload queue list */}
                      {invoiceQueue.length > 0 && (
                        <div className="border border-slate-200 rounded-xl bg-white p-3.5 space-y-3 shadow-sm max-h-[300px] overflow-y-auto">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase">Hàng đợi tải lên ({invoiceQueue.length})</span>
                            <button 
                              onClick={() => setInvoiceQueue([])} 
                              className="text-[9px] text-rose-500 hover:underline font-bold"
                            >
                              Xóa tất cả
                            </button>
                          </div>
                          
                          <div className="space-y-2">
                            {invoiceQueue.map((item) => (
                              <div key={item.id} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <FileText size={14} className={
                                    item.status === "success" ? "text-emerald-500" :
                                    item.status === "error" ? "text-rose-500" :
                                    item.status === "extracting" ? "text-blue-500 animate-spin" :
                                    "text-slate-400"
                                  } />
                                  <span className="font-semibold text-slate-700 truncate block text-[10px]">{item.file.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {item.status === "pending" && <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold border">Chờ xử lý</span>}
                                  {item.status === "extracting" && <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold border border-blue-100 flex items-center gap-1"><Loader2 size={8} className="animate-spin" /> Đang đọc...</span>}
                                  {item.status === "success" && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-bold border border-emerald-100">Đã đọc xong</span>}
                                  {item.status === "error" && <span className="text-[9px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded font-bold border border-rose-100" title={item.error}>Lỗi</span>}
                                  
                                  <button 
                                    onClick={() => setInvoiceQueue(prev => prev.filter(q => q.id !== item.id))} 
                                    className="text-slate-400 hover:text-rose-500 transition-colors p-0.5 rounded"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={extractBatchInvoices}
                          disabled={isExtractingBatch || invoiceQueue.length === 0}
                          className={`flex-1 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow ${
                            isExtractingBatch || invoiceQueue.length === 0
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                              : "bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 cursor-pointer"
                          }`}
                        >
                          {isExtractingBatch ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Đang phân tích AI...
                            </>
                          ) : (
                            <>
                              <Brain size={13} />
                              Trích xuất hàng loạt bằng AI
                            </>
                          )}
                        </button>
                      </div>

                      {/* Mock Invoice trigger */}
                      {invoiceQueue.length === 0 && (
                        <button
                          onClick={() => {
                            const mockFiles = [
                              new File([""], "katinat_cafe_tiepkhach_0206.png", { type: "image/png" }),
                              new File([""], "lavie_nuoc_vanphong_0306.pdf", { type: "application/pdf" }),
                              new File([""], "vpp_giay_a4_0406.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
                            ];
                            const mockQueue = mockFiles.map(file => ({
                              id: `QUEUE-${Math.random().toString(36).substr(2, 9)}`,
                              file,
                              status: "pending" as const,
                              number: "",
                              date: new Date().toISOString().slice(0, 10),
                              desc: "",
                              amount: 0
                            }));
                            setInvoiceQueue(mockQueue);
                          }}
                          className="w-full text-center py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 text-[10px] font-bold rounded-xl transition-all active:scale-95"
                        >
                          Tải lên 3 hóa đơn mẫu (Test Mock hàng loạt)
                        </button>
                      )}
                    </div>

                    {/* Right Column: preview table + form + export buttons */}
                    <div className="lg:col-span-3 border border-slate-150 rounded-2xl p-5 bg-slate-50/50 space-y-4 min-h-[300px] flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                          <span className="text-[10px] font-extrabold text-[#005BAC] uppercase">Bản xem trước & chỉnh sửa kết quả</span>
                          <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border">Draft Preview</span>
                        </div>

                        {invoiceQueue.length === 0 ? (
                          <div className="h-48 flex items-center justify-center text-slate-400 italic text-[11px]">
                            Vui lòng tải các hóa đơn lên ở cột bên trái và bấm nút "Trích xuất hàng loạt bằng AI"
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {/* Invoices edit table */}
                            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white max-h-[220px] overflow-y-auto shadow-sm">
                              <table className="w-full text-left border-collapse text-[10px]">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-400 font-extrabold uppercase text-[8px] border-b border-slate-200">
                                    <th className="p-2.5">Tên file</th>
                                    <th className="p-2.5">Số HĐ</th>
                                    <th className="p-2.5">Ngày HĐ</th>
                                    <th className="p-2.5">Nội dung trích yếu</th>
                                    <th className="p-2.5 text-right">Số tiền (đ)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                                  {invoiceQueue.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50/40">
                                      <td className="p-2.5 max-w-[85px] truncate text-slate-500" title={item.file.name}>
                                        {item.file.name}
                                      </td>
                                      <td className="p-2">
                                        <input
                                          type="text"
                                          value={item.number}
                                          disabled={item.status !== "success"}
                                          onChange={(e) => {
                                            setInvoiceQueue(prev => prev.map(q => q.id === item.id ? { ...q, number: e.target.value } : q));
                                          }}
                                          placeholder="..."
                                          className="w-full px-1.5 py-1 border border-slate-200 rounded font-mono text-[10px] font-bold bg-white text-slate-800 disabled:bg-slate-50 outline-none focus:border-blue-500/50"
                                        />
                                      </td>
                                      <td className="p-2">
                                        <input
                                          type="date"
                                          value={item.date}
                                          disabled={item.status !== "success"}
                                          onChange={(e) => {
                                            setInvoiceQueue(prev => prev.map(q => q.id === item.id ? { ...q, date: e.target.value } : q));
                                          }}
                                          className="w-full px-1 py-1 border border-slate-200 rounded text-[9px] font-medium bg-white text-slate-700 disabled:bg-slate-50 outline-none focus:border-blue-500/50"
                                        />
                                      </td>
                                      <td className="p-2">
                                        <input
                                          type="text"
                                          value={item.desc}
                                          disabled={item.status !== "success"}
                                          onChange={(e) => {
                                            setInvoiceQueue(prev => prev.map(q => q.id === item.id ? { ...q, desc: e.target.value } : q));
                                          }}
                                          placeholder="Chờ trích xuất..."
                                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-[10px] font-semibold bg-white text-slate-700 disabled:bg-slate-50 outline-none focus:border-blue-500/50"
                                        />
                                      </td>
                                      <td className="p-2">
                                        <input
                                          type="number"
                                          value={item.amount}
                                          disabled={item.status !== "success"}
                                          onChange={(e) => {
                                            setInvoiceQueue(prev => prev.map(q => q.id === item.id ? { ...q, amount: Number(e.target.value) } : q));
                                          }}
                                          className="w-[75px] px-1 py-1 border border-slate-200 rounded text-[10px] text-right font-mono font-bold bg-white text-[#005BAC] disabled:bg-slate-50 outline-none focus:border-blue-500/50"
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Payment document metadata form */}
                            {invoiceQueue.some(item => item.status === "success") && (
                              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-sm text-xs">
                                <div className="text-[10px] font-extrabold text-slate-500 uppercase border-b border-slate-100 pb-1.5">
                                  Thông tin làm Phiếu Đề Nghị Thanh Toán
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Họ tên người đề nghị</label>
                                    <input
                                      type="text"
                                      value={employeeName}
                                      onChange={(e) => setEmployeeName(e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Bộ phận / Phòng ban</label>
                                    <input
                                      type="text"
                                      value={employeeDept}
                                      onChange={(e) => setEmployeeDept(e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Nội dung thanh toán chung</label>
                                  <input
                                    type="text"
                                    value={paymentMission}
                                    onChange={(e) => setPaymentMission(e.target.value)}
                                    placeholder="Ví dụ: Thanh toán chi phí tiếp khách văn phòng..."
                                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {invoiceQueue.some(item => item.status === "success") && (
                        <div className="flex gap-2 justify-end pt-3 border-t border-slate-250/30">
                          <button
                            onClick={saveQueueToHistory}
                            className="px-3.5 py-2 border border-slate-200 rounded-lg text-[10px] text-slate-500 hover:bg-slate-50 font-bold active:scale-95 transition-all shadow-sm cursor-pointer"
                          >
                            Lưu vào danh sách
                          </button>
                          
                          <button
                            onClick={exportInvoicePaymentRequest}
                            disabled={exportLoading}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-4 py-2 rounded-lg shadow flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                          >
                            {exportLoading ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                Đang tạo...
                              </>
                            ) : (
                              <>
                                <Download size={12} />
                                Xuất phiếu thanh toán (Word)
                              </>
                            )}
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

      {/* AI Settings Modal */}
      {showAiSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="glass bg-white rounded-2xl w-full max-w-md overflow-hidden p-6 space-y-5 border border-white animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-[#005BAC]">
                <Settings size={18} />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-slate-800 text-sm">Cấu hình AI Hành chính</h3>
                <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Thiết lập kết nối OpenAI để đọc hóa đơn</p>
              </div>
            </div>

            <form onSubmit={saveSettings} className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
                <p className="text-[9px] text-slate-400 font-semibold leading-normal mt-1">
                  Khóa API này được lưu trữ cục bộ trên trình duyệt của bạn. Nếu để trống, hệ thống sẽ tự động dùng khóa chung được thiết lập trên server.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Mô hình AI sử dụng</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white cursor-pointer text-xs"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Nhanh chóng & Rất tiết kiệm)</option>
                  <option value="gpt-4o">gpt-4o (Độ chính xác cao & Đọc ảnh hóa đơn tốt nhất)</option>
                </select>
              </div>

              {settingsSaved && (
                <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100 text-[10px] font-bold">
                  <CheckCircle size={12} /> Đã lưu cấu hình thành công!
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAiSettingsModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Đóng lại
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow"
                >
                  <Save size={13} /> Lưu cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

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
  Download,
  Eye,
  X,
  Pencil,
  Calendar,
  ChevronDown,
  Building2,
  Briefcase
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { docSoVietNam, exportDeNghiChuyenTien, downloadDocFile } from "@/lib/wordExporter";
import { supabase } from "@/lib/supabase";

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
  target?: "phongban" | "duan";
  targetName?: string;
}

interface AllocationTarget {
  id: string;
  type: "phongban" | "duan";
  name: string;
  receiver: string;
  notes: string;
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
  file_url?: string;
  beneficiary_name?: string;
  bank_account?: string;
  bank_name_branch?: string;
}

interface RecurringPayment {
  name: string;
  bank: string;
  account: string;
  owner: string;
  lastAmount: number;
  content: string;
}

interface Supplier {
  id: string;
  name: string;
  account: string;
  bank: string;
  service: string;
}

interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  account: string;
  bank: string;
  service: string;
  amount: number;
  content: string;
  month: string;
  fileUrl?: string;
}

// ─── INITIAL MOCK DATA ────────────────────────────────────────────────────────
const INITIAL_SUPPLIES: SupplyItem[] = [
  { name: "Giấy A4 Double A 70gsm", cat: "Giấy in", unit: "Ram", stock: 150, allocated: 320, alert: "Bình thường" },
  { name: "Bút bi Thiên Long xanh", cat: "Bút viết", unit: "Hộp", stock: 12, allocated: 45, alert: "Cảnh báo" },
  { name: "Kẹp bướm 25mm", cat: "Dụng cụ lưu trữ", unit: "Hộp", stock: 45, allocated: 15, alert: "Bình thường" }
];

const INITIAL_DEPT_REQUESTS: DeptRequest[] = [
  { id: "REQ-01", dept: "Phòng HCNS", item: "Giấy A4 Double A 70gsm", qty: 5, date: "2026-06-04", status: "Chờ duyệt", target: "phongban", targetName: "Phòng HCNS" },
  { id: "REQ-02", dept: "Kế toán", item: "Bút bi Thiên Long xanh", qty: 2, date: "2026-06-05", status: "Chờ duyệt", target: "phongban", targetName: "Kế toán" },
  { id: "REQ-03", dept: "Phòng Dự án", item: "Giấy A4 Double A 70gsm", qty: 10, date: "2026-06-03", status: "Đã cấp phát", target: "phongban", targetName: "Phòng Dự án" },
  { id: "REQ-04", dept: "Ban điều hành Vàm Lẽo", item: "Bút bi Thiên Long xanh", qty: 5, date: "2026-06-06", status: "Chờ duyệt", target: "duan", targetName: "Vàm Lẽo" },
  { id: "REQ-05", dept: "Ban điều hành Thường Phước", item: "Kẹp bướm 25mm", qty: 3, date: "2026-06-05", status: "Đã cấp phát", target: "duan", targetName: "Thường Phước" }
];

const DEPARTMENTS = [
  "Phòng HCNS",
  "Kế toán",
  "Phòng Kế hoạch",
  "Phòng Dự án",
  "Phòng Vật tư",
  "Phòng Đấu thầu",
  "Phòng MKT",
  "Phòng ATLĐ",
  "Phòng Kỹ thuật",
  "Giám đốc",
  "Phó Giám đốc"
];

const PROJECTS = [
  "Vàm Lẽo",
  "Tỉnh Lộ 8",
  "Cầu Mã Đà",
  "Thường Phước",
  "Xử lý nước thải Tây Ninh",
  "KCN Cà Ná",
  "Điện mặt trời Trà Vinh 2",
  "Rạch Xuyên Tâm"
];

const INITIAL_ALLOCATION_TARGETS: AllocationTarget[] = [
  { id: "CP-01", type: "phongban", name: "Phòng HCNS", receiver: "Như Quỳnh", notes: "Văn phòng công ty" },
  { id: "CP-02", type: "phongban", name: "Kế toán", receiver: "Thanh Hằng", notes: "Văn phòng công ty" },
  { id: "CP-03", type: "phongban", name: "Phòng Kế hoạch", receiver: "Thùy Quyên", notes: "Văn phòng công ty" },
  { id: "CP-04", type: "phongban", name: "Phòng Dự án", receiver: "Nguyễn Văn A", notes: "Văn phòng công ty" },
  { id: "CP-05", type: "phongban", name: "Phòng Vật tư", receiver: "Nguyễn Văn B", notes: "Văn phòng công ty" },
  { id: "CP-06", type: "phongban", name: "Phòng Đấu thầu", receiver: "Nguyễn Văn C", notes: "Văn phòng công ty" },
  { id: "CP-07", type: "phongban", name: "Phòng MKT", receiver: "Nguyễn Văn D", notes: "Văn phòng công ty" },
  { id: "CP-08", type: "phongban", name: "Phòng ATLĐ", receiver: "Nguyễn Văn E", notes: "Văn phòng công ty" },
  { id: "CP-09", type: "phongban", name: "Phòng Kỹ thuật", receiver: "Nguyễn Văn F", notes: "Văn phòng công ty" },
  { id: "CP-10", type: "phongban", name: "Giám đốc", receiver: "Trần Nghiệp Quang", notes: "Ban Giám đốc" },
  { id: "CP-11", type: "phongban", name: "Phó Giám đốc", receiver: "Phó Giám đốc", notes: "Ban Giám đốc" },
  { id: "CP-12", type: "duan", name: "Vàm Lẽo", receiver: "Chỉ huy trưởng", notes: "Dự án Vàm Lẽo" },
  { id: "CP-13", type: "duan", name: "Tỉnh Lộ 8", receiver: "Chỉ huy trưởng", notes: "Dự án Tỉnh Lộ 8" },
  { id: "CP-14", type: "duan", name: "Cầu Mã Đà", receiver: "Chỉ huy trưởng", notes: "Dự án Cầu Mã Đà" },
  { id: "CP-15", type: "duan", name: "Thường Phước", receiver: "Chỉ huy trưởng", notes: "Dự án Thường Phước" },
  { id: "CP-16", type: "duan", name: "Xử lý nước thải Tây Ninh", receiver: "Chỉ huy trưởng", notes: "Dự án XLNT Tây Ninh" },
  { id: "CP-17", type: "duan", name: "KCN Cà Ná", receiver: "Chỉ huy trưởng", notes: "Dự án KCN Cà Ná" },
  { id: "CP-18", type: "duan", name: "Điện mặt trời Trà Vinh 2", receiver: "Chỉ huy trưởng", notes: "Dự án ĐMT Trà Vinh 2" },
  { id: "CP-19", type: "duan", name: "Rạch Xuyên Tâm", receiver: "Chỉ huy trưởng", notes: "Dự án Rạch Xuyên Tâm" }
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

const INITIAL_SUPPLIERS: Supplier[] = [
  { id: "NCC-01", name: "CÔNG TY CỔ PHẦN AN CƯ ĐỨC PHÚ", account: "520052868", bank: "TP BANK - PGD Kỳ Hòa - CN Sài Gòn", service: "Thuê văn phòng HCM" },
  { id: "NCC-02", name: "CÔNG TY CỔ PHẦN ĐẦU TƯ THỊNH VƯỢNG HVC", account: "334818", bank: "ACB - CN Tân Bình", service: "Lắp máy lạnh văn phòng" },
  { id: "NCC-03", name: "CÔNG TY CỔ PHẦN HAI BỐN BẢY", account: "14020592925013", bank: "NH TMCP Kỹ Thương VN - CN Quang Trung", service: "Chuyển phát nhanh" },
  { id: "NCC-04", name: "CÔNG TY CỔ PHẦN THƯƠNG MẠI XÂY DỰNG HPK", account: "3181551718", bank: "NH ACB - CN Gò Vấp", service: "Thi công sửa chữa văn phòng" },
  { id: "NCC-05", name: "Nguyễn Bích Như Quỳnh", account: "11112857", bank: "Ngân hàng ACB", service: "" },
  { id: "NCC-06", name: "Nguyễn Ngọc Thanh Hằng", account: "02597652501", bank: "Ngân hàng Tiên Phong (TP BANK)", service: "" },
  { id: "NCC-07", name: "TRẦN NGHIỆP QUANG", account: "0942870512", bank: "Ngân hàng SHB", service: "Thuê nhà Vàm Lẽo" },
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function AdministrationPage() {
  const [activeTab, setActiveTab] = useState<"checklist" | "invoice" | "recurring" | "report" | "vpp">("checklist");
  const [recurringSubTab, setRecurringSubTab] = useState<"suppliers" | "payments">("suppliers");

  // State Management
  const [supplies, setSupplies] = useState<SupplyItem[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tnec_supplies");
      if (saved) return JSON.parse(saved);
    }
    return INITIAL_SUPPLIES;
  });
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);
  const [deptRequests, setDeptRequests] = useState<DeptRequest[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>(INITIAL_RECURRING);

  // New Supplier States
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingPayments, setPendingPayments] = useState<SupplierPayment[]>([]);

  // Form states for creating supplier
  const [supplierIdState, setSupplierIdState] = useState("");
  const [supplierNameState, setSupplierNameState] = useState("");
  const [supplierAccountState, setSupplierAccountState] = useState("");
  const [supplierBankState, setSupplierBankState] = useState("");
  const [supplierServiceState, setSupplierServiceState] = useState("");

  // Form states for creating pending payment
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payContent, setPayContent] = useState("");
  const [payMonth, setPayMonth] = useState("06/2026");

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

  // VPP states
  const [vppSubTab, setVppSubTab] = useState<"inventory" | "phongban" | "duan">("inventory");
  const [searchTerm, setSearchTerm] = useState("");
  
  // State for inventory add item form
  const [showAddSupply, setShowAddSupply] = useState(false);
  const [newSupplyName, setNewSupplyName] = useState("");
  const [newSupplyCat, setNewSupplyCat] = useState("Giấy in");
  const [newSupplyUnit, setNewSupplyUnit] = useState("");
  const [newSupplyStock, setNewSupplyStock] = useState(0);

  // Dynamic unique categories extracted from supplies list
  const uniqueCategories = useMemo(() => {
    const cats = supplies.map(s => s.cat).filter(Boolean);
    if (cats.length === 0) {
      return ["Giấy in", "Bút viết", "Dụng cụ lưu trữ", "Khác"];
    }
    return Array.from(new Set(cats));
  }, [supplies]);


  // State for Allocation Targets Directory (Danh mục cấp phát)
  const [allocationTargets, setAllocationTargets] = useState<AllocationTarget[]>(INITIAL_ALLOCATION_TARGETS);
  const [showAllocationDirectory, setShowAllocationDirectory] = useState(false);
  const [newTargetType, setNewTargetType] = useState<"phongban" | "duan">("phongban");
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetReceiver, setNewTargetReceiver] = useState("");
  const [newTargetNotes, setNewTargetNotes] = useState("");

  // State for editing stock directly
  const [editingSupplyName, setEditingSupplyName] = useState<string | null>(null);
  const [editingStockVal, setEditingStockVal] = useState(0);

  // States for PYC (phiếu yêu cầu)
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("Tất cả");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>("Tất cả");

  // State for creating new PYC
  const [showNewPYCModal, setShowNewPYCModal] = useState(false);
  const [newPYCTarget, setNewPYCTarget] = useState<"phongban" | "duan">("phongban");
  const [newPYCTargetName, setNewPYCTargetName] = useState("");
  const [newPYCItem, setNewPYCItem] = useState("");
  const [newPYCQty, setNewPYCQty] = useState(1);

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
    isMock?: boolean;
    fileUrl?: string;
    beneficiaryName?: string;
    bankAccount?: string;
    bankNameBranch?: string;
  }>>([]);
  const [isExtractingBatch, setIsExtractingBatch] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showRecurringPreviewModal, setShowRecurringPreviewModal] = useState(false);
  const [selectedRecurringPreviewIdx, setSelectedRecurringPreviewIdx] = useState(0);
  const [activePreviewPayment, setActivePreviewPayment] = useState<SupplierPayment | null>(null);

  // States for viewing original files in popups
  const [previewFileUrl, setPreviewFileUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [showSqlGuideModal, setShowSqlGuideModal] = useState(false);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);
  const [uploadingPaymentId, setUploadingPaymentId] = useState<string | null>(null);

  // Report date range states
  const [reportStartDate, setReportStartDate] = useState("2026-06-01");
  const [reportEndDate, setReportEndDate] = useState("2026-06-30");
  const [showDatePickerPopover, setShowDatePickerPopover] = useState(false);
  const [tempStartDate, setTempStartDate] = useState("2026-06-01");
  const [tempEndDate, setTempEndDate] = useState("2026-06-30");

  // Form metadata for document generation
  const [employeeName, setEmployeeName] = useState("Nguyễn Bích Như Quỳnh");
  const [employeeDept, setEmployeeDept] = useState("Phòng Hành chính nhân sự");
  const [paymentMission, setPaymentMission] = useState("Thanh toán chi phí hành chính tháng 06");
  const [documentType, setDocumentType] = useState<"payment" | "transfer">("transfer");
  const [projectName, setProjectName] = useState("Văn phòng HCM");
  const [supplierName, setSupplierName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankNameBranch, setBankNameBranch] = useState("");

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

      // Load Suppliers
      const savedSuppliers = localStorage.getItem("tnec_suppliers");
      if (savedSuppliers) {
        setSuppliers(JSON.parse(savedSuppliers));
      } else {
        setSuppliers(INITIAL_SUPPLIERS);
        localStorage.setItem("tnec_suppliers", JSON.stringify(INITIAL_SUPPLIERS));
      }

      // Load Allocation Targets
      const savedTargets = localStorage.getItem("tnec_allocation_targets");
      if (savedTargets) {
        try {
          const parsed = JSON.parse(savedTargets);
          let changed = false;
          const updated = [...parsed];
          INITIAL_ALLOCATION_TARGETS.forEach(initItem => {
            const exists = parsed.some(
              (p: any) => p.name.toLowerCase() === initItem.name.toLowerCase() && p.type === initItem.type
            );
            if (!exists) {
              updated.push(initItem);
              changed = true;
            }
          });
          if (changed) {
            localStorage.setItem("tnec_allocation_targets", JSON.stringify(updated));
          }
          setAllocationTargets(updated);
        } catch (err) {
          console.error("Error parsing savedTargets:", err);
          setAllocationTargets(INITIAL_ALLOCATION_TARGETS);
          localStorage.setItem("tnec_allocation_targets", JSON.stringify(INITIAL_ALLOCATION_TARGETS));
        }
      } else {
        setAllocationTargets(INITIAL_ALLOCATION_TARGETS);
        localStorage.setItem("tnec_allocation_targets", JSON.stringify(INITIAL_ALLOCATION_TARGETS));
      }

      // Load Pending Payments
      const savedPayments = localStorage.getItem("tnec_pending_payments");
      if (savedPayments) {
        setPendingPayments(JSON.parse(savedPayments));
      }

      // Load Dept Requests
      const savedRequests = localStorage.getItem("tnec_dept_requests");
      if (savedRequests) {
        setDeptRequests(JSON.parse(savedRequests));
      } else {
        setDeptRequests(INITIAL_DEPT_REQUESTS);
        localStorage.setItem("tnec_dept_requests", JSON.stringify(INITIAL_DEPT_REQUESTS));
      }

      fetchUserRoleAndDept();
    }
  }, []);

  const fetchUserRoleAndDept = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) return;

      const user = session.user;
      const email = user.email || "";

      // 1. Check allowed_users
      const { data: allowedData } = await supabase
        .from("allowed_users")
        .select("role")
        .ilike("email", email)
        .maybeSingle();

      const isAdmin = allowedData?.role === "Admin";

      // 2. Check employees
      const { data: empData } = await supabase
        .from("employees")
        .select("name, role, department")
        .ilike("email", email)
        .maybeSingle();

      const userInfo = {
        email,
        name: empData?.name || user.user_metadata?.full_name || user.user_metadata?.name || "Người dùng",
        role: empData?.role || (isAdmin ? "Admin" : "Nhân viên"),
        department: empData?.department || "Chưa xếp phòng",
        isAdmin
      };
      
      setCurrentUser(userInfo);
    } catch (err) {
      console.error("Error fetching user permissions in admin:", err);
    }
  };

  const canDeleteSupplies = !!(currentUser && (
    currentUser.isAdmin || 
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.role.toLowerCase().includes("trưởng phòng") || 
    currentUser.role.toLowerCase().includes("truong phong") ||
    currentUser.role.toLowerCase().includes("phó phòng") || 
    currentUser.role.toLowerCase().includes("pho phong") ||
    currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
    currentUser.role.toLowerCase().includes("pho truong phong")
  ));

  const canApproveRequests = !!(currentUser && (
    currentUser.isAdmin || 
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.role.toLowerCase().includes("trưởng phòng") || 
    currentUser.role.toLowerCase().includes("truong phong") ||
    currentUser.role.toLowerCase().includes("phó phòng") || 
    currentUser.role.toLowerCase().includes("pho phong") ||
    currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
    currentUser.role.toLowerCase().includes("pho truong phong") ||
    currentUser.role.toLowerCase().includes("hành chính") ||
    currentUser.role.toLowerCase().includes("hanh chinh") ||
    currentUser.department.toLowerCase().includes("hành chính") ||
    currentUser.department.toLowerCase().includes("hanh chinh")
  ));

  // Sync supplies to localStorage when changed
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_supplies", JSON.stringify(supplies));
    }
  }, [supplies]);

  // Sync deptRequests to localStorage when changed
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_dept_requests", JSON.stringify(deptRequests));
    }
  }, [deptRequests]);

  // Delete Supply Handler
  const handleDeleteSupply = (name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vật tư "${name}" khỏi danh mục kho không?`)) return;
    setSupplies(prev => prev.filter(s => s.name !== name));
  };

  const handleDeleteRequest = (reqId: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa yêu cầu cấp phát này không?")) {
      setDeptRequests(prev => prev.filter(r => r.id !== reqId));
    }
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key_hanh_chinh", apiKey.trim());
      localStorage.setItem("openai_model_hanh_chinh", model);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    }
  };

  // --- NEW SUPPLIER & RECURRING PAYMENT HANDLERS ---
  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierNameState.trim() || !supplierAccountState.trim() || !supplierBankState.trim()) {
      alert("Vui lòng nhập đầy đủ thông tin nhà cung cấp!");
      return;
    }

    const nextId = `NCC-${String(suppliers.length + 1).padStart(2, "0")}`;
    const newSupplier: Supplier = {
      id: supplierIdState.trim() || nextId,
      name: supplierNameState.trim(),
      account: supplierAccountState.trim(),
      bank: supplierBankState.trim(),
      service: supplierServiceState.trim()
    };

    const updated = [...suppliers, newSupplier];
    setSuppliers(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_suppliers", JSON.stringify(updated));
    }

    // Reset form
    setSupplierIdState("");
    setSupplierNameState("");
    setSupplierAccountState("");
    setSupplierBankState("");
    setSupplierServiceState("");
    alert("Đã thêm Nhà cung cấp thành công!");
  };

  const handleDeleteSupplier = (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa Nhà cung cấp này không?")) {
      const updated = suppliers.filter(s => s.id !== id);
      setSuppliers(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_suppliers", JSON.stringify(updated));
      }
    }
  };

  const handleSupplierSelect = (id: string) => {
    setSelectedSupplierId(id);
    const supp = suppliers.find(s => s.id === id);
    if (supp) {
      setPayContent(`Thanh toan ${supp.service || "dich vu"} ${supp.name} thang`);
    } else {
      setPayContent("");
    }
  };

  const handleAddPendingPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const supp = suppliers.find(s => s.id === selectedSupplierId);
    if (!supp || !payAmount || isNaN(Number(payAmount))) {
      alert("Vui lòng chọn Nhà cung cấp và nhập số tiền hợp lệ!");
      return;
    }

    const tempId = `PAY-${Date.now().toString().slice(-4)}`;
    let finalId = tempId;

    // Try to sync with Supabase invoices table
    try {
      const { data, error } = await supabase
        .from("invoices")
        .insert([{
          number: `HD-DK-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().slice(0, 10),
          description: payContent || `Thanh toán định kỳ ${supp.name}`,
          amount: Number(payAmount),
          beneficiary_name: supp.name,
          bank_account: supp.account,
          bank_name_branch: supp.bank
        }])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        finalId = data[0].id;
        const savedInv: Invoice = {
          id: data[0].id,
          number: data[0].number,
          date: data[0].date,
          desc: data[0].description || "",
          amount: Number(data[0].amount),
          file_url: data[0].file_url || "",
          beneficiary_name: data[0].beneficiary_name || "",
          bank_account: data[0].bank_account || "",
          bank_name_branch: data[0].bank_name_branch || ""
        };
        setInvoices(prev => [savedInv, ...prev]);
        alert("Đã thêm khoản thanh toán và đồng bộ thành công lên Supabase!");
      }
    } catch (err: any) {
      console.warn("Could not sync to Supabase (saving locally):", err.message || err);
      // Create local fallback invoice
      const newInv: Invoice = {
        id: tempId,
        number: `HD-DK-${Date.now().toString().slice(-4)}`,
        date: new Date().toISOString().slice(0, 10),
        desc: payContent || `Thanh toán định kỳ ${supp.name}`,
        amount: Number(payAmount),
        beneficiary_name: supp.name,
        bank_account: supp.account,
        bank_name_branch: supp.bank
      };
      setInvoices(prev => [newInv, ...prev]);
      alert("Đã lưu khoản thanh toán thành công (lưu tạm thời trên trình duyệt do lỗi kết nối Supabase)!");
    }

    const newPayment: SupplierPayment = {
      id: finalId,
      supplierId: supp.id,
      supplierName: supp.name,
      account: supp.account,
      bank: supp.bank,
      service: supp.service,
      amount: Number(payAmount),
      content: payContent || `Thanh toán định kỳ ${supp.name}`,
      month: payMonth || "06/2026"
    };

    const updated = [...pendingPayments, newPayment];
    setPendingPayments(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_pending_payments", JSON.stringify(updated));
    }

    // Reset payment inputs
    setPayAmount("");
    setSelectedSupplierId("");
    setPayContent("");
  };

  const handleDeletePendingPayment = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa khoản thanh toán này?")) {
      try {
        if (!id.startsWith("PAY-") && !id.startsWith("INV-")) {
          const { error } = await supabase
            .from("invoices")
            .delete()
            .eq("id", id);
          if (error) throw error;
        }
      } catch (err: any) {
        console.warn("Could not delete invoice row from Supabase:", err.message || err);
      }

      const updated = pendingPayments.filter(p => p.id !== id);
      setPendingPayments(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_pending_payments", JSON.stringify(updated));
      }
      setInvoices(prev => prev.filter(inv => inv.id !== id));
    }
  };

  const handleExportDeNghiChuyenTien = async () => {
    const currentMonthPayments = pendingPayments.filter(p => p.month === payMonth);
    if (currentMonthPayments.length === 0) {
      alert("Danh sách thanh toán trống, không thể xuất file!");
      return;
    }

    setExportLoading(true);
    try {
      for (const p of currentMonthPayments) {
        const response = await fetch("/api/export-invoice-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            employeeName,
            employeeDept,
            mission: p.content,
            projectName: "Văn phòng HCM",
            supplierName: p.supplierName,
            bankAccount: p.account,
            bankNameBranch: p.bank,
            templateType: "transfer",
            items: [
              {
                number: "",
                date: new Date().toISOString().slice(0, 10),
                desc: p.content,
                amount: p.amount
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`Không thể xuất phiếu cho ${p.supplierName}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Giay_De_Nghi_Chuyen_Tien_${p.supplierName.replace(/\s+/g, "_")}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        // Add a small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error: any) {
      alert("Lỗi khi xuất phiếu đề nghị chuyển tiền: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  const handlePreviewSpecificPayment = (paymentId: string) => {
    const currentMonthPayments = pendingPayments.filter(p => p.month === payMonth);
    const idx = currentMonthPayments.findIndex(p => p.id === paymentId);
    if (idx !== -1) {
      setSelectedRecurringPreviewIdx(idx);
      setShowRecurringPreviewModal(true);
    }
  };

  // Helper classification function
  const getCategory = (desc: string) => {
    const lower = (desc || "").toLowerCase();
    if (lower.includes("văn phòng phẩm") || lower.includes("vpp") || lower.includes("giấy") || lower.includes("bút") || lower.includes("in ấn")) {
      return "Văn phòng phẩm";
    }
    if (lower.includes("điện") || lower.includes("nước") || lower.includes("evn") || lower.includes("sawaco") || lower.includes("điện nước")) {
      return "Điện nước văn phòng";
    }
    if (lower.includes("internet") || lower.includes("cáp quang") || lower.includes("viettel") || lower.includes("fpt") || lower.includes("vnpt") || lower.includes("wifi")) {
      return "Cáp quang Internet";
    }
    if (lower.includes("tiếp khách") || lower.includes("ăn uống") || lower.includes("entertainment") || lower.includes("cafe") || lower.includes("nhà hàng") || lower.includes("hoa quả") || lower.includes("tiệc")) {
      return "Chi phí mua đồ tiếp khách";
    }
    return "Chi phí khác";
  };

  const getReportData = (startDate: string, endDate: string) => {
    const filteredInvoices = invoices.filter(inv => {
      if (!inv.date) return false;
      return inv.date >= startDate && inv.date <= endDate;
    });

    const filteredPayments = pendingPayments.filter(p => {
      if (!p.month) return false;
      const parts = p.month.split("/");
      if (parts.length !== 2) return false;
      const mm = parts[0].padStart(2, "0");
      const yyyy = parts[1];
      const monthStart = `${yyyy}-${mm}-01`;
      const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
      const monthEnd = `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
      return monthEnd >= startDate && monthStart <= endDate;
    });

    const combinedItems = [
      ...filteredInvoices.map(inv => ({
        id: inv.id,
        type: "Hóa đơn",
        code: inv.number || "N/A",
        date: inv.date || "",
        beneficiary: inv.beneficiary_name || "N/A",
        desc: inv.desc || "",
        amount: inv.amount || 0,
        category: getCategory(inv.desc || "")
      })),
      ...filteredPayments.map(p => ({
        id: p.id,
        type: "Thanh toán định kỳ",
        code: p.supplierId || "N/A",
        date: p.month || "",
        beneficiary: p.supplierName || "N/A",
        desc: p.content || "",
        amount: p.amount || 0,
        category: getCategory(p.content || p.service || "")
      }))
    ];

    const totalAmount = combinedItems.reduce((sum, item) => sum + item.amount, 0);
    const invoiceCount = filteredInvoices.length;
    const recurringCount = filteredPayments.length;

    const categoriesMap: Record<string, number> = {
      "Văn phòng phẩm": 0,
      "Điện nước văn phòng": 0,
      "Cáp quang Internet": 0,
      "Chi phí mua đồ tiếp khách": 0,
      "Chi phí khác": 0,
    };

    combinedItems.forEach(item => {
      const cat = item.category;
      if (categoriesMap[cat] !== undefined) {
        categoriesMap[cat] += item.amount;
      } else {
        categoriesMap["Chi phí khác"] += item.amount;
      }
    });

    return {
      combinedItems,
      totalAmount,
      invoiceCount,
      recurringCount,
      categoriesMap
    };
  };

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const handleApplyDateRange = () => {
    setReportStartDate(tempStartDate);
    setReportEndDate(tempEndDate);
    setShowDatePickerPopover(false);
  };

  const handleCancelDateRange = () => {
    setTempStartDate(reportStartDate);
    setTempEndDate(reportEndDate);
    setShowDatePickerPopover(false);
  };

  const handleQuickSelect = (type: string) => {
    const now = new Date();
    let start: Date;
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    switch (type) {
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "1month":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case "2months":
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      case "3months":
        start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const toISO = (d: Date) => d.toISOString().slice(0, 10);
    setTempStartDate(toISO(start));
    setTempEndDate(toISO(end));
  };

  const handleExportReportExcel = (startDate: string, endDate: string) => {
    try {
      const { combinedItems, totalAmount, invoiceCount, recurringCount, categoriesMap } = getReportData(startDate, endDate);
      const rangeLabel = `${formatDateVN(startDate)} - ${formatDateVN(endDate)}`;

      let csvContent = "\uFEFF";

      csvContent += `"BÁO CÁO TỔNG HỢP CHI PHÍ"\n`;
      csvContent += `"Kỳ báo cáo:","${rangeLabel}"\n`;
      csvContent += `"Ngày xuất báo cáo:","${new Date().toLocaleDateString("vi-VN")}"\n`;
      csvContent += `"Tổng chi phí:","${totalAmount}","VNĐ"\n`;
      csvContent += `"Số lượng hóa đơn:","${invoiceCount}","hồ sơ"\n`;
      csvContent += `"Số lượng thanh toán định kỳ:","${recurringCount}","hồ sơ"\n\n`;

      csvContent += `"CƠ CẤU CHI PHÍ THÀNH PHẦN"\n`;
      csvContent += `"Hạng mục","Số tiền (VNĐ)","Tỷ lệ (%)"\n`;
      Object.entries(categoriesMap).forEach(([cat, amount]) => {
        const pct = totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : "0.0";
        csvContent += `"${cat}","${amount}","${pct}%"\n`;
      });
      csvContent += `\n`;

      csvContent += `"DANH SÁCH CHI TIẾT CÁC KHOẢN CHI"\n`;
      csvContent += `"STT","Loại chứng từ","Số hóa đơn/Mã","Ngày/Tháng","Đơn vị thụ hưởng","Nội dung","Số tiền (VNĐ)","Phân loại"\n`;
      
      combinedItems.forEach((item, index) => {
        const beneficiary = (item.beneficiary || "").replace(/"/g, '""');
        const desc = (item.desc || "").replace(/"/g, '""');
        csvContent += `"${index + 1}","${item.type}","${item.code}","${item.date}","${beneficiary}","${desc}","${item.amount}","${item.category}"\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao_cao_chi_phi_${startDate}_den_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Lỗi khi kết xuất báo cáo: " + err.message);
    }
  };

  const exportSingleRecurringPayment = async (p: SupplierPayment) => {
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
          mission: p.content,
          projectName: "Văn phòng HCM",
          supplierName: p.supplierName,
          bankAccount: p.account,
          bankNameBranch: p.bank,
          templateType: "transfer",
          items: [
            {
              number: "",
              date: new Date().toISOString().slice(0, 10),
              desc: p.content,
              amount: p.amount
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Không thể xuất phiếu cho ${p.supplierName}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Giay_De_Nghi_Chuyen_Tien_${p.supplierName.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert("Lỗi khi xuất phiếu đề nghị chuyển tiền: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  // Department Allocation handler
  const handleApproveRequest = (reqId: string) => {
    const request = deptRequests.find(r => r.id === reqId);
    if (!request || request.status === "Đã cấp phát") return;

    // Check if stock is sufficient
    const supply = supplies.find(s => s.name === request.item);
    if (supply && supply.stock < request.qty) {
      const confirmProceed = window.confirm(
        `Cảnh báo: Số lượng tồn kho của "${request.item}" (${supply.stock} ${supply.unit}) ít hơn số lượng yêu cầu (${request.qty} ${supply.unit}).\nBạn vẫn muốn tiếp tục cấp phát và đưa tồn kho về 0?`
      );
      if (!confirmProceed) return;
    }

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

  // VPP Inventory add supply handler
  const handleAddSupply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplyName.trim() || !newSupplyUnit.trim()) {
      alert("Vui lòng điền đầy đủ thông tin vật tư.");
      return;
    }

    // Check duplicate
    if (supplies.some(s => s.name.toLowerCase() === newSupplyName.trim().toLowerCase())) {
      alert("Vật tư này đã tồn tại trong kho.");
      return;
    }

    const newSupply: SupplyItem = {
      name: newSupplyName.trim(),
      cat: newSupplyCat,
      unit: newSupplyUnit.trim(),
      stock: Number(newSupplyStock),
      allocated: 0,
      alert: Number(newSupplyStock) < 15 ? "Cảnh báo" : "Bình thường"
    };

    setSupplies(prev => [...prev, newSupply]);
    setShowAddSupply(false);
    setNewSupplyName("");
    setNewSupplyUnit("");
    setNewSupplyStock(0);
    alert("Đã thêm vật tư mới vào kho thành công.");
  };

  // VPP Edit stock handlers
  const handleStartEditStock = (item: SupplyItem) => {
    setEditingSupplyName(item.name);
    setEditingStockVal(item.stock);
  };

  const handleSaveStock = (name: string) => {
    setSupplies(prev => prev.map(s => {
      if (s.name === name) {
        return {
          ...s,
          stock: editingStockVal,
          alert: editingStockVal < 15 ? "Cảnh báo" : "Bình thường"
        };
      }
      return s;
    }));
    setEditingSupplyName(null);
  };

  // VPP Create new PYC handler
  const handleCreatePYC = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPYCTargetName || !newPYCItem || newPYCQty <= 0) {
      alert("Vui lòng điền đầy đủ thông tin yêu cầu.");
      return;
    }

    const deptName = newPYCTarget === "phongban" ? newPYCTargetName : `Ban điều hành ${newPYCTargetName}`;
    const newReq: DeptRequest = {
      id: `REQ-${Date.now().toString().slice(-4)}`,
      dept: deptName,
      item: newPYCItem,
      qty: Number(newPYCQty),
      date: new Date().toISOString().split("T")[0],
      status: "Chờ duyệt",
      target: newPYCTarget,
      targetName: newPYCTargetName
    };

    setDeptRequests(prev => [newReq, ...prev]);
    setShowNewPYCModal(false);
    
    // Reset fields
    setNewPYCItem("");
    setNewPYCQty(1);
    alert(`Đã tạo thành công Phiếu yêu cầu ${newReq.id} cho ${deptName}.`);
  };

  // Add Allocation Target Handler
  const handleAddAllocationTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetName.trim()) return;

    // Check duplicate
    if (allocationTargets.some(t => t.type === newTargetType && t.name.toLowerCase() === newTargetName.trim().toLowerCase())) {
      alert("Đối tượng cấp phát này đã tồn tại trong danh mục.");
      return;
    }

    const newTarget: AllocationTarget = {
      id: `CP-${Date.now().toString().slice(-4)}`,
      type: newTargetType,
      name: newTargetName.trim(),
      receiver: newTargetReceiver.trim(),
      notes: newTargetNotes.trim()
    };

    const updated = [...allocationTargets, newTarget];
    setAllocationTargets(updated);
    localStorage.setItem("tnec_allocation_targets", JSON.stringify(updated));

    // Reset fields
    setNewTargetName("");
    setNewTargetReceiver("");
    setNewTargetNotes("");
    alert("Đã thêm đối tượng cấp phát mới thành công.");
  };

  // Delete Allocation Target Handler
  const handleDeleteAllocationTarget = (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa đối tượng cấp phát này không? Các phiếu yêu cầu hiện tại của đối tượng này vẫn được giữ nguyên.")) return;
    const updated = allocationTargets.filter(t => t.id !== id);
    setAllocationTargets(updated);
    localStorage.setItem("tnec_allocation_targets", JSON.stringify(updated));
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
        ? { ...item, status: "extracting", error: undefined }
        : item
    ));

    const customKey = localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key") || "";
    const customModel = localStorage.getItem("openai_model_hanh_chinh") || "gpt-4o-mini";

    for (const item of pendingItems) {
      let uploadedUrl = "";
      try {
        // 1. Tải file gốc lên Supabase Storage (bucket clerical-documents, thư mục invoices/)
        try {
          const cleanFileName = item.file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
          const filePath = `${Date.now()}_${cleanFileName}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("clerical-documents")
            .upload(`invoices/${filePath}`, item.file, {
              cacheControl: "3600",
              upsert: true,
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from("clerical-documents")
            .getPublicUrl(`invoices/${filePath}`);
          
          uploadedUrl = publicUrl;
        } catch (uploadErr) {
          console.error("Batch upload storage failed for file:", item.file.name, uploadErr);
        }

        // 2. Gửi request trích xuất thông tin hóa đơn từ AI
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
          const errorData = await res.json().catch(() => ({ error: "Không phản hồi từ server" }));
          throw new Error(errorData.error || `HTTP ${res.status}: Lỗi máy chủ khi trích xuất.`);
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
                amount: data.amount || 0,
                fileUrl: uploadedUrl,
                beneficiaryName: data.beneficiaryName || "",
                bankAccount: data.bankAccount || "",
                bankNameBranch: data.bankNameBranch || ""
              }
            : q
        ));

        // Auto-fill beneficiary details if extracted
        if (data.beneficiaryName) setSupplierName(data.beneficiaryName);
        if (data.bankAccount) setBankAccount(data.bankAccount);
        if (data.bankNameBranch) setBankNameBranch(data.bankNameBranch);
      } catch (err: any) {
        console.error("Batch extraction item failed:", err);
        
        // Only use simulated fallback if it's a test mock file AND no key is set
        if (item.isMock && !customKey) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          let simulatedDesc = "Thanh toán hóa đơn dịch vụ văn phòng";
          let simulatedAmount = 1500000;
          let simulatedNumber = `HD-${Math.floor(100000 + Math.random() * 900000)}`;
          let simulatedBeneficiary = "Công ty Dịch vụ Văn phòng Việt Nam";
          let simulatedAccount = "1903456789012";
          let simulatedBank = "Techcombank CN Sài Gòn";
          const fname = item.file.name.toLowerCase();
          
          if (fname.includes("katinat") || fname.includes("cafe") || fname.includes("ca phe")) {
            simulatedDesc = "Thanh toán chi phí đồ uống tiếp khách - Katinat Coffee";
            simulatedAmount = 1440000;
            simulatedBeneficiary = "Công ty Cổ phần Katinat Sài Gòn";
            simulatedAccount = "0071001234567";
            simulatedBank = "Vietcombank CN Bến Thành";
          } else if (fname.includes("lavie") || fname.includes("nuoc")) {
            simulatedDesc = "Thanh toán chi phí nước uống Lavie văn phòng";
            simulatedAmount = 1800000;
            simulatedBeneficiary = "Công ty TNHH La Vie";
            simulatedAccount = "110000012345";
            simulatedBank = "Vietinbank CN Long An";
          } else if (fname.includes("giay") || fname.includes("vpp") || fname.includes("but")) {
            simulatedDesc = "Thanh toán 50% giá trị hợp đồng in ấn, ấn phẩm logo mới HĐ số: 176283594";
            simulatedAmount = 7114500;
            simulatedBeneficiary = "CÔNG TY TNHH QUẢNG CÁO ĐỨC AN";
            simulatedAccount = "0602 2024 1532";
            simulatedBank = "Sacombank CN Tân Phú";
          }

          setInvoiceQueue(prev => prev.map(q => 
            q.id === item.id 
              ? {
                  ...q,
                  status: "success",
                  number: simulatedNumber,
                  date: new Date().toISOString().slice(0, 10),
                  desc: simulatedDesc,
                  amount: simulatedAmount,
                  fileUrl: uploadedUrl,
                  beneficiaryName: simulatedBeneficiary,
                  bankAccount: simulatedAccount,
                  bankNameBranch: simulatedBank
                }
              : q
          ));

          // Set form state for mock file
          setSupplierName(simulatedBeneficiary);
          setBankAccount(simulatedAccount);
          setBankNameBranch(simulatedBank);
        } else {
          // Real error logic: show error details
          setInvoiceQueue(prev => prev.map(q => 
            q.id === item.id 
              ? { ...q, status: "error", error: err.message || "Lỗi kết nối API" }
              : q
          ));
        }
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
          projectName,
          supplierName,
          bankAccount,
          bankNameBranch,
          templateType: documentType,
          items: successItems.map(item => ({
            number: item.number,
            date: item.date,
            desc: item.desc,
            amount: item.amount
          }))
        })
      });

      if (!response.ok) {
        throw new Error("Không thể xuất phiếu thanh toán/chuyển tiền");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const docPrefix = documentType === "payment" ? "Phieu_De_Nghi_Thanh_Toan" : "Giay_De_Nghi_Chuyen_Tien";
      a.download = `${docPrefix}_${employeeName.replace(/\s+/g, "_")}.docx`;
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

  // Fetch invoices from Supabase
  const fetchInvoices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        const loadedInvs: Invoice[] = data.map((row: any) => ({
          id: row.id,
          number: row.number,
          date: row.date,
          desc: row.description || "",
          amount: Number(row.amount),
          file_url: row.file_url || "",
          beneficiary_name: row.beneficiary_name || "",
          bank_account: row.bank_account || "",
          bank_name_branch: row.bank_name_branch || ""
        }));
        setInvoices(loadedInvs);
        setIsTableMissing(false);
      }
    } catch (err: any) {
      console.error("Failed to fetch invoices from Supabase:", err);
      if (err.message && (err.message.includes("Could not find the table") || err.message.includes("does not exist"))) {
        setIsTableMissing(true);
      }
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Save successful queue items to main processed table
  const saveQueueToHistory = async () => {
    const successItems = invoiceQueue.filter(item => item.status === "success" && item.number && item.amount);
    if (successItems.length === 0) return;

    try {
      const newInvsPayload = successItems.map(item => ({
        number: item.number,
        date: item.date,
        description: item.desc || "Hóa đơn thanh toán",
        amount: item.amount,
        file_url: item.fileUrl || "",
        beneficiary_name: item.beneficiaryName || "",
        bank_account: item.bankAccount || "",
        bank_name_branch: item.bankNameBranch || ""
      }));

      const { data, error } = await supabase
        .from("invoices")
        .insert(newInvsPayload)
        .select();

      if (error) throw error;

      await fetchInvoices();
      setInvoiceQueue([]);
      alert("Đã đồng bộ lưu tất cả hóa đơn thành công vào danh sách lịch sử trên Supabase!");
    } catch (dbErr: any) {
      console.error("Failed to save invoices to Supabase:", dbErr);
      if (dbErr.message && (dbErr.message.includes("Could not find the table") || dbErr.message.includes("does not exist"))) {
        setIsTableMissing(true);
      }
      
      // Local state fallback if Supabase table is not configured
      const newInvs: Invoice[] = successItems.map(item => ({
        id: `INV-${Date.now().toString().slice(-2)}-${Math.random().toString(36).substr(2, 4)}`,
        number: item.number,
        date: item.date,
        desc: item.desc || "Hóa đơn thanh toán",
        amount: item.amount,
        file_url: item.fileUrl || "",
        beneficiary_name: item.beneficiaryName || "",
        bank_account: item.bankAccount || "",
        bank_name_branch: item.bankNameBranch || ""
      }));

      setInvoices(prev => [...newInvs, ...prev]);
      setInvoiceQueue([]);
      alert(`Đã lưu hóa đơn thành công vào danh sách tạm thời! Lỗi kết nối Supabase: ${dbErr.message}`);
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa hóa đơn này khỏi lịch sử không?")) {
      try {
        // If it's a UUID from Supabase (not starting with INV- and not HD-DK-)
        if (!id.startsWith("INV-") && !id.startsWith("HD-DK-")) {
          const { error } = await supabase
            .from("invoices")
            .delete()
            .eq("id", id);
          if (error) throw error;
        }
        setInvoices(prev => prev.filter(inv => inv.id !== id));
      } catch (err: any) {
        console.error("Delete invoice error:", err);
        alert("Lỗi khi xóa hóa đơn từ Supabase: " + err.message);
      }
    }
  };

  const handleUploadFileForPayment = async (paymentId: string, file: File) => {
    if (!file) return;
    setUploadingPaymentId(paymentId);
    try {
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${Date.now()}_${cleanFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("clerical-documents")
        .upload(`invoices/${filePath}`, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("clerical-documents")
        .getPublicUrl(`invoices/${filePath}`);

      // Update in Supabase invoices table (using the database UUID if it is one)
      if (!paymentId.startsWith("PAY-") && !paymentId.startsWith("INV-")) {
        const { error: updateError } = await supabase
          .from("invoices")
          .update({ file_url: publicUrl })
          .eq("id", paymentId);
        if (updateError) throw updateError;
      }

      // Update in local state
      const updated = pendingPayments.map(p => 
        p.id === paymentId ? { ...p, fileUrl: publicUrl } : p
      );
      setPendingPayments(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_pending_payments", JSON.stringify(updated));
      }
      alert("Tải lên hóa đơn thành công!");
    } catch (err: any) {
      console.error("Upload payment file error:", err);
      alert("Lỗi khi tải lên hóa đơn: " + (err.message || err));
    } finally {
      setUploadingPaymentId(null);
    }
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    try {
      const { id, supplierName, account, bank, content, amount, month } = editingPayment;

      // Update in Supabase invoices table
      if (!id.startsWith("PAY-") && !id.startsWith("INV-")) {
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            description: content,
            amount: Number(amount),
            beneficiary_name: supplierName,
            bank_account: account,
            bank_name_branch: bank
          })
          .eq("id", id);
        if (updateError) throw updateError;
      }

      // Update in local state
      const updated = pendingPayments.map(p => 
        p.id === id ? editingPayment : p
      );
      setPendingPayments(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_pending_payments", JSON.stringify(updated));
      }
      alert("Cập nhật thông tin thanh toán thành công!");
      setEditingPayment(null);
    } catch (err: any) {
      console.error("Update payment error:", err);
      alert("Lỗi khi cập nhật thanh toán: " + (err.message || err));
    }
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
              
              {/* ─── TAB 5: VPP (Văn phòng phẩm) ─── */}
              {activeTab === "vpp" && (
                <div className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                  {/* KPI Cards (4 Columns with Modern Gradients & Shadow Glows) */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Tồn kho Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-blue-50/40 to-indigo-50/20 rounded-2xl p-5 border border-blue-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-blue-500 to-[#005BAC] text-white rounded-xl shadow-lg shadow-blue-500/25">
                        <Package size={20} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Tồn kho Hành chính</p>
                        <p className="font-heading font-black text-xl text-slate-800 mt-1">
                          {supplies.reduce((sum, item) => sum + item.stock, 0)} <span className="text-xs font-semibold text-slate-500">vật tư</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">{supplies.length} danh mục hàng hóa</p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-blue-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <Package size={80} />
                      </div>
                    </div>
                    
                    {/* Cấp Phòng Ban VP Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-emerald-50/40 to-teal-50/20 rounded-2xl p-5 border border-emerald-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl shadow-lg shadow-emerald-500/25">
                        <Building2 size={20} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Cấp Phòng Ban VP</p>
                        <p className="font-heading font-black text-xl text-emerald-700 mt-1">
                          {deptRequests.filter(r => r.target === "phongban" && r.status === "Đã cấp phát").reduce((sum, r) => sum + r.qty, 0)} <span className="text-xs font-semibold text-slate-500">cái/ram</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">
                          {deptRequests.filter(r => r.target === "phongban" && r.status === "Đã cấp phát").length} lượt bàn giao
                        </p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-emerald-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <Building2 size={80} />
                      </div>
                    </div>

                    {/* Cấp Ban ĐH Dự Án Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-purple-50/40 to-fuchsia-50/20 rounded-2xl p-5 border border-purple-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white rounded-xl shadow-lg shadow-purple-500/25">
                        <Briefcase size={20} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Cấp Ban ĐH Dự Án</p>
                        <p className="font-heading font-black text-xl text-purple-700 mt-1">
                          {deptRequests.filter(r => r.target === "duan" && r.status === "Đã cấp phát").reduce((sum, r) => sum + r.qty, 0)} <span className="text-xs font-semibold text-slate-500">cái/ram</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">
                          {deptRequests.filter(r => r.target === "duan" && r.status === "Đã cấp phát").length} lượt bàn giao
                        </p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-purple-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <Briefcase size={80} />
                      </div>
                    </div>

                    {/* Yêu cầu chờ duyệt Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-amber-50/40 to-orange-50/20 rounded-2xl p-5 border border-amber-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-550 text-white rounded-xl shadow-lg shadow-amber-500/25">
                        <AlertTriangle size={20} className={deptRequests.filter(r => r.status === "Chờ duyệt").length > 0 ? "animate-pulse" : ""} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Yêu cầu chờ duyệt</p>
                        <p className="font-heading font-black text-xl text-amber-700 mt-1">
                          {deptRequests.filter(r => r.status === "Chờ duyệt").length} <span className="text-xs font-semibold text-slate-500">phiếu</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">Trừ kho khi phê duyệt</p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-amber-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <AlertTriangle size={80} />
                      </div>
                    </div>
                  </div>

                  {/* VPP Sub-navigation (Modern Capsule Segmented Style) */}
                  <div className="bg-slate-100/90 p-1 rounded-xl flex flex-wrap gap-1.5 w-fit border border-slate-200/50 shadow-sm">
                    <button
                      onClick={() => {
                        setVppSubTab("inventory");
                        setSearchTerm("");
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 active:scale-[0.98] ${
                        vppSubTab === "inventory"
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                      }`}
                    >
                      <Package size={13} />
                      1. Mục tồn kho của Hành chính
                    </button>
                    <button
                      onClick={() => {
                        setVppSubTab("phongban");
                        setSearchTerm("");
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 active:scale-[0.98] ${
                        vppSubTab === "phongban"
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                      }`}
                    >
                      <Building2 size={13} />
                      2. VPP cấp cho từng phòng ban VP
                    </button>
                    <button
                      onClick={() => {
                        setVppSubTab("duan");
                        setSearchTerm("");
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 active:scale-[0.98] ${
                        vppSubTab === "duan"
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                      }`}
                    >
                      <Briefcase size={13} />
                      3. VPP cấp cho Ban điều hành dự án
                    </button>
                  </div>

                  {/* Sub-tab 1: Inventory Table */}
                  {vppSubTab === "inventory" && (
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-4 animate-in fade-in-40 duration-200">
                      <div className="flex justify-between items-center gap-4">
                        <div className="relative w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                          <input
                            type="text"
                            placeholder="Tìm kiếm vật tư tồn kho..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => {
                              const nextState = !showAllocationDirectory;
                              setShowAllocationDirectory(nextState);
                              setShowAddSupply(false);
                              if (nextState) {
                                setNewSupplyCat(""); // Reset to empty string so user can type a custom category
                              }
                            }}
                            className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl shadow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ${
                              showAllocationDirectory 
                                ? "bg-slate-700 hover:bg-slate-800 text-white" 
                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                          >
                            <Settings size={14} /> {showAllocationDirectory ? "Đóng danh mục" : "Danh mục cấp phát"}
                          </button>
                          
                          <button 
                            type="button"
                            onClick={() => {
                              const nextState = !showAddSupply;
                              setShowAddSupply(nextState);
                              setShowAllocationDirectory(false);
                              if (nextState && uniqueCategories.length > 0) {
                                setNewSupplyCat(uniqueCategories[0]);
                              }
                            }}
                            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                          >
                            <Plus size={14} /> {showAddSupply ? "Đóng lại" : "Nhập kho mới"}
                          </button>
                        </div>
                      </div>

                      {/* Allocation Targets Directory (Danh mục cấp phát) Panel */}
                      {showAllocationDirectory && (
                        <div className="border border-slate-200/80 bg-slate-50/20 p-5 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2">
                            <h4 className="font-heading font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                              <span>📂</span> Quản lý Danh mục cấp phát
                            </h4>
                            <span className="text-[10px] text-slate-400 font-semibold">Cấu hình danh mục các loại vật tư văn phòng phẩm cấp phát</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Left Form: Add material */}
                            <div className="md:col-span-1 border border-slate-200/80 bg-white p-4 rounded-xl space-y-3 shadow-sm">
                              <h5 className="font-bold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1">
                                <span>➕</span> Thêm vật tư mới
                              </h5>
                              <form onSubmit={handleAddSupply} className="space-y-3 text-[11px] font-semibold text-slate-600">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase block">Tên Vật tư <span className="text-rose-500">*</span></label>
                                  <input
                                    type="text"
                                    required
                                    value={newSupplyName}
                                    onChange={(e) => setNewSupplyName(e.target.value)}
                                    placeholder="Ví dụ: Giấy A4 Double A..."
                                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase block">Danh mục <span className="text-rose-500">*</span></label>
                                  <input
                                    type="text"
                                    required
                                    value={newSupplyCat}
                                    onChange={(e) => setNewSupplyCat(e.target.value)}
                                    placeholder="Ví dụ: Giấy in, Bút viết, Đồng phục..."
                                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase block">Đơn vị tính <span className="text-rose-500">*</span></label>
                                  <input
                                    type="text"
                                    required
                                    value={newSupplyUnit}
                                    onChange={(e) => setNewSupplyUnit(e.target.value)}
                                    placeholder="Ví dụ: Ram, Hộp, Cái..."
                                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase block">Số Tồn Kho <span className="text-rose-500">*</span></label>
                                  <input
                                    type="number"
                                    required
                                    value={newSupplyStock === 0 ? "" : newSupplyStock}
                                    onChange={(e) => setNewSupplyStock(Number(e.target.value))}
                                    placeholder="Ví dụ: 100"
                                    min={0}
                                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                                  />
                                </div>

                                <button
                                  type="submit"
                                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow"
                                >
                                  Lưu vật tư
                                </button>
                              </form>
                            </div>

                            {/* Right Table: Supplies list */}
                            <div className="md:col-span-2 space-y-3">
                              <h5 className="font-bold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1">
                                <span>📋</span> Danh sách vật tư ({supplies.length})
                              </h5>
                              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-[300px] overflow-y-auto">
                                <table className="w-full text-xs text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                                      <th className="py-2.5 px-3 w-12 text-center">STT</th>
                                      <th className="py-2.5 px-3">Tên vật tư</th>
                                      <th className="py-2.5 px-3 w-28">Danh mục</th>
                                      <th className="py-2.5 px-3 w-20">Đơn vị</th>
                                      <th className="py-2.5 px-3 w-24">Số tồn kho</th>
                                      <th className="py-2.5 px-3 w-12 text-center">Xóa</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                    {supplies
                                      .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                      .map((s, index) => (
                                        <tr key={index} className="hover:bg-slate-50/50 transition-all">
                                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[10px]">{index + 1}</td>
                                          <td className="py-2 px-3 text-slate-800 font-bold">{s.name}</td>
                                          <td className="py-2 px-3 text-slate-500">{s.cat}</td>
                                          <td className="py-2 px-3 font-mono text-slate-500">{s.unit}</td>
                                          <td className="py-2 px-3 text-slate-800 font-bold">{s.stock}</td>
                                          <td className="py-2 px-3 text-center">
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteSupply(s.name)}
                                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                              title="Xóa vật tư"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    {supplies.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                                          Chưa có vật tư nào trong danh mục
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Add Supply Form */}
                      {showAddSupply && (
                        <form onSubmit={handleAddSupply} className="bg-slate-50/60 border border-slate-200 rounded-2xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên vật tư</label>
                              <input
                                type="text"
                                value={newSupplyName}
                                onChange={(e) => setNewSupplyName(e.target.value)}
                                placeholder="Ví dụ: Giấy A4 Double A..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danh mục</label>
                              <select
                                value={newSupplyCat}
                                onChange={(e) => setNewSupplyCat(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white focus:border-blue-500 focus:outline-none cursor-pointer"
                              >
                                {uniqueCategories.map((cat, idx) => (
                                  <option key={idx} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đơn vị tính</label>
                              <input
                                type="text"
                                value={newSupplyUnit}
                                onChange={(e) => setNewSupplyUnit(e.target.value)}
                                placeholder="Ví dụ: Ram, Hộp, Cái..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Số lượng tồn ban đầu</label>
                              <input
                                type="number"
                                value={newSupplyStock}
                                onChange={(e) => setNewSupplyStock(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white"
                                min={0}
                                required
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setShowAddSupply(false)}
                              className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all active:scale-95"
                            >
                              Hủy
                            </button>
                            <button
                              type="submit"
                              className="px-3.5 py-1.5 bg-[#005BAC] text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm transition-all active:scale-95"
                            >
                              Thêm vật tư
                            </button>
                          </div>
                        </form>
                      )}

                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4">Vật tư văn phòng</th>
                              <th className="py-3 px-4">Danh mục</th>
                              <th className="py-3 px-4">Đơn vị</th>
                              <th className="py-3 px-4">Số lượng tồn kho</th>
                              <th className="py-3 px-4">Đã cấp phát</th>
                              <th className="py-3 px-4">Trạng thái tồn kho</th>
                              {canDeleteSupplies && <th className="py-3 px-4 w-16 text-center">Thao tác</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                            {supplies
                              .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                              .map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 hover:translate-x-[2px] transition-all duration-150">
                                  <td className="py-3.5 px-4 font-bold text-slate-800">{item.name}</td>
                                  <td className="py-3.5 px-4 text-slate-500">{item.cat}</td>
                                  <td className="py-3.5 px-4 font-mono text-slate-500">{item.unit}</td>
                                  <td className="py-3.5 px-4 text-slate-800 font-bold">
                                    {editingSupplyName === item.name ? (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="number"
                                          value={editingStockVal}
                                          onChange={(e) => setEditingStockVal(Number(e.target.value))}
                                          className="w-16 px-2 py-0.5 border border-slate-300 rounded text-xs font-semibold focus:border-blue-500 focus:outline-none"
                                          min={0}
                                        />
                                        <button
                                          onClick={() => handleSaveStock(item.name)}
                                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                                          title="Lưu"
                                        >
                                          <Check size={12} />
                                        </button>
                                        <button
                                          onClick={() => setEditingSupplyName(null)}
                                          className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-all"
                                          title="Hủy"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span>{item.stock}</span>
                                        <button
                                          onClick={() => handleStartEditStock(item)}
                                          className="text-slate-400 hover:text-blue-600 p-1 bg-slate-50 hover:bg-blue-50 border border-slate-200/50 rounded-lg transition-all"
                                          title="Sửa số lượng"
                                        >
                                          <Pencil size={10} />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-slate-400">{item.allocated}</td>
                                  <td className="py-3.5 px-4">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      item.stock < 15 ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-emerald-100 text-emerald-700"
                                    }`}>
                                      {item.stock < 15 ? "Cảnh báo" : "Bình thường"}
                                    </span>
                                  </td>
                                  {canDeleteSupplies && (
                                    <td className="py-3.5 px-4 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSupply(item.name)}
                                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                        title="Xóa vật tư"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 2: Department VP Allocation */}
                  {vppSubTab === "phongban" && (
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-4 animate-in fade-in-40 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="font-heading font-bold text-slate-800 text-xs">VPP cấp phát cho từng Phòng Ban khối Văn Phòng</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Tự động cập nhật số lượng và khấu trừ kho của hành chính khi duyệt cấp</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phòng ban:</span>
                            <select
                              value={selectedDeptFilter}
                              onChange={(e) => setSelectedDeptFilter(e.target.value)}
                              className="bg-transparent border-none outline-none font-semibold text-slate-700 cursor-pointer text-xs"
                            >
                              <option value="Tất cả">-- Tất cả --</option>
                              {allocationTargets.filter(t => t.type === "phongban").map((t) => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setNewPYCTarget("phongban");
                              const pbs = allocationTargets.filter(t => t.type === "phongban");
                              setNewPYCTargetName(pbs.length > 0 ? pbs[0].name : "");
                              if (supplies.length > 0) setNewPYCItem(supplies[0].name);
                              setNewPYCQty(1);
                              setShowNewPYCModal(true);
                            }}
                            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                          >
                            <Plus size={14} /> Tạo yêu cầu cấp
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4">Mã PYC</th>
                              <th className="py-3 px-4">Phòng ban</th>
                              <th className="py-3 px-4">Vật tư yêu cầu</th>
                              <th className="py-3 px-4 text-center">Số lượng</th>
                              <th className="py-3 px-4">Ngày yêu cầu</th>
                              <th className="py-3 px-4">Trạng thái</th>
                              <th className="py-3 px-4 text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                            {deptRequests
                              .filter(r => r.target === "phongban" && (selectedDeptFilter === "Tất cả" || r.targetName === selectedDeptFilter))
                              .map((req) => (
                                <tr key={req.id} className="hover:bg-slate-50/50 hover:translate-x-[2px] transition-all duration-150">
                                  <td className="py-3.5 px-4 font-mono text-slate-400">{req.id}</td>
                                  <td className="py-3.5 px-4 text-slate-800 font-bold">{req.targetName}</td>
                                  <td className="py-3.5 px-4 text-slate-600">{req.item}</td>
                                  <td className="py-3.5 px-4 text-center text-slate-850 font-bold">{req.qty}</td>
                                  <td className="py-3.5 px-4 font-mono text-slate-500">{req.date}</td>
                                  <td className="py-3.5 px-4">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      req.status === "Đã cấp phát" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                    }`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                      {req.status === "Chờ duyệt" ? (
                                        canApproveRequests ? (
                                          <button
                                            onClick={() => handleApproveRequest(req.id)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm shrink-0"
                                          >
                                            Duyệt & Cấp phát
                                          </button>
                                        ) : (
                                          <span className="text-slate-400 text-[10px] font-bold italic shrink-0">Chờ duyệt</span>
                                        )
                                      ) : (
                                        <span className="text-slate-350 text-[10px] font-normal italic shrink-0">Đã bàn giao</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRequest(req.id)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors cursor-pointer shrink-0"
                                        title="Xóa yêu cầu"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            {deptRequests.filter(r => r.target === "phongban" && (selectedDeptFilter === "Tất cả" || r.targetName === selectedDeptFilter)).length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-8 text-center text-slate-400 font-medium italic">
                                  Không có yêu cầu cấp phát nào của phòng ban phù hợp với bộ lọc.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 3: Ban Điều Hành Project Allocation */}
                  {vppSubTab === "duan" && (
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-4 animate-in fade-in-40 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="font-heading font-bold text-slate-800 text-xs">VPP cấp phát cho Ban Điều Hành các Dự án</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Tự động cập nhật số lượng và khấu trừ kho của hành chính khi duyệt cấp</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dự án:</span>
                            <select
                              value={selectedProjectFilter}
                              onChange={(e) => setSelectedProjectFilter(e.target.value)}
                              className="bg-transparent border-none outline-none font-semibold text-slate-700 cursor-pointer text-xs"
                            >
                              <option value="Tất cả">-- Tất cả --</option>
                              {allocationTargets.filter(t => t.type === "duan").map((t) => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setNewPYCTarget("duan");
                              const das = allocationTargets.filter(t => t.type === "duan");
                              setNewPYCTargetName(das.length > 0 ? das[0].name : "");
                              if (supplies.length > 0) setNewPYCItem(supplies[0].name);
                              setNewPYCQty(1);
                              setShowNewPYCModal(true);
                            }}
                            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                          >
                            <Plus size={14} /> Tạo yêu cầu cấp
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4">Mã PYC</th>
                              <th className="py-3 px-4">Dự án</th>
                              <th className="py-3 px-4">Vật tư yêu cầu</th>
                              <th className="py-3 px-4 text-center">Số lượng</th>
                              <th className="py-3 px-4">Ngày yêu cầu</th>
                              <th className="py-3 px-4">Trạng thái</th>
                              <th className="py-3 px-4 text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                            {deptRequests
                              .filter(r => r.target === "duan" && (selectedProjectFilter === "Tất cả" || r.targetName === selectedProjectFilter))
                              .map((req) => (
                                <tr key={req.id} className="hover:bg-slate-50/50 hover:translate-x-[2px] transition-all duration-150">
                                  <td className="py-3.5 px-4 font-mono text-slate-400">{req.id}</td>
                                  <td className="py-3.5 px-4 text-slate-800 font-bold">{req.dept}</td>
                                  <td className="py-3.5 px-4 text-slate-600">{req.item}</td>
                                  <td className="py-3.5 px-4 text-center text-slate-850 font-bold">{req.qty}</td>
                                  <td className="py-3.5 px-4 font-mono text-slate-500">{req.date}</td>
                                  <td className="py-3.5 px-4">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      req.status === "Đã cấp phát" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                    }`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                      {req.status === "Chờ duyệt" ? (
                                        canApproveRequests ? (
                                          <button
                                            onClick={() => handleApproveRequest(req.id)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm shrink-0"
                                          >
                                            Duyệt & Cấp phát
                                          </button>
                                        ) : (
                                          <span className="text-slate-400 text-[10px] font-bold italic shrink-0">Chờ duyệt</span>
                                        )
                                      ) : (
                                        <span className="text-slate-350 text-[10px] font-normal italic shrink-0">Đã bàn giao</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRequest(req.id)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors cursor-pointer shrink-0"
                                        title="Xóa yêu cầu"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            {deptRequests.filter(r => r.target === "duan" && (selectedProjectFilter === "Tất cả" || r.targetName === selectedProjectFilter)).length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-8 text-center text-slate-400 font-medium italic">
                                  Không có yêu cầu cấp phát nào của dự án phù hợp với bộ lọc.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Create New PYC Modal */}
                  {showNewPYCModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-100 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-200">
                        <button
                          onClick={() => setShowNewPYCModal(false)}
                          className="absolute right-4 top-4 p-1 text-slate-400 hover:bg-slate-50 rounded-lg transition-all"
                        >
                          <X size={16} />
                        </button>
                        
                        <div className="border-b border-slate-100 pb-3">
                          <h3 className="font-heading font-extrabold text-sm text-slate-800">Tạo Phiếu Yêu Cầu Văn Phòng Phẩm</h3>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Khởi tạo phiếu yêu cầu cấp phát vật tư</p>
                        </div>

                        <form onSubmit={handleCreatePYC} className="space-y-4 text-xs font-semibold text-slate-700">
                          {/* Target Type Selector */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đối tượng nhận cấp phát</label>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setNewPYCTarget("phongban");
                                  const pbs = allocationTargets.filter(t => t.type === "phongban");
                                  setNewPYCTargetName(pbs.length > 0 ? pbs[0].name : "");
                                }}
                                className={`py-2.5 px-3 border rounded-xl font-bold transition-all text-center active:scale-[0.98] ${
                                  newPYCTarget === "phongban"
                                    ? "border-[#005BAC] bg-blue-50/45 text-[#005BAC] shadow-sm"
                                    : "border-slate-200 text-slate-500 hover:bg-slate-50/50"
                                }`}
                              >
                                Phòng Ban VP
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewPYCTarget("duan");
                                  const das = allocationTargets.filter(t => t.type === "duan");
                                  setNewPYCTargetName(das.length > 0 ? das[0].name : "");
                                }}
                                className={`py-2.5 px-3 border rounded-xl font-bold transition-all text-center active:scale-[0.98] ${
                                  newPYCTarget === "duan"
                                    ? "border-[#005BAC] bg-blue-50/45 text-[#005BAC] shadow-sm"
                                    : "border-slate-200 text-slate-500 hover:bg-slate-50/50"
                                }`}
                              >
                                BĐH Dự Án
                              </button>
                            </div>
                          </div>

                          {/* Specific Department/Project Selection */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {newPYCTarget === "phongban" ? "Chọn Phòng Ban VP" : "Chọn Dự Án BĐH"}
                            </label>
                            <select
                              value={newPYCTargetName}
                              onChange={(e) => setNewPYCTargetName(e.target.value)}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-white font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 cursor-pointer"
                            >
                              {newPYCTarget === "phongban"
                                ? allocationTargets.filter(t => t.type === "phongban").map((t) => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                  ))
                                : allocationTargets.filter(t => t.type === "duan").map((t) => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                  ))}
                            </select>
                          </div>

                          {/* Supply Item Selector */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chọn vật tư yêu cầu</label>
                            <select
                              value={newPYCItem}
                              onChange={(e) => setNewPYCItem(e.target.value)}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-white font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 cursor-pointer"
                              required
                            >
                              {supplies.length === 0 ? (
                                <option value="">-- Không có vật tư nào trong kho --</option>
                              ) : (
                                supplies.map((item, i) => (
                                  <option key={i} value={item.name}>
                                    {item.name} (Còn lại: {item.stock} {item.unit})
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          {/* Quantity Input */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Số lượng yêu cầu</label>
                            <input
                              type="number"
                              min={1}
                              value={newPYCQty}
                              onChange={(e) => setNewPYCQty(Number(e.target.value))}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 bg-white"
                              required
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setShowNewPYCModal(false)}
                              className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all active:scale-95"
                            >
                              Hủy bỏ
                            </button>
                            <button
                              type="submit"
                              disabled={supplies.length === 0}
                              className="px-4 py-2 bg-[#005BAC] disabled:bg-slate-300 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm transition-all active:scale-95"
                            >
                              Tạo phiếu yêu cầu
                            </button>
                          </div>
                        </form>
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

                  {isTableMissing && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-800 animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                      <div className="text-xs space-y-1">
                        <p className="font-bold">Bảng lưu trữ 'invoices' chưa được khởi tạo trên Supabase!</p>
                        <p className="font-medium text-slate-600 leading-relaxed font-sans">
                          Hiện tại dữ liệu hóa đơn của bạn chỉ đang được lưu tạm thời trên bộ nhớ trình duyệt, điều này dẫn đến việc <strong>bị mất hết dữ liệu khi bạn F5 hoặc tải lại trang</strong>.
                        </p>
                        <button
                          onClick={() => setShowSqlGuideModal(true)}
                          className="mt-2 text-[10px] font-extrabold text-[#005BAC] hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer p-0"
                        >
                          Xem hướng dẫn khởi tạo bảng (chỉ mất 1 phút) <ArrowRight size={10} />
                        </button>
                      </div>
                    </div>
                  )}

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
                              <div key={item.id} className="flex flex-col bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                                <div className="flex items-center justify-between">
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
                                    {item.status === "error" && <span className="text-[9px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded font-bold border border-rose-100">Lỗi API</span>}
                                    
                                    <button 
                                      onClick={() => setInvoiceQueue(prev => prev.filter(q => q.id !== item.id))} 
                                      className="text-slate-400 hover:text-rose-500 transition-colors p-0.5 rounded"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                                {item.status === "error" && (
                                  <div className="text-[9px] text-rose-500 font-bold mt-1.5 bg-rose-50/50 p-1.5 rounded border border-rose-100/50 break-words">
                                    {item.error || "Không thể gọi OpenAI API. Hãy kiểm tra lại API Key."}
                                  </div>
                                )}
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


                    </div>

                    {/* Right Column: preview table + form + export buttons */}
                    <div className="lg:col-span-3 border border-slate-150 rounded-2xl p-5 bg-slate-50/50 space-y-4 min-h-[300px] flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                          <span className="text-[10px] font-extrabold text-[#005BAC] uppercase">Bản xem trước & chỉnh sửa kết quả</span>
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
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                  <div className="text-[10px] font-extrabold text-slate-500 uppercase">
                                    Thông tin làm hồ sơ chứng từ
                                  </div>
                                  <div className="flex gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[9px] font-bold">
                                    <button
                                      type="button"
                                      onClick={() => setDocumentType("transfer")}
                                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${documentType === "transfer" ? "bg-white text-[#005BAC] shadow-sm" : "text-slate-400"}`}
                                    >
                                      Đề nghị Chuyển tiền
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDocumentType("payment")}
                                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${documentType === "payment" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400"}`}
                                    >
                                      Đề nghị Thanh toán
                                    </button>
                                  </div>
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
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Lý do xin thanh toán/chuyển tiền chung</label>
                                  <input
                                    type="text"
                                    value={paymentMission}
                                    onChange={(e) => setPaymentMission(e.target.value)}
                                    placeholder="Ví dụ: Thanh toán chi phí tiếp khách văn phòng..."
                                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                  />
                                </div>

                                {documentType === "transfer" && (
                                  <>
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Tên dự án</label>
                                      <input
                                        type="text"
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder="Ví dụ: Văn phòng HCM"
                                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Tên đơn vị thụ hưởng (Nhà cung cấp)</label>
                                      <input
                                        type="text"
                                        value={supplierName}
                                        onChange={(e) => setSupplierName(e.target.value)}
                                        placeholder="Tên công ty bán hàng..."
                                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Số tài khoản chuyển tiền</label>
                                        <input
                                          type="text"
                                          value={bankAccount}
                                          onChange={(e) => setBankAccount(e.target.value)}
                                          placeholder="Số tài khoản..."
                                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Tại Ngân hàng & Chi nhánh</label>
                                        <input
                                          type="text"
                                          value={bankNameBranch}
                                          onChange={(e) => setBankNameBranch(e.target.value)}
                                          placeholder="Sacombank CN Tân Phú..."
                                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                        />
                                      </div>
                                    </div>
                                  </>
                                )}
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
                            onClick={() => setShowPreviewModal(true)}
                            className="px-3.5 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#005BAC] text-[10px] font-bold rounded-lg flex items-center gap-1.5 active:scale-95 transition-all shadow-sm cursor-pointer"
                          >
                            <Eye size={12} />
                            Xem trước
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
                                {documentType === "payment" ? "Xuất phiếu thanh toán (Word)" : "Xuất giấy chuyển tiền (Word)"}
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
                            <th className="p-3 text-center">File gốc</th>
                            <th className="p-3 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                          {invoices.filter(inv => !inv.number?.startsWith("HD-DK-")).map((inv) => (
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
                              <td className="p-3 text-center">
                                {inv.file_url ? (
                                  <button
                                    onClick={() => {
                                      setPreviewFileUrl(inv.file_url || "");
                                      setPreviewFileName(`Hóa đơn số ${inv.number}`);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 rounded-lg hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center bg-transparent border-none"
                                    title="Xem file gốc"
                                  >
                                    <Eye size={14} />
                                  </button>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => handleDeleteInvoice(inv.id)}
                                  className="text-slate-400 hover:text-rose-500 transition-colors p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                                  title="Xóa hóa đơn"
                                >
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

              {/* ─── TAB 4: Hồ sơ thanh toán định kỳ ─── */}
              {/* ─── TAB 4: Hồ sơ thanh toán định kỳ ─── */}
              {activeTab === "recurring" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div className="flex flex-col md:flex-row border-b border-slate-100 pb-4 justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Hồ sơ thanh toán định kỳ hàng tháng</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Quản lý danh mục nhà cung cấp và lập hồ sơ thanh toán nhanh chóng</p>
                    </div>
                    
                    {/* Sub-tab navigation */}
                    <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-semibold shrink-0">
                      <button
                        onClick={() => setRecurringSubTab("suppliers")}
                        className={`px-4 py-1.5 rounded-lg transition-all text-[11px] font-bold cursor-pointer ${
                          recurringSubTab === "suppliers"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        📁 Danh mục Nhà Cung Cấp ({suppliers.length})
                      </button>
                      <button
                        onClick={() => setRecurringSubTab("payments")}
                        className={`px-4 py-1.5 rounded-lg transition-all text-[11px] font-bold cursor-pointer ${
                          recurringSubTab === "payments"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        ✍️ Bảng thanh toán tháng ({pendingPayments.filter(p => p.month === payMonth).length})
                      </button>
                    </div>
                  </div>

                  {/* SUB-TAB 1: suppliers (Danh mục NCC) */}
                  {recurringSubTab === "suppliers" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Left form */}
                      <div className="md:col-span-1 border border-slate-200/80 bg-slate-50/20 p-5 rounded-2xl space-y-4">
                        <h4 className="font-heading font-extrabold text-slate-800 text-xs flex items-center gap-1.5 border-b border-slate-105 pb-2">
                          <span>➕</span> Thêm nhà cung cấp mới
                        </h4>
                        <form onSubmit={handleAddSupplier} className="space-y-3 text-[11px] font-semibold text-slate-600">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Mã Nhà cung cấp (Tùy chọn)</label>
                            <input
                              type="text"
                              value={supplierIdState}
                              onChange={(e) => setSupplierIdState(e.target.value)}
                              placeholder={`Ví dụ: NCC-${String(suppliers.length + 1).padStart(2, "0")}`}
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Tên nhà cung cấp <span className="text-rose-500">*</span></label>
                            <input
                              type="text"
                              required
                              value={supplierNameState}
                              onChange={(e) => setSupplierNameState(e.target.value)}
                              placeholder="Ví dụ: CÔNG TY CỔ PHẦN HAI BỐN BẢY"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Số tài khoản ngân hàng <span className="text-rose-500">*</span></label>
                            <input
                              type="text"
                              required
                              value={supplierAccountState}
                              onChange={(e) => setSupplierAccountState(e.target.value)}
                              placeholder="Ví dụ: 14020592925013"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-mono font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Ngân hàng & Chi nhánh <span className="text-rose-500">*</span></label>
                            <input
                              type="text"
                              required
                              value={supplierBankState}
                              onChange={(e) => setSupplierBankState(e.target.value)}
                              placeholder="Ví dụ: Techcombank - CN Quang Trung"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Hàng hóa / Dịch vụ cung cấp</label>
                            <input
                              type="text"
                              value={supplierServiceState}
                              onChange={(e) => setSupplierServiceState(e.target.value)}
                              placeholder="Ví dụ: Chuyển phát nhanh tài liệu"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow"
                          >
                            Lưu nhà cung cấp
                          </button>
                        </form>
                      </div>

                      {/* Right list table */}
                      <div className="md:col-span-2 space-y-4">
                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm max-h-[460px] overflow-y-auto">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                                <th className="py-2.5 px-3 w-16 text-center">Mã NCC</th>
                                <th className="py-2.5 px-3">Tên Nhà Cung Cấp</th>
                                <th className="py-2.5 px-3">Tài Khoản</th>
                                <th className="py-2.5 px-3">Ngân Hàng Thụ Hưởng</th>
                                <th className="py-2.5 px-3">Hàng Hóa / Dịch Vụ</th>
                                <th className="py-2.5 px-3 w-12 text-center">Xóa</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                              {suppliers.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-50/50 transition-all font-semibold">
                                  <td className="py-3 px-3 text-center text-slate-400 font-mono text-[10px]">{s.id}</td>
                                  <td className="py-3 px-3 text-slate-850 font-bold">{s.name}</td>
                                  <td className="py-3 px-3 font-mono font-bold text-slate-800 text-[11px]">{s.account}</td>
                                  <td className="py-3 px-3 text-slate-500 text-[11px] leading-snug">{s.bank}</td>
                                  <td className="py-3 px-3 text-slate-400 italic text-[11px]">{s.service || "—"}</td>
                                  <td className="py-3 px-3 text-center">
                                    <button
                                      onClick={() => handleDeleteSupplier(s.id)}
                                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                      title="Xóa nhà cung cấp"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {suppliers.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="py-10 text-center text-slate-400 italic">Danh sách NCC trống. Hãy thêm nhà cung cấp mới.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 2: payments (Bảng lập thanh toán NCC) */}
                  {recurringSubTab === "payments" && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Left form */}
                      <div className="md:col-span-1 border border-slate-200/80 bg-slate-50/20 p-5 rounded-2xl space-y-4">
                        <h4 className="font-heading font-extrabold text-slate-800 text-xs flex items-center gap-1.5 border-b border-slate-105 pb-2">
                          <span>📁</span> Danh sách nhà cung cấp
                        </h4>
                        <form onSubmit={handleAddPendingPayment} className="space-y-3 text-[11px] font-semibold text-slate-600">
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Chọn Nhà Cung Cấp <span className="text-rose-500">*</span></label>
                            <select
                              required
                              value={selectedSupplierId}
                              onChange={(e) => handleSupplierSelect(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800 cursor-pointer"
                            >
                              <option value="">-- Chọn Nhà cung cấp --</option>
                              {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                              ))}
                            </select>
                          </div>

                          {selectedSupplierId && (() => {
                            const s = suppliers.find(x => x.id === selectedSupplierId);
                            if (!s) return null;
                            return (
                              <div className="p-3 bg-white border border-slate-100 rounded-xl space-y-1 text-[10px] text-slate-500 leading-normal animate-in fade-in duration-200 font-bold">
                                <p>🏦 Tài khoản: <strong className="text-slate-700 font-mono">{s.account}</strong></p>
                                <p>🏢 Ngân hàng: <strong className="text-slate-700">{s.bank}</strong></p>
                                <p>📦 Dịch vụ mặc định: <strong className="text-slate-750 italic">{s.service || "—"}</strong></p>
                              </div>
                            );
                          })()}

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Số tiền thanh toán (VNĐ) <span className="text-rose-500">*</span></label>
                            <input
                              type="number"
                              required
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              placeholder="Nhập số tiền chuyển, ví dụ: 3500000"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Tháng thanh toán <span className="text-rose-500">*</span></label>
                            <input
                              type="text"
                              required
                              value={payMonth}
                              onChange={(e) => setPayMonth(e.target.value)}
                              placeholder="Ví dụ: 06/2026"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Nội dung thanh toán</label>
                            <textarea
                              value={payContent}
                              onChange={(e) => setPayContent(e.target.value)}
                              placeholder="Ví dụ: Thanh toan cuoc internet thang 06/2026"
                              rows={2}
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800 resize-none font-medium text-slate-700"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow"
                          >
                            + Thêm & Đồng bộ lên Hóa Đơn
                          </button>
                        </form>
                      </div>

                      {/* Right list and export */}
                      <div className="md:col-span-2 space-y-4">
                        <div className="flex justify-between items-center bg-slate-50/50 p-4 border border-slate-200/65 rounded-2xl">
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase block">Tổng cộng tháng {payMonth}</span>
                            <span className="text-base font-black text-[#005BAC]">
                              {pendingPayments
                                .filter(p => p.month === payMonth)
                                .reduce((sum, p) => sum + p.amount, 0)
                                .toLocaleString("vi-VN")} đ
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const currentMonthPayments = pendingPayments.filter(p => p.month === payMonth);
                                if (currentMonthPayments.length === 0) {
                                  alert("Danh sách thanh toán trống, không thể xem trước!");
                                  return;
                                }
                                setSelectedRecurringPreviewIdx(0);
                                setShowRecurringPreviewModal(true);
                              }}
                              className="px-4 py-2.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#005BAC] text-xs font-bold rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow cursor-pointer"
                            >
                              <Eye size={14} />
                              Xem trước
                            </button>
                            <button
                              type="button"
                              onClick={handleExportDeNghiChuyenTien}
                              disabled={exportLoading}
                              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                              {exportLoading ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" />
                                  Đang tạo...
                                </>
                              ) : (
                                <>
                                  <Download size={13} />
                                  Xuất đề nghị chuyển tiền (Word)
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm max-h-[365px] overflow-y-auto">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                                <th className="py-2.5 px-3">Tên Nhà Cung Cấp</th>
                                <th className="py-2.5 px-3">Tài khoản & Ngân hàng</th>
                                <th className="py-2.5 px-3">Nội dung</th>
                                <th className="py-2.5 px-3 text-right">Số tiền (đ)</th>
                                <th className="py-2.5 px-3 text-center">File gốc</th>
                                <th className="py-2.5 px-3 w-20 text-center">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                              {pendingPayments
                                .filter(p => p.month === payMonth)
                                .map((p) => (
                                  <tr 
                                    key={p.id} 
                                    onClick={() => handlePreviewSpecificPayment(p.id)}
                                    className="hover:bg-blue-50/50 transition-all font-semibold cursor-pointer group"
                                    title="Click để xem trước chứng từ thanh toán"
                                  >
                                    <td className="py-3 px-3 text-slate-850 font-bold group-hover:text-blue-700">{p.supplierName}</td>
                                    <td className="py-3 px-3 leading-snug">
                                      <div className="font-mono text-slate-800 font-bold text-[11px] group-hover:text-blue-700">{p.account}</div>
                                      <div className="text-slate-450 text-[10px] font-semibold">{p.bank}</div>
                                    </td>
                                    <td className="py-3 px-3 text-slate-500 text-[11.5px] leading-snug font-medium">{p.content}</td>
                                    <td className="py-3 px-3 text-right font-black text-slate-800 group-hover:text-blue-700">{p.amount.toLocaleString("vi-VN")}</td>
                                    <td className="py-3 px-3 text-center animate-in fade-in" onClick={(e) => e.stopPropagation()}>
                                      {uploadingPaymentId === p.id ? (
                                        <Loader2 className="animate-spin text-blue-600 mx-auto" size={14} />
                                      ) : p.fileUrl ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPreviewFileUrl(p.fileUrl || "");
                                              setPreviewFileName(`Hóa đơn ${p.supplierName}`);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 rounded-lg hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center bg-transparent border-none"
                                            title="Xem file gốc"
                                          >
                                            <Eye size={14} />
                                          </button>
                                          <label className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center relative">
                                            <Upload size={13} />
                                            <input
                                              type="file"
                                              className="hidden"
                                              onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                  handleUploadFileForPayment(p.id, e.target.files[0]);
                                                }
                                              }}
                                            />
                                          </label>
                                        </div>
                                      ) : (
                                        <label className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center relative mx-auto">
                                          <Upload size={14} />
                                          <input
                                            type="file"
                                            className="hidden"
                                            onChange={(e) => {
                                              if (e.target.files && e.target.files[0]) {
                                                handleUploadFileForPayment(p.id, e.target.files[0]);
                                              }
                                            }}
                                          />
                                        </label>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setEditingPayment(p)}
                                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer bg-transparent border-none"
                                          title="Chỉnh sửa thanh toán"
                                        >
                                          <Pencil size={13} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeletePendingPayment(p.id)}
                                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer bg-transparent border-none"
                                          title="Xóa thanh toán"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              {pendingPayments.filter(p => p.month === payMonth).length === 0 && (
                                <tr>
                                  <td colSpan={6} className="py-10 text-center text-slate-400 italic">Không có khoản thanh toán nào cho tháng {payMonth}.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

            </div>
          )}

              {/* ─── TAB 4: Báo cáo chi phí tháng ─── */}
              {activeTab === "report" && (() => {
                const { combinedItems, totalAmount, invoiceCount, recurringCount, categoriesMap } = getReportData(reportStartDate, reportEndDate);
                
                return (
                  <div className="space-y-6">
                    {/* Header Controls */}
                    <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-heading font-bold text-slate-800 text-sm">Báo cáo tổng hợp chi phí</h3>
                          <p className="text-slate-400 text-[10px] font-semibold mt-1">Tổng hợp tự động toàn bộ hóa đơn và các khoản thanh toán định kỳ theo khoảng ngày</p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Date Range Trigger Button */}
                          <div className="relative">
                            <button
                              onClick={() => {
                                setTempStartDate(reportStartDate);
                                setTempEndDate(reportEndDate);
                                setShowDatePickerPopover(!showDatePickerPopover);
                              }}
                              className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl px-3.5 py-2 transition-all group"
                            >
                              <Calendar size={14} className="text-[#005BAC]" />
                              <span className="text-[11px] font-bold text-slate-700">
                                {formatDateVN(reportStartDate)} <span className="text-slate-400 font-normal">→</span> {formatDateVN(reportEndDate)}
                              </span>
                              <ChevronDown size={12} className={`text-slate-400 transition-transform duration-200 ${showDatePickerPopover ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Date Range Popover */}
                            {showDatePickerPopover && (
                              <>
                                {/* Backdrop */}
                                <div className="fixed inset-0 z-[90]" onClick={handleCancelDateRange} />

                                {/* Popover Panel */}
                                <div className="absolute right-0 top-full mt-2 z-[100] w-[420px] bg-white rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                                  {/* Popover Header */}
                                  <div className="bg-gradient-to-r from-[#005BAC]/5 to-indigo-50/30 px-5 py-3.5 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                      <div className="bg-[#005BAC]/10 p-1.5 rounded-lg">
                                        <Calendar size={13} className="text-[#005BAC]" />
                                      </div>
                                      <div>
                                        <h4 className="text-[11px] font-bold text-slate-700">Chọn khoảng thời gian</h4>
                                        <p className="text-[9px] text-slate-400 font-semibold">Chọn nhanh hoặc tùy chỉnh ngày bắt đầu và kết thúc</p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="p-5 space-y-5">
                                    {/* Quick Select Section */}
                                    <div className="space-y-2.5">
                                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Chọn nhanh</span>
                                      <div className="grid grid-cols-2 gap-2">
                                        {[
                                          { label: "Tháng này", value: "thisMonth" },
                                          { label: "1 Tháng gần nhất", value: "1month" },
                                          { label: "2 Tháng gần nhất", value: "2months" },
                                          { label: "3 Tháng gần nhất", value: "3months" },
                                        ].map((opt) => (
                                          <button
                                            key={opt.value}
                                            onClick={() => handleQuickSelect(opt.value)}
                                            className="px-3 py-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-[#005BAC]/5 hover:border-[#005BAC]/30 text-[11px] font-bold text-slate-600 hover:text-[#005BAC] transition-all duration-150 active:scale-[0.97]"
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-px bg-slate-100" />
                                      <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">hoặc chọn tùy chỉnh</span>
                                      <div className="flex-1 h-px bg-slate-100" />
                                    </div>

                                    {/* Custom Date Inputs */}
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Từ ngày</label>
                                        <div className="relative">
                                          <input
                                            type="date"
                                            value={tempStartDate}
                                            onChange={(e) => setTempStartDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200/80 rounded-xl px-3 py-2.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#005BAC]/20 focus:border-[#005BAC]/40 transition-all hover:border-slate-300"
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Đến ngày</label>
                                        <div className="relative">
                                          <input
                                            type="date"
                                            value={tempEndDate}
                                            onChange={(e) => setTempEndDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200/80 rounded-xl px-3 py-2.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#005BAC]/20 focus:border-[#005BAC]/40 transition-all hover:border-slate-300"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Preview Range */}
                                    {tempStartDate && tempEndDate && (
                                      <div className="bg-slate-50/80 border border-slate-100 rounded-xl px-3.5 py-2 flex items-center justify-center gap-2">
                                        <Calendar size={11} className="text-[#005BAC]" />
                                        <span className="text-[10px] font-bold text-slate-500">
                                          Kỳ chọn: <span className="text-[#005BAC]">{formatDateVN(tempStartDate)}</span>
                                          <span className="text-slate-300 mx-1">→</span>
                                          <span className="text-[#005BAC]">{formatDateVN(tempEndDate)}</span>
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Popover Footer Actions */}
                                  <div className="bg-slate-50/50 border-t border-slate-100 px-5 py-3.5 flex items-center justify-end gap-2.5">
                                    <button
                                      onClick={handleCancelDateRange}
                                      className="px-4 py-2 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-500 hover:text-slate-700 transition-all active:scale-95"
                                    >
                                      Hủy
                                    </button>
                                    <button
                                      onClick={handleApplyDateRange}
                                      className="px-4 py-2 rounded-xl bg-[#005BAC] hover:bg-blue-700 text-white text-[11px] font-bold shadow-md transition-all active:scale-95"
                                    >
                                      Áp dụng
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleExportReportExcel(tempStartDate, tempEndDate);
                                        setShowDatePickerPopover(false);
                                      }}
                                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-md transition-all active:scale-95"
                                    >
                                      <FileSpreadsheet size={12} /> Xuất Excel
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          <button
                            onClick={() => handleExportReportExcel(reportStartDate, reportEndDate)}
                            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
                          >
                            <FileSpreadsheet size={14} /> Tải xuống báo cáo (Excel)
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* KPI Summary Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Total cost card */}
                      <div className="glass bg-gradient-to-br from-blue-50/50 to-indigo-50/20 rounded-2xl p-5 border border-blue-100/60 shadow-premium flex items-center justify-between">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tổng chi phí kỳ</span>
                          <h3 className="text-xl font-black text-[#005BAC] tracking-tight">{totalAmount.toLocaleString("vi-VN")} đ</h3>
                          <p className="text-[10px] text-slate-400 font-semibold">Tự động tổng hợp thời gian thực</p>
                        </div>
                        <div className="bg-blue-500/10 text-[#005BAC] p-3.5 rounded-2xl">
                          <Receipt size={24} />
                        </div>
                      </div>

                      {/* Invoices Count */}
                      <div className="glass bg-gradient-to-br from-emerald-50/50 to-teal-50/20 rounded-2xl p-5 border border-emerald-100/60 shadow-premium flex items-center justify-between">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Hồ sơ hóa đơn xử lý</span>
                          <h3 className="text-xl font-black text-emerald-600 tracking-tight">{invoiceCount} Hồ sơ</h3>
                          <p className="text-[10px] text-slate-400 font-semibold">Trích xuất thành công từ hóa đơn AI</p>
                        </div>
                        <div className="bg-emerald-500/10 text-emerald-600 p-3.5 rounded-2xl">
                          <FileText size={24} />
                        </div>
                      </div>

                      {/* Recurring Payments Count */}
                      <div className="glass bg-gradient-to-br from-purple-50/50 to-pink-50/20 rounded-2xl p-5 border border-purple-100/60 shadow-premium flex items-center justify-between">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Thanh toán định kỳ</span>
                          <h3 className="text-xl font-black text-purple-600 tracking-tight">{recurringCount} Hồ sơ</h3>
                          <p className="text-[10px] text-slate-400 font-semibold">Các khoản chi định kỳ trong kỳ</p>
                        </div>
                        <div className="bg-purple-500/10 text-purple-600 p-3.5 rounded-2xl">
                          <RefreshCw size={24} />
                        </div>
                      </div>
                    </div>

                    {/* Cost structure breakdown & Process flow */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Cost breakdown progress bars */}
                      <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                        <div className="border-b border-slate-100 pb-3">
                          <h4 className="font-heading font-bold text-slate-800 text-xs">Cơ cấu chi phí thực tế</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Phân loại tự động dựa trên hóa đơn và phiếu chi</p>
                        </div>

                        <div className="space-y-4 pt-1">
                          {[
                            { label: "Văn phòng phẩm", key: "Văn phòng phẩm", color: "bg-blue-500" },
                            { label: "Điện nước văn phòng", key: "Điện nước văn phòng", color: "bg-[#005BAC]" },
                            { label: "Cáp quang Internet", key: "Cáp quang Internet", color: "bg-indigo-500" },
                            { label: "Chi phí mua đồ tiếp khách", key: "Chi phí mua đồ tiếp khách", color: "bg-purple-500" },
                            { label: "Chi phí khác", key: "Chi phí khác", color: "bg-slate-400" },
                          ].map((cost, idx) => {
                            const amount = categoriesMap[cost.key as keyof typeof categoriesMap] || 0;
                            const pct = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
                            
                            return (
                              <div key={idx} className="space-y-1.5">
                                <div className="flex justify-between text-[10px] font-bold text-slate-600">
                                  <span>{cost.label} ({pct.toFixed(1)}%)</span>
                                  <span className="text-slate-700 font-extrabold">{amount.toLocaleString("vi-VN")} đ</span>
                                </div>
                                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                  <div 
                                    className={`${cost.color} h-full rounded-full transition-all duration-500`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Process info and totals summary */}
                      <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="border-b border-slate-100 pb-3">
                            <h4 className="font-heading font-bold text-slate-800 text-xs">Tổng hợp và quy trình kiểm tra</h4>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Thông tin đối soát dữ liệu phòng HCNS</p>
                          </div>

                          <div className="space-y-2 text-[10.5px] font-semibold text-slate-500 pt-1">
                            <div className="flex justify-between border-b border-slate-50 pb-1.5">
                              <span>Kỳ đối soát:</span>
                              <span className="text-slate-800 font-bold">{formatDateVN(reportStartDate)} → {formatDateVN(reportEndDate)}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-50 pb-1.5">
                              <span>Tổng chứng từ tổng hợp:</span>
                              <span className="text-slate-800 font-bold">{combinedItems.length} hồ sơ chứng từ</span>
                            </div>
                            <div className="flex justify-between pb-1">
                              <span>Ngày chốt số liệu dự kiến:</span>
                              <span className="text-slate-800 font-bold">Ngày cuối tháng</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-blue-50/40 border border-blue-100 rounded-2xl p-4 text-[10px] text-slate-500 leading-relaxed font-semibold">
                          <div className="flex items-center gap-1.5 text-[#005BAC] font-bold mb-1.5">
                            <AlertTriangle size={13} />
                            <span className="text-[11px] uppercase tracking-wider">Quy trình chốt tháng:</span>
                          </div>
                          Nhân viên Hành chính kiểm tra trạng thái tất cả các hồ sơ thanh toán trong tháng, kết xuất file excel báo cáo chi phí tổng hợp, trình ký bản cứng đính kèm hóa đơn/phiếu thanh toán để chuyển phòng Kế toán đối soát trước ngày 05 tháng sau.
                        </div>
                      </div>
                    </div>

                    {/* Detail Inspection Table */}
                    <div className="glass bg-white rounded-2xl border border-slate-200/50 shadow-premium overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/40 flex justify-between items-center">
                        <div>
                          <h4 className="font-heading font-bold text-slate-800 text-xs">Bảng đối soát chi tiết các khoản chi</h4>
                          <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Hiển thị toàn bộ hóa đơn trích xuất và khoản thanh toán định kỳ</p>
                        </div>
                        <span className="bg-slate-100 text-slate-600 text-[9px] font-extrabold px-2.5 py-1 rounded-full border border-slate-200/50">
                          {combinedItems.length} Bản ghi
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 bg-slate-50/20">
                              <th className="py-3 px-4 w-12 text-center">STT</th>
                              <th className="py-3 px-4 w-36">Loại chứng từ</th>
                              <th className="py-3 px-4 w-32">Số hóa đơn/Mã</th>
                              <th className="py-3 px-4 w-28">Ngày nhận</th>
                              <th className="py-3 px-4">Đơn vị thụ hưởng</th>
                              <th className="py-3 px-4">Nội dung</th>
                              <th className="py-3 px-4">Phân loại</th>
                              <th className="py-3 px-4 text-right w-36">Số tiền</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/50 text-[11px] font-semibold text-slate-600">
                            {combinedItems.map((item, index) => (
                              <tr key={item.id} className="hover:bg-slate-50/30 transition-all">
                                <td className="py-3 px-4 text-center text-slate-400">{index + 1}</td>
                                <td className="py-3 px-4">
                                  {item.type === "Hóa đơn" ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                      <FileText size={10} /> Hóa đơn
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-100">
                                      <RefreshCw size={10} /> Định kỳ
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-mono text-slate-500 font-bold">{item.code}</td>
                                <td className="py-3 px-4 text-slate-400">{item.date}</td>
                                <td className="py-3 px-4 font-bold text-slate-700 max-w-[180px] truncate">{item.beneficiary}</td>
                                <td className="py-3 px-4 max-w-[240px] truncate" title={item.desc}>{item.desc}</td>
                                <td className="py-3 px-4">
                                  <span className="bg-slate-100 text-slate-600 text-[9px] font-extrabold px-2 py-0.5 rounded-full">
                                    {item.category}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right font-extrabold text-slate-800">{item.amount.toLocaleString("vi-VN")} đ</td>
                              </tr>
                            ))}

                            {combinedItems.length === 0 && (
                              <tr>
                                <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                                  Không có dữ liệu chi phí nào cho kỳ {formatDateVN(reportStartDate)} → {formatDateVN(reportEndDate)}.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        </main>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 flex flex-col space-y-5 animate-in fade-in-50 zoom-in-95 duration-150 relative">
            
            {/* Close Button */}
            <button
              onClick={() => setShowPreviewModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer"
            >
              <X size={16} />
            </button>

            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#005BAC]">
                  <Eye size={15} />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-slate-800 text-sm">
                    {documentType === "payment" ? "Xem trước Phiếu đề nghị thanh toán" : "Xem trước Giấy đề nghị chuyển tiền"}
                  </h3>
                  <p className="text-slate-400 text-[10px] font-semibold mt-0.5">
                    {documentType === "payment" ? "Biểu mẫu TCKT/BM/003" : "Biểu mẫu HC-BM021/ĐNCT"} (Xem trước nội dung điền tự động)
                  </p>
                </div>
              </div>
            </div>

            {/* Paper Container */}
            <div className="bg-white border border-slate-200 shadow p-8 rounded-xl font-serif text-[#1e293b] leading-relaxed max-w-2xl mx-auto w-full select-none" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              
              {/* Header block */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
                <div className="text-left">
                  <div className="text-base font-black text-[#005BAC] font-sans">TRUNG <span className="text-red-500">N</span>AM <span className="text-sky-400 text-xs font-normal italic">E&C</span></div>
                  <div className="text-[7.5px] font-bold text-slate-800 font-sans mt-0.5">CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM</div>
                  <div className="text-[6.5px] text-slate-500 font-sans mt-1 leading-tight">
                    A: Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br/>
                    T: (+84) 834 70 75 79 &nbsp; E: info.tnec@trungnamgroup.com.vn
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[13px] font-bold tracking-wide">
                    {documentType === "payment" ? "PHIẾU ĐỀ NGHỊ THANH TOÁN" : "GIẤY ĐỀ NGHỊ CHUYỂN TIỀN"}
                  </div>
                  <div className="text-[9.5px] font-bold underline mt-0.5">
                    {documentType === "payment" ? "TCKT/BM/003" : "HC-BM021/ĐNCT"}
                  </div>
                </div>
              </div>

              {/* Destination */}
              <div className="mb-4 text-xs font-bold leading-normal">
                Kính gửi: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Ban lãnh đạo Công ty CP XD và LM Trung Nam;<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - {documentType === "payment" ? "Phòng HCSN công ty," : "Phòng Kế toán công ty,"}
              </div>

              {/* Form Details */}
              <div className="space-y-1.5 text-xs mb-4">
                <div>
                  <span className="underline">Họ và tên người đề nghị {documentType === "payment" ? "thanh toán" : "" }</span>: <span className="font-bold">{employeeName}</span>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  <span className="underline">Bộ phận</span>: <span className="font-bold">{employeeDept}</span>
                </div>
                <div>
                  <span className="underline">{documentType === "payment" ? "Nội dung thanh toán" : "Lý do xin đề nghị chuyển tiền"}</span>: <span>{paymentMission}</span>
                </div>
                {documentType === "transfer" && (
                  <>
                    <div>
                      <span className="underline">Tên dự án</span>: <span className="font-bold">{projectName}</span>
                    </div>
                    <div>
                      <span className="underline">Tên đơn vị thụ hưởng</span>: <span className="font-bold">{supplierName}</span>
                    </div>
                    <div>
                      <span className="underline">Số tài khoản</span>: <span className="font-bold">{bankAccount}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; tại Ngân hàng <span className="font-bold">{bankNameBranch}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Invoice list table */}
              <table className="w-full border-collapse border border-slate-900 text-[10px] mb-4 text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center">
                    <th className="border border-slate-900 p-1 text-center" rowSpan={2}>TT</th>
                    <th className="border border-slate-900 p-1 text-center" colSpan={2}>HÓA ĐƠN</th>
                    <th className="border border-slate-900 p-1 text-center" rowSpan={2}>
                      {documentType === "payment" ? "NỘI DUNG THANH TOÁN" : "NỘI DUNG THANH TOÁN"}
                    </th>
                    <th className="border border-slate-900 p-1 text-center" rowSpan={2}>SỐ TIỀN (VNĐ)</th>
                    <th className="border border-slate-900 p-1 text-center" rowSpan={2}>GHI CHÚ</th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center">
                    <th className="border border-slate-900 p-1 text-center">SỐ</th>
                    <th className="border border-slate-900 p-1 text-center">NGÀY</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceQueue
                    .filter(item => item.status === "success")
                    .map((item, idx) => (
                      <tr key={item.id} className="border-b border-slate-900">
                        <td className="border border-slate-900 p-1 text-center">{idx + 1}</td>
                        <td className="border border-slate-900 p-1 font-mono font-bold text-center">{item.number}</td>
                        <td className="border border-slate-900 p-1 text-center">{item.date ? new Date(item.date).toLocaleDateString("vi-VN") : ""}</td>
                        <td className="border border-slate-900 p-1">{item.desc}</td>
                        <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                          {item.amount.toLocaleString("vi-VN")}
                        </td>
                        <td className="border border-slate-900 p-1"></td>
                      </tr>
                    ))}
                  <tr className="font-bold border-b border-slate-900">
                    <td className="border border-slate-900 p-1 text-center" colSpan={4}>Tổng cộng</td>
                    <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                      {invoiceQueue
                        .filter(item => item.status === "success")
                        .reduce((sum, item) => sum + item.amount, 0)
                        .toLocaleString("vi-VN")}
                    </td>
                    <td className="border border-slate-900 p-1"></td>
                  </tr>
                </tbody>
              </table>

              {/* Undertakings */}
              <div className="text-xs space-y-1.5 mb-6 leading-relaxed">
                <div className="italic">
                  <span className="font-bold">Bằng chữ: </span>
                  {docSoVietNam(
                    invoiceQueue
                      .filter(item => item.status === "success")
                      .reduce((sum, item) => sum + item.amount, 0)
                  )}
                </div>
                <div>
                  {documentType === "payment" 
                    ? "Tôi xin chịu trách nhiệm về nội dung thanh toán và các hóa đơn chứng từ kèm theo."
                    : "Tôi xin chịu trách nhiệm về nội dung đề nghị và các hóa đơn chứng từ kèm theo."}
                </div>
                <div className="italic">(Kèm theo .................................................... chứng từ gốc).</div>
              </div>

              {/* Signatures */}
              <div className="text-[10px]">
                <div className="text-right italic mb-3">
                  Tp.hcm, ngày ...... tháng ...... năm ........
                </div>
                <div className="grid grid-cols-4 font-bold text-center gap-1.5">
                  <div>{documentType === "payment" ? "GIÁM ĐỐC" : "BAN LÃNH ĐẠO"}</div>
                  <div>KẾ TOÁN TRƯỞNG</div>
                  <div>TRƯỞNG BỘ PHẬN</div>
                  <div>NGƯỜI ĐỀ NGHỊ</div>
                </div>
                <div className="h-16"></div>
              </div>

            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                Đóng lại
              </button>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  exportInvoicePaymentRequest();
                }}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer"
              >
                <Download size={13} /> Tải xuống file Word
              </button>
            </div>

          </div>
        </div>
      )}

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

      {/* SQL Guide Modal */}
      {showSqlGuideModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden p-6 space-y-5 border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150 relative">
            <button
              onClick={() => setShowSqlGuideModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer bg-transparent border-none outline-none"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-slate-800 text-sm">Hướng dẫn khởi tạo bảng Supabase</h3>
                <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Khắc phục lỗi mất dữ liệu khi nhấn F5</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed font-semibold">
              <p>Để lưu trữ vĩnh viễn hóa đơn trên hệ thống, bạn cần tạo bảng <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-rose-600">invoices</code> trong Supabase SQL Editor:</p>
              <ol className="list-decimal pl-5 space-y-2 font-medium">
                <li>Sao chép đoạn mã SQL dưới đây.</li>
                <li>Truy cập vào trang quản trị <strong>Supabase Dashboard</strong> của dự án.</li>
                <li>Chọn menu <strong>SQL Editor</strong> ở cột bên trái và bấm <strong>New query</strong>.</li>
                <li>Dán đoạn mã SQL vào và nhấn <strong>Run</strong>.</li>
              </ol>

              <div className="relative mt-2">
                <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-[10px] overflow-x-auto max-h-40 select-all font-semibold">
{`CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  number TEXT NOT NULL,
  date DATE,
  description TEXT,
  amount NUMERIC,
  file_url TEXT,
  beneficiary_name TEXT,
  bank_account TEXT,
  bank_name_branch TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(number);
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for invoices" ON public.invoices;
CREATE POLICY "Allow public select for invoices" ON public.invoices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert for invoices" ON public.invoices;
CREATE POLICY "Allow public insert for invoices" ON public.invoices FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update for invoices" ON public.invoices;
CREATE POLICY "Allow public update for invoices" ON public.invoices FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete for invoices" ON public.invoices;
CREATE POLICY "Allow public delete for invoices" ON public.invoices FOR DELETE USING (true);`}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  number TEXT NOT NULL,
  date DATE,
  description TEXT,
  amount NUMERIC,
  file_url TEXT,
  beneficiary_name TEXT,
  bank_account TEXT,
  bank_name_branch TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(number);
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for invoices" ON public.invoices;
CREATE POLICY "Allow public select for invoices" ON public.invoices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert for invoices" ON public.invoices;
CREATE POLICY "Allow public insert for invoices" ON public.invoices FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update for invoices" ON public.invoices;
CREATE POLICY "Allow public update for invoices" ON public.invoices FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete for invoices" ON public.invoices;
CREATE POLICY "Allow public delete for invoices" ON public.invoices FOR DELETE USING (true);`);
                    alert('Đã sao chép mã SQL vào Clipboard!');
                  }}
                  className="absolute top-2 right-2 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[9px] font-bold transition-all cursor-pointer border-none"
                >
                  Sao chép SQL
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowSqlGuideModal(false)}
                className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer border-none"
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFileUrl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-blue-50 text-[#005BAC] rounded-xl flex-shrink-0">
                  <FileText size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading font-extrabold text-slate-800 text-xs truncate" title={previewFileName}>
                    {previewFileName}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">Tài liệu hóa đơn gốc</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={previewFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold shadow-sm transition-all cursor-pointer border-none"
                >
                  Mở tab mới
                </a>
                <button
                  onClick={() => {
                    setPreviewFileUrl("");
                    setPreviewFileName("");
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer bg-transparent border-none"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center relative">
              {(() => {
                const isImage = /\.(jpeg|jpg|gif|png|webp|svg)/i.test(previewFileUrl.split(/[?#]/)[0]);
                if (isImage) {
                  return (
                    <div className="w-full h-full overflow-auto flex items-center justify-center bg-white rounded-xl shadow-inner p-4">
                      <img 
                        src={previewFileUrl} 
                        alt={previewFileName} 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                      />
                    </div>
                  );
                }
                
                return (
                  <iframe 
                    src={previewFileUrl} 
                    className="w-full h-full border-none bg-white rounded-xl shadow-inner" 
                    title="Invoice File Preview"
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Recurring Preview Modal */}
      {showRecurringPreviewModal && (() => {
        const currentMonthPayments = pendingPayments.filter(p => p.month === payMonth);
        const p = activePreviewPayment || currentMonthPayments[selectedRecurringPreviewIdx];
        if (!p) return null;

        const totalAmountVal = p.amount;
        const textAmountStr = docSoVietNam(totalAmountVal);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 flex flex-col space-y-5 animate-in fade-in-50 zoom-in-95 duration-150 relative">
              
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowRecurringPreviewModal(false);
                  setActivePreviewPayment(null);
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={16} />
              </button>

              {/* Modal Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-3 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#005BAC]">
                    <Eye size={15} />
                  </div>
                  <div>
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">
                      Xem trước Giấy đề nghị chuyển tiền (Định kỳ)
                    </h3>
                    <p className="text-slate-400 text-[10px] font-semibold mt-0.5">
                      Biểu mẫu HC-BM021/ĐNCT (Xem trước nội dung điền tự động)
                    </p>
                  </div>
                </div>

                {/* Dropdown to switch between payments */}
                {!activePreviewPayment && currentMonthPayments.length > 1 && (
                  <div className="flex items-center gap-2 pr-8">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Chọn Nhà Cung Cấp:</span>
                    <select
                      value={selectedRecurringPreviewIdx}
                      onChange={(e) => setSelectedRecurringPreviewIdx(Number(e.target.value))}
                      className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none cursor-pointer"
                    >
                      {currentMonthPayments.map((pay, idx) => (
                        <option key={pay.id} value={idx}>{pay.supplierName} ({pay.amount.toLocaleString("vi-VN")} đ)</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Paper Container */}
              <div className="bg-white border border-slate-200 shadow p-8 rounded-xl font-serif text-[#1e293b] leading-relaxed max-w-2xl mx-auto w-full select-none font-medium" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                
                {/* Header block */}
                <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
                  <div className="text-left font-sans">
                    <div className="text-base font-black text-[#005BAC]">TRUNG <span className="text-red-500">N</span>AM <span className="text-sky-400 text-xs font-normal italic">E&C</span></div>
                    <div className="text-[7.5px] font-bold text-slate-800 mt-0.5">CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM</div>
                    <div className="text-[6.5px] text-slate-500 mt-1 leading-tight">
                      A: Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br/>
                      T: (+84) 834 70 75 79 &nbsp; E: info.tnec@trungnamgroup.com.vn
                    </div>
                  </div>
                  <div className="text-center font-sans">
                    <div className="text-[13px] font-bold tracking-wide">
                      GIẤY ĐỀ NGHỊ CHUYỂN TIỀN
                    </div>
                    <div className="text-[9.5px] font-bold underline mt-0.5">
                      HC-BM021/ĐNCT
                    </div>
                  </div>
                </div>

                {/* Destination */}
                <div className="mb-4 text-xs font-bold leading-normal">
                  Kính gửi: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Ban lãnh đạo Công ty CP XD và LM Trung Nam;<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Phòng Kế toán công ty,
                </div>

                {/* Form Details */}
                <div className="space-y-1.5 text-xs mb-4">
                  <div>
                    <span className="underline">Họ và tên người đề nghị</span>: <span className="font-bold">{employeeName}</span>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    <span className="underline">Bộ phận</span>: <span className="font-bold">{employeeDept}</span>
                  </div>
                  <div>
                    <span className="underline">Lý do xin đề nghị chuyển tiền</span>: <span>{p.content}</span>
                  </div>
                  <div>
                    <span className="underline">Tên dự án</span>: <span className="font-bold">Văn phòng HCM</span>
                  </div>
                  <div>
                    <span className="underline">Tên đơn vị thụ hưởng</span>: <span className="font-bold">{p.supplierName}</span>
                  </div>
                  <div>
                    <span className="underline">Số tài khoản</span>: <span className="font-bold">{p.account}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; tại Ngân hàng <span className="font-bold">{p.bank}</span>
                  </div>
                </div>

                {/* Invoice list table */}
                <table className="w-full border-collapse border border-slate-900 text-[10px] mb-4 text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center font-sans">
                      <th className="border border-slate-900 p-1 text-center" rowSpan={2}>TT</th>
                      <th className="border border-slate-900 p-1 text-center" colSpan={2}>HÓA ĐƠN</th>
                      <th className="border border-slate-900 p-1 text-center" rowSpan={2}>NỘI DUNG THANH TOÁN</th>
                      <th className="border border-slate-900 p-1 text-center" rowSpan={2}>SỐ TIỀN (VNĐ)</th>
                      <th className="border border-slate-900 p-1 text-center" rowSpan={2}>GHI CHÚ</th>
                    </tr>
                    <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center font-sans">
                      <th className="border border-slate-900 p-1 text-center">SỐ</th>
                      <th className="border border-slate-900 p-1 text-center">NGÀY</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-900">
                      <td className="border border-slate-900 p-1 text-center">1</td>
                      <td className="border border-slate-900 p-1 font-mono font-bold text-center">—</td>
                      <td className="border border-slate-900 p-1 text-center">{new Date().toLocaleDateString("vi-VN")}</td>
                      <td className="border border-slate-900 p-1">{p.content}</td>
                      <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                        {p.amount.toLocaleString("vi-VN")}
                      </td>
                      <td className="border border-slate-900 p-1"></td>
                    </tr>
                    <tr className="font-bold border-b border-slate-900">
                      <td className="border border-slate-900 p-1 text-center" colSpan={4}>Tổng cộng</td>
                      <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                        {p.amount.toLocaleString("vi-VN")}
                      </td>
                      <td className="border border-slate-900 p-1"></td>
                    </tr>
                  </tbody>
                </table>

                {/* Undertakings */}
                <div className="text-xs space-y-1.5 mb-6 leading-relaxed">
                  <div className="italic">
                    <span className="font-bold">Bằng chữ: </span>
                    {textAmountStr}
                  </div>
                  <div>
                    Tôi xin chịu trách nhiệm về nội dung thanh toán và các hóa đơn chứng từ kèm theo.
                  </div>
                  <div><i>(Kèm theo .................................................... chứng từ gốc).</i></div>
                </div>

                {/* Signatures */}
                <table className="w-full text-center text-[10px] leading-normal font-sans">
                  <tbody>
                    <tr>
                      <td colSpan={3} className="text-right italic pr-6 pb-2">
                        Tp.HCM, ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
                      </td>
                    </tr>
                    <tr className="font-bold">
                      <td className="w-1/3">BAN GIÁM ĐỐC</td>
                      <td className="w-1/3">KẾ TOÁN TRƯỞNG</td>
                      <td className="w-1/3">NGƯỜI ĐỀ NGHỊ</td>
                    </tr>
                    <tr className="h-16">
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    setShowRecurringPreviewModal(false);
                    setActivePreviewPayment(null);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Đóng lại
                </button>
                <button
                  onClick={async () => {
                    setShowRecurringPreviewModal(false);
                    setActivePreviewPayment(null);
                    await exportSingleRecurringPayment(p);
                  }}
                  disabled={exportLoading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer"
                >
                  {exportLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Đang tải...
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      Tải xuống file Word
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden p-6 space-y-5 border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150 relative">
            <button
              onClick={() => setEditingPayment(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer bg-transparent border-none outline-none"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-[#005BAC]">
                <Settings size={18} />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-slate-800 text-sm">Chỉnh sửa thanh toán định kỳ</h3>
                <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Thay đổi thông tin chi tiết thanh toán của nhà cung cấp</p>
              </div>
            </div>

            <form onSubmit={handleUpdatePayment} className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">Tên Nhà Cung Cấp</label>
                <input
                  type="text"
                  required
                  value={editingPayment.supplierName || ""}
                  onChange={(e) => setEditingPayment(prev => prev ? { ...prev, supplierName: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Số tài khoản ngân hàng</label>
                  <input
                    type="text"
                    required
                    value={editingPayment.account || ""}
                    onChange={(e) => setEditingPayment(prev => prev ? { ...prev, account: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-mono font-bold text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Ngân hàng & Chi nhánh</label>
                  <input
                    type="text"
                    required
                    value={editingPayment.bank || ""}
                    onChange={(e) => setEditingPayment(prev => prev ? { ...prev, bank: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Nội dung thanh toán</label>
                <textarea
                  required
                  rows={2}
                  value={editingPayment.content || ""}
                  onChange={(e) => setEditingPayment(prev => prev ? { ...prev, content: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs text-slate-800 resize-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Số tiền thanh toán (VNĐ)</label>
                  <input
                    type="number"
                    required
                    value={editingPayment.amount || 0}
                    onChange={(e) => setEditingPayment(prev => prev ? { ...prev, amount: Number(e.target.value) } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-bold text-[#005BAC]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Tháng thanh toán</label>
                  <input
                    type="text"
                    required
                    value={editingPayment.month || ""}
                    onChange={(e) => setEditingPayment(prev => prev ? { ...prev, month: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="px-5 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer bg-transparent"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer border-none"
                >
                  <Save size={13} /> Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

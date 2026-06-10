/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Plus,
  Filter,
  Mail,
  Phone,
  Building,
  UserCheck,
  Calendar,
  Briefcase,
  Trash2,
  Loader2,
  X,
  Upload,
  Check,
  Settings
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  department: string;
  position: string;
  status: string;
  start: string;
  phone: string;
  email: string;
  avatar: string;
}

export default function EmployeeManagementPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  
  // New Employee Form State
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("Phòng Hành Chính Nhân Sự");
  const [newPos, setNewPos] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newStatus, setNewStatus] = useState("Thử việc");

  // File Upload & AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  interface ExtractedEmployee {
    name: string;
    department: string;
    position: string;
    phone: string;
    email: string;
    status: string;
    start: string;
  }
  const [previewEmployees, setPreviewEmployees] = useState<ExtractedEmployee[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag & Drop State
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");
  const [tempModel, setTempModel] = useState("gpt-4o-mini");

  // Batch Progress State
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);

  // Fetch employees from Supabase
  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped = data.map((emp: any) => ({
          id: emp.id,
          name: emp.name,
          department: emp.department || "Chưa xếp phòng",
          position: emp.role || emp.last_position || "Nhân viên",
          status: emp.status || "Chính thức",
          start: emp.created_at ? new Date(emp.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          phone: emp.phone || "N/A",
          email: emp.email || "N/A",
          avatar: emp.avatar || emp.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
        }));
        setEmployees(mapped);
      }
    } catch (err) {
      console.error("Error fetching employees:", err);
    } finally {
      setLoading(false);
    }
  };

  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);

  const fetchCurrentUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) return;

      const user = session.user;
      const email = user.email || "";

      // 1. Check allowed_users for Admin
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

      setCurrentUser({
        email,
        name: empData?.name || user.user_metadata?.full_name || user.user_metadata?.name || "Người dùng",
        role: empData?.role || (isAdmin ? "Admin" : "Nhân viên"),
        department: empData?.department || "Chưa xếp phòng",
        isAdmin
      });
    } catch (err) {
      console.error("Error fetching current user info:", err);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchEmployees();
  }, []);

  const processUploadedFiles = async (files: FileList | File[]) => {
    // Retrieve OpenAI key and model from localStorage
    const customKey = localStorage.getItem("openai_api_key") || "";
    const selectedModel = localStorage.getItem("openai_model_nhan_su") || "gpt-4o-mini";

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setTotalFiles(fileArray.length);
    setProcessedFiles(0);
    setIsAnalyzing(true);

    let combinedExtracted: ExtractedEmployee[] = [];
    let errorCount = 0;
    let successCount = 0;
    let completed = 0;

    try {
      const results = await Promise.all(
        fileArray.map(async (file) => {
          const formData = new FormData();
          formData.append("employee_file", file);
          formData.append("original_filename", file.name);

          try {
            const res = await fetch("/api/analyze-employee-file", {
              method: "POST",
              headers: {
                "Authorization": customKey ? `Bearer ${customKey}` : "",
                "x-openai-model": selectedModel
              },
              body: formData,
            });

            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || "Lỗi phân tích.");
            }

            const data = await res.json();
            if (data.employees && Array.isArray(data.employees)) {
              successCount++;
              return data.employees;
            } else {
              errorCount++;
              return [];
            }
          } catch (err) {
            console.error(`Error analyzing file ${file.name}:`, err);
            errorCount++;
            return [];
          } finally {
            completed++;
            setProcessedFiles(completed);
          }
        })
      );
      // Flatten all employee lists
      combinedExtracted = results.flat();
    } catch (err) {
      console.error("Batch processing error:", err);
    } finally {
      setIsAnalyzing(false);
    }

    if (combinedExtracted.length > 0) {
      setPreviewEmployees(combinedExtracted);
      setShowPreviewModal(true);
      if (errorCount > 0) {
        alert(`Đã trích xuất thành công từ ${successCount} file. Có ${errorCount} file gặp lỗi không thể trích xuất.`);
      }
    } else {
      alert("Không tìm thấy danh sách nhân sự hợp lệ trong các file đã chọn.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processUploadedFiles(files);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processUploadedFiles(files);
    }
  };

  // Settings handlers
  const openSettings = () => {
    setTempApiKey(localStorage.getItem("openai_api_key") || "");
    setTempModel(localStorage.getItem("openai_model_nhan_su") || "gpt-4o-mini");
    setShowSettingsModal(true);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("openai_api_key", tempApiKey.trim());
    localStorage.setItem("openai_model_nhan_su", tempModel);
    setShowSettingsModal(false);
    alert("Đã lưu cấu hình AI thành công!");
  };

  const handleSaveImportedEmployees = async () => {
    if (previewEmployees.length === 0) return;

    try {
      setLoading(true);
      // Format payload for employees table
      const insertPayload = previewEmployees.map(emp => {
        const avatarStr = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        const hasValidStart = emp.start && emp.start !== "" && !isNaN(Date.parse(emp.start));
        return {
          name: emp.name,
          department: emp.department,
          role: emp.position,
          phone: emp.phone || "N/A",
          email: emp.email || "N/A",
          status: emp.status || "Chính thức",
          avatar: avatarStr,
          created_at: hasValidStart ? new Date(emp.start).toISOString() : new Date().toISOString()
        };
      });

      const { error } = await supabase
        .from("employees")
        .insert(insertPayload);

      if (error) throw error;

      alert(`Đã lưu thành công ${previewEmployees.length} nhân sự vào hệ thống!`);
      setShowPreviewModal(false);
      setPreviewEmployees([]);
      fetchEmployees();
    } catch (err: any) {
      console.error("Error saving imported employees:", err);
      alert("Lỗi khi lưu danh sách nhân sự: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPos) return;

    try {
      const avatarStr = newName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
      const { error } = await supabase
        .from("employees")
        .insert([{
          name: newName,
          department: newDept,
          role: newPos,
          phone: newPhone || "N/A",
          email: newEmail || "N/A",
          status: newStatus,
          avatar: avatarStr
        }]);

      if (error) throw error;

      setShowAddModal(false);
      // Reset Form
      setNewName("");
      setNewPos("");
      setNewPhone("");
      setNewEmail("");
      setNewStatus("Thử việc");

      fetchEmployees();
    } catch (err) {
      console.error("Error adding employee:", err);
      alert("Lỗi khi thêm nhân sự!");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!currentUser) return;

    const isUserAdmin = currentUser.isAdmin || currentUser.role.toLowerCase() === "admin";
    const isUserManager = currentUser.role.toLowerCase().includes("trưởng phòng") || 
                          currentUser.role.toLowerCase().includes("truong phong");

    // Regular employee & deputy are not allowed to delete
    if (!isUserAdmin && !isUserManager) {
      alert("Bạn không có quyền thực hiện hành động xóa!");
      return;
    }

    // Find the target employee to check their role
    const targetEmp = employees.find(e => e.id === id);
    if (!targetEmp) return;

    const isTargetAdmin = targetEmp.position.toLowerCase() === "admin" ||
                          targetEmp.email.toLowerCase() === "tnechcm@gmail.com";

    // Trưởng phòng cannot delete Admin
    if (isUserManager && !isUserAdmin && isTargetAdmin) {
      alert("Trưởng phòng không thể xóa tài khoản của Admin!");
      return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa nhân viên ${name}?`)) {
      try {
        const { error } = await supabase
          .from("employees")
          .delete()
          .eq("id", id);
        
        if (error) throw error;
        fetchEmployees();
      } catch (err) {
        console.error("Error deleting employee:", err);
        alert("Lỗi khi xóa nhân viên!");
      }
    }
  };

  const filtered = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase()) || 
                        emp.id.toLowerCase().includes(search.toLowerCase()) ||
                        emp.email.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === "all" || emp.department === filterDept;
    
    if (!matchSearch || !matchDept) return false;

    if (!currentUser) return false;

    const isUserAdmin = currentUser.isAdmin || 
                        currentUser.role.toLowerCase() === "admin" ||
                        currentUser.role.toLowerCase().includes("trưởng phòng") || 
                        currentUser.role.toLowerCase().includes("truong phong");

    const isUserDeputy = currentUser.role.toLowerCase().includes("phó phòng") || 
                         currentUser.role.toLowerCase().includes("pho phong") ||
                         currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
                         currentUser.role.toLowerCase().includes("pho truong phong");

    if (isUserAdmin) return true;
    if (isUserDeputy) return emp.department === currentUser.department;

    return emp.email.toLowerCase() === currentUser.email.toLowerCase();
  });

  return (
    <div 
      className="flex min-h-screen bg-[#F7F9FC] relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Quản lý Nhân sự" subtitle="Quản lý thông tin hồ sơ nhân sự, phòng ban và chức vụ" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, mã NV, email..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                />
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-sm">
                <Filter size={13} className="text-slate-400" />
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="text-xs text-slate-600 bg-transparent outline-none font-semibold cursor-pointer"
                >
                  <option value="all">Tất cả phòng ban</option>
                  <option value="Phòng Hành Chính Nhân Sự">Hành chính nhân sự</option>
                  <option value="Phòng Kế Toán">P kế toán</option>
                  <option value="Phòng Vật Tư Thiết Bị">p Vật tư thiết bị</option>
                  <option value="Phòng Thị Trường">p thị trường</option>
                  <option value="Phòng Kế Hoạch Đấu Thầu">p kế hoạch đấu thầu</option>
                  <option value="Phòng Kỹ Thuật">p kỹ thuật</option>
                  <option value="Phòng An Toàn Lao Động">p an toàn lao động</option>
                  <option value="Phòng Quản Lý Dự Án">p quản lý dự án</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.docx,.doc,.pdf,.png,.jpg,.jpeg"
                multiple
                className="hidden"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
                title="Nhập danh sách nhân sự tự động bằng AI từ Excel, Word, PDF, Ảnh"
              >
                <Upload size={13} className="text-slate-500" />
                Danh sách nhân sự
              </button>
              <button
                onClick={openSettings}
                className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer inline-flex items-center justify-center"
                title="Cấu hình OpenAI API Key & Model AI"
              >
                <Settings size={14} />
              </button>
              {currentUser && (currentUser.isAdmin || 
                               currentUser.role.toLowerCase() === "admin" ||
                               currentUser.role.toLowerCase().includes("trưởng phòng") || 
                               currentUser.role.toLowerCase().includes("truong phong") ||
                               currentUser.role.toLowerCase().includes("phó phòng") || 
                               currentUser.role.toLowerCase().includes("pho phong") ||
                               currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
                               currentUser.role.toLowerCase().includes("pho truong phong")) && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Plus size={14} /> Thêm nhân sự
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-[350px] text-slate-400 gap-2">
              <Loader2 className="animate-spin text-blue-600" size={26} />
              <p className="text-xs font-medium">Đang tải danh sách nhân viên từ Supabase...</p>
            </div>
          ) : (
            /* Employee Table */
            <div className="glass rounded-2xl overflow-hidden border border-slate-200/50 shadow-premium">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200/60">
                      <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Nhân viên</th>
                      <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Mã NV</th>
                      <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Phòng ban / Chức vụ</th>
                      <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Liên hệ</th>
                      <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Ngày bắt đầu</th>
                      <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Trạng thái</th>
                      <th className="px-6 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((emp) => (
                      <tr key={emp.id} className="hover:bg-blue-50/20 bg-white/50 transition-all">
                        {/* Name & Avatar */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-sm shrink-0">
                              {emp.avatar}
                            </div>
                            <div>
                              <p className="font-heading font-bold text-slate-800 text-sm">{emp.name}</p>
                            </div>
                          </div>
                        </td>

                        {/* ID */}
                        <td className="px-6 py-4 font-mono text-[10px] text-slate-400 font-medium truncate max-w-[80px]" title={emp.id}>
                          {emp.id.slice(0, 8)}...
                        </td>

                        {/* Dept & Position */}
                        <td className="px-6 py-4 space-y-0.5">
                          <p className="text-slate-700 text-xs font-semibold flex items-center gap-1"><Building size={11} className="text-slate-400" /> {emp.department}</p>
                          <p className="text-slate-400 text-[10px] font-semibold flex items-center gap-1"><Briefcase size={11} className="text-slate-400" /> {emp.position}</p>
                        </td>

                        {/* Contact */}
                        <td className="px-6 py-4 space-y-0.5 text-xs text-slate-500">
                          <p className="flex items-center gap-1.5"><Phone size={11} /> {emp.phone}</p>
                          <p className="flex items-center gap-1.5"><Mail size={11} /> {emp.email}</p>
                        </td>

                        {/* Start Date */}
                        <td className="px-6 py-4 text-xs text-slate-500 font-medium flex items-center gap-1.5"><Calendar size={13} /> {emp.start}</td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <span className={`badge text-[10px] ${emp.status === "Chính thức" ? "badge-pass" : "badge-wait"}`}>
                            {emp.status === "Chính thức" ? "✓ Chính thức" : "⏳ Thử việc"}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {currentUser && (currentUser.isAdmin || 
                                             currentUser.role.toLowerCase() === "admin" ||
                                             currentUser.role.toLowerCase().includes("trưởng phòng") || 
                                             currentUser.role.toLowerCase().includes("truong phong")) && (
                              <button onClick={() => handleDelete(emp.id, emp.name)} className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-500 transition-colors" title="Xóa nhân sự">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-400 text-xs italic">Không tìm thấy nhân viên nào phù hợp</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass bg-white rounded-2xl w-full max-w-md overflow-hidden p-6 space-y-4 border border-white text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-heading font-extrabold text-slate-800 text-sm">Thêm mới nhân sự</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleAddEmployee} className="space-y-4 font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">Họ và tên nhân viên</label>
                <input
                  type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Phòng ban</label>
                  <select
                    value={newDept} onChange={(e) => setNewDept(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                  >
                    <option value="Phòng Hành Chính Nhân Sự">Hành chính nhân sự</option>
                    <option value="Phòng Kế Toán">P kế toán</option>
                    <option value="Phòng Vật Tư Thiết Bị">p Vật tư thiết bị</option>
                    <option value="Phòng Thị Trường">p thị trường</option>
                    <option value="Phòng Kế Hoạch Đấu Thầu">p kế hoạch đấu thầu</option>
                    <option value="Phòng Kỹ Thuật">p kỹ thuật</option>
                    <option value="Phòng An Toàn Lao Động">p an toàn lao động</option>
                    <option value="Phòng Quản Lý Dự Án">p quản lý dự án</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500">Trạng thái làm việc</label>
                  <select
                    value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                  >
                    <option value="Thử việc">Thử việc</option>
                    <option value="Chính thức">Chính thức</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Chức vụ / Vị trí</label>
                <input
                  type="text" required value={newPos} onChange={(e) => setNewPos(e.target.value)}
                  placeholder="Ví dụ: Kỹ sư cầu đường"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Số điện thoại</label>
                  <input
                    type="text" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Ví dụ: 0912 345 678"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500">Email làm việc</label>
                  <input
                    type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Ví dụ: nv.a@trungnamec.com.vn"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow"
                >
                  Thêm nhân viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-[#005BAC] rounded-xl">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-slate-800 text-sm">
                    Xem trước danh sách nhân sự trích xuất
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    AI đã tìm thấy {previewEmployees.length} nhân viên trong tài liệu. Kiểm tra thông tin trước khi đồng bộ.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer bg-transparent border-none"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body: Table list */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              <div className="border border-slate-200/60 bg-white rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-4 w-12 text-center">STT</th>
                      <th className="py-3 px-4">Họ và tên</th>
                      <th className="py-3 px-4">Phòng ban</th>
                      <th className="py-3 px-4">Chức vụ</th>
                      <th className="py-3 px-4">Liên hệ</th>
                      <th className="py-3 px-4">Ngày vào làm</th>
                      <th className="py-3 px-4">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                    {previewEmployees.map((emp, index) => (
                      <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 text-center text-slate-400 font-mono">{index + 1}</td>
                        <td className="py-3 px-4 text-slate-800 font-bold">{emp.name}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200/55">
                            {emp.department}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-medium">{emp.position}</td>
                        <td className="py-3 px-4 space-y-0.5 text-slate-400">
                          <p className="text-[10px]">{emp.phone}</p>
                          <p className="text-[10px]">{emp.email}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-[10px]">{emp.start || "N/A"}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${
                            emp.status === "Chính thức" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                          }`}>
                            {emp.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveImportedEmployees}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow-md"
              >
                <Check size={14} /> Lưu vào hệ thống
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4">
          <div className="relative flex items-center justify-center">
            {/* Spinning ring */}
            <div className="w-16 h-16 rounded-full border-4 border-blue-100/30 border-t-[#005BAC] animate-spin"></div>
            {/* Icon inside */}
            <UserCheck size={20} className="absolute text-[#005BAC] animate-pulse" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="font-heading font-extrabold text-white text-sm">AI đang xử lý tài liệu</h3>
            <p className="text-xs text-blue-100/70 font-medium">
              Vui lòng chờ, đang phân tích tài liệu ({processedFiles}/{totalFiles})...
            </p>
          </div>
        </div>
      )}
      {/* AI Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="glass bg-white rounded-2xl w-full max-w-md overflow-hidden p-6 space-y-4 border border-white text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-[#005BAC]" />
                <h3 className="font-heading font-extrabold text-slate-800 text-sm">Cấu hình AI trích xuất</h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSaveSettings} className="space-y-4 font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">OpenAI API Key (Dùng chung)</label>
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
                <p className="text-[10px] text-slate-400 font-medium mt-1">Cung cấp API Key để sử dụng các tính năng trích xuất danh sách tự động.</p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Mô hình AI (Model)</label>
                <select
                  value={tempModel}
                  onChange={(e) => setTempModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Nhanh & Tiết kiệm chi phí)</option>
                  <option value="gpt-4o">gpt-4o (Thông minh & Đọc file chính xác hơn)</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button" onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow"
                >
                  Lưu cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[999] flex flex-col items-center justify-center p-6 transition-all duration-300 pointer-events-none"
        >
          <div className="border-4 border-dashed border-[#005BAC] bg-white/95 rounded-3xl p-12 flex flex-col items-center justify-center gap-4 max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 bg-blue-50 text-[#005BAC] rounded-full animate-bounce">
              <Upload size={32} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-heading font-black text-slate-800 text-base">Thả file vào đây</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Hỗ trợ các file Excel, Word, PDF hoặc Hình ảnh chứa danh sách nhân viên để AI tự động phân tích
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

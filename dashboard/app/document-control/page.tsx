"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  FileDown,
  FileUp,
  FileCheck,
  Search,
  Plus,
  RefreshCw,
  Settings,
  Brain,
  Upload,
  X,
  Save,
  Trash2,
  Edit,
  FileText,
  AlertCircle,
  CheckCircle
} from "lucide-react";

interface ClericalDoc {
  id?: string;
  created_at?: string;
  type: "incoming" | "outgoing_1" | "outgoing_2" | "outgoing_hdqt";
  stt: number;
  receive_send_date: string;
  doc_number: string;
  doc_date: string;
  summary: string;
  sender_receiver: string;
  signer_recipient: string;
  has_scan: boolean;
  has_original: boolean;
  file_name: string;
  scan_file_url?: string;
  original_file_url?: string;
  ai_analysis?: any;
}

const TIMELINE_EVENTS = [
  { id: "e1", doc: "Tờ trình phê duyệt vật tư xây dựng Q2", step: "Hành chính trình nộp", time: "09:30 AM", date: "Jun 04", status: "completed" },
  { id: "e2", doc: "Tờ trình phê duyệt vật tư xây dựng Q2", step: "Trưởng phòng HCNS ký duyệt", time: "11:15 AM", date: "Jun 04", status: "completed" },
  { id: "e3", doc: "Tờ trình phê duyệt vật tư xây dựng Q2", step: "Ban Tổng Giám đốc xem xét", time: "Đang chờ", date: "Hôm nay", status: "pending" }
];

export default function DocumentControlPage() {
  const [activeTab, setActiveTab] = useState<string>("incoming"); // incoming, outgoing_1, outgoing_2, outgoing_hdqt, timeline, settings
  const [docs, setDocs] = useState<ClericalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ClericalDoc | null>(null);
  
  // Form Values
  const [docType, setDocType] = useState<"incoming" | "outgoing_1" | "outgoing_2" | "outgoing_hdqt">("incoming");
  const [stt, setStt] = useState<number | string>("");
  const [receiveSendDate, setReceiveSendDate] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState("");
  const [summary, setSummary] = useState("");
  const [senderReceiver, setSenderReceiver] = useState("");
  const [signerRecipient, setSignerRecipient] = useState("");
  const [hasScan, setHasScan] = useState(false);
  const [hasOriginal, setHasOriginal] = useState(false);
  const [fileName, setFileName] = useState("");
  const [scanFileUrl, setScanFileUrl] = useState("");
  const [originalFileUrl, setOriginalFileUrl] = useState("");

  // AI Analysis State
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // API Settings State
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Current logged in user state
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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
  }, []);

  const canManage = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isAdmin) return true;

    const roleLower = (currentUser.role || "").toLowerCase();
    const deptLower = (currentUser.department || "").toLowerCase();

    return (
      deptLower.includes("hành chính") ||
      deptLower.includes("nhân sự") ||
      deptLower.includes("văn thư") ||
      roleLower.includes("văn thư") ||
      roleLower.includes("trưởng phòng") ||
      roleLower.includes("phó phòng") ||
      roleLower.includes("giám đốc")
    );
  }, [currentUser]);

  // Load API Settings & Current User on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key_van_thu") || "");
      setModel(localStorage.getItem("openai_model_van_thu") || "gpt-4o-mini");
    }
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key_van_thu", apiKey.trim());
      localStorage.setItem("openai_model_van_thu", model);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    }
  };

  // Fetch Documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clerical_documents")
        .select("*")
        .order("stt", { ascending: false });
      if (error) throw error;
      setDocs(data || []);
    } catch (e) {
      console.error("Fetch docs error:", e);
      alert("Lỗi tải dữ liệu công văn: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Set default dates when opening modal for new document
  const openNewDocModal = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    setEditingDoc(null);
    setDocType(activeTab && ["incoming", "outgoing_1", "outgoing_2", "outgoing_hdqt"].includes(activeTab) ? (activeTab as any) : "incoming");
    setReceiveSendDate(todayStr);
    setDocNumber("");
    setDocDate(todayStr);
    setSummary("");
    setSenderReceiver("");
    setSignerRecipient("");
    setHasScan(false);
    setHasOriginal(false);
    setFileName("");
    setScanFileUrl("");
    setOriginalFileUrl("");
    setAiFile(null);
    
    // Auto-calculate STT
    const activeDocs = docs.filter((d) => d.type === (activeTab && ["incoming", "outgoing_1", "outgoing_2", "outgoing_hdqt"].includes(activeTab) ? activeTab : "incoming"));
    const maxStt = activeDocs.reduce((max, d) => (d.stt > max ? d.stt : max), 0);
    setStt(maxStt + 1);
    
    setShowModal(true);
  };

  // Open Edit Modal
  const openEditDocModal = (doc: ClericalDoc) => {
    setEditingDoc(doc);
    setDocType(doc.type);
    setStt(doc.stt);
    setReceiveSendDate(doc.receive_send_date || "");
    setDocNumber(doc.doc_number || "");
    setDocDate(doc.doc_date || "");
    setSummary(doc.summary || "");
    setSenderReceiver(doc.sender_receiver || "");
    setSignerRecipient(doc.signer_recipient || "");
    setHasScan(doc.has_scan || false);
    setHasOriginal(doc.has_original || false);
    setFileName(doc.file_name || "");
    setScanFileUrl(doc.scan_file_url || "");
    setOriginalFileUrl(doc.original_file_url || "");
    setAiFile(null);
    setShowModal(true);
  };

  // Delete Document
  const handleDeleteDoc = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xoá công văn này không? Dữ liệu sẽ bị xoá vĩnh viễn trên Supabase.")) return;
    try {
      const { error } = await supabase.from("clerical_documents").delete().eq("id", id);
      if (error) throw error;
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      alert("Lỗi khi xoá: " + (e as Error).message);
    }
  };

  // File Upload drag/drop handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAiFile(file);
      setFileName(file.name);
      setHasScan(true);
    }
  };

  // Trigger AI analysis
  const analyzeWithAI = async () => {
    if (!aiFile) {
      alert("Vui lòng tải lên hoặc kéo thả tệp văn bản (PDF, DOCX, Hình ảnh) trước.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const customKey = localStorage.getItem("openai_api_key_van_thu") || localStorage.getItem("openai_api_key");
      const customModel = localStorage.getItem("openai_model_van_thu") || "gpt-4o-mini";
      
      const headers: Record<string, string> = {};
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }
      headers["x-openai-model"] = customModel;

      const formData = new FormData();
      formData.append("document_file", aiFile);
      // Simplify to incoming/outgoing for AI prompt structure
      formData.append("doc_type", docType === "incoming" ? "incoming" : "outgoing");

      const res = await fetch("/api/analyze-document", {
        method: "POST",
        headers,
        body: formData
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Auto fill form fields
      if (data.doc_number) setDocNumber(data.doc_number);
      if (data.doc_date) setDocDate(data.doc_date);
      if (data.receive_send_date) setReceiveSendDate(data.receive_send_date);
      if (data.sender_receiver) setSenderReceiver(data.sender_receiver);
      if (data.summary) setSummary(data.summary);
      if (data.signer_recipient) setSignerRecipient(data.signer_recipient);
      
    } catch (e) {
      console.error(e);
      alert("Lỗi phân tích AI: " + (e as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save/Update handler
  const handleSaveDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveSendDate || !docNumber || !senderReceiver) {
      alert("Vui lòng nhập đầy đủ các trường thông tin bắt buộc: Ngày nhận/gửi, Số văn bản, Đơn vị gửi/nhận.");
      return;
    }

    const docPayload: Partial<ClericalDoc> = {
      type: docType,
      stt: Number(stt) || 1,
      receive_send_date: receiveSendDate,
      doc_number: docNumber,
      doc_date: docDate || null as any,
      summary: summary,
      sender_receiver: senderReceiver,
      signer_recipient: signerRecipient,
      has_scan: hasScan,
      has_original: hasOriginal,
      file_name: fileName,
      scan_file_url: scanFileUrl,
      original_file_url: originalFileUrl
    };

    try {
      if (editingDoc && editingDoc.id) {
        // Update
        const { error } = await supabase
          .from("clerical_documents")
          .update(docPayload)
          .eq("id", editingDoc.id);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from("clerical_documents")
          .insert([docPayload]);
        if (error) throw error;
      }
      setShowModal(false);
      fetchDocuments();
    } catch (e) {
      alert("Lỗi khi lưu dữ liệu: " + (e as Error).message);
    }
  };

  // Filters
  const filteredDocs = docs.filter((d) => {
    if (d.type !== activeTab) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (d.doc_number || "").toLowerCase().includes(q) ||
      (d.summary || "").toLowerCase().includes(q) ||
      (d.sender_receiver || "").toLowerCase().includes(q) ||
      (d.signer_recipient || "").toLowerCase().includes(q) ||
      (d.file_name || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Quản lý Văn thư (AI Assistant)" subtitle="Quản lý và số hóa công văn đi/đến, tự động phân tích trích xuất dữ liệu bằng AI" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Sub Navigator */}
          <div className="flex border-b border-slate-200">
            {[
              { id: "incoming", label: "Công văn đến", icon: FileDown },
              { id: "outgoing_1", label: "Công văn đi 1", icon: FileUp },
              { id: "outgoing_2", label: "Công văn đi 2", icon: FileUp },
              { id: "outgoing_hdqt", label: "Công văn HĐQT", icon: FileText },
              { id: "timeline", label: "Trình duyệt & Ký số", icon: FileCheck },
              { id: "settings", label: "Cấu hình API", icon: Settings },
            ].filter(tab => tab.id !== "settings" || canManage)
             .map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-all ${
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

          {/* Search bar & Action */}
          {activeTab !== "settings" && activeTab !== "timeline" && (
            <div className="flex justify-between items-center gap-4">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm số VB, đơn vị, trích yếu..."
                  className="w-full pl-9 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm font-medium"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchDocuments}
                  className="flex items-center justify-center p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-slate-500 bg-white"
                  title="Tải lại dữ liệu"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
                {canManage && (
                  <button
                    onClick={openNewDocModal}
                    className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md"
                  >
                    <Plus size={14} /> Lưu công văn mới
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Document Content Panels */}
          {["incoming", "outgoing_1", "outgoing_2", "outgoing_hdqt"].includes(activeTab) && (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold text-slate-800 text-sm">
                  {activeTab === "incoming" && "Nhật ký Công văn đến văn phòng"}
                  {activeTab === "outgoing_1" && "Nhật ký Công văn đi 1"}
                  {activeTab === "outgoing_2" && "Nhật ký Công văn đi 2"}
                  {activeTab === "outgoing_hdqt" && "Nhật ký Công văn đi 1 - HĐQT"}
                </h3>
                <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-3 py-1 rounded-lg">
                  Tổng số: {filteredDocs.length} bản ghi
                </span>
              </div>
              
              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="pb-3 pr-2">STT</th>
                      <th className="pb-3 whitespace-nowrap">Ngày/Tháng</th>
                      <th className="pb-3 whitespace-nowrap">Số văn bản</th>
                      <th className="pb-3 whitespace-nowrap">Ngày VB</th>
                      <th className="pb-3 min-w-[200px]">Tóm tắt nội dung chính</th>
                      <th className="pb-3 whitespace-nowrap">
                        {activeTab === "incoming" ? "Đơn vị gửi đến" : "Đơn vị nhận"}
                      </th>
                      <th className="pb-3 whitespace-nowrap">
                        {activeTab === "incoming" ? "Người nhận" : "Người ký"}
                      </th>
                      <th className="pb-3 text-center">Bản Scan</th>
                      <th className="pb-3 text-center">Bản gốc</th>
                      <th className="pb-3 whitespace-nowrap">Tên file CV</th>
                      {canManage && <th className="pb-3 text-right">Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                    {loading ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 10} className="py-20 text-center text-slate-400 italic">
                          <div className="flex flex-col items-center gap-2">
                            <RefreshCw size={24} className="animate-spin text-blue-600" />
                            <span>Đang tải dữ liệu từ Supabase...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredDocs.length === 0 ? (
                      <tr>
                        <td colSpan={canManage ? 11 : 10} className="py-20 text-center text-slate-400 font-normal">
                          {search ? "Không tìm thấy công văn phù hợp." : "Chưa có công văn nào được lưu trong mục này."}
                        </td>
                      </tr>
                    ) : (
                      filteredDocs.map((doc, idx) => (
                        <tr key={doc.id || idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 pr-2 font-mono text-slate-400">{doc.stt}</td>
                          <td className="py-4 whitespace-nowrap">{doc.receive_send_date ? new Date(doc.receive_send_date).toLocaleDateString("vi-VN") : "–"}</td>
                          <td className="py-4 font-mono font-bold text-slate-800 whitespace-nowrap">{doc.doc_number}</td>
                          <td className="py-4 whitespace-nowrap">{doc.doc_date ? new Date(doc.doc_date).toLocaleDateString("vi-VN") : "–"}</td>
                          <td className="py-4 max-w-[280px] truncate pr-4" title={doc.summary}>
                            {doc.summary || "–"}
                          </td>
                          <td className="py-4 max-w-[150px] truncate whitespace-nowrap" title={doc.sender_receiver}>
                            {doc.sender_receiver || "–"}
                          </td>
                          <td className="py-4 max-w-[120px] truncate whitespace-nowrap" title={doc.signer_recipient}>
                            {doc.signer_recipient || "–"}
                          </td>
                          <td className="py-4 text-center">
                            {doc.has_scan ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600">✓</span>
                            ) : (
                              <span className="text-slate-300 font-normal">–</span>
                            )}
                          </td>
                          <td className="py-4 text-center">
                            {doc.has_original ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600">✓</span>
                            ) : (
                              <span className="text-slate-300 font-normal">–</span>
                            )}
                          </td>
                          <td className="py-4 max-w-[160px] truncate text-slate-400 font-normal whitespace-nowrap" title={doc.file_name}>
                            {doc.scan_file_url ? (
                              <a href={doc.scan_file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                                {doc.file_name || "Xem đính kèm"}
                              </a>
                            ) : (
                              doc.file_name || "–"
                            )}
                          </td>
                          {canManage && (
                            <td className="py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => openEditDocModal(doc)}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-all"
                                  title="Sửa đổi"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={() => doc.id && handleDeleteDoc(doc.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded transition-all"
                                  title="Xoá"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Approval Timeline Tab */}
          {activeTab === "timeline" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Approval List */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="font-heading font-bold text-slate-800 text-sm">Yêu cầu trình duyệt đang xử lý</h3>
                {[
                  { name: "Tờ trình mua sắm laptop quý 2", booker: "Hành chính", date: "Hôm nay", status: "pending", desc: "Hành chính xin phê duyệt cấp ngân sách 120.000.000 VNĐ để mua sắm thiết bị làm việc." },
                  { name: "Hồ sơ thanh toán nghiệm thu gói thầu phụ", booker: "Phòng Dự Án", date: "2 ngày trước", status: "rejected", desc: "Thanh quyết toán đợt 3 cho nhà thầu thi công hạ tầng đường." }
                ].map((item, idx) => (
                  <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/40 hover-elevate space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-heading font-bold text-slate-800 text-xs">{item.name}</h4>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                        item.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                      }`}>
                        {item.status === "pending" ? "Đang chờ duyệt" : "Yêu cầu chỉnh sửa"}
                      </span>
                    </div>
                    <p className="text-slate-500 text-[11px] leading-relaxed font-medium">{item.desc}</p>
                    <div className="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                      <span>Người tạo: <strong>{item.booker}</strong></span>
                      <span>Ngày gửi: {item.date}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Timeline Flow */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-6">
                <h3 className="font-heading font-bold text-slate-800 text-sm">Lịch sử phê duyệt gần đây</h3>
                <div className="relative border-l border-slate-200 pl-4 ml-2 space-y-6">
                  {TIMELINE_EVENTS.map((event) => (
                    <div key={event.id} className="relative space-y-1">
                      {/* Event dot */}
                      <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        event.status === "completed" ? "bg-emerald-500" : "bg-amber-400"
                      }`} />
                      <div className="flex justify-between items-start">
                        <p className="font-heading font-bold text-slate-800 text-xs leading-none">{event.step}</p>
                        <span className="text-slate-400 text-[9px]">{event.time}</span>
                      </div>
                      <p className="text-slate-400 text-[10px] font-semibold">{event.doc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* API Configuration Tab */}
          {activeTab === "settings" && (
            <div className="max-w-2xl glass bg-white rounded-2xl p-8 border border-slate-200/50 shadow-premium space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-150 pb-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Settings size={20} />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-slate-800 text-sm">Cấu hình API Văn thư</h3>
                  <p className="text-slate-400 text-[11px] font-medium">Thiết lập kết nối OpenAI để tự động đọc tài liệu và phân tích công văn</p>
                </div>
              </div>

              <form onSubmit={saveSettings} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">OpenAI API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-proj-..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-semibold text-slate-700 bg-slate-50/30"
                  />
                  <p className="text-[10px] text-slate-400 font-medium">
                    Nhập khoá OpenAI API Key dành riêng cho nhân viên Văn thư để chủ động sử dụng. Để trống hệ thống sẽ dùng khoá chung của hệ thống.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Mô hình AI sử dụng</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer text-xs font-semibold text-slate-700 bg-white"
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini (Nhanh chóng & Rất tiết kiệm)</option>
                    <option value="gpt-4o">gpt-4o (Độ chính xác cao & Đọc ảnh scan tốt hơn)</option>
                  </select>
                </div>

                {settingsSaved && (
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-100 text-xs font-semibold">
                    <CheckCircle size={14} /> Cấu hình API đã được lưu thành công vào trình duyệt!
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    className="flex items-center gap-2 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-md"
                  >
                    <Save size={14} /> Lưu cấu hình
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Save/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-150 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-[#005BAC] flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-slate-800 text-sm">
                    {editingDoc ? `Chỉnh sửa công văn #${stt}` : "Thêm mới công văn"}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Phân hệ văn thư</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
              
              {/* Left side: AI File Upload & Processing */}
              <div className="lg:col-span-2 space-y-4 border-r border-slate-100 pr-6">
                <div className="flex items-center gap-2 text-[#005BAC] font-bold text-xs uppercase tracking-wider">
                  <Brain size={14} />
                  <span>Trợ lý AI Phân tích</span>
                </div>
                
                {/* Drag Drop Area */}
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-5 hover:border-blue-400 transition-all bg-slate-50/50 text-center flex flex-col items-center justify-center gap-3 min-h-[160px] relative">
                  <Upload className="text-slate-400 animate-bounce" size={24} />
                  <div>
                    <label className="text-[#005BAC] hover:underline cursor-pointer font-bold text-xs">
                      Tải file lên để phân tích
                      <input type="file" onChange={handleFileChange} className="hidden" accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.txt" />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">Hỗ trợ PDF, DOCX, Hình ảnh công văn</p>
                  </div>
                  {aiFile && (
                    <div className="absolute inset-0 bg-white/95 rounded-2xl p-4 flex flex-col justify-center items-center gap-2">
                      <FileText className="text-emerald-500" size={24} />
                      <span className="text-[11px] font-bold text-slate-700 truncate w-full px-4">{aiFile.name}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setAiFile(null); setFileName(""); }}
                          className="px-2.5 py-1 border border-slate-200 rounded-lg text-[10px] text-slate-500 hover:bg-slate-50 font-bold"
                        >
                          Huỷ bỏ
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Actions */}
                <button
                  type="button"
                  onClick={analyzeWithAI}
                  disabled={isAnalyzing || !aiFile}
                  className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow ${
                    isAnalyzing 
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                      : !aiFile 
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/50 shadow-none" 
                        : "bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 cursor-pointer"
                  }`}
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin text-blue-500" />
                      <span>Đang trích xuất dữ liệu bằng AI...</span>
                    </>
                  ) : (
                    <>
                      <Brain size={14} />
                      <span>Trích xuất thông tin tự động bằng AI</span>
                    </>
                  )}
                </button>

                <div className="text-[10px] text-slate-400 bg-blue-50/40 p-3.5 rounded-xl border border-blue-100/50 leading-relaxed font-medium space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-600 font-bold">
                    <AlertCircle size={12} />
                    <span>Lưu ý:</span>
                  </div>
                  <p>AI sẽ tự động đọc file và điền thông tin vào form bên phải (Số VB, trích yếu, ngày tháng, bên gửi/nhận). Bạn nên rà soát lại thông tin trước khi nhấn lưu.</p>
                </div>
              </div>

              {/* Right side: Detailed Form */}
              <form onSubmit={handleSaveDoc} className="lg:col-span-3 space-y-4">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-wider mb-2">
                  <span>Thông tin công văn</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category select */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Phân loại</label>
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white"
                    >
                      <option value="incoming">Công văn đến</option>
                      <option value="outgoing_1">Công văn đi 1</option>
                      <option value="outgoing_2">Công văn đi 2</option>
                      <option value="outgoing_hdqt">Công văn HĐQT</option>
                    </select>
                  </div>

                  {/* STT */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Số thứ tự (STT)</label>
                    <input
                      type="number"
                      value={stt}
                      onChange={(e) => setStt(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Receive Send Date */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Ngày/Tháng (Gửi/Nhận)</label>
                    <input
                      type="date"
                      value={receiveSendDate}
                      onChange={(e) => setReceiveSendDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                      required
                    />
                  </div>

                  {/* Doc Date */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Ngày văn bản (Ký ban hành)</label>
                    <input
                      type="date"
                      value={docDate}
                      onChange={(e) => setDocDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Doc Number */}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Số văn bản <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value)}
                      placeholder="Ví dụ: 1577/BQLDAGT-DA5"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 placeholder-slate-300"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Sender / Receiver */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      {docType === "incoming" ? "Đơn vị gửi đến" : "Đơn vị nhận"} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={senderReceiver}
                      onChange={(e) => setSenderReceiver(e.target.value)}
                      placeholder={docType === "incoming" ? "Ví dụ: Sở Xây dựng TP.HCM" : "Ví dụ: UBND Quận 2"}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                      required
                    />
                  </div>

                  {/* Signer / Recipient */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">
                      {docType === "incoming" ? "Người nhận / Đơn vị tiếp nhận" : "Người ký duyệt"}
                    </label>
                    <input
                      type="text"
                      value={signerRecipient}
                      onChange={(e) => setSignerRecipient(e.target.value)}
                      placeholder={docType === "incoming" ? "Ví dụ: Ban Chỉ đạo dự án" : "Ví dụ: Giám đốc Dự án"}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                    />
                  </div>
                </div>

                {/* Summary (Trích yếu) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Tóm nội dung chính (Trích yếu)</label>
                  <textarea
                    rows={3}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Tóm tắt ngắn gọn nội dung công văn..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* File scan status checkbox */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="hasScanCheckbox"
                      checked={hasScan}
                      onChange={(e) => setHasScan(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="hasScanCheckbox" className="text-[11px] font-bold text-slate-600 uppercase cursor-pointer">Bản Scan (Có)</label>
                  </div>

                  {/* File original status checkbox */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="hasOriginalCheckbox"
                      checked={hasOriginal}
                      onChange={(e) => setHasOriginal(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="hasOriginalCheckbox" className="text-[11px] font-bold text-slate-600 uppercase cursor-pointer">Bản gốc (Có)</label>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {/* File Name */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tên file CV</label>
                    <input
                      type="text"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="Ví dụ: cv_den_1577.pdf"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                    />
                  </div>

                  {/* Scan File URL */}
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Link liên kết bản quét (Google Drive...)</label>
                    <input
                      type="text"
                      value={scanFileUrl}
                      onChange={(e) => setScanFileUrl(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 placeholder-slate-300"
                    />
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    Đóng lại
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-md"
                  >
                    <Save size={14} /> {editingDoc ? "Cập nhật thay đổi" : "Lưu vào Supabase"}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

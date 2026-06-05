"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Plus,
  ArrowUpDown,
  Mail,
  Phone,
  Calendar,
  Layers,
  MoreHorizontal,
  Upload,
  FileText,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
  RotateCcw,
  AlertCircle,
  Settings,
  Key,
  Info,
  Database,
  X
} from "lucide-react";

// ─── TYPES FOR CV SCORER ──────────────────────────────────────────────────────
type ScoringResult = {
  file_name: string;
  score: number;
  recommendation: "Interview" | "Hold" | "Reject" | "Error";
  trang_thai: string;
  matching_skills: string[];
  missing_skills: string[];
  summary: string;
  extracted_info: Record<string, string>;
  submitted?: boolean;
  saved_db?: boolean;
  error?: string;
};

type FileItem = { file: File; id: string };

const NGUON_OPTIONS = ["TopCV", "LinkedIn", "Email", "Referral", "Nội bộ", "Khác"];

// ─── SCORE COLOR HELPERS ─────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 75) return { text: "text-emerald-600", bg: "bg-emerald-500", bar: "bg-emerald-400" };
  if (score >= 50) return { text: "text-amber-500", bg: "bg-amber-400", bar: "bg-amber-400" };
  return { text: "text-rose-500", bg: "bg-rose-500", bar: "bg-rose-400" };
}

const COLUMNS = [
  { id: "new", title: "CV Mới", color: "border-t-slate-400" },
  { id: "screening", title: "Sàng lọc", color: "border-t-cyan-500" },
  { id: "interview", title: "Phỏng vấn", color: "border-t-blue-500" },
  { id: "offer", title: "Đề nghị", color: "border-t-purple-500" },
  { id: "hired", title: "Đã tuyển", color: "border-t-emerald-500" },
  { id: "rejected", title: "Từ chối", color: "border-t-rose-500" }
];

// ─── RESULT CARD SUBCOMPONENT ────────────────────────────────────────────────
function ResultCard({
  result,
  onSubmit,
  onSaveDb,
}: {
  result: ScoringResult;
  onSubmit: (r: ScoringResult) => Promise<void>;
  onSaveDb: (r: ScoringResult) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const c = scoreColor(result.score);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit(result);
    setSubmitting(false);
  };

  const handleSaveDb = async () => {
    setSaving(true);
    await onSaveDb(result);
    setSaving(false);
  };

  if (result.error) {
    return (
      <div className="glass rounded-2xl p-5 border border-rose-200">
        <div className="flex items-center gap-3">
          <AlertCircle className="text-rose-500 shrink-0" size={20} />
          <div>
            <p className="font-semibold text-rose-600 text-sm">{result.file_name}</p>
            <p className="text-rose-400 text-xs mt-0.5">{result.error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden border border-slate-200/40 hover:shadow-lg transition-all">
      {/* Header row */}
      <div className="p-5 flex items-center gap-4">
        {/* Score circle */}
        <div className={`w-16 h-16 rounded-2xl ${c.bg} flex flex-col items-center justify-center shrink-0 shadow`}>
          <span className="text-white font-bold text-xl leading-none">{result.score}</span>
          <span className="text-white/70 text-xs">/100</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-heading font-semibold text-[#005BAC] truncate">
            {result.extracted_info?.ten_ung_vien || result.file_name}
          </p>
          <p className="text-slate-500 text-xs mt-0.5 truncate">
            {result.extracted_info?.vi_tri || "N/A"} · {result.extracted_info?.kinh_nghiem || "N/A"} · {result.extracted_info?.khu_vuc || "N/A"}
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${result.score}%` }} />
          </div>
        </div>

        {/* Status + buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {result.trang_thai === "PASS CV" ? (
            <span className="badge-pass px-3 py-1 rounded-full text-xs font-semibold">✓ PASS CV</span>
          ) : (
            <span className="badge-fail px-3 py-1 rounded-full text-xs font-semibold">✗ FAIL</span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {/* Supabase Save Button */}
          {!result.saved_db ? (
            <button
              onClick={handleSaveDb}
              disabled={saving}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
              Lưu Database
            </button>
          ) : (
            <span className="flex items-center gap-1 text-blue-600 text-xs font-medium px-2">
              <CheckCircle size={13} /> Đã lưu DB
            </span>
          )}

          {/* Sheets Save Button */}
          {!result.submitted ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Ghi Sheets
            </button>
          ) : (
            <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
              <CheckCircle size={13} /> Đã ghi Sheets
            </span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200/40 px-5 pb-5 pt-4 grid grid-cols-2 gap-6 text-sm">
          {/* Left: skills */}
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-emerald-600 mb-1.5">✅ Kỹ năng tương thích</p>
              <ul className="space-y-1">
                {result.matching_skills.length ? result.matching_skills.map((s, i) => (
                  <li key={i} className="text-slate-600 text-xs flex items-start gap-1.5"><span className="text-emerald-400 mt-0.5">•</span>{s}</li>
                )) : <li className="text-slate-400 text-xs italic">Không có</li>}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-rose-500 mb-1.5">❌ Kỹ năng còn thiếu</p>
              <ul className="space-y-1">
                {result.missing_skills.length ? result.missing_skills.map((s, i) => (
                  <li key={i} className="text-slate-600 text-xs flex items-start gap-1.5"><span className="text-rose-300 mt-0.5">•</span>{s}</li>
                )) : <li className="text-slate-400 text-xs italic">Không có</li>}
              </ul>
            </div>
          </div>

          {/* Right: info + summary */}
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-slate-600 mb-1.5">📋 Thông tin trích xuất</p>
              <div className="space-y-1 text-xs text-slate-500">
                {[
                  ["Email", result.extracted_info?.email],
                  ["SĐT", result.extracted_info?.sdt],
                  ["Bằng cấp", result.extracted_info?.bang_cap],
                  ["Chuyên ngành", result.extracted_info?.chuyen_nganh],
                  ["Phòng ban", result.extracted_info?.phong_ban],
                  ["Người đánh giá", result.extracted_info?.nguoi_danh_gia],
                ].map(([label, val]) => (
                  <div key={label} className="flex gap-2">
                    <span className="text-slate-400 w-24 shrink-0">{label}:</span>
                    <span className="text-slate-600">{val || "N/A"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-semibold text-slate-600 mb-1">📝 Nhận xét AI</p>
              <p className="text-slate-500 text-xs leading-relaxed">{result.summary}</p>
              <p className="mt-1.5 text-xs font-medium">
                Khuyến nghị:{" "}
                <span className={result.recommendation === "Interview" ? "text-emerald-600" : result.recommendation === "Hold" ? "text-amber-500" : "text-rose-500"}>
                  {result.recommendation}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HELPERS FOR TABLE VIEW ──────────────────────────────────────────────────
function EditableCell({
  value,
  onSave,
  type = "text"
}: {
  value: string;
  onSave: (val: string) => void;
  type?: string;
}) {
  const [val, setVal] = useState(value);

  useEffect(() => {
    setVal(value);
  }, [value]);

  const handleBlur = () => {
    if (val !== value) {
      onSave(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type={type}
      value={val || ""}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full bg-transparent px-2 py-1 outline-none border border-transparent hover:bg-slate-100/50 focus:border-blue-500 focus:bg-white rounded transition-all text-xs font-normal text-slate-700"
    />
  );
}

const getColumnsForTab = (tab: string) => {
  if (tab === "tong_hop") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "created_at", label: "Ngày tạo", width: "110px", readOnly: true },
      { key: "name", label: "Tên ứng viên", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SĐT", width: "110px" },
      { key: "education", label: "Bằng cấp", width: "100px" },
      { key: "major", label: "Chuyên ngành", width: "150px" },
      { key: "experience", label: "Kinh nghiệm", width: "120px" },
      { key: "last_position", label: "Chức danh gần nhất", width: "160px" },
      { key: "last_company", label: "Công ty gần nhất", width: "160px" },
      { key: "region", label: "Khu vực", width: "100px" },
      { key: "department", label: "Phòng Ban", width: "130px" },
      { key: "role", label: "Vị trí", width: "140px" },
      { key: "status", label: "Trạng thái", width: "120px", type: "status" },
      { key: "source", label: "Nguồn", width: "110px" },
      { key: "reviewer", label: "Người đánh giá", width: "130px" }
    ];
  }
  if (tab === "vong_1") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "v1_date", label: "Ngày Vòng 1", width: "110px" },
      { key: "name", label: "Tên ứng viên", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SĐT", width: "110px" },
      { key: "education", label: "Bằng cấp", width: "100px" },
      { key: "major", label: "Chuyên ngành", width: "150px" },
      { key: "region", label: "Khu vực", width: "100px" },
      { key: "department", label: "Phòng Ban", width: "130px" },
      { key: "role", label: "Vị trí", width: "140px" },
      { key: "status", label: "Trạng thái", width: "120px", type: "status" },
      { key: "source", label: "Nguồn", width: "110px" },
      { key: "v1_interviewer", label: "Người PV V1", width: "130px" },
      { key: "v1_result", label: "Kết quả V1", width: "120px", type: "v1_result" }
    ];
  }
  if (tab === "vong_2") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "v2_date", label: "Ngày Vòng 2", width: "110px" },
      { key: "name", label: "Tên ứng viên", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SĐT", width: "110px" },
      { key: "education", label: "Bằng cấp", width: "100px" },
      { key: "major", label: "Chuyên ngành", width: "150px" },
      { key: "region", label: "Khu vực", width: "100px" },
      { key: "department", label: "Phòng Ban", width: "130px" },
      { key: "role", label: "Vị trí", width: "140px" },
      { key: "status", label: "Trạng thái", width: "120px", type: "status" },
      { key: "source", label: "Nguồn", width: "110px" },
      { key: "v2_interviewer", label: "Người PV V2", width: "130px" },
      { key: "v2_result", label: "Kết quả V2", width: "120px", type: "v2_result" }
    ];
  }
  // Thử việc
  return [
    { key: "stt", label: "STT", width: "60px" },
    { key: "created_at", label: "Ngày tạo", width: "110px", readOnly: true },
    { key: "name", label: "Tên ứng viên", width: "180px" },
    { key: "email", label: "Email", width: "180px" },
    { key: "phone", label: "SĐT", width: "110px" },
    { key: "education", label: "Bằng cấp", width: "100px" },
    { key: "major", label: "Chuyên ngành", width: "150px" },
    { key: "experience", label: "Kinh nghiệm", width: "120px" },
    { key: "last_position", label: "Chức danh gần nhất", width: "160px" },
    { key: "last_company", label: "Công ty gần nhất", width: "160px" },
    { key: "region", label: "Khu vực", width: "100px" },
    { key: "department", label: "Phòng Ban", width: "130px" },
    { key: "role", label: "Vị trí", width: "140px" },
    { key: "v2_result", label: "Kết quả V2", width: "110px", readOnly: true },
    { key: "probation_result", label: "Kết quả nhận việc", width: "130px", type: "probation_result" },
    { key: "ai_recommendation", label: "HĐ Chính thức", width: "120px", type: "probation_contract" }, // Store in ai_recommendation
    { key: "onboard_date", label: "ONBOARD", width: "110px" },
    { key: "probation_end_date", label: "Hết hạn TV", width: "110px" },
    { key: "probation_salary", label: "Mức lương TV", width: "120px" },
    { key: "official_salary", label: "MỨC lương CT", width: "120px" }
  ];
};

// ─── MAIN RECRUITMENT PAGE ────────────────────────────────────────────────────
export default function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "table_view" | "scorer" | "settings">("pipeline");
  const [tableSubTab, setTableSubTab] = useState<"tong_hop" | "vong_1" | "vong_2" | "thu_viec">("tong_hop");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [groupByDept, setGroupByDept] = useState<boolean>(false);
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});

  // Update candidate field directly
  const handleUpdateCandidateField = async (id: string, field: string, val: any) => {
    try {
      // Optimistic update
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c));

      const { error } = await supabase
        .from("candidates")
        .update({ [field]: val })
        .eq("id", id);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating candidate field:", err);
      fetchCandidates();
    }
  };

  // Update multiple candidate fields
  const handleUpdateCandidateFields = async (id: string, updates: Record<string, any>) => {
    try {
      // Optimistic update
      setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));

      const { error } = await supabase
        .from("candidates")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating candidate fields:", err);
      fetchCandidates();
    }
  };

  // Handle dropdown value changes for spreadsheet view
  const handleDropdownChange = async (candidateId: string, type: string, value: string) => {
    if (type === "status") {
      const newStatus = value === "FAIL" ? "rejected" : "new";
      await handleUpdateCandidateField(candidateId, "status", newStatus);
    } else if (type === "v1_result") {
      const updates: any = { v1_result: value };
      if (value === "ĐẠT") {
        updates.status = "interview";
      } else if (value === "LOẠI" || value === "TC PV") {
        updates.status = "rejected";
      }
      await handleUpdateCandidateFields(candidateId, updates);
    } else if (type === "v2_result") {
      const updates: any = { v2_result: value };
      if (value === "ĐẠT") {
        updates.status = "offer";
      } else if (value === "LOẠI" || value === "TC PV") {
        updates.status = "rejected";
      }
      await handleUpdateCandidateFields(candidateId, updates);
    } else if (type === "probation_result") {
      const updates: any = { probation_result: value };
      if (value === "ĐẠT") {
        updates.status = "hired";
      } else if (value === "TC") {
        updates.status = "rejected";
      }
      await handleUpdateCandidateFields(candidateId, updates);
    }
  };

  // Filter and sort candidates for the spreadsheet view
  const getFilteredTableCandidates = (subTab: string) => {
    const sorted = [...candidates]
      .filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (c.name || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.role || "").toLowerCase().includes(q) ||
          (c.department || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.stt || 999999) - (b.stt || 999999));

    if (subTab === "tong_hop") return sorted;
    if (subTab === "vong_1") {
      return sorted.filter(c => c.v1_result || ["screening", "interview", "offer", "hired"].includes(c.status));
    }
    if (subTab === "vong_2") {
      return sorted.filter(c => c.v2_result || ["interview", "offer", "hired"].includes(c.status));
    }
    if (subTab === "thu_viec") {
      return sorted.filter(c => c.onboard_date || c.status === "hired");
    }
    return sorted;
  };

  // Scorer Tab states
  const [jdText, setJdText] = useState("");
  const [nguon, setNguon] = useState("TopCV");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [results, setResults] = useState<ScoringResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API & Webhook Configuration states
  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [saved, setSaved] = useState(false);

  // Drag State
  const [draggedCandidateId, setDraggedCandidateId] = useState<string | null>(null);

  // Modal Add Candidate State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPosition, setAddPosition] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addSource, setAddSource] = useState("TopCV");

  // Fetch candidates from Supabase
  const fetchCandidates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      if (data) {
        setCandidates(data);
      }
    } catch (err) {
      console.error("Error fetching candidates:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key") || "");
      setWebhookUrl(localStorage.getItem("apps_script_url") || "");
      setModel(localStorage.getItem("openai_model") || "gpt-4o-mini");
    }
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key", apiKey.trim());
      localStorage.setItem("apps_script_url", webhookUrl.trim());
      localStorage.setItem("openai_model", model);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const ACCEPTED = ".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg";

  // Get all unique departments for filtering
  const departments = Array.from(
    new Set(candidates.map(c => c.department || "Chưa xác định").filter(Boolean))
  ).sort();

  // Search filter for pipeline
  const filteredPipeline = candidates.filter(c => {
    const matchesSearch = (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.role || c.last_position || "").toLowerCase().includes(search.toLowerCase());
    const matchesDept = selectedDept === "all" || (c.department || "Chưa xác định") === selectedDept;
    return matchesSearch && matchesDept;
  });

  // Scorer dropzone handlers
  const addFiles = useCallback((newFiles: File[]) => {
    const items: FileItem[] = newFiles.map((f) => ({ file: f, id: `${f.name}-${Date.now()}-${Math.random()}` }));
    setFiles((prev) => {
      const existing = new Set(prev.map((x) => x.file.name));
      return [...prev, ...items.filter((x) => !existing.has(x.file.name))];
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  }, [addFiles]);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  // Start CV AI Scoring
  const startScoring = async () => {
    if (!jdText.trim()) { alert("Vui lòng nhập mô tả công việc (JD)."); return; }
    if (files.length === 0) { alert("Vui lòng chọn ít nhất 1 file CV."); return; }

    setProcessing(true);
    setResults([]);
    setProgress({ done: 0, total: files.length });

    const newResults: ScoringResult[] = [];

    for (const item of files) {
      const formData = new FormData();
      formData.append("cv_file", item.file);
      formData.append("jd_text", jdText);
      formData.append("nguon", nguon);

      try {
        const customKey = localStorage.getItem("openai_api_key");
        const headers: Record<string, string> = {};
        if (customKey) {
          headers["Authorization"] = `Bearer ${customKey}`;
        }

        const res = await fetch("/api/score-cv", { 
          method: "POST", 
          body: formData,
          headers
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const r: ScoringResult = {
          file_name: item.file.name,
          score: data.score ?? 0,
          recommendation: data.recommendation ?? "Reject",
          trang_thai: data.extracted_info?.trang_thai ?? "FAIL",
          matching_skills: data.matching_skills ?? [],
          missing_skills: data.missing_skills ?? [],
          summary: data.summary ?? "",
          extracted_info: data.extracted_info ?? {},
          submitted: false,
          saved_db: false
        };
        newResults.push(r);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        newResults.push({
          file_name: item.file.name, score: 0, recommendation: "Error",
          trang_thai: "FAIL", matching_skills: [], missing_skills: [],
          summary: "", extracted_info: {}, submitted: false, saved_db: false, error: msg,
        });
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    // Sort by score desc
    newResults.sort((a, b) => b.score - a.score);
    setResults(newResults);
    setProcessing(false);
  };

  // Submit CV score to Google Sheets (legacy workflow supported)
  const submitToSheets = async (result: ScoringResult) => {
    try {
      const customUrl = localStorage.getItem("apps_script_url");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customUrl) {
        headers["x-apps-script-url"] = customUrl;
      }

      const res = await fetch("/api/submit-to-sheets", {
        method: "POST",
        headers,
        body: JSON.stringify({ extracted_info: result.extracted_info }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults((prev) =>
        prev.map((r) => r.file_name === result.file_name ? { ...r, submitted: true } : r)
      );
    } catch (e) {
      alert("Lỗi ghi Sheets: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Save CV score to Supabase Database (new primary workflow)
  const saveToSupabase = async (result: ScoringResult) => {
    try {
      const info = result.extracted_info || {};
      const { error } = await supabase
        .from("candidates")
        .insert([{
          name: info.ten_ung_vien || result.file_name.split(".")[0],
          email: info.email || null,
          phone: info.sdt || null,
          education: info.bang_cap || null,
          major: info.chuyen_nganh || null,
          experience: info.kinh_nghiem || null,
          last_position: info.chuc_danh_gan_nhat || null,
          last_company: info.cong_ty_gan_nhat || null,
          region: info.khu_vuc || null,
          department: info.phong_ban || null,
          role: info.vi_tri || null,
          status: "new", // Starts in "new" column
          source: nguon,
          reviewer: info.nguoi_danh_gia || "AI Auto",
          ai_score: result.score,
          ai_recommendation: result.recommendation,
          ai_analysis: result.summary
        }]);

      if (error) throw error;

      setResults((prev) =>
        prev.map((r) => r.file_name === result.file_name ? { ...r, saved_db: true } : r)
      );
      
      // Refresh pipeline list
      fetchCandidates();
    } catch (err) {
      console.error("Error saving to database:", err);
      alert("Lỗi khi lưu vào database: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Save all un-saved candidates to DB
  const saveAllToDb = async () => {
    const unsaved = results.filter((r) => !r.saved_db && !r.error);
    for (const r of unsaved) await saveToSupabase(r);
  };

  const submitAll = async () => {
    const unsubmitted = results.filter((r) => !r.submitted && !r.error);
    for (const r of unsubmitted) await submitToSheets(r);
  };

  const reset = () => { setFiles([]); setResults([]); setProgress({ done: 0, total: 0 }); };

  const passCount = results.filter((r) => r.trang_thai === "PASS CV").length;

  // Handle Pipeline Drag Start
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCandidateId(id);
    e.dataTransfer.setData("text/plain", id);
  };

  // Handle Pipeline Drop
  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const candidateId = draggedCandidateId || e.dataTransfer.getData("text/plain");
    if (!candidateId) return;

    // Optimistic UI update
    const updatedCandidates = candidates.map(c => c.id === candidateId ? { ...c, status: columnId } : c);
    setCandidates(updatedCandidates);

    // Update in Supabase
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ status: columnId })
        .eq("id", candidateId);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating candidate pipeline status:", err);
      fetchCandidates(); // Rollback
    } finally {
      setDraggedCandidateId(null);
    }
  };

  // Create Manual Candidate
  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;

    try {
      const { error } = await supabase
        .from("candidates")
        .insert([{
          name: addName,
          role: addPosition,
          email: addEmail || null,
          phone: addPhone || null,
          source: addSource,
          status: "new",
          ai_score: 0,
          reviewer: "Tự tạo"
        }]);

      if (error) throw error;

      setAddName("");
      setAddPosition("");
      setAddEmail("");
      setAddPhone("");
      setIsAddOpen(false);
      
      fetchCandidates();
    } catch (err) {
      console.error("Error creating candidate:", err);
      alert("Lỗi khi thêm ứng viên!");
    }
  };

  // Delete Candidate
  const handleDeleteCandidate = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa hồ sơ ứng viên này?")) return;
    try {
      const { error } = await supabase
        .from("candidates")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchCandidates();
    } catch (err) {
      console.error("Error deleting candidate:", err);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Quy trình Tuyển dụng" subtitle="Hệ thống quản lý quy trình ứng tuyển và chấm điểm CV bằng AI" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("pipeline")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "pipeline"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Layers size={14} />
              Phễu tuyển dụng (Pipeline)
            </button>
            <button
              onClick={() => setActiveTab("table_view")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "table_view"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <FileText size={14} />
              Bảng danh sách chi tiết (Sheets)
            </button>
            <button
              onClick={() => setActiveTab("scorer")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "scorer"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Upload size={14} />
              Chấm điểm CV (AI Scorer)
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "settings"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Settings size={14} />
              Cấu hình hệ thống (Settings)
            </button>
          </div>

          {/* TAB 1: PIPELINE BOARD */}
          {activeTab === "pipeline" && (
            <div className="space-y-6">
              {/* Subheader Filters */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search */}
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm ứng viên, vị trí tuyển..."
                      className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                    />
                  </div>

                  {/* Department Filter */}
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 font-semibold text-slate-600 cursor-pointer shadow-sm"
                  >
                    <option value="all">Tất cả Phòng ban</option>
                    {departments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>

                  {/* Group By Department Toggle */}
                  <button
                    onClick={() => setGroupByDept(!groupByDept)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all shadow-sm ${
                      groupByDept
                        ? "bg-[#005BAC] border-[#005BAC] text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Layers size={12} />
                    Gom nhóm phòng ban: {groupByDept ? "Bật" : "Tắt"}
                  </button>

                  <button 
                    onClick={fetchCandidates}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    Tải lại
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10"
                  >
                    <Plus size={14} /> Thêm ứng viên
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-[350px] text-slate-400 gap-2">
                  <Loader2 className="animate-spin text-blue-600" size={26} />
                  <p className="text-xs font-medium">Đang tải phễu tuyển dụng...</p>
                </div>
              ) : (
                (() => {
                  const renderCandidateCard = (candidate: any) => (
                    <div
                      key={candidate.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, candidate.id)}
                      className="glass rounded-xl p-3 bg-white hover-elevate border border-slate-200/30 flex flex-col justify-between cursor-grab active:cursor-grabbing relative group transition-all"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md ${
                            candidate.ai_score >= 75 ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                            candidate.ai_score >= 50 ? "bg-amber-100 text-amber-700 border border-amber-200" :
                            "bg-rose-100 text-rose-700 border border-rose-200"
                          }`}>
                            AI: {candidate.ai_score || 0}
                          </span>
                          
                          {!groupByDept && candidate.department && (
                            <span className="text-[8px] font-extrabold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md border border-blue-100 truncate max-w-[85px]">
                              {candidate.department}
                            </span>
                          )}

                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCandidate(candidate.id);
                            }}
                            className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                        
                        <div>
                          <p className="text-slate-800 font-heading font-bold text-xs leading-snug">{candidate.name}</p>
                          <p className="text-slate-400 text-[10px] font-semibold truncate mt-0.5">{candidate.role || candidate.last_position || "Chưa cập nhật"}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[8px] text-slate-400 pt-1.5 border-t border-slate-100 font-medium mt-2">
                        <span>Nguồn: <strong className="text-slate-500">{candidate.source || "Khác"}</strong></span>
                        <span className="flex items-center gap-0.5">
                          <Calendar size={8} /> {new Date(candidate.created_at).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );

                  if (groupByDept) {
                    return (
                      <div className="space-y-4">
                        {departments.map((dept) => {
                          const deptCandidates = filteredPipeline.filter(c => (c.department || "Chưa xác định") === dept);
                          if (deptCandidates.length === 0) return null;

                          const isCollapsed = collapsedDepts[dept] || false;

                          return (
                            <div key={dept} className="space-y-3 border border-slate-200/50 rounded-2xl bg-slate-50/50 p-4 transition-all">
                              <button
                                onClick={() => setCollapsedDepts(prev => ({ ...prev, [dept]: !isCollapsed }))}
                                className="flex items-center justify-between w-full text-slate-700 hover:text-slate-900 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-heading font-extrabold text-sm text-[#005BAC]">📁 {dept}</span>
                                  <span className="text-[10px] font-extrabold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                                    {deptCandidates.length} ứng viên
                                  </span>
                                </div>
                                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                              </button>

                              {!isCollapsed && (
                                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start overflow-x-auto pb-4 pt-2">
                                  {COLUMNS.map((col) => {
                                    const colCandidates = deptCandidates.filter(c => (c.status || "new") === col.id);
                                    return (
                                      <div 
                                        key={col.id} 
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => handleDrop(e, col.id)}
                                        className="flex flex-col gap-3 min-w-[180px] bg-slate-100/30 p-2.5 rounded-xl border border-slate-200/40 min-h-[150px]"
                                      >
                                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                                          <span className="font-heading font-bold text-[10px] text-slate-500">{col.title}</span>
                                          <span className="text-[8px] font-extrabold text-slate-400 bg-slate-200 px-1.5 py-0.2 rounded-full">{colCandidates.length}</span>
                                        </div>

                                        <div className="space-y-2.5">
                                          {colCandidates.map(renderCandidateCard)}
                                          {colCandidates.length === 0 && (
                                            <div className="h-16 border border-dashed border-slate-200/50 rounded-lg flex items-center justify-center text-slate-300 text-[9px] italic">
                                              Kéo thả
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start overflow-x-auto pb-4">
                      {COLUMNS.map((col) => {
                        const colCandidates = filteredPipeline.filter(c => (c.status || "new") === col.id);
                        return (
                          <div 
                            key={col.id} 
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, col.id)}
                            className="flex flex-col gap-4 min-w-[200px] bg-slate-100/40 p-3 rounded-2xl border border-slate-200/40 min-h-[450px]"
                          >
                            <div className={`flex items-center justify-between border-t-2 ${col.color} pt-2`}>
                              <div className="flex items-center gap-2">
                                <span className="font-heading font-bold text-xs text-slate-700">{col.title}</span>
                                <span className="text-[9px] font-extrabold text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full">{colCandidates.length}</span>
                              </div>
                            </div>

                            <div className="space-y-3 flex-1">
                              {colCandidates.map(renderCandidateCard)}
                              {colCandidates.length === 0 && (
                                <div className="h-28 border-2 border-dashed border-slate-200/50 rounded-xl flex items-center justify-center text-slate-300 text-[11px] italic">
                                  Kéo thả vào đây
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* TAB 2: SPREADSHEET TABLE VIEW */}
          {activeTab === "table_view" && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Sheets Subtabs */}
                <div className="flex bg-slate-200/50 p-1 rounded-xl gap-1 w-fit border border-slate-200">
                  {[
                    { id: "tong_hop", label: "Tổng Hợp" },
                    { id: "vong_1", label: "Vòng 1" },
                    { id: "vong_2", label: "Vòng 2" },
                    { id: "thu_viec", label: "Thử Việc" }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setTableSubTab(tab.id as any)}
                      className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${
                        tableSubTab === tab.id
                          ? "bg-[#005BAC] text-white shadow-sm font-bold"
                          : "text-slate-600 hover:bg-white/40"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Search & Refresh */}
                <div className="flex items-center gap-3">
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm theo tên, SĐT, vị trí..."
                      className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                    />
                  </div>
                  <button 
                    onClick={fetchCandidates}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    Tải lại
                  </button>
                  <button 
                    onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 shadow"
                  >
                    <Plus size={14} /> Thêm ứng viên
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="glass rounded-2xl overflow-hidden border border-slate-200/40 shadow-xl bg-white/80">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-xs text-left border-collapse table-fixed min-w-[1500px]">
                    <thead className="bg-[#005088] text-white sticky top-0 z-10 font-heading text-[11px] uppercase tracking-wider">
                      <tr>
                        {getColumnsForTab(tableSubTab).map(col => (
                          <th
                            key={col.key}
                            style={{ width: col.width }}
                            className="px-3 py-3 border border-slate-200/80 font-semibold text-center whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={getColumnsForTab(tableSubTab).length} className="py-20 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="animate-spin text-blue-600" size={24} />
                              <p className="text-slate-400 italic">Đang tải bảng dữ liệu...</p>
                            </div>
                          </td>
                        </tr>
                      ) : getFilteredTableCandidates(tableSubTab).length === 0 ? (
                        <tr>
                          <td colSpan={getColumnsForTab(tableSubTab).length} className="py-10 text-center text-slate-400 italic">
                            Không tìm thấy ứng viên nào phù hợp
                          </td>
                        </tr>
                      ) : (
                        getFilteredTableCandidates(tableSubTab).map((candidate, i) => {
                          const cols = getColumnsForTab(tableSubTab);
                          return (
                            <tr
                              key={candidate.id}
                              className={`border-b border-slate-100 transition-colors ${
                                i % 2 === 0 ? "bg-white/40" : "bg-blue-50/10"
                              } hover:bg-blue-100/10`}
                            >
                              {cols.map(col => {
                                const val = candidate[col.key];

                                // Format cell content based on type
                                if (col.readOnly) {
                                  let displayVal = val || "";
                                  if (col.key === "created_at" && val) {
                                    displayVal = new Date(val).toLocaleDateString('vi-VN');
                                  }
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                                      {displayVal}
                                    </td>
                                  );
                                }

                                if (col.type === "status") {
                                  const displayStatus = val === "rejected" ? "FAIL" : "PASS CV";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <select
                                        value={displayStatus}
                                        onChange={(e) => handleDropdownChange(candidate.id, "status", e.target.value)}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer border-none outline-none ${
                                          displayStatus === "FAIL"
                                            ? "bg-rose-100 text-rose-700"
                                            : "bg-emerald-100 text-emerald-700"
                                        }`}
                                      >
                                        <option value="PASS CV">PASS CV</option>
                                        <option value="FAIL">FAIL</option>
                                      </select>
                                    </td>
                                  );
                                }

                                if (col.type === "v1_result" || col.type === "v2_result") {
                                  const displayRes = val || "Chờ đánh giá";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <select
                                        value={displayRes}
                                        onChange={(e) => handleDropdownChange(candidate.id, col.type!, e.target.value)}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border-none cursor-pointer outline-none ${
                                          displayRes === "ĐẠT"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : displayRes === "LOẠI"
                                            ? "bg-[#FEF3C7] text-[#92400E]"
                                            : displayRes === "TC PV"
                                            ? "bg-rose-600 text-white font-bold"
                                            : "bg-slate-100 text-slate-600"
                                        }`}
                                      >
                                        <option value="Chờ đánh giá">Chờ đánh giá</option>
                                        <option value="ĐẠT">ĐẠT</option>
                                        <option value="LOẠI">LOẠI</option>
                                        <option value="TC PV">TC PV</option>
                                      </select>
                                    </td>
                                  );
                                }

                                if (col.type === "probation_result") {
                                  const displayRes = val || "Chờ nhận việc";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <select
                                        value={displayRes}
                                        onChange={(e) => handleDropdownChange(candidate.id, "probation_result", e.target.value)}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border-none cursor-pointer outline-none ${
                                          displayRes === "ĐẠT"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : displayRes === "TC"
                                            ? "bg-rose-600 text-white font-bold"
                                            : "bg-slate-100 text-slate-600"
                                        }`}
                                      >
                                        <option value="Chờ nhận việc">Chờ nhận việc</option>
                                        <option value="ĐẠT">ĐẠT</option>
                                        <option value="TC">TC</option>
                                      </select>
                                    </td>
                                  );
                                }

                                return (
                                  <td key={col.key} className="p-0 border border-slate-100">
                                    <EditableCell
                                      value={val || ""}
                                      onSave={(newVal) => handleUpdateCandidateField(candidate.id, col.key, newVal)}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI SCORER PANEL */}
          {activeTab === "scorer" && (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Config Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* JD Input */}
                <div className="lg:col-span-2 glass rounded-2xl p-6 space-y-3">
                  <label className="font-heading font-semibold text-[#005BAC] flex items-center gap-2 text-xs uppercase tracking-wider">
                    <FileText size={16} /> Mô tả công việc (JD)
                  </label>
                  <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    rows={12}
                    placeholder="Dán nội dung Job Description vào đây…&#10;Ví dụ: Vị trí Trợ lý Giám đốc, tốt nghiệp Cao đẳng/Đại học chuyên ngành Xây dựng cầu đường, kinh nghiệm 2 năm..."
                    className="w-full resize-none text-xs bg-white/50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400/20 text-slate-700 placeholder:text-slate-400 shadow-sm"
                  />
                </div>

                {/* Settings */}
                <div className="glass rounded-2xl p-6 space-y-4 flex flex-col justify-between border border-slate-200/40">
                  <div className="space-y-4">
                    <p className="font-heading font-bold text-[#005BAC] text-xs uppercase tracking-wider">⚙️ Cấu hình tuyển dụng</p>
                    
                    {/* Candidate Source */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nguồn ứng viên</label>
                      <select
                        value={nguon}
                        onChange={(e) => setNguon(e.target.value)}
                        className="w-full text-xs text-slate-600 font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        {NGUON_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="pt-6 space-y-2">
                    <button
                      id="btn-start-scoring"
                      onClick={startScoring}
                      disabled={processing || files.length === 0 || !jdText.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10 text-xs"
                    >
                      {processing ? <Loader2 size={16} className="animate-spin" /> : "🚀"}
                      {processing ? `Đang phân tích ${progress.done}/${progress.total}...` : "Bắt đầu chấm điểm"}
                    </button>
                    {results.length > 0 && (
                      <>
                        <button
                          onClick={saveAllToDb}
                          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 shadow"
                        >
                          <Database size={14} /> Lưu tất cả vào Database (Supabase)
                        </button>
                        <button
                          onClick={submitAll}
                          className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold py-2 rounded-xl transition-all active:scale-95 shadow-sm"
                        >
                          <Send size={14} /> Ghi tất cả vào Google Sheets
                        </button>
                        <button
                          onClick={reset}
                          className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-xs font-semibold py-2 rounded-xl transition-colors"
                        >
                          <RotateCcw size={13} /> Làm lại
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload Zone */}
              {results.length === 0 && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`glass rounded-2xl border-2 border-dashed transition-all cursor-pointer p-10 text-center ${isDragging ? "border-[#005BAC] bg-blue-50/50 scale-[1.01]" : "border-slate-200 hover:border-[#005BAC]/50 hover:bg-blue-50/10"}`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED}
                    className="hidden"
                    onChange={(e) => addFiles(Array.from(e.target.files || []))}
                  />
                  <Upload size={32} className="mx-auto text-[#005BAC]/50 mb-3" />
                  <p className="font-heading font-bold text-[#005BAC] text-sm">Kéo thả hoặc click để tải lên CV</p>
                  <p className="text-slate-400 text-xs mt-1">Hỗ trợ các định dạng: PDF, DOCX, DOC, PNG, JPG, TXT · Nhiều tệp tin cùng lúc</p>
                </div>
              )}

              {/* File List */}
              {files.length > 0 && results.length === 0 && (
                <div className="glass rounded-2xl p-5 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-heading font-bold text-[#005BAC] text-xs uppercase tracking-wider">{files.length} tệp đã chọn</p>
                    <button onClick={() => setFiles([])} className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors">Xóa tất cả</button>
                  </div>
                  {files.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 text-xs border border-slate-100 shadow-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText size={14} className="text-[#005BAC] shrink-0" />
                        <span className="text-slate-700 truncate font-medium">{item.file.name}</span>
                        <span className="text-slate-400 text-[10px] shrink-0 font-medium">({(item.file.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <button onClick={() => removeFile(item.id)} className="p-1 hover:text-rose-500 text-slate-400 transition-colors shrink-0"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Progress */}
              {processing && (
                <div className="glass rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3 text-xs font-bold text-[#005BAC]">
                    <span>Đang tiến hành chấm điểm bằng AI...</span>
                    <span>{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#005BAC] rounded-full transition-all duration-500" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}

              {/* Results List */}
              {results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-heading font-bold text-[#005BAC] text-sm uppercase tracking-wider">
                      Kết quả đánh giá – {results.length} ứng viên
                      {" "}· <span className="text-emerald-600">{passCount} PASS</span>
                      {" "}· <span className="text-rose-500">{results.length - passCount} FAIL</span>
                    </h2>
                    <button onClick={() => { setResults([]); }} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 font-semibold">
                      <RotateCcw size={12} /> Chấm lại
                    </button>
                  </div>
                  {results.map((r) => (
                    <ResultCard key={r.file_name} result={r} onSubmit={submitToSheets} onSaveDb={saveToSupabase} />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {results.length === 0 && files.length === 0 && !processing && (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <CheckCircle size={40} className="mx-auto text-slate-200" />
                  <p className="text-xs font-semibold italic">Tải lên tệp CV của ứng viên và dán JD công việc ở trên để bắt đầu chấm điểm tự động.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SYSTEM SETTINGS PANEL */}
          {activeTab === "settings" && (
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Toast Alert */}
              {saved && (
                <div className="fixed bottom-6 right-6 z-50 animate-bounce">
                  <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 font-semibold text-sm">
                     <CheckCircle className="w-5 h-5 text-emerald-200" />
                    Cập nhật cấu hình thành công!
                  </div>
                </div>
              )}

              {/* Setup Configuration Form */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
                  <Key size={18} className="text-[#005BAC]" /> Cấu hình bảo mật & Kết nối
                </h2>

                <form onSubmit={handleSaveSettings} className="space-y-5 text-xs text-slate-600 font-semibold">
                  {/* API Key */}
                  <div className="space-y-1">
                    <label className="text-slate-500">OpenAI API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-medium text-slate-700"
                    />
                    <p className="text-[10px] text-slate-400 font-normal mt-1">Khoá bảo mật API dùng để thực hiện chấm điểm và trích xuất dữ liệu CV bằng AI.</p>
                  </div>

                  {/* Webhook Url */}
                  <div className="space-y-1">
                    <label className="text-slate-500">Google Apps Script Webhook URL</label>
                    <input
                      type="text"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-medium text-slate-700"
                    />
                    <p className="text-[10px] text-slate-400 font-normal mt-1">Đường dẫn Webhook được sinh ra sau khi Deploy Apps Script để ghi dữ liệu thời gian thực.</p>
                  </div>

                  {/* ChatGPT Model */}
                  <div className="space-y-1">
                    <label className="text-slate-500">ChatGPT Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer text-xs font-semibold text-slate-600 bg-white"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Nhanh & Tối ưu chi phí)</option>
                      <option value="gpt-4o">gpt-4o (Độ chính xác cao hơn)</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all shadow"
                    >
                      Lưu cấu hình hệ thống
                    </button>
                  </div>
                </form>
              </div>

              {/* System Info */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-4">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Info size={18} className="text-[#005BAC]" /> Thông tin nền tảng
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-slate-600">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Phiên bản</p>
                    <p className="text-[#005BAC] font-bold">HRA Platform v2.5</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Phòng ban kết nối</p>
                    <p className="text-emerald-600 font-bold">Tuyển dụng & HCNS</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Cơ sở dữ liệu chính</p>
                    <p className="text-blue-600 font-bold">Supabase PostgreSQL</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Môi trường</p>
                    <p className="text-emerald-600 font-bold">Online Production</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Manual Candidate Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-heading font-bold text-sm text-slate-800">Thêm ứng viên mới</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCandidate} className="space-y-4 font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">Tên ứng viên</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn A..."
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Vị trí ứng tuyển</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Kỹ sư xây dựng..."
                  value={addPosition}
                  onChange={(e) => setAddPosition(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Email</label>
                  <input
                    type="email"
                    placeholder="email@example.com"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Số điện thoại</label>
                  <input
                    type="text"
                    placeholder="SĐT ứng viên..."
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Nguồn ứng viên</label>
                <select
                  value={addSource}
                  onChange={(e) => setAddSource(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                >
                  {NGUON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl"
                >
                  Thêm mới
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

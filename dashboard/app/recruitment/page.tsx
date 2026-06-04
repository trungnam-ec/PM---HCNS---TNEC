"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
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
  Info
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

// ─── PIPELINE MOCK DATA ──────────────────────────────────────────────────────
const INITIAL_CANDIDATES = [
  // CV Mới
  { id: "c1", name: "Bùi Tấn Hiếu", position: "QLDA Cầu Đường", source: "TopCV", date: "02 Tháng 6", score: 85, phone: "0912 345 678", email: "hieu.bt@gmail.com", column: "new" },
  { id: "c2", name: "Trần Văn Trượt", position: "Kỹ sư Giám sát", source: "Referral", date: "03 Tháng 6", score: 45, phone: "0987 654 321", email: "truot.tv@gmail.com", column: "new" },
  
  // Sàng lọc
  { id: "c3", name: "Lê Thị Thu Thảo", position: "Trợ lý Giám đốc", source: "LinkedIn", date: "28 Tháng 5", score: 92, phone: "0934 567 890", email: "thao.lt@gmail.com", column: "screening" },
  
  // Phỏng vấn
  { id: "c4", name: "Bùi Quốc Vương", position: "Kế hoạch Kỹ thuật", source: "TopCV", date: "25 Tháng 5", score: 78, phone: "0905 123 456", email: "vuong.bq@gmail.com", column: "interview" },
  
  // Đề nghị
  { id: "c5", name: "Nguyễn Văn Thành", position: "Chuyên viên QLDA", source: "Nội bộ", date: "20 Tháng 5", score: 88, phone: "0917 999 888", email: "thanh.nv@gmail.com", column: "offer" },
  
  // Đã tuyển
  { id: "c6", name: "Nguyễn Văn Đấu", position: "Kỹ sư Kế hoạch", source: "LinkedIn", date: "15 Tháng 5", score: 95, phone: "0909 888 777", email: "dau.nv@gmail.com", column: "hired" },
  
  // Từ chối
  { id: "c7", name: "Lê Văn Tèo", position: "Nhân viên Hành chính", source: "TopCV", date: "12 Tháng 5", score: 35, phone: "0914 111 222", email: "teo.lv@gmail.com", column: "rejected" }
];

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
}: {
  result: ScoringResult;
  onSubmit: (r: ScoringResult) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const c = scoreColor(result.score);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit(result);
    setSubmitting(false);
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
          {!result.submitted ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Ghi Sheets
            </button>
          ) : (
            <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
              <CheckCircle size={13} /> Đã ghi
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

// ─── MAIN RECRUITMENT PAGE ────────────────────────────────────────────────────
export default function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "scorer" | "settings">("pipeline");
  const [candidates, setCandidates] = useState(INITIAL_CANDIDATES);
  const [search, setSearch] = useState("");

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

  // Search filter for pipeline
  const filteredPipeline = candidates.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.position.toLowerCase().includes(search.toLowerCase())
  );

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
        };
        newResults.push(r);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        newResults.push({
          file_name: item.file.name, score: 0, recommendation: "Error",
          trang_thai: "FAIL", matching_skills: [], missing_skills: [],
          summary: "", extracted_info: {}, submitted: false, error: msg,
        });
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    // Sort by score desc
    newResults.sort((a, b) => b.score - a.score);
    setResults(newResults);
    setProcessing(false);
  };

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

  const submitAll = async () => {
    const unsubmitted = results.filter((r) => !r.submitted && !r.error);
    for (const r of unsubmitted) await submitToSheets(r);
  };

  const reset = () => { setFiles([]); setResults([]); setProgress({ done: 0, total: 0 }); };

  const passCount = results.filter((r) => r.trang_thai === "PASS CV").length;

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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
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
                  <button className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                    <ArrowUpDown size={13} /> Điểm số
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                    <Layers size={14} /> Quy trình tuyển dụng
                  </button>
                  <button className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10">
                    <Plus size={14} /> Thêm ứng viên
                  </button>
                </div>
              </div>

              {/* Pipeline Board */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start overflow-x-auto pb-4">
                {COLUMNS.map((col) => {
                  const colCandidates = filteredPipeline.filter(c => c.column === col.id);
                  return (
                    <div key={col.id} className="flex flex-col gap-4 min-w-[200px] bg-slate-100/40 p-3 rounded-2xl border border-slate-200/40">
                      {/* Column Header */}
                      <div className={`flex items-center justify-between border-t-2 ${col.color} pt-2`}>
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-bold text-xs text-slate-700">{col.title}</span>
                          <span className="text-[9px] font-extrabold text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full">{colCandidates.length}</span>
                        </div>
                      </div>

                      {/* Candidate Cards */}
                      <div className="space-y-3 min-h-[400px]">
                        {colCandidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="glass rounded-xl p-4 bg-white hover-elevate border border-slate-200/30 flex flex-col justify-between h-40 cursor-grab active:cursor-grabbing"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${
                                  candidate.score >= 75 ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                                  candidate.score >= 50 ? "bg-amber-100 text-amber-700 border border-amber-200" :
                                  "bg-rose-100 text-rose-700 border border-rose-200"
                                }`}>
                                  Điểm AI: {candidate.score}
                                </span>
                                <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={13} /></button>
                              </div>
                              
                              <p className="text-slate-800 font-heading font-bold text-xs truncate leading-snug">{candidate.name}</p>
                              <p className="text-slate-400 text-[10px] font-semibold truncate">{candidate.position}</p>
                            </div>

                            {/* Contact & Timeline Info */}
                            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[9px] text-slate-400 font-semibold">
                              <span className="flex items-center gap-1.5 text-slate-500"><Phone size={10} /> {candidate.phone}</span>
                              <span className="flex items-center gap-1.5 text-slate-500"><Mail size={10} /> {candidate.email}</span>
                              
                              <div className="flex items-center justify-between pt-1 text-[8px] text-slate-400">
                                <span>Nguồn: <strong className="text-slate-600">{candidate.source}</strong></span>
                                <span className="flex items-center gap-0.5"><Calendar size={9} /> {candidate.date}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {colCandidates.length === 0 && (
                          <div className="h-28 border-2 border-dashed border-slate-200/80 rounded-xl flex items-center justify-center text-slate-300 text-[11px] italic">
                            Trống
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                          onClick={submitAll}
                          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 shadow"
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
                    <ResultCard key={r.file_name} result={r} onSubmit={submitToSheets} />
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
                    <p className="text-slate-400 text-[10px]">Cơ sở dữ liệu</p>
                    <p className="text-blue-600 font-bold">Google Sheets API</p>
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
    </div>
  );
}

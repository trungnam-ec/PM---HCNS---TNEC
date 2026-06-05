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

// â”€â”€â”€ TYPES FOR CV SCORER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

const NGUON_OPTIONS = ["TopCV", "LinkedIn", "Email", "Referral", "Ná»™i bá»™", "KhÃ¡c"];

// â”€â”€â”€ SCORE COLOR HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function scoreColor(score: number) {
  if (score >= 75) return { text: "text-emerald-600", bg: "bg-emerald-500", bar: "bg-emerald-400" };
  if (score >= 50) return { text: "text-amber-500", bg: "bg-amber-400", bar: "bg-amber-400" };
  return { text: "text-rose-500", bg: "bg-rose-500", bar: "bg-rose-400" };
}

const COLUMNS = [
  { id: "new", title: "CV Má»›i", color: "border-t-slate-400" },
  { id: "screening", title: "SÃ ng lá»c", color: "border-t-cyan-500" },
  { id: "interview", title: "Phá»ng váº¥n", color: "border-t-blue-500" },
  { id: "offer", title: "Äá» nghá»‹", color: "border-t-purple-500" },
  { id: "hired", title: "ÄÃ£ tuyá»ƒn", color: "border-t-emerald-500" },
  { id: "rejected", title: "Tá»« chá»‘i", color: "border-t-rose-500" }
];

// â”€â”€â”€ RESULT CARD SUBCOMPONENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
            {result.extracted_info?.vi_tri || "N/A"} Â· {result.extracted_info?.kinh_nghiem || "N/A"} Â· {result.extracted_info?.khu_vuc || "N/A"}
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${c.bar} rounded-full transition-all`} style={{ width: `${result.score}%` }} />
          </div>
        </div>

        {/* Status + buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {result.trang_thai === "PASS CV" ? (
            <span className="badge-pass px-3 py-1 rounded-full text-xs font-semibold">âœ“ PASS CV</span>
          ) : (
            <span className="badge-fail px-3 py-1 rounded-full text-xs font-semibold">âœ— FAIL</span>
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
              LÆ°u Database
            </button>
          ) : (
            <span className="flex items-center gap-1 text-blue-600 text-xs font-medium px-2">
              <CheckCircle size={13} /> ÄÃ£ lÆ°u DB
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
              <CheckCircle size={13} /> ÄÃ£ ghi Sheets
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
              <p className="font-semibold text-emerald-600 mb-1.5">âœ… Ká»¹ nÄƒng tÆ°Æ¡ng thÃ­ch</p>
              <ul className="space-y-1">
                {result.matching_skills.length ? result.matching_skills.map((s, i) => (
                  <li key={i} className="text-slate-600 text-xs flex items-start gap-1.5"><span className="text-emerald-400 mt-0.5">â€¢</span>{s}</li>
                )) : <li className="text-slate-400 text-xs italic">KhÃ´ng cÃ³</li>}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-rose-500 mb-1.5">âŒ Ká»¹ nÄƒng cÃ²n thiáº¿u</p>
              <ul className="space-y-1">
                {result.missing_skills.length ? result.missing_skills.map((s, i) => (
                  <li key={i} className="text-slate-600 text-xs flex items-start gap-1.5"><span className="text-rose-300 mt-0.5">â€¢</span>{s}</li>
                )) : <li className="text-slate-400 text-xs italic">KhÃ´ng cÃ³</li>}
              </ul>
            </div>
          </div>

          {/* Right: info + summary */}
          <div className="space-y-3">
            <div>
              <p className="font-semibold text-slate-600 mb-1.5">ðŸ“‹ ThÃ´ng tin trÃ­ch xuáº¥t</p>
              <div className="space-y-1 text-xs text-slate-500">
                {[
                  ["Email", result.extracted_info?.email],
                  ["SÄT", result.extracted_info?.sdt],
                  ["Báº±ng cáº¥p", result.extracted_info?.bang_cap],
                  ["ChuyÃªn ngÃ nh", result.extracted_info?.chuyen_nganh],
                  ["PhÃ²ng ban", result.extracted_info?.phong_ban],
                  ["NgÆ°á»i Ä‘Ã¡nh giÃ¡", result.extracted_info?.nguoi_danh_gia],
                ].map(([label, val]) => (
                  <div key={label} className="flex gap-2">
                    <span className="text-slate-400 w-24 shrink-0">{label}:</span>
                    <span className="text-slate-600">{val || "N/A"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-semibold text-slate-600 mb-1">ðŸ“ Nháº­n xÃ©t AI</p>
              <p className="text-slate-500 text-xs leading-relaxed">{result.summary}</p>
              <p className="mt-1.5 text-xs font-medium">
                Khuyáº¿n nghá»‹:{" "}
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

// â”€â”€â”€ HELPERS FOR TABLE VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

const normalizeDepartment = (dept: string): string => {
  if (!dept) return "ChÆ°a xÃ¡c Ä‘á»‹nh";
  const trim = dept.trim();
  const lower = trim.toLowerCase();
  
  if (lower === "atld" || lower === "atlÄ‘" || lower === "phÃ²ng atlÄ‘") {
    return "ATLÄ";
  }
  if (lower === "ká»¹ thuáº­t" || lower === "ká»¹ Thuáº­t") {
    return "Ká»¹ thuáº­t";
  }
  if (lower === "phÃ²ng hÃ nh chÃ­nh nhÃ¢n sá»±" || lower === "hcns") {
    return "HCNS";
  }
  if (lower === "vt-tb" || lower === "vt_tb" || lower === "váº­t tÆ° - thiáº¿t bá»‹") {
    return "VT-TB";
  }
  if (lower === "káº¿ toÃ¡n") {
    return "Káº¿ toÃ¡n";
  }
  
  return trim.charAt(0).toUpperCase() + trim.slice(1);
};

const getColumnsForTab = (tab: string) => {
  if (tab === "tong_hop") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "created_at", label: "NgÃ y táº¡o", width: "110px", readOnly: true },
      { key: "name", label: "TÃªn á»©ng viÃªn", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SÄT", width: "110px" },
      { key: "education", label: "Báº±ng cáº¥p", width: "100px" },
      { key: "major", label: "ChuyÃªn ngÃ nh", width: "150px" },
      { key: "experience", label: "Kinh nghiá»‡m", width: "120px" },
      { key: "last_position", label: "Chá»©c danh gáº§n nháº¥t", width: "160px" },
      { key: "last_company", label: "CÃ´ng ty gáº§n nháº¥t", width: "160px" },
      { key: "region", label: "Khu vá»±c", width: "100px" },
      { key: "department", label: "PhÃ²ng Ban", width: "130px" },
      { key: "role", label: "Vá»‹ trÃ­", width: "140px" },
      { key: "status", label: "Tráº¡ng thÃ¡i", width: "120px", type: "status" },
      { key: "source", label: "Nguá»“n", width: "110px" },
      { key: "reviewer", label: "NgÆ°á»i Ä‘Ã¡nh giÃ¡", width: "130px" }
    ];
  }
  if (tab === "vong_1") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "v1_date", label: "NgÃ y VÃ²ng 1", width: "110px" },
      { key: "name", label: "TÃªn á»©ng viÃªn", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SÄT", width: "110px" },
      { key: "education", label: "Báº±ng cáº¥p", width: "100px" },
      { key: "major", label: "ChuyÃªn ngÃ nh", width: "150px" },
      { key: "region", label: "Khu vá»±c", width: "100px" },
      { key: "department", label: "PhÃ²ng Ban", width: "130px" },
      { key: "role", label: "Vá»‹ trÃ­", width: "140px" },
      { key: "status", label: "Tráº¡ng thÃ¡i", width: "120px", type: "status" },
      { key: "source", label: "Nguá»“n", width: "110px" },
      { key: "v1_interviewer", label: "NgÆ°á»i PV V1", width: "130px" },
      { key: "v1_result", label: "Káº¿t quáº£ V1", width: "120px", type: "v1_result" }
    ];
  }
  if (tab === "vong_2") {
    return [
      { key: "stt", label: "STT", width: "60px" },
      { key: "v2_date", label: "NgÃ y VÃ²ng 2", width: "110px" },
      { key: "name", label: "TÃªn á»©ng viÃªn", width: "180px" },
      { key: "email", label: "Email", width: "180px" },
      { key: "phone", label: "SÄT", width: "110px" },
      { key: "education", label: "Báº±ng cáº¥p", width: "100px" },
      { key: "major", label: "ChuyÃªn ngÃ nh", width: "150px" },
      { key: "region", label: "Khu vá»±c", width: "100px" },
      { key: "department", label: "PhÃ²ng Ban", width: "130px" },
      { key: "role", label: "Vá»‹ trÃ­", width: "140px" },
      { key: "status", label: "Tráº¡ng thÃ¡i", width: "120px", type: "status" },
      { key: "source", label: "Nguá»“n", width: "110px" },
      { key: "v2_interviewer", label: "NgÆ°á»i PV V2", width: "130px" },
      { key: "v2_result", label: "Káº¿t quáº£ V2", width: "120px", type: "v2_result" }
    ];
  }
  // Thá»­ viá»‡c
  return [
    { key: "stt", label: "STT", width: "60px" },
    { key: "created_at", label: "NgÃ y táº¡o", width: "110px", readOnly: true },
    { key: "name", label: "TÃªn á»©ng viÃªn", width: "180px" },
    { key: "email", label: "Email", width: "180px" },
    { key: "phone", label: "SÄT", width: "110px" },
    { key: "education", label: "Báº±ng cáº¥p", width: "100px" },
    { key: "major", label: "ChuyÃªn ngÃ nh", width: "150px" },
    { key: "experience", label: "Kinh nghiá»‡m", width: "120px" },
    { key: "last_position", label: "Chá»©c danh gáº§n nháº¥t", width: "160px" },
    { key: "last_company", label: "CÃ´ng ty gáº§n nháº¥t", width: "160px" },
    { key: "region", label: "Khu vá»±c", width: "100px" },
    { key: "department", label: "PhÃ²ng Ban", width: "130px" },
    { key: "role", label: "Vá»‹ trÃ­", width: "140px" },
    { key: "v2_result", label: "Káº¿t quáº£ V2", width: "110px", readOnly: true },
    { key: "probation_result", label: "Káº¿t quáº£ nháº­n viá»‡c", width: "130px", type: "probation_result" },
    { key: "ai_recommendation", label: "HÄ ChÃ­nh thá»©c", width: "120px", type: "probation_contract" }, // Store in ai_recommendation
    { key: "onboard_date", label: "ONBOARD", width: "110px" },
    { key: "probation_end_date", label: "Háº¿t háº¡n TV", width: "110px" },
    { key: "probation_salary", label: "Má»©c lÆ°Æ¡ng TV", width: "120px" },
    { key: "official_salary", label: "Má»¨C lÆ°Æ¡ng CT", width: "120px" }
  ];
};

// â”€â”€â”€ MAIN RECRUITMENT PAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function RecruitmentPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "pipeline" | "table_view" | "scorer" | "settings">("dashboard");
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
      if (value === "Äáº T") {
        updates.status = "interview";
      } else if (value === "LOáº I" || value === "TC PV") {
        updates.status = "rejected";
      }
      await handleUpdateCandidateFields(candidateId, updates);
    } else if (type === "v2_result") {
      const updates: any = { v2_result: value };
      if (value === "Äáº T") {
        updates.status = "offer";
      } else if (value === "LOáº I" || value === "TC PV") {
        updates.status = "rejected";
      }
      await handleUpdateCandidateFields(candidateId, updates);
    } else if (type === "probation_result") {
      const updates: any = { probation_result: value };
      if (value === "Äáº T") {
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
    new Set(candidates.map(c => normalizeDepartment(c.department)).filter(Boolean))
  ).sort();

  // Search filter for pipeline
  const filteredPipeline = candidates.filter(c => {
    const matchesSearch = (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.role || c.last_position || "").toLowerCase().includes(search.toLowerCase());
    const matchesDept = selectedDept === "all" || normalizeDepartment(c.department) === selectedDept;
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
    if (!jdText.trim()) { alert("Vui lÃ²ng nháº­p mÃ´ táº£ cÃ´ng viá»‡c (JD)."); return; }
    if (files.length === 0) { alert("Vui lÃ²ng chá»n Ã­t nháº¥t 1 file CV."); return; }

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
      alert("Lá»—i ghi Sheets: " + (e instanceof Error ? e.message : String(e)));
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
      alert("Lá»—i khi lÆ°u vÃ o database: " + (err instanceof Error ? err.message : String(err)));
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
          reviewer: "Tá»± táº¡o"
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
      alert("Lá»—i khi thÃªm á»©ng viÃªn!");
    }
  };

  // Delete Candidate
  const handleDeleteCandidate = async (id: string) => {
    if (!confirm("Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a há»“ sÆ¡ á»©ng viÃªn nÃ y?")) return;
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
        <Header title="Quy trÃ¬nh Tuyá»ƒn dá»¥ng" subtitle="Há»‡ thá»‘ng quáº£n lÃ½ quy trÃ¬nh á»©ng tuyá»ƒn vÃ  cháº¥m Ä‘iá»ƒm CV báº±ng AI" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-6 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === "dashboard"
                  ? "border-[#005BAC] text-[#005BAC]"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <ArrowUpDown size={14} />
              Tá»•ng quan (Dashboard)
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
              Báº£ng danh sÃ¡ch chi tiáº¿t (Sheets)
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
              Cháº¥m Ä‘iá»ƒm CV (AI Scorer)
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
              Cáº¥u hÃ¬nh há»‡ thá»‘ng (Settings)
            </button>
          </div>

          {/* TAB 0: EXECUTIVE DASHBOARD */}
          {activeTab === "dashboard" && (() => {
            const total = candidates.length;
            const byStatus = (status: string) => candidates.filter(c => (c.status || "new") === status).length;
            const newCount = byStatus("new");
            const screeningCount = byStatus("screening");
            const interviewCount = byStatus("interview");
            const offerCount = byStatus("offer");
            const hiredCount = byStatus("hired");
            const rejectedCount = byStatus("rejected");
            const passRate = total > 0 ? Math.round(((total - rejectedCount) / total) * 100) : 0;

            // By department stats
            const byDept: Record<string, { total: number; hired: number; interview: number; rejected: number }> = {};
            candidates.forEach(c => {
              const dept = normalizeDepartment(c.department);
              if (!byDept[dept]) byDept[dept] = { total: 0, hired: 0, interview: 0, rejected: 0 };
              byDept[dept].total++;
              if (c.status === "hired") byDept[dept].hired++;
              if (c.status === "interview" || c.status === "offer") byDept[dept].interview++;
              if (c.status === "rejected") byDept[dept].rejected++;
            });

            const deptEntries = Object.entries(byDept).sort((a, b) => b[1].total - a[1].total);
            const maxDeptTotal = Math.max(...deptEntries.map(([, v]) => v.total), 1);

            // By source
            const bySource: Record<string, number> = {};
            candidates.forEach(c => {
              const src = c.source || "KhÃ¡c";
              bySource[src] = (bySource[src] || 0) + 1;
            });
            const sourceEntries = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 6);

            // By month (last 6 months)
            const byMonth: Record<string, number> = {};
            candidates.forEach(c => {
              if (c.created_at) {
                const d = new Date(c.created_at);
                const key = `T${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`;
                byMonth[key] = (byMonth[key] || 0) + 1;
              }
            });
            const monthEntries = Object.entries(byMonth).slice(-6);
            const maxMonth = Math.max(...monthEntries.map(([, v]) => v), 1);

            const PIPELINE_STEPS = [
              { id: "new", label: "CV Má»›i", count: newCount, color: "bg-slate-400", text: "text-slate-500", pct: total > 0 ? Math.round((newCount/total)*100) : 0 },
              { id: "screening", label: "SÃ ng lá»c", count: screeningCount, color: "bg-cyan-400", text: "text-cyan-600", pct: total > 0 ? Math.round((screeningCount/total)*100) : 0 },
              { id: "interview", label: "Phá»ng váº¥n", count: interviewCount, color: "bg-blue-500", text: "text-blue-600", pct: total > 0 ? Math.round((interviewCount/total)*100) : 0 },
              { id: "offer", label: "Äá» nghá»‹", count: offerCount, color: "bg-purple-500", text: "text-purple-600", pct: total > 0 ? Math.round((offerCount/total)*100) : 0 },
              { id: "hired", label: "ÄÃ£ tuyá»ƒn", count: hiredCount, color: "bg-emerald-500", text: "text-emerald-600", pct: total > 0 ? Math.round((hiredCount/total)*100) : 0 },
            ];

            return (
              <div className="space-y-6">
                {/* KPI Row */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { label: "Tá»•ng á»©ng viÃªn", value: total, icon: "ðŸ‘¥", bg: "from-blue-500 to-blue-700", sub: "ToÃ n bá»™ há»“ sÆ¡" },
                    { label: "ÄÃ£ tuyá»ƒn dá»¥ng", value: hiredCount, icon: "âœ…", bg: "from-emerald-500 to-emerald-700", sub: `${total>0?Math.round((hiredCount/total)*100):0}% tá»•ng sá»‘` },
                    { label: "Äang phá»ng váº¥n", value: interviewCount + offerCount, icon: "ðŸŽ¯", bg: "from-purple-500 to-purple-700", sub: "V1 + V2 + Offer" },
                    { label: "CV Má»›i chá» duyá»‡t", value: newCount + screeningCount, icon: "ðŸ“‹", bg: "from-cyan-500 to-cyan-700", sub: "ChÆ°a vÃ o vÃ²ng PV" },
                    { label: "Tá»« chá»‘i / Loáº¡i", value: rejectedCount, icon: "âŒ", bg: "from-rose-500 to-rose-700", sub: `${total>0?Math.round((rejectedCount/total)*100):0}% tá»•ng sá»‘` },
                    { label: "Tá»‰ lá»‡ Pass CV", value: `${passRate}%`, icon: "ðŸ“Š", bg: "from-amber-500 to-orange-600", sub: "KhÃ´ng bá»‹ loáº¡i" },
                  ].map((kpi, i) => (
                    <div key={i} className={`bg-gradient-to-br ${kpi.bg} rounded-2xl p-4 text-white shadow-lg relative overflow-hidden`}>
                      <div className="absolute top-2 right-3 text-2xl opacity-20 select-none">{kpi.icon}</div>
                      <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wider leading-tight">{kpi.label}</p>
                      <p className="text-3xl font-extrabold font-heading mt-1 leading-none">{kpi.value}</p>
                      <p className="text-[9px] opacity-70 mt-1.5">{kpi.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Funnel + Monthly Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Pipeline Funnel Visual */}
                  <div className="lg:col-span-2 glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-heading font-bold text-slate-800 text-sm">Phá»…u Tuyá»ƒn Dá»¥ng</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Tá»‰ lá»‡ chuyá»ƒn Ä‘á»•i qua tá»«ng giai Ä‘oáº¡n</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-semibold text-emerald-500 uppercase tracking-wider">Tá»‰ lá»‡ tuyá»ƒn dá»¥ng</p>
                        <p className="text-4xl font-extrabold text-emerald-600 font-heading leading-none mt-0.5">
                          {total > 0 ? Math.round((hiredCount/total)*100) : 0}%
                        </p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{hiredCount}/{total} á»©ng viÃªn</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {PIPELINE_STEPS.map((step, i) => (
                        <div key={step.id} className="flex items-center gap-4">
                          <div className="w-24 text-right">
                            <span className="text-[10px] font-bold text-slate-500">{step.label}</span>
                          </div>
                          <div className="flex-1 relative">
                            <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                              <div
                                className={`h-full ${step.color} rounded-lg transition-all duration-700 flex items-center justify-end pr-3`}
                                style={{ width: `${Math.max(step.pct, 2)}%` }}
                              >
                                {step.count > 0 && (
                                  <span className="text-white text-[10px] font-extrabold">{step.count}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="w-14 text-right">
                            <span className={`text-[10px] font-extrabold ${step.text}`}>{step.pct}%</span>
                          </div>
                          {i < PIPELINE_STEPS.length - 1 && (
                            <ChevronDown size={12} className="text-slate-300 absolute" style={{ display: 'none' }} />
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Rejected outside funnel */}
                    <div className="flex items-center gap-4 pt-2 border-t border-dashed border-slate-200">
                      <div className="w-24 text-right">
                        <span className="text-[10px] font-bold text-rose-400">Tá»« chá»‘i</span>
                      </div>
                      <div className="flex-1">
                        <div className="h-6 bg-rose-50 rounded-lg overflow-hidden border border-dashed border-rose-200">
                          <div
                            className="h-full bg-rose-300/60 rounded-lg flex items-center justify-end pr-3 transition-all"
                            style={{ width: `${total > 0 ? Math.round((rejectedCount/total)*100) : 0}%` }}
                          >
                            {rejectedCount > 0 && <span className="text-rose-700 text-[10px] font-extrabold">{rejectedCount}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="w-14 text-right">
                        <span className="text-[10px] font-extrabold text-rose-400">{total > 0 ? Math.round((rejectedCount/total)*100) : 0}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Trend */}
                  <div className="glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">á»¨ng viÃªn theo thÃ¡ng</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">6 thÃ¡ng gáº§n nháº¥t</p>
                    </div>
                    <div className="space-y-2.5">
                      {monthEntries.map(([month, count]) => (
                        <div key={month} className="flex items-center gap-3">
                          <span className="text-[9px] font-bold text-slate-500 w-12 shrink-0">{month}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                              style={{ width: `${Math.round((count/maxMonth)*100)}%` }}
                            >
                              <span className="text-white text-[8px] font-extrabold">{count}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {monthEntries.length === 0 && (
                        <p className="text-slate-400 text-xs italic text-center py-4">KhÃ´ng cÃ³ dá»¯ liá»‡u</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* By Department + By Source */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* By Department */}
                  <div className="glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-heading font-bold text-slate-800 text-sm">Theo PhÃ²ng Ban</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Sá»‘ lÆ°á»£ng á»©ng viÃªn & tá»‰ lá»‡ tuyá»ƒn dá»¥ng</p>
                      </div>
                    </div>
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {deptEntries.map(([dept, stats]) => (
                        <div key={dept} className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-slate-700">{dept}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400">{stats.total} UV</span>
                              <span className="text-emerald-600 font-bold">âœ… {stats.hired}</span>
                              <span className="text-blue-500 font-bold">ðŸŽ¯ {stats.interview}</span>
                              <span className="text-rose-400 font-bold">âŒ {stats.rejected}</span>
                            </div>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                            <div
                              className="h-full bg-emerald-400 transition-all rounded-l-full"
                              style={{ width: `${Math.round((stats.hired / maxDeptTotal) * 100)}%` }}
                              title={`ÄÃ£ tuyá»ƒn: ${stats.hired}`}
                            />
                            <div
                              className="h-full bg-blue-400 transition-all"
                              style={{ width: `${Math.round((stats.interview / maxDeptTotal) * 100)}%` }}
                              title={`Phá»ng váº¥n: ${stats.interview}`}
                            />
                            <div
                              className="h-full bg-slate-200 transition-all"
                              style={{ width: `${Math.round(((stats.total - stats.hired - stats.interview - stats.rejected) / maxDeptTotal) * 100)}%` }}
                              title={`CV Má»›i/SÃ ng lá»c`}
                            />
                            <div
                              className="h-full bg-rose-300 transition-all rounded-r-full"
                              style={{ width: `${Math.round((stats.rejected / maxDeptTotal) * 100)}%` }}
                              title={`Tá»« chá»‘i: ${stats.rejected}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-4 text-[9px] font-semibold pt-2 border-t border-slate-100">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> ÄÃ£ tuyá»ƒn</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" /> Phá»ng váº¥n</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" /> Äang xÃ©t</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-300 inline-block" /> Tá»« chá»‘i</span>
                    </div>
                  </div>

                  {/* By Source */}
                  <div className="glass bg-white/80 rounded-2xl p-6 shadow border border-slate-100 space-y-4">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Theo Nguá»“n á»¨ng ViÃªn</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">KÃªnh tuyá»ƒn dá»¥ng hiá»‡u quáº£ nháº¥t</p>
                    </div>
                    <div className="space-y-3">
                      {sourceEntries.map(([src, count], i) => {
                        const maxSrc = sourceEntries[0]?.[1] || 1;
                        const pct = Math.round((count / total) * 100);
                        const COLORS = [
                          "from-blue-400 to-blue-600",
                          "from-emerald-400 to-emerald-600",
                          "from-purple-400 to-purple-600",
                          "from-amber-400 to-amber-600",
                          "from-cyan-400 to-cyan-600",
                          "from-rose-400 to-rose-600",
                        ];
                        return (
                          <div key={src} className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-bold text-slate-700">{src}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">{count} UV</span>
                                <span className="text-blue-600 font-extrabold">{pct}%</span>
                              </div>
                            </div>
                            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full bg-gradient-to-r ${COLORS[i % COLORS.length]} rounded-full transition-all duration-700`}
                                style={{ width: `${Math.round((count / maxSrc) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Top dept highlight */}
                    <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-[9px] font-semibold text-blue-400 uppercase">PhÃ²ng tuyá»ƒn nhiá»u nháº¥t</p>
                        <p className="text-sm font-extrabold text-blue-700 mt-1">{deptEntries[0]?.[0] || "â€”"}</p>
                        <p className="text-[10px] text-blue-500">{deptEntries[0]?.[1].total || 0} á»©ng viÃªn</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 text-center">
                        <p className="text-[9px] font-semibold text-emerald-400 uppercase">PhÃ²ng tuyá»ƒn Ä‘Æ°á»£c nhiá»u nháº¥t</p>
                        <p className="text-sm font-extrabold text-emerald-700 mt-1">
                          {deptEntries.sort((a, b) => b[1].hired - a[1].hired)[0]?.[0] || "â€”"}
                        </p>
                        <p className="text-[10px] text-emerald-500">{deptEntries[0]?.[1].hired || 0} Ä‘Ã£ tuyá»ƒn</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 2: SPREADSHEET TABLE VIEW */}
          {activeTab === "table_view" && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Sheets Subtabs */}
                <div className="flex bg-slate-200/50 p-1 rounded-xl gap-1 w-fit border border-slate-200">
                  {[
                    { id: "tong_hop", label: "Tá»•ng Há»£p" },
                    { id: "vong_1", label: "VÃ²ng 1" },
                    { id: "vong_2", label: "VÃ²ng 2" },
                    { id: "thu_viec", label: "Thá»­ Viá»‡c" }
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
                      placeholder="TÃ¬m theo tÃªn, SÄT, vá»‹ trÃ­..."
                      className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                    />
                  </div>
                  <button 
                    onClick={fetchCandidates}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    Táº£i láº¡i
                  </button>
                  <button 
                    onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 shadow"
                  >
                    <Plus size={14} /> ThÃªm á»©ng viÃªn
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
                              <p className="text-slate-400 italic">Äang táº£i báº£ng dá»¯ liá»‡u...</p>
                            </div>
                          </td>
                        </tr>
                      ) : getFilteredTableCandidates(tableSubTab).length === 0 ? (
                        <tr>
                          <td colSpan={getColumnsForTab(tableSubTab).length} className="py-10 text-center text-slate-400 italic">
                            KhÃ´ng tÃ¬m tháº¥y á»©ng viÃªn nÃ o phÃ¹ há»£p
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
                                  const displayRes = val || "Chá» Ä‘Ã¡nh giÃ¡";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <select
                                        value={displayRes}
                                        onChange={(e) => handleDropdownChange(candidate.id, col.type!, e.target.value)}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border-none cursor-pointer outline-none ${
                                          displayRes === "Äáº T"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : displayRes === "LOáº I"
                                            ? "bg-[#FEF3C7] text-[#92400E]"
                                            : displayRes === "TC PV"
                                            ? "bg-rose-600 text-white font-bold"
                                            : "bg-slate-100 text-slate-600"
                                        }`}
                                      >
                                        <option value="Chá» Ä‘Ã¡nh giÃ¡">Chá» Ä‘Ã¡nh giÃ¡</option>
                                        <option value="Äáº T">Äáº T</option>
                                        <option value="LOáº I">LOáº I</option>
                                        <option value="TC PV">TC PV</option>
                                      </select>
                                    </td>
                                  );
                                }

                                if (col.type === "probation_result") {
                                  const displayRes = val || "Chá» nháº­n viá»‡c";
                                  return (
                                    <td key={col.key} className="px-3 py-2 border border-slate-100 text-center">
                                      <select
                                        value={displayRes}
                                        onChange={(e) => handleDropdownChange(candidate.id, "probation_result", e.target.value)}
                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border-none cursor-pointer outline-none ${
                                          displayRes === "Äáº T"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : displayRes === "TC"
                                            ? "bg-rose-600 text-white font-bold"
                                            : "bg-slate-100 text-slate-600"
                                        }`}
                                      >
                                        <option value="Chá» nháº­n viá»‡c">Chá» nháº­n viá»‡c</option>
                                        <option value="Äáº T">Äáº T</option>
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
                    <FileText size={16} /> MÃ´ táº£ cÃ´ng viá»‡c (JD)
                  </label>
                  <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    rows={12}
                    placeholder="DÃ¡n ná»™i dung Job Description vÃ o Ä‘Ã¢yâ€¦&#10;VÃ­ dá»¥: Vá»‹ trÃ­ Trá»£ lÃ½ GiÃ¡m Ä‘á»‘c, tá»‘t nghiá»‡p Cao Ä‘áº³ng/Äáº¡i há»c chuyÃªn ngÃ nh XÃ¢y dá»±ng cáº§u Ä‘Æ°á»ng, kinh nghiá»‡m 2 nÄƒm..."
                    className="w-full resize-none text-xs bg-white/50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-400/20 text-slate-700 placeholder:text-slate-400 shadow-sm"
                  />
                </div>

                {/* Settings */}
                <div className="glass rounded-2xl p-6 space-y-4 flex flex-col justify-between border border-slate-200/40">
                  <div className="space-y-4">
                    <p className="font-heading font-bold text-[#005BAC] text-xs uppercase tracking-wider">âš™ï¸ Cáº¥u hÃ¬nh tuyá»ƒn dá»¥ng</p>
                    
                    {/* Candidate Source */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Nguá»“n á»©ng viÃªn</label>
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
                      {processing ? <Loader2 size={16} className="animate-spin" /> : "ðŸš€"}
                      {processing ? `Äang phÃ¢n tÃ­ch ${progress.done}/${progress.total}...` : "Báº¯t Ä‘áº§u cháº¥m Ä‘iá»ƒm"}
                    </button>
                    {results.length > 0 && (
                      <>
                        <button
                          onClick={saveAllToDb}
                          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95 shadow"
                        >
                          <Database size={14} /> LÆ°u táº¥t cáº£ vÃ o Database (Supabase)
                        </button>
                        <button
                          onClick={submitAll}
                          className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold py-2 rounded-xl transition-all active:scale-95 shadow-sm"
                        >
                          <Send size={14} /> Ghi táº¥t cáº£ vÃ o Google Sheets
                        </button>
                        <button
                          onClick={reset}
                          className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-xs font-semibold py-2 rounded-xl transition-colors"
                        >
                          <RotateCcw size={13} /> LÃ m láº¡i
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
                  <p className="font-heading font-bold text-[#005BAC] text-sm">KÃ©o tháº£ hoáº·c click Ä‘á»ƒ táº£i lÃªn CV</p>
                  <p className="text-slate-400 text-xs mt-1">Há»— trá»£ cÃ¡c Ä‘á»‹nh dáº¡ng: PDF, DOCX, DOC, PNG, JPG, TXT Â· Nhiá»u tá»‡p tin cÃ¹ng lÃºc</p>
                </div>
              )}

              {/* File List */}
              {files.length > 0 && results.length === 0 && (
                <div className="glass rounded-2xl p-5 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-heading font-bold text-[#005BAC] text-xs uppercase tracking-wider">{files.length} tá»‡p Ä‘Ã£ chá»n</p>
                    <button onClick={() => setFiles([])} className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors">XÃ³a táº¥t cáº£</button>
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
                    <span>Äang tiáº¿n hÃ nh cháº¥m Ä‘iá»ƒm báº±ng AI...</span>
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
                      Káº¿t quáº£ Ä‘Ã¡nh giÃ¡ â€“ {results.length} á»©ng viÃªn
                      {" "}Â· <span className="text-emerald-600">{passCount} PASS</span>
                      {" "}Â· <span className="text-rose-500">{results.length - passCount} FAIL</span>
                    </h2>
                    <button onClick={() => { setResults([]); }} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 font-semibold">
                      <RotateCcw size={12} /> Cháº¥m láº¡i
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
                  <p className="text-xs font-semibold italic">Táº£i lÃªn tá»‡p CV cá»§a á»©ng viÃªn vÃ  dÃ¡n JD cÃ´ng viá»‡c á»Ÿ trÃªn Ä‘á»ƒ báº¯t Ä‘áº§u cháº¥m Ä‘iá»ƒm tá»± Ä‘á»™ng.</p>
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
                    Cáº­p nháº­t cáº¥u hÃ¬nh thÃ nh cÃ´ng!
                  </div>
                </div>
              )}

              {/* Setup Configuration Form */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
                  <Key size={18} className="text-[#005BAC]" /> Cáº¥u hÃ¬nh báº£o máº­t & Káº¿t ná»‘i
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
                    <p className="text-[10px] text-slate-400 font-normal mt-1">KhoÃ¡ báº£o máº­t API dÃ¹ng Ä‘á»ƒ thá»±c hiá»‡n cháº¥m Ä‘iá»ƒm vÃ  trÃ­ch xuáº¥t dá»¯ liá»‡u CV báº±ng AI.</p>
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
                    <p className="text-[10px] text-slate-400 font-normal mt-1">ÄÆ°á»ng dáº«n Webhook Ä‘Æ°á»£c sinh ra sau khi Deploy Apps Script Ä‘á»ƒ ghi dá»¯ liá»‡u thá»i gian thá»±c.</p>
                  </div>

                  {/* ChatGPT Model */}
                  <div className="space-y-1">
                    <label className="text-slate-500">ChatGPT Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer text-xs font-semibold text-slate-600 bg-white"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Nhanh & Tá»‘i Æ°u chi phÃ­)</option>
                      <option value="gpt-4o">gpt-4o (Äá»™ chÃ­nh xÃ¡c cao hÆ¡n)</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all shadow"
                    >
                      LÆ°u cáº¥u hÃ¬nh há»‡ thá»‘ng
                    </button>
                  </div>
                </form>
              </div>

              {/* System Info */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-4">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Info size={18} className="text-[#005BAC]" /> ThÃ´ng tin ná»n táº£ng
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-slate-600">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">PhiÃªn báº£n</p>
                    <p className="text-[#005BAC] font-bold">HRA Platform v2.5</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">PhÃ²ng ban káº¿t ná»‘i</p>
                    <p className="text-emerald-600 font-bold">Tuyá»ƒn dá»¥ng & HCNS</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">CÆ¡ sá»Ÿ dá»¯ liá»‡u chÃ­nh</p>
                    <p className="text-blue-600 font-bold">Supabase PostgreSQL</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">MÃ´i trÆ°á»ng</p>
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
              <h3 className="font-heading font-bold text-sm text-slate-800">ThÃªm á»©ng viÃªn má»›i</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCandidate} className="space-y-4 font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">TÃªn á»©ng viÃªn</label>
                <input
                  type="text"
                  required
                  placeholder="VÃ­ dá»¥: Nguyá»…n VÄƒn A..."
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Vá»‹ trÃ­ á»©ng tuyá»ƒn</label>
                <input
                  type="text"
                  placeholder="VÃ­ dá»¥: Ká»¹ sÆ° xÃ¢y dá»±ng..."
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
                  <label className="text-slate-500">Sá»‘ Ä‘iá»‡n thoáº¡i</label>
                  <input
                    type="text"
                    placeholder="SÄT á»©ng viÃªn..."
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Nguá»“n á»©ng viÃªn</label>
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
                  Há»§y
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl"
                >
                  ThÃªm má»›i
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

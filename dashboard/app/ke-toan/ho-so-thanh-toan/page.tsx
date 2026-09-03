"use client";

// ============================================================
// Kế toán > Hồ sơ thanh toán
//
// Kéo–thả PDF/ảnh "Phiếu đề nghị thanh toán" -> AI (route
// /api/analyze-payment-dossier, dùng CHUNG ChatGPT sẵn có) bóc 11 trường ->
// hiện BẢNG XEM TRƯỚC cho kế toán soát/sửa -> "Lưu vào hệ thống" ghi xuống bảng
// Supabase public.payment_dossiers (migration 068).
//
// Danh sách bên dưới có 2 chế độ: "Bảng kê" (toàn bộ) và "Tồn đề nghị" (VIEW lọc
// các dòng chưa chuyển tiền). Kế toán sửa tay từng dòng (điền Số tiền chuyển /
// Ngày chuyển / Còn lại...) qua nút sửa, hoặc xoá dòng.
//
// Khoá OpenAI dùng CHUNG localStorage với trang Hành chính
// (openai_api_key_hanh_chinh / openai_model_hanh_chinh) — đã cấu hình sẵn thì
// không phải nhập lại.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { apiFetch } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";
import { normalizeName } from "@/lib/approvers";
import { useConfirmBox } from "@/components/ConfirmDialog";
import {
  UploadCloud,
  Upload,
  Loader2,
  Trash2,
  Save,
  Settings,
  X,
  Pencil,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import {
  fetchDossiers,
  insertDrafts,
  updateDossier,
  deleteDossier,
  draftFromAi,
  formatMoney,
  computeConLai,
  type PaymentDossierRow,
  type PaymentDossierDraft,
  type PaymentDossierAi,
} from "@/lib/paymentDossiers";

const KEY_STORAGE = "openai_api_key_hanh_chinh";
const MODEL_STORAGE = "openai_model_hanh_chinh";
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc,.txt";

// Cột hiển thị của bảng danh sách (A→Q). key khớp cột Supabase.
const COLUMNS: { key: keyof PaymentDossierRow; label: string; money?: boolean; wide?: boolean }[] = [
  { key: "stt", label: "STT" },
  { key: "ngay_nhap", label: "Ngày nhập" },
  { key: "ngay_de_nghi", label: "Ngày đề nghị" },
  { key: "nguoi_nhan_tien", label: "Người nhận tiền", wide: true },
  { key: "noi_dung_tt", label: "Nội dung thanh toán", wide: true },
  { key: "so_tien_de_nghi", label: "Số tiền đề nghị", money: true },
  { key: "du_an", label: "Dự án", wide: true },
  { key: "nguoi_de_nghi_tt", label: "Người đề nghị TT" },
  { key: "don_vi_cong_tac", label: "Phòng ban" },
  { key: "so_tai_khoan", label: "Số tài khoản" },
  { key: "tai_ngan_hang", label: "Tại Ngân hàng", wide: true },
  { key: "so_tien_chuyen", label: "Số tiền chuyển", money: true },
  { key: "han_thanh_toan", label: "Hạn thanh toán" },
  { key: "ngay_chuyen", label: "Ngày chuyển" },
  { key: "con_lai", label: "Còn lại", money: true },
  { key: "ten_file_pdf", label: "Tên File PDF", wide: true },
  { key: "danh_muc_hs", label: "Danh mục hs kèm theo", wide: true },
  { key: "ghi_chu", label: "Ghi chú", wide: true },
];

// Trường trong bản nháp (xem trước) — nhãn + có phải ô rộng không.
const DRAFT_FIELDS: { key: keyof PaymentDossierDraft; label: string; money?: boolean; wide?: boolean }[] = [
  { key: "ngay_de_nghi", label: "Ngày đề nghị" },
  { key: "nguoi_nhan_tien", label: "Người nhận tiền", wide: true },
  { key: "noi_dung_tt", label: "Nội dung thanh toán", wide: true },
  { key: "so_tien_de_nghi", label: "Số tiền", money: true },
  { key: "du_an", label: "Dự án", wide: true },
  { key: "nguoi_de_nghi_tt", label: "Người đề nghị TT" },
  { key: "don_vi_cong_tac", label: "Phòng ban" },
  { key: "so_tai_khoan", label: "Số tài khoản" },
  { key: "tai_ngan_hang", label: "Tại Ngân hàng", wide: true },
  { key: "so_tien_chuyen", label: "Số tiền chuyển", money: true },
  { key: "han_thanh_toan", label: "Hạn TT" },
  { key: "con_lai", label: "Còn lại", money: true },
  { key: "ten_file_pdf", label: "Tên File", wide: true },
  { key: "danh_muc_hs", label: "Danh mục hs kèm theo", wide: true },
  { key: "ghi_chu", label: "Ghi chú", wide: true },
];

type Notice = { type: "success" | "error" | "info"; text: string } | null;

// "DD/MM/YYYY" -> mốc thời gian để sắp xếp (không đọc được -> 0, xuống đáy).
function vnDateTs(d?: string | null): number {
  const m = String(d || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

export default function PaymentDossierPage() {
  const [rows, setRows] = useState<PaymentDossierRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [view, setView] = useState<"all" | "ton">("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState(""); // "YYYY-MM-DD" — lọc từ ngày (Ngày đề nghị)
  const [toDate, setToDate] = useState("");     // "YYYY-MM-DD" — lọc đến ngày (Ngày đề nghị)
  const [filterDept, setFilterDept] = useState("");    // lọc theo Phòng ban

  const [drafts, setDrafts] = useState<PaymentDossierDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processingText, setProcessingText] = useState("");
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [notice, setNotice] = useState<Notice>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o");

  const [editing, setEditing] = useState<PaymentDossierRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [userEmail, setUserEmail] = useState<string>("");
  // Bản đồ tên (đã chuẩn hoá) -> phòng ban, lấy từ module Danh sách nhân viên
  // (employees_directory). Dùng để điền cột "Phòng ban" theo người đề nghị.
  const [deptByName, setDeptByName] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ask, confirmNode } = useConfirmBox();

  // Toast tự tắt
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    setApiKey(localStorage.getItem(KEY_STORAGE) || "");
    setModel(localStorage.getItem(MODEL_STORAGE) || "gpt-4o");
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user?.email || ""));
    // Nạp danh bạ tên -> phòng ban để suy ra "Phòng ban" theo người đề nghị.
    supabase
      .from("employees_directory")
      .select("name, department")
      .then(({ data }) => {
        const m = new Map<string, string>();
        (data || []).forEach((e: any) => {
          const key = normalizeName(e?.name || "");
          if (key && e?.department) m.set(key, e.department);
        });
        setDeptByName(m);
      });
    loadList("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suy phòng ban từ tên người đề nghị: khớp chính xác trước, không có thì khớp
  // "chứa hai chiều" (tên đầy đủ vs tên ngắn) như quy ước chung trong repo.
  const deptForName = (rawName: string): string => {
    const key = normalizeName(rawName || "");
    if (!key) return "";
    if (deptByName.has(key)) return deptByName.get(key) || "";
    for (const [n, d] of deptByName) {
      if (n.includes(key) || key.includes(n)) return d;
    }
    return "";
  };

  const loadList = async (v: "all" | "ton") => {
    setLoadingList(true);
    try {
      const data = await fetchDossiers(v === "ton");
      setRows(data);
    } catch (err: any) {
      setNotice({ type: "error", text: "Không tải được danh sách: " + (err.message || String(err)) });
    } finally {
      setLoadingList(false);
    }
  };

  const switchView = (v: "all" | "ton") => {
    setView(v);
    loadList(v);
  };

  // ─── Upload + AI ───
  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    const key = localStorage.getItem(KEY_STORAGE) || "";
    const mdl = localStorage.getItem(MODEL_STORAGE) || "gpt-4o";
    if (!key) {
      setShowSettings(true);
      setNotice({ type: "error", text: "Chưa có khoá OpenAI. Vui lòng nhập trong 'Cài đặt AI'." });
      return;
    }

    setUploading(true);
    const newDrafts: PaymentDossierDraft[] = [];
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setProcessingText(`Đang phân tích ${i + 1}/${list.length}: ${file.name}...`);
      try {
        const formData = new FormData();
        formData.append("document_file", file);
        const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "x-openai-model": mdl };
        const res = await apiFetch("/api/analyze-payment-dossier", { method: "POST", headers, body: formData });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || `Lỗi HTTP ${res.status}`);
        const ai = (data.data || {}) as PaymentDossierAi;
        const draft = draftFromAi(ai, file.name, data.validationScores || {});
        // Phòng ban lấy theo DANH SÁCH NHÂN VIÊN (nguồn gốc) dựa trên người đề
        // nghị; tìm được thì ghi đè giá trị AI đoán, không thì giữ giá trị AI.
        const dept = deptForName(draft.nguoi_de_nghi_tt);
        if (dept) draft.don_vi_cong_tac = dept;
        newDrafts.push(draft);
        ok++;
      } catch (err: any) {
        console.error("Analyze error", file.name, err);
        fail++;
        setNotice({ type: "error", text: `Lỗi phân tích "${file.name}": ${err.message || String(err)}` });
      }
    }

    if (newDrafts.length > 0) setDrafts((prev) => [...prev, ...newDrafts]);
    setUploading(false);
    setProcessingText("");
    if (ok > 0) {
      setNotice({
        type: fail > 0 ? "info" : "success",
        text: `Đã trích xuất ${ok} hồ sơ${fail > 0 ? `, ${fail} lỗi` : ""}. Soát lại rồi bấm "Lưu vào hệ thống".`,
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const updateDraft = (idx: number, key: keyof PaymentDossierDraft, value: string) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, [key]: value } : d)));
  };
  const removeDraft = (idx: number) => setDrafts((prev) => prev.filter((_, i) => i !== idx));

  const saveDrafts = async () => {
    if (drafts.length === 0) return;
    setSaving(true);
    try {
      await insertDrafts(drafts, userEmail);
      setNotice({ type: "success", text: `Đã lưu ${drafts.length} hồ sơ vào hệ thống.` });
      setDrafts([]);
      await loadList(view);
    } catch (err: any) {
      setNotice({ type: "error", text: "Lưu thất bại: " + (err.message || String(err)) });
    } finally {
      setSaving(false);
    }
  };

  // ─── Cài đặt AI ───
  const saveSettings = () => {
    localStorage.setItem(KEY_STORAGE, apiKey.trim());
    localStorage.setItem(MODEL_STORAGE, model);
    setShowSettings(false);
    setNotice({ type: "success", text: "Đã lưu cấu hình AI." });
  };

  // ─── Sửa / xoá dòng ───
  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const { id, created_at, updated_at, validation_scores, created_by, so_tien_de_nghi_num, ...patch } = editing;
      await updateDossier(id, patch);
      setNotice({ type: "success", text: "Đã cập nhật hồ sơ." });
      setEditing(null);
      await loadList(view);
    } catch (err: any) {
      setNotice({ type: "error", text: "Cập nhật thất bại: " + (err.message || String(err)) });
    } finally {
      setSavingEdit(false);
    }
  };

  const askDelete = (row: PaymentDossierRow) => {
    ask({
      title: "Xoá hồ sơ thanh toán?",
      message: `Xoá dòng "${row.noi_dung_tt || row.ten_file_pdf || "này"}"? Không thể hoàn tác.`,
      confirmLabel: "Xoá",
      onConfirm: async () => {
        try {
          await deleteDossier(row.id);
          setNotice({ type: "success", text: "Đã xoá hồ sơ." });
          await loadList(view);
        } catch (err: any) {
          setNotice({ type: "error", text: "Xoá thất bại: " + (err.message || String(err)) });
        }
      },
    });
  };

  // ─── Lọc tìm kiếm ───
  // Danh sách phòng ban có trong dữ liệu (cho ô lọc).
  const deptOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.don_vi_cong_tac) s.add(r.don_vi_cong_tac); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "vi"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const toTs = toDate ? new Date(toDate + "T23:59:59").getTime() : null;
    const list = rows.filter((r) => {
      if (q && !COLUMNS.some((c) => String(r[c.key] ?? "").toLowerCase().includes(q))) return false;
      if (fromTs !== null || toTs !== null) {
        const ts = vnDateTs(r.ngay_de_nghi); // theo Ngày đề nghị
        if (!ts) return false; // không có ngày -> loại khi đang lọc theo ngày
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      if (filterDept && (r.don_vi_cong_tac || "") !== filterDept) return false;
      return true;
    });
    // Ngày đề nghị MỚI NHẤT lên trên; hoà thì theo thời điểm nhập (created_at).
    return list.sort((a, b) => {
      const d = vnDateTs(b.ngay_de_nghi) - vnDateTs(a.ngay_de_nghi);
      return d !== 0 ? d : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rows, search, fromDate, toDate, filterDept]);

  const cell = (r: PaymentDossierRow, c: (typeof COLUMNS)[number]) => {
    // "Còn lại" luôn hiển thị theo giá trị DB tính sẵn (Số tiền − Số tiền chuyển).
    if (c.key === "con_lai") {
      if (r.so_tien_de_nghi_num == null) return <span className="text-slate-300">—</span>;
      const n = Number(r.con_lai_num ?? 0);
      return <span className={`font-bold tabular-nums ${n > 0 ? "text-amber-600" : "text-slate-800"}`}>{formatMoney(String(n))}</span>;
    }
    const v = r[c.key];
    if (v == null || v === "") return <span className="text-slate-300">—</span>;
    if (c.money) return <span className="font-bold text-slate-800 tabular-nums">{formatMoney(String(v))}</span>;
    return String(v);
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Hồ sơ thanh toán" />

        <main className="flex-1 p-4 sm:p-8 space-y-6 overflow-y-auto">
          {/* ── UPLOAD ── */}
          <section className="glass rounded-3xl p-5 sm:p-6 shadow-premium">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-heading font-extrabold text-slate-800 text-sm flex items-center gap-2">
                  <UploadCloud size={16} className="text-[#005BAC]" /> Trích xuất hồ sơ bằng AI
                </h2>
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0"
              >
                <Settings size={13} /> Cài đặt AI
              </button>
            </div>

            {/* Hiệu ứng máy quét tài liệu (uploading). Mũi tên idle dùng chung
                upload-nudge-ring / upload-nudge-icon với form Sửa công việc. */}
            <style>{`
              @keyframes kt-scan-doc { 0%{top:4%;opacity:.25} 50%{opacity:1} 100%{top:92%;opacity:.25} }
              @keyframes kt-doc-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,174,239,.0)} 50%{box-shadow:0 0 18px 2px rgba(0,174,239,.45)} }
              .kt-scan-doc{position:absolute;left:-2px;right:-2px;height:3px;pointer-events:none;border-radius:9999px;
                background:linear-gradient(90deg,transparent,#00AEEF 20%,#e0f7ff 50%,#00AEEF 80%,transparent);
                box-shadow:0 0 12px 2px rgba(0,174,239,.8);animation:kt-scan-doc 1.15s ease-in-out infinite}
              .kt-doc{animation:kt-doc-pulse 1.8s ease-in-out infinite}
            `}</style>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`relative overflow-hidden border-2 border-dashed rounded-2xl px-6 py-10 text-center cursor-pointer transition-all ${
                dragActive
                  ? "border-[#005BAC] bg-blue-50/60"
                  : "border-slate-200 hover:border-[#00AEEF] hover:bg-slate-50/60"
              } ${uploading ? "pointer-events-none border-[#00AEEF] bg-blue-50/40" : ""}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
              />

              {uploading ? (
                <div className="relative flex flex-col items-center gap-3">
                  {/* Máy quét tài liệu: trang giấy giả + tia quét chạy dọc */}
                  <div className="relative w-16 h-20 rounded-lg bg-white border-2 border-[#00AEEF]/60 overflow-hidden kt-doc">
                    <div className="p-2.5 space-y-1.5">
                      <div className="h-1.5 rounded-full bg-slate-200 w-3/4" />
                      <div className="h-1.5 rounded-full bg-slate-200 w-full" />
                      <div className="h-1.5 rounded-full bg-slate-200 w-2/3" />
                      <div className="h-1.5 rounded-full bg-slate-200 w-5/6" />
                      <div className="h-1.5 rounded-full bg-slate-200 w-1/2" />
                      <div className="h-1.5 rounded-full bg-slate-200 w-4/5" />
                    </div>
                    {/* Góc khung ngắm kiểu máy quét */}
                    <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#005BAC]" />
                    <span className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#005BAC]" />
                    <span className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#005BAC]" />
                    <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#005BAC]" />
                    {/* Tia quét */}
                    <span className="kt-scan-doc" />
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#005BAC]">
                    <Loader2 size={14} className="animate-spin" />
                    {processingText || "Đang quét & bóc tách hồ sơ..."}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  {/* Mũi tên đồng bộ với form Sửa công việc (upload-nudge) */}
                  <span className="w-11 h-11 rounded-full flex items-center justify-center bg-blue-50 text-blue-600 upload-nudge-ring">
                    <Upload size={20} className="upload-nudge-icon" />
                  </span>
                  <p className="text-xs font-bold text-slate-700 mt-1">Kéo–thả tệp vào đây, hoặc bấm để chọn</p>
                  <p className="text-[10px] text-slate-400">PDF · PNG · JPG · WEBP · DOCX · TXT — chọn được nhiều tệp</p>
                </div>
              )}
            </div>
          </section>

          {/* ── XEM TRƯỚC (bản nháp) ── */}
          {drafts.length > 0 && (
            <section className="glass rounded-3xl p-5 sm:p-6 shadow-premium">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <h2 className="font-heading font-extrabold text-slate-800 text-sm flex items-center gap-2">
                  <ListChecks size={16} className="text-emerald-600" /> Xem trước & soát ({drafts.length})
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDrafts([])}
                    className="px-3 py-2 rounded-xl text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
                  >
                    Xoá hết nháp
                  </button>
                  <button
                    onClick={saveDrafts}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white bg-gradient-to-r from-[#005BAC] to-[#00AEEF] hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Lưu {drafts.length} hồ sơ vào hệ thống
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3 flex items-center gap-1.5">
                <AlertTriangle size={13} /> AI có thể sai. Nhấp vào từng ô để sửa trước khi lưu — đặc biệt cột số tiền.
              </p>

              <div className="overflow-x-auto custom-scrollbar-table">
                <table className="min-w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-bold text-left">
                      <th className="px-2 py-2 border border-slate-200 w-10">#</th>
                      {DRAFT_FIELDS.map((f) => (
                        <th key={f.key} className={`px-2 py-2 border border-slate-200 ${f.wide ? "min-w-[180px]" : "min-w-[110px]"}`}>
                          {f.label}
                        </th>
                      ))}
                      <th className="px-2 py-2 border border-slate-200 w-12">Xoá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30">
                        <td className="px-2 py-1.5 border border-slate-200 text-center text-slate-400 font-bold">{idx + 1}</td>
                        {DRAFT_FIELDS.map((f) => {
                          // "Còn lại" là ô TÍNH SẴN (Số tiền - Số tiền chuyển), không cho gõ tay.
                          if (f.key === "con_lai") {
                            const cl = computeConLai(d.so_tien_de_nghi, d.so_tien_chuyen);
                            return (
                              <td key={f.key} className="px-1 py-1 border border-slate-200 align-top">
                                <div
                                  className={`w-full px-1.5 py-1 text-right font-bold tabular-nums ${
                                    cl.num != null && cl.num > 0 ? "text-amber-600" : "text-slate-400"
                                  }`}
                                  title="Tự tính = Số tiền − Số tiền chuyển"
                                >
                                  {cl.text || "—"}
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={f.key} className="px-1 py-1 border border-slate-200 align-top">
                              <input
                                value={d[f.key] as string}
                                onChange={(e) => updateDraft(idx, f.key, e.target.value)}
                                onBlur={f.money ? (e) => updateDraft(idx, f.key, formatMoney(e.target.value)) : undefined}
                                className={`w-full px-1.5 py-1 rounded-md bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-[#00AEEF] outline-none text-slate-700 ${
                                  f.money ? "text-right font-bold tabular-nums" : ""
                                } ${f.key === "so_tien_de_nghi" && (!d.so_tien_de_nghi || d.so_tien_de_nghi === "N/A") ? "bg-rose-50 border-rose-200" : ""}`}
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 border border-slate-200 text-center">
                          <button onClick={() => removeDraft(idx)} className="text-slate-400 hover:text-rose-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── DANH SÁCH ── */}
          <section className="glass rounded-3xl p-5 sm:p-6 shadow-premium">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => switchView("all")}
                  className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    view === "all" ? "bg-emerald-500 text-white shadow-sm" : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  Bảng kê
                </button>
                <button
                  onClick={() => switchView("ton")}
                  className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    view === "ton" ? "bg-amber-500 text-white shadow-sm" : "text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  Tồn đề nghị
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap flex-1 justify-end min-w-[200px]">
                {/* Lọc theo khoảng Ngày đề nghị: từ ngày -> đến ngày */}
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="font-bold">Từ</span>
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => setFromDate(e.target.value)}
                    title="Từ ngày (Ngày đề nghị)"
                    className="px-2 py-2 rounded-xl bg-slate-100/70 focus:bg-white border border-slate-200/60 outline-none text-slate-700"
                  />
                  <span className="font-bold">đến</span>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(e) => setToDate(e.target.value)}
                    title="Đến ngày (Ngày đề nghị)"
                    className="px-2 py-2 rounded-xl bg-slate-100/70 focus:bg-white border border-slate-200/60 outline-none text-slate-700"
                  />
                </div>
                {/* Lọc theo phòng ban */}
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  title="Lọc theo phòng ban"
                  className="px-2.5 py-2 rounded-xl bg-slate-100/70 focus:bg-white border border-slate-200/60 outline-none text-[11px] text-slate-700 max-w-[170px]"
                >
                  <option value="">Tất cả phòng ban</option>
                  {deptOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {(fromDate || toDate || filterDept) && (
                  <button
                    onClick={() => { setFromDate(""); setToDate(""); setFilterDept(""); }}
                    className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all shrink-0"
                    title="Xoá lọc"
                  >
                    <X size={13} /> Xoá lọc
                  </button>
                )}
                <div className="relative flex-1 max-w-xs">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm nội dung, dự án, người nhận..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-100/70 focus:bg-white border border-slate-200/60 outline-none text-[11px] text-slate-700"
                  />
                </div>
                <button
                  onClick={() => loadList(view)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0"
                >
                  <RefreshCw size={13} /> Tải lại
                </button>
              </div>
            </div>

            {loadingList ? (
              <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 size={22} className="animate-spin" /> <span className="text-xs font-bold">Đang tải...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs font-semibold">
                {view === "ton" ? "Không còn hồ sơ tồn đề nghị." : "Chưa có hồ sơ nào. Tải tệp lên để bắt đầu."}
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar-table border border-slate-200/70 rounded-xl">
                <table className="min-w-full text-[11px] border-collapse">
                  <thead className="sticky top-0">
                    <tr className="bg-[#005BAC] text-white font-bold text-left">
                      {COLUMNS.map((c) => (
                        <th key={c.key} className={`px-2.5 py-2.5 border-b border-r border-blue-400/40 whitespace-nowrap ${c.wide ? "min-w-[160px]" : ""}`}>
                          {c.label}
                        </th>
                      ))}
                      <th className="px-2.5 py-2.5 border-b border-blue-400/40 whitespace-nowrap sticky right-0 bg-[#005BAC]">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((r, idx) => (
                      <tr key={r.id} className="hover:bg-blue-50/30 bg-white transition-colors">
                        {COLUMNS.map((c) => (
                          <td
                            key={c.key}
                            className={`px-2.5 py-2 border-r border-slate-100 text-slate-600 align-top ${
                              c.wide ? "max-w-[240px]" : "whitespace-nowrap"
                            } ${c.money ? "text-right" : ""}`}
                          >
                            {c.key === "stt" ? <span className="font-bold text-slate-500">{idx + 1}</span> : cell(r, c)}
                          </td>
                        ))}
                        <td className="px-2 py-2 whitespace-nowrap sticky right-0 bg-white">
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              onClick={() => setEditing(r)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 transition-all"
                              title="Sửa"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => askDelete(r)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                              title="Xoá"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>

      {/* ── Toast ── */}
      {notice && (
        <div
          className={`fixed bottom-6 right-6 z-[80] max-w-sm px-4 py-3 rounded-2xl shadow-premium text-xs font-bold flex items-start gap-2 animate-in slide-in-from-bottom-2 ${
            notice.type === "success"
              ? "bg-emerald-600 text-white"
              : notice.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-slate-800 text-white"
          }`}
        >
          {notice.type === "success" ? <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
          <span className="leading-snug">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Modal cài đặt AI ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[85] flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-premium w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <Settings size={16} className="text-[#005BAC]" /> Cài đặt AI (OpenAI)
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">OpenAI API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2.5 rounded-xl bg-slate-100/70 focus:bg-white border border-slate-200 outline-none text-xs text-slate-700 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-100/70 focus:bg-white border border-slate-200 outline-none text-xs text-slate-700"
              >
                <option value="gpt-4o">gpt-4o (đọc tốt PDF scan / ảnh)</option>
                <option value="gpt-4o-mini">gpt-4o-mini (nhanh, rẻ)</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Hồ sơ scan/ảnh nên dùng gpt-4o để đọc chính xác số tiền.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 rounded-xl text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200">
                Huỷ
              </button>
              <button onClick={saveSettings} className="px-4 py-2 rounded-xl text-[11px] font-bold text-white bg-[#005BAC] hover:bg-blue-700">
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal sửa dòng ── */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[85] flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-premium w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-extrabold text-slate-800 text-sm flex items-center gap-2">
                <Pencil size={15} className="text-[#005BAC]" /> Sửa hồ sơ thanh toán
              </h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COLUMNS.map((c) => {
                // STT tự đánh theo thứ tự danh sách -> không sửa tay trong modal.
                if (c.key === "stt") return null;
                // "Còn lại" tính sẵn = Số tiền − Số tiền chuyển, không cho sửa tay.
                if (c.key === "con_lai") {
                  const cl = computeConLai(editing.so_tien_de_nghi ?? "", editing.so_tien_chuyen ?? "");
                  return (
                    <div key={c.key}>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        {c.label} <span className="text-slate-400 font-normal">(tự tính)</span>
                      </label>
                      <div className={`w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs text-right font-bold tabular-nums ${cl.num != null && cl.num > 0 ? "text-amber-600" : "text-slate-500"}`}>
                        {cl.text || "—"}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={c.key} className={c.wide ? "sm:col-span-2" : ""}>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">{c.label}</label>
                    <input
                      value={(editing[c.key] as any) ?? ""}
                      onChange={(e) => setEditing({ ...editing, [c.key]: e.target.value } as PaymentDossierRow)}
                      onBlur={c.money ? (e) => setEditing({ ...editing, [c.key]: formatMoney(e.target.value) } as PaymentDossierRow) : undefined}
                      className={`w-full px-3 py-2 rounded-xl bg-slate-100/70 focus:bg-white border border-slate-200 outline-none text-xs text-slate-700 ${
                        c.money ? "text-right font-bold tabular-nums" : ""
                      }`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-5">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200">
                Huỷ
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60"
              >
                {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmNode}
    </div>
  );
}

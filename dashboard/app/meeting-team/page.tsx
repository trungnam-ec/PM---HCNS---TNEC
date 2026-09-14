"use client";

import { apiFetch } from "@/lib/apiClient";
import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { emailFieldMatches } from "@/lib/emailMatch";
import { fetchTenantConfig } from "@/lib/tenantConfig";
import { isResignedRow } from "@/lib/resigned";
import { DialogProvider, useDialog } from "@/components/DialogProvider";
import MeetingRecorder, { type RecordedSegment } from "@/components/MeetingRecorder";
import VoiceSampleManager from "@/components/VoiceSampleManager";
import {
  ANALYSIS_MODELS,
  DEFAULT_ANALYSIS_MODEL,
  MAX_KNOWN_SPEAKERS,
  MAX_TRANSCRIBE_BYTES,
  MEETINGS_BUCKET,
  formatTs,
} from "@/lib/meetingModels";
import {
  Mic,
  Calendar,
  User,
  Clock,
  UploadCloud,
  FileAudio,
  Trash2,
  Plus,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Briefcase,
  Search,
  ChevronRight,
  Info,
  Archive,
  Brain,
  FileDown,
  FileCheck,
  FileEdit,
  Play,
  Sparkles,
  Users,
  Volume2,
  Eraser,
  X,
  Check,
} from "lucide-react";

const DEFAULT_DISTRIBUTION = "P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS.";

// Đọc response an toàn: khi server bị timeout/quá tải (Vercel trả text
// "A server error has occurred..." thay vì JSON), báo lỗi tiếng Việt dễ hiểu
// thay vì crash "Unexpected token 'A' ... is not valid JSON".
async function readJsonSafe(res: Response, context: string): Promise<any> {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    if (res.status === 504 || res.status === 502 || raw.toLowerCase().includes("timeout") || raw.startsWith("A server error")) {
      throw new Error(`${context}: Máy chủ xử lý quá thời gian cho phép (timeout). Đoạn ghi âm có thể quá dài — hãy cắt nhỏ dưới 20 phút mỗi đoạn rồi thử lại.`);
    }
    throw new Error(`${context}: Máy chủ trả về phản hồi không hợp lệ (HTTP ${res.status}). Vui lòng thử lại sau ít phút.`);
  }
}

type AudioSegment = { path: string; offsetSec: number; durationSec: number };
type TranscriptSegment = { speaker: string; start: number; end: number; text: string };

interface Meeting {
  id: string;
  created_at: string;
  title: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  location: string;
  chairperson: string;
  secretary: string;
  attendees: string[];
  project_name: string;
  package_name: string;
  audio_url: string;
  transcript_raw: string;
  transcript_clean: string;
  summary: string;
  action_items: ActionItem[];
  document_url: string;
  status: "draft" | "confirmed";
  distribution: string;
  // ── migration 076 ──
  audio_paths?: string[];
  audio_segments?: AudioSegment[];
  recording_started_at?: string | null;
  transcript_segments?: TranscriptSegment[];
  speaker_map?: Record<string, string>;
  audio_deleted_at?: string | null;
  audio_deleted_by?: string | null;
  ai_model?: string | null;
}

interface ActionItem {
  stt: number | string;
  content: string;
  assignee: string;
  coop: string;
  deadline: string;
  is_header?: boolean;
  /** Giây thứ mấy của cuộc họp — bấm vào là tua đúng đoạn ghi âm để kiểm chứng. */
  ts?: number | null;
}

// Trang phải tách làm 2 component: hàm ngoài bọc <DialogProvider>, hàm trong gọi
// useDialog(). Component KHÔNG dùng được context do chính nó tạo ra.
export default function MeetingTeamPage() {
  return (
    <DialogProvider>
      <MeetingTeamContent />
    </DialogProvider>
  );
}

function MeetingTeamContent() {
  const dialog = useDialog();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [activeModule, setActiveModule] = useState<"archive" | "ai_center">("archive");
  const [archiveFilter, setArchiveFilter] = useState<"all" | "draft" | "confirmed">("all");

  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<"list" | "detail">("list");
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  // Khoá lưu trong localStorage tách khỏi ô đang gõ, để có nút xác nhận rõ ràng
  // thay vì lưu lén sau mỗi ký tự — người dùng không có cách nào biết đã lưu chưa.
  const [savedKey, setSavedKey] = useState("");
  const [analysisModel, setAnalysisModel] = useState<string>(DEFAULT_ANALYSIS_MODEL);
  const [isExporting, setIsExporting] = useState(false);

  // ─── Trung tâm xử lý AI ───
  const [inputMode, setInputMode] = useState<"record" | "upload">("record");
  const [chairperson, setChairperson] = useState("");
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>([]);
  const [chairSearch, setChairSearch] = useState("");
  const [showChairDropdown, setShowChairDropdown] = useState(false);
  const chairPickerRef = useRef<HTMLDivElement>(null);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [showAttendeeDropdown, setShowAttendeeDropdown] = useState(false);
  const attendeePickerRef = useRef<HTMLDivElement>(null);
  const [showVoiceManager, setShowVoiceManager] = useState(false);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [processingStep, setProcessingStep] = useState<"idle" | "stt" | "ai" | "done">("idle");
  const [processingLog, setProcessingLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Khoá chạy trùng: React StrictMode ở dev gọi callback 2 lần, mà pipeline này
  // đốt tiền API thật.
  const pipelineLockRef = useRef(false);

  // ─── Màn Review ───
  const [reviewTab, setReviewTab] = useState<"transcript" | "summary" | "tasks">("tasks");
  const [editableTitle, setEditableTitle] = useState("");
  const [editableDate, setEditableDate] = useState("");
  const [editableStartTime, setEditableStartTime] = useState("");
  const [editableEndTime, setEditableEndTime] = useState("");
  const [editableLocation, setEditableLocation] = useState("");
  const [editableChairperson, setEditableChairperson] = useState("");
  const [editableSecretary, setEditableSecretary] = useState("");
  const [editableAttendees, setEditableAttendees] = useState<string[]>([]);
  const [editableAttendeeInput, setEditableAttendeeInput] = useState("");
  const [editableProject, setEditableProject] = useState("");
  const [editablePackage, setEditablePackage] = useState("");
  const [editableDistribution, setEditableDistribution] = useState("");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [editableSummary, setEditableSummary] = useState("");
  const [editableActionItems, setEditableActionItems] = useState<ActionItem[]>([]);
  const [speakerMapDraft, setSpeakerMapDraft] = useState<Record<string, string>>({});
  const [openSpeakerLabel, setOpenSpeakerLabel] = useState<string | null>(null);
  const [speakerSearch, setSpeakerSearch] = useState("");
  const speakerPickerRef = useRef<HTMLDivElement>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isDeletingAudio, setIsDeletingAudio] = useState(false);

  // Trình phát: tự chọn đúng đoạn chứa mốc ts rồi tua tới giây cần nghe
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playerSrc, setPlayerSrc] = useState("");
  const [playerLabel, setPlayerLabel] = useState("");
  const pendingSeekRef = useRef<number | null>(null);

  useEffect(() => {
    fetchMeetings();
    fetchEmployees();
    fetchUserSession();
    const stored = localStorage.getItem("openai_api_key_hanh_chinh");
    if (stored) { setOpenaiKey(stored); setSavedKey(stored); }
    const savedModel = localStorage.getItem("meeting_analysis_model");
    if (savedModel) setAnalysisModel(savedModel);
  }, []);

  const fetchMeetings = async () => {
    try {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      setMeetings(data || []);
    } catch (err) {
      console.error("Error fetching meetings:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      // Danh sách để chọn "Nhân viên tham dự" -> chịu công tắc ẩn nhân sự đã nghỉ.
      // (Chỗ tra danh tính người đăng nhập bên dưới thì KHÔNG lọc, lọc là mất tên.)
      const cfg = await fetchTenantConfig();
      const { data, error } = await supabase
        .from("employees_directory")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = cfg.hide_resigned_in_pickers ? (data || []).filter(e => !isResignedRow(e)) : (data || []);
      setEmployees(rows);
    } catch (err) {
      console.error("Error fetching employees:", err);
    }
  };

  const fetchUserSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const email = session.user.email || "";
        const { data: empRows } = await supabase
          .from("employees_directory")
          .select("name, email")
          .ilike("email", `%${email}%`);
        const empData = (empRows || []).find((r) => emailFieldMatches(r.email, email));
        setCurrentUser({
          email,
          name: empData?.name || session.user.user_metadata?.full_name || "Nhân sự",
        });
      }
    } catch (err) {
      console.error("Error fetching user session:", err);
    }
  };

  // Immediate download helper (CORS-friendly download bypass)
  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      window.open(url, "_blank");
    }
  };

  // Bấm ra ngoài thì đóng danh sách gợi ý người dự (cùng lối với ô chọn người đi
  // ở form công tác).
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (attendeePickerRef.current && !attendeePickerRef.current.contains(e.target as Node)) {
        setShowAttendeeDropdown(false);
      }
      if (chairPickerRef.current && !chairPickerRef.current.contains(e.target as Node)) {
        setShowChairDropdown(false);
      }
      if (speakerPickerRef.current && !speakerPickerRef.current.contains(e.target as Node)) {
        setOpenSpeakerLabel(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const log = useCallback((line: string) => setProcessingLog(prev => [...prev, line]), []);

  /** Lưu khoá OpenAI vào máy (localStorage) khi người dùng bấm xác nhận. */
  const saveOpenAiKey = () => {
    localStorage.setItem("openai_api_key_hanh_chinh", openaiKey);
    setSavedKey(openaiKey);
  };

  /** Hai chữ cái đầu để làm ảnh tròn — dùng cột avatar nếu hồ sơ đã có. */
  const initialsOf = (emp: any) =>
    emp.avatar || (emp.name || "").split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  // ════════════════════════════════════════════════════════════
  // PIPELINE DÙNG CHUNG CHO CẢ HAI ĐƯỜNG VÀO
  // (ghi âm trực tiếp và tải file lên chỉ khác nhau ở khâu lấy đoạn ghi âm)
  // ════════════════════════════════════════════════════════════
  const runPipeline = useCallback(async (opts: {
    startedAt: string | null;
    segs: AudioSegment[];
  }) => {
    if (pipelineLockRef.current) return;
    pipelineLockRef.current = true;

    const { startedAt, segs } = opts;
    // Người dự đã chọn = danh sách tên ĐÓNG cho AI; không có thì AI được phép ghi
    // theo bộ phận chứ tuyệt đối không bịa tên.
    const rosterRows = employees.filter(e => selectedAttendeeIds.includes(e.id));
    const rosterNames = Array.from(new Set([chairperson, ...rosterRows.map(r => r.name)].filter(Boolean)));
    // Mẫu giọng: ưu tiên người chủ trì, tối đa 4 (giới hạn của OpenAI)
    const knownSpeakerIds = rosterRows
      .filter(r => r.voice_sample_path)
      .sort((a, b) => (a.name === chairperson ? -1 : b.name === chairperson ? 1 : 0))
      .slice(0, MAX_KNOWN_SPEAKERS)
      .map(r => r.id);

    let draftId = "";
    try {
      setProcessingStep("stt");
      log(`[1/4] Khởi tạo biên bản nháp cho ${segs.length} đoạn ghi âm…`);

      const { data: { publicUrl } } = supabase.storage.from(MEETINGS_BUCKET).getPublicUrl(segs[0].path);
      const today = new Date().toISOString().split("T")[0];

      const { data: draftMeeting, error: dbError } = await supabase
        .from("meetings")
        .insert([{
          title: `Biên bản họp ngày ${today} (đang xử lý)`,
          meeting_date: today,
          chairperson,
          attendees: rosterNames,
          audio_url: publicUrl,
          audio_paths: segs.map(s => s.path),
          audio_segments: segs,
          recording_started_at: startedAt,
          status: "draft",
          distribution: DEFAULT_DISTRIBUTION,
        }])
        .select()
        .single();

      if (dbError) throw dbError;
      draftId = draftMeeting.id;

      log(`[2/4] Bắt đầu gỡ băng ${segs.length} đoạn${knownSpeakerIds.length > 0 ? ` (có ${knownSpeakerIds.length} mẫu giọng)` : ""}…`);

      // ─── Gỡ băng TUẦN TỰ từng đoạn ───
      // Server nối thêm vào transcript nên đoạn nào xong là chắc chắn giữ được,
      // tiến trình chết giữa chừng không mất phần đã gỡ.
      let okCount = 0;
      const warnings: string[] = [];

      for (let i = 0; i < segs.length; i++) {
        log(`  🎙️ Đang gỡ băng đoạn ${i + 1}/${segs.length} (từ phút ${Math.round(segs[i].offsetSec / 60)})…`);
        const { data: { session } } = await supabase.auth.getSession();
        const res = await apiFetch("/api/meeting/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
            "x-supabase-auth": session?.access_token || "",
          },
          body: JSON.stringify({
            meetingId: draftId,
            audioPath: segs[i].path,
            offsetSec: segs[i].offsetSec,
            knownSpeakerIds,
          }),
        });

        const data = await readJsonSafe(res, `Lỗi gỡ băng đoạn ${i + 1}`);
        if (!res.ok) {
          // Một đoạn hỏng KHÔNG được làm sập cả cuộc họp: ghi nhận rồi chạy tiếp.
          warnings.push(`Đoạn ${i + 1}: ${data.error || "lỗi không xác định"}`);
          log(`  ❌ Đoạn ${i + 1} lỗi: ${data.error || "không xác định"} — bỏ qua, chạy tiếp.`);
          continue;
        }

        okCount++;
        const names = (data.known_speakers_used || []).length;
        log(`  ✅ Đoạn ${i + 1}: ${(data.text || "").length} ký tự · ${(data.speakers || []).length} người nói${names > 0 ? ` (nhận ra ${names} tên thật)` : ""}`);
        if (data.is_hallucination) {
          warnings.push(`Đoạn ${i + 1}: ${data.hallucination_warning}`);
          log(`  ⚠️ Đoạn ${i + 1}: ${data.hallucination_warning}`);
        }
      }

      if (okCount === 0) {
        throw new Error(`Không đoạn nào gỡ băng được.\n\n${warnings.join("\n")}\n\nBiên bản nháp VẪN được giữ lại — vào "Hồ sơ biên bản họp" và bấm "Gỡ băng lại" sau khi khắc phục.`);
      }

      log(`[3/4] Gỡ băng xong ${okCount}/${segs.length} đoạn. Bắt đầu dựng biên bản bằng ${analysisModel}…`);
      setProcessingStep("ai");

      const { data: { session: processSession } } = await supabase.auth.getSession();
      const processRes = await apiFetch("/api/meeting/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
          "x-supabase-auth": processSession?.access_token || "",
          "x-openai-model": analysisModel,
        },
        body: JSON.stringify({ meetingId: draftId, roster: rosterNames }),
      });

      const processData = await readJsonSafe(processRes, "Lỗi AI dựng biên bản");
      if (!processRes.ok) throw new Error(processData.error || "Gặp lỗi khi AI dựng biên bản.");

      const modeLabel = processData.timeline_mode === "clock"
        ? "có giờ đồng hồ thật"
        : processData.timeline_mode === "relative"
          ? "theo phút của file (không có giờ đồng hồ)"
          : "không có mốc thời gian";
      log(`[4/4] Dựng biên bản xong — timeline ${modeLabel}. Đang mở màn hình soát…`);
      setProcessingStep("done");

      const { data: finalMeeting } = await supabase
        .from("meetings").select("*").eq("id", draftId).single();

      fetchMeetings();

      if (warnings.length > 0) {
        await dialog.alert(
          `Biên bản đã dựng xong nhưng có ${warnings.length} cảnh báo:\n\n${warnings.join("\n")}\n\nToàn bộ nội dung vẫn được giữ — hãy đọc soát kỹ các đoạn này.`,
          { title: "Dựng xong, có cảnh báo", tone: "warning" },
        );
      }

      if (finalMeeting) {
        handleViewDetail(finalMeeting);
        setAudioFiles([]);
        setProcessingStep("idle");
        setProcessingLog([]);
      }
    } catch (err: any) {
      console.error(err);
      log(`❌ LỖI: ${err.message}`);
      setProcessingStep("idle");
      // KHÔNG xoá biên bản nháp khi lỗi: phần đã gỡ băng là thứ đắt nhất trong
      // cả quy trình, mất là phải họp lại.
      await dialog.alert(
        `${err.message}${draftId ? "\n\nBản nháp đã được giữ lại trong \"Hồ sơ biên bản họp\" cùng phần gỡ băng đã xong." : ""}`,
        { title: "Quy trình xử lý gặp lỗi", tone: "danger" },
      );
    } finally {
      setIsUploading(false);
      pipelineLockRef.current = false;
    }
  }, [analysisModel, chairperson, dialog, employees, log, openaiKey, selectedAttendeeIds]);

  /** Kiểm tra các điều kiện bắt buộc trước khi cho bắt đầu. */
  const checkReady = useCallback(async (): Promise<boolean> => {
    if (!openaiKey) {
      await dialog.alert("Vui lòng nhập OpenAI API Key ở góc trên bên phải trước khi xử lý.", { title: "Thiếu API Key", tone: "warning" });
      return false;
    }
    if (!chairperson) {
      await dialog.alert("Vui lòng chọn người chủ trì cuộc họp.", { title: "Thiếu thông tin", tone: "warning" });
      return false;
    }
    return true;
  }, [chairperson, dialog, openaiKey]);

  // ─── ĐƯỜNG VÀO A: ghi âm trực tiếp ───
  const handleRecorderFinish = useCallback((result: { startedAt: string; segments: RecordedSegment[] }) => {
    const segs: AudioSegment[] = result.segments.map(s => ({
      path: s.path,
      offsetSec: s.offsetSec,
      durationSec: s.durationSec,
    }));
    setProcessingLog([`Đã thu ${segs.length} đoạn, tổng ${formatTs(segs.reduce((sum, s) => sum + s.durationSec, 0))}.`]);
    void runPipeline({ startedAt: result.startedAt, segs });
  }, [runPipeline]);

  // ─── ĐƯỜNG VÀO B: tải file có sẵn ───
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("audio/") || f.type.startsWith("video/webm"));
      if (newFiles.length === 0) {
        await dialog.alert("Vui lòng chọn file âm thanh (MP3, WAV, M4A, WEBM).", { title: "Sai định dạng", tone: "warning" });
        return;
      }
      setAudioFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAudioFiles(prev => [...prev, ...Array.from(e.target.files!)]);
      e.target.value = "";
    }
  };

  /** Đo thời lượng file bằng thẻ <audio> — file tải lên không kèm sẵn thông tin này. */
  const measureDuration = (file: File): Promise<number> => new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number) => { URL.revokeObjectURL(url); resolve(value); };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });

  const handleUploadAndProcess = async () => {
    if (audioFiles.length === 0) {
      await dialog.alert("Vui lòng kéo thả hoặc chọn file ghi âm cuộc họp.", { title: "Chưa có file", tone: "warning" });
      return;
    }
    if (!(await checkReady())) return;

    const oversized = audioFiles.filter(f => f.size > MAX_TRANSCRIBE_BYTES);
    if (oversized.length > 0) {
      const list = oversized.map(f => `• ${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)`).join("\n");
      await dialog.alert(
        `${oversized.length} file vượt trần 25MB của API gỡ băng:\n\n${list}\n\nOpenAI chặn cứng mức này cho mọi model, không có cách lách. Hãy cắt nhỏ file (dưới 20 phút mỗi đoạn) rồi tải lại.`,
        { title: "File quá nặng", tone: "danger" },
      );
      return;
    }

    setIsUploading(true);
    setProcessingLog([`Bắt đầu tải ${audioFiles.length} file lên kho lưu trữ…`]);

    try {
      const sessionId = String(Date.now());
      const segs: AudioSegment[] = [];
      let offset = 0;
      let durationUnknown = false;

      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
        const filePath = `recordings/${sessionId}/${String(i).padStart(3, "0")}_${cleanName}`;
        log(`  📁 Đang tải ${i + 1}/${audioFiles.length}: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)…`);

        const { error: uploadError } = await supabase.storage
          .from(MEETINGS_BUCKET)
          .upload(filePath, file, { cacheControl: "3600", upsert: true });
        if (uploadError) throw new Error(`Lỗi upload file ${file.name}: ${uploadError.message}`);

        const durationSec = Math.round(await measureDuration(file));
        if (durationSec === 0 && audioFiles.length > 1) {
          durationUnknown = true;
          log(`  ⚠️ Không đo được thời lượng ${file.name} — mốc thời gian của các đoạn sau có thể lệch.`);
        }
        segs.push({ path: filePath, offsetSec: offset, durationSec });
        offset += durationSec;
      }

      if (durationUnknown) {
        const go = await dialog.confirm(
          "Có file không đo được thời lượng, nên mốc trích dẫn của các đoạn sau có thể lệch. Vẫn tiếp tục?",
          { title: "Mốc thời gian có thể lệch", tone: "warning", confirmText: "Tiếp tục" },
        );
        if (!go) { setIsUploading(false); return; }
      }

      // startedAt = null: file tải lên KHÔNG biết giờ đồng hồ thật, timeline chỉ
      // là khoảng thời gian tính từ đầu file.
      await runPipeline({ startedAt: null, segs });
    } catch (err: any) {
      console.error(err);
      log(`❌ LỖI: ${err.message}`);
      setIsUploading(false);
      await dialog.alert(err.message || "Lỗi khi tải file lên.", { title: "Lỗi tải file", tone: "danger" });
    }
  };

  // ════════════════════════════════════════════════════════════
  // MÀN REVIEW
  // ════════════════════════════════════════════════════════════
  const handleViewDetail = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setEditableTitle(meeting.title || "");
    setEditableDate(meeting.meeting_date || "");
    setEditableStartTime(meeting.start_time || "");
    setEditableEndTime(meeting.end_time || "");
    setEditableLocation(meeting.location || "");
    setEditableChairperson(meeting.chairperson || "");
    setEditableSecretary(meeting.secretary || "");
    setEditableAttendees(meeting.attendees || []);
    setEditableProject(meeting.project_name || "");
    setEditablePackage(meeting.package_name || "");
    setEditableDistribution(meeting.distribution || DEFAULT_DISTRIBUTION);
    setEditableTranscript(meeting.transcript_clean || meeting.transcript_raw || "");
    setEditableSummary(meeting.summary || "");
    setEditableActionItems(meeting.action_items || []);
    setSpeakerMapDraft(meeting.speaker_map || {});
    setPlayerSrc("");
    setPlayerLabel("");
    setReviewTab("tasks");
    setCurrentView("detail");
  };

  const refreshSelected = async (id: string) => {
    const { data } = await supabase.from("meetings").select("*").eq("id", id).single();
    fetchMeetings();
    if (data) handleViewDetail(data);
  };

  /** Các trường soạn thảo được, gom một chỗ vì có 3 nút cùng lưu. */
  const editablePayload = () => ({
    title: editableTitle,
    meeting_date: editableDate,
    start_time: editableStartTime,
    end_time: editableEndTime,
    location: editableLocation,
    chairperson: editableChairperson,
    secretary: editableSecretary,
    attendees: editableAttendees,
    project_name: editableProject,
    package_name: editablePackage,
    distribution: editableDistribution,
    transcript_clean: editableTranscript,
    summary: editableSummary,
    action_items: editableActionItems,
    speaker_map: speakerMapDraft,
  });

  const handleSaveDraftEdits = async () => {
    if (!selectedMeeting) return;
    try {
      const { data, error } = await supabase
        .from("meetings")
        .update(editablePayload())
        .eq("id", selectedMeeting.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Không lưu được (bị chặn bởi quyền truy cập CSDL). Vui lòng đăng nhập lại.");
      }
      await dialog.alert("Đã lưu chỉnh sửa bản nháp.", { title: "Đã lưu", tone: "success" });
      fetchMeetings();
    } catch (err: any) {
      await dialog.alert("Lỗi khi lưu bản nháp: " + err.message, { title: "Lỗi", tone: "danger" });
    }
  };

  // Chạy lại bước AI dựng biên bản từ transcript đã có (không tốn tiền gỡ băng lần nữa)
  const handleReAnalyze = async () => {
    if (!selectedMeeting) return;
    if (!selectedMeeting.transcript_raw?.trim()) {
      await dialog.alert("Biên bản này chưa có bản gỡ băng. Hãy gỡ băng trước.", { title: "Chưa có transcript", tone: "warning" });
      return;
    }
    if (!openaiKey) {
      await dialog.alert("Vui lòng nhập OpenAI API Key trước khi phân tích.", { title: "Thiếu API Key", tone: "warning" });
      return;
    }
    const ok = await dialog.confirm(
      "Chạy lại AI dựng biên bản từ bản gỡ băng hiện có? Metadata, tóm tắt và bảng phân công sẽ bị điền lại — các chỉnh sửa tay chưa lưu sẽ mất.",
      { title: "Phân tích lại", tone: "warning", confirmText: "Phân tích lại" },
    );
    if (!ok) return;

    setIsReprocessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await apiFetch("/api/meeting/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
          "x-supabase-auth": session?.access_token || "",
          "x-openai-model": analysisModel,
        },
        body: JSON.stringify({
          meetingId: selectedMeeting.id,
          roster: editableAttendees,
        }),
      });
      const data = await readJsonSafe(res, "Lỗi AI phân tích biên bản");
      if (!res.ok) throw new Error(data.error || "Gặp lỗi khi AI dựng biên bản.");

      await refreshSelected(selectedMeeting.id);
      await dialog.alert("AI đã dựng lại nội dung biên bản.", { title: "Xong", tone: "success" });
    } catch (err: any) {
      await dialog.alert("Lỗi phân tích lại: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setIsReprocessing(false);
    }
  };

  const handleExportWordDocx = async () => {
    if (!selectedMeeting) return;
    try {
      setIsExporting(true);
      if (selectedMeeting.status === "draft") {
        await supabase.from("meetings").update(editablePayload()).eq("id", selectedMeeting.id);
      }

      const { data: { session: docxSession } } = await supabase.auth.getSession();
      const docxRes = await apiFetch("/api/meeting/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-supabase-auth": docxSession?.access_token || "" },
        body: JSON.stringify({ meetingId: selectedMeeting.id }),
      });
      const docxData = await readJsonSafe(docxRes, "Lỗi xuất file Word");
      if (!docxRes.ok) throw new Error(docxData.error || "Không thể biên dịch file Word.");

      const documentUrl = docxData.documentUrl;
      setSelectedMeeting({ ...selectedMeeting, document_url: documentUrl });
      await downloadFile(documentUrl, `Bien_Ban_Hop_${editableTitle.replace(/[^a-zA-Z0-9]/g, "_")}.docx`);

      await dialog.alert("Đã xuất và tải xuống file Word biên bản họp.", { title: "Xuất Word xong", tone: "success" });
      fetchMeetings();
      await maybeOfferAudioCleanup();
    } catch (err: any) {
      await dialog.alert("Lỗi khi xuất file Word: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmMeeting = async () => {
    if (!selectedMeeting) return;
    const ok = await dialog.confirm(
      "Khoá biên bản họp? Hệ thống sẽ xuất file Word và tải về. Sau khi khoá sẽ không sửa được nội dung nữa.",
      { title: "Khoá biên bản", tone: "warning", confirmText: "Khoá biên bản" },
    );
    if (!ok) return;

    try {
      setLoading(true);
      const { error: saveError } = await supabase
        .from("meetings")
        .update({ ...editablePayload(), status: "confirmed" })
        .eq("id", selectedMeeting.id);
      if (saveError) throw saveError;

      const { data: { session: docxSession } } = await supabase.auth.getSession();
      const docxRes = await apiFetch("/api/meeting/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-supabase-auth": docxSession?.access_token || "" },
        body: JSON.stringify({ meetingId: selectedMeeting.id }),
      });
      const docxData = await readJsonSafe(docxRes, "Lỗi xuất file Word");
      if (!docxRes.ok) throw new Error(docxData.error || "Không thể biên dịch file Word.");
      const documentUrl = docxData.documentUrl;

      await downloadFile(documentUrl, `Bien_Ban_Hop_${editableTitle.replace(/[^a-zA-Z0-9]/g, "_")}.docx`);
      await dialog.alert("Biên bản đã được khoá và tải file Word về máy.", { title: "Đã khoá biên bản", tone: "success" });

      const { data: updatedMeeting } = await supabase.from("meetings").select("*").eq("id", selectedMeeting.id).single();
      if (updatedMeeting) {
        setSelectedMeeting(updatedMeeting);
        fetchMeetings();
        await maybeOfferAudioCleanup(updatedMeeting);
      }
    } catch (err: any) {
      await dialog.alert("Lỗi khi khoá biên bản: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  /** Nhắc dọn file ghi âm ngay sau khi đã có biên bản Word. */
  const maybeOfferAudioCleanup = async (meeting?: Meeting) => {
    const target = meeting || selectedMeeting;
    if (!target) return;
    if (target.status !== "confirmed") return;
    if (target.audio_deleted_at) return;
    const paths = target.audio_paths || [];
    if (paths.length === 0) return;

    const ok = await dialog.confirm(
      `Biên bản đã chốt và đã có file Word. Xoá ${paths.length} file ghi âm để tiết kiệm dung lượng?\n\nBản gỡ băng và biên bản Word vẫn giữ nguyên. File ghi âm xoá rồi KHÔNG khôi phục được.`,
      { title: "Dọn file ghi âm", tone: "warning", confirmText: "Xoá file ghi âm", cancelText: "Giữ lại" },
    );
    if (ok) await handleDeleteAudio(target.id);
  };

  const handleDeleteAudio = async (meetingId: string) => {
    setIsDeletingAudio(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await apiFetch("/api/meeting/delete-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-supabase-auth": session?.access_token || "" },
        body: JSON.stringify({ meetingId }),
      });
      const data = await readJsonSafe(res, "Lỗi dọn file ghi âm");
      if (!res.ok) throw new Error(data.error || "Không dọn được file ghi âm.");
      await dialog.alert(data.message, { title: "Đã dọn ghi âm", tone: "success" });
      await refreshSelected(meetingId);
    } catch (err: any) {
      await dialog.alert(err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setIsDeletingAudio(false);
    }
  };

  const handleDeleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await dialog.confirm(
      "Xoá hẳn cuộc họp này cùng toàn bộ file ghi âm và biên bản Word? Thao tác không khôi phục được.",
      { title: "Xoá biên bản họp", tone: "danger", confirmText: "Xoá" },
    );
    if (!ok) return;

    try {
      setLoading(true);
      const target = meetings.find(m => m.id === id);

      const paths = [...(target?.audio_paths || [])];
      if (paths.length === 0 && target?.audio_url) {
        const audioUrl = target.audio_url.split("?")[0];
        paths.push(audioUrl.substring(audioUrl.indexOf("/meetings/") + "/meetings/".length));
      }
      if (target?.document_url) {
        // document_url carries a ?v= cache-buster — strip it to get the storage path
        const docUrl = target.document_url.split("?")[0];
        paths.push(docUrl.substring(docUrl.indexOf("/meetings/") + "/meetings/".length));
      }
      if (paths.length > 0) await supabase.storage.from(MEETINGS_BUCKET).remove(paths);

      const { error } = await supabase.from("meetings").delete().eq("id", id);
      if (error) throw error;

      await dialog.alert("Đã xoá biên bản họp.", { title: "Đã xoá", tone: "success" });
      fetchMeetings();
      if (selectedMeeting?.id === id) {
        setCurrentView("list");
        setSelectedMeeting(null);
      }
    } catch (err: any) {
      await dialog.alert("Lỗi khi xoá cuộc họp: " + err.message, { title: "Lỗi", tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  // ─── Bảng phân công ───
  const handleAddActionItem = () => {
    const numericStts = editableActionItems.map(item => Number(item.stt)).filter(num => !isNaN(num));
    const nextStt = numericStts.length > 0 ? Math.max(...numericStts) + 1 : 1;
    setEditableActionItems([...editableActionItems, { stt: nextStt, content: "", assignee: "", coop: "", deadline: "", ts: null }]);
  };

  const handleUpdateActionItemField = (index: number, field: keyof ActionItem, value: any) => {
    const updated = [...editableActionItems];
    updated[index] = { ...updated[index], [field]: value };
    setEditableActionItems(updated);
  };

  const handleDeleteActionItem = (index: number) => {
    setEditableActionItems(editableActionItems.filter((_, idx) => idx !== index));
  };

  const addAttendeeTag = (name: string) => {
    const trimmed = name.trim();
    if (trimmed && !editableAttendees.includes(trimmed)) {
      setEditableAttendees([...editableAttendees, trimmed]);
    }
    setEditableAttendeeInput("");
  };

  const removeAttendeeTag = (name: string) => {
    setEditableAttendees(editableAttendees.filter(a => a !== name));
  };

  // ─── Tua ghi âm theo mốc trích dẫn ───
  // Cuộc họp gồm nhiều file: phải tìm đúng file chứa giây thứ N rồi mới tua.
  const seekToTs = async (ts: number) => {
    if (!selectedMeeting) return;
    const segs: AudioSegment[] = Array.isArray(selectedMeeting.audio_segments) ? selectedMeeting.audio_segments : [];
    if (segs.length === 0 || selectedMeeting.audio_deleted_at) {
      await dialog.alert("Biên bản này không còn file ghi âm để nghe lại.", { title: "Không có ghi âm", tone: "warning" });
      return;
    }
    const seg = segs.find(s => ts >= s.offsetSec && ts < s.offsetSec + (s.durationSec || Number.MAX_SAFE_INTEGER))
      || segs[segs.length - 1];
    const { data: { publicUrl } } = supabase.storage.from(MEETINGS_BUCKET).getPublicUrl(seg.path);
    const within = Math.max(0, ts - seg.offsetSec);
    pendingSeekRef.current = within;
    setPlayerLabel(`Đoạn ${segs.indexOf(seg) + 1} · mốc ${formatTs(ts)}`);

    if (playerSrc === publicUrl && audioRef.current) {
      audioRef.current.currentTime = within;
      void audioRef.current.play();
      pendingSeekRef.current = null;
    } else {
      setPlayerSrc(publicUrl);
    }
  };

  const onPlayerLoaded = () => {
    if (pendingSeekRef.current !== null && audioRef.current) {
      audioRef.current.currentTime = pendingSeekRef.current;
      void audioRef.current.play();
      pendingSeekRef.current = null;
    }
  };

  // ─── Gợi ý tên cho ô gán người nói ───
  const speakerQuery = speakerSearch.trim().toLowerCase();
  const speakerOptions = employees.filter(e => {
    if (!speakerQuery) return true;
    return (e.name || "").toLowerCase().includes(speakerQuery)
      || (e.department || "").toLowerCase().includes(speakerQuery)
      || (e.role || "").toLowerCase().includes(speakerQuery);
  });

  /** Gán một nhãn máy ("Speaker 1") sang tên người thật. */
  const assignSpeaker = (label: string, name: string) => {
    setSpeakerMapDraft(prev => ({ ...prev, [label]: name }));
    setOpenSpeakerLabel(null);
    setSpeakerSearch("");
  };

  // ─── Danh sách người nói chưa gán tên ───
  const speakerLabels = Array.from(new Set(
    (selectedMeeting?.transcript_segments || []).map(s => s.speaker)
  )).filter(Boolean);

  const filteredMeetings = meetings.filter(m => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      m.title.toLowerCase().includes(searchLower) ||
      (m.project_name || "").toLowerCase().includes(searchLower) ||
      m.meeting_date.includes(searchLower);
    if (!matchesSearch) return false;
    if (archiveFilter === "draft") return m.status === "draft";
    if (archiveFilter === "confirmed") return m.status === "confirmed";
    return true;
  });

  const voiceSampleCount = employees.filter(e => e.voice_sample_path).length;

  // ─── Ô chọn người chủ trì (chọn MỘT người) ───
  const selectedChair = employees.find(e => e.name === chairperson);
  const chairQuery = chairSearch.trim().toLowerCase();
  const chairOptions = employees.filter(e => {
    if (!chairQuery) return true;
    return (e.name || "").toLowerCase().includes(chairQuery)
      || (e.department || "").toLowerCase().includes(chairQuery)
      || (e.role || "").toLowerCase().includes(chairQuery);
  });

  // ─── Ô chọn người dự ───
  const selectedAttendees = employees.filter(e => selectedAttendeeIds.includes(e.id));
  const voiceReadyCount = selectedAttendees.filter(e => e.voice_sample_path).length;
  const attendeeQuery = attendeeSearch.trim().toLowerCase();
  const attendeeOptions = employees.filter(e => {
    if (selectedAttendeeIds.includes(e.id)) return false;
    if (!attendeeQuery) return true;
    return (e.name || "").toLowerCase().includes(attendeeQuery)
      || (e.department || "").toLowerCase().includes(attendeeQuery)
      || (e.role || "").toLowerCase().includes(attendeeQuery);
  });
  const isBusy = isUploading || processingStep !== "idle";

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Biên bản họp (Meeting Team)" />

        <main className="flex-1 p-6 space-y-6 overflow-y-auto">

          {/* ─── Thanh đầu trang ─── */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#005BAC] to-[#00AEEF] flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                  <Mic size={18} />
                </div>
                <h2 className="text-lg font-heading font-bold text-slate-900">Meeting Team</h2>
              </div>

              <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/60 mt-1">
                <button
                  onClick={() => { setActiveModule("archive"); setCurrentView("list"); }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                    activeModule === "archive" ? "bg-white text-[#005BAC] shadow-sm font-extrabold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Archive size={14} /> Hồ sơ biên bản họp
                </button>
                <button
                  onClick={() => { setActiveModule("ai_center"); setCurrentView("list"); }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                    activeModule === "ai_center" ? "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] text-white shadow-md shadow-blue-500/15 font-extrabold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Sparkles size={14} /> Trung tâm Xử lý AI
                </button>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">Model dựng biên bản</span>
                <select
                  value={analysisModel}
                  onChange={(e) => { setAnalysisModel(e.target.value); localStorage.setItem("meeting_analysis_model", e.target.value); }}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 font-semibold"
                >
                  {ANALYSIS_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">OpenAI API Key</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="password"
                    placeholder="Nhập mã OpenAI API Key..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveOpenAiKey(); }}
                    className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 w-56 placeholder-slate-400 shadow-inner"
                  />
                  {/* Nút xác nhận: khoá chỉ được ghi vào máy khi bấm, và dấu tích
                      xanh cho biết ô đang gõ đã trùng với khoá đã lưu hay chưa. */}
                  <button
                    type="button"
                    onClick={saveOpenAiKey}
                    disabled={!openaiKey || openaiKey === savedKey}
                    title={openaiKey && openaiKey === savedKey ? "Khoá đã được lưu trên máy này" : "Lưu khoá vào máy này"}
                    className={`shrink-0 h-[30px] px-2.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 flex items-center gap-1 ${
                      openaiKey && openaiKey === savedKey
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default"
                        : openaiKey
                          ? "bg-[#005BAC] hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 cursor-pointer"
                          : "bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed"
                    }`}
                  >
                    <Check size={13} strokeWidth={3} />
                    {openaiKey && openaiKey === savedKey ? "Đã lưu" : "Lưu"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ══════════ DANH SÁCH ══════════ */}
          {currentView === "list" && (
            <>
              {/* ─── MODULE 1: HỒ SƠ ─── */}
              {activeModule === "archive" && (
                <div className="space-y-4">
                  <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button onClick={() => setArchiveFilter("all")} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${archiveFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                        Tất cả ({meetings.length})
                      </button>
                      <button onClick={() => setArchiveFilter("draft")} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${archiveFilter === "draft" ? "bg-amber-50 text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                        Bản nháp ({meetings.filter(m => m.status === "draft").length})
                      </button>
                      <button onClick={() => setArchiveFilter("confirmed")} className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${archiveFilter === "confirmed" ? "bg-emerald-50 text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                        Đã xác nhận ({meetings.filter(m => m.status === "confirmed").length})
                      </button>
                    </div>

                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="text"
                        placeholder="Tìm kiếm tiêu đề, dự án, ngày họp..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs placeholder-slate-400"
                      />
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 space-y-4">
                      <Loader2 className="animate-spin text-blue-600" size={32} />
                      <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Đang tải hồ sơ biên bản...</span>
                    </div>
                  ) : filteredMeetings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-slate-200/80 shadow-sm text-center">
                      <Archive className="text-slate-300 mb-3" size={44} />
                      <h3 className="text-slate-700 font-bold text-sm">Chưa có biên bản họp nào</h3>
                      <p className="text-slate-500 text-xs mt-1 max-w-sm">Chuyển sang tab &quot;Trung tâm Xử lý AI&quot; để ghi âm cuộc họp hoặc tải file ghi âm lên.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredMeetings.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => handleViewDetail(m)}
                          className="bg-white hover:border-blue-300 border border-slate-200/80 rounded-2xl p-5 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between group"
                        >
                          <div className="space-y-3">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase ${
                                  m.status === "confirmed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}>
                                  {m.status === "confirmed" ? "Đã khóa biên bản" : "Bản nháp"}
                                </span>
                                {m.audio_deleted_at && (
                                  <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">Đã dọn ghi âm</span>
                                )}
                              </div>

                              <button
                                onClick={(e) => handleDeleteMeeting(m.id, e)}
                                className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                title="Xoá biên bản"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <h3 className="font-heading font-bold text-slate-800 group-hover:text-[#005BAC] transition-colors text-base line-clamp-2 leading-snug">
                              {m.title}
                            </h3>

                            {m.project_name && (
                              <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 text-[10px] text-slate-600 px-2 py-0.5 rounded font-mono font-bold">
                                <Briefcase size={10} /> {m.project_name}
                              </span>
                            )}

                            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 pt-2 border-t border-slate-100 text-slate-600 text-xs">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={13} className="text-slate-400" />
                                <span>{m.meeting_date}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock size={13} className="text-slate-400" />
                                <span>{m.start_time || m.end_time ? `${m.start_time || "—"} - ${m.end_time || "—"}` : "Chưa có giờ"}</span>
                              </div>
                              <div className="flex items-center gap-1.5 col-span-2 truncate">
                                <User size={13} className="text-slate-400 flex-shrink-0" />
                                <span className="truncate">Chủ trì: {m.chairperson || "Chưa chọn"}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                            {m.document_url ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadFile(m.document_url, `Bien_Ban_Hop_${m.title.replace(/[^a-zA-Z0-9]/g, "_")}.docx`);
                                }}
                                className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 hover:underline"
                              >
                                <FileDown size={13} /> Tải file Word (.docx)
                              </button>
                            ) : (
                              <span className="text-[11px] text-amber-600 italic font-medium">Chưa xuất file Word</span>
                            )}

                            <div className="flex items-center text-[#005BAC] text-xs font-bold group-hover:translate-x-1 transition-transform">
                              <span>Xem hồ sơ</span>
                              <ChevronRight size={14} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── MODULE 2: TRUNG TÂM XỬ LÝ AI ─── */}
              {activeModule === "ai_center" && (
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* ── Cột trái: thiết lập cuộc họp ── */}
                    <div className="md:col-span-1 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Người chủ trì (bắt buộc)</label>
                        {/* Chọn MỘT người, có ô tìm kiếm: danh bạ hơn 120 người, cuộn
                            tay trong thẻ <select> quá chậm. */}
                        <div className="relative" ref={chairPickerRef}>
                          {chairperson ? (
                            <div className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2.5">
                              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {selectedChair ? initialsOf(selectedChair) : chairperson.slice(0, 2).toUpperCase()}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-bold text-slate-700 truncate">{chairperson}</span>
                                {selectedChair && (
                                  <span className="block text-[10px] text-slate-400 font-semibold truncate">
                                    {selectedChair.department || "Chưa xếp phòng"}{selectedChair.role ? ` • ${selectedChair.role}` : ""}
                                  </span>
                                )}
                              </span>
                              {selectedChair?.voice_sample_path && <Volume2 size={12} className="text-emerald-600 shrink-0" />}
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => { setChairperson(""); setChairSearch(""); setShowChairDropdown(true); }}
                                title="Chọn người khác"
                                className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40">
                              <Search size={12} className="text-slate-400 shrink-0" />
                              <input
                                type="text"
                                value={chairSearch}
                                disabled={isBusy}
                                onChange={(e) => { setChairSearch(e.target.value); setShowChairDropdown(true); }}
                                onFocus={() => setShowChairDropdown(true)}
                                placeholder="Tìm tên hoặc phòng ban..."
                                className="flex-1 min-w-0 py-1 outline-none text-xs font-semibold placeholder:font-normal bg-transparent text-slate-800"
                              />
                            </div>
                          )}

                          {showChairDropdown && !chairperson && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-64 overflow-y-auto animate-in fade-in duration-150">
                              {chairOptions.length === 0 ? (
                                <p className="text-center text-slate-400 text-[11px] italic py-4">Không tìm thấy nhân sự phù hợp.</p>
                              ) : (
                                chairOptions.map(emp => (
                                  <button
                                    key={`ai_chair_${emp.id}`}
                                    type="button"
                                    onClick={() => { setChairperson(emp.name); setChairSearch(""); setShowChairDropdown(false); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                                  >
                                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                      {initialsOf(emp)}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-xs font-bold text-slate-700 truncate">{emp.name}</span>
                                      <span className="block text-[10px] text-slate-400 font-semibold truncate">
                                        {emp.department || "Chưa xếp phòng"}{emp.role ? ` • ${emp.role}` : ""}
                                      </span>
                                    </span>
                                    {emp.voice_sample_path && <Volume2 size={12} className="text-emerald-600 shrink-0" />}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Người dự</label>
                          <button
                            type="button"
                            onClick={() => setShowVoiceManager(true)}
                            className="text-[11px] font-bold text-[#005BAC] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Volume2 size={12} /> Mẫu giọng ({voiceSampleCount})
                          </button>
                        </div>
                        {/* Picker chọn nhiều người — dựng theo đúng ô "Họ và tên người
                            đi" ở form công tác: chọn xong hiện thẻ tên, bấm X để bỏ,
                            dropdown không tự đóng để chọn liền tay nhiều người. */}
                        <div className="relative" ref={attendeePickerRef}>
                          <div className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center gap-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40">
                            {selectedAttendees.map(emp => (
                              <span key={`chip_${emp.id}`} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 text-[10px] font-bold">
                                {emp.voice_sample_path && <Volume2 size={9} className="text-emerald-600" />}
                                {emp.name}
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setSelectedAttendeeIds(prev => prev.filter(id => id !== emp.id))}
                                  className="hover:text-rose-500 transition-colors cursor-pointer"
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                            <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                              <Search size={12} className="text-slate-400 shrink-0" />
                              <input
                                type="text"
                                value={attendeeSearch}
                                disabled={isBusy}
                                onChange={(e) => { setAttendeeSearch(e.target.value); setShowAttendeeDropdown(true); }}
                                onFocus={() => setShowAttendeeDropdown(true)}
                                placeholder={selectedAttendeeIds.length > 0 ? "Thêm người nữa..." : "Tìm tên hoặc phòng ban..."}
                                className="flex-1 min-w-0 py-1 outline-none text-xs font-semibold placeholder:font-normal bg-transparent text-slate-800"
                              />
                            </div>
                          </div>

                          {showAttendeeDropdown && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-64 overflow-y-auto animate-in fade-in duration-150">
                              {attendeeOptions.length === 0 ? (
                                <p className="text-center text-slate-400 text-[11px] italic py-4">Không tìm thấy nhân sự phù hợp.</p>
                              ) : (
                                attendeeOptions.map(emp => (
                                  <button
                                    key={`att_${emp.id}`}
                                    type="button"
                                    onClick={() => {
                                      setSelectedAttendeeIds(prev => prev.includes(emp.id) ? prev : [...prev, emp.id]);
                                      setAttendeeSearch("");
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                                  >
                                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                      {initialsOf(emp)}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-xs font-bold text-slate-700 truncate">{emp.name}</span>
                                      <span className="block text-[10px] text-slate-400 font-semibold truncate">
                                        {emp.department || "Chưa xếp phòng"}{emp.role ? ` • ${emp.role}` : ""}
                                      </span>
                                    </span>
                                    {emp.voice_sample_path && <Volume2 size={12} className="text-emerald-600 shrink-0" />}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] font-bold text-slate-400">
                          Đã chọn {selectedAttendeeIds.length} người
                          {voiceReadyCount > 0 ? ` · ${voiceReadyCount} người có mẫu giọng` : ""}.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl text-xs text-slate-600 space-y-2">
                        <h4 className="font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                          <Info size={13} className="text-[#005BAC]" /> Cần biết trước khi chạy
                        </h4>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600 leading-relaxed text-[11px]">
                          <li><b>Ghi âm trong app</b> mới có giờ đồng hồ thật cho timeline. Tải file lên thì timeline chỉ là khoảng thời gian tính từ đầu file.</li>
                          <li>Ghi âm tự cắt mỗi 20 phút và tải lên ngay trong lúc họp, không cần chờ tan họp.</li>
                          <li>Chỗ nào AI không nghe rõ sẽ để trống, KHÔNG điền đại — bạn tự điền ở màn soát.</li>
                          <li>Mỗi đầu việc có nút mốc giờ: bấm là nghe lại đúng đoạn để kiểm chứng.</li>
                        </ul>
                      </div>
                    </div>

                    {/* ── Cột phải: hai đường vào ── */}
                    <div className="md:col-span-2 space-y-4">
                      <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200/60">
                        <button
                          onClick={() => setInputMode("record")}
                          disabled={isBusy}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${inputMode === "record" ? "bg-white text-[#005BAC] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                        >
                          <Mic size={14} /> Ghi âm cuộc họp
                        </button>
                        <button
                          onClick={() => setInputMode("upload")}
                          disabled={isBusy}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${inputMode === "upload" ? "bg-white text-[#005BAC] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                        >
                          <UploadCloud size={14} /> Tải file có sẵn
                        </button>
                      </div>

                      {inputMode === "record" ? (
                        <MeetingRecorder
                          disabled={isBusy || !chairperson || !openaiKey}
                          onFinish={handleRecorderFinish}
                        />
                      ) : (
                        <div className="space-y-3">
                          <div
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onClick={() => { if (!isBusy) fileInputRef.current?.click(); }}
                            className={`border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl p-10 text-center transition-all flex flex-col items-center justify-center space-y-3 group ${
                              isBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-blue-500 hover:bg-blue-50/30"
                            }`}
                          >
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileSelect}
                              accept="audio/*"
                              multiple
                              disabled={isBusy}
                              className="hidden"
                            />
                            <UploadCloud className="text-slate-400 group-hover:text-[#005BAC] group-hover:scale-110 transition-all duration-300" size={44} />

                            {audioFiles.length > 0 ? (
                              <div className="space-y-2 w-full">
                                <p className="text-[#005BAC] text-xs font-bold text-center">
                                  {audioFiles.length} file đã chọn ({(audioFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2)} MB)
                                </p>
                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                  {audioFiles.map((file, idx) => (
                                    <div key={`file_${idx}`} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px]">
                                      <span className="flex items-center gap-1.5 text-slate-700 truncate">
                                        <FileAudio size={13} className={file.size > MAX_TRANSCRIBE_BYTES ? "text-rose-500 flex-shrink-0" : "text-[#005BAC] flex-shrink-0"} />
                                        <span className="truncate">{file.name}</span>
                                        <span className={file.size > MAX_TRANSCRIBE_BYTES ? "text-rose-500 font-bold flex-shrink-0" : "text-slate-400 flex-shrink-0"}>
                                          ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                                        </span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setAudioFiles(prev => prev.filter((_, i) => i !== idx)); }}
                                        className="text-slate-400 hover:text-rose-500 ml-2 flex-shrink-0"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-[10px] text-slate-400 text-center">Bấm để thêm file • Thứ tự file chính là thứ tự cuộc họp</p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-slate-700 text-xs font-bold">Thả file ghi âm vào đây, hoặc bấm để chọn file</p>
                                <p className="text-[11px] text-slate-400">MP3, WAV, M4A, WEBM — mỗi file tối đa 25MB (trần của API gỡ băng)</p>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={handleUploadAndProcess}
                            disabled={isBusy || audioFiles.length === 0}
                            className="w-full bg-gradient-to-r from-[#005BAC] to-[#00AEEF] text-white text-sm font-extrabold py-3.5 rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:brightness-110 transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:brightness-100"
                          >
                            {isBusy ? <><Loader2 size={15} className="animate-spin" /> Đang xử lý…</> : <><Sparkles size={15} /> Phân tích cuộc họp</>}
                          </button>
                        </div>
                      )}

                      {/* ── Nhật ký tiến trình ── */}
                      {processingLog.length > 0 && (
                        <div className="bg-slate-900 rounded-2xl p-4 max-h-60 overflow-y-auto">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">Nhật ký xử lý</p>
                          <div className="space-y-1 font-mono text-[11px] text-slate-200 leading-relaxed">
                            {processingLog.map((line, idx) => (
                              <p key={`log_${idx}`} className="whitespace-pre-wrap">{line}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════ MÀN REVIEW ══════════ */}
          {currentView === "detail" && selectedMeeting && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <button
                  onClick={() => { setCurrentView("list"); setSelectedMeeting(null); }}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors font-bold"
                >
                  <ArrowLeft size={15} /> Quay lại danh sách
                </button>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={handleExportWordDocx}
                    disabled={isExporting}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm active:scale-[0.97]"
                  >
                    {isExporting ? <><Loader2 className="animate-spin" size={14} /> Đang xuất Word...</> : <><FileDown size={15} /> Xuất File Biên Bản Word (.docx)</>}
                  </button>

                  {selectedMeeting.status === "draft" && (
                    <>
                      <button
                        onClick={handleReAnalyze}
                        disabled={isReprocessing}
                        className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 active:scale-[0.97] disabled:opacity-50"
                      >
                        {isReprocessing ? <><Loader2 className="animate-spin" size={14} /> Đang phân tích...</> : <><Brain size={14} /> Phân tích lại bằng AI</>}
                      </button>
                      <button
                        onClick={handleSaveDraftEdits}
                        className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-bold transition-all"
                      >
                        Lưu nháp
                      </button>
                      <button
                        onClick={handleConfirmMeeting}
                        className="px-4 py-2 bg-gradient-to-r from-[#005BAC] to-[#00AEEF] hover:from-blue-700 hover:to-cyan-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-blue-500/15 active:scale-[0.97]"
                      >
                        <FileCheck size={14} /> Khóa biên bản
                      </button>
                    </>
                  )}

                  {selectedMeeting.status === "confirmed" && !selectedMeeting.audio_deleted_at && (selectedMeeting.audio_paths?.length || 0) > 0 && (
                    <button
                      onClick={() => handleDeleteAudio(selectedMeeting.id)}
                      disabled={isDeletingAudio}
                      className="px-4 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-600 hover:text-rose-600 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-[0.97] disabled:opacity-50"
                    >
                      {isDeletingAudio ? <Loader2 className="animate-spin" size={14} /> : <Eraser size={14} />} Dọn file ghi âm
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Cột trái: metadata ── */}
                <div className="lg:col-span-1 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <FileEdit size={14} className="text-[#005BAC]" /> Thông tin cuộc họp
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase border ${
                      selectedMeeting.status === "confirmed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {selectedMeeting.status === "confirmed" ? "Đã khóa" : "Bản nháp"}
                    </span>
                  </div>

                  {selectedMeeting.status === "draft" ? (
                    <div className="space-y-3 text-xs">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Tên cuộc họp</label>
                        <textarea
                          rows={2}
                          value={editableTitle}
                          onChange={(e) => setEditableTitle(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs resize-y"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày họp</label>
                        <input
                          type="date"
                          value={editableDate}
                          onChange={(e) => setEditableDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Giờ bắt đầu</label>
                          <input
                            type="text"
                            placeholder="AI để trống nếu không nghe rõ"
                            value={editableStartTime}
                            onChange={(e) => setEditableStartTime(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs placeholder:text-slate-300"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Giờ kết thúc</label>
                          <input
                            type="text"
                            value={editableEndTime}
                            onChange={(e) => setEditableEndTime(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Địa điểm</label>
                        <input
                          type="text"
                          value={editableLocation}
                          onChange={(e) => setEditableLocation(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Chủ trì</label>
                          <input
                            type="text"
                            value={editableChairperson}
                            onChange={(e) => setEditableChairperson(e.target.value)}
                            list="meeting_people"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Thư ký</label>
                          <input
                            type="text"
                            value={editableSecretary}
                            onChange={(e) => setEditableSecretary(e.target.value)}
                            list="meeting_people"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                      </div>

                      {/* Ô gợi ý dùng <datalist> cho trình duyệt tự lọc: ô search tự lọc
                          bằng React chết khi gõ tiếng Việt có dấu. */}
                      <datalist id="meeting_people">
                        {employees.map(emp => <option key={`dl_${emp.id}`} value={emp.name} />)}
                      </datalist>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Dự án</label>
                          <input
                            type="text"
                            value={editableProject}
                            onChange={(e) => setEditableProject(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Gói thầu</label>
                          <input
                            type="text"
                            value={editablePackage}
                            onChange={(e) => setEditablePackage(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Thành phần tham dự</label>
                        <input
                          type="text"
                          value={editableAttendeeInput}
                          onChange={(e) => setEditableAttendeeInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAttendeeTag(editableAttendeeInput); } }}
                          list="meeting_people"
                          placeholder="Gõ tên rồi bấm Enter..."
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs"
                        />
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {editableAttendees.map(att => (
                            <span key={`review_att_${att}`} className="bg-blue-50 border border-blue-200 text-[#005BAC] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              {att}
                              <button type="button" onClick={() => removeAttendeeTag(att)} className="text-slate-400 hover:text-rose-600">×</button>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Nơi nhận</label>
                        <textarea
                          rows={2}
                          value={editableDistribution}
                          onChange={(e) => setEditableDistribution(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs resize-y"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs text-slate-700">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Tiêu đề cuộc họp</span>
                        <span className="text-sm font-bold text-slate-900">{selectedMeeting.title}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Ngày họp</span>
                          <span>{selectedMeeting.meeting_date}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Thời gian</span>
                          <span>{selectedMeeting.start_time || "—"} - {selectedMeeting.end_time || "—"}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Chủ trì</span>
                        <span className="font-bold text-[#005BAC]">{selectedMeeting.chairperson}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Thành viên tham dự</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedMeeting.attendees?.length
                            ? selectedMeeting.attendees.map(att => (
                                <span key={`det_att_lbl_${att}`} className="bg-slate-100 px-2 py-0.5 rounded text-[10px]">{att}</span>
                              ))
                            : <span className="italic">Không có</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Gán tên người nói ── */}
                  {speakerLabels.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                        <Users size={12} /> Gán tên người nói
                      </span>
                      <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                        Nhãn nào còn là &quot;Speaker N&quot; nghĩa là người đó chưa có mẫu giọng. Điền tên vào đây rồi bấm
                        &quot;Phân tích lại bằng AI&quot; để biên bản gọi đúng tên.
                      </p>
                      {/* Ô tìm kiếm tự dựng chứ không dùng <datalist>: danh sách gợi ý
                          của trình duyệt trôi ra ngoài khung, không theo giao diện chung
                          và không hiện được phòng ban để phân biệt người trùng tên. */}
                      <div ref={speakerPickerRef} className="space-y-2">
                        {speakerLabels.map(label => {
                          const assigned = speakerMapDraft[label] || "";
                          const emp = employees.find(e => e.name === assigned);
                          const editable = selectedMeeting.status === "draft";
                          const isOpen = openSpeakerLabel === label;
                          return (
                            <div key={`spk_${label}`} className="flex items-start gap-2">
                              <span className="mt-2 text-[11px] font-extrabold text-slate-500 bg-slate-100 rounded-lg px-2 py-1 shrink-0 max-w-[88px] truncate" title={label}>
                                {label}
                              </span>

                              <div className="relative flex-1 min-w-0">
                                {assigned ? (
                                  <div className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
                                      {emp ? initialsOf(emp) : assigned.slice(0, 2).toUpperCase()}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-[11px] font-bold text-slate-700 truncate">{assigned}</span>
                                      {emp && (
                                        <span className="block text-[10px] text-slate-400 font-semibold truncate">
                                          {emp.department || "Chưa xếp phòng"}{emp.role ? ` • ${emp.role}` : ""}
                                        </span>
                                      )}
                                    </span>
                                    {editable && (
                                      <button
                                        type="button"
                                        onClick={() => { assignSpeaker(label, ""); setOpenSpeakerLabel(label); }}
                                        title="Gán người khác"
                                        className="text-slate-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-1.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40">
                                    <Search size={11} className="text-slate-400 shrink-0" />
                                    <input
                                      type="text"
                                      value={isOpen ? speakerSearch : ""}
                                      disabled={!editable}
                                      onChange={(e) => { setSpeakerSearch(e.target.value); setOpenSpeakerLabel(label); }}
                                      onFocus={() => { setOpenSpeakerLabel(label); setSpeakerSearch(""); }}
                                      placeholder="Tìm tên người nói…"
                                      className="flex-1 min-w-0 py-0.5 outline-none text-[11px] font-semibold placeholder:font-normal bg-transparent text-slate-800 disabled:opacity-60"
                                    />
                                  </div>
                                )}

                                {isOpen && !assigned && editable && (
                                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-56 overflow-y-auto animate-in fade-in duration-150">
                                    {/* Cho phép ghi theo bộ phận khi không rõ là ai —
                                        đúng luật "không chắc thì đừng nêu tên riêng". */}
                                    {speakerSearch.trim() && !speakerOptions.some(e => e.name === speakerSearch.trim()) && (
                                      <button
                                        type="button"
                                        onClick={() => assignSpeaker(label, speakerSearch.trim())}
                                        className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100"
                                      >
                                        <span className="block text-[11px] font-bold text-[#005BAC] truncate">Dùng nguyên chữ: &quot;{speakerSearch.trim()}&quot;</span>
                                        <span className="block text-[10px] text-slate-400 font-semibold">Khi không rõ là ai, ghi theo bộ phận</span>
                                      </button>
                                    )}
                                    {speakerOptions.length === 0 ? (
                                      <p className="text-center text-slate-400 text-[11px] italic py-4">Không tìm thấy nhân sự phù hợp.</p>
                                    ) : (
                                      speakerOptions.map(opt => (
                                        <button
                                          key={`spk_${label}_${opt.id}`}
                                          type="button"
                                          onClick={() => assignSpeaker(label, opt.name)}
                                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                                        >
                                          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[8px] font-bold flex items-center justify-center shrink-0">
                                            {initialsOf(opt)}
                                          </span>
                                          <span className="flex-1 min-w-0">
                                            <span className="block text-[11px] font-bold text-slate-700 truncate">{opt.name}</span>
                                            <span className="block text-[10px] text-slate-400 font-semibold truncate">
                                              {opt.department || "Chưa xếp phòng"}{opt.role ? ` • ${opt.role}` : ""}
                                            </span>
                                          </span>
                                        </button>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Trình phát ghi âm ── */}
                  <div className="pt-3 border-t border-slate-100 text-xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Ghi âm cuộc họp</span>
                    {selectedMeeting.audio_deleted_at ? (
                      <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                        Đã dọn file ghi âm ngày {new Date(selectedMeeting.audio_deleted_at).toLocaleDateString("vi-VN")}
                        {selectedMeeting.audio_deleted_by ? ` bởi ${selectedMeeting.audio_deleted_by}` : ""}. Bản gỡ băng vẫn còn nguyên.
                      </p>
                    ) : (
                      <>
                        {playerLabel && <p className="text-[11px] font-bold text-[#005BAC]">{playerLabel}</p>}
                        <audio
                          ref={audioRef}
                          controls
                          src={playerSrc || selectedMeeting.audio_url || undefined}
                          onLoadedMetadata={onPlayerLoaded}
                          className="w-full h-8 mt-1 rounded bg-slate-50"
                        />
                        {(selectedMeeting.audio_segments?.length || 0) > 1 && (
                          <p className="text-[10px] font-semibold text-slate-400">
                            Cuộc họp gồm {selectedMeeting.audio_segments!.length} đoạn — bấm nút mốc giờ ở bảng phân công để nghe đúng chỗ.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* ── Cột phải: các tab nội dung ── */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-5">

                    <div className="flex border-b border-slate-200 pb-2">
                      {([["tasks", "Bảng phân công việc"], ["transcript", "Nội dung chi tiết cuộc họp"], ["summary", "Tóm tắt AI"]] as const).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setReviewTab(key)}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                            reviewTab === key ? "bg-blue-50 text-[#005BAC] border border-blue-200" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* TAB 1: BẢNG PHÂN CÔNG */}
                    {reviewTab === "tasks" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Bấm nút mốc giờ để nghe lại đúng đoạn ghi âm của dòng đó.</span>
                          {selectedMeeting.status === "draft" && (
                            <button
                              type="button"
                              onClick={handleAddActionItem}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-slate-200"
                            >
                              <Plus size={13} /> Thêm việc
                            </button>
                          )}
                        </div>

                        {editableActionItems.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                            <AlertCircle className="text-slate-400 mb-2" size={32} />
                            <span className="text-slate-600 text-xs font-bold">Không tìm thấy đầu việc phân công nào.</span>
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-extrabold tracking-wider">
                                  <th className="px-3 py-3 text-center w-12">STT</th>
                                  <th className="px-4 py-3">Nội dung công việc</th>
                                  <th className="px-4 py-3 w-40">Người thực hiện</th>
                                  <th className="px-4 py-3 w-32">Phối hợp</th>
                                  <th className="px-4 py-3 w-32">Thời hạn</th>
                                  <th className="px-2 py-3 w-20 text-center">Mốc</th>
                                  {selectedMeeting.status === "draft" && <th className="px-3 py-3 text-center w-12"></th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {editableActionItems.map((item, index) => {
                                  const isHeader = item.is_header || (typeof item.stt === "string" && isNaN(Number(item.stt)));
                                  return (
                                    <tr key={`item_${index}`} className={isHeader ? "bg-slate-100/80 font-bold border-t border-slate-200" : "hover:bg-slate-50/50 align-top"}>
                                      <td className="px-3 py-2.5 text-center font-bold text-slate-700">{item.stt}</td>
                                      <td className="px-4 py-2.5 text-xs text-slate-800" colSpan={isHeader ? 4 : 1}>
                                        {selectedMeeting.status === "draft" ? (
                                          // <textarea> chứ không phải <input>: nội dung 2–4 câu mà để
                                          // input thì chữ bị cắt cụt, không soát được biên bản.
                                          <textarea
                                            rows={isHeader ? 1 : 3}
                                            value={item.content}
                                            onChange={(e) => handleUpdateActionItemField(index, "content", e.target.value)}
                                            className={`w-full bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2 py-1 focus:outline-none text-slate-800 resize-y leading-relaxed ${isHeader ? "font-extrabold text-[#005BAC]" : ""}`}
                                          />
                                        ) : (
                                          <span className={`block whitespace-pre-wrap ${isHeader ? "font-extrabold text-[#005BAC]" : "text-slate-800"}`}>{item.content}</span>
                                        )}
                                      </td>
                                      {!isHeader && (
                                        <>
                                          <td className="px-4 py-2.5">
                                            {selectedMeeting.status === "draft" ? (
                                              <>
                                                <input
                                                  type="text"
                                                  value={item.assignee}
                                                  list="meeting_assignees"
                                                  onChange={(e) => handleUpdateActionItemField(index, "assignee", e.target.value)}
                                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-blue-500 text-slate-800 text-xs"
                                                />
                                              </>
                                            ) : (
                                              <span className="font-bold text-[#005BAC]">{item.assignee}</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            {selectedMeeting.status === "draft" ? (
                                              <input
                                                type="text"
                                                value={item.coop}
                                                list="meeting_assignees"
                                                onChange={(e) => handleUpdateActionItemField(index, "coop", e.target.value)}
                                                className="w-full bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none text-slate-800"
                                              />
                                            ) : (
                                              <span className="text-slate-500">{item.coop || "-"}</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-2.5">
                                            {selectedMeeting.status === "draft" ? (
                                              <input
                                                type="text"
                                                value={item.deadline}
                                                onChange={(e) => handleUpdateActionItemField(index, "deadline", e.target.value)}
                                                className="w-full bg-transparent border-b border-slate-200 focus:border-blue-500 focus:outline-none text-slate-800 font-mono text-[11px]"
                                              />
                                            ) : (
                                              <span className="text-amber-700 font-bold font-mono">{item.deadline}</span>
                                            )}
                                          </td>
                                        </>
                                      )}
                                      <td className="px-2 py-2.5 text-center">
                                        {typeof item.ts === "number" && !isHeader ? (
                                          <button
                                            type="button"
                                            onClick={() => seekToTs(item.ts as number)}
                                            title="Nghe lại đoạn ghi âm của dòng này"
                                            className="inline-flex items-center gap-1 bg-slate-100 hover:bg-blue-50 hover:text-[#005BAC] text-slate-600 font-mono font-bold text-[10px] px-2 py-1 rounded-lg transition-all cursor-pointer"
                                          >
                                            <Play size={10} /> {formatTs(item.ts)}
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 text-[10px]">—</span>
                                        )}
                                      </td>
                                      {selectedMeeting.status === "draft" && (
                                        <td className="px-3 py-2.5 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteActionItem(index)}
                                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <datalist id="meeting_assignees">
                              {employees.map(emp => <option key={`dla_${emp.id}`} value={emp.name} />)}
                              {["BĐH", "P. QLDA", "P. KHĐT", "P. VTTB", "P. HCNS", "Tất cả"].map(v => (
                                <option key={`dlb_${v}`} value={v} />
                              ))}
                            </datalist>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 2: TRANSCRIPT */}
                    {reviewTab === "transcript" && (
                      <div className="space-y-4">
                        {selectedMeeting.status === "draft" ? (
                          <textarea
                            value={editableTranscript}
                            onChange={(e) => setEditableTranscript(e.target.value)}
                            rows={16}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs font-mono leading-relaxed resize-y"
                          />
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-[440px] overflow-y-auto text-xs font-mono leading-relaxed whitespace-pre-wrap text-slate-800">
                            {selectedMeeting.transcript_clean || selectedMeeting.transcript_raw || "Không có nội dung."}
                          </div>
                        )}

                        {(selectedMeeting.transcript_segments?.length || 0) > 0 && (
                          <details className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <summary className="text-[11px] font-bold text-slate-600 cursor-pointer">
                              Bản gỡ băng gốc theo người nói ({selectedMeeting.transcript_segments!.length} câu)
                            </summary>
                            <div className="mt-3 space-y-1 max-h-80 overflow-y-auto">
                              {selectedMeeting.transcript_segments!.map((seg, idx) => (
                                <div key={`seg_${idx}`} className="flex items-start gap-2 text-[11px] leading-relaxed">
                                  <button
                                    type="button"
                                    onClick={() => seekToTs(seg.start)}
                                    className="font-mono font-bold text-slate-400 hover:text-[#005BAC] shrink-0 cursor-pointer"
                                  >
                                    {formatTs(seg.start)}
                                  </button>
                                  <span className="font-bold text-slate-600 shrink-0">
                                    {speakerMapDraft[seg.speaker] || seg.speaker}:
                                  </span>
                                  <span className="text-slate-700">{seg.text}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}

                    {/* TAB 3: TÓM TẮT */}
                    {reviewTab === "summary" && (
                      <div className="space-y-4">
                        {selectedMeeting.status === "draft" ? (
                          <textarea
                            value={editableSummary}
                            onChange={(e) => setEditableSummary(e.target.value)}
                            rows={14}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 text-xs leading-relaxed resize-y"
                          />
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-[380px] overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
                            {selectedMeeting.summary || "Không có tóm tắt cuộc họp."}
                          </div>
                        )}
                        {selectedMeeting.ai_model && (
                          <p className="text-[10px] font-semibold text-slate-400">Dựng bằng model: {selectedMeeting.ai_model}</p>
                        )}
                      </div>
                    )}

                  </div>
                </div>

              </div>
            </div>
          )}

        </main>
      </div>

      {showVoiceManager && (
        <VoiceSampleManager
          employees={employees.map(e => ({ id: e.id, name: e.name, position: e.role, voice_sample_path: e.voice_sample_path }))}
          onClose={() => setShowVoiceManager(false)}
          onChanged={fetchEmployees}
        />
      )}
    </div>
  );
}

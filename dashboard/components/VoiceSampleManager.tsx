"use client";

// ============================================================
// VoiceSampleManager — ghi/nghe/xoá MẪU GIỌNG của nhân sự.
//
// Mẫu giọng 2–10 giây được truyền kèm khi gỡ băng: có mẫu thì kết quả gọi thẳng
// tên thật ("Nguyễn Văn A: ..."), không có thì ra nhãn "Speaker 1/2/3" và người
// kiểm tra phải gán tay ở màn Review.
//
// Nên ghi cho: người chủ trì + 3 người phát biểu nhiều nhất (OpenAI nhận tối đa
// 4 mẫu mỗi lần gọi).
//
// QUYỀN GHI: cột `voice_sample_path` nằm trên bảng `employees`, mà UPDATE bảng
// này bị khoá sau can_manage_employees_caller() (migration 007). Người không có
// quyền nhân sự sẽ bị RLS trả 0 dòng MÀ KHÔNG BÁO LỖI -> phải .select("id") rồi
// kiểm tra mảng rỗng, nếu không họ tưởng đã lưu.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import {
  MEETINGS_BUCKET,
  VOICE_SAMPLE_MIN_SEC,
  VOICE_SAMPLE_MAX_SEC,
} from "@/lib/meetingModels";
import { prepareVoiceSample } from "@/lib/voiceSamplePrepare";
import { Mic, Square, Play, Trash2, Loader2, CheckCircle2, AlertCircle, X, Upload, Info } from "lucide-react";

export type VoiceEmployee = {
  id: string;
  name: string;
  position?: string;
  voice_sample_path?: string | null;
};

export default function VoiceSampleManager({
  employees,
  onClose,
  onChanged,
}: {
  employees: VoiceEmployee[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const secondsRef = useRef(0);
  const targetIdRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string>("");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  // ─── Đồng hồ: tự dừng ở 10 giây ───
  useEffect(() => {
    if (!recordingFor) return;
    const timer = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= VOICE_SAMPLE_MAX_SEC) {
        recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [recordingFor]);

  const saveSample = useCallback(async (
    employeeId: string,
    blob: Blob,
    ext: string,
    contentType: string,
  ) => {
    setBusyId(employeeId);
    try {
      const path = `voice_samples/${employeeId}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(MEETINGS_BUCKET)
        .upload(path, blob, { contentType, upsert: true });
      if (upErr) throw upErr;

      // Mẫu cũ khác đuôi file thì upsert KHÔNG đè lên được, phải xoá tay —
      // không xoá là để lại rác vĩnh viễn trong kho.
      const oldPath = employees.find(e => e.id === employeeId)?.voice_sample_path;
      if (oldPath && oldPath !== path) {
        await supabase.storage.from(MEETINGS_BUCKET).remove([oldPath]);
      }

      const { data: rows, error: dbErr } = await supabase
        .from("employees")
        .update({ voice_sample_path: path })
        .eq("id", employeeId)
        .select("id");
      if (dbErr) throw dbErr;
      if (!rows || rows.length === 0) {
        throw new Error("Tài khoản của bạn chưa được cấp phép sửa xóa.");
      }
      onChanged();
    } catch (err: any) {
      setError(err?.message || "Lỗi lưu mẫu giọng");
    } finally {
      setBusyId(null);
    }
  }, [employees, onChanged]);

  // ─── Tải file mẫu giọng có sẵn ───
  const pickFileFor = useCallback((employeeId: string) => {
    setError("");
    setNotice("");
    uploadTargetRef.current = employeeId;
    fileInputRef.current?.click();
  }, []);

  const handleFileChosen = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại đúng file đó lần sau
    const employeeId = uploadTargetRef.current;
    if (!file || !employeeId) return;

    setBusyId(employeeId);
    setError("");
    setNotice("");
    try {
      const prepared = await prepareVoiceSample(file);
      setBusyId(null);
      await saveSample(employeeId, prepared.blob, prepared.ext, prepared.contentType);
      if (prepared.note) setNotice(prepared.note);
    } catch (err: any) {
      setBusyId(null);
      setError(err?.message || "Không xử lý được file mẫu giọng.");
    }
  }, [saveSample]);

  const startRecording = useCallback(async (employeeId: string) => {
    setError("");
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Trình duyệt chỉ cho phép thu micro trên HTTPS hoặc localhost.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      streamRef.current = stream;
      targetIdRef.current = employeeId;
      secondsRef.current = 0;
      setSeconds(0);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        const recordedSec = secondsRef.current;
        stopStream();
        setRecordingFor(null);
        // Mẫu quá ngắn thì model không nhận diện được giọng — từ chối thẳng còn
        // hơn lưu một mẫu vô dụng rồi tưởng là đã có.
        if (recordedSec < VOICE_SAMPLE_MIN_SEC) {
          setError(`Mẫu giọng phải dài ít nhất ${VOICE_SAMPLE_MIN_SEC} giây. Hãy đọc một câu trọn vẹn rồi mới bấm dừng.`);
          return;
        }
        void saveSample(targetIdRef.current, blob, "webm", "audio/webm");
      };
      rec.start();
      recorderRef.current = rec;
      setRecordingFor(employeeId);
    } catch (err: any) {
      setError(`Không mở được micro: ${err?.message || "lỗi không xác định"}`);
    }
  }, [saveSample, stopStream]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const playSample = useCallback(async (path: string) => {
    const { data } = supabase.storage.from(MEETINGS_BUCKET).getPublicUrl(path);
    const audio = new Audio(`${data.publicUrl}?v=${Date.now()}`);
    void audio.play().catch(() => setError("Không phát được mẫu giọng."));
  }, []);

  const deleteSample = useCallback(async (employeeId: string, path: string) => {
    setBusyId(employeeId);
    setError("");
    try {
      await supabase.storage.from(MEETINGS_BUCKET).remove([path]);
      const { data: rows, error: dbErr } = await supabase
        .from("employees")
        .update({ voice_sample_path: null })
        .eq("id", employeeId)
        .select("id");
      if (dbErr) throw dbErr;
      if (!rows || rows.length === 0) {
        throw new Error("Tài khoản của bạn chưa được cấp phép sửa xóa.");
      }
      onChanged();
    } catch (err: any) {
      setError(err?.message || "Lỗi xoá mẫu giọng");
    } finally {
      setBusyId(null);
    }
  }, [onChanged]);

  const keyword = search.trim().toLowerCase();
  const rows = keyword
    ? employees.filter(e => (e.name || "").toLowerCase().includes(keyword))
    : employees;
  const withSample = employees.filter(e => e.voice_sample_path).length;

  // createPortal xuống document.body: phần tử `fixed` nằm trong một khối có
  // backdrop-filter sẽ bị nhốt trong khối đó chứ không căn theo màn hình nữa.
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]">
        <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-heading font-extrabold text-sm text-slate-800">Mẫu giọng nhân sự</h3>
            <p className="text-[11px] font-semibold text-slate-500 mt-1 leading-relaxed">
              Ghi trực tiếp {VOICE_SAMPLE_MIN_SEC}–{VOICE_SAMPLE_MAX_SEC} giây, hoặc tải file ghi âm có sẵn (MP3, M4A, WAV, OGG, WEBM) —
              file dài hơn {VOICE_SAMPLE_MAX_SEC} giây sẽ tự cắt lấy {VOICE_SAMPLE_MAX_SEC} giây kể từ chỗ bắt đầu có tiếng.
              Khi gỡ băng, AI sẽ gọi thẳng tên thật thay vì &quot;Speaker 1/2/3&quot;. Chỉ hỗ trợ tối đa 4 giọng trong phiên họp.
              <span className="text-slate-400"> Đã có {withSample}/{employees.length} người.</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Một ô chọn file dùng chung cho cả danh sách; người nào đang chọn thì
            ghi vào uploadTargetRef trước khi mở hộp thoại của trình duyệt. */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChosen}
          accept="audio/*,.m4a,.webm,.ogg"
          className="hidden"
        />

        <div className="px-6 pt-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên nhân sự…"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-[#005BAC]"
          />
          {error && (
            <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-rose-700 leading-relaxed">{error}</p>
            </div>
          )}
          {notice && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
              <Info size={14} className="text-[#005BAC] shrink-0 mt-0.5" />
              <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">{notice}</p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-1.5">
          {rows.map(emp => {
            const isRecording = recordingFor === emp.id;
            const isBusy = busyId === emp.id;
            return (
              <div key={emp.id} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">{emp.name}</p>
                  <p className="text-[10px] font-semibold text-slate-400 truncate">
                    {emp.voice_sample_path
                      ? <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={11} /> Đã có mẫu giọng</span>
                      : (emp.position || "Chưa có mẫu giọng")}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isBusy && <Loader2 size={15} className="text-slate-400 animate-spin" />}

                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold px-3 py-2 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <Square size={12} /> Dừng ({seconds}s)
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!!recordingFor || isBusy}
                        onClick={() => startRecording(emp.id)}
                        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-[11px] font-bold px-3 py-2 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                      >
                        <Mic size={12} /> {emp.voice_sample_path ? "Ghi lại" : "Ghi mẫu"}
                      </button>
                      <button
                        type="button"
                        disabled={!!recordingFor || isBusy}
                        onClick={() => pickFileFor(emp.id)}
                        title="Tải file ghi âm có sẵn làm mẫu giọng"
                        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-[11px] font-bold px-3 py-2 rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                      >
                        <Upload size={12} /> Tải file
                      </button>
                    </>
                  )}

                  {emp.voice_sample_path && !isRecording && (
                    <>
                      <button
                        type="button"
                        onClick={() => playSample(emp.voice_sample_path!)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-lg transition-all active:scale-95 cursor-pointer"
                        title="Nghe thử"
                      >
                        <Play size={12} />
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => deleteSample(emp.id, emp.voice_sample_path!)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-2 rounded-lg transition-all active:scale-95 cursor-pointer"
                        title="Xoá mẫu giọng"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="text-[11px] font-semibold text-slate-400 text-center py-8">Không tìm thấy nhân sự nào.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

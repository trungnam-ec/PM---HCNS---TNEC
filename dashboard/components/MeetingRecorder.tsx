"use client";

// ============================================================
// MeetingRecorder — ghi âm cuộc họp ngay trong trình duyệt.
//
// BA THỨ QUYẾT ĐỊNH THIẾT KẾ NÀY:
//
// 1. TỰ CẮT ĐOẠN 20 PHÚT. OpenAI chặn cứng 25MB mỗi lần gọi API gỡ băng cho MỌI
//    model, không có endpoint nhận URL hay chạy bất đồng bộ để lách. Họp 2 tiếng
//    là một file quá khổ -> phải cắt ngay từ lúc thu.
//
// 2. KHÔNG DÙNG `timeslice` CỦA MediaRecorder — đây là chỗ dễ làm sai nhất.
//    Các mảnh nó cắt ra KHÔNG tự giải mã được: chỉ mảnh đầu mang header của
//    container, gửi mảnh thứ hai lên API là lỗi "file hỏng". Phải DỪNG HẲN
//    recorder rồi TẠO RECORDER MỚI — mỗi đoạn khi đó là một file webm hoàn chỉnh
//    độc lập.
//
// 3. UPLOAD NGAY TRONG LÚC HỌP. Đoạn nào xong là đẩy lên Storage luôn, không đợi
//    tan họp. Máy sập giữa chừng thì vẫn còn các đoạn đã lên.
//
// MÔI TRƯỜNG: getUserMedia chỉ chạy trên HTTPS hoặc localhost. Mở qua IP LAN kiểu
// http://192.168.x.x:3000 sẽ bị trình duyệt chặn micro.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  RECORD_AUDIO_BITRATE,
  RECORD_SEGMENT_SEC,
  MEETINGS_BUCKET,
} from "@/lib/meetingModels";
import { Mic, Square, Pause, Play, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

export type RecordedSegment = {
  index: number;
  path: string;
  offsetSec: number;
  durationSec: number;
  sizeBytes: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

type RecorderState = "idle" | "recording" | "paused" | "finishing";

function fmtClock(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function MeetingRecorder({
  disabled,
  onFinish,
}: {
  disabled?: boolean;
  onFinish: (result: { startedAt: string; segments: RecordedSegment[] }) => void;
}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);          // giây ĐÃ THU (không tính lúc tạm dừng)
  const [level, setLevel] = useState(0);              // vạch mức âm thanh 0..1
  const [segments, setSegments] = useState<RecordedSegment[]>([]);
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const sessionIdRef = useRef<string>("");
  const startedAtRef = useRef<string>("");
  const segIndexRef = useRef(0);
  const elapsedRef = useRef(0);                       // nguồn sự thật của đồng hồ
  const segStartOffsetRef = useRef(0);                // mốc bắt đầu của đoạn đang thu
  const stoppingForRotationRef = useRef(false);       // dừng để cắt đoạn hay dừng hẳn?
  const finishRequestedRef = useRef(false);
  // Danh sách đoạn đọc bằng ref, KHÔNG đọc trong hàm cập nhật state: React
  // StrictMode gọi updater 2 lần ở môi trường dev -> pipeline chạy 2 lượt.
  const segmentsRef = useRef<RecordedSegment[]>([]);
  // Giữ blob của đoạn cho tới khi upload xong, để mất mạng giữa chừng còn bấm
  // "Tải lại" được thay vì mất hẳn 20 phút họp.
  const blobsRef = useRef<Map<number, Blob>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const pushSegment = useCallback((seg: RecordedSegment) => {
    segmentsRef.current = [...segmentsRef.current, seg];
    setSegments(segmentsRef.current);
  }, []);

  const patchSegment = useCallback((index: number, patch: Partial<RecordedSegment>) => {
    segmentsRef.current = segmentsRef.current.map(s => (s.index === index ? { ...s, ...patch } : s));
    setSegments(segmentsRef.current);
  }, []);

  // ─── Upload một đoạn đã thu xong ───
  const uploadSegment = useCallback(async (blob: Blob, index: number, offsetSec: number, durationSec: number) => {
    const path = `recordings/${sessionIdRef.current}/part_${String(index).padStart(3, "0")}.webm`;
    blobsRef.current.set(index, blob);
    pushSegment({ index, path, offsetSec, durationSec, sizeBytes: blob.size, status: "uploading" });

    try {
      // contentType ghi thẳng "audio/webm": blob.type của Chrome là
      // "audio/webm;codecs=opus", kèm tham số thì Storage đối chiếu mime hụt.
      const { error: upErr } = await supabase.storage
        .from(MEETINGS_BUCKET)
        .upload(path, blob, { contentType: "audio/webm", upsert: true });
      if (upErr) throw upErr;
      blobsRef.current.delete(index);
      patchSegment(index, { status: "done" });
    } catch (err: any) {
      patchSegment(index, { status: "error", error: err?.message || "Lỗi upload" });
    }
  }, [patchSegment, pushSegment]);

  // ─── Tạo recorder mới cho một đoạn ───
  const startSegmentRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const rec = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: RECORD_AUDIO_BITRATE });
    chunksRef.current = [];
    segStartOffsetRef.current = elapsedRef.current;

    rec.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];
      const index = segIndexRef.current;
      const offsetSec = segStartOffsetRef.current;
      const durationSec = Math.max(0, elapsedRef.current - offsetSec);
      segIndexRef.current = index + 1;

      if (blob.size > 0) {
        void uploadSegment(blob, index, offsetSec, durationSec);
      }

      if (stoppingForRotationRef.current) {
        // Cắt đoạn: dựng ngay recorder mới, cuộc họp không gián đoạn.
        stoppingForRotationRef.current = false;
        startSegmentRecorder();
      }
    };

    rec.start(); // KHÔNG truyền timeslice — xem ghi chú đầu file
    recorderRef.current = rec;
  }, [uploadSegment]);

  // ─── Đồng hồ + tự cắt đoạn ───
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);

      // Đủ 20 phút cho đoạn hiện tại -> dừng hẳn rồi tạo recorder mới
      if (elapsedRef.current - segStartOffsetRef.current >= RECORD_SEGMENT_SEC) {
        const rec = recorderRef.current;
        if (rec && rec.state !== "inactive") {
          stoppingForRotationRef.current = true;
          rec.stop();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  // ─── Vạch mức âm thanh: phát hiện micro câm ngay từ phút đầu ───
  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
        }
        setLevel(peak);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Không có vạch mức thì vẫn ghi âm bình thường — không chặn cuộc họp vì thứ phụ.
    }
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  // ─── Bắt đầu ───
  const handleStart = useCallback(async () => {
    setError("");
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Trình duyệt chỉ cho phép thu micro trên HTTPS hoặc localhost. Hãy mở phần mềm bằng địa chỉ https:// thay vì địa chỉ IP nội bộ.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      sessionIdRef.current = String(Date.now());
      startedAtRef.current = new Date().toISOString();
      segIndexRef.current = 0;
      elapsedRef.current = 0;
      segStartOffsetRef.current = 0;
      segmentsRef.current = [];
      blobsRef.current.clear();
      finishRequestedRef.current = false;
      setSegments([]);
      setElapsed(0);
      startLevelMeter(stream);
      startSegmentRecorder();
      setState("recording");
    } catch (err: any) {
      setError(err?.message?.includes("Permission")
        ? "Trình duyệt đã chặn quyền dùng micro. Hãy bấm vào biểu tượng ổ khoá trên thanh địa chỉ và cho phép Micro."
        : `Không mở được micro: ${err?.message || "lỗi không xác định"}`);
    }
  }, [startLevelMeter, startSegmentRecorder]);

  // ─── Tạm dừng / ghi tiếp ───
  // Khoảng tạm dừng KHÔNG tính vào đồng hồ, nhờ đó mốc giờ của các đoạn sau vẫn
  // khớp đúng vị trí trong file.
  const handlePause = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      rec.pause();
      setState("paused");
    }
  }, []);

  const handleResume = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === "paused") {
      rec.resume();
      setState("recording");
    }
  }, []);

  // ─── Kết thúc ───
  const handleStop = useCallback(() => {
    const rec = recorderRef.current;
    finishRequestedRef.current = true;
    stoppingForRotationRef.current = false;
    setState("finishing");
    if (rec && rec.state !== "inactive") rec.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    stopLevelMeter();
  }, [stopLevelMeter]);

  /** Bàn giao danh sách đoạn cho trang để chạy tiếp pipeline gỡ băng. */
  const handOver = useCallback(() => {
    const done = segmentsRef.current.filter(s => s.status === "done");
    if (done.length === 0) return;
    finishRequestedRef.current = false;
    setState("idle");
    onFinish({ startedAt: startedAtRef.current, segments: done });
  }, [onFinish]);

  // Khi đã bấm Kết thúc: đợi mọi đoạn upload xong rồi mới bàn giao cho trang.
  // Còn đoạn lỗi thì DỪNG LẠI chờ người dùng quyết — tự động bỏ qua là lặng lẽ
  // ném mất 20 phút họp.
  useEffect(() => {
    if (state !== "finishing" || !finishRequestedRef.current) return;
    if (segments.length === 0) return;
    if (segments.some(s => s.status === "uploading")) return;

    if (segments.some(s => s.status === "error")) {
      setError("Có đoạn chưa tải lên được. Bấm 'Tải lại đoạn lỗi' để thử lại, hoặc tiếp tục với những đoạn đã lưu (phần ghi âm của đoạn lỗi sẽ không có trong biên bản).");
      return;
    }
    if (segmentsRef.current.filter(s => s.status === "done").length === 0) {
      setError("Không đoạn ghi âm nào tải lên thành công. Kiểm tra đường truyền rồi thử lại.");
      return;
    }
    handOver();
  }, [segments, state, handOver]);

  // ─── Tải lại đoạn lỗi ───
  const retryFailed = useCallback(async () => {
    const failed = segmentsRef.current.filter(s => s.status === "error");
    if (failed.length === 0) return;
    setError("");
    await Promise.all(failed.map(async seg => {
      const blob = blobsRef.current.get(seg.index);
      if (!blob) {
        patchSegment(seg.index, {
          status: "error",
          error: "Không tải lại được: dữ liệu đoạn này không còn trong bộ nhớ trình duyệt (đã tải lại trang).",
        });
        return;
      }
      patchSegment(seg.index, { status: "uploading", error: undefined });
      try {
        const { error: upErr } = await supabase.storage
          .from(MEETINGS_BUCKET)
          .upload(seg.path, blob, { contentType: "audio/webm", upsert: true });
        if (upErr) throw upErr;
        blobsRef.current.delete(seg.index);
        patchSegment(seg.index, { status: "done" });
      } catch (err: any) {
        patchSegment(seg.index, { status: "error", error: err?.message || "Lỗi upload" });
      }
    }));
  }, [patchSegment]);

  // ─── Chặn đóng tab khi đang ghi ───
  useEffect(() => {
    if (state === "idle") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state]);

  // Dọn khi rời trang
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const segDone = segments.filter(s => s.status === "done").length;
  const segError = segments.filter(s => s.status === "error").length;
  const nextCutIn = Math.max(0, RECORD_SEGMENT_SEC - (elapsed - segStartOffsetRef.current));

  return (
    <div className="space-y-4">
      {/* ─── Đồng hồ + vạch mức ─── */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${state === "recording" ? "bg-rose-500 animate-pulse" : state === "paused" ? "bg-amber-500" : "bg-slate-300"}`} />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            {state === "recording" ? "Đang ghi âm" : state === "paused" ? "Đang tạm dừng" : state === "finishing" ? "Đang hoàn tất" : "Chưa ghi"}
          </span>
        </div>

        <div className="font-heading font-extrabold text-4xl text-slate-800 tabular-nums">{fmtClock(elapsed)}</div>

        {/* Vạch mức: micro câm thì thấy ngay từ phút đầu, thay vì họp xong 2 tiếng mới biết */}
        <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden max-w-xs mx-auto">
          <div
            className={`h-full rounded-full transition-[width] duration-75 ${level > 0.02 ? "bg-emerald-500" : "bg-slate-300"}`}
            style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
          />
        </div>
        {state === "recording" && level <= 0.02 && (
          <p className="text-[11px] font-bold text-rose-500 flex items-center justify-center gap-1.5">
            <AlertCircle size={13} /> Không nghe thấy tiếng — kiểm tra lại micro trước khi họp tiếp.
          </p>
        )}

        {state !== "idle" && (
          <p className="text-[11px] font-semibold text-slate-400">
            Đoạn {segIndexRef.current + 1} · tự cắt sau {fmtClock(nextCutIn)} · đã lưu {segDone} đoạn
          </p>
        )}

        {/* ─── Nút điều khiển ─── */}
        <div className="flex items-center justify-center gap-2.5 pt-1">
          {state === "idle" && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleStart}
              className="bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-sm shadow-rose-500/20 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <Mic size={15} /> Bắt đầu ghi âm
            </button>
          )}
          {state === "recording" && (
            <>
              <button type="button" onClick={handlePause} className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-2">
                <Pause size={15} /> Tạm dừng
              </button>
              <button type="button" onClick={handleStop} className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-2">
                <Square size={14} /> Kết thúc
              </button>
            </>
          )}
          {state === "paused" && (
            <>
              <button type="button" onClick={handleResume} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-2">
                <Play size={15} /> Ghi tiếp
              </button>
              <button type="button" onClick={handleStop} className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-2">
                <Square size={14} /> Kết thúc
              </button>
            </>
          )}
          {state === "finishing" && (
            segments.some(s => s.status === "uploading") || segments.length === 0 ? (
              <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" /> Đang tải nốt các đoạn lên…
              </span>
            ) : segDone > 0 ? (
              <button
                type="button"
                onClick={handOver}
                className="bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm shadow-blue-500/20 transition-all active:scale-95 cursor-pointer"
              >
                Tiếp tục với {segDone} đoạn đã lưu
              </button>
            ) : null
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex items-start gap-2.5">
          <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[11px] font-semibold text-rose-700 leading-relaxed">{error}</p>
        </div>
      )}

      {/* ─── Danh sách đoạn ─── */}
      {segments.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Các đoạn đã thu</p>
            {segError > 0 && (
              <button type="button" onClick={retryFailed} className="text-[11px] font-bold text-[#005BAC] hover:underline flex items-center gap-1 cursor-pointer">
                <RefreshCw size={12} /> Tải lại đoạn lỗi
              </button>
            )}
          </div>
          {segments.map(seg => (
            <div key={seg.index} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-700">
                  Đoạn {seg.index + 1} · {fmtClock(seg.offsetSec)} → {fmtClock(seg.offsetSec + seg.durationSec)}
                </p>
                <p className="text-[10px] font-semibold text-slate-400">
                  {(seg.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                  {seg.error ? ` · ${seg.error}` : ""}
                </p>
              </div>
              {seg.status === "uploading" && <Loader2 size={15} className="text-slate-400 animate-spin shrink-0" />}
              {seg.status === "done" && <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />}
              {seg.status === "error" && <AlertCircle size={15} className="text-rose-500 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

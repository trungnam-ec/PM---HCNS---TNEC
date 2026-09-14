// ============================================================
// voiceSamplePrepare — chuẩn bị FILE CÓ SẴN thành mẫu giọng hợp lệ.
//
// VÌ SAO CẦN CẮT: OpenAI chỉ nhận mẫu giọng dài 2–10 giây. File người dùng có
// sẵn (một đoạn ghi âm cũ, một tin nhắn thoại) gần như luôn dài hơn, nên nếu
// chỉ tải nguyên file lên thì API từ chối và người dùng không hiểu vì sao.
//
// CÁCH LÀM: giải mã file bằng AudioContext -> bỏ khoảng lặng ở đầu (nhiều file
// mở đầu bằng vài giây im lặng hoặc tiếng lạo xạo, cắt ngay từ giây 0 là lấy
// phải đoạn vô dụng) -> lấy 10 giây kể từ chỗ bắt đầu có tiếng -> đóng gói lại
// thành WAV mono.
//
// WAV chứ không phải webm/mp3: trình duyệt KHÔNG có sẵn bộ nén âm thanh để ghi
// ra file, chỉ giải mã được. WAV ghi thẳng từ mẫu PCM nên không cần thư viện
// ngoài; 10 giây mono ≈ 1MB, thừa sức cho một mẫu giọng.
//
// CHỈ CHẠY ĐƯỢC Ở TRÌNH DUYỆT (dùng AudioContext).
// ============================================================

import { VOICE_SAMPLE_MAX_SEC, VOICE_SAMPLE_MIN_SEC, VOICE_SAMPLE_MIME } from "@/lib/meetingModels";

export type PreparedSample = {
  blob: Blob;
  /** Đuôi file để đặt tên trên Storage. */
  ext: string;
  contentType: string;
  durationSec: number;
  /** Câu giải thích cho người dùng khi file đã bị cắt bớt. */
  note: string;
};

/** Ngưỡng coi là "có tiếng" — dưới mức này coi như im lặng/nhiễu nền. */
const SILENCE_THRESHOLD = 0.02;

// Hạ về 16kHz trước khi đóng gói WAV. Giọng người nằm gọn dưới 8kHz nên nhận
// diện không mất gì, mà file nhẹ đi 3 lần: mẫu giọng được gửi cho OpenAI dưới
// dạng data URL base64 kèm ngay trong request gỡ băng, 4 mẫu 48kHz là cộng thêm
// khoảng 5MB vào mỗi lần gọi.
const TARGET_SAMPLE_RATE = 16000;

/** Đóng gói mẫu PCM mono thành file WAV 16-bit. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);          // độ dài khối fmt
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte/giây
  view.setUint16(32, 2, true);           // byte mỗi khung
  view.setUint16(34, 16, true);          // bit mỗi mẫu
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/** Trộn mọi kênh về mono — mẫu giọng không cần stereo. */
function toMono(audio: AudioBuffer): Float32Array {
  const channels = audio.numberOfChannels;
  const out = new Float32Array(audio.length);
  for (let c = 0; c < channels; c++) {
    const data = audio.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / channels;
  }
  return out;
}

/** Vị trí mẫu đầu tiên nghe thấy tiếng; không thấy gì thì trả 0. */
function findFirstSound(samples: Float32Array): number {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > SILENCE_THRESHOLD) return i;
  }
  return 0;
}

/**
 * Hạ tần số lấy mẫu về 16kHz. Trình duyệt nào không dựng nổi OfflineAudioContext
 * ở tần số này thì giữ nguyên bản gốc — nặng hơn nhưng vẫn chạy đúng.
 */
async function downsample(samples: Float32Array, sampleRate: number): Promise<{ data: Float32Array; rate: number }> {
  if (sampleRate <= TARGET_SAMPLE_RATE) return { data: samples, rate: sampleRate };
  try {
    const length = Math.ceil(samples.length * TARGET_SAMPLE_RATE / sampleRate);
    const OfflineCtx: typeof OfflineAudioContext =
      (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const offline = new OfflineCtx(1, length, TARGET_SAMPLE_RATE);

    const source = offline.createBufferSource();
    const buffer = offline.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();
    return { data: rendered.getChannelData(0), rate: TARGET_SAMPLE_RATE };
  } catch {
    return { data: samples, rate: sampleRate };
  }
}

export async function prepareVoiceSample(file: File): Promise<PreparedSample> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!VOICE_SAMPLE_MIME[ext]) {
    throw new Error(`Định dạng .${ext || "?"} không được hỗ trợ. Hãy dùng file MP3, M4A, WAV, OGG hoặc WEBM.`);
  }

  const raw = await file.arrayBuffer();

  let audio: AudioBuffer;
  try {
    const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    // decodeAudioData "ăn" mất ArrayBuffer gốc nên phải cắt bản sao, còn giữ
    // `raw` cho nhánh tải nguyên file bên dưới.
    audio = await ctx.decodeAudioData(raw.slice(0));
    void ctx.close();
  } catch {
    throw new Error("Không đọc được nội dung file âm thanh này. Hãy thử chuyển sang MP3 hoặc WAV rồi tải lại.");
  }

  const duration = audio.duration;
  if (duration < VOICE_SAMPLE_MIN_SEC) {
    throw new Error(`File chỉ dài ${duration.toFixed(1)} giây, mẫu giọng cần ít nhất ${VOICE_SAMPLE_MIN_SEC} giây.`);
  }

  // Đủ ngắn thì giữ nguyên file gốc: không giải mã rồi mã hoá lại, tránh làm
  // giảm chất lượng thứ mà model dùng để nhận diện giọng.
  if (duration <= VOICE_SAMPLE_MAX_SEC) {
    return {
      blob: new Blob([raw], { type: VOICE_SAMPLE_MIME[ext] }),
      ext,
      contentType: VOICE_SAMPLE_MIME[ext],
      durationSec: duration,
      note: "",
    };
  }

  const mono = toMono(audio);
  const start = findFirstSound(mono);
  const wanted = Math.floor(VOICE_SAMPLE_MAX_SEC * audio.sampleRate);
  const slice = mono.slice(start, Math.min(start + wanted, mono.length));
  const { data, rate } = await downsample(slice, audio.sampleRate);

  return {
    blob: encodeWav(data, rate),
    ext: "wav",
    contentType: "audio/wav",
    durationSec: data.length / rate,
    note: `File dài ${Math.round(duration)} giây, đã tự cắt lấy ${VOICE_SAMPLE_MAX_SEC} giây kể từ chỗ bắt đầu có tiếng (giới hạn của OpenAI là ${VOICE_SAMPLE_MIN_SEC}–${VOICE_SAMPLE_MAX_SEC} giây).`,
  };
}

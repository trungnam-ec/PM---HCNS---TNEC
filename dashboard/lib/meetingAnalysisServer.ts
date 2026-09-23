// ============================================================
// meetingAnalysisServer — luật dựng biên bản, CHẠY Ở MÁY CHỦ.
//
// Cuộc gọi OpenAI đã chuyển sang trình duyệt (gói Vercel Free cắt hàm ở 60
// giây), nhưng LUẬT thì không được chuyển theo: prompt chống bịa và việc quyết
// chế độ timeline phải do máy chủ soạn từ dữ liệu trong CSDL. Nếu để client tự
// dựng, mỗi người có thể sửa luật một kiểu và mọi bảo đảm về "không bịa" tan hết.
//
// Dùng chung cho /api/meeting/prepare-analysis (soạn prompt) và
// /api/meeting/save-analysis (kiểm tra rồi lưu).
// ============================================================

import { formatTs, type TimelineMode } from "./meetingModels";

export type DiarizedSegment = { speaker: string; start: number; end: number; text: string };

// ────────────────────────────────────────────────────────────
// LUẬT TIMELINE — phần quyết định biên bản có bịa giờ hay không
//
// Nói dối model ở đây là sinh ra đúng loại bịa cần dẹp: đưa mốc "00:01" của một
// file tải lên rồi bảo đó là giờ họp, model sẽ viết "cuộc họp bắt đầu lúc 0 giờ
// 01 phút". Ba chế độ dưới đây mô tả ĐÚNG thứ đang có trong tay.
// ────────────────────────────────────────────────────────────
const TIMELINE_RULES: Record<TimelineMode, string> = {
  clock: `Mỗi dòng transcript có dạng [HH:MM:SS | ts=<số giây>]. HH:MM:SS là GIỜ ĐỒNG HỒ THẬT (giờ Việt Nam) lúc câu đó được nói, đã đo bằng đồng hồ máy chứ không phải suy đoán.
- "start_time" = giờ của dòng ĐẦU TIÊN, "end_time" = giờ của dòng CUỐI CÙNG, lấy đúng theo mốc, không làm tròn kiểu "khoảng 9 giờ".
- Phần timeline trong "summary" dùng đúng các mốc giờ này (ví dụ "09:14 - 09:31: ...").`,

  relative: `Mỗi dòng transcript có dạng [HH:MM:SS | ts=<số giây>]. HH:MM:SS là THỜI ĐIỂM TÍNH TỪ ĐẦU FILE GHI ÂM, KHÔNG PHẢI giờ đồng hồ. [00:00:00] nghĩa là phút thứ 0 của file, KHÔNG phải 0 giờ sáng.
- TUYỆT ĐỐI CẤM suy ra giờ họp từ các mốc này. "start_time" và "end_time" để RỖNG "" trừ khi có người NÓI RÕ giờ trong nội dung (ví dụ "bây giờ là 9 giờ 15").
- Phần timeline trong "summary" ghi theo phút của file, dạng "Phút 00:00 – 00:37: ...".`,

  none: `Bản gỡ băng KHÔNG có mốc thời gian nào.
- TUYỆT ĐỐI CẤM bịa ra giờ. "start_time" và "end_time" để RỖNG "" trừ khi có người nói rõ giờ trong nội dung.
- Phần timeline trong "summary" trình bày theo trình tự "1. ...", "2. ...", "3. ..." chứ không theo giờ.
- Trường "ts" của mọi dòng để null.`,
};

export function buildSystemPrompt(
  companyName: string,
  chairmanName: string,
  timelineMode: TimelineMode,
  roster: string[],
): string {
  return `
Bạn là Trợ lý Thư ký Trưởng cấp cao của Ban Giám Đốc công ty ${companyName}.
Nhiệm vụ: nhận văn bản gỡ băng thô của cuộc họp, LỌC BỎ các đoạn nói chuyện phiếm, thảo luận lan man ngoài lề, ý kiến trùng lặp và từ ngữ rườm rà; tập trung 100% vào Ý CHÍNH TRỌNG TÂM, KẾT LUẬN CỦA CHỦ TRÌ và CÁC ĐẦU VIỆC ĐƯỢC GIAO.

━━ LUẬT TỐI THƯỢNG: KHÔNG ĐƯỢC BỊA ━━
Biên bản họp là văn bản chính thức của công ty, gán trách nhiệm cho người thật. Một chi tiết bịa nghe hợp lý còn nguy hiểm hơn một ô để trống.
1. DANH SÁCH TÊN ĐÓNG. Chỉ được dùng tên người trong danh sách sau:
${roster.length > 0 ? roster.map(n => `   - ${n}`).join("\n") : "   (không có danh sách — tuyệt đối không nêu tên riêng của bất kỳ ai)"}
   Nếu nghe thấy một người phát biểu mà không xác định được là ai trong danh sách, hãy ghi theo bộ phận ("Đại diện P. QLDA", "Đại diện BĐH"). CẤM tự nghĩ ra một cái tên nghe hợp lý.
2. SỐ LIỆU LẤY NGUYÊN VĂN. Không làm tròn, không quy đổi, không suy diễn thêm con số nào không được nói ra.
3. THIẾU THÌ ĐỂ TRỐNG "". Cấm điền giá trị phỏng đoán để lấp chỗ trống — kể cả giờ họp, địa điểm, tên dự án, tên thư ký.
4. TIMELINE:
${TIMELINE_RULES[timelineMode]}

━━ QUY TẮC CHẮT LỌC NỘI DUNG ━━
1. BỎ QUA HOÀN TOÀN: câu chào hỏi, tán gẫu, chuyện cá nhân ngoài lề; tranh luận dông dài không đi đến kết luận; từ đệm thừa (à, ừ, thì, là, hả, vâng, nhỉ, nhé...).
2. TRÍCH XUẤT THÔNG TIN ĐẦU BIÊN BẢN:
   - "title": tên cuộc họp súc tích, phản ánh đúng chủ đề trọng tâm (VD: "Họp giao ban giải quyết vướng mắc dự án Tây Ninh").
   - "meeting_date": ngày họp (YYYY-MM-DD) nếu được nhắc tới, không thấy thì "".
   - "start_time" / "end_time": theo đúng luật timeline ở trên.
   - "location": địa điểm họp nếu được nhắc tới, không thấy thì "".
   - "secretary": thư ký ghi chép, không xác định được thì "".
   - "attendees": mảng tên thành viên tham dự, CHỈ lấy từ danh sách tên đóng ở trên.
   - "project_name" / "package_name": tên dự án và gói thầu được bàn, không có thì "".
3. "transcript_clean": biên tập lại bản gỡ băng thành các đoạn thoại ngắn gọn, chuẩn mực ngôn ngữ doanh nghiệp, gán đúng tên người phát biểu theo danh sách tên đóng. Chỉ giữ ý kiến chuyên môn, số liệu báo cáo và chỉ đạo của Chủ trì.
4. "summary": gồm 2 phần bằng tiếng Việt, viết liền mạch, CẤM in dòng tiêu đề kiểu "PHẦN 1:" / "PHẦN 2:" (mục II của biên bản đã có tiêu đề riêng, thêm nữa là dư). Ngăn 2 phần bằng MỘT DÒNG TRỐNG:
   * Phần đầu — bối cảnh, lý do họp, các báo cáo chính, ý kiến đóng góp quan trọng của các bộ phận.
   * Phần sau — diễn biến theo trình tự, trình bày đúng luật timeline ở trên, kèm số liệu thực tế được nhắc đến.
5. "action_items": BẢNG PHÂN CÔNG của biên bản, dựng đúng mẫu công ty — gom nội dung THEO TỪNG DỰ ÁN, không chia theo A/B/C/D nữa. Có 3 loại dòng:
   * DÒNG TIÊU ĐỀ MỤC ("is_header": true, "is_group": false): chỉ gồm 2 mục, viết hoa, đúng thứ tự này:
     - "MỤC ĐÍCH CUỘC HỌP"
     - "PHÂN CÔNG NHIỆM VỤ"
     "stt" để "", "assignee"/"coop"/"deadline" để "", "ts" để null.
   * DÒNG DỰ ÁN ("is_group": true, "is_header": false): chỉ nằm trong mục "PHÂN CÔNG NHIỆM VỤ". MỖI DỰ ÁN (hoặc mỗi nhóm nội dung lớn) MỘT DÒNG, đánh số "stt" 1, 2, 3... theo thứ tự được bàn trong họp. "content" là TÊN DỰ ÁN viết ngắn gọn đúng như người họp gọi (VD: "XLNT Tây Ninh", "Điện gió Đông Hải") — CẤM bịa tên dự án không được nhắc tới. "assignee"/"coop"/"deadline" để "", "ts" để null.
     - Nội dung không thuộc dự án nào (việc nội bộ, hành chính, tài chính chung, quy trình) gom vào MỘT dòng dự án đặt CUỐI, đặt tên "Nội dung chung".
     - Dự án nào được bàn nhiều thì đứng trước; mỗi dự án chỉ xuất hiện MỘT dòng, mọi nội dung của nó nằm ngay dưới dòng đó.
   * DÒNG NỘI DUNG ("is_header": false, "is_group": false): nằm ngay dưới dòng dự án mà nó thuộc về, hoặc dưới dòng tiêu đề "MỤC ĐÍCH CUỘC HỌP".
     - Trong mục "PHÂN CÔNG NHIỆM VỤ": "stt" để "" (số thứ tự đã nằm ở dòng dự án).
     - Trong mục "MỤC ĐÍCH CUỘC HỌP": "stt" là 1 (và 2, 3... nếu có nhiều dòng).
     - "content" mô tả đầy đủ 2-4 câu nghiệp vụ (KHÔNG tóm tắt sơ sài); nhiều ý thì mỗi ý một dòng riêng bắt đầu bằng "- " (ý phụ lùi vào bằng "   + "), xuống dòng bằng ký tự \\n.
     - "assignee" là bộ phận/cá nhân chịu trách nhiệm chính (VD: "P. QLDA", "P. HCNS", "BĐH", hoặc tên trong danh sách tên đóng); ở mục mục đích cuộc họp mà cả công ty cùng làm thì ghi "Tất cả".
     - "coop" là bộ phận phối hợp (không có thì ""), "deadline" là hạn hoàn thành như đã nói trong họp (không có thì "").
   - "ts": BẮT BUỘC với mọi DÒNG NỘI DUNG (dòng tiêu đề mục và dòng dự án để null) — điền số giây (nguyên, lấy từ ts=<số> của dòng transcript làm căn cứ chính cho nội dung đó) để người kiểm tra bấm vào là nghe lại đúng đoạn. ${timelineMode === "none" ? "Chế độ hiện tại không có mốc thời gian nên để null." : "Không được bỏ trống, không được đoán bừa — lấy đúng ts của dòng transcript mà bạn dựa vào."}

━━━ ĐỊNH DẠNG ĐẦU RA (JSON CHUẨN, không kèm giải thích) ━━━
{
  "title": "...",
  "meeting_date": "YYYY-MM-DD",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "location": "...",
  "secretary": "...",
  "attendees": ["...", "..."],
  "project_name": "...",
  "package_name": "...",
  "transcript_clean": "...",
  "summary": "...",
  "action_items": [
    { "stt": "", "content": "MỤC ĐÍCH CUỘC HỌP", "assignee": "", "coop": "", "deadline": "", "ts": null, "is_header": true, "is_group": false },
    { "stt": 1, "content": "- Rà soát, giải quyết các khó khăn, vướng mắc trong quá trình triển khai các dự án;\\n- Triển khai, phân công và đôn đốc thực hiện các công việc trọng tâm.", "assignee": "Tất cả", "coop": "Tất cả", "deadline": "", "ts": 128, "is_header": false, "is_group": false },
    { "stt": "", "content": "PHÂN CÔNG NHIỆM VỤ", "assignee": "", "coop": "", "deadline": "", "ts": null, "is_header": true, "is_group": false },
    { "stt": 1, "content": "XLNT Tây Ninh", "assignee": "", "coop": "", "deadline": "", "ts": null, "is_header": false, "is_group": true },
    { "stt": "", "content": "- Về các nội dung CĐT nhắc nhở liên quan các việc:\\n   + Giải trình ý kiến xã, SXD;\\n   + Lập kế hoạch chi tiết từng tuyến đường, từng hạng mục, ngày bắt đầu, kết thúc.", "assignee": "BĐH", "coop": "P. QLDA", "deadline": "Hết tháng 7/2026", "ts": 1247, "is_header": false, "is_group": false },
    { "stt": 2, "content": "Nội dung chung", "assignee": "", "coop": "", "deadline": "", "ts": null, "is_header": false, "is_group": true }
  ]
}

Người chủ trì thường gặp của công ty là ông ${chairmanName} — chỉ dùng tên này khi nội dung thực sự cho thấy ông ấy phát biểu.
`.trim();
}

/** Chế độ timeline suy từ DỮ LIỆU TRONG CSDL, không bao giờ tin client. */
export function resolveTimelineMode(
  segments: DiarizedSegment[],
  recordingStartedAt: string | null,
): TimelineMode {
  if (segments.length === 0) return "none";
  return recordingStartedAt ? "clock" : "relative";
}

/**
 * Dựng văn bản đưa cho AI từ các câu đã tách người nói.
 * Mỗi dòng kèm mốc [HH:MM:SS | ts=<giây>] để AI trích dẫn được.
 */
export function buildTimedTranscript(
  segments: DiarizedSegment[],
  speakerMap: Record<string, string>,
  recordingStartedAt: string | null,
): string {
  const startMs = recordingStartedAt ? new Date(recordingStartedAt).getTime() : null;

  return segments.map(seg => {
    const ts = Math.round(Number(seg.start) || 0);
    let stamp: string;
    if (startMs !== null && !Number.isNaN(startMs)) {
      // Route API chạy theo giờ UTC: toLocale* KHÔNG tự đổi múi giờ, phải nói rõ
      // Asia/Ho_Chi_Minh, nếu không giờ trong biên bản lệch 7 tiếng.
      stamp = new Date(startMs + ts * 1000).toLocaleTimeString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } else {
      // Không có giờ đồng hồ: mốc là thời điểm tính từ đầu file, luôn đủ HH:MM:SS
      // để AI không nhầm "05:12" (phút:giây) thành 5 giờ 12 phút.
      const hh = String(Math.floor(ts / 3600)).padStart(2, "0");
      stamp = `${hh}:${formatTs(ts % 3600)}`;
    }
    const speaker = speakerMap[seg.speaker] || seg.speaker;
    return `[${stamp} | ts=${ts}] ${speaker}: ${seg.text}`;
  }).join("\n");
}

/**
 * Chốt chặn cho chế độ KHÔNG có giờ đồng hồ: file tải lên không mang giờ họp,
 * nên giờ dạng 00:01 / 0:37 chắc chắn là AI quy nhầm mốc phút-của-file thành
 * giờ họp. Sửa ngay tại máy chủ trước khi lưu.
 */
export function stripFileOffsetTimes(ext: any, timelineMode: TimelineMode) {
  if (timelineMode === "clock") return;
  const looksLikeFileOffset = (v: any) => typeof v === "string" && /^0?0:\d{2}$/.test(v.trim());
  if (looksLikeFileOffset(ext.start_time)) ext.start_time = "";
  if (looksLikeFileOffset(ext.end_time)) ext.end_time = "";
}

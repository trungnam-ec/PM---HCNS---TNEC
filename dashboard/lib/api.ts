// lib/api.ts
// API layer – giao tiếp với Supabase & Google Apps Script
import { supabase } from "./supabase";

const SCRIPT_URL = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL || "";
const SECRET = process.env.APPS_SCRIPT_SECRET || "CV_SCORER_SECRET_2025";

export type Candidate = {
  STT: number;
  "Ngày": string;
  "Tên ứng viên": string;
  Email: string;
  "SĐT": string;
  "Bằng cấp": string;
  "Chuyên ngành": string;
  "Kinh nghiệm": string;
  "Chức danh gần nhất": string;
  "Công ty gần nhất": string;
  "Khu vực": string;
  "Phòng Ban": string;
  "Vị trí": string;
  "Trạng thái": string;
  "Nguồn": string;
  "Người đánh giá": string;
  "Ghi chú"?: string;
  [key: string]: unknown;
};

export type Stats = {
  success: boolean;
  total_candidates: number;
  pass_count: number;
  fail_count: number;
  pass_rate: number;
  vong1_count: number;
  vong2_count: number;
  thuviec_count: number;
  hd_count: number;
  by_department: Record<string, number>;
  by_month: Record<string, number>;
};

// ── READ ────────────────────────────────────────────────────────────────────

export async function fetchCandidates(sheet = "Tổng Hợp"): Promise<Candidate[]> {
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .order("stt", { ascending: true });

  if (error || !data) {
    console.error("fetchCandidates error:", error);
    return [];
  }

  // Filter based on sheet
  let filtered = data;
  const sheetLower = sheet.toLowerCase().replace(/\s/g, "");
  if (sheetLower === "vòng1" || sheetLower === "vong1") {
    filtered = data.filter(c => c.v1_result || ["screening", "interview", "offer", "hired"].includes(c.status));
  } else if (sheetLower === "vòng2" || sheetLower === "vong2") {
    filtered = data.filter(c => c.v2_result || ["interview", "offer", "hired"].includes(c.status));
  } else if (sheetLower === "thửviệc" || sheetLower === "thuviec") {
    filtered = data.filter(c => c.onboard_date || c.status === "hired");
  }

  // Map to legacy format
  return filtered.map(c => ({
    STT: c.stt ?? 0,
    "Ngày": c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : "",
    "Tên ứng viên": c.name || "",
    Email: c.email || "",
    "SĐT": c.phone || "",
    "Bằng cấp": c.education || "",
    "Chuyên ngành": c.major || "",
    "Kinh nghiệm": c.experience || "",
    "Chức danh gần nhất": c.last_position || "",
    "Công ty gần nhất": c.last_company || "",
    "Khu vực": c.region || "",
    "Phòng Ban": c.department || "",
    "Vị trí": c.role || "",
    "Trạng thái": c.status === "rejected" ? "FAIL" : c.status === "new" ? "LƯU CV" : "PASS CV",
    "Nguồn": c.source || "",
    "Người đánh giá": c.reviewer || "",
    "Kết quả V1": c.v1_result || "Chờ đánh giá",
    "Kết quả  V1": c.v1_result || "Chờ đánh giá",
    "Kết quả V2": c.v2_result || "Chờ đánh giá",
    "Kết quả  V2": c.v2_result || "Chờ đánh giá",
    "Người PV": c.v1_interviewer || c.v2_interviewer || "",
    "ONBOARD": c.onboard_date || "",
    "Hết hạn TV": c.probation_end_date || "",
    "Mức lương \nTV": c.probation_salary || "",
    "MỨC lương\nCT": c.official_salary || "",
    "Kết quả nhận việc": c.probation_result || "",
    "Ghi chú": c.notes || ""
  }));
}

export async function fetchStats(): Promise<Stats> {
  const { data, error } = await supabase
    .from("candidates")
    .select("*");

  const fallback: Stats = {
    success: false,
    total_candidates: 0,
    pass_count: 0,
    fail_count: 0,
    pass_rate: 0,
    vong1_count: 0,
    vong2_count: 0,
    thuviec_count: 0,
    hd_count: 0,
    by_department: {},
    by_month: {}
  };

  if (error || !data) return fallback;

  const total = data.length;
  const fail = data.filter(c => c.status === "rejected").length;
  const pass = total - fail;

  const vong1 = data.filter(c => c.v1_result || ["screening", "interview", "offer", "hired"].includes(c.status)).length;
  const vong2 = data.filter(c => c.v2_result || ["interview", "offer", "hired"].includes(c.status)).length;
  const thuviec = data.filter(c => c.onboard_date || c.status === "hired").length;
  const hd = data.filter(c => c.probation_result === "Đạt" || c.probation_result === "ĐẠT" || c.probation_result === "Nhận" || c.probation_result === "NHẬN").length;

  const by_department: Record<string, number> = {};
  const by_month: Record<string, number> = {};

  data.forEach(c => {
    const dept = c.department || "Khác";
    by_department[dept] = (by_department[dept] || 0) + 1;

    if (c.created_at) {
      const month = new Date(c.created_at).toLocaleString("vi-VN", { month: "2-digit", year: "numeric" });
      by_month[month] = (by_month[month] || 0) + 1;
    }
  });

  return {
    success: true,
    total_candidates: total,
    pass_count: pass,
    fail_count: fail,
    pass_rate: total > 0 ? Math.round((pass / total) * 100) : 0,
    vong1_count: vong1,
    vong2_count: vong2,
    thuviec_count: thuviec,
    hd_count: hd,
    by_department,
    by_month
  };
}

// ── WRITE ───────────────────────────────────────────────────────────────────

export async function addCandidate(row: unknown[]): Promise<unknown> {
  const [stt, date, name, email, phone, education, major, region, department, role, status, source, reviewer] = row as any[];
  
  const { data, error } = await supabase
    .from("candidates")
    .insert([{
      stt: parseInt(stt, 10) || null,
      name: name || "",
      email: email || null,
      phone: phone ? String(phone) : null,
      education: education || null,
      major: major || null,
      region: region || null,
      department: department || null,
      role: role || null,
      status: String(status).toUpperCase() === "FAIL" ? "rejected" : "new",
      v1_date: date || new Date().toLocaleDateString('sv-SE'),
      source: source || null,
      reviewer: reviewer || null
    }])
    .select();

  if (error) throw error;
  return data;
}

export async function updateCandidate(
  stt: number,
  updates: Record<string, unknown>,
  sheet = "Tổng Hợp"
): Promise<unknown> {
  const mappedUpdates: Record<string, any> = {};
  
  if (updates["Tên ứng viên"] !== undefined) mappedUpdates.name = updates["Tên ứng viên"];
  if (updates["Email"] !== undefined) mappedUpdates.email = updates["Email"];
  if (updates["SĐT"] !== undefined) mappedUpdates.phone = String(updates["SĐT"]);
  if (updates["Bằng cấp"] !== undefined) mappedUpdates.education = updates["Bằng cấp"];
  if (updates["Chuyên ngành"] !== undefined) mappedUpdates.major = updates["Chuyên ngành"];
  if (updates["Khu vực"] !== undefined) mappedUpdates.region = updates["Khu vực"];
  if (updates["Phòng Ban"] !== undefined) mappedUpdates.department = updates["Phòng Ban"];
  if (updates["Vị trí"] !== undefined) mappedUpdates.role = updates["Vị trí"];
  if (updates["Nguồn"] !== undefined) mappedUpdates.source = updates["Nguồn"];
  if (updates["Người đánh giá"] !== undefined) mappedUpdates.reviewer = updates["Người đánh giá"];
  if (updates["Ghi chú"] !== undefined) mappedUpdates.notes = updates["Ghi chú"];

  if (updates["Trạng thái"] !== undefined) {
    const val = String(updates["Trạng thái"]).toUpperCase();
    mappedUpdates.status = val === "FAIL" ? "rejected" : val === "LƯU CV" ? "new" : "screening";
  }

  // V1 Updates
  if (updates["Kết quả V1"] !== undefined || updates["Kết quả  V1"] !== undefined) {
    mappedUpdates.v1_result = updates["Kết quả V1"] || updates["Kết quả  V1"];
    const v1Res = String(mappedUpdates.v1_result).trim().toUpperCase();
    if (v1Res === 'ĐẠT') {
      mappedUpdates.status = "interview";
    } else if (v1Res === 'KHÔNG ĐẠT' || v1Res === 'LOẠI') {
      mappedUpdates.status = "rejected";
    }
  }
  if (updates["Người PV"] !== undefined) {
    if (sheet.toLowerCase().includes("vong1") || sheet.toLowerCase().includes("vòng 1")) {
      mappedUpdates.v1_interviewer = updates["Người PV"];
    } else {
      mappedUpdates.v2_interviewer = updates["Người PV"];
    }
  }
  if (updates["Ngày"] !== undefined) {
    if (sheet.toLowerCase().includes("vong1") || sheet.toLowerCase().includes("vòng 1")) {
      mappedUpdates.v1_date = updates["Ngày"];
    } else {
      mappedUpdates.v2_date = updates["Ngày"];
    }
  }

  // V2 Updates
  if (updates["Kết quả V2"] !== undefined || updates["Kết quả  V2"] !== undefined) {
    mappedUpdates.v2_result = updates["Kết quả V2"] || updates["Kết quả  V2"];
    const v2Res = String(mappedUpdates.v2_result).trim().toUpperCase();
    if (v2Res === 'ĐẠT') {
      mappedUpdates.status = "offer";
    } else if (v2Res === 'KHÔNG ĐẠT' || v2Res === 'LOẠI') {
      mappedUpdates.status = "rejected";
    }
  }

  // Thử việc updates
  if (updates["ONBOARD"] !== undefined) {
    mappedUpdates.onboard_date = updates["ONBOARD"];
    mappedUpdates.status = "hired";
  }
  if (updates["Hết hạn TV"] !== undefined) mappedUpdates.probation_end_date = updates["Hết hạn TV"];
  if (updates["Mức lương \nTV"] !== undefined) mappedUpdates.probation_salary = updates["Mức lương \nTV"];
  if (updates["MỨC lương\nCT"] !== undefined) mappedUpdates.official_salary = updates["MỨC lương\nCT"];
  if (updates["Kết quả nhận việc"] !== undefined) mappedUpdates.probation_result = updates["Kết quả nhận việc"];

  const { data, error } = await supabase
    .from("candidates")
    .update(mappedUpdates)
    .eq("stt", stt)
    .select();

  if (error) throw error;
  return data;
}

export async function deleteCandidate(stt: number, sheet = "Tổng Hợp"): Promise<unknown> {
  const { data, error } = await supabase
    .from("candidates")
    .delete()
    .eq("stt", stt)
    .select();

  if (error) throw error;
  return data;
}

// ── VĂN THƯ ─────────────────────────────────────────────────────────────────

export type CongVan = {
  STT: number | string;
  "Ngày/Tháng": string;
  "Số văn bản": string;
  "Ngày văn bản": string;
  "Tóm nội dung chính": string;
  "Đơn vị gửi đến"?: string;
  "Đơn vị gửi đi"?: string;
  "Người nhận": string;
  "Bản Scan": string;
  "Bản gốc": string;
  "Tên file CV"?: string;
  "Tên File CV"?: string;
  [key: string]: unknown;
};

export type VanThuStats = {
  success: boolean;
  cong_van_den: number;
  cong_van_di_1: number;
  cong_van_di_2: number;
  cong_van_hdqt: number;
  tong_cong_van: number;
};

export async function fetchCongVan(sheet: string): Promise<CongVan[]> {
  if (!SCRIPT_URL) return [];
  const url = `${SCRIPT_URL}?action=getVanThuData&sheet=${encodeURIComponent(sheet)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  return json.data || [];
}

export async function fetchVanThuStats(): Promise<VanThuStats> {
  const fallback: VanThuStats = { success: false, cong_van_den: 0, cong_van_di_1: 0, cong_van_di_2: 0, cong_van_hdqt: 0, tong_cong_van: 0 };
  if (!SCRIPT_URL) return fallback;
  const url = `${SCRIPT_URL}?action=getVanThuStats`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  return json;
}

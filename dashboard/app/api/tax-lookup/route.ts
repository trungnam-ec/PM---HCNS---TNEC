import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";

// Tra cứu mã số thuế qua API CÔNG KHAI của VietQR (miễn phí, không cần khoá; dữ liệu
// lấy từ cơ quan thuế, có thể trễ vài ngày và chưa phủ hết doanh nghiệp). Đi qua máy
// chủ của mình để (1) không vướng CORS, (2) sau này đổi sang nguồn trả phí mà giao
// diện không phải sửa. Chỉ ĐỌC, không lưu gì — phần lưu do form Danh bạ đối tác làm.

export const maxDuration = 15;

const SOURCE = "https://api.vietqr.io/v2/business/";

async function lookup(code: string): Promise<{ found: boolean; name?: string; address?: string; status?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(SOURCE + encodeURIComponent(code), { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { code?: string; data?: { name?: string; address?: string; status?: string } | null };
    // "51" = nguồn không có MST này (không phải lỗi hệ thống).
    if (j.code === "51" || !j.data) return { found: false };
    if (j.code !== "00") throw new Error(`code ${j.code}`);
    return {
      found: true,
      name: j.data.name || undefined,
      address: j.data.address || undefined,
      status: j.data.status || undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  let raw = "";
  try {
    raw = String((await req.json())?.tax_code ?? "");
  } catch {
    return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
  }
  const code = raw.replace(/[^\d-]/g, "").replace(/^-+|-+$/g, "");
  if (!/^\d{10}(-\d{3})?$/.test(code)) {
    return NextResponse.json({ error: "Mã số thuế phải 10 chữ số (hoặc 13 chữ số cho chi nhánh, dạng 0123456789-001)." }, { status: 400 });
  }

  try {
    let r = await lookup(code);
    let usedBase = false;
    // Chi nhánh (đuôi -001…) nhiều khi nguồn chỉ có MST công ty mẹ: thử lại bằng 10 số đầu.
    if (!r.found && code.includes("-")) {
      r = await lookup(code.slice(0, 10));
      usedBase = r.found;
    }
    return NextResponse.json({ ...r, usedBase, checkedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { error: "Nguồn tra cứu mã số thuế tạm thời không phản hồi. Thử lại sau, hoặc kiểm tra thủ công tại tracuunnt.gdt.gov.vn." },
      { status: 502 }
    );
  }
}

import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { docSoVietNam } from "@/lib/wordExporter";

// ============================================================
// POST /api/export-advance-settlement — xuất PHIẾU THANH TOÁN TẠM ỨNG ra .xlsx
// từ mẫu public/templates/Phieu_thanh_toan_tam_ung.xlsx.
//
// ⚠ Cùng cách làm với export-atld-issue: PizZip sửa thẳng sheet XML, KHÔNG dùng
// exceljs (mẫu có drawing/printerSettings, exceljs đọc–ghi xong Excel hay từ chối mở).
//
// ⚠ BỐ CỤC MẪU (sheet "Hoc DT. 01,12,2019" = sheet2.xml, đọc từ chính file):
//   A10..A12  "Họ và tên:", "Bộ phận:", "Nội dung thanh toán:" — nhãn + giá trị CHUNG ô
//   17..30    14 dòng hóa đơn cố định: A=TT, B=Số HĐ, D=Ngày, E=Nội dung, F=Đơn giá, G=Thành tiền
//   G31       Tổng cộng (1) = SUM(G17:G30)
//   A32       Bằng chữ
//   F33/G33   "Lần 1:" + số tiền đã tạm ứng; G34 = Tổng tiền ứng (2)
//   G35       Thanh toán thêm (3.1) = (1)-(2)   — mẫu để trống, ta điền
//   G36       Hoàn ứng lại (3.2) = (2)-(1)      — mẫu không chặn số âm, ta cắt về 0
//   F39       "TP.HCM, ngày .. tháng .. năm .."
// Mẫu chỉ có 14 dòng hóa đơn; quá 14 thì từ chối chứ không xếp lệch bố cục.
// ============================================================

const TEMPLATE_FILE = "Phieu_thanh_toan_tam_ung.xlsx";
const SHEET_XML = "xl/worksheets/sheet2.xml";
const ROW_FIRST = 17;
const ROW_LAST = 30;
const MAX_ITEMS = ROW_LAST - ROW_FIRST + 1;

const s = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const escXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

type CellValue = string | number | null | { f: string; v: number };

function cellXml(ref: string, style: string, value: CellValue): string {
  if (value === null || value === "") return `<c r="${ref}"${style}/>`;
  if (typeof value === "number") return `<c r="${ref}"${style}><v>${value}</v></c>`;
  if (typeof value === "object") return `<c r="${ref}"${style}><f>${escXml(value.f)}</f><v>${value.v}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`;
}

/** Ghi một ô đã có sẵn trong mẫu, GIỮ style (viền, phông, định dạng số). */
function setCell(xml: string, ref: string, value: CellValue): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) return xml;
  const st = /\ss="(\d+)"/.exec(m[1]);
  return xml.slice(0, m.index) + cellXml(ref, st ? ` s="${st[1]}"` : "", value) + xml.slice(m.index + m[0].length);
}

function toVnDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const items: { number: string; date: string; desc: string; amount: number }[] =
      (Array.isArray(body.items) ? body.items : []).map((i: Record<string, unknown>) => ({
        number: s(i.number),
        date: s(i.date),
        desc: s(i.desc),
        amount: num(i.amount),
      }));
    if (items.length === 0) return NextResponse.json({ error: "Chưa có hóa đơn nào" }, { status: 400 });
    if (items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Mẫu chỉ có ${MAX_ITEMS} dòng hóa đơn, bạn đang chọn ${items.length}` }, { status: 400 });
    }

    const templatePath = path.join(process.cwd(), "public", "templates", TEMPLATE_FILE);
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "template_not_found", fileName: TEMPLATE_FILE }, { status: 404 });
    }
    const zip = new PizZip(fs.readFileSync(templatePath));
    let xml = zip.file(SHEET_XML)?.asText();
    if (!xml) return NextResponse.json({ error: "sheet_xml_not_found" }, { status: 500 });

    const put = (ref: string, v: CellValue) => { xml = setCell(xml!, ref, v); };

    put("A10", `Họ và tên: ${s(body.employeeName)}`);
    put("A11", `Bộ phận: ${s(body.employeeDept)}`);
    put("A12", `Nội dung thanh toán: ${s(body.mission)}`);

    for (let r = ROW_FIRST; r <= ROW_LAST; r++) {
      const it = items[r - ROW_FIRST];
      put(`A${r}`, it ? r - ROW_FIRST + 1 : null);
      put(`B${r}`, it ? it.number : null);
      put(`C${r}`, null); // mẫu cũ lặp số HĐ ở cả B và C
      put(`D${r}`, it ? toVnDate(it.date) : null);
      put(`E${r}`, it ? it.desc : null);
      put(`F${r}`, it ? it.amount : null);
      put(`G${r}`, it ? it.amount : null);
    }

    const total = items.reduce((a, i) => a + i.amount, 0);
    const advance = Math.max(0, num(body.advanceAmount));
    put("G31", { f: `SUM(G${ROW_FIRST}:G${ROW_LAST})`, v: total });
    put("A32", `Bằng chữ: ${docSoVietNam(total)}`);
    put("G33", advance);
    put("G34", { f: "SUM(G33:G33)", v: advance });
    put("G35", { f: "MAX(G31-G34,0)", v: Math.max(total - advance, 0) });
    put("G36", { f: "MAX(G34-G31,0)", v: Math.max(advance - total, 0) });

    const vn = new Date(Date.now() + 7 * 3600 * 1000); // giờ VN, server chạy UTC
    const dd = String(vn.getUTCDate()).padStart(2, "0");
    const mm = String(vn.getUTCMonth() + 1).padStart(2, "0");
    put("F39", `TP.HCM, ngày  ${dd}  tháng   ${mm}   năm ${vn.getUTCFullYear()}`);

    zip.file(SHEET_XML, xml);

    // Công thức G35 mới + G36 đổi -> chuỗi tính cũ lệch; gỡ để Excel tự dựng lại.
    zip.remove("xl/calcChain.xml");
    zip.file("xl/_rels/workbook.xml.rels", zip.file("xl/_rels/workbook.xml.rels")!.asText()
      .replace(/<Relationship [^>]*Type="[^"]*\/calcChain"[^>]*\/>/g, ""));
    zip.file("[Content_Types].xml", zip.file("[Content_Types].xml")!.asText()
      .replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, ""));

    const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("Export advance settlement error:", error);
    const msg = error instanceof Error ? error.message : "Error exporting template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";

// ============================================================
// POST /api/export-atld-issue — tải PHIẾU XUẤT KHO BHLĐ ra .xlsx từ mẫu
// public/templates/Phieu_xuat_kho_atld.xlsx (user yêu cầu 02/10/2026).
//
// ⚠ KHÔNG dùng exceljs: mẫu này có `xl/externalLinks/*` + `xl/printerSettings/*`
// — đúng loại mẫu exceljs đọc–ghi xong Excel từ chối mở (xem export-purchase-order).
// Cách làm: PizZip, sửa thẳng `xl/worksheets/sheet1.xml`, phần khác giữ nguyên văn.
//
// Hai chỗ CỐ Ý sửa ngoài sheet1.xml:
//   • Gỡ externalLink: công thức của mẫu tra tên/ĐVT từ file "XUAT_NHAP_KHO
//     ATLD.xlsx" trên máy người soạn mẫu. Route ghi thẳng giá trị nên không cần
//     link, mà để lại thì Excel hỏi "cập nhật liên kết" mỗi lần mở.
//   • Gỡ calcChain.xml: công thức cũ bị thay, chuỗi tính cũ trỏ ô không còn công
//     thức -> Excel báo "sửa chữa nội dung". Excel tự dựng lại khi mở.
//
// ⚠ BỐ CỤC MẪU (đọc từ chính file, đừng đoán):
//   A6..A9   "Số:", "Họ và tên:", "Nội dung:", "Địa chỉ:" — nhãn + giá trị CHUNG ô
//   11..12   tiêu đề bảng (gộp 2 tầng)
//   13..14   2 dòng hàng mẫu -> route nhân/xoá cho đủ số dòng của phiếu, các dòng
//            từ 15 trở xuống (tổng, VAT, vận chuyển, chữ ký) đẩy theo.
//   15..19   Tổng chưa VAT · VAT (F = %) · Tổng có VAT · Vận chuyển · Tổng cộng
//   22       "TP.HCM, Ngày … Tháng … Năm …" (ô E)
// ============================================================

const TEMPLATE_FILE = "Phieu_xuat_kho_atld.xlsx";
const SHEET_XML = "xl/worksheets/sheet1.xml";
const ROW_ITEM_FIRST = 13;
const TEMPLATE_ITEM_ROWS = 2;   // dòng 13, 14
const ROW_TOTAL = 15;           // dòng đầu tiên sau bảng hàng trong mẫu

const s = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const escXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   // Ký tự điều khiển lọt vào là Excel báo file hỏng.
   .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

type CellValue = string | number | null | { f: string; v: number };

function cellXml(ref: string, style: string, value: CellValue): string {
  if (value === null || value === "") return `<c r="${ref}"${style}/>`;
  if (typeof value === "number") return `<c r="${ref}"${style}><v>${value}</v></c>`;
  if (typeof value === "object") return `<c r="${ref}"${style}><f>${escXml(value.f)}</f><v>${value.v}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`;
}

/** Ghi một ô đã có sẵn trong mẫu, GIỮ style `s` (viền, phông, định dạng số). */
function setCell(xml: string, ref: string, value: CellValue): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) return xml;
  const st = /\ss="(\d+)"/.exec(m[1]);
  return xml.slice(0, m.index) + cellXml(ref, st ? ` s="${st[1]}"` : "", value) + xml.slice(m.index + m[0].length);
}

/** Style từng cột (A..H) của một dòng mẫu. */
function rowStyles(rowXml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(\/>|>)/g)) {
    const st = /\ss="(\d+)"/.exec(m[2]);
    out.set(m[1], st ? ` s="${st[1]}"` : "");
  }
  return out;
}

/** Đổi số dòng của một <row> (thẻ row + mọi ô bên trong). */
function moveRow(rowXml: string, to: number): string {
  return rowXml
    .replace(/^<row r="\d+"/, `<row r="${to}"`)
    .replace(/<c r="([A-Z]+)\d+"/g, `<c r="$1${to}"`);
}

function ngayDong(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "TP.HCM, Ngày … Tháng … Năm …";
  return `TP.HCM, Ngày ${d} Tháng ${m} Năm ${y}`;
}

type Line = { code: string; name: string; unit: string; qty: number; price: number | null; note: string };

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const templatePath = path.join(process.cwd(), "public", "templates", TEMPLATE_FILE);
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "template_not_found", fileName: TEMPLATE_FILE }, { status: 404 });
    }

    const zip = new PizZip(fs.readFileSync(templatePath));
    const sheet = zip.file(SHEET_XML)?.asText();
    if (!sheet) return NextResponse.json({ error: "sheet_xml_not_found" }, { status: 500 });

    const lines: Line[] = (Array.isArray(body.lines) ? body.lines : []).map((l: Record<string, unknown>) => ({
      code: s(l.code),
      name: s(l.name),
      unit: s(l.unit),
      qty: num(l.qty),
      price: l.price == null || l.price === "" ? null : num(l.price),
      note: s(l.note),
    }));
    const nItems = Math.max(lines.length, 1);
    const delta = nItems - TEMPLATE_ITEM_ROWS;

    // ─── Tách sheetData thành từng <row> ───
    const open = sheet.indexOf("<sheetData>");
    const close = sheet.indexOf("</sheetData>");
    const head = sheet.slice(0, open + "<sheetData>".length);
    const tail = sheet.slice(close);
    const rows = new Map<number, string>();
    for (const m of sheet.slice(open, close).matchAll(/<row r="(\d+)"[^>]*?(\/>|>[\s\S]*?<\/row>)/g)) {
      rows.set(Number(m[1]), m[0]);
    }
    const tplFirst = rows.get(ROW_ITEM_FIRST)!;
    const tplNext = rows.get(ROW_ITEM_FIRST + 1)!;

    // ─── Dòng hàng ───
    const itemRows: string[] = [];
    for (let i = 0; i < nItems; i++) {
      const r = ROW_ITEM_FIRST + i;
      const tpl = i === 0 ? tplFirst : tplNext;
      const st = rowStyles(tpl);
      const openTag = /^<row [^>]*>/.exec(tpl)![0].replace(/r="\d+"/, `r="${r}"`);
      const l = lines[i];
      const cells: [string, CellValue][] = l
        ? [
            ["A", i + 1],
            ["B", l.code],
            ["C", l.name],
            ["D", l.unit],
            ["E", l.qty],
            ["F", l.price],
            ["G", l.price == null ? null : { f: `E${r}*F${r}`, v: l.qty * l.price }],
            ["H", l.note],
          ]
        : (["A", "B", "C", "D", "E", "F", "G", "H"].map((c) => [c, null]) as [string, CellValue][]);
      itemRows.push(openTag + cells.map(([c, v]) => cellXml(`${c}${r}`, st.get(c) || "", v)).join("") + "</row>");
    }

    // ─── Ghép lại: dòng 1..12 giữ nguyên, bảng hàng mới, dòng 15.. đẩy theo delta ───
    const before: string[] = [];
    const after: string[] = [];
    for (const [n, xml] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      if (n < ROW_ITEM_FIRST) before.push(xml);
      else if (n >= ROW_TOTAL) after.push(moveRow(xml, n + delta));
    }
    let xml = head + before.join("") + itemRows.join("") + after.join("") + tail;

    // Ô gộp + vùng dữ liệu dưới bảng hàng cũng đẩy theo.
    xml = xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g, (all, c1, r1, c2, r2) => {
      const a = Number(r1), b = Number(r2);
      if (a < ROW_TOTAL) return all;
      return `<mergeCell ref="${c1}${a + delta}:${c2}${b + delta}"/>`;
    });
    xml = xml.replace(/<dimension ref="A1:([A-Z]+)(\d+)"\/>/, (_a, c, r) => `<dimension ref="A1:${c}${Number(r) + delta}"/>`);

    // Mẫu gốc in ra cột "Ghi chú" rơi sang trang 2 (đã đo bằng Excel) -> co vừa
    // 1 trang NGANG, chiều dọc để tự nhiên. sheetPr phải là phần tử con đầu tiên.
    if (!xml.includes("<sheetPr")) {
      xml = xml.replace(/(<worksheet [^>]*>)/, `$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`);
      xml = xml.replace(/<pageSetup /, `<pageSetup fitToWidth="1" fitToHeight="0" `);
    }

    const put = (ref: string, v: CellValue) => { xml = setCell(xml, ref, v); };

    // ─── Đầu phiếu (giữ khoảng trắng đầu dòng của mẫu để canh lề như bản gốc) ───
    put("A6", `                                                         Số: ${s(body.soPhieu)}`);
    put("A7", `            Họ và tên: ${s(body.hoTen)}`);
    put("A8", `            Nội dung: ${s(body.noiDung)}`);
    put("A9", `            Địa chỉ: ${s(body.diaChi)}`);

    // ─── Tổng ───
    const last = ROW_ITEM_FIRST + nItems - 1;
    const T = ROW_TOTAL + delta;
    const tongSL = lines.reduce((a, l) => a + l.qty, 0);
    const tienHang = lines.reduce((a, l) => a + (l.price == null ? 0 : l.qty * l.price), 0);
    const vat = num(body.vatPercent) / 100;
    const tienVat = tienHang * vat;
    const ship = num(body.phiVanChuyen);
    put(`E${T}`, { f: `SUM(E${ROW_ITEM_FIRST}:E${last})`, v: tongSL });
    put(`G${T}`, { f: `SUM(G${ROW_ITEM_FIRST}:G${last})`, v: tienHang });
    put(`F${T + 1}`, vat);
    put(`G${T + 1}`, { f: `IFERROR(G${T}*F${T + 1},0)`, v: tienVat });
    put(`G${T + 2}`, { f: `G${T}+G${T + 1}`, v: tienHang + tienVat });
    put(`G${T + 3}`, ship);
    put(`G${T + 4}`, { f: `G${T + 2}+G${T + 3}`, v: tienHang + tienVat + ship });
    put(`E${22 + delta}`, ngayDong(s(body.ngay)));

    zip.file(SHEET_XML, xml);

    // ─── Gỡ externalLink + calcChain (lý do ở đầu file) ───
    for (const f of Object.keys(zip.files)) {
      if (f.startsWith("xl/externalLinks/") || f === "xl/calcChain.xml") zip.remove(f);
    }
    const wb = zip.file("xl/workbook.xml")!.asText()
      .replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, "")
      .replace(/<calcPr ([^>]*?)\/>/, (_a, attrs) => `<calcPr ${attrs.replace(/\s*fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`);
    zip.file("xl/workbook.xml", wb);
    const rels = zip.file("xl/_rels/workbook.xml.rels")!.asText()
      .replace(/<Relationship [^>]*Type="[^"]*\/(externalLink|calcChain)"[^>]*\/>/g, "");
    zip.file("xl/_rels/workbook.xml.rels", rels);
    const ct = zip.file("[Content_Types].xml")!.asText()
      .replace(/<Override PartName="\/xl\/(externalLinks\/[^"]+|calcChain\.xml)"[^>]*\/>/g, "");
    zip.file("[Content_Types].xml", ct);

    const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(String(body.fileName || "Phieu_xuat_kho_atld.xlsx"))}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("Export ATLD issue error:", error);
    const msg = error instanceof Error ? error.message : "Error exporting template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

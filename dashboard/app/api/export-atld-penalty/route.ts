import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { docSoVietNam } from "@/lib/wordExporter";

// ============================================================
// POST /api/export-atld-penalty — "Xuất phiếu" QUYẾT ĐỊNH XỬ PHẠT nhà thầu từ mẫu
// public/templates/Quyet_dinh_xu_phat_nha_thau_2.xlsx (user yêu cầu 09/10/2026; bản _2
// thay bản đầu, thêm các dòng căn cứ + "Căn cứ hợp đồng.......").
// Dữ liệu do client gom sẵn (lib/atldPenalties.ts > downloadPenaltyDecision).
//
// Cùng cách làm với export-atld-issue: PizZip sửa thẳng sheet1.xml, KHÔNG exceljs
// (mẫu có externalLink + printerSettings). Gỡ externalLink kèm các definedName
// cfg_* trỏ vào nó ([1]THAM_SO!…) — để lại tên trỏ link đã gỡ là Excel báo hỏng.
//
// ⚠ BỐ CỤC MẪU: KHÔNG ghi cứng số dòng — user sửa mẫu trong Excel (09/10/2026 bớt
// bảng từ 6 xuống 4 dòng làm phiếu lệch hết). Route dò ô theo chữ đầu ô trong mẫu:
//   "STT" (tiêu đề bảng) .. "TỔNG TIỀN PHẠT" = các dòng chi tiết trống; nhiều vi phạm
//   hơn số dòng trống thì chèn thêm, phần dưới đẩy theo.
//   "Số:", "TP. Hồ Chí Minh, ngày", "Căn cứ hồ sơ vụ việc", "- Đơn vị bị xử phạt",
//   "- Dự án/địa điểm", "Căn cứ hợp đồng" (số HĐ của nhà thầu), "Bằng chữ",
//   "Điều 2.", "Đơn vị/cá nhân bị xử phạt",
//   "- Người vi phạm" (cột nguoi_vi_pham, 148 — trống thì giữ "……" của mẫu),
//   "NGƯỜI LẬP" (tên người ký nằm 3 dòng dưới).
// ============================================================

const TEMPLATE_FILE = "Quyet_dinh_xu_phat_nha_thau_2.xlsx";
const SHEET_XML = "xl/worksheets/sheet1.xml";

const s = (v: unknown) => String(v ?? "").trim();
const numOrNull = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const escXml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const unescXml = (v: string) =>
  v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

type CellValue = string | number | null | { f: string; v: number };
type TextCell = { col: string; row: number; text: string };

function cellXml(ref: string, style: string, value: CellValue): string {
  if (value === null || value === "") return `<c r="${ref}"${style}/>`;
  if (typeof value === "number") return `<c r="${ref}"${style}><v>${value}</v></c>`;
  if (typeof value === "object") return `<c r="${ref}"${style}><f>${escXml(value.f)}</f><v>${value.v}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escXml(value)}</t></is></c>`;
}

/** Ghi một ô đã có sẵn trong mẫu, GIỮ style `s`. */
function setCell(xml: string, ref: string, value: CellValue): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) return xml;
  const st = /\ss="(\d+)"/.exec(m[1]);
  return xml.slice(0, m.index) + cellXml(ref, st ? ` s="${st[1]}"` : "", value) + xml.slice(m.index + m[0].length);
}

function rowStyles(rowXml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(\/>|>)/g)) {
    const st = /\ss="(\d+)"/.exec(m[2]);
    out.set(m[1], st ? ` s="${st[1]}"` : "");
  }
  return out;
}

function moveRow(rowXml: string, to: number): string {
  return rowXml
    .replace(/^<row r="\d+"/, `<row r="${to}"`)
    .replace(/<c r="([A-Z]+)\d+"/g, `<c r="$1${to}"`);
}

/** Mọi ô chữ (chuỗi dùng chung) của sheet mẫu. */
function textCells(sheet: string, shared: string[]): TextCell[] {
  const out: TextCell[] = [];
  for (const m of sheet.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?t="s"[^>]*><v>(\d+)<\/v><\/c>/g)) {
    out.push({ col: m[1], row: Number(m[2]), text: shared[Number(m[3])] ?? "" });
  }
  return out;
}

// Cao dòng theo số dòng chữ ước tính (Arial 12.5): cột B ~25, C ~16, G ~36 ký tự/dòng.
function rowHeight(texts: [string, number][]): number {
  const lines = Math.max(1, ...texts.map(([t, cpl]) => t.split("\n").reduce((a, p) => a + Math.max(1, Math.ceil(p.length / cpl)), 0)));
  return Math.max(20.25, lines * 17 + 4);
}

const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? { d, m, y } : null;
};

type Line = { noiDung: string; canCu: string; sl: number | null; mucPhat: number | null; thanhTien: number | null; khacPhuc: string };

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
    const shared = [...(zip.file("xl/sharedStrings.xml")?.asText() || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      unescXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""))
    );
    const cellsText = textCells(sheet, shared);
    const find = (prefix: string) => cellsText.find((c) => c.text.trim().startsWith(prefix)) || null;

    const headCell = find("STT");
    const totalCell = find("TỔNG TIỀN PHẠT");
    if (!headCell || !totalCell) {
      return NextResponse.json({ error: "Mẫu Quyết định xử phạt thiếu tiêu đề bảng (STT) hoặc dòng TỔNG TIỀN PHẠT." }, { status: 500 });
    }
    const ROW_ITEM_FIRST = headCell.row + 1;
    const ROW_TOTAL = totalCell.row;
    const templateItemRows = Math.max(1, ROW_TOTAL - ROW_ITEM_FIRST);

    const lines: Line[] = (Array.isArray(body.lines) ? body.lines : []).map((l: Record<string, unknown>) => ({
      noiDung: s(l.noiDung),
      canCu: s(l.canCu),
      sl: numOrNull(l.sl),
      mucPhat: numOrNull(l.mucPhat),
      thanhTien: numOrNull(l.thanhTien),
      khacPhuc: s(l.khacPhuc),
    }));
    const nItems = Math.max(lines.length, templateItemRows);
    const delta = nItems - templateItemRows;
    // Ô tìm thấy trong mẫu gốc -> địa chỉ sau khi chèn dòng.
    const at = (c: TextCell | null) => (c ? `${c.col}${c.row + (c.row >= ROW_TOTAL ? delta : 0)}` : null);

    // ─── Tách sheetData thành từng <row> ───
    const open = sheet.indexOf("<sheetData>");
    const close = sheet.indexOf("</sheetData>");
    const head = sheet.slice(0, open + "<sheetData>".length);
    const tail = sheet.slice(close);
    const rows = new Map<number, string>();
    for (const m of sheet.slice(open, close).matchAll(/<row r="(\d+)"[^>]*?(\/>|>[\s\S]*?<\/row>)/g)) {
      rows.set(Number(m[1]), m[0]);
    }
    const tpl = rows.get(ROW_ITEM_FIRST)!;
    const st = rowStyles(tpl);

    // ─── Dòng chi tiết vi phạm ───
    const itemRows: string[] = [];
    for (let i = 0; i < nItems; i++) {
      const r = ROW_ITEM_FIRST + i;
      const l = lines[i];
      let openTag = /^<row [^>]*>/.exec(tpl)![0].replace(/r="\d+"/, `r="${r}"`);
      if (l) openTag = openTag.replace(/ht="[\d.]+"/, `ht="${rowHeight([[l.noiDung, 25], [l.canCu, 16], [l.khacPhuc, 36]])}"`);
      const cells: [string, CellValue][] = l
        ? [["A", i + 1], ["B", l.noiDung], ["C", l.canCu], ["D", l.sl], ["E", l.mucPhat], ["F", l.thanhTien], ["G", l.khacPhuc]]
        : (["A", "B", "C", "D", "E", "F", "G"].map((c) => [c, null]) as [string, CellValue][]);
      itemRows.push(openTag + cells.map(([c, v]) => cellXml(`${c}${r}`, st.get(c) || "", v)).join("") + "</row>");
    }

    const before: string[] = [];
    const after: string[] = [];
    for (const [n, xml] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
      if (n < ROW_ITEM_FIRST) before.push(xml);
      else if (n >= ROW_TOTAL) after.push(moveRow(xml, n + delta));
    }
    let xml = head + before.join("") + itemRows.join("") + after.join("") + tail;

    xml = xml.replace(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g, (all, c1, r1, c2, r2) => {
      const a = Number(r1), b = Number(r2);
      if (a < ROW_TOTAL) return all;
      return `<mergeCell ref="${c1}${a + delta}:${c2}${b + delta}"/>`;
    });
    xml = xml.replace(/<dimension ref="A1:([A-Z]+)(\d+)"\/>/, (_a, c, r) => `<dimension ref="A1:${c}${Number(r) + delta}"/>`);

    const put = (ref: string | null, v: CellValue) => { if (ref) xml = setCell(xml, ref, v); };
    // Thay "……" của mẫu bằng giá trị, giữ nguyên phần chữ còn lại.
    const fill = (c: TextCell | null, v: string) => { if (c && v) put(at(c), c.text.replace(/…+/, v)); };

    // ─── Đầu quyết định + Điều 1 ───
    if (s(body.soQd)) put(at(find("Số:")), `Số: ${s(body.soQd)}`);
    const nbh = dmy(s(body.ngayBanHanh));
    if (nbh) put(at(find("TP. Hồ Chí Minh, ngày")), `TP. Hồ Chí Minh, ngày ${nbh.d} tháng ${nbh.m} năm ${nbh.y}`);
    fill(find("Căn cứ hồ sơ vụ việc"), s(body.maHoSo));
    fill(find("- Đơn vị bị xử phạt"), s(body.nhaThau));
    fill(find("- Người vi phạm"), s(body.nguoiViPham));
    fill(find("- Dự án/địa điểm"), s(body.duAn));
    // Mẫu ghi "Căn cứ hợp đồng......." (chấm thường, không phải "……").
    const hd = find("Căn cứ hợp đồng");
    if (hd && s(body.soHopDong)) put(at(hd), hd.text.replace(/\s*(…+|\.{3,})\s*$/, ` số ${s(body.soHopDong)};`));

    // ─── Tổng: có thành tiền từng dòng thì cộng bằng công thức, không thì lấy tổng hồ sơ ───
    const last = ROW_ITEM_FIRST + nItems - 1;
    const hasAmounts = lines.some((l) => l.thanhTien != null);
    const total = hasAmounts ? lines.reduce((a, l) => a + (l.thanhTien ?? 0), 0) : numOrNull(body.tongTien) ?? 0;
    put(`F${ROW_TOTAL + delta}`, hasAmounts ? { f: `SUM(F${ROW_ITEM_FIRST}:F${last})`, v: total } : total);
    put(at(find("Bằng chữ")), `Bằng chữ: ${docSoVietNam(total)}`);

    // ─── Điều 2: có hạn thì ghi sau tiêu đề + vào chỗ "trước ngày ……" ───
    const han = dmy(s(body.hanKhacPhuc));
    if (han) {
      const hanText = `${han.d}/${han.m}/${han.y}`;
      const dieu2 = find("Điều 2.");
      if (dieu2) put(at(dieu2), `${dieu2.text.trim()} ${hanText}`);
      fill(find("Đơn vị/cá nhân bị xử phạt"), hanText);
    }

    // ─── Tên người ký (Ban giám đốc để trống) ───
    const signer = find("NGƯỜI LẬP");
    const namesRow = signer ? signer.row + 3 + delta : 0;
    if (namesRow) {
      put(`A${namesRow}`, s(body.nguoiLap) || null);
      put(`C${namesRow}`, s(body.phongAtld) || null);
      // Chỗ ký trong mẫu chỉ cao 20pt; lề dưới 0.5" để ảnh chân trang (~1.15") đè
      // mất dòng tên (đã đo bằng Excel) -> nới chỗ ký + đẩy lề dưới ra khỏi ảnh.
      xml = xml.replace(new RegExp(`(<row r="${namesRow - 1}"[^>]*?)ht="[\\d.]+"`), `$1ht="60"`);
      xml = xml.replace(/(<pageMargins [^>]*?)bottom="[\d.]+"/, `$1bottom="1.5"`);
    }

    zip.file(SHEET_XML, xml);

    // ─── Gỡ externalLink + tên cfg_* trỏ vào nó; vùng in kéo tới dòng tên người ký ───
    for (const f of Object.keys(zip.files)) {
      if (f.startsWith("xl/externalLinks/") || f === "xl/calcChain.xml") zip.remove(f);
    }
    const wb = zip.file("xl/workbook.xml")!.asText()
      .replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, "")
      .replace(/<definedName [^>]*>\[\d+\][^<]*<\/definedName>/g, "")
      .replace(/(<definedName name="_xlnm\.Print_Area"[^>]*>[^<]*\$A\$1:\$G\$)(\d+)/, (_a, p, r) => `${p}${Math.max(Number(r) + delta, namesRow)}`)
      .replace(/<definedNames><\/definedNames>/, "")
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
        "Content-Disposition": `attachment; filename="${encodeURIComponent(String(body.fileName || TEMPLATE_FILE))}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("Export ATLD penalty error:", error);
    const msg = error instanceof Error ? error.message : "Error exporting template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ============================================================
// Kho BHLĐ — đọc danh mục sản phẩm từ file Excel (logic thuần, không gọi CSDL).
//
// Nhận được 2 kiểu file:
//   • File mẫu của hệ thống: Mã SP | Tên SP | Size SP | Đơn vị tính | Tồn tối thiểu | Ghi chú
//   • File Excel cũ "XUAT_NHAP_KHO ATLD.xlsx": sheet "Quan Ly", hàng 4 là tên cột
//     (Mã SP | Tên Sản Phẩm | Đơn Vị Tính | … | Ghi Chú). File đó ghi SIZE ở cột
//     "Ghi Chú" -> khi không có cột "Size" thì cột "Ghi chú" được hiểu là size.
// Không cần đúng thứ tự cột hay đúng sheet: DÒ trong mọi sheet hàng nào có cả cột
// mã lẫn cột tên (tên cột so gần đúng, bỏ dấu).
// ============================================================

export type ImportField = "code" | "name" | "size" | "color" | "unit" | "min_stock" | "note";

export type ParsedItemRow = {
  line: number;          // số dòng trong Excel (để người dùng dò lại)
  code: string;
  name: string;
  size: string;
  color: string;
  unit: string;
  min_stock: number;
  note: string;
};

export type ParseResult = {
  sheetName: string;
  sizeFromNote: boolean; // true = không có cột Size, đã lấy cột Ghi chú làm size
  rows: ParsedItemRow[];
};

export function fold(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldOf(header: string): ImportField | "note_or_size" | null {
  const h = fold(header);
  if (!h) return null;
  if (/^(ma sp|ma san pham|ma hang|ma vat tu|ma)$/.test(h)) return "code";
  if (/^(ten sp|ten san pham|ten hang|ten vat tu|ten)$/.test(h)) return "name";
  if (/^(size|size sp|kich co|co)$/.test(h)) return "size";
  if (/^(mau|mau sac)$/.test(h)) return "color";
  if (/^(dvt|don vi tinh|don vi)$/.test(h)) return "unit";
  if (/toi thieu|^min/.test(h)) return "min_stock";
  if (/^ghi chu$/.test(h)) return "note_or_size";
  return null;
}

type Header = { headerLine: number; cols: Partial<Record<ImportField, number>>; sizeFromNote: boolean };

function findHeader(aoa: unknown[][]): Header | null {
  const limit = Math.min(aoa.length, 30);
  for (let i = 0; i < limit; i++) {
    const row = aoa[i] || [];
    const cols: Partial<Record<ImportField, number>> = {};
    let noteCol: number | undefined;
    row.forEach((cell, j) => {
      const f = fieldOf(String(cell ?? ""));
      if (f === "note_or_size") {
        if (noteCol === undefined) noteCol = j;
      } else if (f && cols[f] === undefined) {
        cols[f] = j;
      }
    });
    if (cols.code === undefined || cols.name === undefined) continue;
    let sizeFromNote = false;
    if (noteCol !== undefined) {
      if (cols.size === undefined) {
        cols.size = noteCol;
        sizeFromNote = true;
      } else {
        cols.note = noteCol;
      }
    }
    return { headerLine: i, cols, sizeFromNote };
  }
  return null;
}

// sheets: [tên sheet, mảng 2 chiều (sheet_to_json header:1)]
// File cũ ghi màu lẫn vào cột size ("Vàng", "Trắng", "Đỏ", "Xám nhạt"). Nhận ra
// giá trị là MÀU thì tách sang cột màu; 4 màu chuẩn đổi về đúng nhãn của dropdown.
const CANON_COLOR: Record<string, string> = { trang: "Trắng", vang: "Vàng", xanh: "Xanh", do: "Đỏ" };
export function asColor(v: string): string | null {
  const k = fold(v);
  if (!k) return null;
  if (CANON_COLOR[k]) return CANON_COLOR[k];
  if (/^(xanh|xam|den|cam|hong|tim|nau|bac|ghi)( .+)?$/.test(k)) return v.trim();
  return null;
}

export function parseItemSheets(sheets: [string, unknown[][]][]): ParseResult | null {
  for (const [sheetName, aoa] of sheets) {
    const h = findHeader(aoa);
    if (!h) continue;
    const get = (r: unknown[], f: ImportField) => {
      const i = h.cols[f];
      return i === undefined || r[i] == null ? "" : String(r[i]).replace(/\r/g, "").replace(/\s+/g, " ").trim();
    };
    const rows: ParsedItemRow[] = [];
    aoa.slice(h.headerLine + 1).forEach((r, k) => {
      const row = r || [];
      const code = get(row, "code");
      const name = get(row, "name");
      if (!code && !name) return;                 // dòng trống
      if (/^(tong|tong cong|cong)\b/.test(fold(code || name))) return; // dòng tổng
      const minRaw = get(row, "min_stock").replace(/[.,\s](?=\d{3}\b)/g, "").replace(",", ".");
      const min = Number(minRaw);
      let size = get(row, "size");
      let color = get(row, "color");
      if (color) color = asColor(color) || color;
      else if (asColor(size)) {
        color = asColor(size) as string;
        size = "";
      }
      rows.push({
        line: h.headerLine + k + 2,
        code,
        name,
        size,
        color,
        unit: get(row, "unit"),
        min_stock: Number.isFinite(min) && min > 0 ? min : 0,
        note: get(row, "note"),
      });
    });
    if (rows.length) return { sheetName, sizeFromNote: h.sizeFromNote, rows };
  }
  return null;
}

export type ReviewKind = "new" | "exists" | "dup_in_file" | "error";

export type ReviewedRow = ParsedItemRow & { kind: ReviewKind; message: string };

// Đối chiếu với danh mục đang có. Mã đã có -> BỎ QUA (không ghi đè dữ liệu đang
// dùng); muốn đổi tên/size của mã cũ thì sửa tay trong bảng.
export function reviewRows(rows: ParsedItemRow[], existingCodes: string[]): ReviewedRow[] {
  const existing = new Set(existingCodes.map((c) => c.trim().toLowerCase()));
  const seenCode = new Map<string, number>();
  const seenNameSize = new Map<string, string>();
  return rows.map((r) => {
    const key = r.code.trim().toLowerCase();
    if (!r.code) return { ...r, kind: "error", message: "Thiếu Mã SP" };
    if (!r.name) return { ...r, kind: "error", message: "Thiếu Tên SP" };
    if (existing.has(key)) return { ...r, kind: "exists", message: "Mã đã có trong danh mục — bỏ qua" };
    if (seenCode.has(key)) return { ...r, kind: "dup_in_file", message: `Trùng mã với dòng ${seenCode.get(key)} — bỏ qua` };
    seenCode.set(key, r.line);
    const ns = `${fold(r.name)}|${fold(r.size)}|${fold(r.color)}`;
    const twin = seenNameSize.get(ns);
    if (!twin) seenNameSize.set(ns, r.code);
    return { ...r, kind: "new", message: twin ? `Cùng tên + size + màu với ${twin} — kiểm tra lại size` : "" };
  });
}

export const TEMPLATE_HEADER = ["Mã SP", "Tên SP", "Size SP", "Màu sắc", "Đơn vị tính", "Tồn tối thiểu", "Ghi chú"];
export const TEMPLATE_SAMPLE = [
  ["PPE001", "Quần áo CN (Mẫu cũ)", "M", "", "Bộ", 5, ""],
  ["PPE001.1", "Quần áo CN (Mẫu cũ)", "L", "", "Bộ", 5, ""],
  ["PPE016", "Nón công nhân", "", "Vàng", "Cái", 20, ""],
  ["PPE020", "Giày", "40", "", "Đôi", 2, ""],
];

// ============================================================
// TỒN ĐẦU KỲ TỪ SHEET "Chi Tiet" (file Excel cũ)
//
// User chốt 02/10/2026: tồn đầu kỳ phải TÍNH bằng công thức như Excel
// (Tồn = Σ Nhập − Σ Xuất theo từng Mã SP), không chép tay cột "Tồn Cuối".
// Đơn giá = giá NHẬP gần nhất của mã đó trong Chi Tiet. Tồn âm (lỗi nhập liệu
// của Excel) -> 0 và liệt kê để kiểm kê lại.
// Đọc sheet bằng { cellDates: true } + sheet_to_json(raw: true) để có Date thật.
// ============================================================

export type LedgerAgg = {
  code: string;
  nhap: number;
  xuat: number;
  ton: number;            // = nhap − xuat (công thức như Excel)
  lastPrice: number | null;
  lines: number;          // số dòng giao dịch của mã trong sheet
};

export type LedgerParse = { sheetName: string; aggs: LedgerAgg[]; skipped: number; lastDate: Date | null };

type LedgerField = "ngay" | "code" | "loai" | "qty" | "price";

function ledgerFieldOf(header: string): LedgerField | null {
  const h = fold(header);
  if (/^(ngay|ngay phieu|ngay nhap xuat)$/.test(h)) return "ngay";
  if (/^(ma sp|ma san pham|ma hang|ma vat tu)$/.test(h)) return "code";
  if (/^(loai|loai phieu|nhap\/xuat)$/.test(h)) return "loai";
  if (/^(so luong|sl)$/.test(h)) return "qty";
  if (/^(don gia|gia)$/.test(h)) return "price";
  return null;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  // Ô trống phải là "không có số" — Number("") = 0 sẽ biến ô giá bỏ trống thành giá 0.
  if (v == null || String(v).trim() === "") return NaN;
  const s = String(v).replace(/[\s.,](?=\d{3}\b)/g, "").replace(",", ".").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const m = String(v ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

export function parseLedgerSheets(sheets: [string, unknown[][]][]): LedgerParse | null {
  for (const [sheetName, aoa] of sheets) {
    const limit = Math.min(aoa.length, 30);
    for (let i = 0; i < limit; i++) {
      const cols: Partial<Record<LedgerField, number>> = {};
      (aoa[i] || []).forEach((cell, j) => {
        const f = ledgerFieldOf(String(cell ?? ""));
        if (f && cols[f] === undefined) cols[f] = j;
      });
      if (cols.code === undefined || cols.loai === undefined || cols.qty === undefined) continue;

      const by = new Map<string, LedgerAgg & { lastPriceAt: number }>();
      let skipped = 0;
      let lastDate: Date | null = null;
      aoa.slice(i + 1).forEach((r, k) => {
        const row = r || [];
        const code = String(row[cols.code!] ?? "").trim();
        if (!code) return;
        const loai = fold(row[cols.loai!]);
        const qty = toNumber(row[cols.qty!]);
        if (!(loai === "nhap" || loai === "xuat") || !Number.isFinite(qty)) {
          skipped++;
          return;
        }
        const key = code.toLowerCase();
        const a = by.get(key) || { code, nhap: 0, xuat: 0, ton: 0, lastPrice: null, lines: 0, lastPriceAt: -1 };
        a.lines++;
        if (loai === "nhap") a.nhap += qty;
        else a.xuat += qty;
        const d = cols.ngay !== undefined ? toDate(row[cols.ngay]) : null;
        if (d && (!lastDate || d > lastDate)) lastDate = d;
        if (loai === "nhap" && cols.price !== undefined) {
          const p = toNumber(row[cols.price]);
          // Giá nhập GẦN NHẤT: so theo ngày, cùng ngày thì dòng sau thắng.
          const at = d ? d.getTime() : k;
          if (Number.isFinite(p) && p > 0 && at >= a.lastPriceAt) {
            a.lastPrice = p;
            a.lastPriceAt = at;
          }
        }
        by.set(key, a);
      });
      if (!by.size) continue;
      const aggs: LedgerAgg[] = [...by.values()].map((a) => ({
        code: a.code, nhap: a.nhap, xuat: a.xuat, ton: a.nhap - a.xuat, lastPrice: a.lastPrice, lines: a.lines,
      }));
      return { sheetName, aggs, skipped, lastDate };
    }
  }
  return null;
}

export type OpeningKind = "ok" | "negative" | "zero" | "no_item" | "no_price";

export type OpeningRow = LedgerAgg & {
  itemId: string | null;
  name: string;
  size: string;
  qty: number;      // số đưa vào phiếu tồn đầu kỳ (âm -> 0)
  kind: OpeningKind;
};

// Ghép kết quả Chi Tiet với danh mục đã có trong hệ thống (khớp Mã SP).
export function buildOpeningRows(
  aggs: LedgerAgg[],
  items: { id: string; code: string; name: string; size: string | null }[]
): OpeningRow[] {
  const byCode = new Map(items.map((i) => [i.code.trim().toLowerCase(), i]));
  return aggs
    .map((a) => {
      const it = byCode.get(a.code.toLowerCase());
      let kind: OpeningKind = "ok";
      if (!it) kind = "no_item";
      else if (a.ton < 0) kind = "negative";
      else if (a.ton === 0) kind = "zero";
      else if (!a.lastPrice) kind = "no_price";
      return {
        ...a,
        itemId: it?.id ?? null,
        name: it?.name ?? "",
        size: it?.size ?? "",
        qty: kind === "ok" ? a.ton : 0,
        kind,
      };
    })
    .sort((x, y) => x.code.localeCompare(y.code, "vi", { numeric: true }));
}

// Đánh dấu phiếu tồn đầu kỳ để chặn tạo lần hai.
export const OPENING_MARK = "Tồn đầu kỳ chuyển từ Excel";

// ============================================================
// LỊCH SỬ GIÁ NHẬP + GIÁ XUẤT TỪ SHEET "Chi Tiet" (tab Giá nhập kho, migration 120)
// Lấy MỌI dòng Nhập và Xuất: ngày, mã, số lượng, đơn giá, NCC/KH, chứng từ
// (Báo giá/HĐ). CHỈ ĐỂ TRA GIÁ — không đụng sổ kho. Dòng xuất thiếu giá vẫn lấy
// (Excel bỏ trống đơn giá ở 33 dòng xuất) — đơn giá để trống.
// ============================================================

export type TradeRow = {
  line: number;
  loai: "nhap" | "xuat";
  ngay: string | null;    // yyyy-mm-dd
  code: string;
  qty: number;
  unitPrice: number | null;
  doiTac: string;          // cột "NCC/KH"
  chungTu: string;
};

function purchaseFieldOf(header: string): LedgerField | "supplier" | "chung_tu" | null {
  const h = fold(header);
  // "Khách hàng" = tên cột trong file "Tải về" của tab Giá nhập kho (02/10/2026).
  if (/^(ncc\/kh|ncc|nha cung cap|ncc \/ kh|khach hang|kh)$/.test(h)) return "supplier";
  if (/^(bao gia\/hd|bao gia|hop dong|chung tu|bao gia \/ hd)$/.test(h)) return "chung_tu";
  return ledgerFieldOf(header);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function cellText(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
  }
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

export function parseTradeSheets(sheets: [string, unknown[][]][]): { sheetName: string; rows: TradeRow[] } | null {
  for (const [sheetName, aoa] of sheets) {
    const limit = Math.min(aoa.length, 30);
    for (let i = 0; i < limit; i++) {
      const cols: Partial<Record<LedgerField | "supplier" | "chung_tu", number>> = {};
      (aoa[i] || []).forEach((cell, j) => {
        const f = purchaseFieldOf(String(cell ?? ""));
        if (f && cols[f] === undefined) cols[f] = j;
      });
      if (cols.code === undefined || cols.loai === undefined || cols.qty === undefined || cols.price === undefined) continue;
      const rows: TradeRow[] = [];
      aoa.slice(i + 1).forEach((r, k) => {
        const row = r || [];
        const code = String(row[cols.code!] ?? "").trim();
        const loai = fold(row[cols.loai!]);
        if (!code || (loai !== "nhap" && loai !== "xuat")) return;
        const qty = toNumber(row[cols.qty!]);
        if (!Number.isFinite(qty) || qty <= 0) return;
        const p = toNumber(row[cols.price!]);
        const d = cols.ngay !== undefined ? toDate(row[cols.ngay]) : null;
        rows.push({
          line: i + k + 2,
          loai,
          ngay: d ? isoDate(d) : null,
          code,
          qty,
          unitPrice: Number.isFinite(p) && p >= 0 ? p : null,
          doiTac: cols.supplier !== undefined ? cellText(row[cols.supplier]) : "",
          chungTu: cols.chung_tu !== undefined ? cellText(row[cols.chung_tu]) : "",
        });
      });
      if (rows.length) return { sheetName, rows };
    }
  }
  return null;
}

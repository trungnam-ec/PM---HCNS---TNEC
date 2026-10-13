// vnRegions.ts — bảng tỉnh/thành Việt Nam -> miền, để SUY RA miền và tỉnh từ chữ (địa chỉ, ô "Khu vực"…)
// mà không cần AI. Có cả tên tỉnh trước và sau sáp nhập 07/2025 (dữ liệu cũ vẫn dùng tên cũ).
// Khớp trên chuỗi đã bỏ dấu, viết thường, dấu câu thành khoảng trắng, nên "TP.HCM",
// "Tp Hồ Chí Minh", "Sài Gòn" đều ra "TP Hồ Chí Minh".

import type { PartnerRegion } from "./partnerDirectory";

type Prov = { name: string; region: Exclude<PartnerRegion, "toan_quoc">; aliases?: string[] };

const P = (name: string, region: Prov["region"], aliases: string[] = []): Prov => ({ name, region, aliases });

const PROVINCES: Prov[] = [
  // Miền Bắc
  P("Hà Nội", "bac", ["ha noi", "hn"]),
  P("Hải Phòng", "bac", ["hai phong"]),
  P("Quảng Ninh", "bac"), P("Bắc Ninh", "bac"), P("Bắc Giang", "bac"), P("Hải Dương", "bac"),
  P("Hưng Yên", "bac"), P("Thái Bình", "bac"), P("Nam Định", "bac"), P("Hà Nam", "bac"),
  P("Ninh Bình", "bac"), P("Vĩnh Phúc", "bac"), P("Phú Thọ", "bac"), P("Thái Nguyên", "bac"),
  P("Lạng Sơn", "bac"), P("Cao Bằng", "bac"), P("Bắc Kạn", "bac"), P("Tuyên Quang", "bac"),
  P("Hà Giang", "bac"), P("Lào Cai", "bac"), P("Yên Bái", "bac"), P("Lai Châu", "bac"),
  P("Điện Biên", "bac"), P("Sơn La", "bac"), P("Hòa Bình", "bac"),
  // Miền Trung (gồm Tây Nguyên)
  P("Thanh Hóa", "trung"), P("Nghệ An", "trung"), P("Hà Tĩnh", "trung"), P("Quảng Bình", "trung"),
  P("Quảng Trị", "trung"), P("Huế", "trung", ["thua thien hue", "hue"]),
  P("Đà Nẵng", "trung", ["da nang"]), P("Quảng Nam", "trung"), P("Quảng Ngãi", "trung"),
  P("Bình Định", "trung"), P("Phú Yên", "trung"), P("Khánh Hòa", "trung"), P("Ninh Thuận", "trung"),
  P("Bình Thuận", "trung"), P("Kon Tum", "trung"), P("Gia Lai", "trung"), P("Đắk Lắk", "trung", ["dak lak", "daklak"]),
  P("Đắk Nông", "trung", ["dak nong", "daknong"]), P("Lâm Đồng", "trung"),
  // Miền Nam
  P("TP Hồ Chí Minh", "nam", ["ho chi minh", "tp hcm", "tphcm", "hcm", "sai gon", "tp ho chi minh", "thanh pho ho chi minh"]),
  P("Bà Rịa - Vũng Tàu", "nam", ["ba ria vung tau", "ba ria", "vung tau", "brvt"]),
  P("Bình Dương", "nam"), P("Bình Phước", "nam"), P("Đồng Nai", "nam"), P("Tây Ninh", "nam"),
  P("Long An", "nam"), P("Tiền Giang", "nam"), P("Bến Tre", "nam"), P("Vĩnh Long", "nam"),
  P("Trà Vinh", "nam"), P("Đồng Tháp", "nam"), P("An Giang", "nam"), P("Kiên Giang", "nam"),
  P("Cần Thơ", "nam", ["can tho"]), P("Hậu Giang", "nam"), P("Sóc Trăng", "nam"),
  P("Bạc Liêu", "nam"), P("Cà Mau", "nam"),
];

export const norm = (s: string): string =>
  ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đ]/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

// Mỗi tỉnh -> các chuỗi cần tìm (đã chuẩn hoá, có khoảng trắng hai đầu để khớp nguyên từ).
const INDEX = PROVINCES.map((p) => {
  const keys = new Set<string>([norm(p.name).trim(), ...(p.aliases || [])].map((k) => ` ${k.trim()} `));
  return { p, keys: Array.from(keys) };
});

// Các tỉnh xuất hiện trong chuỗi, theo THỨ TỰ xuất hiện. Alias 2 chữ cái ("hn", "hcm") chỉ
// khớp khi cả ô chỉ là alias đó, để khỏi bắt nhầm trong câu dài.
export function findProvinces(text: string): { name: string; region: Prov["region"]; pos: number }[] {
  const t = norm(text);
  const out: { name: string; region: Prov["region"]; pos: number }[] = [];
  for (const { p, keys } of INDEX) {
    let best = -1;
    for (const k of keys) {
      const short = k.trim().length <= 3;
      if (short && t.trim() !== k.trim()) continue;
      const i = t.indexOf(k);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    if (best >= 0) out.push({ name: p.name, region: p.region, pos: best });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

export function regionOfProvince(name: string): Prov["region"] | null {
  const f = findProvinces(name)[0];
  return f ? f.region : null;
}

// Từ khoá miền / toàn quốc trong một ô văn bản: "Miền Nam", "Bắc - Trung", "Toàn quốc", "3 miền".
// strict = true: chỉ nhận khi có chữ "miền" đứng trước (dùng khi ô cũng chứa tên tỉnh, để "Quảng Nam"
// không bị hiểu là miền Nam).
export function regionsFromWords(text: string, strict = false): PartnerRegion[] {
  const t = norm(text);
  const out: PartnerRegion[] = [];
  if (/ toan quoc | ca nuoc | ba mien | 3 mien | moi mien /.test(t)) return ["toan_quoc"];
  const pre = strict ? " mien " : " (?:mien )?";
  const re = (w: string) => new RegExp(`${pre}${w} `);
  if (re("bac").test(t)) out.push("bac");
  if (re("trung").test(t) && !/ trung nam /.test(t)) out.push("trung");
  if (re("nam").test(t) && !/ trung nam /.test(t)) out.push("nam");
  return out;
}

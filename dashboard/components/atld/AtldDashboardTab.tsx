"use client";

// ============================================================
// P. An toàn lao động — tab Dashboard (27/10/2026)
//
// Chỉ ĐỌC, không có bảng riêng: gom dữ liệu 4 tab nguồn rồi cộng dồn trên trình duyệt.
//   Phần A Khấu trừ — tab Khấu trừ xử phạt + Khấu trừ PPE (cần cờ xem xử phạt).
//   Phần B Kho      — tab Quản lý Xuất-Nhập kho + Xuất kho cho BĐH/Đối tác (cần quyền kho).
// User chốt: 2 phần tách riêng (khấu trừ ghi mã dự án, phiếu xuất ghi tên BĐH gõ tay —
// không ghép được), bộ lọc Dự án chỉ áp cho Phần A. Giá trị xuất = Tổng tiền phiếu
// (giá bán + VAT + phí vận chuyển) như popup phiếu xuất.
// Bấm vào biểu đồ → mở tab chi tiết với bộ lọc dựng sẵn qua URL (initialParam ở ui.ts).
// ============================================================

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Boxes, CheckCircle2, CircleDollarSign, Loader2, PackageMinus, PackagePlus, Wallet, Warehouse } from "lucide-react";
import { fetchPenalties, penaltyAlert, penaltyStatus, todayVN, trackingDays, type Penalty, type PenaltyKind } from "@/lib/atldPenalties";
import { fetchItems, fetchStock, fetchTradePrices, formatMoney, stockLevel, STOCK_LEVEL_META, type AtldItem, type TradePrice, type StockLevel } from "@/lib/atldStock";
import { fetchIssueRows, type IssueRow } from "@/lib/atldVouchers";
import { BTN_OUTLINE, CONTROL_BOX } from "@/components/atld/ui";

type KindFilter = "all" | PenaltyKind;
type Bucket = "da" | "qua_han" | "sap_qua_han" | "theo_doi" | "chua_gui";
type PRow = Penalty & { kind: PenaltyKind; bucket: Bucket; project: string };
// Một thanh của biểu đồ ngang: đã trừ + còn lại = phải trừ.
type DebtBar = { name: string; da: number; con: number; total: number; byKind: Record<PenaltyKind, number>; others?: number };
type SimpleBar = { name: string; value: number; key?: string; others?: number };

const TAB_OF: Record<PenaltyKind, string> = { penalty: "penalties", ppe: "ppe" };
const BUCKETS: { key: Bucket; label: string; color: string; filter: string }[] = [
  { key: "qua_han", label: "Quá hạn (> 30 ngày)", color: "#e11d48", filter: "qua_han" },
  { key: "sap_qua_han", label: "20–30 ngày", color: "#f97316", filter: "sap_qua_han" },
  { key: "theo_doi", label: "Dưới 20 ngày", color: "#3b82f6", filter: "open" },
  { key: "chua_gui", label: "Chưa gửi KHĐT", color: "#94a3b8", filter: "open" },
  { key: "da", label: "Đã trừ xong", color: "#10b981", filter: "da" },
];
const C = { da: "#10b981", con: "#f43f5e", nhap: "#005BAC", xuat: "#f97316", phai: "#005BAC" };
const TOP_N = 10;

const money = (n: number) => `${formatMoney(n)} đ`;
// Trục số gọn: 1.250.000 → "1,3 tr".
const short = (n: number) =>
  Math.abs(n) >= 1e9
    ? `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`
    : Math.abs(n) >= 1e6
      ? `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`
      : formatMoney(n);
const monthOf = (d: string | null | undefined) => (d ? d.slice(0, 7) : "");
const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`;
const lastDay = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`;
};
const inRange = (d: string | null | undefined, from: string, to: string) => !!d && (!from || d >= from) && (!to || d <= to);

function monthsBetween(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  while (out.length < 60) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    out.push(k);
    if (k >= end) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

function bucketOf(p: Penalty, today: string): Bucket {
  const status = penaltyStatus(p);
  const days = trackingDays(p, today);
  const alert = penaltyAlert(status, days);
  if (alert === "da" || alert === "qua_han" || alert === "sap_qua_han") return alert;
  return days == null ? "chua_gui" : "theo_doi";
}

// Top N theo tổng, phần còn lại gộp 1 dòng "Khác (n …)".
function topWithOthers<T extends { total?: number; value?: number }>(rows: T[], n: number, merge: (rest: T[]) => T): T[] {
  const val = (r: T) => r.total ?? r.value ?? 0;
  const sorted = [...rows].sort((a, b) => val(b) - val(a));
  if (sorted.length <= n + 1) return sorted;
  return [...sorted.slice(0, n), merge(sorted.slice(n))];
}

// Gom hồ sơ khấu trừ theo dự án / nhà thầu thành thanh "đã trừ + còn lại".
function groupDebt(rows: PRow[], key: (p: PRow) => string, label: string): DebtBar[] {
  const m = new Map<string, DebtBar>();
  for (const p of rows) {
    const k = key(p) || "(Chưa ghi)";
    const b = m.get(k) || { name: k, da: 0, con: 0, total: 0, byKind: { penalty: 0, ppe: 0 } };
    b.da += p.gia_tri_da_tru;
    b.con += p.gia_tri_con_lai;
    b.total += p.gia_tri_phai_tru;
    b.byKind[p.kind] += p.gia_tri_phai_tru;
    m.set(k, b);
  }
  return topWithOthers(
    [...m.values()].filter((b) => b.total > 0),
    TOP_N,
    (rest) => ({
      name: `Khác (${rest.length} ${label})`,
      da: rest.reduce((s, r) => s + r.da, 0),
      con: rest.reduce((s, r) => s + r.con, 0),
      total: rest.reduce((s, r) => s + r.total, 0),
      byKind: { penalty: 0, ppe: 0 },
      others: rest.length,
    })
  );
}

export default function AtldDashboardTab({ showPenalty, showStock }: { showPenalty: boolean; showStock: boolean }) {
  const router = useRouter();
  const today = todayVN();
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState<KindFilter>("all");
  const [project, setProject] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [penalties, setPenalties] = useState<PRow[]>([]);
  const [trades, setTrades] = useState<TradePrice[]>([]);
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [items, setItems] = useState<AtldItem[]>([]);
  const [stock, setStock] = useState<Map<string, { ton: number; giaTri: number }>>(new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
      const errs: string[] = [];
      const [pen, ppe, tr, is, it, st] = await Promise.all([
        showPenalty ? fetchPenalties("penalty") : null,
        showPenalty ? fetchPenalties("ppe") : null,
        showStock ? fetchTradePrices() : null,
        showStock ? fetchIssueRows() : null,
        showStock ? fetchItems() : null,
        showStock ? fetchStock() : null,
      ]);
      if (!alive) return;
      const t = todayVN();
      const tag = (rows: Penalty[], k: PenaltyKind): PRow[] =>
        rows.map((p) => ({ ...p, kind: k, bucket: bucketOf(p, t), project: p.project_name || p.project_code || "" }));
      for (const r of [pen, ppe, tr, is, it]) if (r?.error) errs.push(r.error);
      setPenalties([...tag(pen?.rows || [], "penalty"), ...tag(ppe?.rows || [], "ppe")]);
      setTrades(tr?.rows || []);
      setIssues(is?.rows || []);
      setItems(it?.items || []);
      setStock(st || new Map());
      setError(errs[0] || null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [showPenalty, showStock]);

  // Mở tab chi tiết kèm bộ lọc. Khoảng ngày luôn mang theo để số khớp với Dashboard.
  const open = (tab: string, extra: Record<string, string> = {}, withDates = true) => {
    const u = new URLSearchParams({ tab });
    if (withDates && from) u.set("from", from);
    if (withDates && to) u.set("to", to);
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
    router.push(`/an-toan-lao-dong?${u.toString()}`);
  };

  // ─── Phần A: khấu trừ ───
  const pRange = useMemo(
    () => penalties.filter((p) => inRange(p.ngay_ban_hanh, from, to) && (kind === "all" || p.kind === kind)),
    [penalties, from, to, kind]
  );
  const projects = useMemo(
    () => Array.from(new Set(pRange.map((p) => p.project).filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")),
    [pRange]
  );
  const pRows = useMemo(() => (project ? pRange.filter((p) => p.project === project) : pRange), [pRange, project]);

  // Hồ sơ của 1 nhóm nằm ở cả 2 tab thì mở tab có giá trị lớn hơn.
  const tabFor = (byKind: Record<PenaltyKind, number>) =>
    kind !== "all" ? TAB_OF[kind] : TAB_OF[byKind.ppe > byKind.penalty ? "ppe" : "penalty"];
  const openPenalty = (byKind: Record<PenaltyKind, number>, extra: Record<string, string>) =>
    open(tabFor(byKind), { project, ...extra });

  const sumA = useMemo(() => {
    const s = { phai: 0, da: 0, con: 0, quaHan: 0, sap: 0, byKind: { penalty: 0, ppe: 0 } as Record<PenaltyKind, number>, quaHanKind: { penalty: 0, ppe: 0 } as Record<PenaltyKind, number> };
    for (const p of pRows) {
      s.phai += p.gia_tri_phai_tru;
      s.da += p.gia_tri_da_tru;
      s.con += p.gia_tri_con_lai;
      s.byKind[p.kind] += p.gia_tri_phai_tru;
      if (p.bucket === "qua_han") { s.quaHan++; s.quaHanKind[p.kind]++; }
      if (p.bucket === "sap_qua_han") s.sap++;
    }
    return s;
  }, [pRows]);

  const byProject = useMemo(() => groupDebt(pRows, (p) => p.project, "dự án"), [pRows]);
  const byContractor = useMemo(() => groupDebt(pRows, (p) => p.contractor_name, "nhà thầu"), [pRows]);

  const byBucket = useMemo(
    () =>
      BUCKETS.map((b) => {
        const rs = pRows.filter((p) => p.bucket === b.key);
        const byKind = { penalty: 0, ppe: 0 } as Record<PenaltyKind, number>;
        for (const p of rs) byKind[p.kind]++;
        return { ...b, count: rs.length, value: rs.reduce((s, p) => s + (b.key === "da" ? p.gia_tri_phai_tru : p.gia_tri_con_lai), 0), byKind };
      }),
    [pRows]
  );

  const pMonths = useMemo(() => {
    const dates = pRows.map((p) => p.ngay_ban_hanh || "").filter(Boolean).sort();
    const keys = monthsBetween(from || dates[0] || today, to || dates[dates.length - 1] || today);
    const m = new Map(keys.map((k) => [k, { month: k, label: monthLabel(k), phai: 0, da: 0, byKind: { penalty: 0, ppe: 0 } as Record<PenaltyKind, number> }]));
    for (const p of pRows) {
      const r = m.get(monthOf(p.ngay_ban_hanh));
      if (!r) continue;
      r.phai += p.gia_tri_phai_tru;
      r.da += p.gia_tri_da_tru;
      r.byKind[p.kind] += p.gia_tri_phai_tru;
    }
    // Luỹ kế từ đầu kỳ: khoảng hở giữa 2 đường = số còn phải trừ tới tháng đó.
    let lkPhai = 0;
    let lkDa = 0;
    return [...m.values()].map((r) => {
      lkPhai += r.phai;
      lkDa += r.da;
      return { ...r, lkPhai, lkDa };
    });
  }, [pRows, from, to, today]);

  const byKindSplit = useMemo(
    () =>
      (["penalty", "ppe"] as PenaltyKind[]).map((k) => {
        const rs = pRows.filter((p) => p.kind === k);
        return {
          key: k,
          label: k === "penalty" ? "Xử phạt" : "PPE",
          color: k === "penalty" ? C.phai : C.xuat,
          count: rs.length,
          value: rs.reduce((s, p) => s + p.gia_tri_phai_tru, 0),
          con: rs.reduce((s, p) => s + p.gia_tri_con_lai, 0),
        };
      }),
    [pRows]
  );

  // ─── Phần B: kho ───
  const isFinal = (t: TradePrice) => t.nguon === "excel" || t.status === "posted";
  const tRange = useMemo(() => trades.filter((t) => isFinal(t) && inRange(t.ngay, from, to)), [trades, from, to]);
  const iRange = useMemo(() => issues.filter((r) => r.status === "posted" && inRange(r.ngay, from, to)), [issues, from, to]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Xuất = Tổng tiền phiếu xuất đã duyệt + dòng xuất Excel cũ (không có phiếu) theo SL × giá.
  const sMonths = useMemo(() => {
    const dates = [...tRange.map((t) => t.ngay), ...iRange.map((r) => r.ngay)].sort();
    const keys = monthsBetween(from || dates[0] || today, to || dates[dates.length - 1] || today);
    const m = new Map(keys.map((k) => [k, { month: k, label: monthLabel(k), nhap: 0, xuat: 0 }]));
    for (const t of tRange) {
      const r = m.get(monthOf(t.ngay));
      if (!r) continue;
      if (t.loai === "nhap") r.nhap += t.qty * (t.unit_price ?? 0);
      else if (t.nguon === "excel") r.xuat += t.qty * (t.unit_price ?? 0);
    }
    for (const v of iRange) {
      const r = m.get(monthOf(v.ngay));
      if (r) r.xuat += v.tongCong;
    }
    return [...m.values()];
  }, [tRange, iRange, from, to, today]);

  const sumB = useMemo(() => {
    let tonGiaTri = 0;
    let canNhap = 0;
    for (const it of items) {
      if (!it.active) continue;
      const s = stock.get(it.id);
      tonGiaTri += s?.giaTri || 0;
      if (stockLevel(s?.ton || 0, it.min_stock) !== "ok") canNhap++;
    }
    return {
      nhap: sMonths.reduce((s, r) => s + r.nhap, 0),
      xuat: sMonths.reduce((s, r) => s + r.xuat, 0),
      phieu: iRange.length,
      tonGiaTri,
      canNhap,
    };
  }, [items, stock, sMonths, iRange]);

  const byRecipient = useMemo(() => {
    const m = new Map<string, SimpleBar>();
    for (const v of iRange) {
      const k = v.bdh_name || v.contractor_name || v.nguoi_nhan || "(Chưa ghi)";
      const b = m.get(k) || { name: k, value: 0 };
      b.value += v.tongCong;
      m.set(k, b);
    }
    return topWithOthers([...m.values()].filter((b) => b.value > 0), TOP_N, (rest) => ({
      name: `Khác (${rest.length} nơi nhận)`,
      value: rest.reduce((s, r) => s + r.value, 0),
      others: rest.length,
    }));
  }, [iRange]);

  const topItems = useMemo(() => {
    const m = new Map<string, SimpleBar>();
    for (const t of tRange) {
      if (t.loai !== "xuat") continue;
      const it = itemById.get(t.item_id);
      const k = it?.code || t.item_id;
      const b = m.get(k) || { name: it ? `${it.code} · ${it.name}${it.size ? ` (${it.size})` : ""}` : k, value: 0, key: k };
      b.value += t.qty;
      m.set(k, b);
    }
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, TOP_N);
  }, [tRange, itemById]);

  const lowStock = useMemo(
    () =>
      items
        .filter((it) => it.active)
        .map((it) => {
          const ton = stock.get(it.id)?.ton || 0;
          return { ...it, ton, level: stockLevel(ton, it.min_stock) as StockLevel };
        })
        .filter((r) => r.level !== "ok")
        .sort((a, b) => (a.level === b.level ? a.code.localeCompare(b.code) : a.level === "out" ? -1 : 1)),
    [items, stock]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-slate-400 text-xs font-semibold">
        <Loader2 size={16} className="animate-spin" /> Đang tổng hợp dữ liệu…
      </div>
    );
  }

  const thisYear = `${today.slice(0, 4)}-01-01`;

  return (
    <div className="space-y-5">
      {/* ── Bộ lọc chung ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className={`${CONTROL_BOX} px-2`}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-xs font-semibold text-slate-700 outline-none" />
        </div>
        <span className="text-slate-300">–</span>
        <div className={`${CONTROL_BOX} px-2`}>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-xs font-semibold text-slate-700 outline-none" />
        </div>
        <button type="button" className={BTN_OUTLINE} onClick={() => { setFrom(thisYear); setTo(today); }}>Năm nay</button>
        <button type="button" className={BTN_OUTLINE} onClick={() => { setFrom(""); setTo(""); }}>Toàn bộ</button>
        {/* Loại khấu trừ + dự án chỉ áp cho phần Khấu trừ. */}
        {showPenalty && (
          <>
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              {([["all", "Cả hai"], ["penalty", "Xử phạt"], ["ppe", "PPE"]] as const).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`px-3 h-7 rounded-lg text-[11px] font-bold cursor-pointer ${kind === k ? "bg-[#005BAC] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className={`${CONTROL_BOX} px-2`}>
              <select value={project} onChange={(e) => setProject(e.target.value)} className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer max-w-[220px]">
                <option value="">Tất cả dự án</option>
                {projects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {showPenalty && (
        <section className="space-y-4">
          <SectionHead title="Khấu trừ xử phạt & PPE" color="bg-[#005BAC]" />

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Kpi icon={Wallet} tone="blue" label="Phải khấu trừ" value={money(sumA.phai)} sub={`${pRows.length} hồ sơ`} onClick={() => openPenalty(sumA.byKind, {})} />
            <Kpi
              icon={CheckCircle2}
              tone="emerald"
              label="Đã khấu trừ"
              value={money(sumA.da)}
              sub={sumA.phai > 0 ? `Thu hồi ${Math.round((sumA.da / sumA.phai) * 100)}%` : undefined}
              onClick={() => openPenalty(sumA.byKind, { filter: "da" })}
            />
            <Kpi icon={CircleDollarSign} tone="rose" label="Còn lại phải trừ" value={money(sumA.con)} onClick={() => openPenalty(sumA.byKind, { filter: "open" })} />
            <Kpi
              icon={AlertTriangle}
              tone="amber"
              label="Quá hạn (> 30 ngày)"
              value={`${sumA.quaHan} hồ sơ`}
              sub={`${sumA.sap} hồ sơ 20–30 ngày`}
              onClick={() => openPenalty(sumA.quaHanKind, { filter: "qua_han" })}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Giá trị khấu trừ theo dự án" hint="Cả cột = phải trừ; rê chuột để xem chi tiết">
              <DebtColumns data={byProject} onPick={(b) => openPenalty(b.byKind, { project: b.name })} />
            </Card>
            <Card title="Giá trị khấu trừ theo nhà thầu" hint={`${TOP_N} nhà thầu lớn nhất, còn lại gộp "Khác"`}>
              <DebtColumns data={byContractor} shorten onPick={(b) => openPenalty(b.byKind, { q: b.name })} />
            </Card>
          </div>

          {/* 2 vòng tròn bên trái, luỹ kế bên phải — cùng 1 hàng. */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card title="Tình trạng hồ sơ" hint="Theo số ngày kể từ ngày gửi KHĐT">
              <Donut
                data={byBucket.map((b) => ({ key: b.key, label: b.label, color: b.color, value: b.count, sub: `${b.key === "da" ? "Đã trừ" : "Còn"} ${money(b.value)}` }))}
                unit="hồ sơ"
                fmt={(n) => `${n} hồ sơ`}
                onPick={(key) => {
                  const b = byBucket.find((x) => x.key === key);
                  if (b) openPenalty(b.byKind, { filter: b.filter });
                }}
              />
            </Card>
            <Card title="Xử phạt và PPE" hint="Tỉ trọng giá trị phải trừ">
              <Donut
                data={byKindSplit.map((k) => ({ key: k.key, label: k.label, color: k.color, value: k.value, sub: `${k.count} hồ sơ · còn ${money(k.con)}` }))}
                unit="phải trừ"
                fmt={money}
                center={short(byKindSplit.reduce((s, k) => s + k.value, 0))}
                onPick={(key) => open(TAB_OF[key as PenaltyKind], { project })}
              />
            </Card>

            <div className="md:col-span-2">
              <Card title="Phải trừ và đã trừ luỹ kế" hint="Cộng dồn theo ngày ban hành từ đầu kỳ; khoảng hở giữa 2 đường = số còn phải trừ. Bấm 1 tháng để xem hồ sơ từ đầu kỳ tới tháng đó">
                <ResponsiveContainer width="100%" height={330}>
                  <ComposedChart
                    data={pMonths}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                    accessibilityLayer={false}
                    style={{ cursor: "pointer" }}
                    onClick={(st) => {
                      const r = pMonths[Number(st?.activeIndex)];
                      if (!r) return;
                      const u = new URLSearchParams({ tab: tabFor(sumA.byKind) });
                      if (from) u.set("from", from);
                      u.set("to", lastDay(r.month));
                      if (project) u.set("project", project);
                      router.push(`/an-toan-lao-dong?${u.toString()}`);
                    }}
                  >
                    <defs>
                      <linearGradient id="atld-lk-phai" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.con} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={C.con} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.25} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={short} width={56} />
                    <Tooltip content={(p) => <Tip {...p} fmt={money} gap />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="lkPhai" name="Phải trừ luỹ kế" stroke={C.con} strokeWidth={2.5} fill="url(#atld-lk-phai)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="lkDa" name="Đã trừ luỹ kế" stroke={C.da} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>
        </section>
      )}

      {showStock && (
        <section className="space-y-4">
          <SectionHead title="Kho BHLĐ — xuất nhập" color="bg-orange-500" />

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <Kpi icon={PackagePlus} tone="blue" label="Giá trị nhập kho" value={money(sumB.nhap)} onClick={() => open("prices", { loai: "nhap" })} />
            <Kpi icon={PackageMinus} tone="amber" label="Giá trị xuất kho" value={money(sumB.xuat)} sub={`${sumB.phieu} phiếu xuất đã duyệt`} onClick={() => open("issues", { status: "posted" })} />
            <Kpi icon={Warehouse} tone="emerald" label="Giá trị tồn kho hiện tại" value={money(sumB.tonGiaTri)} sub="Không phụ thuộc khoảng thời gian" onClick={() => open("items", {}, false)} />
            <Kpi icon={Boxes} tone="rose" label="Mặt hàng cần nhập" value={`${sumB.canNhap} mặt hàng`} sub="Hết hàng hoặc dưới mức tối thiểu" onClick={() => document.getElementById("atld-low-stock")?.scrollIntoView({ behavior: "smooth" })} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Nhập – xuất theo tháng" hint="Giá trị (đ). Xuất = Tổng tiền phiếu xuất đã duyệt">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sMonths} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} accessibilityLayer={false}>
                  <CartesianGrid vertical={false} stroke="#94a3b8" strokeOpacity={0.25} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={short} width={56} />
                  <Tooltip cursor={{ fill: "rgba(148,163,184,0.12)" }} content={(p) => <Tip {...p} fmt={money} />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="nhap"
                    name="Nhập"
                    fill={C.nhap}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(d) => {
                      const r = (d as { payload?: (typeof sMonths)[number] }).payload;
                      if (r) router.push(monthUrl("prices", r.month, { loai: "nhap" }));
                    }}
                  />
                  <Bar
                    dataKey="xuat"
                    name="Xuất"
                    fill={C.xuat}
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(d) => {
                      const r = (d as { payload?: (typeof sMonths)[number] }).payload;
                      if (r) router.push(monthUrl("issues", r.month, { status: "posted" }));
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Xuất kho theo BĐH / đối tác" hint={`Tổng tiền phiếu đã duyệt, ${TOP_N} nơi nhận lớn nhất`}>
              <SimpleHBar data={byRecipient} color={C.xuat} fmt={money} onPick={(b) => open("issues", { q: b.name, status: "posted" })} />
            </Card>
            <Card title="Mặt hàng xuất nhiều nhất" hint={`Theo số lượng, ${TOP_N} mặt hàng đầu`}>
              <SimpleHBar data={topItems} color={C.nhap} fmt={(n) => formatMoney(n)} onPick={(b) => b.key && open("prices", { q: b.key, loai: "xuat" })} />
            </Card>
            <div id="atld-low-stock">
              <Card title={`Cảnh báo tồn kho (${lowStock.length})`} hint="Tồn hiện tại, mặt hàng đang dùng">
                <LowStockTable rows={lowStock} onPick={(code) => open("items", { q: code }, false)} />
              </Card>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// Link tab chi tiết lọc trọn 1 tháng.
function monthUrl(tab: string, month: string, extra: Record<string, string>) {
  const u = new URLSearchParams({ tab, from: `${month}-01`, to: lastDay(month) });
  for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
  return `/an-toan-lao-dong?${u.toString()}`;
}

function SectionHead({ title, color, children }: { title: string; color: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`w-1.5 h-6 rounded-full ${color}`} />
      <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide mr-auto">{title}</h2>
      {children}
    </div>
  );
}

// Bỏ dòng mô tả dưới tiêu đề (user yêu cầu 27/10/2026); hint chỉ còn làm tooltip.
function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 h-full">
      <h3 title={hint} className="mb-3 text-xs font-extrabold text-[#005BAC] uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="py-14 text-center text-xs font-semibold text-slate-400">Không có dữ liệu trong khoảng thời gian này</div>;
}

function Kpi({
  icon: Icon, label, value, sub, tone, onClick,
}: {
  icon: typeof Wallet; label: string; value: string; sub?: string; tone: "blue" | "amber" | "emerald" | "rose"; onClick?: () => void;
}) {
  const toneCls = {
    blue: "bg-blue-50 text-[#005BAC]",
    amber: "bg-amber-50 text-amber-500",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-500",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3 text-left enabled:hover:border-slate-200 enabled:cursor-pointer disabled:cursor-default"
    >
      <span className={`w-9 h-9 rounded-xl hidden sm:flex items-center justify-center shrink-0 ${toneCls}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">{label}</span>
        <span className="block text-base sm:text-lg font-extrabold text-slate-800 tabular-nums truncate">{value}</span>
        {sub && <span className="block text-[10px] font-semibold text-slate-400 truncate">{sub}</span>}
      </span>
    </button>
  );
}

type TipItem = { name?: string | number; value?: unknown; color?: string; dataKey?: unknown; payload?: unknown };
function Tip({ active, payload, label, fmt, gap }: { active?: boolean; payload?: readonly TipItem[]; label?: unknown; fmt: (n: number) => string; gap?: boolean }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as { name?: string; lkPhai?: number; lkDa?: number } | undefined;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2 text-[11px] max-w-[320px]">
      <div className="font-extrabold text-slate-700 mb-1">{row?.name ?? `Tháng ${String(label ?? "")}`}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 font-semibold text-slate-600">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 tabular-nums font-bold text-slate-800">{fmt(Number(p.value) || 0)}</span>
        </div>
      ))}
      {gap && row?.lkPhai != null && (
        <div className="flex justify-between gap-4 border-t border-slate-100 mt-1 pt-1 font-bold text-rose-600">
          <span>Còn phải trừ</span>
          <span className="tabular-nums">{fmt(row.lkPhai - (row.lkDa ?? 0))}</span>
        </div>
      )}
    </div>
  );
}

// Tên nhà thầu bỏ phần "Công ty TNHH / Cổ phần…" ở đầu cho gọn; tên đầy đủ vẫn ở title + bộ lọc.
const shortName = (s: string) =>
  s.replace(/^\s*(công\s*ty|cty)\s+(tnhh|cổ\s*phần|cp)?\s*(mtv|một\s*thành\s*viên)?\s*/i, "").trim() || s;

// Thanh ngang dựng bằng HTML (không dùng recharts) để tên dài xuống 2 dòng đọc trọn,
// số tổng luôn hiện bên phải và bấm cả dòng được.
function HBarRow({
  name, title, totalText, sub, segments, max, onClick,
}: {
  name: string; title: string; totalText: string; sub?: string;
  segments: { value: number; color: string; label: string }[]; max: number; onClick?: () => void;
}) {
  const tip = [title, ...segments.map((g) => `${g.label}: ${formatMoney(g.value)}`)].join("\n");
  return (
    <button
      type="button"
      title={tip}
      disabled={!onClick}
      onClick={onClick}
      className="w-full grid grid-cols-[minmax(0,190px)_1fr_auto] items-center gap-3 text-left rounded-lg px-1.5 py-1 hover:bg-slate-50 disabled:hover:bg-transparent enabled:cursor-pointer disabled:cursor-default"
    >
      <span className="text-[11px] font-semibold text-slate-600 leading-tight line-clamp-2">{name}</span>
      <span className="h-5 flex rounded-md overflow-hidden bg-slate-100">
        {segments.map((g) =>
          g.value > 0 ? <span key={g.label} className="h-full" style={{ width: `${(g.value / max) * 100}%`, background: g.color }} /> : null
        )}
      </span>
      <span className="text-right min-w-[92px]">
        <span className="block text-xs font-extrabold text-slate-800 tabular-nums">{totalText}</span>
        {sub && <span className="block text-[10px] font-semibold text-slate-400 tabular-nums">{sub}</span>}
      </span>
    </button>
  );
}

// Biểu đồ vòng: giữa ghi tổng, bên phải là chú giải bấm được (số + %).
function Donut({
  data, unit, fmt, center, onPick,
}: {
  data: { key: string; label: string; color: string; value: number; sub?: string }[];
  unit: string; fmt: (n: number) => string; center?: string; onPick: (key: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty />;
  const shown = data.filter((d) => d.value > 0);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[140px] h-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius={44}
              outerRadius={68}
              paddingAngle={shown.length > 1 ? 2 : 0}
              stroke="none"
              cursor="pointer"
              onClick={(d) => {
                const k = (d as { payload?: { key?: string } }).payload?.key;
                if (k) onPick(k);
              }}
            >
              {shown.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-base font-extrabold text-slate-800 tabular-nums">{center ?? total}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{unit}</span>
        </div>
      </div>
      <div className="w-full space-y-0.5">
        {data.map((d) => (
          <button
            key={d.key}
            type="button"
            disabled={!d.value}
            onClick={() => onPick(d.key)}
            className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 disabled:hover:bg-transparent enabled:cursor-pointer disabled:cursor-default disabled:opacity-50"
          >
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold text-slate-700">{d.label}</span>
              {d.sub && <span className="block text-[10px] font-semibold text-slate-400 truncate">{d.sub}</span>}
            </span>
            <span className="text-right">
              <span className="block text-xs font-extrabold text-slate-800 tabular-nums">{fmt(d.value)}</span>
              <span className="block text-[10px] font-bold text-slate-400 tabular-nums">{Math.round((d.value / total) * 100)}%</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Cột đứng chồng (đã trừ dưới, còn lại trên) cho biểu đồ theo dự án; số phải trừ ghi trên đỉnh cột.
// Nhãn dưới cột bỏ chữ "Dự án" ở đầu cho vừa chỗ; tên đầy đủ ở title + bộ lọc.
function DebtColumns({ data, onPick, shorten }: { data: DebtBar[]; onPick: (b: DebtBar) => void; shorten?: boolean }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div>
      <div className="flex items-center gap-4 text-[10px] font-semibold text-slate-500 px-1.5 pb-2">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.da }} /> Đã trừ</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.con }} /> Còn lại</span>      </div>
      <div className="flex items-stretch gap-1.5">
        {data.map((b) => (
          <button
            key={b.name}
            type="button"
            title={`${b.name}\nPhải trừ: ${formatMoney(b.total)}\nĐã trừ: ${formatMoney(b.da)}\nCòn lại: ${formatMoney(b.con)}`}
            disabled={!!b.others}
            onClick={() => onPick(b)}
            className="flex-1 min-w-0 flex flex-col items-center rounded-lg pt-1 hover:bg-slate-50 disabled:hover:bg-transparent enabled:cursor-pointer disabled:cursor-default"
          >
            <span className="h-[180px] w-full flex flex-col justify-end items-center">
              <span className="text-[9px] font-bold text-slate-700 tabular-nums whitespace-nowrap mb-0.5">{short(b.total)}</span>
              <span className="w-1/2 max-w-[26px] flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${(b.total / max) * 155}px` }}>
                {b.da > 0 && <span style={{ height: `${(b.da / b.total) * 100}%`, background: C.da }} />}
                {b.con > 0 && <span style={{ height: `${(b.con / b.total) * 100}%`, background: b.others ? "#94a3b8" : C.con }} />}
              </span>
            </span>
            <span className="w-full border-t border-slate-200 pt-1 pb-0.5 text-[9px] font-semibold text-slate-500 leading-tight text-center line-clamp-3 break-words px-0.5">
              {b.others ? b.name : shorten ? shortName(b.name) : b.name.replace(/^\s*dự\s*án\s+/i, "")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SimpleHBar({ data, color, fmt, onPick }: { data: SimpleBar[]; color: string; fmt: (n: number) => string; onPick: (b: SimpleBar) => void }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-0.5">
      {data.map((b) => (
        <HBarRow
          key={b.name}
          name={b.name}
          title={b.name}
          totalText={fmt(b.value)}
          max={max}
          segments={[{ value: b.value, color: b.others ? "#94a3b8" : color, label: fmt === money ? "Giá trị" : "Số lượng" }]}
          onClick={b.others ? undefined : () => onPick(b)}
        />
      ))}
    </div>
  );
}

function LowStockTable({ rows, onPick }: { rows: (AtldItem & { ton: number; level: StockLevel })[]; onPick: (code: string) => void }) {
  if (!rows.length) return <div className="py-14 text-center text-xs font-semibold text-emerald-600">Mọi mặt hàng đều đủ tồn tối thiểu</div>;
  return (
    <div className="max-h-[360px] overflow-auto custom-scrollbar-table -mx-1">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white">
          <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">
            <th className="px-2 py-2">Mã</th>
            <th className="px-2 py-2">Tên mặt hàng</th>
            <th className="px-2 py-2 text-right">Tồn</th>
            <th className="px-2 py-2 text-right">Tối thiểu</th>
            <th className="px-2 py-2">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onPick(r.code)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
              <td className="px-2 py-2 font-bold text-[#005BAC] whitespace-nowrap">{r.code}</td>
              <td className="px-2 py-2 text-slate-700">
                {r.name}
                {r.size && <span className="text-slate-400"> · {r.size}</span>}
              </td>
              <td className="px-2 py-2 text-right font-bold tabular-nums text-slate-800">{formatMoney(r.ton)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-slate-500">{formatMoney(r.min_stock)}</td>
              <td className="px-2 py-2">
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap ${STOCK_LEVEL_META[r.level].cls}`}>{STOCK_LEVEL_META[r.level].label}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

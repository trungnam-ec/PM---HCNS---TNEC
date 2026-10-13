"use client";

// ============================================================
// Danh bạ đối tác — Nhà thầu phụ / Nhà cung cấp / Tổ đội thi công (migration 150)
//
// Giai đoạn 1: danh sách (thẻ / bảng), bộ lọc, ngăn chi tiết, form nhập tay.
// Nhập bằng AI (ảnh, QR, chat, Word, Excel) làm ở giai đoạn 2 — form dưới đây là
// nơi người dùng soát lại kết quả AI nên giữ đủ các trường ngay từ bây giờ.
// Nút ghi chỉ hiện với người có cờ Sửa; RLS mới là chốt chặn thật.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirmBox } from "@/components/ConfirmDialog";
import { BRAND_ICONS, type BrandKey } from "@/lib/brandIcons";
import { normalizeName } from "@/lib/approvers";
import PartnerAiImport from "./PartnerAiImport";
import {
  type PartnerRow, type PartnerInput, type PartnerKind, type PartnerRegion, type PartnerStatus, type PartnerAccess,
  KIND_LABELS, KIND_ORDER, REGION_LABELS, REGION_ORDER, STATUS_LABELS, PROVINCE_SUGGESTIONS, FIELD_SUGGESTIONS,
  fetchPartners, createPartner, updatePartner, setPartnerStatus, deletePartner,
  emptyInput, inputFromRow, validateInput, completeness, scorePartner, phoneHref, zaloHref,
  viberHref, whatsappHref, telegramHref, emailHref, getMailPref, setMailPref, MAIL_APP_LABELS, type MailApp,
  lookupTax, taxLevel, formatCheckedDate, cleanTaxCode, taxAgeDays, taxAgeText, TAX_STALE_DAYS,
  NEEDS_REASON, exportPartnersXlsx, type PartnerFile, type PartnerDocType, DOC_TYPE_LABELS, MAX_FILE_BYTES,
  fetchPartnerFiles, uploadPartnerFile, deletePartnerFile, downloadPartnerFile, formatFileSize, checkPartnerFile, tooBigNotice,
} from "@/lib/partnerDirectory";
import {
  Search, Plus, Pencil, Trash2, Loader2, AlertCircle, X, Phone, Mail, MapPin, LayoutGrid, Rows3,
  Star, Building2, HardHat, Truck, Users, PauseCircle, PlayCircle, Ban, Globe, Link2, Bookmark, ChevronDown, Copy, Check, AlertTriangle, ShieldCheck, Eye, Download, FileText, Upload, Sparkles,
} from "lucide-react";

const KIND_STYLE: Record<PartnerKind, { cls: string; icon: typeof Building2 }> = {
  nha_thau_phu: { cls: "bg-blue-50 text-[#005BAC] border-blue-100", icon: HardHat },
  nha_cung_cap: { cls: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: Truck },
  to_doi: { cls: "bg-amber-50 text-amber-700 border-amber-100", icon: Users },
};

const STATUS_STYLE: Record<PartnerStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-100",
  saved: "bg-sky-50 text-sky-700 border-sky-100",
  paused: "bg-slate-100 text-slate-500 border-slate-200",
  blacklist: "bg-rose-50 text-rose-600 border-rose-200",
};

// Ô chọn của hàng lọc: cao đều nhau, giãn đầy ô lưới để thẳng cột với hàng thẻ thống kê.
const FILTER_SELECT =
  "w-full min-w-0 h-10 sm:h-9 text-base sm:text-xs font-semibold bg-white border border-slate-200 rounded-xl px-3 text-slate-600 cursor-pointer truncate";

const inputCls =
  // text-base trên điện thoại: iOS tự phóng to trang khi ô nhập nhỏ hơn 16px.
  "w-full text-base sm:text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 sm:py-2 focus:bg-white focus:outline-none focus:border-[#00AEEF]";

function regionText(r: PartnerRow): string {
  const parts = [...r.regions.map((x) => REGION_LABELS[x]), ...r.provinces];
  return parts.length ? parts.join(" · ") : "—";
}

export default function PartnerDirectory({ access, who }: { access: PartnerAccess; who: string }) {
  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [kind, setKind] = useState<PartnerKind | "all">("all");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<PartnerRegion | "">("");
  const [field, setField] = useState("");
  const [province, setProvince] = useState("");
  const [exporting, setExporting] = useState(false);
  // Đổi sang Tạm dừng / Danh sách đen phải nêu lý do: mở hộp hỏi lý do trước khi ghi.
  const [reasonFor, setReasonFor] = useState<{ r: PartnerRow; s: PartnerStatus } | null>(null);
  const [minRating, setMinRating] = useState(0);
  const [status, setStatus] = useState<PartnerStatus | "">("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [editing, setEditing] = useState<PartnerRow | "new" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // Tệp PDF thêm/xoá trong form Sửa: tăng số này để danh sách tệp ở cửa sổ chi tiết tải lại.
  const [filesRev, setFilesRev] = useState(0);
  // Nhập bằng AI: cửa sổ AI + form đầy đủ mở từ một kết quả AI (điền sẵn dữ liệu).
  const [aiOpen, setAiOpen] = useState(false);
  const [aiForm, setAiForm] = useState<{ initial: PartnerInput; done: (id: string | null) => void; partner: PartnerRow | null } | null>(null);
  const { ask, confirmNode } = useConfirmBox();

  const load = useCallback(async () => {
    const r = await fetchPartners();
    setRows(r.partners);
    setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<PartnerKind, number> = { nha_thau_phu: 0, nha_cung_cap: 0, to_doi: 0 };
    rows.forEach((r) => (c[r.kind] += 1));
    return c;
  }, [rows]);

  const allFields = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.fields.forEach((f) => s.add(f)));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "vi"));
  }, [rows]);

  // Tỉnh/thành có trong dữ liệu (không liệt kê tỉnh chưa có đối tác nào).
  const allProvinces = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.provinces.forEach((p) => s.add(p)));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "vi"));
  }, [rows]);

  const filtered = useMemo(
    () => {
      const q = query.trim();
      const scored = rows
        .filter((r) => {
        if (kind !== "all" && r.kind !== kind) return false;
        if (status && r.status !== status) return false;
        // Đối tác "Toàn quốc" khớp mọi bộ lọc miền.
        if (region && !r.regions.includes(region) && !r.regions.includes("toan_quoc")) return false;
        if (field && !r.fields.includes(field)) return false;
        // Như bộ lọc miền: đối tác "Toàn quốc" phục vụ được mọi tỉnh.
        if (province && !r.provinces.includes(province) && !r.regions.includes("toan_quoc")) return false;
        if (minRating > 0 && (r.rating ?? 0) < minRating) return false;
        return true;
      })
        .map((r) => ({ r, s: scorePartner(r, q) }))
        .filter((x) => x.s > 0);
      // Có từ khoá: khớp tốt nhất lên đầu (sắp xếp ổn định nên cùng điểm giữ thứ tự mới nhập trước).
      if (q) scored.sort((a, b) => b.s - a.s);
      return scored.map((x) => x.r);
    },
    [rows, kind, status, region, field, province, minRating, query]
  );

  const detail = detailId ? rows.find((r) => r.id === detailId) || null : null;

  const applyStatus = async (r: PartnerRow, s: PartnerStatus, reason: string): Promise<string | null> => {
    setRowErr(null);
    const err = await setPartnerStatus(r.id, s, reason, who || null);
    if (err) {
      setRowErr(err);
      return err;
    }
    load();
    return null;
  };
  const changeStatus = (r: PartnerRow, s: PartnerStatus) => {
    if (NEEDS_REASON.includes(s)) setReasonFor({ r, s });
    else applyStatus(r, s, "");
  };

  const doExport = async () => {
    setExporting(true);
    setRowErr(null);
    try {
      await exportPartnersXlsx(filtered);
    } catch {
      setRowErr("Không xuất được tệp Excel. Thử lại sau.");
    }
    setExporting(false);
  };

  const remove = (r: PartnerRow) =>
    ask({
      title: `Xoá "${r.name}" khỏi danh bạ?`,
      message: "Xoá hẳn, không khôi phục được. Nếu chỉ muốn ngừng hợp tác, hãy chọn \"Tạm dừng\" thay vì xoá.",
      onConfirm: async () => {
        setRowErr(null);
        const err = await deletePartner(r.id);
        if (err) return setRowErr(err);
        setDetailId(null);
        load();
      },
    });

  const filtering = !!(query || region || province || field || minRating || status || kind !== "all");

  return (
    <div className="space-y-4">
      {/* Thẻ đếm = bộ lọc loại hình */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KindTab active={kind === "all"} onClick={() => setKind("all")} label="Tất cả" count={rows.length} cls="bg-slate-50 text-slate-600 border-slate-200" icon={Building2} />
        {KIND_ORDER.map((k) => (
          <KindTab key={k} active={kind === k} onClick={() => setKind(k)} label={KIND_LABELS[k]} count={counts[k]} cls={KIND_STYLE[k].cls} icon={KIND_STYLE[k].icon} />
        ))}
      </div>

      {/* Hàng lọc căn theo đúng 4 cột của hàng thẻ thống kê phía trên: mép các ô thẳng nhau. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="col-span-2 lg:col-span-1 flex items-center gap-2 px-3 h-10 sm:h-9 rounded-xl bg-white border border-slate-200 focus-within:border-[#00AEEF]">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tên, MST, SĐT, liên hệ, lĩnh vực…"
            className="flex-1 min-w-0 bg-transparent text-base sm:text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Xoá ô tìm">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="col-span-2 lg:col-span-1 grid grid-cols-2 gap-3">
          <select value={region} onChange={(e) => setRegion(e.target.value as PartnerRegion | "")} className={FILTER_SELECT}>
            <option value="">Mọi khu vực</option>
            {REGION_ORDER.map((r) => (
              <option key={r} value={r}>{REGION_LABELS[r]}</option>
            ))}
          </select>
          <select value={province} onChange={(e) => setProvince(e.target.value)} className={FILTER_SELECT}>
            <option value="">Mọi tỉnh/thành</option>
            {allProvinces.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2 lg:col-span-1 grid grid-cols-2 gap-3">
          <select value={field} onChange={(e) => setField(e.target.value)} className={FILTER_SELECT}>
            <option value="">Mọi lĩnh vực</option>
            {allFields.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className={FILTER_SELECT}>
            <option value={0}>Mọi điểm</option>
            <option value={4.5}>≥ 4.5 ★ Xuất sắc</option>
            <option value={4}>≥ 4.0 ★ Tốt</option>
            <option value={3.5}>≥ 3.5 ★ Khá</option>
          </select>
        </div>
        <div className="col-span-2 lg:col-span-1 grid grid-cols-[1fr_auto] gap-3">
          <select value={status} onChange={(e) => setStatus(e.target.value as PartnerStatus | "")} className={FILTER_SELECT}>
            <option value="">Mọi trạng thái</option>
            {(Object.keys(STATUS_LABELS) as PartnerStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <div className="flex items-center p-0.5 h-10 sm:h-9 bg-white border border-slate-200 rounded-xl">
            <ViewBtn active={view === "cards"} onClick={() => setView("cards")} title="Dạng thẻ"><LayoutGrid size={14} /></ViewBtn>
            <ViewBtn active={view === "table"} onClick={() => setView("table")} title="Dạng bảng"><Rows3 size={14} /></ViewBtn>
          </div>
        </div>
      </div>

      {/* Số lượng bên trái, các nút thao tác bên phải */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-400">
          {loading ? "" : filtering ? `${filtered.length} / ${rows.length} đối tác` : `${rows.length} đối tác`}
        </p>
        <div className="w-full sm:w-auto flex gap-2">
          <button
            type="button"
            onClick={doExport}
            disabled={exporting || filtered.length === 0}
            title={filtering ? "Xuất các đối tác đang lọc ra Excel" : "Xuất toàn bộ danh bạ ra Excel"}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:border-[#005BAC] hover:text-[#005BAC] disabled:opacity-50 text-slate-600 text-xs sm:text-[11px] font-bold px-4 h-10 sm:h-9 rounded-xl cursor-pointer"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Xuất Excel
          </button>
          {access.manager && (
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              title="Tải ảnh, PDF, mã QR, Excel để AI tự điền thông tin đối tác"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-white border border-[#005BAC] text-[#005BAC] hover:bg-blue-50 text-xs sm:text-[11px] font-bold px-4 h-10 sm:h-9 rounded-xl cursor-pointer"
            >
              <Sparkles size={14} /> Nhập bằng AI
            </button>
          )}
          {access.manager && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs sm:text-[11px] font-bold px-4 h-10 sm:h-9 rounded-xl shadow-sm cursor-pointer"
            >
              <Plus size={14} /> Thêm đối tác
            </button>
          )}
        </div>
      </div>
      {(error || rowErr) && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error || rowErr}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#005BAC]" size={28} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <Building2 size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">{rows.length === 0 ? "Danh bạ chưa có đối tác nào" : "Không có đối tác nào khớp bộ lọc"}</p>
          {rows.length === 0 && access.manager && <p className="text-xs text-slate-400 mt-1">Bấm &quot;Thêm đối tác&quot; để nhập đối tác đầu tiên.</p>}
        </div>
      ) : (
        <>
          {view === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
              {filtered.map((r) => (
                <PartnerCard key={r.id} r={r} onOpen={() => setDetailId(r.id)} onDelete={access.manager ? () => remove(r) : undefined} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
              <table className="w-full text-xs min-w-[1060px]">
                <thead>
                  <tr className="bg-[#005BAC] text-white text-[10px] font-extrabold uppercase tracking-wider text-left">
                    <th className="pl-3 pr-2 py-3 w-12">STT</th>
                    <th className="px-2 py-3 whitespace-nowrap">Ngày nhập</th>
                    <th className="px-4 py-3">Đối tác</th>
                    <th className="px-4 py-3">Loại</th>
                    <th className="px-4 py-3">Liên hệ</th>
                    <th className="px-4 py-3">Khu vực</th>
                    <th className="px-4 py-3">Lĩnh vực</th>
                    <th className="px-4 py-3 text-center">Profile</th>
                    <th className="px-4 py-3 text-center">Đánh giá</th>
                    <th className="px-4 py-3">Điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const c = completeness(r);
                    return (
                      <tr key={r.id} onClick={() => setDetailId(r.id)} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer ${r.status === "active" ? "" : "opacity-60"}`}>
                        <td className="pl-3 pr-2 py-2.5 text-slate-400 font-semibold tabular-nums">{idx + 1}</td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-slate-500 font-semibold tabular-nums">{formatCheckedDate(r.created_at)}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-bold text-slate-700">{r.name}</span>
                          {r.tax_code && <span className="block text-[10px] font-medium text-slate-400">MST {r.tax_code}</span>}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">{KIND_LABELS[r.kind]}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-slate-700">{r.contact_name || r.legal_rep_name || "—"}</span>
                          <span className="block text-[10px] text-slate-400">{r.phone || r.email || ""}</span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{regionText(r)}</td>
                        <td className="px-4 py-2.5 text-slate-500">{r.fields.slice(0, 2).join(", ") || "—"}</td>
                        <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          {linkOf(r.profile_url) ? (
                            <a
                              href={linkOf(r.profile_url) as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Xem Profile công ty"
                              aria-label="Xem Profile công ty"
                              className="inline-flex p-1.5 rounded-lg text-[#005BAC] hover:bg-blue-50"
                            >
                              <Eye size={16} />
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-amber-600">{r.rating == null ? "—" : r.rating.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{c.score}/{c.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {detail && (
        <DetailDrawer
          r={detail}
          access={access}
          who={who}
          filesRev={filesRev}
          onClose={() => setDetailId(null)}
          onEdit={() => setEditing(detail)}
          onStatus={(s) => changeStatus(detail, s)}
          onDelete={() => remove(detail)}
        />
      )}
      {editing && (
        <PartnerFormModal
          partner={editing === "new" ? null : editing}
          defaultKind={kind === "all" ? "nha_thau_phu" : kind}
          who={who}
          onClose={() => {
            setEditing(null);
            setFilesRev((n) => n + 1);
          }}
          onOpenAi={() => {
            setEditing(null);
            setAiOpen(true);
          }}
          onSaved={(warn) => {
            setEditing(null);
            setFilesRev((n) => n + 1);
            if (warn) setRowErr(warn);
            load();
          }}
        />
      )}
      {aiOpen && (
        <PartnerAiImport
          existing={rows}
          who={who}
          onOpenForm={(initial, done, partner) => setAiForm({ initial, done, partner: partner ?? null })}
          onChanged={load}
          onClose={() => setAiOpen(false)}
        />
      )}
      {aiForm && (
        <PartnerFormModal
          partner={aiForm.partner}
          initial={aiForm.initial}
          defaultKind={aiForm.initial.kind}
          who={who}
          onClose={() => setAiForm(null)}
          onSaved={(warn, newId) => {
            aiForm.done(newId ?? aiForm.partner?.id ?? null);
            setAiForm(null);
            if (warn) setRowErr(warn);
            load();
          }}
        />
      )}
      {reasonFor && (
        <ReasonModal
          r={reasonFor.r}
          status={reasonFor.s}
          onClose={() => setReasonFor(null)}
          onConfirm={async (reason) => {
            const err = await applyStatus(reasonFor.r, reasonFor.s, reason);
            if (!err) setReasonFor(null);
            return err;
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}

function KindTab({ active, onClick, label, count, cls, icon: Icon }: { active: boolean; onClick: () => void; label: string; count: number; cls: string; icon: typeof Building2 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all cursor-pointer ${
        active ? "bg-white border-[#005BAC] shadow-sm ring-1 ring-[#005BAC]/20" : "bg-white border-slate-100 hover:border-slate-300"
      }`}
    >
      <span className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${cls}`}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block font-heading font-extrabold text-lg leading-none text-slate-800">{count}</span>
        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-0.5 truncate">{label}</span>
      </span>
    </button>
  );
}

function ViewBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={`p-1.5 rounded-md cursor-pointer ${active ? "bg-[#005BAC] text-white" : "text-slate-400 hover:text-slate-700"}`}>
      {children}
    </button>
  );
}

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-[10px] font-semibold text-slate-300">Chưa chấm</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-600">
      <Star size={10} className="fill-amber-400 text-amber-400" /> {rating.toFixed(1)}
    </span>
  );
}

function CompletenessBar({ r }: { r: PartnerRow | PartnerInput }) {
  const c = completeness(r);
  const pct = (c.score / c.total) * 100;
  return (
    <div title={c.missing.length ? `Còn thiếu: ${c.missing.join(", ")}` : "Hồ sơ đầy đủ"} className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-400"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-400 tabular-nums">{c.score}/{c.total}</span>
    </div>
  );
}

// Nút nhắn tin nhanh: chỉ hiện nền tảng nào đối tác có. Bấm là mở thẳng khung chat
// (Zalo / WhatsApp / Telegram mở được cả trên máy tính; Viber cần đã cài ứng dụng).
// Zalo luôn hiện nếu có số điện thoại, vì hầu hết đối tác dùng Zalo bằng số đó.
function ChatLinks({ r, withLabel, small }: { r: PartnerRow; withLabel?: boolean; small?: boolean }) {
  const all: { key: BrandKey; name: string; href: string | null }[] = [
    { key: "zalo", name: "Zalo", href: zaloHref(r) },
    { key: "viber", name: "Viber", href: viberHref(r.viber) },
    { key: "whatsapp", name: "WhatsApp", href: whatsappHref(r.whatsapp) },
    { key: "telegram", name: "Telegram", href: telegramHref(r.telegram) },
  ];
  const items = all.filter((i) => i.href);
  return (
    <>
      {items.map((i) => (
        <a
          key={i.key}
          href={i.href as string}
          target="_blank"
          rel="noopener noreferrer"
          title={`Nhắn qua ${i.name}`}
          aria-label={`Nhắn qua ${i.name}`}
          className={
            withLabel
              ? "flex-1 min-w-[110px] flex items-center justify-center gap-1.5 text-white font-bold py-2.5 rounded-xl"
              : small
              ? "w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-full hover:opacity-85"
              : "w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center rounded-full hover:opacity-85"
          }
          style={{ backgroundColor: BRAND_ICONS[i.key].color }}
        >
          <svg viewBox="0 0 24 24" width={withLabel ? 15 : small ? 13 : 17} height={withLabel ? 15 : small ? 13 : 17} fill="#fff" aria-hidden="true">
            <path d={BRAND_ICONS[i.key].path} />
          </svg>
          {withLabel && i.name}
        </a>
      ))}
    </>
  );
}

// Nút Email: bấm là mở soạn thư theo cách đã chọn; mũi tên bên phải đổi cách mở
// (Gmail web / Outlook web / ứng dụng mail), nhớ theo trình duyệt.
function EmailButton({ email }: { email: string }) {
  const [app, setApp] = useState<MailApp>("gmail");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApp(getMailPref());
  }, []);
  const choose = (a: MailApp) => {
    setMailPref(a);
    setApp(a);
    setMenu(false);
    const href = emailHref(email, a);
    if (!href) return;
    if (a === "app") window.location.assign(href);
    else window.open(href, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="relative flex-1 min-w-[110px] flex">
      <a
        href={emailHref(email, app) || undefined}
        target={app === "app" ? undefined : "_blank"}
        rel="noopener noreferrer"
        className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-l-xl"
      >
        <Mail size={13} /> Email
      </a>
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        title="Chọn cách mở thư"
        aria-label="Chọn cách mở thư"
        className="px-2 bg-slate-100 hover:bg-slate-200 text-slate-500 border-l border-slate-200 rounded-r-xl cursor-pointer"
      >
        <ChevronDown size={14} />
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-slate-200 rounded-xl shadow-lg p-1">
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Mở thư bằng</p>
            {(Object.keys(MAIL_APP_LABELS) as MailApp[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => choose(a)}
                className={`w-full flex items-center gap-2 text-left text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 ${app === a ? "text-[#005BAC]" : "text-slate-600"}`}
              >
                <span className="w-3 inline-block">{app === a ? "✓" : ""}</span> {MAIL_APP_LABELS[a]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Hộp nhập lý do khi chuyển sang Tạm dừng / Danh sách đen (bắt buộc, trigger 154 cũng chặn) ───
function ReasonModal({ r, status, onClose, onConfirm }: { r: PartnerRow; status: PartnerStatus; onClose: () => void; onConfirm: (reason: string) => Promise<string | null> }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const savingRef = useRef(false);

  async function submit() {
    if (savingRef.current) return;
    if (!reason.trim()) return setErr("Nhập lý do.");
    savingRef.current = true;
    setSaving(true);
    setErr("");
    const e = await onConfirm(reason);
    savingRef.current = false;
    setSaving(false);
    if (e) setErr(e);
  }

  return createPortal(
    <div className="fixed inset-0 z-[95] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3 animate-in zoom-in-95 duration-150"
      >
        <h2 className="font-heading font-extrabold text-sm text-slate-800">
          {status === "blacklist" ? "Đưa vào danh sách đen" : "Tạm dừng hợp tác"}: {r.name}
        </h2>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold text-slate-500">Lý do <span className="text-rose-500">*</span></span>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={status === "blacklist" ? "VD: Giao hàng sai quy cách 2 lần, không bảo hành" : "VD: Chờ bổ sung hồ sơ năng lực"}
            className={inputCls}
          />
        </label>
        <p className="text-[11px] text-slate-400">Hệ thống ghi lại lý do, người thực hiện và thời điểm để sau này đối chiếu.</p>
        {err && (
          <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-xs sm:text-[11px] font-bold text-slate-500 px-4 sm:px-3 py-2.5 sm:py-2 rounded-lg hover:bg-slate-100 cursor-pointer">Huỷ</button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className={`flex items-center gap-1.5 disabled:opacity-60 text-white text-xs sm:text-[11px] font-bold px-5 py-2.5 sm:py-2 rounded-lg cursor-pointer ${status === "blacklist" ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-600 hover:bg-slate-700"}`}
          >
            {saving && <Loader2 size={13} className="animate-spin" />} Xác nhận
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Form THÊM MỚI: chọn trước các tệp PDF, tải lên ngay sau khi lưu đối tác.
function QueuedFiles({ queue, onChange }: { queue: { file: File; docType: PartnerDocType }[]; onChange: (q: { file: File; docType: PartnerDocType }[]) => void }) {
  const [docType, setDocType] = useState<PartnerDocType>("profile");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // tệp quá cỡ: nhắc dán link
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    setErr(null);
    setNotice(null);
    const ok: { file: File; docType: PartnerDocType }[] = [];
    let firstErr: string | null = null;
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) {
        setNotice(tooBigNotice(f));
        continue;
      }
      const m = checkPartnerFile(f);
      if (m) firstErr = firstErr || m;
      else if (!queue.some((q) => q.file.name === f.name && q.file.size === f.size)) ok.push({ file: f, docType });
    }
    if (firstErr) setErr(firstErr);
    if (ok.length) onChange([...queue, ...ok]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mr-auto">Tệp đính kèm (PDF, dưới {MAX_FILE_BYTES / 1024 / 1024}MB)</p>
        <select value={docType} onChange={(e) => setDocType(e.target.value as PartnerDocType)} className="text-base sm:text-[11px] font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 cursor-pointer">
          {(Object.keys(DOC_TYPE_LABELS) as PartnerDocType[]).map((k) => (
            <option key={k} value={k}>{DOC_TYPE_LABELS[k]}</option>
          ))}
        </select>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple onChange={onPick} className="hidden" />
        <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 text-xs sm:text-[11px] font-bold text-[#005BAC] bg-blue-50 hover:bg-blue-100 px-3 py-2 sm:py-1.5 rounded-lg cursor-pointer">
          <Upload size={13} /> Chọn PDF
        </button>
      </div>
      {notice && (
        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {notice}
        </p>
      )}
      {err && <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}</p>}
      {queue.length === 0 ? (
        <p className="text-[11px] text-slate-400 font-semibold">Chưa chọn tệp nào. Tệp sẽ được tải lên khi bấm &quot;Thêm đối tác&quot;.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 bg-white rounded-xl overflow-hidden">
          {queue.map((q, i) => (
            <li key={`${q.file.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <FileText size={16} className="text-rose-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-700 truncate">{q.file.name}</p>
                <p className="text-[10px] font-semibold text-slate-400">{DOC_TYPE_LABELS[q.docType]} · {formatFileSize(q.file.size)} · chờ tải lên</p>
              </div>
              <button type="button" onClick={() => onChange(queue.filter((_, k) => k !== i))} title="Bỏ tệp này" aria-label="Bỏ tệp này" className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Tệp PDF đính kèm (< 10MB): profile năng lực, chứng chỉ, báo giá… ───
function PartnerFiles({ partnerId, canManage, who }: { partnerId: string; canManage: boolean; who: string }) {
  const [files, setFiles] = useState<PartnerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null); // tệp quá cỡ: nhắc dán link
  const [viewing, setViewing] = useState<PartnerFile | null>(null);
  const [docType, setDocType] = useState<PartnerDocType>("profile");
  const inputRef = useRef<HTMLInputElement>(null);
  const { ask, confirmNode } = useConfirmBox();

  const load = useCallback(async () => {
    const r = await fetchPartnerFiles(partnerId);
    setFiles(r.files);
    setErr(r.error);
    setLoading(false);
  }, [partnerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (list.length === 0 || busy) return;
    setBusy(true);
    setErr(null);
    setNotice(null);
    let firstErr: string | null = null;
    for (const f of list) {
      if (f.size > MAX_FILE_BYTES) {
        setNotice(tooBigNotice(f));
        continue;
      }
      const m = await uploadPartnerFile(partnerId, f, docType, who || null);
      if (m && !firstErr) firstErr = m;
    }
    setBusy(false);
    if (firstErr) setErr(firstErr);
    load();
  }

  const remove = (f: PartnerFile) =>
    ask({
      title: `Xoá tệp "${f.file_name}"?`,
      message: "Xoá hẳn khỏi hồ sơ đối tác, không khôi phục được.",
      onConfirm: async () => {
        setErr(null);
        const m = await deletePartnerFile(f);
        if (m) setErr(m);
        load();
      },
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mr-auto">Tệp đính kèm (PDF, dưới {MAX_FILE_BYTES / 1024 / 1024}MB){files.length ? ` · ${files.length}` : ""}</p>
        {canManage && (
          <>
            <select value={docType} onChange={(e) => setDocType(e.target.value as PartnerDocType)} className="text-base sm:text-[11px] font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 cursor-pointer">
              {(Object.keys(DOC_TYPE_LABELS) as PartnerDocType[]).map((k) => (
                <option key={k} value={k}>{DOC_TYPE_LABELS[k]}</option>
              ))}
            </select>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple onChange={onPick} className="hidden" />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs sm:text-[11px] font-bold text-[#005BAC] bg-blue-50 hover:bg-blue-100 disabled:opacity-60 px-3 py-2 sm:py-1.5 rounded-lg cursor-pointer"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Tải PDF lên
            </button>
          </>
        )}
      </div>
      {notice && (
        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {notice}
        </p>
      )}
      {err && (
        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}</p>
      )}
      {loading ? (
        <p className="text-[11px] text-slate-400">Đang tải…</p>
      ) : files.length === 0 ? (
        <p className="text-[11px] text-slate-300 font-semibold">Chưa có tệp nào.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <FileText size={16} className="text-rose-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-700 truncate">{f.file_name}</p>
                <p className="text-[10px] font-semibold text-slate-400">
                  {DOC_TYPE_LABELS[f.doc_type]}
                  {f.size_bytes ? ` · ${formatFileSize(f.size_bytes)}` : ""} · {formatCheckedDate(f.created_at)}
                  {f.uploaded_by ? ` · ${f.uploaded_by}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => setViewing(f)} title="Xem tệp" aria-label="Xem tệp" className="p-2 rounded-lg text-[#005BAC] hover:bg-blue-50 cursor-pointer"><Eye size={16} /></button>
              {canManage && (
                <button type="button" onClick={() => remove(f)} title="Xoá tệp" aria-label="Xoá tệp" className="p-2 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"><Trash2 size={15} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {viewing && <PdfViewerModal file={viewing} onClose={() => setViewing(null)} />}
      {confirmNode}
    </div>
  );
}

// Cửa sổ xem PDF giữa màn hình. Tải nội dung về dạng blob rồi nhúng (xem ghi chú ở downloadPartnerFile).
// Điện thoại thường không hiển thị PDF trong khung nhúng: có nút "Mở tab mới" / "Tải về" để xem.
function PdfViewerModal({ file, onClose }: { file: PartnerFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    downloadPartnerFile(file.file_path).then((blob) => {
      if (!alive) return;
      if (!blob) return setErr("Không mở được tệp. Thử lại sau.");
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [file.file_path]);

  return createPortal(
    <div className="fixed inset-0 z-[96] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl max-sm:h-full h-[90vh] flex flex-col animate-in zoom-in-95 duration-150"
      >
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <FileText size={16} className="text-rose-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-slate-800 truncate">{file.file_name}</p>
            <p className="text-[10px] font-semibold text-slate-400">{DOC_TYPE_LABELS[file.doc_type]}{file.size_bytes ? ` · ${formatFileSize(file.size_bytes)}` : ""}</p>
          </div>
          {url && (
            <>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs sm:text-[11px] font-bold text-[#005BAC] bg-blue-50 hover:bg-blue-100 px-3 py-2 sm:py-1.5 rounded-lg">Mở tab mới</a>
              <a href={url} download={file.file_name} className="flex items-center gap-1 text-xs sm:text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 sm:py-1.5 rounded-lg"><Download size={13} /> Tải về</a>
            </>
          )}
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng"><X size={20} /></button>
        </div>
        <div className="flex-1 min-h-0 bg-slate-100 sm:rounded-b-2xl overflow-hidden">
          {err ? (
            <p className="flex items-center justify-center gap-1.5 h-full text-xs font-semibold text-rose-500"><AlertCircle size={14} /> {err}</p>
          ) : !url ? (
            <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-[#005BAC]" size={28} /></div>
          ) : (
            <iframe src={url} title={file.file_name} className="w-full h-full border-0" />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Băng ghi lý do khi đối tác đang Tạm dừng / Danh sách đen: lý do, ai ghi nhận, lúc nào.
function StatusReasonBanner({ r }: { r: PartnerRow }) {
  if (!NEEDS_REASON.includes(r.status)) return null;
  const black = r.status === "blacklist";
  return (
    <div className={`flex items-start gap-2.5 border rounded-xl px-3.5 py-2.5 ${black ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
      {black ? <Ban size={16} className="mt-0.5 shrink-0" /> : <PauseCircle size={16} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 text-xs">
        <p className="font-extrabold leading-snug">{STATUS_LABELS[r.status]}{r.status_reason ? `: ${r.status_reason}` : ""}</p>
        <p className="font-semibold opacity-80 mt-0.5">
          {r.status_changed_by ? `Ghi nhận bởi ${r.status_changed_by}` : "Chưa có thông tin người ghi nhận"}
          {r.status_changed_at ? ` lúc ${formatCheckedDate(r.status_changed_at)}` : ""}.
        </p>
      </div>
    </div>
  );
}

// ─── Tình trạng mã số thuế: cờ đỏ khi doanh nghiệp không còn hoạt động ───
// Nguồn miễn phí, dữ liệu theo cơ quan thuế và có thể trễ vài ngày — chỉ cho biết tình
// trạng HIỆN TẠI, không đảm bảo uy tín hay không nợ thuế.
function TaxChip({ status, checkedAt }: { status: string | null; checkedAt: string | null }) {
  if (!status) return null;
  const lv = taxLevel(status);
  const date = formatCheckedDate(checkedAt);
  if (lv === "red")
    return (
      <p className="flex items-start gap-1.5 text-[11px] font-extrabold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
        <AlertTriangle size={13} className="mt-px shrink-0" /> <span>Cờ đỏ — {status}</span>
      </p>
    );
  if (lv === "ok") {
    // Kết quả quá cũ không còn đáng tin: đổi sang vàng, nhắc tra lại (xanh mãi là sai ý nghĩa cờ).
    const stale = (taxAgeDays(checkedAt) ?? 0) >= TAX_STALE_DAYS;
    return stale ? (
      <p className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
        <AlertTriangle size={12} /> MST: đã tra {taxAgeText(checkedAt)} — nên tra lại
      </p>
    ) : (
      <p className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
        <ShieldCheck size={12} /> MST đang hoạt động{date && ` · ${date}`}
      </p>
    );
  }
  return <p className="text-[10px] font-bold text-amber-600">MST: {status}</p>;
}

function TaxBanner({ status, checkedAt }: { status: string | null; checkedAt: string | null }) {
  if (!status) return null;
  const lv = taxLevel(status);
  const date = formatCheckedDate(checkedAt);
  const age = taxAgeText(checkedAt);
  const stale = lv === "ok" && (taxAgeDays(checkedAt) ?? 0) >= TAX_STALE_DAYS;
  const cls =
    lv === "red"
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : lv === "ok" && !stale
        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
        : "bg-amber-50 border-amber-200 text-amber-700";
  const Icon = lv === "ok" && !stale ? ShieldCheck : AlertTriangle;
  const title =
    lv === "red"
      ? `CỜ ĐỎ: ${status}`
      : lv === "ok"
        ? stale
          ? `Mã số thuế từng ghi nhận đang hoạt động — đã tra ${age}, nên tra lại`
          : "Mã số thuế đang hoạt động"
        : `Tình trạng mã số thuế: ${status}`;
  const note =
    lv === "red"
      ? "Cần xác minh lại trước khi ký hợp đồng hoặc thanh toán."
      : stale
        ? "Kết quả đã cũ, tình trạng có thể đã thay đổi. Bấm Kiểm tra lại ở form Sửa trước khi giao dịch."
        : lv === "ok"
          ? "Chỉ cho biết tình trạng hiện tại, không đảm bảo uy tín hay không nợ thuế."
          : "Cần kiểm tra thủ công tại tracuunnt.gdt.gov.vn.";
  return (
    <div className={`flex items-start gap-2.5 border rounded-xl px-3.5 py-2.5 ${cls}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-xs">
        <p className="font-extrabold leading-snug">{title}</p>
        <p className="font-semibold opacity-80 mt-0.5">
          {note}
          {date && ` Tra cứu ngày ${date}${age ? ` (${age})` : ""}, theo dữ liệu cơ quan thuế (có thể trễ vài ngày).`}
        </p>
      </div>
    </div>
  );
}

// onDelete chỉ có khi người xem có cờ Chỉnh sửa (RLS 157 chặn thật ở cơ sở dữ liệu): nút X hiện khi rê chuột
// (màn hình cảm ứng không có "rê chuột" nên luôn hiện).
function PartnerCard({ r, onOpen, onDelete }: { r: PartnerRow; onOpen: () => void; onDelete?: () => void }) {
  const tel = phoneHref(r.phone);
  const KIcon = KIND_STYLE[r.kind].icon;
  // Thẻ gọn (khoảng một nửa cỡ trước): nhiều thẻ trên một màn hình; chi tiết đầy đủ xem ở cửa sổ khi bấm.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`bg-white rounded-xl border ${taxLevel(r.tax_status) === "red" ? "border-rose-300 ring-1 ring-rose-200" : "border-slate-100"} group relative hover:border-[#00AEEF] hover:shadow-md shadow-sm p-2.5 space-y-1.5 transition-all cursor-pointer ${r.status === "active" ? "" : "opacity-70"}`}
    >
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          title="Xoá đối tác"
          aria-label={`Xoá ${r.name}`}
          className="absolute top-1.5 right-1.5 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 text-slate-400 hover:text-white hover:bg-rose-500 hover:border-rose-500 shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity cursor-pointer"
        >
          <X size={12} />
        </button>
      )}
      <div className={`flex items-center gap-1.5 ${onDelete ? "pr-6" : ""}`}>
        <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border ${KIND_STYLE[r.kind].cls}`}>
          <KIcon size={9} /> {KIND_LABELS[r.kind]}
        </span>
        {r.status !== "active" && (
          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}>{STATUS_LABELS[r.status]}</span>
        )}
        {r.rating != null && <span className="ml-auto"><Stars rating={r.rating} /></span>}
      </div>
      <h3 className="font-heading font-extrabold text-xs text-slate-800 leading-snug line-clamp-2" title={r.name}>{r.name}</h3>
      <TaxChip status={r.tax_status} checkedAt={r.tax_checked_at} />
      {r.fields.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {r.fields.slice(0, 2).map((f) => (
            <span key={f} className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded max-w-full truncate">{f}</span>
          ))}
          {r.fields.length > 2 && <span className="text-[9px] font-semibold text-slate-400 py-0.5">+{r.fields.length - 2}</span>}
        </div>
      )}
      <div className="text-[10px] space-y-0.5">
        <p className="font-bold text-slate-700 truncate">
          {r.contact_name || r.legal_rep_name || "Chưa có người liên hệ"}
          {r.contact_title && <span className="font-medium text-slate-400"> · {r.contact_title}</span>}
        </p>
        <p className="flex items-center gap-1 text-slate-500"><MapPin size={10} className="shrink-0 text-slate-300" /> <span className="truncate">{regionText(r)}</span></p>
      </div>
      <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {tel && (
          <a href={tel} className="flex items-center gap-1 text-[10px] font-bold text-[#005BAC] bg-blue-50 hover:bg-blue-100 px-1.5 py-1 rounded-md">
            <Phone size={10} /> {r.phone}
          </a>
        )}
        <ChatLinks r={r} small />
      </div>
      <CompletenessBar r={r} />
    </div>
  );
}
function DetailDrawer({ r, access, who, filesRev, onClose, onEdit, onStatus, onDelete }: { r: PartnerRow; access: PartnerAccess; who: string; filesRev: number; onClose: () => void; onEdit: () => void; onStatus: (s: PartnerStatus) => void; onDelete: () => void }) {
  const c = completeness(r);
  const tel = phoneHref(r.phone);
  return createPortal(
    // Giữa màn hình, rộng; trên điện thoại phủ kín màn hình.
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white w-full sm:max-w-4xl max-sm:h-full sm:max-h-[92vh] sm:rounded-2xl flex flex-col shadow-2xl animate-in zoom-in-95 duration-150"
      >
        <div className="shrink-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start gap-3 sm:rounded-t-2xl">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${KIND_STYLE[r.kind].cls}`}>{KIND_LABELS[r.kind]}</span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${STATUS_STYLE[r.status]}`}>{STATUS_LABELS[r.status]}</span>
            </div>
            <h2 className="font-heading font-extrabold text-base text-slate-800 leading-snug">{r.name}</h2>
            {r.short_name && <p className="text-[11px] font-semibold text-slate-400">Tên gọi tắt: {r.short_name}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          <StatusReasonBanner r={r} />
          <TaxBanner status={r.tax_status} checkedAt={r.tax_checked_at} />
          <div className="flex flex-wrap gap-2">
            {tel && <a href={tel} className="flex-1 min-w-[110px] flex items-center justify-center gap-1.5 bg-[#005BAC] text-white font-bold py-2.5 rounded-xl"><Phone size={13} /> Gọi</a>}
            {r.email && <EmailButton email={r.email} />}
            <ChatLinks r={r} withLabel />
          </div>

          <div className="grid md:grid-cols-2 gap-x-10 gap-y-5">
          <div className="space-y-5">
          <Section title="Thông tin liên hệ">
            <Field label="Họ tên" value={r.contact_name} />
            <Field label="Chức danh" value={r.contact_title} />
            <Field label="Điện thoại" value={r.phone} copy />
            {r.phone2 && <Field label="Điện thoại 2" value={r.phone2} copy />}
            <Field label="Email" value={r.email} href={emailHref(r.email)} copy />
            <Field label="Zalo" value={r.zalo} />
            <Field label="Viber" value={r.viber} href={viberHref(r.viber)} />
            <Field label="WhatsApp" value={r.whatsapp} href={whatsappHref(r.whatsapp)} />
            <Field label="Telegram" value={r.telegram} href={telegramHref(r.telegram)} />
          </Section>
          <Section title="Doanh nghiệp">
            <Field label="Mã số thuế" value={r.tax_code} />
            {r.legal_rep_name && <Field label="Người đại diện" value={[r.legal_rep_name, r.legal_rep_title].filter(Boolean).join(" — ")} />}
            <Field label="Địa chỉ" value={r.address} />
            <Field label="Website" value={r.website} icon={Globe} href={linkOf(r.website)} />
            <Field label="Profile công ty" value={r.profile_url} icon={Link2} href={linkOf(r.profile_url)} />
          </Section>
          </div>
          <div className="space-y-5">
          <Section title="Khu vực & năng lực">
            <Field label="Khu vực" value={regionText(r) === "—" ? null : regionText(r)} />
            <Field label="Lĩnh vực" value={r.fields.join(", ")} />
            <Field label="Năng lực" value={r.capability} />
          </Section>
          <Section title="Đánh giá nội bộ">
            <div className="flex items-center gap-2"><Stars rating={r.rating} /></div>
            <Field label="Nguồn" value={r.source} />
            <Field label="Nhận xét" value={r.rating_note} />
            <Field label="Ghi chú" value={r.note} />
          </Section>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Mức đầy đủ hồ sơ</p>
            <CompletenessBar r={r} />
            {c.missing.length > 0 && <p className="text-[11px] text-slate-400 mt-1.5">Còn thiếu: {c.missing.join(", ")}</p>}
          </div>
          </div>
          </div>
          <PartnerFiles key={filesRev} partnerId={r.id} canManage={false} who={who} />
        </div>

        {access.manager && (
            <div className="shrink-0 px-5 py-3 border-t border-slate-100 flex flex-wrap gap-2 sm:rounded-b-2xl">
              <button type="button" onClick={onEdit} className="flex items-center gap-1.5 text-[11px] font-bold bg-[#005BAC] text-white px-3.5 py-2 rounded-lg cursor-pointer"><Pencil size={13} /> Sửa</button>
              {r.status !== "active" && <button type="button" onClick={() => onStatus("active")} className="flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 px-3.5 py-2 rounded-lg cursor-pointer"><PlayCircle size={13} /> Hợp tác lại</button>}
              {r.status !== "saved" && <button type="button" onClick={() => onStatus("saved")} className="flex items-center gap-1.5 text-[11px] font-bold bg-sky-50 text-sky-700 px-3.5 py-2 rounded-lg cursor-pointer"><Bookmark size={13} /> Lưu thông tin</button>}
              {r.status !== "paused" && <button type="button" onClick={() => onStatus("paused")} className="flex items-center gap-1.5 text-[11px] font-bold bg-slate-100 text-slate-600 px-3.5 py-2 rounded-lg cursor-pointer"><PauseCircle size={13} /> Tạm dừng</button>}
              {r.status !== "blacklist" && <button type="button" onClick={() => onStatus("blacklist")} className="flex items-center gap-1.5 text-[11px] font-bold bg-rose-50 text-rose-600 px-3.5 py-2 rounded-lg cursor-pointer"><Ban size={13} /> Danh sách đen</button>}
              {access.manager && <button type="button" onClick={onDelete} className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-rose-500 hover:bg-rose-50 px-3 py-2 rounded-lg cursor-pointer"><Trash2 size={13} /> Xoá</button>}
            </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// Chỉ cho bấm link http(s) — chặn javascript: / data: lỡ bị dán vào ô Website.
function linkOf(s: string | null | undefined): string | null {
  const v = (s || "").trim();
  if (!v) return null;
  const u = /^https?:\/\//i.test(v) ? v : /^[a-z][a-z0-9+.-]*:/i.test(v) ? "" : `https://${v}`;
  return u || null;
}

// Nút sao chép nhanh: đổi thành dấu ✓ trong 1,5 giây để biết đã chép.
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Trình duyệt chặn clipboard (http, iframe…): chép bằng ô tạm.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* không chép được: không báo ✓ giả */
        document.body.removeChild(ta);
        return;
      }
      document.body.removeChild(ta);
    }
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={done ? "Đã sao chép" : `Sao chép ${label}`}
      aria-label={`Sao chép ${label}`}
      className={`shrink-0 p-1 rounded-md cursor-pointer ${done ? "text-emerald-500" : "text-slate-300 hover:text-[#005BAC] hover:bg-blue-50"}`}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function Field({ label, value, icon: Icon, href, copy }: { label: string; value: string | null | undefined; icon?: typeof Globe; href?: string | null; copy?: boolean }) {
  const inner = (
    <>
      {Icon && value ? <Icon size={11} className="inline mr-1 text-slate-300" /> : null}
      {value || "—"}
    </>
  );
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-slate-400 font-semibold">{label}</span>
      {href && value ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 break-all font-semibold text-[#005BAC] hover:underline">{inner}</a>
      ) : (
        <span className={`flex-1 min-w-0 break-words font-semibold ${value ? "text-slate-700" : "text-slate-300"}`}>{inner}</span>
      )}
      {copy && value && <CopyButton text={value} label={label.toLowerCase()} />}
    </div>
  );
}

// ─── Ô nhập nhiều giá trị (tỉnh/thành, lĩnh vực): Enter hoặc dấu phẩy để thêm ───
function ChipInput({ values, onChange, suggestions, listId, placeholder }: { values: string[]; onChange: (v: string[]) => void; suggestions: string[]; listId: string; placeholder: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setText("");
  };
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 focus-within:bg-white focus-within:border-[#00AEEF]">
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 pl-2 pr-1 py-0.5 rounded-md">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="text-slate-300 hover:text-rose-500 cursor-pointer" aria-label={`Bỏ ${v}`}><X size={11} /></button>
          </span>
        ))}
        <input
          list={listId}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            // Chọn từ gợi ý (datalist) trả về nguyên giá trị -> thêm luôn.
            if (suggestions.includes(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => add(text)}
          placeholder={values.length ? "" : placeholder}
          className="flex-1 min-w-[120px] bg-transparent text-xs font-semibold text-slate-700 focus:outline-none px-1.5 py-1"
        />
      </div>
      <datalist id={listId}>
        {suggestions.filter((s) => !values.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

function Lbl({ text, req, className = "", children }: { text: string; req?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-[10px] font-bold text-slate-500">{text}{req && <span className="text-rose-500"> *</span>}</span>
      {children}
    </label>
  );
}

function PartnerFormModal({ partner, initial, defaultKind, who, onClose, onSaved, onOpenAi }: { partner: PartnerRow | null; initial?: PartnerInput; defaultKind: PartnerKind; who: string; onClose: () => void; onSaved: (warn?: string, newId?: string | null) => void; onOpenAi?: () => void }) {
  const [v, setV] = useState<PartnerInput>(() => initial ?? (partner ? inputFromRow(partner) : emptyInput(defaultKind)));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const savingRef = useRef(false);
  const set = <K extends keyof PartnerInput>(k: K, val: PartnerInput[K]) => setV((p) => ({ ...p, [k]: val }));
  // Thêm MỚI: tệp PDF chọn trước, tải lên ngay sau khi tạo xong (cần id đối tác).
  // Sửa đối tác ĐÃ CÓ: tải/xoá tệp tức thì qua PartnerFiles.
  const [queue, setQueue] = useState<{ file: File; docType: PartnerDocType }[]>([]);

  // ─── Tra mã số thuế ───
  type TaxNote = { kind: "err" | "none"; text?: string } | { kind: "found"; officialName: string | null; usedBase: boolean };
  const [checking, setChecking] = useState(false);
  const [taxNote, setTaxNote] = useState<TaxNote | null>(null);
  // MST mà kết quả tra đang gắn với; ô MST đổi sang số khác thì kết quả cũ mất hiệu lực.
  // Dữ liệu AI điền sẵn có thể đã kèm kết quả tra MST: coi như đã tra cho đúng số đó.
  const checkedCode = useRef(cleanTaxCode(initial ? (initial.tax_status ? initial.tax_code : "") : partner?.tax_code ?? ""));
  const curCode = useRef(cleanTaxCode(initial?.tax_code ?? partner?.tax_code ?? ""));

  const onTaxCodeChange = (val: string) => {
    const c = cleanTaxCode(val);
    curCode.current = c;
    setV((p) => (c === checkedCode.current ? { ...p, tax_code: val } : { ...p, tax_code: val, tax_status: "", tax_checked_at: "" }));
    if (c !== checkedCode.current) setTaxNote(null);
  };

  async function checkTax() {
    const code = cleanTaxCode(v.tax_code);
    if (!code) return setTaxNote({ kind: "err", text: "Nhập mã số thuế trước khi kiểm tra." });
    setChecking(true);
    setTaxNote(null);
    const r = await lookupTax(code);
    setChecking(false);
    // Người dùng đã sửa MST trong lúc chờ: bỏ kết quả của số cũ.
    if (curCode.current !== code) return;
    if (!r.ok) return setTaxNote({ kind: "err", text: r.error });
    if (!r.found) return setTaxNote({ kind: "none" });
    checkedCode.current = code;
    // Chỉ điền vào ô còn TRỐNG, không ghi đè thứ người dùng đã nhập.
    setV((p) => ({
      ...p,
      tax_status: r.status || "",
      tax_checked_at: r.status ? r.checkedAt : "",
      name: p.name.trim() ? p.name : r.name || "",
      address: p.address.trim() ? p.address : r.address || "",
    }));
    setTaxNote({ kind: "found", officialName: r.name, usedBase: r.usedBase });
  }

  const toggleRegion = (r: PartnerRegion) =>
    set("regions", v.regions.includes(r) ? v.regions.filter((x) => x !== r) : [...v.regions, r]);

  async function save() {
    if (savingRef.current) return;
    const bad = validateInput(v);
    if (bad) return setErr(bad);
    savingRef.current = true;
    setSaving(true);
    setErr("");
    let e: string | null;
    let newId: string | null = null;
    if (partner) {
      e = await updatePartner(partner.id, v, who || null);
    } else {
      const res = await createPartner(v, who || null);
      e = res.error;
      newId = res.id;
    }
    if (e) {
      savingRef.current = false;
      setSaving(false);
      return setErr(e);
    }
    // Đối tác đã lưu; tệp lỗi không được làm mất đối tác -> chỉ báo cảnh báo.
    let warn: string | undefined;
    if (newId && queue.length) {
      const failed: string[] = [];
      for (const q of queue) {
        const m = await uploadPartnerFile(newId, q.file, q.docType, who || null);
        if (m) failed.push(m);
      }
      if (failed.length) warn = `Đã thêm đối tác nhưng ${failed.length}/${queue.length} tệp PDF chưa tải lên được: ${failed[0]} Mở hồ sơ > Sửa để tải lại.`;
    }
    savingRef.current = false;
    setSaving(false);
    onSaved(warn, newId);
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center sm:p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-sm:h-full sm:max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-2 px-4 sm:px-6 pt-5 pb-3 border-b border-slate-100">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">{partner ? "Sửa đối tác" : "Thêm đối tác"}</h2>
          <div className="w-24 sm:w-40"><CompletenessBar r={v} /></div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5">
          {onOpenAi && !partner && (
            <button
              type="button"
              onClick={onOpenAi}
              className="w-full flex items-center justify-center gap-2 text-xs font-bold text-[#005BAC] bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-xl px-4 py-3 cursor-pointer"
            >
              <Sparkles size={15} /> Có ảnh, PDF, mã QR hoặc Excel? Để AI tự điền thông tin
            </button>
          )}
          <div className="flex flex-wrap gap-1.5">
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => set("kind", k)}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold border cursor-pointer ${v.kind === k ? "bg-[#005BAC] border-transparent text-white" : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"}`}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>

          <Block title="Doanh nghiệp">
            <Lbl text={v.kind === "to_doi" ? "Tên tổ đội / đơn vị chủ quản" : "Tên doanh nghiệp"} req className="sm:col-span-2">
              <input autoFocus value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Công ty TNHH Xây dựng Song Phú" className={inputCls} />
            </Lbl>
            <Lbl text="Tên gọi tắt"><input value={v.short_name} onChange={(e) => set("short_name", e.target.value)} className={inputCls} /></Lbl>
            <Lbl text="Mã số thuế">
              <div className="flex gap-2">
                <input value={v.tax_code} onChange={(e) => onTaxCodeChange(e.target.value)} inputMode="numeric" placeholder="10 hoặc 13 chữ số" className={inputCls} />
                <button
                  type="button"
                  onClick={checkTax}
                  disabled={checking}
                  title="Tra tình trạng hoạt động theo dữ liệu cơ quan thuế"
                  className="shrink-0 flex items-center gap-1.5 text-xs sm:text-[11px] font-bold text-[#005BAC] bg-blue-50 hover:bg-blue-100 disabled:opacity-60 px-3 rounded-lg cursor-pointer"
                >
                  {checking ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Kiểm tra
                </button>
              </div>
            </Lbl>
            {(v.tax_status || taxNote) && (
              <div className="sm:col-span-2 space-y-2">
                <TaxBanner status={v.tax_status || null} checkedAt={v.tax_checked_at || null} />
                {taxNote?.kind === "err" && (
                  <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {taxNote.text}</p>
                )}
                {taxNote?.kind === "none" && (
                  <p className="text-[11px] font-semibold text-amber-600">
                    Nguồn tra cứu không có mã số thuế này. Nguồn chưa phủ hết doanh nghiệp nên chưa kết luận gì; kiểm tra thủ công tại tracuunnt.gdt.gov.vn.
                  </p>
                )}
                {taxNote?.kind === "found" && (
                  <div className="text-[11px] font-semibold text-slate-500 space-y-1">
                    {taxNote.usedBase && <p className="text-amber-600">Chi nhánh không có riêng trong nguồn, kết quả là của MST công ty (10 số đầu).</p>}
                    {taxNote.officialName && normalizeName(taxNote.officialName) !== normalizeName(v.name) && (
                      <p className="flex flex-wrap items-center gap-2">
                        Tên theo cơ quan thuế: <b className="text-slate-700">{taxNote.officialName}</b>
                        <button type="button" onClick={() => set("name", taxNote.officialName || "")} className="text-[#005BAC] underline cursor-pointer">Dùng tên này</button>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <Lbl text="Địa chỉ trụ sở" className="sm:col-span-2"><input value={v.address} onChange={(e) => set("address", e.target.value)} className={inputCls} /></Lbl>
            <Lbl text="Website"><input value={v.website} onChange={(e) => set("website", e.target.value)} className={inputCls} /></Lbl>
            <Lbl text="Profile công ty (dán link)"><input value={v.profile_url} onChange={(e) => set("profile_url", e.target.value)} inputMode="url" placeholder="Link Drive, Zalo, website…" className={inputCls} /></Lbl>
            <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
              {partner ? (
                <PartnerFiles partnerId={partner.id} canManage who={who} />
              ) : (
                <QueuedFiles queue={queue} onChange={setQueue} />
              )}
            </div>
          </Block>

          <Block title="Thông tin liên hệ">
            <Lbl text="Họ tên"><input value={v.contact_name} onChange={(e) => set("contact_name", e.target.value)} className={inputCls} /></Lbl>
            <Lbl text="Chức danh"><input value={v.contact_title} onChange={(e) => set("contact_title", e.target.value)} placeholder="VD: Trưởng phòng Kinh doanh" className={inputCls} /></Lbl>
            <Lbl text="Số điện thoại"><input value={v.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" className={inputCls} /></Lbl>
            <Lbl text="Số điện thoại 2"><input value={v.phone2} onChange={(e) => set("phone2", e.target.value)} inputMode="tel" className={inputCls} /></Lbl>
            <Lbl text="Email"><input value={v.email} onChange={(e) => set("email", e.target.value)} type="email" className={inputCls} /></Lbl>
            <Lbl text="Zalo (số hoặc link)"><input value={v.zalo} onChange={(e) => set("zalo", e.target.value)} placeholder="Bỏ trống = dùng số điện thoại" className={inputCls} /></Lbl>
            <Lbl text="Viber (số điện thoại)"><input value={v.viber} onChange={(e) => set("viber", e.target.value)} inputMode="tel" className={inputCls} /></Lbl>
            <Lbl text="WhatsApp (số điện thoại)"><input value={v.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" className={inputCls} /></Lbl>
            <Lbl text="Telegram (@tên, số hoặc link)"><input value={v.telegram} onChange={(e) => set("telegram", e.target.value)} className={inputCls} /></Lbl>
          </Block>

          <Block title="Khu vực hoạt động">
            <div className="sm:col-span-2 flex flex-wrap gap-1.5">
              {REGION_ORDER.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRegion(r)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${v.regions.includes(r) ? "bg-[#00AEEF]/10 border-[#00AEEF] text-[#005BAC]" : "bg-white border-slate-200 text-slate-500"}`}
                >
                  {REGION_LABELS[r]}
                </button>
              ))}
            </div>
            <Lbl text="Tỉnh / thành phố (gõ rồi Enter, chọn được nhiều)" className="sm:col-span-2">
              <ChipInput values={v.provinces} onChange={(x) => set("provinces", x)} suggestions={PROVINCE_SUGGESTIONS} listId="pd-provinces" placeholder="VD: Đồng Nai" />
            </Lbl>
          </Block>

          <Block title="Năng lực">
            <Lbl text="Lĩnh vực / nhóm ngành" className="sm:col-span-2">
              <ChipInput values={v.fields} onChange={(x) => set("fields", x)} suggestions={FIELD_SUGGESTIONS} listId="pd-fields" placeholder="VD: Bê tông thương phẩm" />
            </Lbl>
            <Lbl text="Mô tả năng lực, mặt hàng / dịch vụ chính" className="sm:col-span-2">
              <textarea value={v.capability} onChange={(e) => set("capability", e.target.value)} rows={3} className={inputCls} />
            </Lbl>
          </Block>

          <Block title="Nội bộ">
            <Lbl text="Điểm đánh giá (0 – 5)"><input value={v.rating} onChange={(e) => set("rating", e.target.value)} inputMode="decimal" placeholder="VD: 4.5" className={inputCls} /></Lbl>
            <Lbl text="Trạng thái">
              <select value={v.status} onChange={(e) => set("status", e.target.value as PartnerStatus)} className={inputCls}>
                {(Object.keys(STATUS_LABELS) as PartnerStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </Lbl>
            {NEEDS_REASON.includes(v.status) && (
              <Lbl text={`Lý do ${v.status === "blacklist" ? "đưa vào danh sách đen" : "tạm dừng"}`} req className="sm:col-span-2">
                <input value={v.status_reason} onChange={(e) => set("status_reason", e.target.value)} placeholder="Ghi rõ vì sao — hệ thống lưu kèm người thực hiện và thời điểm" className={inputCls} />
              </Lbl>
            )}
            <Lbl text="Nguồn (ai giới thiệu, thu thập từ đâu)" className="sm:col-span-2">
              <input value={v.source} onChange={(e) => set("source", e.target.value)} placeholder="VD: Mr Lộc giới thiệu, FB Ads, Hotline, Zalo Ms Thương…" className={inputCls} />
            </Lbl>
            <Lbl text="Nhận xét đánh giá" className="sm:col-span-2"><input value={v.rating_note} onChange={(e) => set("rating_note", e.target.value)} placeholder="VD: Giao hàng đúng hẹn, giá cạnh tranh" className={inputCls} /></Lbl>
            <Lbl text="Ghi chú" className="sm:col-span-2"><textarea value={v.note} onChange={(e) => set("note", e.target.value)} rows={2} className={inputCls} /></Lbl>
          </Block>
        </div>

        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 space-y-2">
          {err && (
            <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="text-xs sm:text-[11px] font-bold text-slate-500 px-4 sm:px-3 py-2.5 sm:py-2 rounded-lg hover:bg-slate-100 cursor-pointer">Huỷ</button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-[11px] font-bold px-6 sm:px-5 py-2.5 sm:py-2 rounded-lg cursor-pointer"
            >
              {saving && <Loader2 size={13} className="animate-spin" />} {partner ? "Lưu" : "Thêm đối tác"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#005BAC]">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

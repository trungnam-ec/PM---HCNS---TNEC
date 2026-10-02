"use client";

// ============================================================
// Kho BHLĐ > Đối tác
//
// Hai nguồn:
//   • Nhà cung cấp — danh mục RIÊNG của kho (atld_partners), Thủ kho thêm/sửa/xoá.
//   • Nhà thầu — DÙNG CHUNG Danh mục đối tác của Hồ sơ trình ký (finance_partners,
//     user yêu cầu 02/10/2026, migration 117). Ở đây chỉ xem + thêm nhanh; sửa,
//     xoá, số tài khoản làm bên Hồ sơ trình ký để hai nơi không lệch nhau.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirmBox } from "@/components/ConfirmDialog";
import { normalizeName } from "@/lib/approvers";
import {
  type AtldPartner,
  type AtldContractor,
  type PartnerInput,
  fetchPartners,
  fetchContractors,
  createPartner,
  createContractor,
  updatePartner,
  setPartnerActive,
  deletePartner,
  matchesQuery,
} from "@/lib/atldStock";
import { Search, Plus, Pencil, Trash2, Loader2, AlertCircle, X, Handshake, EyeOff, Eye, Link2 } from "lucide-react";

type View = "ncc" | "nha_thau";

export default function AtldPartnerCatalog({ canEdit }: { canEdit: boolean }) {
  const [suppliers, setSuppliers] = useState<AtldPartner[]>([]);
  const [contractors, setContractors] = useState<AtldContractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("ncc");
  const [editing, setEditing] = useState<AtldPartner | "new" | null>(null);
  const [addingContractor, setAddingContractor] = useState(false);
  const { ask, confirmNode } = useConfirmBox();

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([fetchPartners(), fetchContractors()]);
    // Dòng "nha_thau" cũ (trước 117) không hiện nữa — nhà thầu giờ lấy từ danh mục chung.
    setSuppliers(p.partners.filter((x) => x.kind === "ncc"));
    setContractors(c.contractors);
    setError(p.error || c.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const filteredSuppliers = useMemo(
    () =>
      query.trim()
        ? suppliers.filter((p) => matchesQuery(normalizeName(`${p.name} ${p.phone || ""} ${p.address || ""} ${p.note || ""}`), query))
        : suppliers,
    [suppliers, query]
  );
  const filteredContractors = useMemo(
    () =>
      query.trim()
        ? contractors.filter((c) => matchesQuery(normalizeName(`${c.name} ${c.short_name || ""}`), query))
        : contractors,
    [contractors, query]
  );

  const toggleActive = async (p: AtldPartner) => {
    setRowErr(null);
    const err = await setPartnerActive(p.id, !p.active);
    if (err) return setRowErr(err);
    load();
  };

  const remove = (p: AtldPartner) =>
    ask({
      title: `Xoá nhà cung cấp "${p.name}"?`,
      message: "Chỉ xoá được nhà cung cấp CHƯA có trong phiếu kho. Đã dùng thì chuyển sang \"Ngừng dùng\".",
      onConfirm: async () => {
        setRowErr(null);
        const err = await deletePartner(p.id);
        if (err) return setRowErr(err);
        load();
      },
    });

  const VIEWS: { key: View; label: string }[] = [
    { key: "ncc", label: `Nhà cung cấp (${suppliers.length})` },
    { key: "nha_thau", label: `Nhà thầu (${contractors.length})` },
  ];

  const empty = view === "ncc" ? filteredSuppliers.length === 0 : filteredContractors.length === 0;
  const total = view === "ncc" ? suppliers.length : contractors.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 flex-1 min-w-[220px] max-w-lg focus-within:border-[#00AEEF]">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "ncc" ? "Tìm nhà cung cấp, số điện thoại…" : "Tìm nhà thầu theo tên hoặc tên gọi tắt…"}
            className="flex-1 min-w-0 bg-transparent text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Xoá ô tìm">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {VIEWS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setView(k.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                view === k.key ? "bg-[#005BAC] border-transparent text-white" : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => (view === "ncc" ? setEditing("new") : setAddingContractor(true))}
            className="ml-auto flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-[11px] font-bold px-4 py-2 rounded-xl shadow-sm cursor-pointer"
          >
            <Plus size={14} /> {view === "ncc" ? "Thêm nhà cung cấp" : "Thêm nhà thầu"}
          </button>
        )}
      </div>

      {view === "nha_thau" && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 text-[#005BAC] text-[11px] font-semibold px-4 py-2.5 rounded-xl">
          <Link2 size={14} className="mt-0.5 shrink-0" />
          <span>
            Dùng chung <b>Danh mục đối tác</b> của Hồ sơ trình ký. Nhà thầu thêm ở đây sẽ hiện luôn bên đó; sửa tên, mã số thuế, số tài
            khoản hay xoá thì làm ở Hồ sơ trình ký.
          </span>
        </div>
      )}

      {(error || rowErr) && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold px-4 py-3 rounded-xl">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error || rowErr}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-[#005BAC]" size={28} />
        </div>
      ) : empty ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
          <Handshake size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-bold text-slate-600">
            {total === 0 ? (view === "ncc" ? "Chưa có nhà cung cấp nào" : "Chưa có nhà thầu nào") : "Không có đối tác nào khớp"}
          </p>
          {total === 0 && canEdit && (
            <p className="text-xs text-slate-400 mt-1">
              Bấm &quot;{view === "ncc" ? "Thêm nhà cung cấp" : "Thêm nhà thầu"}&quot; để thêm.
            </p>
          )}
        </div>
      ) : view === "ncc" ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left">
                <th className="px-4 py-3">Nhà cung cấp</th>
                <th className="px-4 py-3">Điện thoại</th>
                <th className="px-4 py-3">Địa chỉ</th>
                {canEdit && <th className="px-4 py-3 w-28" />}
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((p) => (
                <tr key={p.id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/50 ${p.active ? "" : "opacity-55"}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">
                    {p.name}
                    {!p.active && <span className="ml-1.5 text-[10px] font-bold text-slate-400">· Ngừng dùng</span>}
                    {p.note && <span className="block text-[10px] font-medium text-slate-400">{p.note}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{p.phone || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-500">{p.address || "—"}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <RowBtn title="Sửa" onClick={() => setEditing(p)}><Pencil size={13} /></RowBtn>
                        <RowBtn title={p.active ? "Ngừng dùng" : "Dùng lại"} onClick={() => toggleActive(p)}>
                          {p.active ? <EyeOff size={13} /> : <Eye size={13} />}
                        </RowBtn>
                        <RowBtn title="Xoá" danger onClick={() => remove(p)}><Trash2 size={13} /></RowBtn>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 text-left">
                <th className="px-4 py-3">Nhà thầu</th>
                <th className="px-4 py-3">Tên gọi tắt</th>
              </tr>
            </thead>
            <tbody>
              {filteredContractors.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-semibold text-slate-700">{c.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{c.short_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <SupplierModal
          partner={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {addingContractor && (
        <ContractorModal
          existing={contractors}
          onClose={() => setAddingContractor(false)}
          onSaved={() => {
            setAddingContractor(false);
            load();
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}

function RowBtn({ title, danger, onClick, children }: { title: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg text-slate-400 transition-all cursor-pointer ${
        danger ? "hover:text-rose-600 hover:bg-rose-50" : "hover:text-[#005BAC] hover:bg-blue-50"
      }`}
    >
      {children}
    </button>
  );
}

const inputCls =
  "w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:bg-white focus:outline-none focus:border-[#00AEEF]";

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center gap-2">
          <h2 className="font-heading font-extrabold text-sm text-slate-800 flex-1">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 cursor-pointer" aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ModalFooter({ saving, label, onClose, onSave, err }: { saving: boolean; label: string; onClose: () => void; onSave: () => void; err: string }) {
  return (
    <>
      {err && (
        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-rose-500">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="text-[11px] font-bold text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 cursor-pointer">
          Huỷ
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold px-4 py-2 rounded-lg cursor-pointer"
        >
          {saving && <Loader2 size={13} className="animate-spin" />} {label}
        </button>
      </div>
    </>
  );
}

function SupplierModal({ partner, onClose, onSaved }: { partner: AtldPartner | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<PartnerInput>({
    kind: "ncc",
    name: partner?.name ?? "",
    bdh_name: partner?.bdh_name ?? "",
    phone: partner?.phone ?? "",
    address: partner?.address ?? "",
    note: partner?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const savingRef = useRef(false);
  const set = <K extends keyof PartnerInput>(k: K, val: PartnerInput[K]) => setV((p) => ({ ...p, [k]: val }));

  async function save() {
    if (savingRef.current) return;
    if (!v.name.trim()) return setErr("Nhập tên nhà cung cấp.");
    savingRef.current = true;
    setSaving(true);
    setErr("");
    const e = partner ? await updatePartner(partner.id, v) : await createPartner(v);
    savingRef.current = false;
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  return (
    <ModalShell title={partner ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[10px] font-bold text-slate-500">Tên nhà cung cấp *</span>
          <input autoFocus value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Mr. Mạnh / Công ty ABC" className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold text-slate-500">Điện thoại</span>
          <input value={v.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold text-slate-500">Địa chỉ</span>
          <input value={v.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[10px] font-bold text-slate-500">Ghi chú</span>
          <input value={v.note} onChange={(e) => set("note", e.target.value)} placeholder="VD: HĐ mua bán 07052026" className={inputCls} />
        </label>
      </div>
      <ModalFooter saving={saving} label={partner ? "Lưu" : "Thêm nhà cung cấp"} onClose={onClose} onSave={save} err={err} />
    </ModalShell>
  );
}

function ContractorModal({ existing, onClose, onSaved }: { existing: AtldContractor[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const savingRef = useRef(false);

  // Danh sách chỉ gồm nhà thầu ĐANG DÙNG; trùng với tên đã ngừng dùng thì CSDL
  // vẫn trả lại dòng cũ (không tạo bản thứ hai) nên câu báo chỉ là gợi ý.
  const dup = existing.find((c) => name.trim() && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function save() {
    if (savingRef.current) return;
    if (!name.trim()) return setErr("Nhập tên nhà thầu.");
    if (dup) return onClose();
    savingRef.current = true;
    setSaving(true);
    setErr("");
    const e = await createContractor(name, shortName);
    savingRef.current = false;
    setSaving(false);
    if (e) return setErr(e);
    onSaved();
  }

  return (
    <ModalShell title="Thêm nhà thầu vào danh mục chung" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[10px] font-bold text-slate-500">Tên nhà thầu đầy đủ *</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Công ty TNHH Xây dựng Song Phú" className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-bold text-slate-500">Tên gọi tắt</span>
          <input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="VD: Song Phú" className={inputCls} />
        </label>
      </div>
      {dup ? (
        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-amber-600">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> Nhà thầu này đã có trong danh mục — không cần thêm.
        </p>
      ) : (
        <p className="text-[11px] text-slate-400">
          Nhà thầu sẽ hiện luôn ở Hồ sơ trình ký &gt; Danh mục đối tác. Mã số thuế và số tài khoản bổ sung ở đó.
        </p>
      )}
      <ModalFooter saving={saving} label={dup ? "Đóng" : "Thêm nhà thầu"} onClose={onClose} onSave={save} err={err} />
    </ModalShell>
  );
}

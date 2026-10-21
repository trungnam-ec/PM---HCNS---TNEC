"use client";

// ============================================================
// PrivacyPolicyPanel — tab "Chính sách bảo mật" trong Cài đặt hệ thống.
//
// MỌI tài khoản đều đọc được và bấm "Tôi đã đọc và đã hiểu" (ghi một dòng vào
// privacy_policy_acks, migration 158, khoá theo email + số phiên bản).
//
// ADMIN còn có nút "Chỉnh sửa": sửa nội dung, xem trước, bấm Lưu thì thêm một
// dòng vào privacy_policy_versions (migration 159). Đổi số phiên bản = mọi người
// phải xác nhận lại; giữ nguyên số phiên bản = sửa nhỏ, không ai phải xác nhận lại.
// Cú pháp nội dung và bản mặc định: lib/privacyPolicy.ts.
// ============================================================

import { Fragment, useEffect, useState } from "react";
import { CheckCircle2, History, Pencil, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { usePrivacyPolicy } from "@/lib/usePrivacyPolicy";
import {
  POLICY_COMPANY,
  parsePolicy,
  type PolicyBlock,
  type PolicyVersionRow,
} from "@/lib/privacyPolicy";

const errText = (err: unknown) =>
  err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as any).message) : String(err);

const fmtTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/** **chữ** -> in đậm. Không dùng dangerouslySetInnerHTML nên nội dung Admin gõ không chạy được mã. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="text-slate-800">{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

function Blocks({ blocks }: { blocks: PolicyBlock[] }) {
  return (
    <>
      {blocks.map((b, idx) => {
        if (b.kind === "p") {
          return <p key={idx} className="text-sm text-slate-700 leading-relaxed"><Inline text={b.text} /></p>;
        }
        if (b.kind === "ul") {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1.5 text-sm text-slate-700 leading-relaxed">
              {b.items.map((it, i) => <li key={i}><Inline text={it} /></li>)}
            </ul>
          );
        }
        return (
          <div key={idx} className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr>
                  {b.head.map((h, i) => (
                    <th key={i} className="bg-slate-50 text-slate-500 font-bold px-3 py-2 border border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, i) => (
                      <td key={i} className={`px-3 py-2 border border-slate-200 align-top text-slate-700 ${i === 0 ? "font-bold" : ""}`}>
                        <Inline text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

function PolicyView({ body }: { body: string }) {
  const parsed = parsePolicy(body);
  return (
    <>
      {parsed.intro.length > 0 && (
        <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-3">
          <Blocks blocks={parsed.intro} />
        </div>
      )}
      {parsed.sections.map((s, i) => (
        <section key={i} className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-3">
          <h3 className="font-heading font-bold text-slate-800 text-sm">{s.title}</h3>
          <Blocks blocks={s.blocks} />
        </section>
      ))}
    </>
  );
}

export default function PrivacyPolicyPanel() {
  const user = useCurrentUser();
  const policy = usePrivacyPolicy();
  const email = user.authenticated ? user.email.trim().toLowerCase() : "";

  // ─── Xác nhận đã đọc ───
  // null = đang tải, "" = chưa xác nhận, còn lại = thời điểm đã xác nhận
  const [ackedAt, setAckedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user.loading || policy.loading) return;
    if (!email) {
      setAckedAt("");
      return;
    }
    setAckedAt(null);
    let mounted = true;
    supabase
      .from("privacy_policy_acks")
      .select("acknowledged_at")
      .eq("email", email)
      .eq("policy_version", policy.version)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!mounted) return;
        if (err) {
          console.error("Error loading privacy ack:", err);
          setError("Không đọc được trạng thái xác nhận: " + errText(err));
          setAckedAt("");
          return;
        }
        setAckedAt(data?.acknowledged_at || "");
      });
    return () => {
      mounted = false;
    };
  }, [email, user.loading, policy.loading, policy.version]);

  const handleAck = async () => {
    if (!email || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data, error: err } = await supabase
        .from("privacy_policy_acks")
        .insert({ email, policy_version: policy.version })
        .select("acknowledged_at")
        .single();
      // 23505 = đã xác nhận từ máy khác: coi như thành công, đọc lại thời điểm cũ.
      if (err && (err as any).code !== "23505") throw err;
      if (data?.acknowledged_at) {
        setAckedAt(data.acknowledged_at);
      } else {
        const { data: old } = await supabase
          .from("privacy_policy_acks")
          .select("acknowledged_at")
          .eq("email", email)
          .eq("policy_version", policy.version)
          .maybeSingle();
        setAckedAt(old?.acknowledged_at || new Date().toISOString());
      }
    } catch (err) {
      console.error("Error saving privacy ack:", err);
      setError("Không lưu được xác nhận: " + errText(err));
    } finally {
      setSaving(false);
    }
  };

  // ─── Admin chỉnh sửa ───
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const startEdit = (from?: PolicyVersionRow) => {
    setDraftBody(from?.body ?? policy.body);
    setDraftVersion(from?.version ?? policy.version);
    setDraftDate(from?.effective_date ?? policy.effectiveDate);
    setEditError("");
    setSavedNote("");
    setEditing(true);
  };

  const versionChanged = draftVersion.trim() !== policy.version;

  const handleSaveEdit = async () => {
    const version = draftVersion.trim();
    const body = draftBody.trim();
    if (!version) return setEditError("Nhập số phiên bản.");
    if (!body) return setEditError("Nội dung chính sách đang trống.");
    if (body === policy.body.trim() && version === policy.version && draftDate.trim() === policy.effectiveDate) {
      return setEditError("Chưa có thay đổi nào so với bản hiện tại.");
    }
    setEditSaving(true);
    setEditError("");
    try {
      const { error: err } = await supabase.from("privacy_policy_versions").insert({
        version,
        effective_date: draftDate.trim(),
        body,
        edited_by: user.name || user.email,
      });
      if (err) throw err;
      setEditing(false);
      setSavedNote(
        version === policy.version
          ? "Đã lưu. Số phiên bản giữ nguyên nên không ai phải xác nhận lại."
          : `Đã lưu phiên bản ${version}. Mọi tài khoản sẽ thấy nhãn "Chưa xác nhận" và cần bấm "Tôi đã đọc" lại.`
      );
      policy.reload();
    } catch (err) {
      console.error("Error saving privacy policy:", err);
      setEditError("Không lưu được: " + errText(err));
    } finally {
      setEditSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200";

  // ─── Chế độ chỉnh sửa ───
  if (editing && user.isAdmin) {
    return (
      <div className="space-y-5">
        <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading font-bold text-slate-800 text-base flex items-center gap-2">
              <Pencil size={18} className="text-[#005BAC]" /> Chỉnh sửa Chính sách bảo mật
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={editSaving}
                className="px-4 py-2 text-xs font-bold rounded-xl text-slate-500 hover:bg-slate-100 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 transition-all shadow disabled:opacity-60 cursor-pointer"
              >
                {editSaving ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Số phiên bản</span>
              <input value={draftVersion} onChange={e => setDraftVersion(e.target.value)} className={inputCls} placeholder="1.1" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ngày hiệu lực</span>
              <input value={draftDate} onChange={e => setDraftDate(e.target.value)} className={inputCls} placeholder="01/11/2026" />
            </label>
          </div>

          <p className={`text-[11px] font-bold rounded-xl px-3 py-2 ${versionChanged ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"}`}>
            {versionChanged
              ? `Bạn đang đổi sang phiên bản ${draftVersion.trim() || "(trống)"}: mọi tài khoản phải bấm "Tôi đã đọc" lại.`
              : "Giữ nguyên số phiên bản: coi là sửa nhỏ (lỗi chính tả, câu chữ), không ai phải xác nhận lại. Đổi nội dung quan trọng thì tăng số phiên bản."}
          </p>

          <details className="text-[11px] text-slate-500 font-medium">
            <summary className="cursor-pointer font-bold text-slate-600">Cách gõ nội dung</summary>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li><code>## Tiêu đề</code> bắt đầu một mục mới. Phần gõ trước mục đầu tiên là lời mở đầu.</li>
              <li><code>- nội dung</code> là gạch đầu dòng. Dòng thường là một đoạn văn.</li>
              <li><code>| Cột 1 | Cột 2 |</code> là một hàng bảng, hàng đầu tiên là tiêu đề cột.</li>
              <li><code>**chữ đậm**</code> để in đậm.</li>
            </ul>
          </details>

          {editError && <p className="text-[11px] font-bold text-rose-600">{editError}</p>}
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5 items-start">
          <div className="glass bg-white rounded-2xl p-4 border border-slate-200/50 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nội dung</p>
            <textarea
              value={draftBody}
              onChange={e => setDraftBody(e.target.value)}
              spellCheck={false}
              className="w-full h-[70vh] p-3 text-xs leading-relaxed font-mono rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y"
            />
          </div>
          <div className="space-y-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Xem trước</p>
            <PolicyView body={draftBody} />
          </div>
        </div>
      </div>
    );
  }

  // ─── Chế độ đọc ───
  return (
    <div className="max-w-4xl space-y-5">
      <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-heading font-bold text-slate-800 text-lg flex items-center gap-2">
            <ShieldCheck size={22} className="text-[#005BAC]" /> Chính sách bảo mật thông tin
          </h2>
          {user.isAdmin && (
            <div className="flex gap-2">
              {policy.history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHistory(v => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
                >
                  <History size={14} /> Lịch sử ({policy.history.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => startEdit()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 transition-all shadow cursor-pointer"
              >
                <Pencil size={14} /> Chỉnh sửa
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 font-medium leading-relaxed">
          Áp dụng cho phần mềm quản trị nội bộ của {POLICY_COMPANY}. Phiên bản {policy.version}
          {policy.effectiveDate ? `, hiệu lực từ ${policy.effectiveDate}` : ""}.
        </p>
        {savedNote && <p className="text-[11px] font-bold text-emerald-600">{savedNote}</p>}
      </div>

      {user.isAdmin && showHistory && (
        <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm space-y-2">
          <h3 className="font-heading font-bold text-slate-800 text-sm">Lịch sử các lần lưu</h3>
          <ul className="divide-y divide-slate-100">
            {policy.history.map((h, i) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span className="text-slate-700 font-semibold">
                  Phiên bản {h.version}
                  {i === 0 && <span className="ml-2 text-[9px] font-extrabold uppercase bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Hiện hành</span>}
                  <span className="text-slate-400 font-medium"> · {fmtTime(h.created_at)} · {h.edited_by || "không rõ"}</span>
                </span>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => startEdit(h)}
                    className="text-[11px] font-bold text-[#005BAC] hover:underline cursor-pointer"
                  >
                    Mở lại để chỉnh
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PolicyView body={policy.body} />

      {/* ─── Xác nhận đã đọc ─── */}
      <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm">
        {policy.loading || ackedAt === null ? (
          <p className="text-xs text-slate-400 font-semibold">Đang kiểm tra trạng thái xác nhận...</p>
        ) : ackedAt ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-700">Bạn đã xác nhận đọc phiên bản {policy.version}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Lúc {fmtTime(ackedAt)}. Khi chính sách đổi phiên bản, bạn sẽ cần xác nhận lại.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Bấm nút bên cạnh để xác nhận bạn đã đọc và hiểu chính sách này. Hệ thống lưu tài khoản và thời điểm xác nhận.
            </p>
            <button
              type="button"
              onClick={handleAck}
              disabled={saving || !email}
              className="shrink-0 px-6 py-2.5 text-xs font-bold rounded-xl bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 transition-all shadow-md shadow-blue-500/10 disabled:opacity-60 cursor-pointer"
            >
              {saving ? "Đang lưu..." : "Tôi đã đọc và đã hiểu"}
            </button>
          </div>
        )}
        {error && <p className="text-[11px] font-bold text-rose-600 mt-3">{error}</p>}
      </div>
    </div>
  );
}

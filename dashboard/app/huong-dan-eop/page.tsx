"use client";

// ============================================================
// /huong-dan-eop — Hướng dẫn sử dụng EOP bằng video.
//
// Chỉ lưu LINK (YouTube / Google Drive), không upload tệp. Mỗi dòng bảng
// eop_guides là một phần (Phần 1, 2, 3...). Người xem chọn phần ở cột trái,
// video nhúng phát ở cột phải.
//
// XEM: mọi tài khoản đăng nhập. THÊM/SỬA/XOÁ: Admin hoặc cờ can_manage_news (RLS 132).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { supabase } from "@/lib/supabase";
import { parseEopVideo, isHttpUrl } from "@/lib/eopVideo";
import { uploadNewsFile, signNewsPaths, removeNewsFiles, NEWS_ALLOWED_MIMES } from "@/lib/news";
import {
  PlayCircle,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ExternalLink,
  X,
  AlertTriangle,
  Video,
  ImagePlus,
} from "lucide-react";

type Guide = {
  id: string;
  sort_order: number;
  title: string;
  description: string | null;
  video_url: string;
  thumb_path: string | null;
};

type FormState = { id: string | null; title: string; description: string; video_url: string; sort_order: string; thumb_path: string | null };

const EMPTY_FORM: FormState = { id: null, title: "", description: "", video_url: "", sort_order: "", thumb_path: null };

function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export default function EopGuidePage() {
  const user = useCurrentUser();
  const canManage = user.isAdmin || user.perms.canManageNews;

  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Ảnh thu nhỏ: link ký để hiện (theo path) + tệp mới chọn, chỉ tải lên khi bấm Lưu.
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [newThumb, setNewThumb] = useState<{ file: File; preview: string } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Guide | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("eop_guides")
      .select("id, sort_order, title, description, video_url, thumb_path")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (err) {
      setError(
        /relation .* does not exist|schema cache/i.test(err.message)
          ? "Chưa tạo bảng dữ liệu. Cần chạy migration 132_eop_guides.sql trong Supabase SQL Editor."
          : err.message
      );
      setLoading(false);
      return;
    }
    const rows = (data || []) as Guide[];
    setGuides(rows);
    setSelectedId((cur) => (cur && rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? null));
    setLoading(false);
    signNewsPaths(rows.map((r) => r.thumb_path))
      .then(setThumbUrls)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(() => guides.find((g) => g.id === selectedId) || null, [guides, selectedId]);
  const video = useMemo(() => (selected ? parseEopVideo(selected.video_url) : null), [selected]);
  // Điện thoại: khung nhúng (nhất là Google Drive) hay treo vòng xoay vô tận trong
  // trình duyệt di động / webview, nên không nhúng mà mở video ở tab mới.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const selectedIndex = selected ? guides.findIndex((g) => g.id === selected.id) : -1;

  const closeForm = () => {
    if (newThumb) URL.revokeObjectURL(newThumb.preview);
    setNewThumb(null);
    setForm(null);
  };

  const pickThumb = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || !NEWS_ALLOWED_MIMES.includes(file.type)) {
      return setFormError("Ảnh thu nhỏ phải là JPG, PNG, WEBP hoặc GIF.");
    }
    setFormError(null);
    if (newThumb) URL.revokeObjectURL(newThumb.preview);
    setNewThumb({ file, preview: URL.createObjectURL(file) });
  };

  const openCreate = () => {
    setFormError(null);
    setNewThumb(null);
    const next = guides.length ? Math.max(...guides.map((g) => g.sort_order)) + 1 : 1;
    setForm({ ...EMPTY_FORM, sort_order: String(next) });
  };

  const openEdit = (g: Guide) => {
    setFormError(null);
    setNewThumb(null);
    setForm({
      id: g.id,
      title: g.title,
      description: g.description || "",
      video_url: g.video_url,
      sort_order: String(g.sort_order),
      thumb_path: g.thumb_path,
    });
  };

  const save = async () => {
    if (!form || saving) return;
    const title = form.title.trim();
    const url = form.video_url.trim();
    if (!title) return setFormError("Nhập tên phần hướng dẫn.");
    if (!isHttpUrl(url)) return setFormError("Link video phải bắt đầu bằng http:// hoặc https://");
    const order = Number.parseInt(form.sort_order, 10);

    setSaving(true);
    setFormError(null);
    // Tải ảnh mới lên TRƯỚC khi ghi CSDL; ảnh cũ chỉ xoá SAU khi CSDL đã ghi xong.
    // Ảnh cũ lấy từ dữ liệu đã lưu (không lấy từ form, vì "Bỏ ảnh" đã xoá path trong form).
    const storedThumb = form.id ? guides.find((g) => g.id === form.id)?.thumb_path ?? null : null;
    let thumbPath = form.thumb_path;
    if (newThumb) {
      try {
        thumbPath = (await uploadNewsFile(newThumb.file, "eop")).path;
      } catch (e) {
        setSaving(false);
        return setFormError(errText(e));
      }
    }
    const payload = {
      thumb_path: thumbPath,
      title,
      description: form.description.trim() || null,
      video_url: url,
      sort_order: Number.isFinite(order) ? order : 0,
    };
    const res = form.id
      ? await supabase.from("eop_guides").update(payload).eq("id", form.id).select("id")
      : await supabase.from("eop_guides").insert({ ...payload, created_by: user.email || null }).select("id");
    setSaving(false);

    if (res.error || !res.data || res.data.length === 0) {
      // Ghi CSDL hỏng thì dọn ảnh vừa tải lên, tránh tệp mồ côi.
      if (newThumb && thumbPath) await removeNewsFiles([thumbPath]);
      // RLS chặn UPDATE thì trả 0 dòng mà không báo lỗi — phải kiểm tra riêng.
      return setFormError(res.error ? res.error.message : "Không lưu được: tài khoản chưa có quyền đăng tin.");
    }
    if (storedThumb && storedThumb !== thumbPath) await removeNewsFiles([storedThumb]);

    const newId = res.data[0].id as string;
    closeForm();
    await load();
    setSelectedId(newId);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const { data, error: err } = await supabase.from("eop_guides").delete().eq("id", deleteTarget.id).select("id");
    setDeleting(false);
    if (err || !data || data.length === 0) {
      setDeleteTarget(null);
      setError(err ? `Không xoá được: ${errText(err)}` : "Không xoá được: tài khoản chưa có quyền.");
      return;
    }
    await removeNewsFiles([deleteTarget.thumb_path]);
    setDeleteTarget(null);
    load();
  };

  const formVideoOk = form ? !!parseEopVideo(form.video_url) : false;

  return (
    <div className="flex min-h-screen bg-[#F7F9FC] relative">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Hướng dẫn EOP" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-slate-200/60 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#005BAC] to-[#00AEEF] flex items-center justify-center text-white">
                <PlayCircle size={18} />
              </div>
              <div>
                <p className="text-sm font-black text-slate-800">Video hướng dẫn sử dụng EOP</p>
                <p className="text-[11px] text-slate-400 font-semibold">Chọn phần ở danh sách bên trái để xem.</p>
              </div>
            </div>
            {canManage && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#005BAC] to-[#00AEEF] rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg transition-all active:scale-[0.99] cursor-pointer"
              >
                <Plus size={14} />
                Thêm phần
              </button>
            )}
          </div>

          {error && (
            <div className="px-4 py-3 bg-rose-50 border border-rose-100 rounded-2xl text-xs font-semibold text-rose-600">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-200/60 rounded-3xl gap-3 shadow-sm">
              <Loader2 className="animate-spin text-[#005BAC]" size={32} />
              <p className="text-xs text-slate-400 font-semibold">Đang tải...</p>
            </div>
          ) : guides.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-20 bg-white border border-slate-200/60 rounded-3xl text-center space-y-3 shadow-sm">
              <Video className="text-slate-300" size={48} />
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-700">Chưa có video hướng dẫn</p>
                <p className="text-xs text-slate-400">
                  {canManage
                    ? "Bấm \"Thêm phần\" rồi dán link YouTube hoặc Google Drive."
                    : "Video sẽ hiển thị ngay khi phòng Hành chính Nhân sự đăng link."}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
              {/* Danh sách phần */}
              <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm p-3 space-y-1.5">
                {guides.map((g, i) => {
                  const active = g.id === selectedId;
                  return (
                    <div
                      key={g.id}
                      className={`group flex items-center gap-2 rounded-xl border transition-all ${
                        active ? "bg-blue-50 border-blue-200" : "bg-white border-transparent hover:bg-slate-50"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedId(g.id)}
                        className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer"
                      >
                        {g.thumb_path && thumbUrls[g.thumb_path] ? (
                          <span className="relative shrink-0 w-20 aspect-video rounded-lg overflow-hidden bg-slate-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbUrls[g.thumb_path]} alt="" className="w-full h-full object-cover" />
                            <span className="absolute left-1 top-1 min-w-5 h-5 px-1 rounded-md bg-black/60 text-white text-[10px] font-black flex items-center justify-center">
                              {i + 1}
                            </span>
                          </span>
                        ) : (
                          <span
                            className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black ${
                              active ? "bg-[#005BAC] text-white" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {i + 1}
                          </span>
                        )}
                        <span className={`text-xs font-bold leading-snug ${active ? "text-[#005BAC]" : "text-slate-700"}`}>
                          {g.title}
                        </span>
                      </button>
                      {canManage && (
                        <div className="flex items-center pr-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEdit(g)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 cursor-pointer"
                            title="Sửa"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(g)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Xoá"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Khung phát */}
              {selected && (
                <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
                  {video && !isMobile ? (
                    <div className="aspect-video bg-black">
                      <iframe
                        key={selected.id}
                        src={video.embedUrl}
                        title={selected.title}
                        className="w-full h-full"
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  ) : (
                    <div className="relative aspect-video bg-slate-900 flex flex-col items-center justify-center gap-3 text-center p-6 overflow-hidden">
                      {selected.thumb_path && thumbUrls[selected.thumb_path] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbUrls[selected.thumb_path]}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover opacity-60"
                        />
                      )}
                      <div className="relative flex flex-col items-center gap-3">
                        {!video && (
                          <p className="text-xs text-white/80 font-semibold">
                            Link này không nhúng được vào trang. Mở video ở tab mới để xem.
                          </p>
                        )}
                        {isHttpUrl(selected.video_url) && (
                          <a
                            href={selected.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-3 text-xs font-bold text-white bg-[#005BAC] rounded-full shadow-lg active:scale-95"
                          >
                            <PlayCircle size={18} /> Xem video
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="p-5 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#005BAC]">
                      Phần {selectedIndex + 1}
                    </p>
                    <h2 className="text-base font-black text-slate-800">{selected.title}</h2>
                    {selected.description && (
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{selected.description}</p>
                    )}
                    {video && !isMobile && isHttpUrl(selected.video_url) && (
                      <a
                        href={selected.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-[#005BAC]"
                      >
                        <ExternalLink size={11} /> Không xem được? Mở ở tab mới
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Form thêm / sửa */}
      {form && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={() => !saving && closeForm()}
        >
          <div
            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#005BAC] to-[#00AEEF] text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-heading font-black text-sm">{form.id ? "Sửa phần hướng dẫn" : "Thêm phần hướng dẫn"}</h3>
              <button onClick={closeForm} disabled={saving} className="text-white/80 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-[1fr_90px] gap-3">
                <label className="space-y-1 block">
                  <span className="text-[11px] font-bold text-slate-500">Tên phần</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="VD: Tạo đề nghị thanh toán"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[11px] font-bold text-slate-500">Thứ tự</span>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-[11px] font-bold text-slate-500">Link video (YouTube hoặc Google Drive)</span>
                <input
                  value={form.video_url}
                  onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=... hoặc https://drive.google.com/file/d/.../view"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                />
                {form.video_url.trim() && (
                  <span className={`text-[11px] font-semibold ${formVideoOk ? "text-emerald-600" : "text-amber-600"}`}>
                    {formVideoOk
                      ? "Nhận diện được video, sẽ phát ngay trong trang."
                      : "Không nhận ra YouTube/Drive — người xem sẽ phải mở link ở tab mới."}
                  </span>
                )}
                <span className="block text-[11px] text-slate-400 font-semibold">
                  Video Google Drive cần chia sẻ &ldquo;Bất kỳ ai có đường liên kết&rdquo; (hoặc trong tổ chức) thì mọi người mới xem được.
                </span>
              </label>

              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500">Ảnh thu nhỏ (không bắt buộc)</span>
                <div className="flex items-center gap-3">
                  <div className="w-28 aspect-video rounded-xl border border-dashed border-slate-300 bg-slate-50 overflow-hidden flex items-center justify-center">
                    {newThumb || (form.thumb_path && thumbUrls[form.thumb_path]) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={newThumb ? newThumb.preview : thumbUrls[form.thumb_path!]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImagePlus size={20} className="text-slate-300" />
                    )}
                  </div>
                  <div className="flex flex-col items-start gap-1.5">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[#005BAC] bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 cursor-pointer">
                      <ImagePlus size={13} />
                      {newThumb || form.thumb_path ? "Đổi ảnh" : "Chọn ảnh"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          pickThumb(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {(newThumb || form.thumb_path) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (newThumb) URL.revokeObjectURL(newThumb.preview);
                          setNewThumb(null);
                          setForm({ ...form, thumb_path: null });
                        }}
                        className="text-[11px] font-bold text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        Bỏ ảnh
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <label className="space-y-1 block">
                <span className="text-[11px] font-bold text-slate-500">Mô tả ngắn (không bắt buộc)</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 resize-none"
                />
              </label>

              {formError && (
                <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-[11px] font-semibold text-rose-600">
                  {formError}
                </p>
              )}
            </div>

            <div className="px-6 pb-5 flex items-center justify-end gap-3">
              <button
                onClick={closeForm}
                disabled={saving}
                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-xs disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#005BAC] hover:bg-[#004a8c] disabled:opacity-60 text-white font-bold rounded-xl shadow-md text-xs"
              >
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Xác nhận xoá */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 text-white px-6 py-4 flex items-center gap-2">
              <Trash2 size={16} />
              <h3 className="font-heading font-black text-sm">Xoá phần hướng dẫn</h3>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-slate-600 font-semibold">
                Xoá <b className="text-slate-800">&ldquo;{deleteTarget.title}&rdquo;</b>?
              </p>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-700 flex gap-1.5">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                Chỉ xoá link trong hệ thống, video gốc trên YouTube/Drive không bị ảnh hưởng.
              </p>
            </div>
            <div className="px-6 pb-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-xs"
              >
                Huỷ
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold rounded-xl text-xs"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Xoá
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// news — lớp dữ liệu của module Tin tức (bảng news_posts / news_attachments /
// news_reactions + bucket riêng tư `news-media`, migration 023).
//
// Tách khỏi component vì trang danh sách, trang chi tiết, modal soạn bài và
// khối tin trên Dashboard đều cần đúng những hàm này.
// ============================================================

import { supabase } from "./supabase";
import { Megaphone, Building2, CalendarDays, type LucideIcon } from "lucide-react";

export const NEWS_BUCKET = "news-media";

/**
 * Hạn của link ký cho tệp trong bucket (giây) — 7 ngày.
 *
 * Bucket là RIÊNG TƯ nên link phải có hạn, nhưng hạn 1 giờ gây phiền thật:
 * mở bài đọc dở, để tab qua trưa quay lại thì ảnh hỏng; link vừa gửi cho đồng
 * nghiệp thì họ mở không được. 7 ngày đủ dài để không ai gặp cảnh đó, mà vẫn
 * giữ đúng ranh giới: người ngoài công ty không lấy được link vĩnh viễn như
 * bucket công khai của Văn thư.
 */
export const SIGNED_URL_TTL = 7 * 24 * 60 * 60;

/**
 * Lấy câu lỗi đọc được từ bất kỳ thứ gì bị throw.
 *
 * Supabase KHÔNG throw Error thật — nó trả về object dạng
 * `{ message, details, hint, code }`. Viết `String(err)` với object đó sẽ ra
 * đúng chuỗi vô nghĩa "[object Object]", che mất nguyên nhân thật (thiếu bảng,
 * bị RLS chặn, sai cột...). Hàm này bóc đủ 4 trường đó ra.
 */
export function errMessage(err: unknown): string {
  if (!err) return "Lỗi không xác định.";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [e.message, e.details, e.hint].filter(Boolean);
  const text = parts.join(" — ");
  if (text) return e.code ? `${text} (mã ${e.code})` : text;

  try {
    return JSON.stringify(err);
  } catch {
    return "Lỗi không xác định.";
  }
}

export type NewsCategory = "thong_bao" | "gioi_thieu" | "su_kien";
export type NewsStatus = "draft" | "published";

export type NewsExternalLink = { label: string; url: string };

export type NewsAttachment = {
  id: string;
  post_id: string;
  path: string;
  name: string;
  mime: string | null;
  size_bytes: number | null;
  kind: "image" | "file";
  sort_order: number;
};

export type NewsPost = {
  id: string;
  category: NewsCategory;
  title: string;
  summary: string | null;
  content_md: string | null;
  cover_path: string | null;
  status: NewsStatus;
  pinned: boolean;
  event_start_at: string | null;
  event_end_at: string | null;
  event_location: string | null;
  external_links: NewsExternalLink[];
  author_email: string | null;
  author_name: string | null;
  department: string | null;
  published_at: string | null;
  like_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
};

// ─── Siêu dữ liệu 3 danh mục ───
// Mỗi danh mục có cách trình bày riêng ở trang danh sách (xem app/tin-tuc).
export const NEWS_CATEGORIES: {
  key: NewsCategory;
  label: string;
  short: string;
  desc: string;
  icon: LucideIcon;
  /** Nền + chữ + viền cho huy hiệu danh mục */
  badge: string;
  /** Gradient dùng cho ô icon và banner bài ghim */
  gradient: string;
}[] = [
  {
    key: "thong_bao",
    label: "Thông báo",
    short: "Thông báo",
    desc: "Quyết định, thông báo phúc lợi, lịch nghỉ lễ — thường kèm file PDF",
    icon: Megaphone,
    badge: "bg-blue-50 text-blue-700 border-blue-100",
    gradient: "from-[#005BAC] to-[#00AEEF]",
  },
  {
    key: "gioi_thieu",
    label: "Giới thiệu",
    short: "Giới thiệu",
    desc: "Bài giới thiệu công ty, dự án, con người và văn hoá nội bộ",
    icon: Building2,
    badge: "bg-indigo-50 text-indigo-700 border-indigo-100",
    gradient: "from-indigo-600 to-violet-500",
  },
  {
    key: "su_kien",
    label: "Sự kiện",
    short: "Sự kiện",
    desc: "Hoạt động, lễ kỷ niệm, team building — có thời gian và địa điểm",
    icon: CalendarDays,
    badge: "bg-emerald-50 text-emerald-700 border-emerald-100",
    gradient: "from-emerald-600 to-teal-500",
  },
];

export function categoryMeta(key?: string | null) {
  return NEWS_CATEGORIES.find((c) => c.key === key) || NEWS_CATEGORIES[0];
}

// ─── Chuẩn hoá dòng thô từ Supabase ───
// `external_links` là jsonb: có thể về dạng mảng, chuỗi JSON, hoặc null.
export function normalizePost(row: Record<string, unknown>): NewsPost {
  const raw = row.external_links;
  let links: NewsExternalLink[] = [];
  if (Array.isArray(raw)) {
    links = raw as NewsExternalLink[];
  } else if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) links = parsed;
    } catch {
      links = [];
    }
  }

  return {
    ...(row as unknown as NewsPost),
    external_links: links.filter((l) => l && typeof l.url === "string" && l.url.trim()),
    like_count: Number(row.like_count) || 0,
    view_count: Number(row.view_count) || 0,
    pinned: !!row.pinned,
  };
}

// ─── Đọc danh sách bài ───
// Bản nháp chỉ về được với người có quyền đăng bài (chặn ở RLS, không ở đây).
export async function fetchPosts(options: {
  category?: NewsCategory | "all";
  includeDrafts?: boolean;
  limit?: number;
} = {}): Promise<NewsPost[]> {
  const { category = "all", includeDrafts = false, limit } = options;

  let query = supabase
    .from("news_posts")
    .select("*")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (category !== "all") query = query.eq("category", category);
  if (!includeDrafts) query = query.eq("status", "published");
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizePost);
}

export async function fetchPost(id: string): Promise<NewsPost | null> {
  const { data, error } = await supabase.from("news_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizePost(data) : null;
}

export async function fetchAttachments(postId: string): Promise<NewsAttachment[]> {
  const { data, error } = await supabase
    .from("news_attachments")
    .select("*")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as NewsAttachment[];
}

// ─── Link ký hạn giờ ───
// GOM NHIỀU ĐƯỜNG DẪN VÀO MỘT LỜI GỌI: danh sách 20 bài mà ký từng cái sẽ là 20
// vòng mạng. `createSignedUrls` (số nhiều) ký cả mẻ trong một request.
//
// CACHE THEO PHIÊN: mỗi lần ký, Supabase sinh token MỚI nên URL đổi liên tục —
// trình duyệt coi đó là ảnh khác và tải lại từ đầu mỗi lần vào trang, dù ảnh y
// hệt. Link sống 7 ngày, nên ta giữ lại URL đã ký và DÙNG LẠI trong suốt phiên:
// URL ổn định -> trình duyệt cache đúng ảnh -> lần xem sau (mở bài, quay lại,
// chuyển tab danh mục) hiện tức thì, đồng thời bớt luôn vòng mạng đi ký.
type SignedEntry = { url: string; exp: number };
const signedCache = new Map<string, SignedEntry>();
const SIGN_CACHE_KEY = "news_signed_urls_v1";
// Chỉ dùng lại link còn hạn ít nhất 1 giờ, tránh link vừa lấy đã sắp hết.
const SIGN_SAFETY_MS = 60 * 60 * 1000;
let signCacheLoaded = false;

function loadSignCache() {
  if (signCacheLoaded || typeof sessionStorage === "undefined") return;
  signCacheLoaded = true;
  try {
    const raw = sessionStorage.getItem(SIGN_CACHE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, SignedEntry>;
    const now = Date.now();
    Object.entries(obj).forEach(([k, v]) => {
      if (v && v.exp > now) signedCache.set(k, v);
    });
  } catch {
    // sessionStorage hỏng/bị chặn -> chạy như không có cache
  }
}

function persistSignCache() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const obj: Record<string, SignedEntry> = {};
    signedCache.forEach((v, k) => (obj[k] = v));
    sessionStorage.setItem(SIGN_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // vượt hạn mức lưu trữ -> bỏ qua, không ảnh hưởng hiển thị
  }
}

export async function signNewsPaths(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p && p.trim().length > 0)));
  if (unique.length === 0) return {};

  loadSignCache();
  const now = Date.now();
  const map: Record<string, string> = {};
  const misses: string[] = [];
  for (const p of unique) {
    const hit = signedCache.get(p);
    if (hit && hit.exp - now > SIGN_SAFETY_MS) map[p] = hit.url;
    else misses.push(p);
  }
  if (misses.length === 0) return map; // tất cả đã có sẵn -> khỏi gọi mạng

  try {
    const { data, error } = await supabase.storage.from(NEWS_BUCKET).createSignedUrls(misses, SIGNED_URL_TTL);
    if (error || !data) return map; // vẫn trả phần đã cache được

    const exp = now + SIGNED_URL_TTL * 1000;
    data.forEach((item) => {
      if (item.signedUrl && item.path) {
        map[item.path] = item.signedUrl;
        signedCache.set(item.path, { url: item.signedUrl, exp });
      }
    });
    persistSignCache();
    return map;
  } catch {
    return map;
  }
}

/** Link tải một tệp (dùng khi bấm nút tải, không cần ký sẵn cả mẻ). */
export async function signOne(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(NEWS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

// ─── Tải tệp lên ───
export const NEWS_MAX_FILE_BYTES = 10 * 1024 * 1024; // khớp giới hạn bucket (migration 023)
export const NEWS_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

/** Tên tệp an toàn cho Storage: bỏ dấu, thay ký tự lạ bằng gạch ngang. */
function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const slug = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đ]/g, "d")
    .replace(/[Đ]/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40) || "tep";
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return ext ? `${slug}-${stamp}.${ext}` : `${slug}-${stamp}`;
}

export type UploadedFile = {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "file";
};

/**
 * Nén ảnh ngay trong trình duyệt trước khi tải lên.
 *
 * Ảnh bìa/ảnh trong bài thường là PNG 1-2MB cho ô chỉ rộng vài trăm px, mà kho
 * riêng tư không có CDN nên mỗi lần xem là tải trọn ảnh gốc -> lần xem đầu chậm.
 * Thu về tối đa 1600px cạnh dài + mã hoá webp giảm được 70-90% dung lượng, mắt
 * thường không phân biệt ở khổ hiển thị này.
 *
 * Giữ NGUYÊN: PDF (không phải ảnh) và GIF (có thể là ảnh động — vẽ lên canvas sẽ
 * mất chuyển động). Trình duyệt cũ / ảnh lỗi -> trả về tệp gốc, không chặn upload.
 */
const NEWS_IMAGE_MAX_DIM = 1600;

async function compressNewsImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, NEWS_IMAGE_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.82),
    );
    // Không nhỏ hơn gốc (ảnh vốn đã nhẹ/đã nén) -> giữ nguyên, khỏi đổi định dạng.
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "anh";
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}

export async function uploadNewsFile(file: File, folder = "posts"): Promise<UploadedFile> {
  // Chặn định dạng lạ trên TỆP GỐC trước khi đụng tới canvas.
  if (!NEWS_ALLOWED_MIMES.includes(file.type)) {
    throw new Error(`"${file.name}" không thuộc định dạng cho phép (JPG, PNG, WEBP, GIF, PDF).`);
  }

  // Nén ảnh trước, rồi mới kiểm tra hạn dung lượng trên bản ĐÃ nén.
  const prepared = await compressNewsImage(file);
  if (prepared.size > NEWS_MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" vượt quá 10MB — vui lòng nén lại hoặc chọn tệp khác.`);
  }

  const path = `${folder}/${safeFileName(prepared.name)}`;
  const { error } = await supabase.storage.from(NEWS_BUCKET).upload(path, prepared, {
    cacheControl: "3600",
    upsert: false,
    contentType: prepared.type,
  });
  if (error) {
    // "Bucket not found" = chưa chạy phần 8 của migration 023. Nói rõ việc cần
    // làm, vì câu gốc của Supabase không cho biết phải đi đâu để sửa.
    const hint = /bucket not found/i.test(error.message)
      ? ` — chưa có kho tệp "${NEWS_BUCKET}". Chạy phần 8 của migrations/023_news_module.sql, hoặc tạo bucket này trong Supabase > Storage (đặt Private).`
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }

  return {
    path,
    name: file.name, // giữ tên gốc cho phần hiển thị (đính kèm)
    mime: prepared.type,
    size: prepared.size,
    kind: prepared.type.startsWith("image/") ? "image" : "file",
  };
}

/** Xoá tệp khỏi bucket (khi gỡ đính kèm hoặc xoá bài). Lỗi không chặn luồng chính. */
export async function removeNewsFiles(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length === 0) return;
  try {
    await supabase.storage.from(NEWS_BUCKET).remove(list);
  } catch {
    // tệp mồ côi trong bucket không ảnh hưởng người dùng
  }
}

// ─── Thả tim ───
export async function fetchMyReactions(email: string, postIds: string[]): Promise<Set<string>> {
  if (!email || postIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("news_reactions")
    .select("post_id")
    .ilike("user_email", email)
    .in("post_id", postIds);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.post_id as string));
}

/**
 * Bật/tắt tim. Trả về trạng thái MỚI (true = vừa thả tim).
 * like_count do trigger trong CSDL cập nhật — giao diện tự cộng/trừ để phản hồi
 * tức thì, và số thật sẽ khớp lại ở lần tải kế tiếp.
 */
export async function toggleReaction(postId: string, email: string, liked: boolean): Promise<boolean> {
  if (liked) {
    const { error } = await supabase
      .from("news_reactions")
      .delete()
      .eq("post_id", postId)
      .ilike("user_email", email);
    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from("news_reactions")
    .insert({ post_id: postId, user_email: email.toLowerCase() });
  // 23505 = đã có dòng (bấm hai lần rất nhanh) -> coi như đã thả tim
  if (error && error.code !== "23505") throw error;
  return true;
}

/** Cộng lượt xem qua RPC security definer (client không có quyền UPDATE bài). */
export async function incrementView(postId: string): Promise<void> {
  try {
    await supabase.rpc("news_increment_view", { p_id: postId });
  } catch {
    // lượt xem sai lệch không đáng để chặn việc đọc bài
  }
}

// ─── Tiện ích hiển thị ───
export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPostDate(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatEventRange(start?: string | null, end?: string | null): string {
  if (!start) return "";
  const fmt = (v: string) =>
    new Date(v).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false, // ép 24h — không để rơi về "10:25 CH" nếu locale máy khác
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return end ? `${fmt(start)} → ${fmt(end)}` : fmt(start);
}

/** "Còn 3 ngày" / "Đang diễn ra" / "Đã kết thúc" cho card sự kiện. */
export function eventCountdown(start?: string | null, end?: string | null): { text: string; tone: "soon" | "live" | "past" } | null {
  if (!start) return null;
  const now = Date.now();
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : startMs + 24 * 3600 * 1000;

  if (now > endMs) return { text: "Đã kết thúc", tone: "past" };
  if (now >= startMs) return { text: "Đang diễn ra", tone: "live" };

  const days = Math.ceil((startMs - now) / (24 * 3600 * 1000));
  return { text: days <= 1 ? "Diễn ra ngày mai" : `Còn ${days} ngày`, tone: "soon" };
}

/** Bài đăng trong 3 ngày gần nhất -> gắn nhãn "MỚI". */
export function isFresh(post: NewsPost): boolean {
  const ref = post.published_at || post.created_at;
  if (!ref) return false;
  return Date.now() - new Date(ref).getTime() < 3 * 24 * 3600 * 1000;
}

/** Tên miền hiển thị trên thẻ link ngoài (vd "vnexpress.net"). */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Đổi link video người dùng dán (YouTube / Google Drive) thành link NHÚNG được.
// Trả null nếu không nhận ra — trang sẽ hiện nút "Mở video" thay vì khung phát.

export type EopVideo = { provider: "youtube" | "drive"; embedUrl: string };

export function parseEopVideo(raw: string): EopVideo | null {
  const input = (raw || "").trim();
  if (!input) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");

  // ── YouTube ──
  if (host === "youtu.be") {
    const id = u.pathname.split("/")[1];
    return id ? yt(id, u) : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") {
      const id = u.searchParams.get("v");
      return id ? yt(id, u) : null;
    }
    if (["embed", "shorts", "live", "v"].includes(parts[0]) && parts[1]) return yt(parts[1], u);
    return null;
  }

  // ── Google Drive ──
  if (host === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/);
    const id = m?.[1] || u.searchParams.get("id");
    return id ? { provider: "drive", embedUrl: `https://drive.google.com/file/d/${id}/preview` } : null;
  }
  return null;
}

function yt(id: string, u: URL): EopVideo | null {
  if (!/^[\w-]{6,20}$/.test(id)) return null;
  // Giữ mốc thời gian nếu link có ?t=90 / &t=1m30s
  const t = u.searchParams.get("t") || u.searchParams.get("start");
  const secs = t ? parseTime(t) : 0;
  const q = secs > 0 ? `?start=${secs}&rel=0` : "?rel=0";
  return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}${q}` };
}

function parseTime(t: string): number {
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

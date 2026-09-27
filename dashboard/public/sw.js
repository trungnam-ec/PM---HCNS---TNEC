// Service worker tối giản, AN TOÀN cho app dữ liệu động (Supabase).
// Nguyên tắc:
//   • CHỈ cache asset tĩnh có mã băm (/_next/static, icon, font) — loại này
//     không bao giờ đổi nội dung theo cùng URL nên cache vĩnh viễn vô hại.
//   • KHÔNG bao giờ cache HTML trang, API, hay lời gọi Supabase → luôn lấy bản
//     mới nhất, không có chuyện hiện dữ liệu cũ.
//   • Mất mạng: điều hướng sẽ trả trang offline gọn, còn lại để trình duyệt báo lỗi.
// Tăng số phiên bản khi đổi logic để dọn cache cũ.
const VERSION = "v1";
const STATIC_CACHE = `tnec-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Chỉ nhận tài nguyên tĩnh cùng origin để cache-first.
function isCacheableStatic(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icon-") ||
      url.pathname === "/apple-icon.png" ||
      url.pathname === "/logo-tnec.png" ||
      /\.(?:woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname))
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Asset tĩnh có hash: cache-first, lấy từ cache cho nhanh, chưa có thì tải & lưu.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
            return res;
          })
      )
    );
    return;
  }

  // Điều hướng trang (mở/refresh): luôn network-first, mất mạng mới rơi về offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    );
    return;
  }

  // Còn lại (API, Supabase, dữ liệu động): để trình duyệt xử lý như thường, KHÔNG cache.
});

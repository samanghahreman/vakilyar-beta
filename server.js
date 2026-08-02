/**
 * سرور صفحه توزیع — برای لیارا و هر جای دیگری که Node اجرا می‌کند.
 *
 * بدون هیچ وابستگی: نه Express، نه چیز دیگر. کل کار سه مسیر است و
 * `node:http` از پسش برمی‌آید. یک وابستگی کمتر یعنی یک نقطه شکست کمتر.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";

import { versionInfo, resolveDownload } from "./lib/handlers.js";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

/** صفحه فرود یک بار خوانده و در حافظه نگه داشته می‌شود */
let landingPage = null;
async function landing() {
  if (!landingPage) {
    landingPage = await readFile(join(here, "public", "index.html"));
  }
  return landingPage;
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  try {
    if (path === "/" || path === "/index.html") {
      const html = await landing();
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": html.length,
        ...SECURITY_HEADERS,
      });
      return res.end(html);
    }

    if (path === "/api/version") {
      const info = await versionInfo();
      // پنج دقیقه کش: صفحه فرود ممکن است بارها باز شود و سقف نرخ گیت‌هاب
      // برای توکن شخصی محدود است
      return sendJson(res, 200, info, {
        "Cache-Control": "public, max-age=300",
        ...SECURITY_HEADERS,
      });
    }

    if (path === "/api/download") {
      const result = await resolveDownload((url.searchParams.get("code") || "").trim());

      if (!result.ok) {
        return sendJson(res, result.status, { error: result.error }, SECURITY_HEADERS);
      }

      res.writeHead(200, {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Length": String(result.size),
        // نسخه آزمایشی مدام عوض می‌شود؛ کش نباید نسخه کهنه را نگه دارد
        "Cache-Control": "no-store",
        ...SECURITY_HEADERS,
      });

      // استریم مستقیم، بدون بافر کردن کل فایل در حافظه
      return Readable.fromWeb(result.body.body).pipe(res);
    }

    if (path === "/healthz") {
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: "یافت نشد." }, SECURITY_HEADERS);
  } catch (err) {
    console.error("خطای پیش‌بینی‌نشده:", err);
    if (!res.headersSent) {
      return sendJson(res, 500, { error: "خطای داخلی سرور." }, SECURITY_HEADERS);
    }
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`صفحه توزیع وکیل‌یار روی پورت ${PORT} بالا آمد`);
});

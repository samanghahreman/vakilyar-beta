/**
 * منطق مشترک صفحه توزیع — مستقل از پلتفرم.
 *
 * عمداً نه به Vercel وابسته است نه به لیارا: هر دو فقط یک پوسته نازک دورش
 * می‌پیچند. اگر روزی میزبان عوض شد، همین فایل دست‌نخورده می‌ماند.
 *
 * فایل APK در مخزن نگهداری نمی‌شود؛ همان لحظه از Release گیت‌هاب خوانده و
 * پاس داده می‌شود. یعنی انتشار نسخه تازه بدون دیپلوی مجدد به دست تسترها
 * می‌رسد، و APK هیچ آدرس مستقیمِ قابل اشتراک‌گذاری ندارد.
 */

const GITHUB_API = "https://api.github.com";

/** مقایسه زمان‌ثابت تا طول تطبیق، کد معتبر را لو ندهد */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isValidCode(code) {
  const codes = (process.env.INVITE_CODES || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (codes.length === 0) return false;
  return codes.some((c) => safeEqual(c, code));
}

async function latestRelease() {
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error("config");

  const res = await fetch(`${GITHUB_API}/repos/${repo}/releases/latest`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "vakilyar-web",
    },
  });
  if (!res.ok) throw new Error(`github:${res.status}`);
  return res.json();
}

/** اطلاعات نسخه — کد دعوت لازم ندارد چون آدرس دانلود را فاش نمی‌کند */
export async function versionInfo() {
  if (!process.env.GITHUB_REPO || !process.env.GITHUB_TOKEN) {
    return { configured: false };
  }
  try {
    const rel = await latestRelease();
    const apk = (rel.assets || []).find((a) => a.name.endsWith(".apk"));
    return {
      configured: true,
      available: Boolean(apk),
      version: rel.tag_name || null,
      name: rel.name || null,
      publishedAt: rel.published_at || null,
      sizeMb: apk ? Math.round((apk.size / 1048576) * 100) / 100 : null,
      fileName: apk ? apk.name : null,
    };
  } catch {
    return { configured: true, available: false };
  }
}

/**
 * تلاش برای دانلود.
 *
 * خروجی یا `{ ok: false, status, error }` است یا
 * `{ ok: true, fileName, size, body }` که `body` یک ReadableStream است.
 */
export async function resolveDownload(code) {
  if (!code) {
    return { ok: false, status: 400, error: "کد دعوت وارد نشده است." };
  }
  if (!isValidCode(code)) {
    // مکث عمدی تا حدس زدن کد با اسکریپت کند شود
    await new Promise((r) => setTimeout(r, 1200));
    return { ok: false, status: 403, error: "کد دعوت معتبر نیست." };
  }

  let release;
  try {
    release = await latestRelease();
  } catch (e) {
    if (String(e.message) === "config") {
      return { ok: false, status: 500, error: "سرویس هنوز پیکربندی نشده است." };
    }
    return { ok: false, status: 502, error: "دسترسی به مخزن ممکن نشد." };
  }

  const asset = (release.assets || []).find((a) => a.name.endsWith(".apk"));
  if (!asset) {
    return { ok: false, status: 404, error: "فایل نصبی در آخرین انتشار پیدا نشد." };
  }

  // Accept: octet-stream لازم است وگرنه گیت‌هاب توضیحات JSON برمی‌گرداند نه خود فایل
  const file = await fetch(asset.url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/octet-stream",
      "User-Agent": "vakilyar-web",
    },
  });
  if (!file.ok) {
    return { ok: false, status: 502, error: "دریافت فایل ناموفق بود." };
  }

  return { ok: true, fileName: asset.name, size: asset.size, body: file };
}

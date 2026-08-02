/** پوسته Vercel — منطق واقعی در lib/handlers.js است */
import { resolveDownload } from "../lib/handlers.js";

export default async function handler(req, res) {
  const result = await resolveDownload(String(req.query.code || "").trim());

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
  res.setHeader("Content-Length", String(result.size));
  res.setHeader("Cache-Control", "no-store");

  const buf = Buffer.from(await result.body.arrayBuffer());
  return res.status(200).send(buf);
}

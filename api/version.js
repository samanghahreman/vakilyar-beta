/** پوسته Vercel — منطق واقعی در lib/handlers.js است */
import { versionInfo } from "../lib/handlers.js";

export default async function handler(req, res) {
  const info = await versionInfo();
  if (info.configured) {
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  }
  return res.status(200).json(info);
}

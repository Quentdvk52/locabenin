// Enregistre les fichiers dataURL (signatures) et uploads dans public/uploads
import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

export async function saveDataUrl(dataUrl: string, urlPath: string): Promise<void> {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.slice(meta.indexOf(":") + 1, meta.indexOf(";"));
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
    throw new Error("Format d'image non autorisé.");
  }
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const rel = urlPath.replace("/uploads/", "").replace(/\.(png|jpe?g|webp)$/i, "") + "." + ext;
  const abs = path.join(UPLOAD_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(b64, "base64"), { encoding: "base64" });
}

export function safeUploadName(original: string): string {
  const base = path.basename(original).normalize("NFKD").replace(/[^\w.\-]+/g, "-").toLowerCase();
  return base.slice(-80);
}

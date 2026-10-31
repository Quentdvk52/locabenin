import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError, fail } from "@/lib/api";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { saveDataUrl, safeUploadName } from "@/lib/uploads";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;   // 6 Mo (après compression client WebP)
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;  // 40 Mo

/**
 * Upload direct (images compressées côté client en WebP, vidéos limitées).
 * Sécurité : taille max, type MIME vérifié via magic bytes, nom nettoyé,
 * chemin construit sans intervention du client.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`upload:${user.id}`, RATE_LIMITS.upload.limit, RATE_LIMITS.upload.windowMs)) {
      throw new ApiError(429, "Trop d'uploads. Patientez un peu.");
    }
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "IMAGE");
    if (!(file instanceof File)) return fail(400, "Fichier manquant.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const limit = kind === "VIDEO" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (bytes.length > limit) return fail(413, kind === "VIDEO" ? "Vidéo trop lourde (max 40 Mo)." : "Image trop lourde (max 6 Mo).");

    // Vérification magic bytes (pas confiance au Content-Type déclaré)
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isWebp = bytes.slice(8, 12).toString("ascii") === "WEBP";
    const isMp4 = bytes.slice(4, 8).toString("ascii") === "ftyp";
    if (kind === "VIDEO" ? !isMp4 : !(isPng || isJpeg || isWebp)) {
      return fail(415, "Type de fichier non autorisé.");
    }

    const now = new Date();
    const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ext = isMp4 ? "mp4" : isPng ? "png" : isWebp ? "webp" : "jpg";
    const name = `${crypto.randomUUID()}-${safeUploadName(file.name).replace(/\.[^.]*$/, "")}.${ext}`;
    const rel = `${folder}/${name}`;
    const abs = path.join(UPLOAD_ROOT, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    return NextResponse.json({ ok: true, data: { url: `/uploads/${rel}`, sizeBytes: bytes.length } });
  });
}

/** Sauvegarde d'une image générée côté client (signature, miniature vidéo). */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const { dataUrl, folder } = (await req.json()) as { dataUrl: string; folder?: string };
    const urlPath = `/uploads/${folder ?? "misc"}/${crypto.randomUUID()}.png`;
    await saveDataUrl(dataUrl, urlPath);
    return NextResponse.json({ ok: true, data: { url: urlPath } });
  });
}
